// Converte o formulário do estudo + cadastros em CalcInput.
// Usado pelo navegador (prévia) e pelo servidor (valor oficial), garantindo
// que as mesmas regras — inclusive quem pode ajustar o ICMS — valham nos dois.

import type { CalcIcms, CalcInput } from './calc.ts';
import { CalcError } from './calc.ts';
import type { Client, Finalidade, FreightProfile, IcmsCondition, IcmsOverride, Product, Settings, StorageTable, StudyForm } from './domain.ts';
import { siscomexFor, storageModalOf } from './domain.ts';

export interface BuildContext {
  role: 'admin' | 'cliente';
  client: Client;
  products: Product[];
  freights: FreightProfile[];
  storages: StorageTable[];
  conditions: IcmsCondition[];
  settings: Settings;
}

const ICMS_LABELS = {
  aliquota_efetiva: 'alíquota efetiva',
  divisor: 'divisor',
  aliquota_credito: 'alíquota de destaque/crédito',
  incluir_ipi: 'IPI na base',
  calc_dif_ipi: 'diferença de IPI',
} as const;

const given = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Quem pode editar quais parâmetros da condição de ICMS. */
export function icmsEditability(cond: IcmsCondition, role: 'admin' | 'cliente') {
  const admin = role === 'admin';
  return {
    efetiva: admin || cond.user_editable,
    divisor: admin,
    credito: admin,
    flags: admin,
  };
}

export function resolveIcms(cond: IcmsCondition, override: IcmsOverride | undefined, role: 'admin' | 'cliente'): CalcIcms {
  const ed = icmsEditability(cond, role);
  const ajustes: string[] = [];
  let efetiva = cond.aliquota_efetiva;
  let divisor = cond.divisor;
  let credito = cond.aliquota_credito;
  let incluirIpi = cond.incluir_ipi;
  let difIpi = cond.calc_dif_ipi;
  const ov = override ?? {};

  if (ed.efetiva && given(ov.aliquota_efetiva) && ov.aliquota_efetiva !== efetiva) {
    efetiva = ov.aliquota_efetiva;
    // Na condição "sem TTD" o usuário informa a alíquota — é o uso previsto, não um ajuste.
    if (!cond.user_editable) ajustes.push(ICMS_LABELS.aliquota_efetiva);
  }
  if (efetiva == null) throw new CalcError(`Informe a alíquota efetiva do ICMS (${cond.label}).`);

  if (cond.auto_divisor) {
    divisor = Math.round((1 - efetiva / 100) * 1e6) / 1e6;
    credito = efetiva;
  }
  if (ed.divisor && given(ov.divisor) && ov.divisor !== divisor) {
    divisor = ov.divisor;
    ajustes.push(ICMS_LABELS.divisor);
  }
  if (ed.credito && given(ov.aliquota_credito) && ov.aliquota_credito !== credito) {
    credito = ov.aliquota_credito;
    ajustes.push(ICMS_LABELS.aliquota_credito);
  }
  if (ed.flags && typeof ov.incluir_ipi === 'boolean' && ov.incluir_ipi !== incluirIpi) {
    incluirIpi = ov.incluir_ipi;
    ajustes.push(ICMS_LABELS.incluir_ipi);
  }
  if (ed.flags && typeof ov.calc_dif_ipi === 'boolean' && ov.calc_dif_ipi !== difIpi) {
    difIpi = ov.calc_dif_ipi;
    ajustes.push(ICMS_LABELS.calc_dif_ipi);
  }
  if (divisor == null) throw new CalcError(`A condição "${cond.label}" não tem divisor definido.`);
  return {
    code: cond.code,
    label: cond.label,
    aliquota_efetiva: efetiva,
    divisor,
    aliquota_credito: credito ?? 0,
    incluir_ipi: incluirIpi,
    calc_dif_ipi: difIpi,
    validado: cond.validado,
    ajustes_manuais: ajustes,
  };
}

/** Sugere a condição de ICMS pela situação tributária, finalidade e EX-tarifário. */
export function suggestCondition(conditions: IcmsCondition[], client: Client, finalidade: Finalidade, hasEx: boolean): IcmsCondition | null {
  const active = conditions.filter((c) => c.active).sort((a, b) => a.sort - b.sort || a.id - b.id);
  const scope = client.tax_regime === 'SIMPLES' ? 'SIMPLES' : 'NORMAL';
  if (hasEx) {
    const ex = active.find((c) => c.ex_tarifario);
    if (ex) return ex;
  }
  return (
    active.find((c) => c.regime_scope === scope && c.finalidade === finalidade && !c.user_editable) ??
    active.find((c) => c.regime_scope === 'TODOS' && c.finalidade === finalidade && !c.user_editable) ??
    active.find((c) => c.user_editable) ??
    null
  );
}

export function buildCalcInput(form: StudyForm, ctx: BuildContext): CalcInput {
  if (form.carga_especial) throw new CalcError('Containers especiais e carga perigosa exigem cotação por fora. Fale com a FORVM.');

  const items = form.items.filter((i) => i.product_id);
  if (!items.length) throw new CalcError('Adicione ao menos um produto.');
  const calcItems = items.map((i) => {
    const prod = ctx.products.find((p) => p.id === i.product_id && p.client_id === ctx.client.id);
    if (!prod) throw new CalcError('Há um produto que não pertence a este cliente ou foi removido.');
    return {
      product_id: prod.id,
      code: prod.code,
      description: prod.description,
      ncm: prod.ncm,
      value: Number(i.value) || 0,
      quantity: i.quantity,
      ii: prod.ii,
      ii_ex: prod.ii_ex,
      ipi: prod.ipi,
      pis: prod.pis,
      cofins: prod.cofins,
      ex_tarifario: !!i.ex_tarifario,
      aliquotas_confirmadas: prod.confirmed,
      ...itemIcms(i, ctx, form),
    };
  });

  const fr = ctx.freights.find((f) => f.id === form.freight_profile_id && f.client_id === ctx.client.id);
  if (!fr) throw new CalcError('Selecione a opção de frete internacional.');

  let storage: CalcInput['storage'] = null;
  if (form.storage_table_id) {
    const st = ctx.storages.find((s) => s.id === form.storage_table_id);
    if (!st) throw new CalcError('A tabela de armazenagem selecionada não existe mais.');
    if (st.modal !== storageModalOf(fr.modal)) throw new CalcError('A tabela de armazenagem não corresponde ao modal do frete.');
    storage = {
      name: st.name,
      linhas: st.linhas,
      acrescimo_pct: st.acrescimo_pct,
      validado: st.validado,
      dias_extras: Math.max(0, Math.round(form.storage_dias_extras || 0)),
      volumes: Number(form.storage_volumes) || 0,
      // sem escolha explícita, valem as linhas opcionais marcadas como padrão
      opcionais: form.storage_opcionais ?? st.linhas.filter((l) => l.opcional && l.padrao).map((l) => l.id),
      peso_kg: Number(form.cargo.peso_kg) || 0,
      site_url: st.site_url ?? null,
    };
  }

  // Honorários manuais: só a FORVM; o cliente nunca consegue sobrepor a negociação.
  const honorariosManual = ctx.role === 'admin' && given(form.honorarios_manual_brl) && form.honorarios_manual_brl >= 0;
  const adicoes = new Set(calcItems.filter((i) => i.value > 0).map((i) => i.ncm)).size || 1;
  const siscomexPadrao = siscomexFor(adicoes, ctx.settings);
  const siscomexAlterado = ctx.role === 'admin' && given(form.siscomex_brl) && form.siscomex_brl !== siscomexPadrao;

  return {
    regime: ctx.client.tax_regime,
    currency: form.currency,
    rates: form.rates,
    items: calcItems,
    freight: {
      label: fr.label,
      modal: fr.modal,
      origin_country: fr.origin_country,
      origin_detail: fr.origin_detail,
      dest_detail: fr.dest_detail ?? null,
      incoterm: fr.incoterm,
      currency: fr.currency,
      rate: fr.rate,
      min_charge: fr.min_charge,
      origin_fees: fr.origin_fees,
      thc: fr.thc ?? 0,
      dest_fees_brl: fr.dest_fees_brl,
      transit_days: fr.transit_days,
    },
    cargo: form.cargo,
    seguro_tipo: form.seguro_tipo,
    siscomex_brl: siscomexAlterado ? (form.siscomex_brl as number) : siscomexPadrao,
    siscomex_adicoes: adicoes,
    siscomex_alterado: siscomexAlterado,
    despacho_brl: ctx.client.despacho_brl,
    ...(honorariosManual
      ? { honorarios: { fixo: form.honorarios_manual_brl as number, pct: 0, min: 0 }, honorarios_manual: true }
      : { honorarios: { fixo: ctx.client.honorarios_fixo, pct: ctx.client.honorarios_pct, min: ctx.client.honorarios_min } }),
    frete_nacional_brl: Number(form.frete_nacional_brl) || 0,
    storage,
    settings: ctx.settings,
  };
}

/**
 * Condição de ICMS efetiva de um produto: a escolhida no item ou a sugestão automática
 * (EX → Lista CAMEX; senão situação tributária + finalidade do produto).
 */
export function conditionForItem(item: StudyForm['items'][number], ctx: Pick<BuildContext, 'conditions' | 'client'>, form: Pick<StudyForm, 'finalidade'>): IcmsCondition | null {
  const finalidade = item.finalidade ?? form.finalidade;
  if (item.icms_condition_id) return ctx.conditions.find((c) => c.id === item.icms_condition_id && c.active) ?? null;
  return suggestCondition(ctx.conditions, ctx.client, finalidade, !!item.ex_tarifario);
}

function itemIcms(item: StudyForm['items'][number], ctx: BuildContext, form: StudyForm) {
  const cond = conditionForItem(item, ctx, form);
  if (!cond) throw new CalcError('Selecione a condição de ICMS de cada produto.');
  return { finalidade: item.finalidade ?? form.finalidade, icms: resolveIcms(cond, form.icms_overrides?.[String(cond.id)], ctx.role) };
}

/** Cenários alternativos: mesma carga com cada opção de frete da mesma origem. */
export function scenarioProfiles(ctx: BuildContext, current: FreightProfile): FreightProfile[] {
  return ctx.freights
    .filter((f) => f.active && f.client_id === ctx.client.id && f.origin_country === current.origin_country)
    .sort((a, b) => (a.modal + a.incoterm).localeCompare(b.modal + b.incoterm));
}

/** Tabela de armazenagem padrão para um modal (a primeira ativa). */
export function defaultStorageFor(ctx: BuildContext, fr: FreightProfile): StorageTable | null {
  return ctx.storages.find((s) => s.active && s.modal === storageModalOf(fr.modal)) ?? null;
}
