import ExcelJS from 'exceljs';
import type { CalcResult } from '../shared/calc.ts';
import { dateTimeBR } from '../shared/format.ts';

const AZUL = 'FF0077BE';
const MARINHO = 'FF1F4E78';
const GELO = 'FFDDEBF7';
const BRL = '"R$" #,##0.00';
const NUM = '#,##0.00';

interface Meta {
  reference: string;
  company: string;
  cnpj: string;
  createdAt: string;
  title: string;
  result: CalcResult;
}

/** Planilha do estudo no padrão visual FORVM: resumo, custo por produto e memória de cálculo. */
export function studyWorkbook(m: Meta): ExcelJS.Workbook {
  const r = m.result;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FORVM · Simulador de custos';
  wb.created = new Date();

  // ---------- Resumo ----------
  const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 46 }, { width: 18 }, { width: 18 }];
  const title = ws.addRow(['SIMULAÇÃO DE CUSTOS DE IMPORTAÇÃO']);
  title.font = { bold: true, size: 14, color: { argb: MARINHO } };
  ws.addRow([`Conta e Ordem · ${dateTimeBR(m.createdAt)}`]).font = { color: { argb: 'FF6B7280' } };
  const ref = ws.addRow([`Referência ${m.reference}`, m.company]);
  ref.font = { bold: true, size: 12, color: { argb: MARINHO } };
  ws.addRow([m.title || '', m.cnpj ? `CNPJ ${m.cnpj}` : '']);
  ws.addRow([]);

  const band = (text: string) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, 3);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.getCell(1).alignment = { horizontal: 'center' };
  };
  const header = (cols: string[]) => {
    const row = ws.addRow(cols);
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GELO } };
      c.font = { bold: true, size: 9, color: { argb: MARINHO } };
    });
    row.getCell(2).alignment = { horizontal: 'right' };
    row.getCell(3).alignment = { horizontal: 'right' };
  };
  const line = (label: string, a: number | null, b: number | null, fmtA = NUM, fmtB = BRL) => {
    const row = ws.addRow([label, a, b]);
    row.getCell(2).numFmt = fmtA;
    row.getCell(3).numFmt = fmtB;
    row.eachCell((c) => (c.border = { bottom: { style: 'hair', color: { argb: 'FFE2E6EA' } } }));
    return row;
  };
  const total = (label: string, a: number | null, b: number | null) => {
    const row = line(label, a, b);
    row.eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARINHO } };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
  };

  const g = r.dados_gerais;
  band('PLANILHA PRÉ-CÁLCULO');
  const kv: [string, string][] = [
    ['Origem', [g.origem_detalhe, g.origem].filter(Boolean).join(' · ')],
    ['Destino', g.destino_detalhe ?? '—'],
    ['Transporte', g.modal],
    ['Taxa fiscal', `${g.taxa.toFixed(4).replace('.', ',')}${g.moeda_frete !== g.moeda ? ` · frete ${g.moeda_frete} ${g.taxa_frete.toFixed(4).replace('.', ',')}` : ''}`],
    ['Tipo de operação', 'Conta e Ordem'],
    ['Finalidade', g.finalidade],
    ['Tributação', g.regime],
    ['Operação', g.condicao_icms],
    ['NCM', g.ncms.join('; ')],
    ['Moeda', g.moeda],
    ['Peso bruto', g.peso_bruto_kg ? `${g.peso_bruto_kg} kg` : '—'],
    ['Incoterm', g.incoterm],
    ['Seguro', r.cif.seguro_tipo],
  ];
  for (const [k, v] of kv) {
    const row = ws.addRow([k, v]);
    ws.mergeCells(row.number, 2, row.number, 3);
    row.getCell(1).font = { color: { argb: 'FF6B7280' }, size: 9 };
    row.getCell(2).font = { bold: true };
  }

  // Valores em moeda = R$ ÷ taxa fiscal (como na planilha FORVM).
  const T = g.taxa;
  const lm = (label: string, brlV: number) => line(label, brlV / T, brlV);
  const tm = (label: string, brlV: number) => total(label, brlV / T, brlV);

  band('VALOR DA MERCADORIA');
  header(['Descrição', g.moeda, 'R$']);
  line('FOB', r.cif.mercadoria_moeda, r.cif.mercadoria_brl);
  line('Frete internacional', r.cif.frete_moeda, r.cif.frete_brl);
  line('THC', r.cif.thc_moeda ?? 0, r.cif.thc_brl ?? 0);
  line('Seguro', r.cif.seguro_moeda, r.cif.seguro_brl);
  total('CIF', r.cif.total_moeda, r.cif.total_brl);

  band('IMPOSTOS NA NACIONALIZAÇÃO');
  header(['Descrição', g.moeda, 'R$']);
  lm('II - Imposto de Importação', r.impostos.ii);
  lm('IPI - Nacionalização', r.impostos.ipi);
  lm('PIS - Nacionalização', r.impostos.pis);
  lm('COFINS - Nacionalização', r.impostos.cofins);
  lm(`Siscomex${g.adicoes > 1 ? ` (${g.adicoes} adições)` : ''}`, r.impostos.siscomex);
  tm('TOTAL IMPOSTOS NA NACIONALIZAÇÃO', r.impostos.total);

  band('DESPESAS ADUANEIRAS');
  header(['Descrição', g.moeda, 'R$']);
  if (r.despesas.afrmm) lm('AFRMM - Marinha Mercante', r.despesas.afrmm);
  lm('Honorários FORVM', r.despesas.honorarios);
  lm(g.modal_code === 'AEREO' ? 'Armazenagem aeroporto' : 'Armazenagem porto', r.despesas.armazenagem);
  lm('Taxas no destino', r.despesas.taxas_destino);
  lm('Honorário despachante', r.despesas.despacho);
  tm('TOTAL DESPESAS ADUANEIRAS', r.despesas.total);

  band('CUSTOS CONTA E ORDEM');
  header(['Descrição', '', 'R$']);
  const multiCond = r.icms_condicoes.length > 1;
  if (multiCond) for (const g of r.icms_condicoes) line(`ICMS pago · ${g.label} (${g.aliquota_efetiva}%)`, null, g.icms_pago);
  else line('ICMS pago', null, r.conta_ordem.icms_pago);
  line('Dif. IPI', null, r.conta_ordem.dif_ipi);
  total('VALOR TOTAL CUSTOS CONTA E ORDEM', null, r.conta_ordem.icms_pago + r.conta_ordem.dif_ipi);
  for (const g of r.icms_condicoes) {
    const base = ws.addRow([
      `${multiCond ? `${g.label} (${g.itens.join(', ')}) — ` : ''}base do ICMS ${g.base_inicial.toFixed(2)} ÷ ${g.divisor} = ${g.base_final.toFixed(2)}`,
    ]);
    ws.mergeCells(base.number, 1, base.number, 3);
    base.getCell(1).font = { size: 8, color: { argb: 'FF6B7280' } };
  }

  band('DESPESAS NACIONAIS');
  header(['Descrição', '', 'R$']);
  line('Frete entrega mercadoria', null, r.conta_ordem.frete_nacional);
  total('VALOR TOTAL DESPESAS NACIONAIS', null, r.conta_ordem.frete_nacional);

  ws.addRow([]);
  total('DESEMBOLSO TOTAL', null, r.desembolso.total);

  band('DESTAQUE DE IMPOSTOS PARA CRÉDITO');
  header(['Descrição', g.moeda, 'R$']);
  lm('Crédito de ICMS', r.creditos.icms);
  lm('Crédito de PIS', r.creditos.pis);
  lm('Crédito de COFINS', r.creditos.cofins);
  lm('Crédito de IPI', r.creditos.ipi);
  tm('VALOR TOTAL DO CRÉDITO DOS IMPOSTOS', r.creditos.total);
  ws.addRow([]);
  total('CUSTO LÍQUIDO (DESEMBOLSO − CRÉDITOS)', null, r.custo_liquido);
  if (!r.desembolso.inclui_cif) total('CUSTO TOTAL LÍQUIDO (com mercadoria)', null, r.custo_total_liquido);

  ws.addRow([]);
  band('ALERTAS DO SIMULADOR');
  for (const a of r.alertas) {
    const row = ws.addRow([`${a.nivel === 'atencao' ? '⚠ ' : '• '}${a.texto}`]);
    ws.mergeCells(row.number, 1, row.number, 3);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).font = { size: 9, color: { argb: a.nivel === 'atencao' ? 'FF9A6200' : 'FF374151' } };
    row.height = Math.max(15, Math.ceil(a.texto.length / 95) * 13);
  }

  // ---------- Itens ----------
  const wi = wb.addWorksheet('Custo por produto', { views: [{ state: 'frozen', ySplit: 1 }] });
  wi.columns = [
    { header: 'Produto', key: 'p', width: 34 },
    { header: 'NCM', key: 'ncm', width: 12 },
    { header: 'EX', key: 'ex', width: 5 },
    { header: 'Finalidade', key: 'fin', width: 22 },
    { header: 'Condição ICMS', key: 'cond', width: 30 },
    { header: 'Despesas rateadas', key: 'desp', width: 14, style: { numFmt: BRL } },
    { header: 'Base ICMS final', key: 'bf', width: 15, style: { numFmt: BRL } },
    { header: `Valor (${g.moeda})`, key: 'v', width: 14, style: { numFmt: NUM } },
    { header: 'Qtd.', key: 'q', width: 8 },
    { header: 'CIF', key: 'cif', width: 14, style: { numFmt: BRL } },
    { header: 'II', key: 'ii', width: 12, style: { numFmt: BRL } },
    { header: 'IPI', key: 'ipi', width: 12, style: { numFmt: BRL } },
    { header: 'PIS', key: 'pis', width: 12, style: { numFmt: BRL } },
    { header: 'COFINS', key: 'cof', width: 12, style: { numFmt: BRL } },
    { header: 'ICMS pago', key: 'icms', width: 12, style: { numFmt: BRL } },
    { header: 'Dif. IPI', key: 'dif', width: 12, style: { numFmt: BRL } },
    { header: 'Custo total', key: 'ct', width: 15, style: { numFmt: BRL } },
    { header: 'Créditos', key: 'cr', width: 14, style: { numFmt: BRL } },
    { header: 'Custo líquido', key: 'cl', width: 15, style: { numFmt: BRL } },
    { header: 'Custo unitário', key: 'cu', width: 14, style: { numFmt: BRL } },
  ];
  for (const i of r.itens) {
    wi.addRow({
      p: i.descricao, ncm: i.ncm, ex: i.ex_tarifario ? 'Sim' : '', fin: i.finalidade, cond: `${i.icms.label} (${i.icms.aliquota_efetiva}% / ÷${i.icms.divisor} / ${i.icms.aliquota_credito}%)`, desp: i.despesas_rateadas, bf: i.base_icms_final, v: i.valor_moeda, q: i.quantidade, cif: i.cif, ii: i.ii, ipi: i.ipi, pis: i.pis, cof: i.cofins,
      icms: i.icms_pago, dif: i.dif_ipi, ct: i.custo_total, cr: i.creditos.total, cl: i.custo_liquido_total, cu: i.custo_unitario,
    });
  }
  styleHeader(wi.getRow(1));

  // ---------- Memória ----------
  const wm = wb.addWorksheet('Memória de cálculo', { views: [{ state: 'frozen', ySplit: 1 }] });
  wm.columns = [
    { header: 'Grupo', key: 'g', width: 12 },
    { header: 'Item', key: 'd', width: 34 },
    { header: 'Fórmula', key: 'f', width: 90 },
    { header: 'Valor', key: 'v', width: 18, style: { numFmt: NUM } },
  ];
  for (const l of r.memoria) wm.addRow({ g: l.grupo, d: l.descricao, f: l.formula, v: l.valor });
  wm.getColumn('f').alignment = { wrapText: true, vertical: 'top' };
  styleHeader(wm.getRow(1));

  return wb;
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
}
