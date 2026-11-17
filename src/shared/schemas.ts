// Validação (zod) das entradas da API. Percentuais em pontos percentuais.
import { z } from 'zod';
import { FINALIDADES, FINALIDADE_SCOPES, INCOTERMS, MODAIS, MOEDAS, REGIMES, REGIME_SCOPES, SEGURO_TIPOS, STORAGE_MODAIS } from './domain.ts';

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const text = (max = 200) => z.string().trim().max(max);
const optText = (max = 500) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const money = z.number().finite().min(0).max(1e12);
const percent = z.number().finite().min(0).max(100);

export const clientSchema = z.object({
  company_name: text(160).min(2, 'Informe o nome da empresa.'),
  tax_regime: z.enum(keys(REGIMES)),
  city: optText(80),
  state: optText(2),
  cnpj: optText(20),
  sigla: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,3}$/, 'Sigla deve ter até 3 letras/números.').optional().default(''),
  despacho_brl: money.default(0),
  honorarios_fixo: money.default(0),
  honorarios_pct: percent.default(0),
  honorarios_min: money.default(0),
  notes: optText(1000),
  active: z.boolean().default(true),
});

export const userCreateSchema = z.object({
  username: text(60).min(3, 'Usuário deve ter ao menos 3 caracteres.').regex(/^[\w.@-]+$/, 'Use apenas letras, números, ponto, hífen, @ ou _.'),
  name: optText(120),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(200),
  role: z.enum(['admin', 'cliente']),
  client_id: z.number().int().positive().nullish(),
  active: z.boolean().default(true),
});
export const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().max(200).optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || v.length >= 8, 'A senha deve ter ao menos 8 caracteres.'),
});

export const freightSchema = z.object({
  client_id: z.number().int().positive(),
  label: text(120).min(1, 'Informe o nome da opção.'),
  modal: z.enum(keys(MODAIS)),
  origin_country: text(80).min(1, 'Informe o país de origem.'),
  origin_detail: optText(120),
  dest_detail: optText(120),
  incoterm: z.enum(INCOTERMS),
  currency: z.enum(MOEDAS),
  rate: money,
  min_charge: money.default(0),
  origin_fees: money.default(0),
  thc: money.default(0),
  dest_fees_brl: money.default(0),
  transit_days: optText(40),
  notes: optText(1000),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  client_id: z.number().int().positive(),
  code: optText(60),
  description: text(200).min(1, 'Informe a descrição.'),
  ncm: z.string().trim().regex(/^\d{4}\.?\d{2}\.?\d{2}$/, 'NCM deve ter 8 dígitos (ex.: 8501.52.10).').transform((v) => {
    const d = v.replace(/\D/g, '');
    return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  }),
  ii: percent,
  ii_ex: percent.nullish().transform((v) => (v == null ? null : v)),
  ipi: percent,
  pis: percent,
  cofins: percent,
  confirmed: z.boolean().default(false),
  notes: optText(1000),
  active: z.boolean().default(true),
});

export const storageSchema = z.object({
  name: text(120).min(1, 'Informe o nome.'),
  modal: z.enum(keys(STORAGE_MODAIS)),
  location: optText(120),
  linhas: z
    .array(
      z.object({
        id: z.string().trim().regex(/^[a-z0-9_-]{1,40}$/, 'Identificador de linha inválido.'),
        descricao: text(120).min(1, 'Toda linha precisa de descrição.'),
        tipo: z.enum(['pct_cif', 'fixo', 'por_unidade', 'pct_subtotal', 'faixa_cif', 'por_kg', 'faixa_peso']),
        pct: percent.nullish(),
        minimo: money.nullish(),
        valor: money.nullish(),
        aplica: z.enum(['primeiro', 'adicional']).optional(),
        dias_periodo: z.number().int().min(1).max(365).nullish(),
        sobre: z.array(z.string()).max(50).optional(),
        faixas: z.array(z.object({ ate_dias: z.number().int().min(1).max(3650), pct: percent })).max(20).optional(),
        adicional_pct: percent.nullish(),
        adicional_dias: z.number().int().min(1).max(365).nullish(),
        acima_kg: z.number().min(0).max(1e7).nullish(),
        faixas_peso: z.array(z.object({ ate_kg: z.number().positive().max(1e7), valor: money })).max(30).optional(),
        adicional_valor: money.nullish(),
        adicional_kg: z.number().positive().max(1e7).nullish(),
        multiplicador: z.number().positive().max(100).nullish(),
        opcional: z.boolean().optional(),
        padrao: z.boolean().optional(),
        obs: optText(200),
      }),
    )
    .max(60)
    .refine((l) => new Set(l.map((x) => x.id)).size === l.length, 'Há linhas repetidas na tabela.'),
  acrescimo_pct: percent.default(5),
  site_url: z.string().trim().url('Informe um endereço completo (https://…).').max(500).nullish().or(z.literal('')).transform((v) => v || null),
  validado: z.boolean().default(false),
  notes: optText(1000),
  active: z.boolean().default(true),
});

export const icmsSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, 'Código: letras maiúsculas, números e _.'),
  label: text(160).min(1, 'Informe o nome.'),
  regime_scope: z.enum(keys(REGIME_SCOPES)),
  finalidade: z.enum(keys(FINALIDADE_SCOPES)),
  ex_tarifario: z.boolean().default(false),
  aliquota_efetiva: percent.nullish().transform((v) => v ?? null),
  divisor: z.number().gt(0).max(1).nullish().transform((v) => v ?? null),
  aliquota_credito: percent.nullish().transform((v) => v ?? null),
  incluir_ipi: z.boolean().default(false),
  calc_dif_ipi: z.boolean().default(true),
  user_editable: z.boolean().default(false),
  auto_divisor: z.boolean().default(false),
  validado: z.boolean().default(false),
  sort: z.number().int().default(0),
  notes: optText(1000),
  active: z.boolean().default(true),
});

export const settingsSchema = z.object({
  siscomex_di_brl: money,
  siscomex_adicoes: z
    .array(z.object({ ate: z.number().int().positive().nullable(), valor: money }))
    .min(1)
    .max(20)
    .refine((l) => l[l.length - 1].ate === null, 'A última faixa do Siscomex deve valer para as demais adições (sem limite).')
    .refine((l) => l.every((f, i) => i === 0 || f.ate === null || (l[i - 1].ate ?? Infinity) < f.ate), 'As faixas do Siscomex devem estar em ordem crescente.'),
  seguro_pct: percent,
  afrmm_pct: percent,
  afrmm_taxa_fixa_brl: money,
  fator_cubagem_aereo: z.number().positive().max(1000),
  kg_por_cbm_lcl: z.number().positive().max(10000),
  desembolso_inclui_cif: z.boolean(),
  seguro_completo_base: z.enum(['CUSTO_TOTAL', 'CIF_IMPOSTOS']),
  contato_forvm: text(200),
});

const optNum = z.number().finite().nullish().transform((v) => (v == null ? null : v));

export const studyFormSchema = z.object({
  client_id: z.number().int().positive(),
  title: text(200).default(''),
  finalidade: z.enum(keys(FINALIDADES)),
  currency: z.enum(MOEDAS),
  rates: z.record(z.enum(MOEDAS), z.number().finite().nonnegative()).default({}),
  seguro_tipo: z.enum(keys(SEGURO_TIPOS)),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        value: z.number().finite().min(0),
        quantity: optNum,
        ex_tarifario: z.boolean().default(false),
        finalidade: z.enum(keys(FINALIDADES)).nullish().transform((v) => v ?? null),
        icms_condition_id: z.number().int().positive().nullish().transform((v) => v ?? null),
      }),
    )
    .min(1, 'Adicione ao menos um produto.')
    .max(200),
  freight_profile_id: z.number().int().positive({ message: 'Selecione o frete internacional.' }),
  cargo: z.object({ peso_kg: optNum, volume_m3: optNum, containers: optNum }),
  carga_especial: z.boolean().default(false),
  storage_table_id: z.number().int().positive().nullish().transform((v) => v ?? null),
  storage_dias_extras: z.number().int().min(0).max(365).default(0),
  storage_volumes: optNum,
  storage_opcionais: z.array(z.string().max(40)).max(60).nullish().transform((v) => v ?? null),
  frete_nacional_brl: optNum,
  icms_overrides: z
    .record(
      z.string().regex(/^\d+$/),
      z.object({
        aliquota_efetiva: optNum.optional(),
        divisor: optNum.optional(),
        aliquota_credito: optNum.optional(),
        incluir_ipi: z.boolean().optional(),
        calc_dif_ipi: z.boolean().optional(),
      }),
    )
    .default({}),
  siscomex_brl: optNum,
  honorarios_manual_brl: optNum.optional(),
});

export const loginSchema = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });
export const passwordSchema = z.object({ current: z.string().min(1), next: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres.').max(200) });
