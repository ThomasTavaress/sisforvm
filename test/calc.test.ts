import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStudy, CalcError, type CalcIcms, type CalcInput } from '../src/shared/calc.ts';
import { resolveIcms } from '../src/shared/build.ts';
import { DEFAULT_SETTINGS, type IcmsCondition } from '../src/shared/domain.ts';
import { parseNumber } from '../src/shared/format.ts';

const close = (a: number, b: number, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const REVENDA: CalcIcms = { code: 'NORMAL_REVENDA', label: 'Normal Revenda', aliquota_efetiva: 1.4, divisor: 0.96, aliquota_credito: 4, incluir_ipi: false, calc_dif_ipi: true, validado: true, ajustes_manuais: [] };
const CAMEX: CalcIcms = { code: 'CAMEX_EX', label: 'Lista CAMEX', aliquota_efetiva: 2.5, divisor: 0.88, aliquota_credito: 12, incluir_ipi: false, calc_dif_ipi: true, validado: true, ajustes_manuais: [] };

const base = (): CalcInput => ({
  regime: 'LUCRO_REAL',
  currency: 'USD',
  rates: { USD: 5 },
  items: [{ product_id: 1, code: null, description: 'Motor', ncm: '8501.52.10', value: 10000, quantity: 10, ii: 14, ii_ex: null, ipi: 5.2, pis: 2.1, cofins: 9.65, ex_tarifario: false, aliquotas_confirmadas: true, finalidade: 'REVENDA', icms: { ...REVENDA } }],
  freight: { label: 'China Aéreo FOB', modal: 'AEREO', origin_country: 'China', origin_detail: null, dest_detail: null, incoterm: 'FOB', currency: 'USD', rate: 6.5, min_charge: 150, origin_fees: 0, dest_fees_brl: 1800, transit_days: null },
  cargo: { peso_kg: 100, volume_m3: 0.2, containers: null },
  seguro_tipo: 'SIMPLES',
  siscomex_brl: 154.23,
  siscomex_adicoes: 1,
  siscomex_alterado: false,
  despacho_brl: 1200,
  honorarios: { fixo: 0, pct: 0, min: 0 },
  frete_nacional_brl: 500,
  storage: null,
  settings: { ...DEFAULT_SETTINGS },
});

test('caso aéreo revenda conferido manualmente', () => {
  const r = computeStudy(base());
  close(r.frete.total_brl, 3250); // 100 kg × 6,5 × 5
  close(r.cif.seguro_brl, 79.875); // 0,15% de 53.250
  close(r.cif.total_brl, 53329.875);
  close(r.impostos.ii, 7466.1825);
  close(r.impostos.ipi, (53329.875 + 7466.1825) * 0.052);
  close(r.impostos.pis, 1119.927375);
  close(r.impostos.cofins, 5146.332938);
  close(r.despesas.afrmm, 0);
  const baseIni = 53329.875 + 7466.1825 + 1119.927375 + 5146.332938 + 1200 + 154.23 + 1800;
  close(r.icms.base_inicial, baseIni);
  close(r.icms.base_final, baseIni / 0.96);
  close(r.icms.icms_pago, (baseIni / 0.96) * 0.014);
  const ipiSaida = (baseIni / 0.96) * 0.052;
  close(r.conta_ordem.dif_ipi, ipiSaida - r.impostos.ipi);
  const total = 53329.875 + r.impostos.total + r.despesas.total + r.icms.icms_pago + r.conta_ordem.dif_ipi + 500;
  close(r.custo_total, total);
  close(r.desembolso.total, total); // padrão: desembolso inclui CIF
  const cred = (baseIni / 0.96) * 0.04 + ipiSaida + 1119.927375 + 5146.332938;
  close(r.creditos.total, cred);
  close(r.custo_liquido, total - cred);
  close(r.itens[0].custo_unitario!, (total - cred) / 10);
});

test('parâmetro: desembolso sem CIF (motor-calculo-saida.md)', () => {
  const i = base();
  i.settings.desembolso_inclui_cif = false;
  const r = computeStudy(i);
  close(r.desembolso.total, r.custo_total - r.cif.total_brl);
  close(r.custo_liquido, r.desembolso.total - r.creditos.total);
  close(r.custo_total_liquido, r.custo_total - r.creditos.total); // custo com mercadoria continua disponível
});

test('marítimo LCL: W/M, mínimo, AFRMM só sobre o frete marítimo', () => {
  const i = base();
  i.freight = { ...i.freight, modal: 'LCL', rate: 50, min_charge: 0, origin_fees: 100 };
  i.cargo = { peso_kg: 3000, volume_m3: 2, containers: null }; // W/M = 3
  const r = computeStudy(i);
  close(r.frete.quantidade, 3);
  close(r.frete.total_moeda, 250);
  close(r.despesas.afrmm, 150 * 5 * 0.08 + 20); // 8% do frete marítimo + taxa fixa R$ 20
  i.freight.min_charge = 400;
  const r2 = computeStudy(i);
  assert.equal(r2.frete.minimo_aplicado, true);
  close(r2.frete.total_moeda, 500);
});

test('FCL usa número de containers', () => {
  const i = base();
  i.freight = { ...i.freight, modal: 'FCL40', rate: 3100 };
  i.cargo = { peso_kg: null, volume_m3: null, containers: 2 };
  close(computeStudy(i).frete.total_moeda, 6200);
  i.cargo.containers = 0;
  assert.throws(() => computeStudy(i), /containers/);
});

test('créditos por regime e IPI na base no ativo', () => {
  const s = base();
  s.regime = 'SIMPLES';
  close(computeStudy(s).creditos.total, 0);
  const lp = base();
  lp.regime = 'LUCRO_PRESUMIDO';
  const rlp = computeStudy(lp);
  close(rlp.creditos.pis + rlp.creditos.cofins, 0);
  assert.ok(rlp.creditos.icms > 0 && rlp.creditos.ipi > 0);
  const a = base();
  a.items[0].finalidade = 'ATIVO';
  a.items[0].icms = { ...a.items[0].icms, incluir_ipi: true };
  const ra = computeStudy(a);
  close(ra.icms.base_inicial - computeStudy(base()).icms.base_inicial, ra.impostos.ipi);
  close(ra.creditos.ipi, 0);
});

test('seguro completo converge nas duas bases', () => {
  const i = base();
  i.seguro_tipo = 'COMPLETO';
  const r = computeStudy(i);
  close(r.cif.seguro_brl, r.custo_total * 0.0015, 1e-6);
  i.settings.seguro_completo_base = 'CIF_IMPOSTOS';
  const r2 = computeStudy(i);
  close(r2.cif.seguro_brl, (r2.cif.total_brl + r2.impostos.ii + r2.impostos.ipi + r2.impostos.pis + r2.impostos.cofins) * 0.0015, 1e-6);
  assert.ok(r2.cif.seguro_brl < r.cif.seguro_brl);
});

test('EX-tarifário e rateio entre itens', () => {
  const i = base();
  i.items = [
    { ...i.items[0], value: 6000, ex_tarifario: true, ii_ex: 0 },
    { ...i.items[0], value: 4000, description: 'Outro' },
  ];
  const r = computeStudy(i);
  close(r.itens[0].ii, 0);
  close(r.itens[1].ii, r.cif.total_brl * 0.4 * 0.14);
  close(r.itens[0].cif + r.itens[1].cif, r.cif.total_brl);
  close(r.itens[0].custo_total + r.itens[1].custo_total, r.custo_total);
});

test('honorários, armazenagem e Siscomex', () => {
  const i = base();
  i.honorarios = { fixo: 300, pct: 0.5, min: 1500 };
  i.storage = {
    name: 'T', acrescimo_pct: 0, validado: false, dias_extras: 2, volumes: 0, opcionais: [],
    linhas: [
      { id: 'p1', descricao: '1º período', tipo: 'pct_cif', pct: 0.25, minimo: 900, aplica: 'primeiro' },
      { id: 'p2', descricao: '2º período', tipo: 'pct_cif', pct: 0.25, minimo: 900, aplica: 'adicional', dias_periodo: 2 },
      { id: 'fx', descricao: 'Taxas', tipo: 'fixo', valor: 600 },
    ],
  };
  const r = computeStudy(i);
  // base dos honorários = base do ICMS por dentro sem os próprios honorários
  const baseSemHon = (r.icms.base_inicial - r.despesas.honorarios) / 0.96;
  close(r.despesas.honorarios, 300 + Math.max(baseSemHon * 0.005, 1500)); // aqui vale o mínimo
  close(r.despesas.armazenagem, Math.max(r.cif.total_brl * 0.0025, 900) * 2 + 600);
  assert.ok(r.alertas.some((a) => a.nivel === 'atencao' && a.texto.includes('armazenagem')));
});

test('memória de cálculo cobre os totais', () => {
  const r = computeStudy(base());
  const find = (d: string) => r.memoria.find((m) => m.descricao === d)!;
  close(find('Valor CIF').valor, r.cif.total_brl);
  close(find('Custo líquido final').valor, r.custo_liquido);
  assert.match(find('Base final').formula, /÷ 0,9600/);
});

test('erros de entrada', () => {
  const i = base();
  i.rates = {};
  assert.throws(() => computeStudy(i), CalcError);
  const j = base();
  j.cargo = { peso_kg: null, volume_m3: null, containers: null };
  assert.throws(() => computeStudy(j), /peso/);
});

const cond = (o: Partial<IcmsCondition>): IcmsCondition => ({
  id: 1, code: 'C', label: 'C', regime_scope: 'NORMAL', finalidade: 'REVENDA', ex_tarifario: false, aliquota_efetiva: 1.4, divisor: 0.96,
  aliquota_credito: 4, incluir_ipi: false, calc_dif_ipi: true, user_editable: false, auto_divisor: false, validado: true, sort: 0, notes: null, active: true, ...o,
});

test('ICMS: cliente não altera TTD; admin altera e fica registrado', () => {
  const c = cond({});
  const asClient = resolveIcms(c, { aliquota_efetiva: 0, divisor: 0.5 }, 'cliente');
  assert.equal(asClient.aliquota_efetiva, 1.4);
  assert.equal(asClient.divisor, 0.96);
  assert.deepEqual(asClient.ajustes_manuais, []);
  const asAdmin = resolveIcms(c, { divisor: 0.95, incluir_ipi: true }, 'admin');
  assert.equal(asAdmin.divisor, 0.95);
  assert.deepEqual(asAdmin.ajustes_manuais, ['divisor', 'IPI na base']);
});

test('ICMS sem TTD: alíquota do usuário, divisor automático', () => {
  const c = cond({ user_editable: true, auto_divisor: true, aliquota_efetiva: 17, divisor: 0.83, aliquota_credito: 17 });
  const r = resolveIcms(c, { aliquota_efetiva: 12 }, 'cliente');
  assert.equal(r.aliquota_efetiva, 12);
  assert.equal(r.divisor, 0.88);
  assert.equal(r.aliquota_credito, 12);
  assert.deepEqual(r.ajustes_manuais, []);
});

test('parseNumber pt-BR', () => {
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('5,5146'), 5.5146);
  assert.equal(parseNumber('5.35'), 5.35);
  assert.equal(parseNumber('1.000.000'), 1000000);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});

test('ICMS por produto: um item EX (CAMEX 2,5/12) e outro revenda (1,4/4), rateio pelo valor', () => {
  const i = base();
  i.items = [
    { ...i.items[0], description: 'Máquina EX', value: 6000, ex_tarifario: true, ii_ex: 0, icms: { ...CAMEX } },
    { ...i.items[0], description: 'Peça revenda', value: 4000, icms: { ...REVENDA } },
  ];
  const r = computeStudy(i);
  const [ex, rev] = r.itens;
  // CIF e despesas rateados 60% / 40% pelo valor do produto
  close(ex.cif, r.cif.total_brl * 0.6);
  close(rev.cif, r.cif.total_brl * 0.4);
  const despesasBase = r.despesas.total + r.impostos.siscomex;
  close(ex.despesas_rateadas, despesasBase * 0.6);
  close(rev.despesas_rateadas, despesasBase * 0.4);
  // cada produto com o seu divisor e as suas alíquotas
  close(ex.base_icms_final, ex.base_icms_inicial / 0.88);
  close(ex.icms_pago, ex.base_icms_final * 0.025);
  close(ex.icms_destaque, ex.base_icms_final * 0.12);
  close(rev.base_icms_final, rev.base_icms_inicial / 0.96);
  close(rev.icms_pago, rev.base_icms_final * 0.014);
  close(rev.icms_destaque, rev.base_icms_final * 0.04);
  close(r.icms.icms_pago, ex.icms_pago + rev.icms_pago);
  close(r.creditos.icms, ex.icms_destaque + rev.icms_destaque);
  // um grupo por condição no resultado
  assert.deepEqual(r.icms_condicoes.map((g) => [g.code, g.itens]), [['CAMEX_EX', ['Máquina EX']], ['NORMAL_REVENDA', ['Peça revenda']]]);
  assert.equal(r.dados_gerais.condicao_icms, 'Lista CAMEX + Normal Revenda');
});

test('finalidade por produto: ativo sem crédito de IPI, revenda com', () => {
  const i = base();
  i.items = [
    { ...i.items[0], description: 'Ativo', value: 5000, finalidade: 'ATIVO', icms: { ...REVENDA, incluir_ipi: true } },
    { ...i.items[0], description: 'Revenda', value: 5000 },
  ];
  const r = computeStudy(i);
  close(r.itens[0].creditos.ipi, 0);
  assert.ok(r.itens[1].creditos.ipi > 0);
  close(r.itens[0].base_icms_inicial - r.itens[1].base_icms_inicial, r.itens[0].ipi); // IPI na base só no ativo
});

test('honorários FORVM: % da base do ICMS com mínimo (ex.: Fast 1%, mín. R$ 950)', () => {
  const i = base();
  i.despacho_brl = 950;
  i.items[0].value = 30000; // base ~R$ 210 mil → 1% supera o mínimo
  i.honorarios = { fixo: 0, pct: 1, min: 950 };
  const r = computeStudy(i);
  const baseSemHon = (r.icms.base_inicial - r.despesas.honorarios) / 0.96;
  close(r.despesas.honorarios, baseSemHon * 0.01); // 1% > mínimo
  assert.ok(r.despesas.honorarios > 950);
  // honorários entram na base do ICMS do próprio estudo
  close(r.icms.base_inicial, baseSemHon * 0.96 + r.despesas.honorarios);
  // carga pequena: vale o mínimo
  const p = base();
  p.items[0].value = 100;
  p.honorarios = { fixo: 0, pct: 1, min: 950 };
  close(computeStudy(p).despesas.honorarios, 950);
});

test('honorários com produtos em condições diferentes usam a base de cada um', () => {
  const i = base();
  i.honorarios = { fixo: 0, pct: 1, min: 0 };
  i.items = [
    { ...i.items[0], description: 'EX', value: 6000, ex_tarifario: true, ii_ex: 0, icms: { ...CAMEX } },
    { ...i.items[0], description: 'Revenda', value: 4000 },
  ];
  const r = computeStudy(i);
  const [ex, rev] = r.itens;
  const hon = r.despesas.honorarios;
  const baseSemHon = (ex.base_icms_inicial - hon * 0.6) / 0.88 + (rev.base_icms_inicial - hon * 0.4) / 0.96;
  close(hon, baseSemHon * 0.01);
});

test('armazenagem aeroporto GRU e Infraero: faixas por dias úteis + peso', async () => {
  const { computeStorage } = await import('../src/shared/calc.ts');
  const { TABELAS_AEREO } = await import('../src/server/armazenagem-forvm.ts');
  const tab = (nome: string, dias: number, peso: number) => {
    const t = TABELAS_AEREO.find((x) => x.name.startsWith(nome))!;
    return { name: t.name, linhas: t.linhas, acrescimo_pct: t.acrescimo_pct, validado: true, dias_extras: dias, volumes: 0, opcionais: [], peso_kg: peso };
  };
  // GRU, CIF R$ 10.000, 100 kg
  close(computeStorage(tab('GRU', 0, 100), 10000).total, 75 + 23.05); // até 2 dias: 0,75% + mínimo do peso (6,91 < 23,05)
  close(computeStorage(tab('GRU', 3, 100), 10000).total, 150 + 23.05); // 5 dias: 1,5%
  close(computeStorage(tab('GRU', 4, 100), 10000).total, 225 + 23.05); // 6 dias: 2,25%
  close(computeStorage(tab('GRU', 18, 100), 10000).total, 450 + 23.05); // 20 dias: 4,5%
  close(computeStorage(tab('GRU', 23, 100), 10000).total, 675 + 23.05); // 25 dias: 4,5% + 2,25% (1 bloco de 10)
  close(computeStorage(tab('GRU', 0, 1000), 10000).total, 75 + 69.1); // peso 1.000 kg × 0,0691
  // Infraero (Ponta Negra / Joinville / Florianópolis): taxa de R$ 300 só acima de 50 kg
  close(computeStorage(tab('Infraero', 0, 40), 10000).total, 68 + 108 * 2); // 16–50 kg
  close(computeStorage(tab('Infraero', 0, 60), 10000).total, 68 + 365 * 2); // 51–100 kg (sem a antiga taxa fixa de R$ 300)
  close(computeStorage(tab('Infraero', 1, 60), 10000).total, 135 + 365 * 2); // 3 dias: 1,35%
});

test('Infraero: taxa de peso por faixa × 2, adicional acima de 10.000 kg', async () => {
  const { computeStorage } = await import('../src/shared/calc.ts');
  const { PESO_INFRAERO } = await import('../src/server/armazenagem-forvm.ts');
  const st = (peso: number) => ({ name: 'P', linhas: [PESO_INFRAERO], acrescimo_pct: 0, validado: true, dias_extras: 0, volumes: 0, opcionais: [], peso_kg: peso });
  close(computeStorage(st(10), 0).total, 128); // até 15 kg: 64 × 2
  close(computeStorage(st(15), 0).total, 128);
  close(computeStorage(st(16), 0).total, 216); // 16–50 kg: 108 × 2
  close(computeStorage(st(800), 0).total, 1010); // 501–1.000 kg: 505 × 2
  close(computeStorage(st(10000), 0).total, 2126); // 1.063 × 2
  close(computeStorage(st(11500), 0).total, (1063 + 2 * 74) * 2); // 2 blocos de 1.000 kg ou fração
});

test('EX-tarifário zera o II mesmo sem II-EX cadastrado', () => {
  const i = base();
  i.items = [{ ...i.items[0], ex_tarifario: true, ii_ex: null }];
  const r = computeStudy(i);
  close(r.impostos.ii, 0);
  close(r.itens[0].aliquotas.ii, 0);
  // IPI passa a incidir só sobre o CIF (II zero)
  close(r.impostos.ipi, r.cif.total_brl * 0.052);
  // alíquota EX específica cadastrada no produto continua valendo
  i.items = [{ ...i.items[0], ex_tarifario: true, ii_ex: 2 }];
  close(computeStudy(i).impostos.ii, computeStudy(i).cif.total_brl * 0.02);
  // sem EX, II normal
  i.items = [{ ...i.items[0], ex_tarifario: false, ii_ex: 0 }];
  close(computeStudy(i).impostos.ii, computeStudy(i).cif.total_brl * 0.14);
});
