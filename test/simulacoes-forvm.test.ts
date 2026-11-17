// Regressão contra simulações reais emitidas pela FORVM (PDFs enviados em 11/11/2026).
// Os valores esperados são os impressos nas planilhas, ao centavo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStudy, type CalcInput, type CalcItem } from '../src/shared/calc.ts';
import { DEFAULT_SETTINGS, siscomexFor } from '../src/shared/domain.ts';
import { roundHalf } from '../src/shared/format.ts';
import { TABELAS_AEREO, TABELAS_FORVM } from '../src/server/armazenagem-forvm.ts';

// Compara como a planilha exibe: arredondamento comercial em centavos.
const cent = (actual: number, expected: number, label: string) =>
  assert.equal(roundHalf(actual), expected, `${label}: ${actual.toFixed(4)} ≠ ${expected}`);

const item = (o: Partial<CalcItem>): CalcItem => ({
  product_id: 1, code: null, description: 'Item', ncm: '0000.00.00', value: 0, quantity: null,
  ii: 0, ii_ex: null, ipi: 0, pis: 2.1, cofins: 9.65, ex_tarifario: false, aliquotas_confirmadas: true, finalidade: 'REVENDA',
  icms: { code: 'T', label: 'TTD 410', aliquota_efetiva: 1.4, divisor: 0.96, aliquota_credito: 4, incluir_ipi: false, calc_dif_ipi: true, validado: true, ajustes_manuais: [] },
  ...o,
});

function storageFor(a: number | { tabela: string; dias?: number; peso?: number }): CalcInput['storage'] {
  if (typeof a === 'number') {
    return { name: 'informada', linhas: [{ id: 'v', descricao: 'Armazenagem informada', tipo: 'fixo', valor: a }], acrescimo_pct: 0, validado: true, dias_extras: 0, volumes: 0, opcionais: [] };
  }
  const t = [...TABELAS_FORVM, ...TABELAS_AEREO].find((x) => x.name === a.tabela);
  if (!t) throw new Error('tabela inexistente: ' + a.tabela);
  return {
    name: t.name, linhas: t.linhas, acrescimo_pct: t.acrescimo_pct, validado: true, dias_extras: a.dias ?? 0, volumes: 0, peso_kg: a.peso ?? 0,
    opcionais: t.linhas.filter((l) => l.opcional && l.padrao).map((l) => l.id),
  };
}

/** Monta a entrada com despesas informadas em R$ (como na planilha). */
function input(o: {
  currency: 'USD' | 'EUR';
  rate: number;
  items: CalcItem[];
  modal: 'AEREO' | 'LCL';
  frete: number;
  incoterm: 'EXW' | 'FOB' | 'FCA';
  finalidade: CalcItem['finalidade'];
  icms: [number, number, number];
  despacho: number;
  /** número = valor fixo informado; objeto = % da base do ICMS com mínimo */
  honorarios: number | { pct: number; min: number };
  /** número = valor informado; objeto = tabela real do terminal + dias extras */
  armazenagem: number | { tabela: string; dias?: number; peso?: number };
  taxasDestino: number;
  freteNacional: number;
}): CalcInput {
  const adicoes = new Set(o.items.map((i) => i.ncm)).size;
  return {
    regime: 'LUCRO_REAL',
    currency: o.currency,
    rates: { [o.currency]: o.rate },
    // condição TTD 410 da operação aplicada a todos os produtos da planilha
    items: o.items.map((i) => ({
      ...i,
      finalidade: o.finalidade,
      icms: { code: 'T', label: 'TTD 410', aliquota_efetiva: o.icms[0], divisor: o.icms[1], aliquota_credito: o.icms[2], incluir_ipi: false, calc_dif_ipi: true, validado: true, ajustes_manuais: [] },
    })),
    // tarifa = frete total por 1 unidade tarifada
    freight: { label: 'teste', modal: o.modal, origin_country: 'X', origin_detail: null, dest_detail: null, incoterm: o.incoterm, currency: o.currency, rate: o.frete, min_charge: 0, origin_fees: 0, dest_fees_brl: o.taxasDestino, transit_days: null },
    cargo: { peso_kg: o.modal === 'AEREO' ? 1 : null, volume_m3: o.modal === 'LCL' ? 1 : null, containers: null },
    seguro_tipo: 'SIMPLES',
    siscomex_brl: siscomexFor(adicoes, DEFAULT_SETTINGS),
    siscomex_adicoes: adicoes,
    siscomex_alterado: false,
    despacho_brl: o.despacho,
    honorarios: typeof o.honorarios === 'number' ? { fixo: o.honorarios, pct: 0, min: 0 } : { fixo: 0, ...o.honorarios },
    frete_nacional_brl: o.freteNacional,
    storage: storageFor(o.armazenagem),
    settings: { ...DEFAULT_SETTINGS },
  };
}

test('WIND INDUSTRIAL · LCL Shenzhen → Navegantes · FOB · comercialização', () => {
  const r = computeStudy(
    input({
      currency: 'USD', rate: 5.5013, modal: 'LCL', frete: 1408.5, incoterm: 'FOB', finalidade: 'REVENDA', icms: [1.4, 0.96, 4],
      items: [item({ ncm: '7318.12.00', value: 15050, ii: 25, ipi: 6.5 })],
      despacho: 750, honorarios: { pct: 1, min: 750 }, // 1% da base do ICMS, mín. = despacho
      armazenagem: { tabela: 'Forte (LCL)' }, taxasDestino: 939.6, freteNacional: 3300,
    }),
  );
  cent(r.cif.mercadoria_brl, 82794.57, 'FOB');
  cent(r.cif.frete_brl, 7748.58, 'frete');
  cent(r.cif.seguro_brl, 135.81, 'seguro');
  cent(r.cif.total_brl, 90678.96, 'CIF');
  cent(r.impostos.ii, 22669.74, 'II');
  cent(r.impostos.ipi, 7367.67, 'IPI');
  cent(r.impostos.pis, 1904.26, 'PIS');
  cent(r.impostos.cofins, 8750.52, 'COFINS');
  cent(r.impostos.siscomex, 154.23, 'Siscomex');
  cent(r.impostos.total, 40846.41, 'total impostos');
  cent(r.despesas.afrmm, 639.88, 'AFRMM');
  cent(r.despesas.honorarios, 1349.99, 'honorários FORVM (1% da base do ICMS)');
  cent(r.despesas.armazenagem, 3112.15, 'armazenagem pela tabela Forte LCL');
  cent(r.despesas.total, 6791.62, 'total despesas');
  cent(r.conta_ordem.icms_pago, 1909.68, 'ICMS pago');
  cent(r.conta_ordem.dif_ipi, 1498.7, 'dif. IPI');
  cent(r.conta_ordem.icms_pago + r.conta_ordem.dif_ipi, 3408.37, 'custos conta e ordem');
  cent(r.desembolso.total, 145025.37, 'DESEMBOLSO TOTAL');
  cent(r.creditos.icms, 5456.22, 'crédito ICMS');
  cent(r.creditos.ipi, 8866.36, 'crédito IPI');
  cent(r.creditos.total, 24977.36, 'total créditos');
});

test('EUROMAC · marítimo Gênova → Navegantes · EXW · industrialização', () => {
  const r = computeStudy(
    input({
      currency: 'EUR', rate: 5.9791, modal: 'LCL', frete: 3375, incoterm: 'EXW', finalidade: 'INDUSTRIALIZACAO', icms: [4, 0.9, 10],
      items: [item({ ncm: '8474.80.10', value: 70000, ii: 20, ipi: 0, cofins: 10.25 })],
      despacho: 1085, honorarios: 6720.03, armazenagem: { tabela: 'Portonave (FCL)', dias: 5 }, taxasDestino: 2864, freteNacional: 2100,
    }),
  );
  cent(r.cif.mercadoria_brl, 418537, 'FOB');
  cent(r.cif.frete_brl, 20179.46, 'frete');
  cent(r.cif.seguro_brl, 658.07, 'seguro');
  cent(r.cif.total_brl, 439374.54, 'CIF');
  cent(r.impostos.ii, 87874.91, 'II');
  cent(r.impostos.pis, 9226.87, 'PIS');
  cent(r.impostos.cofins, 45035.89, 'COFINS');
  cent(r.impostos.total, 142291.89, 'total impostos');
  cent(r.despesas.afrmm, 1634.35, 'AFRMM');
  cent(r.despesas.armazenagem, 10907.32, 'armazenagem Portonave com 5 dias extras');
  cent(r.despesas.total, 23210.7, 'total despesas');
  cent(r.conta_ordem.icms_pago, 26883.43, 'ICMS pago');
  cent(r.conta_ordem.dif_ipi, 0, 'dif. IPI');
  cent(r.desembolso.total, 633860.56, 'DESEMBOLSO TOTAL');
  cent(r.creditos.icms, 67208.57, 'crédito ICMS');
  cent(r.creditos.total, 121471.33, 'total créditos');
});

test('GAV TRANSPORTES · aéreo Shenzhen → Joinville · FCA · 2 NCMs', () => {
  // A planilha mostra só o IPI total; os dois itens usam a mesma alíquota efetiva.
  const ipi = (1600.3 / (8652.42 + 1730.48)) * 100;
  const r = computeStudy(
    input({
      currency: 'USD', rate: 5.5013, modal: 'AEREO', frete: 916.44, incoterm: 'FCA', finalidade: 'REVENDA', icms: [1.4, 0.96, 4],
      items: [item({ ncm: '8525.89.19', value: 327, ii: 20, ipi }), item({ ncm: '8525.89.29', value: 327, ii: 20, ipi })],
      despacho: 1085, honorarios: { pct: 1, min: 1085 }, // 1% da base daria R$ 136,91 → mínimo
      armazenagem: { tabela: 'Infraero · Ponta Negra (Joinville / Florianópolis)', dias: 3, peso: 10 }, taxasDestino: 221.21, freteNacional: 200,
    }),
  );
  cent(r.cif.total_brl, 8652.42, 'CIF');
  cent(r.cif.seguro_brl, 12.96, 'seguro');
  cent(r.impostos.ii, 1730.48, 'II');
  cent(r.impostos.siscomex, 192.79, 'Siscomex com 2 adições');
  cent(r.impostos.total, 4540.23, 'total impostos');
  cent(r.despesas.afrmm, 0, 'AFRMM (aéreo)');
  cent(r.despesas.honorarios, 1085, 'honorários FORVM (mínimo)');
  cent(r.despesas.armazenagem, 244.81, 'armazenagem Infraero: 1,35% do CIF + R$ 64 × 2 (até 15 kg)');
  cent(r.despesas.total, 2636.02, 'total despesas');
  cent(r.conta_ordem.icms_pago, 207.5, 'ICMS pago');
  cent(r.conta_ordem.dif_ipi, 684.07, 'dif. IPI');
  cent(r.desembolso.total, 16920.24, 'DESEMBOLSO TOTAL');
  cent(r.creditos.icms, 592.85, 'crédito ICMS');
  cent(r.creditos.ipi, 2284.37, 'crédito IPI');
  cent(r.creditos.total, 3893.88, 'total créditos');
});

test('Siscomex por faixa de adições', () => {
  assert.equal(siscomexFor(1, DEFAULT_SETTINGS), 154.23);
  assert.equal(siscomexFor(2, DEFAULT_SETTINGS), 192.79);
  assert.equal(siscomexFor(3, DEFAULT_SETTINGS), 223.64);
});
