import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server/app.ts';
import { openDb } from '../src/server/db.ts';
import { seed } from '../src/server/seed.ts';

let server: Server;
let base = '';
let gruId = 0; // tabela aeroportuária GRU importada da planilha

before(async () => {
  const db = openDb(':memory:');
  seed(db, { adminPassword: 'admin-teste-123', demo: true, demoPassword: 'fast-teste-123' });
  gruId = Number((db.prepare("SELECT id FROM storage_tables WHERE name LIKE 'GRU Airport (%'").get() as { id: number }).id);
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ value: [{ cotacaoVenda: 5.4321, cotacaoCompra: 5.43, dataHoraCotacao: '2026-11-10 13:00:00.000', tipoBoletim: 'Fechamento' }] }))) as typeof fetch;
  server = createApp(db, { fetchImpl: fakeFetch }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** Cliente HTTP com cookie de sessão. */
function agent() {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
  };
  return { call, login: (u: string, p: string) => call('POST', '/api/auth/login', { username: u, password: p }) };
}

const studyBody = (over: Record<string, unknown> = {}) => ({
  client_id: 1,
  title: 'Teste',
  finalidade: 'REVENDA',
  currency: 'USD',
  rates: { USD: 5.4 },
  seguro_tipo: 'SIMPLES',
  items: [{ product_id: 1, value: 10000, quantity: 50, ex_tarifario: false }],
  freight_profile_id: 1,
  cargo: { peso_kg: 320, volume_m3: 1.2, containers: null },
  carga_especial: false,
  storage_table_id: gruId,
  storage_periods: 1,
  frete_nacional_brl: 850,
  icms_overrides: {},
  siscomex_brl: null,
  ...over,
});

test('login: credenciais erradas, sessão e logout', async () => {
  const a = agent();
  assert.equal((await a.call('GET', '/api/auth/me')).status, 401);
  assert.equal((await a.login('admin', 'errada')).status, 401);
  assert.equal((await a.login('admin', 'admin-teste-123')).status, 200);
  const me = await a.call('GET', '/api/auth/me');
  assert.equal(me.body.user.role, 'admin');
  assert.equal(me.body.settings.siscomex_di_brl, 115.67);
  assert.equal(me.body.settings.afrmm_taxa_fixa_brl, 20);
  await a.call('POST', '/api/auth/logout');
  assert.equal((await a.call('GET', '/api/auth/me')).status, 401);
});

test('limite de tentativas de login', async () => {
  const a = agent();
  for (let i = 0; i < 8; i++) await a.login('ninguem', 'x');
  assert.equal((await a.login('ninguem', 'x')).status, 429);
});

test('estudo: referência sequencial com sigla do cliente', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const s1 = await c.call('POST', '/api/studies', studyBody());
  assert.equal(s1.status, 201, JSON.stringify(s1.body));
  assert.equal(s1.body.reference, 'FAS01');
  const s2 = await c.call('POST', '/api/studies', studyBody({ client_id: 999 })); // client_id forjado é ignorado
  assert.equal(s2.body.reference, 'FAS02');
  const got = await c.call('GET', `/api/studies/${s1.body.id}`);
  assert.equal(got.body.result.dados_gerais.origem, 'China');
  assert.equal(got.body.form.title, 'Teste');
  assert.ok(got.body.result.custo_liquido > 0);
  assert.ok(got.body.result.memoria.length > 10);
  const list = await c.call('GET', '/api/studies');
  assert.deepEqual(list.body.map((s: { reference: string }) => s.reference), ['FAS02', 'FAS01']);
});

test('estudo: erros de cálculo voltam como 422 com mensagem clara', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const r = await c.call('POST', '/api/studies', studyBody({ rates: {} }));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /taxa de câmbio/);
  const r2 = await c.call('POST', '/api/studies', studyBody({ carga_especial: true }));
  assert.equal(r2.status, 422);
  assert.match(r2.body.error, /cotação por fora/);
});

test('isolamento entre clientes e rotas de admin', async () => {
  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  const cl = await adm.call('POST', '/api/clients', { company_name: 'Ômega Têxtil S/A', tax_regime: 'SIMPLES', state: 'SC' });
  assert.equal(cl.status, 201, JSON.stringify(cl.body));
  assert.equal(cl.body.sigla, 'OME');
  const u = await adm.call('POST', '/api/users', { username: 'omega', password: 'omega-senha-1', role: 'cliente', client_id: cl.body.id });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  assert.equal(u.body.password_hash, undefined);

  const o = agent();
  assert.equal((await o.login('omega', 'omega-senha-1')).status, 200);
  assert.equal((await o.call('GET', '/api/studies/1')).status, 404);
  assert.deepEqual((await o.call('GET', '/api/products')).body, []);
  assert.equal((await o.call('GET', '/api/clients')).status, 403);
  assert.equal((await o.call('GET', '/api/users')).status, 403);
  assert.equal((await o.call('PUT', '/api/settings', {})).status, 403);
  assert.equal((await o.call('PUT', '/api/products/1', { description: 'hack' })).status, 404);
  // Produto criado pelo cliente: vinculado ao próprio cliente e "a conferir"
  const p = await o.call('POST', '/api/products', { client_id: 1, description: 'Tecido', ncm: '54075200', ii: 26, ipi: 0, pis: 2.1, cofins: 9.65, confirmed: true });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal(p.body.client_id, cl.body.id);
  assert.equal(p.body.confirmed, false);
  assert.equal(p.body.ncm, '5407.52.00');
  // Estudo com produto de outro cliente é recusado
  const s = await o.call('POST', '/api/studies', studyBody());
  assert.equal(s.status, 422);
});

test('validação de entrada (zod)', async () => {
  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  const bad = await adm.call('POST', '/api/products', { client_id: 1, description: 'X', ncm: '12', ii: 0, ipi: 0, pis: 0, cofins: 0 });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /NCM/);
  const weak = await adm.call('POST', '/api/users', { username: 'fraco', password: '123', role: 'admin' });
  assert.equal(weak.status, 400);
});

test('parâmetros gerais mudam o cálculo (desembolso sem CIF)', async () => {
  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  const s = (await adm.call('GET', '/api/settings')).body;
  const put = await adm.call('PUT', '/api/settings', { ...s, desembolso_inclui_cif: false });
  assert.equal(put.status, 200);
  const st = await adm.call('POST', '/api/studies', studyBody());
  const got = (await adm.call('GET', `/api/studies/${st.body.id}`)).body.result;
  assert.equal(got.desembolso.inclui_cif, false);
  assert.ok(Math.abs(got.desembolso.total - (got.custo_total - got.cif.total_brl)) < 0.01);
  await adm.call('PUT', '/api/settings', s);
});

test('admin ajusta ICMS e Siscomex; fica registrado', async () => {
  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  const st = await adm.call('POST', '/api/studies', studyBody({ icms_overrides: { '1': { divisor: 0.95 } }, siscomex_brl: 200 }));
  const r = (await adm.call('GET', `/api/studies/${st.body.id}`)).body.result;
  assert.equal(r.icms_condicoes[0].divisor, 0.95);
  assert.deepEqual(r.icms_condicoes[0].ajustes_manuais, ['divisor']);
  assert.equal(r.impostos.siscomex, 200);
  // cliente tentando o mesmo: ignorado
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const sc = await c.call('POST', '/api/studies', studyBody({ icms_overrides: { '1': { divisor: 0.5 } }, siscomex_brl: 1 }));
  const rc = (await c.call('GET', `/api/studies/${sc.body.id}`)).body.result;
  assert.equal(rc.icms_condicoes[0].divisor, 0.96);
  assert.equal(rc.impostos.siscomex, 154.23);
});

test('exportação Excel', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const r = await c.call('GET', '/api/studies/1/xlsx');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition') || '', /estudo-FAS01\.xlsx/);
  const bytes = new Uint8Array(r.body as ArrayBuffer);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK'); // arquivo zip (xlsx)
});

test('PTAX com cache', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const r = await c.call('GET', '/api/ptax/USD');
  assert.equal(r.status, 200);
  assert.equal(r.body.venda, 5.4321);
});

test('não exclui cliente com estudos nem o último admin', async () => {
  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  assert.equal((await adm.call('DELETE', '/api/clients/1')).status, 409);
  assert.equal((await adm.call('DELETE', '/api/users/1')).status, 400);
});

test('estudo com ICMS por produto: EX sugere Lista CAMEX, outro item segue revenda', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const st = await c.call('POST', '/api/studies', studyBody({
    items: [
      { product_id: 1, value: 6000, quantity: 1, ex_tarifario: true }, // motor com II-EX: automática → CAMEX
      { product_id: 2, value: 4000, quantity: 100, ex_tarifario: false }, // rolamento: automática → revenda TTD
    ],
  }));
  assert.equal(st.status, 201, JSON.stringify(st.body));
  const r = (await c.call('GET', '/api/studies/' + st.body.id)).body.result;
  const [ex, rev] = r.itens;
  assert.equal(ex.icms.code, 'CAMEX_EX');
  assert.equal(ex.icms.divisor, 0.88);
  assert.equal(rev.icms.code, 'NORMAL_REVENDA');
  assert.equal(rev.icms.divisor, 0.96);
  assert.ok(Math.abs(ex.despesas_rateadas / (ex.despesas_rateadas + rev.despesas_rateadas) - 0.6) < 1e-9);
  assert.equal(r.icms_condicoes.length, 2);
  // condição escolhida manualmente num item tem prioridade sobre a sugestão
  const st2 = await c.call('POST', '/api/studies', studyBody({
    items: [{ product_id: 2, value: 1000, quantity: 1, ex_tarifario: false, icms_condition_id: 2 }],
  }));
  const r2 = (await c.call('GET', '/api/studies/' + st2.body.id)).body.result;
  assert.equal(r2.itens[0].icms.code, 'NORMAL_INDUSTRIALIZACAO');
});

test('cliente não vê a negociação de honorários e despacho (me, estudo, memória, Excel)', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const me = (await c.call('GET', '/api/auth/me')).body;
  assert.equal(me.client.honorarios_pct, 0);
  assert.equal(me.client.honorarios_min, 0);
  assert.equal(me.client.despacho_brl, 0);
  const st = await c.call('POST', '/api/studies', studyBody({ honorarios_manual_brl: 99999 }));
  assert.equal(st.status, 201, JSON.stringify(st.body));
  const got = (await c.call('GET', '/api/studies/' + st.body.id)).body;
  assert.equal(got.input.honorarios.pct, 0);
  assert.equal(got.input.despacho_brl, 0);
  assert.equal(got.form.honorarios_manual_brl, undefined);
  const hon = got.result.memoria.find((m: { descricao: string }) => m.descricao === 'Honorários FORVM');
  assert.equal(hon.formula, 'conforme negociação'); // o valor aparece, a fórmula não
  assert.ok(hon.valor > 0 && hon.valor !== 99999); // o cliente não consegue impor honorários manuais
  assert.ok(!JSON.stringify(got).includes('mínimo R$')); // nenhuma pista da negociação
  // o admin enxerga tudo
  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  const full = (await adm.call('GET', '/api/studies/' + st.body.id)).body;
  assert.ok(full.input.honorarios.pct > 0 && full.input.despacho_brl > 0);
  assert.match(full.result.memoria.find((m: { descricao: string }) => m.descricao === 'Honorários FORVM').formula, /mínimo/);
});

test('prévia no servidor = valor salvo; admin informa honorários manuais (alerta só interno)', async () => {
  const c = agent();
  await c.login('fast', 'fast-teste-123');
  const prev = await c.call('POST', '/api/studies/preview', studyBody());
  assert.equal(prev.status, 200, JSON.stringify(prev.body));
  const saved = await c.call('POST', '/api/studies', studyBody());
  const got = (await c.call('GET', '/api/studies/' + saved.body.id)).body.result;
  assert.equal(prev.body.custo_liquido, got.custo_liquido);
  assert.equal(prev.body.despesas.honorarios, got.despesas.honorarios);

  const adm = agent();
  await adm.login('admin', 'admin-teste-123');
  const m = await adm.call('POST', '/api/studies', studyBody({ honorarios_manual_brl: 6720.03 }));
  const r = (await adm.call('GET', '/api/studies/' + m.body.id)).body.result;
  assert.equal(r.despesas.honorarios, 6720.03);
  assert.ok(r.alertas.some((a: { privado?: boolean }) => a.privado));
  // o cliente abrindo esse estudo vê o valor, mas não o alerta interno
  const asClient = (await c.call('GET', '/api/studies/' + m.body.id)).body.result;
  assert.equal(asClient.despesas.honorarios, 6720.03);
  assert.ok(!asClient.alertas.some((a: { privado?: boolean }) => a.privado));
});
