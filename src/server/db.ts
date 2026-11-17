import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain.ts';

export type Row = Record<string, unknown>;

export function openDb(path = process.env.DB_PATH || 'data/sisforvm.db'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

// Cada migração roda uma única vez (controle por PRAGMA user_version).
const MIGRATIONS: string[] = [
  `
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    tax_regime TEXT NOT NULL CHECK (tax_regime IN ('LUCRO_REAL','LUCRO_PRESUMIDO','SIMPLES')),
    city TEXT, state TEXT, cnpj TEXT,
    sigla TEXT NOT NULL,
    study_seq INTEGER NOT NULL DEFAULT 0,
    despacho_brl REAL NOT NULL DEFAULT 0,
    honorarios_fixo REAL NOT NULL DEFAULT 0,
    honorarios_pct REAL NOT NULL DEFAULT 0,
    honorarios_min REAL NOT NULL DEFAULT 0,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','cliente')),
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    CHECK ((role = 'admin' AND client_id IS NULL) OR (role = 'cliente' AND client_id IS NOT NULL))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE freight_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    modal TEXT NOT NULL CHECK (modal IN ('AEREO','LCL','FCL20','FCL40')),
    origin_country TEXT NOT NULL,
    origin_detail TEXT,
    incoterm TEXT NOT NULL CHECK (incoterm IN ('EXW','FOB','FCA')),
    currency TEXT NOT NULL,
    rate REAL NOT NULL,
    min_charge REAL NOT NULL DEFAULT 0,
    origin_fees REAL NOT NULL DEFAULT 0,
    dest_fees_brl REAL NOT NULL DEFAULT 0,
    transit_days TEXT,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX freight_client ON freight_profiles(client_id);
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    code TEXT,
    description TEXT NOT NULL,
    ncm TEXT NOT NULL,
    ii REAL NOT NULL, ii_ex REAL, ipi REAL NOT NULL, pis REAL NOT NULL, cofins REAL NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_by_role TEXT,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX product_client ON products(client_id);
  CREATE TABLE storage_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    modal TEXT NOT NULL CHECK (modal IN ('AEREO','LCL','FCL')),
    location TEXT,
    pct_cif REAL NOT NULL, min_value REAL NOT NULL,
    period_days INTEGER NOT NULL DEFAULT 7,
    fixed_fees REAL NOT NULL DEFAULT 0,
    validado INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE icms_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    regime_scope TEXT NOT NULL CHECK (regime_scope IN ('NORMAL','SIMPLES','TODOS')),
    finalidade TEXT NOT NULL CHECK (finalidade IN ('REVENDA','INDUSTRIALIZACAO','ATIVO','TODAS')),
    ex_tarifario INTEGER NOT NULL DEFAULT 0,
    aliquota_efetiva REAL, divisor REAL, aliquota_credito REAL,
    incluir_ipi INTEGER NOT NULL DEFAULT 0,
    calc_dif_ipi INTEGER NOT NULL DEFAULT 1,
    user_editable INTEGER NOT NULL DEFAULT 0,
    auto_divisor INTEGER NOT NULL DEFAULT 0,
    validado INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE studies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    reference TEXT NOT NULL UNIQUE,
    seq INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    title TEXT,
    form TEXT NOT NULL,
    input TEXT NOT NULL,
    result TEXT NOT NULL,
    modal TEXT, origem TEXT, finalidade TEXT, moeda TEXT, fob REAL,
    desembolso REAL NOT NULL,
    custo_liquido REAL NOT NULL
  );
  CREATE INDEX study_client ON studies(client_id, id DESC);
  `,
  // v2: porto/aeroporto de destino no perfil de frete (cabeçalho da planilha FORVM)
  `ALTER TABLE freight_profiles ADD COLUMN dest_detail TEXT;`,
  // v3: armazenagem em linhas (planilha dos terminais) + acréscimo; THC no frete
  `
  ALTER TABLE storage_tables ADD COLUMN linhas TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE storage_tables ADD COLUMN acrescimo_pct REAL NOT NULL DEFAULT 0;
  UPDATE storage_tables SET linhas = json_array(
    json_object('id','periodo1','descricao','1º período (' || period_days || ' dias)','tipo','pct_cif','pct',pct_cif,'minimo',min_value,'aplica','primeiro'),
    json_object('id','taxas','descricao','Taxas fixas','tipo','fixo','valor',fixed_fees)
  );
  ALTER TABLE storage_tables DROP COLUMN pct_cif;
  ALTER TABLE storage_tables DROP COLUMN min_value;
  ALTER TABLE storage_tables DROP COLUMN period_days;
  ALTER TABLE storage_tables DROP COLUMN fixed_fees;
  ALTER TABLE freight_profiles ADD COLUMN thc REAL NOT NULL DEFAULT 0;
  `,
  // v4: link do site/simulador oficial do terminal
  `ALTER TABLE storage_tables ADD COLUMN site_url TEXT;`,
];

function migrate(db: DatabaseSync) {
  const current = Number((db.prepare('PRAGMA user_version').get() as Row).user_version);
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- senhas ----------
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

export function siglaFrom(name: string): string {
  const letters = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters + 'XXX').slice(0, 3);
}

// ---------- conversão de linhas ----------
const BOOL_COLS = new Set(['active', 'confirmed', 'validado', 'ex_tarifario', 'incluir_ipi', 'calc_dif_ipi', 'user_editable', 'auto_divisor']);
const JSON_COLS = new Set(['linhas']);
export function mapRow<T>(row: unknown): T {
  const r = { ...(row as Row) };
  for (const k of Object.keys(r)) {
    if (BOOL_COLS.has(k)) r[k] = r[k] === 1 || r[k] === true;
    else if (JSON_COLS.has(k) && typeof r[k] === 'string') r[k] = JSON.parse(r[k] as string);
  }
  return r as T;
}
export const toSql = (v: unknown): SQLInputValue =>
  typeof v === 'boolean' ? (v ? 1 : 0) : v !== null && typeof v === 'object' ? JSON.stringify(v) : ((v as SQLInputValue) ?? null);

// ---------- parâmetros gerais ----------
export function getSettings(db: DatabaseSync): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) if (key in DEFAULT_SETTINGS) s[key] = JSON.parse(value);
  return s as unknown as Settings;
}
export function saveSettings(db: DatabaseSync, s: Settings) {
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(db, () => {
    for (const [k, v] of Object.entries(s)) st.run(k, JSON.stringify(v));
  });
}
