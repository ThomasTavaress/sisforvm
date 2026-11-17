// Vocabulário do domínio, compartilhado entre servidor e navegador.

export const REGIMES = {
  LUCRO_REAL: 'Lucro Real',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  SIMPLES: 'Simples Nacional',
} as const;
export type Regime = keyof typeof REGIMES;

export const FINALIDADES = {
  REVENDA: 'Revenda (comercialização)',
  INDUSTRIALIZACAO: 'Industrialização',
  ATIVO: 'Ativo Imobilizado',
} as const;
export type Finalidade = keyof typeof FINALIDADES;

export const MODAIS = {
  AEREO: 'Aéreo',
  LCL: 'Marítimo LCL',
  FCL20: "Marítimo FCL 20'",
  FCL40: "Marítimo FCL 40'",
} as const;
export type Modal = keyof typeof MODAIS;

export const STORAGE_MODAIS = { AEREO: 'Aéreo', LCL: 'Marítimo LCL', FCL: 'Marítimo FCL' } as const;
export type StorageModal = keyof typeof STORAGE_MODAIS;

export const INCOTERMS = ['EXW', 'FOB', 'FCA'] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const MOEDAS = ['USD', 'EUR', 'CNY', 'GBP', 'JPY', 'CHF'] as const;
export type Moeda = (typeof MOEDAS)[number];

export const REGIME_SCOPES = { NORMAL: 'Regime Normal', SIMPLES: 'Simples Nacional', TODOS: 'Todos' } as const;
export type RegimeScope = keyof typeof REGIME_SCOPES;

export const FINALIDADE_SCOPES = { ...FINALIDADES, TODAS: 'Todas' } as const;
export type FinalidadeScope = keyof typeof FINALIDADE_SCOPES;

export const SEGURO_TIPOS = {
  SIMPLES: 'Simples (0,15% do CIF)',
  COMPLETO: 'Completo (0,15% do valor total do processo)',
} as const;
export type SeguroTipo = keyof typeof SEGURO_TIPOS;

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export function storageModalOf(modal: Modal): StorageModal {
  return modal === 'FCL20' || modal === 'FCL40' ? 'FCL' : modal;
}
export function isMaritimo(modal: Modal): boolean {
  return modal !== 'AEREO';
}
export function freightUnitLabel(modal: Modal): string {
  return modal === 'AEREO' ? 'kg taxável' : modal === 'LCL' ? 'CBM' : 'container';
}

// ---------- Entidades persistidas ----------
export interface Client {
  id: number;
  company_name: string;
  tax_regime: Regime;
  city: string | null;
  state: string | null;
  cnpj: string | null;
  sigla: string;
  study_seq: number;
  despacho_brl: number;
  honorarios_fixo: number;
  honorarios_pct: number;
  honorarios_min: number;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  name: string | null;
  role: 'admin' | 'cliente';
  client_id: number | null;
  active: boolean;
  created_at: string;
}

export interface FreightProfile {
  id: number;
  client_id: number;
  label: string;
  modal: Modal;
  origin_country: string;
  origin_detail: string | null;
  dest_detail: string | null;
  incoterm: Incoterm;
  currency: Moeda;
  rate: number;
  min_charge: number;
  origin_fees: number;
  /** THC (capatazia) na moeda do frete: compõe o CIF e a base do AFRMM. */
  thc: number;
  dest_fees_brl: number;
  transit_days: string | null;
  notes: string | null;
  active: boolean;
}

export interface Product {
  id: number;
  client_id: number;
  code: string | null;
  description: string;
  ncm: string;
  ii: number;
  ii_ex: number | null;
  ipi: number;
  pis: number;
  cofins: number;
  confirmed: boolean;
  created_by_role: 'admin' | 'cliente' | null;
  notes: string | null;
  active: boolean;
}

/**
 * Linha de uma tabela de armazenagem, no formato das planilhas dos terminais.
 * - pct_cif: máx(CIF × %, mínimo). "primeiro" = 1º período; "adicional" = cobrado pelos dias
 *   além do 1º período (por dia, ou por período de `dias_periodo` dias).
 * - fixo: valor em R$.
 * - por_unidade: valor × quantidade de volumes/pallets do estudo (com mínimo).
 * - pct_subtotal: % sobre as linhas anteriores (todas, ou só as de `sobre`) — impostos/serviços.
 * - faixa_cif: tabela aeroportuária (Infraero/GRU): o % do CIF depende do TOTAL de dias úteis
 *   (faixas cumulativas) + `adicional_pct` a cada `adicional_dias` além da última faixa.
 *   Total de dias = limite da 1ª faixa + dias extras do estudo.
 * - por_kg: valor × peso bruto da carga (com mínimo).
 * - faixa_peso: valor fixo conforme a faixa de peso bruto (ex.: Infraero "carregamento de veículo"),
 *   + `adicional_valor` a cada `adicional_kg` acima da última faixa, × `multiplicador`.
 * `acima_kg`: a linha só é cobrada se o peso bruto passar desse valor.
 * Linhas `opcional` aparecem no simulador para marcar; `padrao` = já vem marcada.
 */
export interface StorageLine {
  id: string;
  descricao: string;
  tipo: 'pct_cif' | 'fixo' | 'por_unidade' | 'pct_subtotal' | 'faixa_cif' | 'por_kg' | 'faixa_peso';
  pct?: number | null;
  minimo?: number | null;
  valor?: number | null;
  aplica?: 'primeiro' | 'adicional';
  dias_periodo?: number | null;
  sobre?: string[];
  faixas?: { ate_dias: number; pct: number }[];
  adicional_pct?: number | null;
  adicional_dias?: number | null;
  acima_kg?: number | null;
  faixas_peso?: { ate_kg: number; valor: number }[];
  adicional_valor?: number | null;
  adicional_kg?: number | null;
  multiplicador?: number | null;
  opcional?: boolean;
  padrao?: boolean;
  obs?: string | null;
}

export interface StorageTable {
  id: number;
  name: string;
  modal: StorageModal;
  location: string | null;
  linhas: StorageLine[];
  /** Acréscimo sobre o total (5% nas planilhas FORVM). */
  acrescimo_pct: number;
  /** Site/simulador oficial do terminal (quando a FORVM calcula por lá). */
  site_url: string | null;
  validado: boolean;
  notes: string | null;
  active: boolean;
}

export interface IcmsCondition {
  id: number;
  code: string;
  label: string;
  regime_scope: RegimeScope;
  finalidade: FinalidadeScope;
  ex_tarifario: boolean;
  aliquota_efetiva: number | null;
  divisor: number | null;
  aliquota_credito: number | null;
  incluir_ipi: boolean;
  calc_dif_ipi: boolean;
  user_editable: boolean;
  auto_divisor: boolean;
  validado: boolean;
  sort: number;
  notes: string | null;
  active: boolean;
}

/** Faixa da taxa Siscomex por adição: vale até a adição `ate` (null = sem limite). */
export interface SiscomexFaixa {
  ate: number | null;
  valor: number;
}

/** Parâmetros gerais definidos pela FORVM (tela "Parâmetros"). */
export interface Settings {
  siscomex_di_brl: number;
  siscomex_adicoes: SiscomexFaixa[];
  seguro_pct: number;
  afrmm_pct: number;
  afrmm_taxa_fixa_brl: number;
  fator_cubagem_aereo: number;
  kg_por_cbm_lcl: number;
  desembolso_inclui_cif: boolean;
  seguro_completo_base: 'CUSTO_TOTAL' | 'CIF_IMPOSTOS';
  contato_forvm: string;
}

// Valores conferidos nas simulações FORVM: 1 NCM → R$ 154,23; 2 NCMs → R$ 192,79;
// AFRMM marítimo = 8% do frete + R$ 20,00.
export const DEFAULT_SETTINGS: Settings = {
  siscomex_di_brl: 115.67,
  siscomex_adicoes: [
    { ate: 2, valor: 38.56 },
    { ate: 5, valor: 30.85 },
    { ate: 10, valor: 23.14 },
    { ate: 20, valor: 15.42 },
    { ate: 50, valor: 7.71 },
    { ate: null, valor: 3.86 },
  ],
  seguro_pct: 0.15,
  afrmm_pct: 8,
  afrmm_taxa_fixa_brl: 20,
  fator_cubagem_aereo: 167,
  kg_por_cbm_lcl: 1000,
  desembolso_inclui_cif: true,
  seguro_completo_base: 'CUSTO_TOTAL',
  contato_forvm: 'comercial@forvm.com.br · (47) 3433-0641',
};

/** Taxa Siscomex: valor por DI + valor por adição conforme a faixa (uma adição por NCM). */
export function siscomexFor(adicoes: number, s: Settings): number {
  let total = s.siscomex_di_brl;
  for (let a = 1; a <= Math.max(1, adicoes); a++) {
    const faixa = s.siscomex_adicoes.find((f) => f.ate == null || a <= f.ate);
    total += faixa?.valor ?? 0;
  }
  return Math.round(total * 100) / 100;
}

export interface IcmsOverride {
  aliquota_efetiva?: number | null;
  divisor?: number | null;
  aliquota_credito?: number | null;
  incluir_ipi?: boolean;
  calc_dif_ipi?: boolean;
}

/** Formulário do estudo — o que o usuário informa. Persistido como "inputs". */
export interface StudyForm {
  client_id: number;
  title: string;
  finalidade: Finalidade;
  currency: Moeda;
  rates: Partial<Record<Moeda, number>>;
  seguro_tipo: SeguroTipo;
  /**
   * Produtos do estudo. `finalidade` e `icms_condition_id` são por produto; vazios seguem
   * a finalidade do estudo e a sugestão automática (EX → Lista CAMEX; senão regime + finalidade).
   */
  items: {
    product_id: number;
    value: number;
    quantity: number | null;
    ex_tarifario: boolean;
    finalidade?: Finalidade | null;
    icms_condition_id?: number | null;
  }[];
  freight_profile_id: number;
  cargo: { peso_kg: number | null; volume_m3: number | null; containers: number | null };
  carga_especial: boolean;
  storage_table_id: number | null;
  /** Dias de armazenagem além do 1º período da tabela. */
  storage_dias_extras: number;
  /** Volumes/pallets para cobranças por unidade (picking). */
  storage_volumes: number | null;
  /** Ids das linhas opcionais marcadas (vazio = as que vêm marcadas por padrão). */
  storage_opcionais: string[] | null;
  frete_nacional_brl: number | null;
  /** Ajustes de parâmetros por condição de ICMS (chave = id da condição). */
  icms_overrides: Record<string, IcmsOverride>;
  siscomex_brl: number | null;
  /** Só a FORVM: honorários deste estudo em R$ (vazio = negociação do cliente). */
  honorarios_manual_brl?: number | null;
}

export interface StudyDetail {
  id: number;
  reference: string;
  client_id: number;
  company_name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  created_by_name: string | null;
  title: string | null;
  form: StudyForm;
  // Tipos completos em calc.ts; aqui como unknown para evitar dependência circular.
  input: unknown;
  result: unknown;
}

export interface StudySummary {
  id: number;
  reference: string;
  client_id: number;
  company_name: string;
  created_at: string;
  created_by_name: string | null;
  title: string | null;
  modal: string | null;
  origem: string | null;
  finalidade: string | null;
  moeda: string | null;
  fob: number | null;
  desembolso: number;
  custo_liquido: number;
}
