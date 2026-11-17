// Tabelas de armazenagem dos terminais, transcritas da planilha
// "ARMAZENAGEM & AFRMM - ATUALIZADO.xlsx" da FORVM (recebida em 13/11/2026).
// Cada linha reproduz uma linha da planilha; o total recebe o acréscimo de 5% da planilha
// (exceto onde a aba não aplica, como a Multilog LCL).
// Conferido: WIND (Forte LCL) = R$ 3.112,15 e EUROMAC (Portonave, +5 dias) = R$ 10.907,32.
import type { StorageLine, StorageModal } from '../shared/domain.ts';

export interface TabelaArmazenagem {
  name: string;
  modal: StorageModal;
  location: string | null;
  acrescimo_pct: number;
  linhas: StorageLine[];
  notes: string | null;
}

const p1 = (pct: number, minimo: number, dias: number): StorageLine => ({
  id: 'periodo1', descricao: `1º período (${dias} dias)`, tipo: 'pct_cif', pct, minimo, aplica: 'primeiro',
});
/** Período adicional cobrado por dia (dias além do 1º período). */
const extraDia = (pct: number, minimoDia: number, descricao = '2º período (por dia)'): StorageLine => ({
  id: 'periodo2', descricao, tipo: 'pct_cif', pct, minimo: minimoDia, aplica: 'adicional', dias_periodo: null,
});
const pctCif = (id: string, descricao: string, pct: number, minimo = 0, extra: Partial<StorageLine> = {}): StorageLine => ({
  id, descricao, tipo: 'pct_cif', pct, minimo, aplica: 'primeiro', ...extra,
});
const fixo = (id: string, descricao: string, valor: number, extra: Partial<StorageLine> = {}): StorageLine => ({ id, descricao, tipo: 'fixo', valor, ...extra });
const porUnidade = (id: string, descricao: string, valor: number, minimo = 0, extra: Partial<StorageLine> = {}): StorageLine => ({
  id, descricao, tipo: 'por_unidade', valor, minimo, ...extra,
});
const opc = (padrao: boolean, obs?: string): Partial<StorageLine> => ({ opcional: true, padrao, ...(obs ? { obs } : {}) });

export const TABELAS_FORVM: TabelaArmazenagem[] = [
  {
    name: 'Itapoá (FCL)',
    modal: 'FCL',
    location: 'Itapoá/SC',
    acrescimo_pct: 5,
    notes: 'Carga especial (flat rack, open top): a planilha multiplica armazenagem por 2,5 — cotar à parte.',
    linhas: [
      p1(0.63, 1088, 5),
      extraDia(0.29, 240),
      fixo('devolucao', 'Devolução', 392),
      fixo('carregamento', 'Carregamento', 450),
      fixo('pesagem', 'Pesagem', 940),
      fixo('posicionamento', 'Posicionamento', 940),
    ],
  },
  {
    name: 'Portonave (FCL)',
    modal: 'FCL',
    location: 'Navegantes/SC',
    acrescimo_pct: 5,
    notes: 'Carga especial (flat rack, open top): a planilha multiplica armazenagem por 2,5 — cotar à parte.',
    linhas: [p1(0.6, 1100, 5), extraDia(0.33, 236), fixo('levante', 'Levante', 376), fixo('pesagem', 'Pesagem', 126)],
  },
  {
    name: 'Movecta (LCL)',
    modal: 'LCL',
    location: null,
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.519, 408.74, 10),
      pctCif('seguro', 'Seguro', 0.138, 55.06),
      fixo('carregamento', 'Carregamento', 280.61),
      fixo('pesagem', 'Pesagem', 103.77),
      fixo('remocao', 'Remoção', 103.77),
      fixo('devolucao', 'Devolução', 67.77),
      porUnidade('picking', 'Picking (por volume)', 12, 0, { obs: 'R$ 3,20 se caixas' }),
      fixo('taxa_adm', 'Taxa administrativa', 572.86),
      pctCif('zona_primaria', 'Zona primária (valor estimado)', 1, 0, opc(true)),
    ],
  },
  {
    name: 'Forte (LCL)',
    modal: 'LCL',
    location: null,
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.65, 595, 10),
      fixo('adm', 'ADM', 895),
      fixo('carregamento', 'Carregamento', 455),
      fixo('pesagem', 'Pesagem', 190),
      fixo('vistoria_mapa', 'Posicionamento para vistoria MAPA', 103.78, opc(false, 'R$ 103,78 a cada 1,5 m³')),
      fixo('posicionamento', 'Posicionamento', 99, opc(false, 'R$ 99 por posicionamento')),
      porUnidade('picking', 'Picking (por volume)', 13.5),
      fixo('zona_primaria', 'Zona primária (se houver)', 532, opc(true)),
      fixo('devolucao', 'Devolução', 67),
      fixo('remocao', 'Remoção', 103),
      pctCif('seguro', 'Seguro', 0.14, 61),
      pctCif('nvt_armazenagem', 'Zona primária NVT × Forte: armazenagem', 0.58, 0, opc(false)),
      fixo('nvt_taxa', 'Zona primária NVT × Forte: taxa estimada', 200, opc(false)),
      { id: 'nvt_impostos', descricao: 'Zona primária NVT × Forte: impostos', tipo: 'pct_subtotal', pct: 14, sobre: ['nvt_armazenagem', 'nvt_taxa'], ...opc(false) },
    ],
  },
  {
    name: 'Forte (FCL)',
    modal: 'FCL',
    location: null,
    acrescimo_pct: 5,
    notes: 'A planilha indica mínimo de R$ 406 na coluna "mínimo", mas a fórmula do 1º período usa R$ 320. Mantido R$ 320 (fórmula).',
    linhas: [
      p1(0.12, 320, 10),
      extraDia(0.04, 0),
      pctCif('seguro', 'Seguro', 0.1),
      fixo('remocao_dtc', 'Remoção DTC', 775, { obs: 'R$ 2.090 se DTA' }),
      fixo('handling_in', 'Handling in', 145),
      pctCif('seguro_dtc', 'Seguro DTC', 0.6),
      fixo('taxa_adm', 'Taxa administrativa', 125),
      fixo('handling_out', 'Handling out', 145),
    ],
  },
  {
    name: 'Multilog (LCL)',
    modal: 'LCL',
    location: 'Itajaí/SC',
    acrescimo_pct: 0,
    notes: 'Negociação atual — Proposta 087259-26, vigência 31/12/2026. A aba não aplica o acréscimo de 5%. Zona primária (repasse DTC): tarifa do porto + 13,09% de tributos, valor variável — cotar à parte.',
    linhas: [
      p1(0.61, 1002.25, 10),
      extraDia(0.24, 0, '2º período (por dia ou fração)'),
      pctCif('ad_valorem', 'Ad valorem / seguro (30 dias)', 0.3376, 158.25),
      fixo('carregamento_manual', 'Carregamento manual', 1266, opc(true)),
      fixo('carregamento_mecanizado', 'Carregamento paletizado/mecanizado', 633, opc(true)),
      fixo('pesagem_solta', 'Pesagem carga solta', 1055, opc(true)),
      fixo('pesagem_imp', 'Pesagem imp/exp', 443.1, opc(true)),
      fixo('picking', 'Picking', 36.93),
      fixo('posicionamento', 'Posicionamento carga solta', 44.31),
      fixo('api', 'API recintos', 168),
      fixo('handling', 'Handling (in/out) imp/exp', 654.1),
      fixo('dtc_navegantes', 'DTC Porto Navegantes → Multilog', 1520.3, opc(false)),
      fixo('dtc_itajai', 'DTC Porto Itajaí → Multilog', 1256.95, opc(false)),
    ],
  },
  {
    name: 'Barra do Rio (LCL)',
    modal: 'LCL',
    location: 'Itajaí/SC',
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.52, 408.74, 7),
      extraDia(0.17, 65.65),
      pctCif('seguro', 'Seguro', 0.14, 55.06),
      fixo('taxa_adm', 'Taxa administrativa', 572.86),
      fixo('transferencia', 'Transferência', 103.77),
      porUnidade('picking', 'Picking por pallet', 12.71),
      fixo('pesagem', 'Pesagem', 103.77),
      fixo('carregamento', 'Carregamento', 280.61),
      fixo('devolucao', 'Devolução', 67.77),
      { id: 'tributos', descricao: 'PIS/COFINS/ISS', tipo: 'pct_subtotal', pct: 11.25 },
    ],
  },
  {
    name: 'APM Terminals (FCL)',
    modal: 'FCL',
    location: null,
    acrescimo_pct: 5,
    notes: 'Período adicional de 3 dias com mínimo de R$ 122,15 (convertido para R$ 40,72 por dia).',
    linhas: [
      p1(0.44, 671.8, 7),
      extraDia(0.19, 40.72, 'Período adicional (por dia)'),
      pctCif('seguro', 'Seguro', 0.14),
      fixo('levante', 'Levante', 296),
      fixo('movimentacao', 'Movimentação', 182),
      fixo('posicionamento', 'Posicionamento', 1040),
      fixo('pesagem', 'Pesagem', 61.08),
    ],
  },
  {
    name: 'APM Terminals (LCL)',
    modal: 'LCL',
    location: null,
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.5, 366.44, 10),
      pctCif('seguro', 'Seguro', 0.14),
      fixo('carregamento', 'Carregamento', 244.29),
      fixo('pesagem', 'Pesagem', 61.08),
      porUnidade('picking', 'Picking (por volume)', 12.23),
      fixo('taxa_adm', 'Taxa administrativa', 488.58),
      fixo('transf_nvt', 'Transferência de container LCL (atracação em Navegantes)', 449, opc(false)),
      pctCif('transf_nvt_pct', 'Transferência de container LCL: 0,58% do CIF', 0.58, 0, opc(false)),
    ],
  },
  {
    name: 'EGA Santos (FCL)',
    modal: 'FCL',
    location: 'Santos/SP',
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.8775, 2050, 12),
      extraDia(0.29, 127),
      fixo('devolucao', 'Devolução', 945),
      fixo('carregamento', 'Carregamento', 45.5),
      fixo('posicionamento', 'Posicionamento', 287),
    ],
  },
  {
    name: 'EGA Santos (LCL)',
    modal: 'LCL',
    location: 'Santos/SP',
    acrescimo_pct: 5,
    notes: 'Período adicional de 3 dias com mínimo de R$ 127 (convertido para R$ 42,33 por dia).',
    linhas: [
      p1(0.33, 1953, 12),
      extraDia(0.33, 42.33, 'Período adicional (por dia)'),
      pctCif('seguro', 'Seguro', 0.12),
      fixo('posicionamento', 'Posicionamento', 42),
    ],
  },
  {
    name: 'Multilog (aéreo)',
    modal: 'AEREO',
    location: null,
    acrescimo_pct: 5,
    notes: 'Vigência da proposta: 20/06/2024. A coluna "mínimo" do seguro indica R$ 40, mas a fórmula usa R$ 60 (mantido R$ 60).',
    linhas: [
      p1(0.93, 350, 10),
      pctCif('seguro', 'Seguro', 0.11, 60),
      fixo('carregamento', 'Carregamento', 550),
      fixo('descarga', 'Descarga manual / paletizada (mínimo de faturamento)', 627),
      porUnidade('picking', 'Picking por pallet', 11),
    ],
  },
  {
    name: 'Itapoá (LCL)',
    modal: 'LCL',
    location: 'Itapoá/SC',
    acrescimo_pct: 5,
    notes: '2º período de 3 dias com mínimo de R$ 72 (convertido para R$ 24 por dia).',
    linhas: [
      p1(0.98, 505, 7),
      extraDia(0.24, 24),
      pctCif('seguro', 'Seguro', 0.17),
      fixo('taxa_adm', 'Taxa administrativa', 782),
      fixo('pesagem', 'Pesagem', 228),
      porUnidade('picking', 'Picking (por volume)', 28.75),
      fixo('carregamento', 'Carregamento', 494.5),
    ],
  },
  {
    name: 'Itapoá CLIF (LCL)',
    modal: 'LCL',
    location: 'Itapoá/SC',
    acrescimo_pct: 5,
    notes: 'Prazo de pagamento: 3 dias após a emissão da NF. Vigência informada: 31/01/2025.',
    linhas: [
      p1(0.75, 709.88, 10),
      { id: 'periodo2', descricao: '2º período (a cada 10 dias)', tipo: 'pct_cif', pct: 0.2, minimo: 88.73, aplica: 'adicional', dias_periodo: 10 },
      pctCif('seguro', 'Seguro', 0.18, 260),
      fixo('transferencia', 'Transferência', 411.95),
      fixo('taxa_adm', 'Taxa administrativa', 897),
      fixo('pesagem', 'Pesagem', 101.4),
      fixo('devolucao', 'Devolução de vazio', 91, { obs: 'R$ 558 se Navegantes' }),
      porUnidade('picking', 'Picking por pallet', 16),
      porUnidade('picking_caixa', 'Picking por caixa', 3, 0, opc(false)),
      fixo('carregamento', 'Carregamento', 600.5),
    ],
  },
  {
    name: 'Itapoá CLIF (FCL)',
    modal: 'FCL',
    location: 'Itapoá/SC',
    acrescimo_pct: 5,
    notes: 'A planilha lista "Seguro DTC" duas vezes (0,1% cada); mantida uma linha — confirmar.',
    linhas: [
      p1(0.3, 595, 10),
      pctCif('seguro_dtc', 'Seguro DTC', 0.1, 0, { obs: '0,13% se DTA' }),
      fixo('coleta', 'Coleta Itapoá', 895, { obs: 'R$ 1.585 se DTA' }),
      pctCif('seguro_arm', 'Seguro armazenagem', 0.14),
      fixo('movimentacao', 'Movimentação', 400),
      fixo('pesagem', 'Pesagem', 250),
      fixo('taxa_adm', 'Taxa administrativa', 395),
    ],
  },
  {
    name: 'Poly (LCL)',
    modal: 'LCL',
    location: null,
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.608, 742.34, 10),
      pctCif('seguro', 'Seguro', 0.166, 67.25),
      fixo('carregamento', 'Carregamento', 296.14),
      fixo('pesagem', 'Pesagem', 74.04),
      pctCif('zona_primaria', 'Zona primária', 0.58),
      fixo('transferencia', 'Transferência', 790.08),
      fixo('lavacao', 'Lavação de container', 70),
      fixo('devolucao', 'Devolução', 69.62),
      porUnidade('picking', 'Picking (por volume)', 5.85, 121.61, { obs: 'Se pallet, R$ 29,23 cada' }),
      fixo('taxa_adm', 'Taxa administrativa', 593.39),
      {
        id: 'servicos', descricao: 'Serviços prestados (tributos)', tipo: 'pct_subtotal', pct: 12.25,
        sobre: ['periodo1', 'seguro', 'carregamento', 'pesagem', 'transferencia', 'devolucao', 'picking', 'taxa_adm'],
      },
    ],
  },
  {
    name: 'Conexão Marítima (LCL)',
    modal: 'LCL',
    location: null,
    acrescimo_pct: 5,
    notes: null,
    linhas: [
      p1(0.55, 671.8, 10),
      pctCif('seguro', 'Seguro', 0.15, 73.3),
      fixo('carregamento', 'Carregamento', 268),
      fixo('remocao', 'Taxa remoção DTA/DTC', 715),
      fixo('zona_primaria_desp', 'Despesas zona primária', 90),
      fixo('presenca', 'Taxa de presença de carga', 35),
      fixo('conferencia', 'Conferência documental', 35),
      fixo('pesagem', 'Pesagem', 67),
      fixo('devolucao', 'Devolução', 63),
      pctCif('seguro_transp', 'Seguro de transporte', 0.17),
      pctCif('repasse_zp', 'Repasse zona primária', 0.6, 450),
      fixo('taxa_adm', 'Taxa administrativa', 537),
    ],
  },
];

/** Tabelas de exemplo antigas substituídas pelas da planilha (desativadas na importação). */
export const EXEMPLOS_SUBSTITUIDOS = ['Movecta', 'Forte', 'Porto de Navegantes (Portonave)', 'Porto de Itapoá'];

// ---------- Aeroportos (planilhas "Armazenagem GRU.xlsx" e "Armazenagem Infraero.xlsx", 13/11/2026) ----------
// Tarifa por faixa de dias úteis (cumulativa) sobre o CIF + taxa sobre o peso bruto.
const FAIXAS_AEROPORTO = (p1: number, p2: number) => [
  { ate_dias: 2, pct: p1 },
  { ate_dias: 5, pct: p2 },
  { ate_dias: 10, pct: 2.25 },
  { ate_dias: 20, pct: 4.5 },
];

/** Tabela Infraero "carregamento de veículo" por faixa de peso; a FORVM multiplica sempre por 2. */
export const PESO_INFRAERO: StorageLine = {
  id: 'peso',
  descricao: 'Taxa sobre o peso bruto (carregamento de veículo × 2)',
  tipo: 'faixa_peso',
  faixas_peso: [
    { ate_kg: 15, valor: 64 },
    { ate_kg: 50, valor: 108 },
    { ate_kg: 100, valor: 365 },
    { ate_kg: 500, valor: 461 },
    { ate_kg: 1000, valor: 505 },
    { ate_kg: 4000, valor: 550 },
    { ate_kg: 7000, valor: 910 },
    { ate_kg: 10000, valor: 1063 },
  ],
  adicional_valor: 74,
  adicional_kg: 1000,
  multiplicador: 2,
  minimo: 17.95,
};

export const TABELAS_AEREO: TabelaArmazenagem[] = [
  {
    name: 'GRU Airport (Guarulhos)',
    modal: 'AEREO',
    location: 'Guarulhos/SP',
    acrescimo_pct: 0,
    notes: 'Faixas: 1º período até 2 dias úteis; 2º de 3 a 5; 3º de 6 a 10; 4º de 11 a 20; +2,25% a cada 10 dias úteis ou fração. Cobrança mínima R$ 23,05 (peso).',
    linhas: [
      { id: 'armazenagem', descricao: 'Armazenagem (faixa por dias úteis)', tipo: 'faixa_cif', faixas: FAIXAS_AEROPORTO(0.75, 1.5), adicional_pct: 2.25, adicional_dias: 10 },
      { id: 'peso', descricao: 'Taxa sobre o peso bruto', tipo: 'por_kg', valor: 0.0691, minimo: 23.05 },
    ],
  },
  {
    name: 'Infraero · Ponta Negra (Joinville / Florianópolis)',
    modal: 'AEREO',
    location: 'Navegantes, Joinville e Florianópolis/SC',
    acrescimo_pct: 0,
    notes: 'Tabela Infraero usada para os aeroportos de Joinville e Florianópolis. Taxa sobre o peso bruto pela tabela "carregamento de veículo" por faixa de peso, sempre × 2 (mínimo R$ 17,95). Conferido: GAV (até 5 dias úteis, carga até 15 kg) = R$ 244,81.',
    linhas: [
      { id: 'armazenagem', descricao: 'Armazenagem (faixa por dias úteis)', tipo: 'faixa_cif', faixas: FAIXAS_AEROPORTO(0.68, 1.35), adicional_pct: 2.25, adicional_dias: 10 },
      PESO_INFRAERO,
    ],
  },
];

/** Exemplos aéreos antigos substituídos pelas tabelas acima. */
export const EXEMPLOS_AEREO_SUBSTITUIDOS = ['GRU Airport', 'Ponta Negra'];

/** Terminais cujo valor oficial a FORVM tira do site do porto (a tabela é estimativa). */
export const CALCULO_PELO_SITE = ['Portonave (FCL)', 'Itapoá (FCL)'];
