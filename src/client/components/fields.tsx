import { FINALIDADE_SCOPES, INCOTERMS, MODAIS, MOEDAS, REGIMES, REGIME_SCOPES, UFS, freightUnitLabel, type FreightProfile, type Product } from '../../shared/domain.ts';
import { brl, money, pct } from '../../shared/format.ts';
import type { Column, FieldDef } from './Crud.tsx';
import { Tag } from './ui.tsx';

const opts = (o: Record<string, string>): [string, string][] => Object.entries(o);

export const clientFields: FieldDef[] = [
  { name: 'company_name', label: 'Nome da empresa', required: true, full: true },
  { name: 'sigla', label: 'Sigla', maxLength: 3, help: 'Usada na referência dos estudos (ex.: FAS05). Vazio = 3 primeiras letras do nome.' },
  { name: 'tax_regime', label: 'Situação tributária', type: 'select', required: true, options: opts(REGIMES) },
  { name: 'cnpj', label: 'CNPJ' },
  { name: 'city', label: 'Cidade' },
  { name: 'state', label: 'UF', type: 'select', options: UFS.map((u) => [u, u]) },
  { name: 'despacho_brl', label: 'Despacho aduaneiro (R$)', type: 'number', decimals: 2 },
  { name: 'honorarios_pct', label: 'Honorários FORVM (% da base do ICMS)', type: 'number', help: 'Negociação do cliente. Ex.: 1 = 1% da base do ICMS por dentro (antes dos honorários).' },
  { name: 'honorarios_min', label: 'Honorários mínimos (R$)', type: 'number', decimals: 2, help: 'Cobrado quando o % da base for menor. Ex.: R$ 950,00.' },
  { name: 'honorarios_fixo', label: 'Honorários fixos adicionais (R$)', type: 'number', decimals: 2, help: 'Opcional: somado ao valor acima, ou use só ele para cliente com valor fixo.' },
  { name: 'active', label: 'Cliente ativo', type: 'checkbox' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export const freightFields: FieldDef[] = [
  { name: 'label', label: 'Nome da opção', required: true, help: 'Ex.: China Aéreo FOB' },
  { name: 'modal', label: 'Modal', type: 'select', required: true, options: [['AEREO', 'Aéreo (por kg taxável)'], ['LCL', 'Marítimo LCL (por CBM)'], ['FCL20', "Marítimo FCL 20' (por container)"], ['FCL40', "Marítimo FCL 40' (por container)"]] },
  { name: 'origin_country', label: 'País de origem', required: true },
  { name: 'origin_detail', label: 'Porto / aeroporto de origem', help: 'Ex.: Porto de Shenzhen' },
  { name: 'dest_detail', label: 'Porto / aeroporto de destino', help: 'Ex.: Porto de Navegantes' },
  { name: 'incoterm', label: 'Incoterm', type: 'select', required: true, options: INCOTERMS.map((i) => [i, i]) },
  { name: 'currency', label: 'Moeda', type: 'select', required: true, options: MOEDAS.map((m) => [m, m]) },
  { name: 'rate', label: 'Tarifa por unidade', type: 'number', required: true, help: 'Por kg taxável, CBM ou container.' },
  { name: 'min_charge', label: 'Frete mínimo', type: 'number' },
  { name: 'origin_fees', label: 'Custos na origem', type: 'number', help: 'Coleta e despacho de exportação (EXW/FCA).' },
  { name: 'thc', label: 'THC (moeda do frete)', type: 'number', help: 'Compõe o CIF e a base do AFRMM: (frete + THC) × 8% + R$ 20.' },
  { name: 'dest_fees_brl', label: 'Taxas no destino estimadas (R$)', type: 'number', decimals: 2 },
  { name: 'transit_days', label: 'Transit time (dias)' },
  { name: 'active', label: 'Ativa', type: 'checkbox' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export const freightColumns: Column<FreightProfile>[] = [
  { label: 'Opção', render: (r) => <b>{r.label}</b> },
  { label: 'Modal', render: (r) => MODAIS[r.modal] },
  { label: 'Origem → destino', render: (r) => `${[r.origin_detail, r.origin_country].filter(Boolean).join(' · ')}${r.dest_detail ? ` → ${r.dest_detail}` : ''}` },
  { label: 'Incoterm', render: (r) => r.incoterm },
  { label: 'Tarifa', num: true, render: (r) => `${money(r.currency, r.rate)} / ${freightUnitLabel(r.modal)}` },
  { label: 'Mínimo', num: true, render: (r) => money(r.currency, r.min_charge) },
  { label: 'Origem (custos)', num: true, render: (r) => money(r.currency, r.origin_fees) },
  { label: 'Destino', num: true, render: (r) => brl(r.dest_fees_brl) },
  { label: 'Transit', render: (r) => (r.transit_days ? `${r.transit_days} dias` : '—') },
];

export const productFields = (admin: boolean): FieldDef[] => [
  { name: 'code', label: 'Código interno' },
  { name: 'description', label: 'Descrição', required: true },
  { name: 'ncm', label: 'NCM', required: true, help: '8 dígitos, ex.: 8501.52.10' },
  { name: 'ii', label: 'II (%)', type: 'number', required: true },
  { name: 'ii_ex', label: 'II com EX-tarifário (%)', type: 'number', nullable: true, help: 'Com EX o II é zerado. Preencha só se o EX tiver alíquota diferente de 0%.' },
  { name: 'ipi', label: 'IPI (%)', type: 'number', required: true },
  { name: 'pis', label: 'PIS-importação (%)', type: 'number', required: true },
  { name: 'cofins', label: 'COFINS-importação (%)', type: 'number', required: true },
  ...(admin
    ? ([
        { name: 'confirmed', label: 'Alíquotas conferidas pela FORVM', type: 'checkbox' },
        { name: 'active', label: 'Ativo', type: 'checkbox' },
      ] as FieldDef[])
    : []),
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export const productColumns: Column<Product>[] = [
  { label: 'Código', render: (r) => r.code ?? '' },
  { label: 'Descrição', render: (r) => <b>{r.description}</b> },
  { label: 'NCM', render: (r) => <span className="mono">{r.ncm}</span> },
  {
    label: 'II',
    num: true,
    render: (r) => (
      <>
        {pct(r.ii)}
        {r.ii_ex != null && <Tag>EX {pct(r.ii_ex)}</Tag>}
      </>
    ),
  },
  { label: 'IPI', num: true, render: (r) => pct(r.ipi) },
  { label: 'PIS', num: true, render: (r) => pct(r.pis) },
  { label: 'COFINS', num: true, render: (r) => pct(r.cofins) },
  { label: 'Conferência', render: (r) => (r.confirmed ? <Tag kind="ok">Conferido</Tag> : <Tag kind="warn">A conferir</Tag>) },
];

export const icmsFields: FieldDef[] = [
  { name: 'code', label: 'Código', required: true, help: 'Ex.: NORMAL_REVENDA' },
  { name: 'label', label: 'Nome', required: true },
  { name: 'regime_scope', label: 'Regime', type: 'select', required: true, options: opts(REGIME_SCOPES) },
  { name: 'finalidade', label: 'Finalidade', type: 'select', required: true, options: opts(FINALIDADE_SCOPES) },
  { name: 'aliquota_efetiva', label: 'Alíquota efetiva (%)', type: 'number', nullable: true },
  { name: 'divisor', label: 'Divisor (ex.: 0,96)', type: 'number', decimals: 6, nullable: true },
  { name: 'aliquota_credito', label: 'Alíquota de destaque/crédito (%)', type: 'number', nullable: true },
  { name: 'sort', label: 'Ordem de exibição', type: 'number', decimals: 0 },
  { name: 'ex_tarifario', label: 'Sugerir quando houver EX-tarifário', type: 'checkbox' },
  { name: 'incluir_ipi', label: 'IPI entra na base do ICMS', type: 'checkbox' },
  { name: 'calc_dif_ipi', label: 'Calcular diferença de IPI', type: 'checkbox' },
  { name: 'user_editable', label: 'Cliente informa a alíquota (sem TTD)', type: 'checkbox' },
  { name: 'auto_divisor', label: 'Divisor = 1 − alíquota', type: 'checkbox' },
  { name: 'validado', label: 'Parâmetros validados', type: 'checkbox' },
  { name: 'active', label: 'Ativa', type: 'checkbox' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];
