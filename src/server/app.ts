import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z, ZodError, type ZodTypeAny } from 'zod';
import { buildCalcInput } from '../shared/build.ts';
import { CalcError, computeStudy, type CalcInput, type CalcResult } from '../shared/calc.ts';
import type { Client, FreightProfile, IcmsCondition, Product, StorageTable, StudyDetail, StudyForm, User } from '../shared/domain.ts';
import {
  clientSchema, freightSchema, icmsSchema, loginSchema, passwordSchema, productSchema, settingsSchema, storageSchema, studyFormSchema, userCreateSchema, userUpdateSchema,
} from '../shared/schemas.ts';
import { getSettings, hashPassword, mapRow, saveSettings, siglaFrom, toSql, tx, verifyPassword, type Row } from './db.ts';
import { redactClient, redactForm, redactInput, redactResult } from './redact.ts';
import { studyWorkbook } from './xlsx.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type SessionUser = Pick<User, 'id' | 'username' | 'name' | 'role' | 'client_id'>;
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const COOKIE = 'sisforvm_sid';
const SESSION_MS = 12 * 3600_000;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface AppOptions {
  staticDir?: string;
  secureCookies?: boolean;
  fetchImpl?: typeof fetch;
}

export function createApp(db: DatabaseSync, opts: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  // Cabeçalhos de segurança
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // Mutação só com JSON (bloqueia POST cross-site de formulário).
  app.use('/api', (req, _res, next) => {
    const hasBody = Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && hasBody && !req.is('application/json')) return next(new HttpError(415, 'Envie JSON.'));
    next();
  });

  // ---------- sessão ----------
  const parseCookies = (h = ''): Record<string, string> =>
    Object.fromEntries(
      h.split(';').map((c) => c.trim()).filter(Boolean).map((c) => {
        const i = c.indexOf('=');
        return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
      }),
    );

  app.use((req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = db
        .prepare(`SELECT u.id, u.username, u.name, u.role, u.client_id, u.active, s.expires_at, c.active AS client_active
          FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN clients c ON c.id = u.client_id WHERE s.token_hash = ?`)
        .get(sha256(token)) as Row | undefined;
      if (row && Number(row.expires_at) > Date.now() && row.active === 1 && (row.role === 'admin' || row.client_active === 1)) {
        req.user = { id: Number(row.id), username: String(row.username), name: (row.name as string) ?? null, role: row.role as User['role'], client_id: (row.client_id as number) ?? null };
      }
    }
    next();
  });

  const user = (req: Request): SessionUser => {
    if (!req.user) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
    return req.user;
  };
  const admin = (req: Request): SessionUser => {
    const u = user(req);
    if (u.role !== 'admin') throw new HttpError(403, 'Acesso restrito à equipe FORVM.');
    return u;
  };
  const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> => schema.parse(data);
  const idParam = (req: Request) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido.');
    return id;
  };

  // Limite de tentativas de login (por usuário + IP).
  const attempts = new Map<string, { n: number; until: number }>();
  const LOGIN_MAX = 8;

  const api = express.Router();

  api.post('/auth/login', (req, res) => {
    const { username, password } = parse(loginSchema, req.body);
    const key = `${username.toLowerCase()}|${req.ip}`;
    const a = attempts.get(key);
    if (a && a.n >= LOGIN_MAX && a.until > Date.now()) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
    const row = db.prepare('SELECT u.*, c.active AS client_active FROM users u LEFT JOIN clients c ON c.id = u.client_id WHERE u.username = ?').get(username) as Row | undefined;
    const ok = row && verifyPassword(password, String(row.password_hash));
    if (!ok || !row) {
      attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
      throw new HttpError(401, 'Usuário ou senha inválidos.');
    }
    if (row.active !== 1) throw new HttpError(403, 'Usuário inativo. Contate a FORVM.');
    if (row.role === 'cliente' && row.client_active !== 1) throw new HttpError(403, 'Cadastro da empresa inativo. Contate a FORVM.');
    attempts.delete(key);
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), Number(row.id), Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!opts.secureCookies, path: '/', maxAge: SESSION_MS });
    res.json({ ok: true });
  });

  api.post('/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => {
    const u = user(req);
    const row = u.client_id ? mapRow<Client>(db.prepare('SELECT * FROM clients WHERE id = ?').get(u.client_id)) : null;
    // O cliente não vê a negociação (honorários e despacho).
    res.json({ user: u, client: row && u.role !== 'admin' ? redactClient(row) : row, settings: getSettings(db) });
  });

  api.post('/auth/password', (req, res) => {
    const u = user(req);
    const { current, next } = parse(passwordSchema, req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id) as Row;
    if (!verifyPassword(current, String(row.password_hash))) throw new HttpError(400, 'Senha atual incorreta.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), u.id);
    // Encerra as outras sessões do usuário.
    const token = parseCookies(req.headers.cookie)[COOKIE];
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(u.id, sha256(token ?? ''));
    res.json({ ok: true });
  });

  // ---------- parâmetros gerais ----------
  api.get('/settings', (req, res) => {
    user(req);
    res.json(getSettings(db));
  });
  api.put('/settings', (req, res) => {
    admin(req);
    saveSettings(db, parse(settingsSchema, req.body));
    res.json(getSettings(db));
  });

  // ---------- CRUD genérico ----------
  interface ResourceDef {
    table: string;
    schema: z.AnyZodObject;
    order: string;
    clientScoped?: boolean;
    clientCanWrite?: boolean;
    hidden?: string[];
    before?: (data: Row, ctx: { isNew: boolean; u: SessionUser; current?: Row; body: Row }) => void;
    beforeDelete?: (id: number) => void;
  }

  const insert = (table: string, data: Row) => {
    const keys = Object.keys(data);
    const r = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => toSql(data[k])));
    return Number(r.lastInsertRowid);
  };
  const update = (table: string, id: number, data: Row) => {
    const keys = Object.keys(data);
    if (keys.length) db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => toSql(data[k])), id);
  };
  const strip = (def: ResourceDef, row: Row) => {
    for (const h of def.hidden ?? []) delete row[h];
    return row;
  };

  function resource(path: string, def: ResourceDef) {
    const canWrite = (u: SessionUser) => u.role === 'admin' || !!def.clientCanWrite;
    const load = (id: number, u: SessionUser): Row => {
      const row = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id) as Row | undefined;
      if (!row || (u.role !== 'admin' && def.clientScoped && row.client_id !== u.client_id)) throw new HttpError(404, 'Registro não encontrado.');
      return row;
    };

    api.get(`/${path}`, (req, res) => {
      const u = user(req);
      const where: string[] = [];
      const args: SQLArg[] = [];
      if (def.clientScoped) {
        if (u.role !== 'admin') {
          where.push('client_id = ?');
          args.push(u.client_id!);
        } else if (req.query.client_id) {
          where.push('client_id = ?');
          args.push(Number(req.query.client_id));
        }
      }
      if (u.role !== 'admin') where.push('active = 1');
      const rows = db.prepare(`SELECT * FROM ${def.table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${def.order}`).all(...args) as Row[];
      res.json(rows.map((r) => mapRow(strip(def, r))));
    });

    api.get(`/${path}/:id`, (req, res) => {
      const u = user(req);
      const row = load(idParam(req), u);
      if (u.role !== 'admin' && 'active' in row && row.active !== 1) throw new HttpError(404, 'Registro não encontrado.');
      res.json(mapRow(strip(def, row)));
    });

    api.post(`/${path}`, (req, res) => {
      const u = user(req);
      if (!canWrite(u)) throw new HttpError(403, 'Sem permissão.');
      const body = { ...(req.body as Row) };
      if (u.role !== 'admin' && def.clientScoped) body.client_id = u.client_id;
      const data = parse(def.schema, body) as Row;
      def.before?.(data, { isNew: true, u, body });
      const id = insert(def.table, data);
      res.status(201).json(mapRow(strip(def, load(id, u))));
    });

    api.put(`/${path}/:id`, (req, res) => {
      const u = user(req);
      if (!canWrite(u)) throw new HttpError(403, 'Sem permissão.');
      const id = idParam(req);
      const current = load(id, u);
      const body = { ...(req.body as Row) };
      if (def.clientScoped) body.client_id = current.client_id; // nunca muda de dono
      const data = parse(def.schema.partial(), body) as Row;
      for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
      def.before?.(data, { isNew: false, u, current, body });
      update(def.table, id, data);
      res.json(mapRow(strip(def, load(id, u))));
    });

    api.delete(`/${path}/:id`, (req, res) => {
      const u = user(req);
      if (!canWrite(u)) throw new HttpError(403, 'Sem permissão.');
      const id = idParam(req);
      load(id, u);
      def.beforeDelete?.(id);
      db.prepare(`DELETE FROM ${def.table} WHERE id = ?`).run(id);
      res.json({ ok: true });
    });
  }

  type SQLArg = string | number;

  // Guardas registradas antes das rotas do recurso.
  // Clientes só leem o próprio cadastro (via /auth/me); a listagem é da FORVM.
  api.use('/clients', (req, _res, next) => {
    admin(req);
    next();
  });
  // Usuários: só FORVM; a atualização aceita senha opcional.
  api.use('/users', (req, _res, next) => {
    admin(req);
    if (req.method === 'PUT') req.body = parse(userUpdateSchema, req.body);
    next();
  });

  resource('clients', {
    table: 'clients',
    schema: clientSchema,
    order: 'company_name COLLATE NOCASE',
    before(data, { isNew, u, current }) {
      if (u.role !== 'admin') throw new HttpError(403, 'Sem permissão.');
      if (isNew || data.sigla !== undefined) {
        const name = String(data.company_name ?? current?.company_name ?? '');
        data.sigla = (data.sigla as string) || siglaFrom(name);
      }
    },
    beforeDelete(id) {
      if (Number((db.prepare('SELECT COUNT(*) c FROM studies WHERE client_id = ?').get(id) as Row).c))
        throw new HttpError(409, 'Este cliente tem estudos registrados. Desative-o em vez de excluir.');
    },
  });
  resource('freight_profiles', { table: 'freight_profiles', schema: freightSchema, order: 'origin_country, modal, incoterm', clientScoped: true });

  resource('products', {
    table: 'products',
    schema: productSchema,
    order: 'description COLLATE NOCASE',
    clientScoped: true,
    clientCanWrite: true,
    before(data, { isNew, u }) {
      if (u.role !== 'admin') {
        data.confirmed = false; // alterações do cliente voltam para conferência
        delete data.active;
      }
      if (isNew) data.created_by_role = u.role;
      ensureClientExists(Number(data.client_id ?? 0), isNew);
    },
  });

  resource('storage_tables', { table: 'storage_tables', schema: storageSchema, order: 'modal, name' });

  resource('icms_conditions', {
    table: 'icms_conditions',
    schema: icmsSchema,
    order: 'sort, id',
    before(data) {
      if (data.auto_divisor && typeof data.aliquota_efetiva === 'number') data.divisor = Math.round((1 - data.aliquota_efetiva / 100) * 1e6) / 1e6;
    },
  });

  resource('users', {
    table: 'users',
    schema: userCreateSchema,
    order: 'role, username COLLATE NOCASE',
    hidden: ['password_hash'],
    before(data, { isNew, u, current }) {
      if (u.role !== 'admin') throw new HttpError(403, 'Sem permissão.');
      if (isNew && !data.password) throw new HttpError(400, 'Informe a senha.');
      if (data.password) data.password_hash = hashPassword(String(data.password));
      delete data.password;
      const role = (data.role ?? current?.role) as string;
      if (role === 'admin') data.client_id = null;
      else if (isNew && !data.client_id) throw new HttpError(400, 'Usuário de cliente precisa estar vinculado a um cliente.');
      if (!isNew && current && current.id === u.id && (data.active === false || data.role === 'cliente')) throw new HttpError(400, 'Você não pode desativar ou rebaixar o próprio usuário.');
    },
    beforeDelete(id) {
      const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as Row;
      if (row.role === 'admin' && Number((db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1").get() as Row).c) <= 1)
        throw new HttpError(400, 'É preciso manter ao menos um administrador ativo.');
    },
  });
  function ensureClientExists(id: number, isNew: boolean) {
    if (isNew && !db.prepare('SELECT 1 FROM clients WHERE id = ?').get(id)) throw new HttpError(400, 'Cliente inexistente.');
  }

  // ---------- estudos ----------
  function contextFor(u: SessionUser, clientId: number) {
    if (u.role !== 'admin' && u.client_id !== clientId) throw new HttpError(403, 'Sem permissão para este cliente.');
    const clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!clientRow) throw new HttpError(400, 'Cliente inexistente.');
    const client = mapRow<Client>(clientRow);
    if (!client.active) throw new HttpError(400, 'Cliente inativo.');
    return {
      role: u.role,
      client,
      products: (db.prepare('SELECT * FROM products WHERE client_id = ? AND active = 1').all(clientId) as Row[]).map((r) => mapRow<Product>(r)),
      freights: (db.prepare('SELECT * FROM freight_profiles WHERE client_id = ? AND active = 1').all(clientId) as Row[]).map((r) => mapRow<FreightProfile>(r)),
      storages: (db.prepare('SELECT * FROM storage_tables WHERE active = 1').all() as Row[]).map((r) => mapRow<StorageTable>(r)),
      conditions: (db.prepare('SELECT * FROM icms_conditions WHERE active = 1').all() as Row[]).map((r) => mapRow<IcmsCondition>(r)),
      settings: getSettings(db),
    };
  }

  /** Resultado ao vivo do simulador. Calculado aqui para que o cliente nunca receba a negociação. */
  api.post('/studies/preview', (req, res) => {
    const u = user(req);
    const body = { ...(req.body as Row) };
    if (u.role !== 'admin') {
      body.client_id = u.client_id;
      delete body.honorarios_manual_brl;
    }
    const form = parse(studyFormSchema, body) as StudyForm;
    const result = computeStudy(buildCalcInput(form, contextFor(u, form.client_id)));
    res.json(u.role === 'admin' ? result : redactResult(result));
  });

  api.post('/studies', (req, res) => {
    const u = user(req);
    const body = { ...(req.body as Row) };
    if (u.role !== 'admin') {
      body.client_id = u.client_id;
      delete body.honorarios_manual_brl;
    }
    const form = parse(studyFormSchema, body) as StudyForm;
    const ctx = contextFor(u, form.client_id);
    const input = buildCalcInput(form, ctx);
    const result = computeStudy(input);
    const saved = tx(db, () => {
      db.prepare('UPDATE clients SET study_seq = study_seq + 1 WHERE id = ?').run(form.client_id);
      const { study_seq, sigla } = db.prepare('SELECT study_seq, sigla FROM clients WHERE id = ?').get(form.client_id) as { study_seq: number; sigla: string };
      const reference = `${sigla}${String(study_seq).padStart(2, '0')}`;
      const r = db
        .prepare(`INSERT INTO studies (client_id, reference, seq, created_by, title, form, input, result, modal, origem, finalidade, moeda, fob, desembolso, custo_liquido)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          form.client_id, reference, study_seq, u.id, form.title || null, JSON.stringify(form), JSON.stringify(input), JSON.stringify(result),
          result.dados_gerais.modal, result.dados_gerais.origem, result.dados_gerais.finalidade, result.dados_gerais.moeda, result.cif.mercadoria_moeda,
          result.desembolso.total, result.custo_liquido,
        );
      return { id: Number(r.lastInsertRowid), reference };
    });
    res.status(201).json(saved);
  });

  api.get('/studies', (req, res) => {
    const u = user(req);
    const where: string[] = [];
    const args: SQLArg[] = [];
    if (u.role !== 'admin') {
      where.push('s.client_id = ?');
      args.push(u.client_id!);
    } else if (req.query.client_id) {
      where.push('s.client_id = ?');
      args.push(Number(req.query.client_id));
    }
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
    const rows = db
      .prepare(`SELECT s.id, s.reference, s.client_id, c.company_name, s.created_at, us.username AS created_by_name, s.title, s.modal, s.origem, s.finalidade, s.moeda, s.fob, s.desembolso, s.custo_liquido
        FROM studies s JOIN clients c ON c.id = s.client_id LEFT JOIN users us ON us.id = s.created_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.id DESC LIMIT ${limit}`)
      .all(...args);
    res.json(rows);
  });

  const loadStudy = (req: Request): StudyDetail & { input: CalcInput; result: CalcResult } => {
    const u = user(req);
    const s = db
      .prepare(`SELECT s.id, s.reference, s.client_id, s.created_at, s.title, s.form, s.input, s.result,
          c.company_name, c.cnpj, c.city, c.state, us.username AS created_by_name
        FROM studies s JOIN clients c ON c.id = s.client_id LEFT JOIN users us ON us.id = s.created_by WHERE s.id = ?`)
      .get(idParam(req)) as Row | undefined;
    if (!s || (u.role !== 'admin' && s.client_id !== u.client_id)) throw new HttpError(404, 'Estudo não encontrado.');
    const full = {
      id: Number(s.id),
      reference: String(s.reference),
      client_id: Number(s.client_id),
      company_name: String(s.company_name),
      cnpj: (s.cnpj as string) ?? null,
      city: (s.city as string) ?? null,
      state: (s.state as string) ?? null,
      created_at: String(s.created_at),
      created_by_name: (s.created_by_name as string) ?? null,
      title: (s.title as string) ?? null,
      form: JSON.parse(String(s.form)) as StudyForm,
      input: JSON.parse(String(s.input)) as CalcInput,
      result: JSON.parse(String(s.result)) as CalcResult,
    };
    if (u.role === 'admin') return full;
    return { ...full, form: redactForm(full.form), input: redactInput(full.input), result: redactResult(full.result) };
  };

  api.get('/studies/:id', (req, res) => {
    res.json(loadStudy(req));
  });

  api.get('/studies/:id/xlsx', async (req, res) => {
    const s = loadStudy(req);
    const wb = studyWorkbook({ reference: s.reference, company: s.company_name, cnpj: s.cnpj ?? '', createdAt: s.created_at, title: s.title ?? '', result: s.result });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="estudo-${s.reference}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  api.delete('/studies/:id', (req, res) => {
    admin(req);
    db.prepare('DELETE FROM studies WHERE id = ?').run(idParam(req));
    res.json({ ok: true });
  });

  // ---------- painel ----------
  api.get('/dashboard', (req, res) => {
    admin(req);
    const c = (sql: string) => Number((db.prepare(sql).get() as Row).c);
    res.json({
      clients: c('SELECT COUNT(*) c FROM clients WHERE active = 1'),
      studies: c('SELECT COUNT(*) c FROM studies'),
      studies_30d: c("SELECT COUNT(*) c FROM studies WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')"),
      pending_products: c('SELECT COUNT(*) c FROM products WHERE confirmed = 0 AND active = 1'),
      unvalidated_storage: c('SELECT COUNT(*) c FROM storage_tables WHERE validado = 0 AND active = 1'),
      unvalidated_icms: c('SELECT COUNT(*) c FROM icms_conditions WHERE validado = 0 AND active = 1'),
      pending_list: db
        .prepare(`SELECT p.id, p.description, p.ncm, p.client_id, c.company_name FROM products p JOIN clients c ON c.id = p.client_id
          WHERE p.confirmed = 0 AND p.active = 1 ORDER BY p.id DESC LIMIT 20`)
        .all(),
    });
  });

  // ---------- câmbio PTAX (Banco Central) com cache de 10 min ----------
  const ptaxCache = new Map<string, { at: number; data: unknown }>();
  const doFetch = opts.fetchImpl ?? fetch;
  api.get('/ptax/:moeda', async (req, res) => {
    user(req);
    const moeda = String(req.params.moeda).toUpperCase();
    if (!/^[A-Z]{3}$/.test(moeda)) throw new HttpError(400, 'Moeda inválida.');
    const hit = ptaxCache.get(moeda);
    if (hit && Date.now() - hit.at < 10 * 60_000) return void res.json(hit.data);
    const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
    const end = new Date();
    const start = new Date(end.getTime() - 10 * 86_400_000);
    const url =
      'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
      `?@moeda='${moeda}'&@dataInicial='${fmt(start)}'&@dataFinalCotacao='${fmt(end)}'&$format=json&$orderby=dataHoraCotacao%20desc&$top=1`;
    try {
      const r = await doFetch(url, { signal: AbortSignal.timeout(8000) });
      const j = (await r.json()) as { value?: { cotacaoVenda: number; cotacaoCompra: number; dataHoraCotacao: string; tipoBoletim: string }[] };
      const v = j.value?.[0];
      if (!v) throw new Error('sem cotação');
      const data = { moeda, venda: v.cotacaoVenda, compra: v.cotacaoCompra, data: v.dataHoraCotacao, boletim: v.tipoBoletim, fonte: 'PTAX · Banco Central do Brasil' };
      ptaxCache.set(moeda, { at: Date.now(), data });
      res.json(data);
    } catch {
      throw new HttpError(502, `Não foi possível obter a PTAX de ${moeda} agora. Informe a taxa manualmente.`);
    }
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));
  app.use('/api', api);

  // ---------- front-end compilado ----------
  const staticDir = opts.staticDir ? resolve(opts.staticDir) : null;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  // ---------- erros ----------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err instanceof CalcError) return void res.status(422).json({ error: err.message });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path.join('.');
      return void res.status(400).json({ error: first ? `${first.message}${field && !first.message.includes(' ') ? ` (${field})` : ''}` : 'Dados inválidos.', issues: err.issues });
    }
    if (err instanceof SyntaxError && 'body' in (err as object)) return void res.status(400).json({ error: 'JSON inválido.' });
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) return void res.status(409).json({ error: 'Já existe um registro com esse valor.' });
    if (msg.includes('FOREIGN KEY')) return void res.status(409).json({ error: 'Registro em uso por outros dados.' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
