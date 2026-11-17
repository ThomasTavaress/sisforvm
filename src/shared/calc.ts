// Motor de cálculo FORVM — simulação de custos de importação por Conta e Ordem.
// Implementa motor-calculo-saida.md. Função pura e determinística, executada no
// navegador (prévia instantânea) e no servidor (valor oficial ao salvar).
// Percentuais chegam em pontos percentuais (1.4 = 1,4%); o divisor como fração (0.96).

import type { Finalidade, Incoterm, Modal, Moeda, Regime, SeguroTipo, Settings, StorageLine } from './domain.ts';
import { FINALIDADES, MODAIS, REGIMES, SEGURO_TIPOS, isMaritimo } from './domain.ts';
import { brl, money, num, pct } from './format.ts';

export class CalcError extends Error {}

/** II do produto: com EX-tarifário o II é zerado, salvo alíquota EX específica cadastrada no produto. */
export function iiAplicado(it: { ii: number; ii_ex: number | null; ex_tarifario: boolean }): number {
  return it.ex_tarifario ? (it.ii_ex ?? 0) : it.ii;
}

export interface CalcItem {
  product_id: number | null;
  code: string | null;
  description: string;
  ncm: string;
  value: number;
  quantity: number | null;
  ii: number;
  ii_ex: number | null;
  ipi: number;
  pis: number;
  cofins: number;
  ex_tarifario: boolean;
  aliquotas_confirmadas: boolean;
  /** Finalidade deste produto (pode diferir entre produtos do mesmo estudo). */
  finalidade: Finalidade;
  /** Condição de ICMS deste produto (ex.: EX/CAMEX num item, TTD revenda em outro). */
  icms: CalcIcms;
}

export interface CalcFreight {
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
  /** THC na moeda do frete (compõe o CIF e a base do AFRMM). */
  thc?: number;
  dest_fees_brl: number;
  transit_days: string | null;
}

export interface CalcStorage {
  name: string;
  linhas: StorageLine[];
  acrescimo_pct: number;
  validado: boolean;
  /** Dias além do 1º período. */
  dias_extras: number;
  /** Volumes/pallets para linhas por unidade. */
  volumes: number;
  /** Ids das linhas opcionais incluídas. */
  opcionais: string[];
  /** Peso bruto da carga (linhas por kg e "acima de X kg"). */
  peso_kg?: number;
  site_url?: string | null;
}

export interface StorageDetalhe {
  id: string;
  descricao: string;
  formula: string;
  valor: number;
}

/** Armazenagem pela tabela do terminal: soma das linhas × (1 + acréscimo). */
export function computeStorage(st: CalcStorage, cif: number): { total: number; subtotal: number; linhas: StorageDetalhe[] } {
  const out: StorageDetalhe[] = [];
  const dias = Math.max(0, Math.round(n(st.dias_extras)));
  const vol = Math.max(0, n(st.volumes));
  const peso = Math.max(0, n(st.peso_kg));
  for (const l of st.linhas) {
    if (l.opcional && !st.opcionais.includes(l.id)) continue;
    if (l.acima_kg != null && peso <= l.acima_kg) {
      out.push({ id: l.id, descricao: l.descricao, formula: `só para carga acima de ${num(l.acima_kg, 0)} kg (peso ${num(peso)} kg)`, valor: 0 });
      continue;
    }
    const taxa = p(n(l.pct));
    const min = n(l.minimo);
    let valor = 0;
    let formula = '';
    if (l.tipo === 'pct_cif') {
      const unit = Math.max(cif * taxa, min);
      const um = `máx(${brl(cif)} × ${pct(n(l.pct))}; ${brl(min)})`;
      if (l.aplica === 'adicional') {
        const q = l.dias_periodo ? Math.ceil(dias / l.dias_periodo) : dias;
        valor = unit * q;
        formula = q ? `${um} × ${q} ${l.dias_periodo ? 'período(s)' : 'dia(s)'}` : 'sem dias extras';
      } else {
        valor = unit;
        formula = um;
      }
    } else if (l.tipo === 'fixo') {
      valor = n(l.valor);
      formula = 'valor fixo';
    } else if (l.tipo === 'por_unidade') {
      // como na planilha: o mínimo vale mesmo sem volumes informados (ex.: picking Poly R$ 121,61)
      valor = Math.max(n(l.valor) * vol, min);
      formula = min ? `máx(${brl(n(l.valor))} × ${num(vol, 0)}; ${brl(min)})` : vol > 0 ? `${brl(n(l.valor))} × ${num(vol, 0)}` : 'sem volumes informados';
    } else if (l.tipo === 'faixa_cif') {
      const faixas = [...(l.faixas ?? [])].sort((a, b) => a.ate_dias - b.ate_dias);
      if (faixas.length) {
        const totalDias = faixas[0].ate_dias + dias;
        const f = faixas.find((x) => totalDias <= x.ate_dias);
        let taxaFaixa: number;
        let txt: string;
        if (f) {
          taxaFaixa = f.pct;
          txt = `até ${f.ate_dias} dias úteis`;
        } else {
          const ult = faixas[faixas.length - 1];
          const extras = Math.ceil((totalDias - ult.ate_dias) / Math.max(1, n(l.adicional_dias) || 10));
          taxaFaixa = ult.pct + n(l.adicional_pct) * extras;
          txt = `${ult.ate_dias} dias + ${extras} × ${pct(n(l.adicional_pct))}`;
        }
        valor = Math.max(cif * p(taxaFaixa), min);
        formula = `${totalDias} dias úteis (${txt}) → ${pct(taxaFaixa)} × ${brl(cif)}${min ? `, mín. ${brl(min)}` : ''}`;
      }
    } else if (l.tipo === 'faixa_peso') {
      const faixas = [...(l.faixas_peso ?? [])].sort((a, b) => a.ate_kg - b.ate_kg);
      if (faixas.length) {
        const f = faixas.find((x) => peso <= x.ate_kg);
        let base: number;
        let txt: string;
        if (f) {
          base = f.valor;
          txt = `faixa até ${num(f.ate_kg, 0)} kg: ${brl(f.valor)}`;
        } else {
          const ult = faixas[faixas.length - 1];
          const blocos = Math.ceil((peso - ult.ate_kg) / Math.max(1, n(l.adicional_kg) || 1000));
          base = ult.valor + blocos * n(l.adicional_valor);
          txt = `${brl(ult.valor)} + ${blocos} × ${brl(n(l.adicional_valor))} (acima de ${num(ult.ate_kg, 0)} kg)`;
        }
        const mult = n(l.multiplicador) || 1;
        valor = Math.max(base * mult, min);
        formula = `${num(peso)} kg → ${txt}${mult !== 1 ? ` × ${num(mult, 0)}` : ''}${min ? `, mín. ${brl(min)}` : ''}`;
      }
    } else if (l.tipo === 'por_kg') {
      valor = Math.max(n(l.valor) * peso, min);
      formula = `máx(${num(peso)} kg × R$ ${num(n(l.valor), 4)}; ${brl(min)})`;
    } else if (l.tipo === 'pct_subtotal') {
      const base = sum(out.filter((d) => !l.sobre?.length || l.sobre.includes(d.id)), (d) => d.valor);
      valor = base * taxa;
      formula = `${pct(n(l.pct))} × ${brl(base)}`;
    }
    out.push({ id: l.id, descricao: l.descricao, formula, valor });
  }
  const subtotal = sum(out, (d) => d.valor);
  return { total: subtotal * (1 + p(n(st.acrescimo_pct))), subtotal, linhas: out };
}

export interface CalcIcms {
  code: string;
  label: string;
  aliquota_efetiva: number;
  divisor: number;
  aliquota_credito: number;
  incluir_ipi: boolean;
  calc_dif_ipi: boolean;
  validado: boolean;
  ajustes_manuais: string[];
}

export interface CalcInput {
  regime: Regime;
  currency: Moeda;
  rates: Partial<Record<Moeda, number>>;
  items: CalcItem[];
  freight: CalcFreight;
  cargo: { peso_kg: number | null; volume_m3: number | null; containers: number | null };
  seguro_tipo: SeguroTipo;
  siscomex_brl: number;
  siscomex_adicoes: number;
  siscomex_alterado: boolean;
  despacho_brl: number;
  honorarios: { fixo: number; pct: number; min: number };
  /** Honorários informados à mão pela FORVM neste estudo (substituem a negociação do cliente). */
  honorarios_manual?: boolean;
  frete_nacional_brl: number;
  storage: CalcStorage | null;
  settings: Settings;
}

export interface MemoriaLinha {
  grupo: string;
  descricao: string;
  formula: string;
  valor: number;
}
export interface Alerta {
  nivel: 'info' | 'atencao';
  texto: string;
  /** Só a equipe FORVM vê (removido nas respostas ao cliente). */
  privado?: boolean;
}

export interface ItemResult {
  descricao: string;
  codigo: string | null;
  ncm: string;
  quantidade: number | null;
  valor_moeda: number;
  participacao: number;
  ex_tarifario: boolean;
  finalidade: string;
  icms: { code: string; label: string; aliquota_efetiva: number; divisor: number; aliquota_credito: number; incluir_ipi: boolean };
  aliquotas: { ii: number; ipi: number; pis: number; cofins: number };
  cif: number;
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  despesas_rateadas: number;
  base_icms_inicial: number;
  base_icms_final: number;
  icms_pago: number;
  icms_destaque: number;
  ipi_saida: number;
  dif_ipi: number;
  creditos: { icms: number; ipi: number; pis: number; cofins: number; total: number };
  custo_total: number;
  custo_liquido_total: number;
  custo_unitario: number | null;
}

export interface IcmsGrupo extends CalcIcms {
  itens: string[];
  base_inicial: number;
  base_final: number;
  icms_pago: number;
  icms_destaque: number;
}

export interface CalcResult {
  dados_gerais: {
    ncms: string[];
    moeda: Moeda;
    taxa: number;
    moeda_frete: Moeda;
    taxa_frete: number;
    modal: string;
    modal_code: Modal;
    origem: string;
    origem_detalhe: string | null;
    destino_detalhe: string | null;
    peso_bruto_kg: number | null;
    adicoes: number;
    incoterm: Incoterm;
    transit_days: string | null;
    finalidade: string;
    regime: string;
    condicao_icms: string;
  };
  frete: {
    perfil: string;
    quantidade: number;
    unidade: string;
    detalhe: string;
    tarifa: number;
    minimo: number;
    minimo_aplicado: boolean;
    frete_base_moeda: number;
    custos_origem_moeda: number;
    total_moeda: number;
    total_brl: number;
  };
  cif: {
    mercadoria_moeda: number;
    mercadoria_brl: number;
    frete_moeda: number;
    frete_brl: number;
    thc_moeda: number;
    thc_brl: number;
    seguro_tipo: string;
    seguro_moeda: number;
    seguro_brl: number;
    total_moeda: number;
    total_brl: number;
  };
  impostos: { ii: number; ipi: number; pis: number; cofins: number; siscomex: number; total: number };
  despesas: { despacho: number; taxas_destino: number; armazenagem: number; honorarios: number; afrmm: number; total: number };
  icms: { base_inicial: number; base_final: number; icms_pago: number; icms_destaque: number; ipi_saida: number };
  /** ICMS agrupado por condição (um grupo por condição usada nos produtos). */
  icms_condicoes: IcmsGrupo[];
  conta_ordem: { icms_pago: number; dif_ipi: number; frete_nacional: number; total: number };
  desembolso: { inclui_cif: boolean; cif: number; impostos: number; despesas: number; conta_ordem: number; total: number };
  creditos: { icms: number; ipi: number; pis: number; cofins: number; total: number };
  custo_liquido: number;
  custo_total: number;
  custo_total_liquido: number;
  itens: ItemResult[];
  memoria: MemoriaLinha[];
  alertas: Alerta[];
}

const p = (v: number) => (Number(v) || 0) / 100;
// Como na planilha FORVM: cálculo em precisão total, exibição em centavos.
// Exceção: o AFRMM é truncado em centavos (conferido nas simulações WIND e EUROMAC).
const trunc2 = (v: number) => Math.floor(v * 100 + 1e-7) / 100;
const n = (v: number | null | undefined) => (Number.isFinite(v as number) ? (v as number) : 0);
const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0);

export function chargeableQuantity(modal: Modal, cargo: CalcInput['cargo'], s: Settings) {
  const kg = n(cargo.peso_kg);
  const m3 = n(cargo.volume_m3);
  if (modal === 'AEREO') {
    const cubado = m3 * s.fator_cubagem_aereo;
    return {
      qty: Math.max(kg, cubado),
      unit: 'kg taxável',
      detail: `máx(peso bruto ${num(kg)} kg; cubado ${num(m3, 3)} m³ × ${num(s.fator_cubagem_aereo, 0)} = ${num(cubado)} kg)`,
    };
  }
  if (modal === 'LCL') {
    const t = kg / s.kg_por_cbm_lcl;
    return {
      qty: Math.max(m3, t),
      unit: 'CBM (W/M)',
      detail: `máx(volume ${num(m3, 3)} m³; peso ${num(kg)} kg ÷ ${num(s.kg_por_cbm_lcl, 0)} = ${num(t, 3)})`,
    };
  }
  const c = Math.max(0, Math.round(n(cargo.containers)));
  return { qty: c, unit: modal === 'FCL20' ? "container 20'" : "container 40'", detail: `${c} container(s)` };
}

interface Core {
  cif: number;
  itens: ItemResult[];
  impostos: CalcResult['impostos'];
  despesas: CalcResult['despesas'];
  despesasBaseIcms: number;
  baseHonorarios: number;
  icms: CalcResult['icms'];
  icms_condicoes: IcmsGrupo[];
  conta_ordem: CalcResult['conta_ordem'];
  creditos: CalcResult['creditos'];
  custo_total: number;
}

export function computeStudy(input: CalcInput): CalcResult {
  const s = input.settings;
  const items = input.items.filter((i) => n(i.value) > 0);
  if (!items.length) throw new CalcError('Informe ao menos um produto com valor maior que zero.');
  const rate = (cur: Moeda) => {
    const v = n(input.rates[cur]);
    if (!(v > 0)) throw new CalcError(`Informe a taxa de câmbio do dia para ${cur}.`);
    return v;
  };
  for (const it of items) {
    if (!(it.icms.divisor > 0 && it.icms.divisor <= 1)) throw new CalcError(`O divisor do ICMS de "${it.description}" deve ser maior que 0 e no máximo 1.`);
  }

  const rateGoods = rate(input.currency);
  const fobMoeda = sum(items, (i) => i.value);
  const fobBRL = (fobMoeda * rateGoods);

  const f = input.freight;
  const charge = chargeableQuantity(f.modal, input.cargo, s);
  if (!(charge.qty > 0)) {
    throw new CalcError(f.modal === 'FCL20' || f.modal === 'FCL40' ? 'Informe a quantidade de containers.' : 'Informe o peso bruto e/ou o volume da carga.');
  }
  const rateFreight = rate(f.currency);
  const freteTarifado = f.rate * charge.qty;
  const freteBaseMoeda = Math.max(freteTarifado, n(f.min_charge));
  const freteMoeda = freteBaseMoeda + n(f.origin_fees);
  const freteBRL = (freteMoeda * rateFreight);
  const thcMoeda = n(f.thc);
  const thcBRL = thcMoeda * rateFreight;
  // AFRMM: (frete + THC) × % — planilha "ARMAZENAGEM & AFRMM" da FORVM.
  const afrmmBase = isMaritimo(f.modal) ? ((freteBaseMoeda + thcMoeda) * rateFreight) : 0;

  const core = (seguro: number): Core => runCore(input, items, fobMoeda, (fobBRL + freteBRL + thcBRL + seguro), afrmmBase);

  // Seguro internacional: calculado na moeda da mercadoria e convertido (como na planilha FORVM).
  const seguroRate = p(s.seguro_pct);
  let seguroBRL = (seguroRate * (fobMoeda + (freteMoeda * rateFreight) / rateGoods) * rateGoods);
  let c = core(seguroBRL);
  if (input.seguro_tipo === 'COMPLETO') {
    const base = (x: Core) =>
      s.seguro_completo_base === 'CIF_IMPOSTOS' ? x.cif + x.impostos.ii + x.impostos.ipi + x.impostos.pis + x.impostos.cofins : x.custo_total;
    for (let k = 0; k < 30; k++) {
      const next = (seguroRate * base(c));
      if (Math.abs(next - seguroBRL) < 1e-9) break;
      seguroBRL = next;
      c = core(seguroBRL);
    }
  }

  const incluiCif = s.desembolso_inclui_cif;
  const desembolsoTotal = c.custo_total - (incluiCif ? 0 : c.cif);
  const custoLiquido = desembolsoTotal - c.creditos.total;
  const toGoods = (brlV: number) => brlV / rateGoods;

  const result: CalcResult = {
    dados_gerais: {
      ncms: [...new Set(items.map((i) => i.ncm).filter(Boolean))],
      moeda: input.currency,
      taxa: rateGoods,
      moeda_frete: f.currency,
      taxa_frete: rateFreight,
      modal: MODAIS[f.modal],
      modal_code: f.modal,
      origem: f.origin_country,
      origem_detalhe: f.origin_detail,
      destino_detalhe: f.dest_detail ?? null,
      peso_bruto_kg: input.cargo.peso_kg ?? null,
      adicoes: input.siscomex_adicoes,
      incoterm: f.incoterm,
      transit_days: f.transit_days,
      finalidade: [...new Set(items.map((i) => FINALIDADES[i.finalidade]))].join(' + '),
      regime: REGIMES[input.regime],
      condicao_icms: c.icms_condicoes.map((g) => g.label).join(' + '),
    },
    frete: {
      perfil: f.label,
      quantidade: charge.qty,
      unidade: charge.unit,
      detalhe: charge.detail,
      tarifa: f.rate,
      minimo: n(f.min_charge),
      minimo_aplicado: freteTarifado < n(f.min_charge),
      frete_base_moeda: freteBaseMoeda,
      custos_origem_moeda: n(f.origin_fees),
      total_moeda: freteMoeda,
      total_brl: freteBRL,
    },
    cif: {
      mercadoria_moeda: fobMoeda,
      mercadoria_brl: fobBRL,
      frete_moeda: toGoods(freteBRL),
      frete_brl: freteBRL,
      thc_moeda: toGoods(thcBRL),
      thc_brl: thcBRL,
      seguro_tipo: SEGURO_TIPOS[input.seguro_tipo],
      seguro_moeda: toGoods(seguroBRL),
      seguro_brl: seguroBRL,
      total_moeda: toGoods(c.cif),
      total_brl: c.cif,
    },
    impostos: c.impostos,
    despesas: c.despesas,
    icms: c.icms,
    icms_condicoes: c.icms_condicoes,
    conta_ordem: c.conta_ordem,
    desembolso: {
      inclui_cif: incluiCif,
      cif: incluiCif ? c.cif : 0,
      impostos: c.impostos.total,
      despesas: c.despesas.total,
      conta_ordem: c.conta_ordem.total,
      total: desembolsoTotal,
    },
    creditos: c.creditos,
    custo_liquido: custoLiquido,
    custo_total: c.custo_total,
    custo_total_liquido: c.custo_total - c.creditos.total,
    itens: c.itens,
    memoria: [],
    alertas: [],
  };
  result.memoria = buildMemoria(input, result, { fobMoeda, rateGoods, rateFreight, freteTarifado, seguroRate, despesasBaseIcms: c.despesasBaseIcms, baseHonorarios: c.baseHonorarios, afrmmBase });
  result.alertas = buildAlertas(input, items, result);
  return result;
}

function runCore(input: CalcInput, items: CalcItem[], fobMoeda: number, cif: number, afrmmBase: number): Core {
  const s = input.settings;
  const { regime } = input;

  const siscomex = (input.siscomex_brl);
  // AFRMM: % sobre o frete marítimo + taxa fixa (R$ 20,00 nas simulações FORVM).
  const afrmm = afrmmBase > 0 ? trunc2(afrmmBase * p(s.afrmm_pct)) + n(s.afrmm_taxa_fixa_brl) : 0;
  const despacho = (n(input.despacho_brl));
  const taxasDestino = (n(input.freight.dest_fees_brl));
  let armazenagem = 0;
  if (input.storage) armazenagem = computeStorage(input.storage, cif).total;

  // Honorários FORVM = fixo + máx(% negociado × base do ICMS; mínimo).
  // A base é a base do ICMS por dentro (soma das bases finais de cada produto, cada uma
  // com o seu divisor), calculada ANTES de incluir os próprios honorários — conferido na
  // planilha WIND: 1% × R$ 134.999,31 = R$ 1.349,99.
  const despesasSemHon = despacho + siscomex + armazenagem + afrmm + taxasDestino;
  const baseHonorarios = items.reduce((acc, it) => {
    const share = it.value / fobMoeda;
    const cifI = cif * share;
    const ii = cifI * p(iiAplicado(it));
    const ipi = (cifI + ii) * p(it.ipi);
    const b0 = cifI + ii + cifI * p(it.pis) + cifI * p(it.cofins) + despesasSemHon * share + (it.icms.incluir_ipi ? ipi : 0);
    return acc + b0 / it.icms.divisor;
  }, 0);
  const h = input.honorarios;
  const honorarios = n(h.fixo) + (n(h.pct) > 0 || n(h.min) > 0 ? Math.max(baseHonorarios * p(h.pct), n(h.min)) : 0);
  const freteNacional = (n(input.frete_nacional_brl));
  // Frete rodoviário nacional NUNCA compõe a base do ICMS.
  const despesasBaseIcms = despacho + siscomex + armazenagem + honorarios + afrmm + taxasDestino;
  const despesasNaoTributo = despacho + taxasDestino + armazenagem + honorarios + afrmm;

  const itens: ItemResult[] = items.map((it) => {
    // Cada produto usa a sua condição de ICMS; despesas e CIF rateados pela participação no valor.
    const icms = it.icms;
    const finalidade = it.finalidade;
    const ef = p(icms.aliquota_efetiva);
    const cred = p(icms.aliquota_credito);
    const share = it.value / fobMoeda;
    const cifI = cif * share;
    const iiRate = iiAplicado(it);
    const ii = (cifI * p(iiRate));
    const ipi = ((cifI + ii) * p(it.ipi));
    const pis = (cifI * p(it.pis));
    const cofins = (cifI * p(it.cofins));
    const despI = despesasBaseIcms * share;
    const baseIni = cifI + ii + pis + cofins + despI + (icms.incluir_ipi ? ipi : 0);
    const baseFin = baseIni / icms.divisor;
    const icmsPago = (baseFin * ef);
    const icmsDestaque = (baseFin * cred);
    const ipiSaida = (baseFin * p(it.ipi));
    const difIpi = icms.calc_dif_ipi ? (ipiSaida - ipi) : 0;

    const credIcms = regime !== 'SIMPLES' ? icmsDestaque : 0;
    const credIpi = regime !== 'SIMPLES' && finalidade !== 'ATIVO' ? (icms.calc_dif_ipi ? ipiSaida : ipi) : 0;
    const credPis = regime === 'LUCRO_REAL' ? pis : 0;
    const credCofins = regime === 'LUCRO_REAL' ? cofins : 0;
    const credTotal = credIcms + credIpi + credPis + credCofins;

    const custoTotal = cifI + ii + ipi + pis + cofins + (siscomex + despesasNaoTributo + freteNacional) * share + icmsPago + difIpi;
    const qty = it.quantity && it.quantity > 0 ? it.quantity : null;
    return {
      descricao: it.description,
      codigo: it.code,
      ncm: it.ncm,
      quantidade: qty,
      valor_moeda: it.value,
      participacao: share,
      ex_tarifario: it.ex_tarifario,
      finalidade: FINALIDADES[finalidade],
      icms: { code: icms.code, label: icms.label, aliquota_efetiva: icms.aliquota_efetiva, divisor: icms.divisor, aliquota_credito: icms.aliquota_credito, incluir_ipi: icms.incluir_ipi },
      aliquotas: { ii: iiRate, ipi: it.ipi, pis: it.pis, cofins: it.cofins },
      cif: cifI,
      ii,
      ipi,
      pis,
      cofins,
      despesas_rateadas: despI,
      base_icms_inicial: baseIni,
      base_icms_final: baseFin,
      icms_pago: icmsPago,
      icms_destaque: icmsDestaque,
      ipi_saida: ipiSaida,
      dif_ipi: difIpi,
      creditos: { icms: credIcms, ipi: credIpi, pis: credPis, cofins: credCofins, total: credTotal },
      custo_total: custoTotal,
      custo_liquido_total: custoTotal - credTotal,
      custo_unitario: qty ? (custoTotal - credTotal) / qty : null,
    };
  });

  const t = (k: 'ii' | 'ipi' | 'pis' | 'cofins' | 'base_icms_inicial' | 'base_icms_final' | 'icms_pago' | 'icms_destaque' | 'ipi_saida' | 'dif_ipi') => sum(itens, (i) => i[k]);
  const impostos = { ii: t('ii'), ipi: t('ipi'), pis: t('pis'), cofins: t('cofins'), siscomex, total: 0 };
  impostos.total = impostos.ii + impostos.ipi + impostos.pis + impostos.cofins + siscomex;
  const despesas = { despacho, taxas_destino: taxasDestino, armazenagem, honorarios, afrmm, total: despesasNaoTributo };
  const icmsPago = t('icms_pago');
  const difIpi = t('dif_ipi');
  const conta_ordem = { icms_pago: icmsPago, dif_ipi: difIpi, frete_nacional: freteNacional, total: icmsPago + difIpi + freteNacional };
  const creditos = {
    icms: sum(itens, (i) => i.creditos.icms),
    ipi: sum(itens, (i) => i.creditos.ipi),
    pis: sum(itens, (i) => i.creditos.pis),
    cofins: sum(itens, (i) => i.creditos.cofins),
    total: sum(itens, (i) => i.creditos.total),
  };
  // Agrupa por condição de ICMS (mesma condição + mesmos parâmetros = mesmo grupo).
  const grupos = new Map<string, IcmsGrupo>();
  items.forEach((it, k) => {
    const ic = it.icms;
    const key = [ic.code, ic.aliquota_efetiva, ic.divisor, ic.aliquota_credito, ic.incluir_ipi, ic.calc_dif_ipi].join('|');
    const g = grupos.get(key) ?? { ...ic, itens: [], base_inicial: 0, base_final: 0, icms_pago: 0, icms_destaque: 0 };
    const r = itens[k];
    g.itens.push(r.descricao);
    g.base_inicial += r.base_icms_inicial;
    g.base_final += r.base_icms_final;
    g.icms_pago += r.icms_pago;
    g.icms_destaque += r.icms_destaque;
    grupos.set(key, g);
  });

  return {
    cif,
    itens,
    impostos,
    despesas,
    despesasBaseIcms,
    baseHonorarios,
    icms: {
      base_inicial: t('base_icms_inicial'),
      base_final: t('base_icms_final'),
      icms_pago: icmsPago,
      icms_destaque: t('icms_destaque'),
      ipi_saida: t('ipi_saida'),
    },
    icms_condicoes: [...grupos.values()],
    conta_ordem,
    creditos,
    custo_total: cif + impostos.total + despesasNaoTributo + conta_ordem.total,
  };
}

// ---------- Memória de cálculo ----------
function buildMemoria(
  input: CalcInput,
  r: CalcResult,
  x: { fobMoeda: number; rateGoods: number; rateFreight: number; freteTarifado: number; seguroRate: number; despesasBaseIcms: number; baseHonorarios: number; afrmmBase: number },
): MemoriaLinha[] {
  const m: MemoriaLinha[] = [];
  const add = (grupo: string, descricao: string, formula: string, valor: number) => m.push({ grupo, descricao, formula, valor });
  const s = input.settings;
  const M = input.currency;
  const F = input.freight.currency;
  const multi = r.itens.length > 1;
  const label = (i: ItemResult) => (multi ? ` — ${i.descricao}` : '');

  // CIF
  add('CIF', 'Mercadoria', `${money(M, x.fobMoeda)} × ${num(x.rateGoods, 4)}`, r.cif.mercadoria_brl);
  add('CIF', 'Quantidade tarifável do frete', r.frete.detalhe, r.frete.quantidade);
  add(
    'CIF',
    'Frete internacional (moeda)',
    `máx(${money(F, input.freight.rate)} × ${num(r.frete.quantidade, 3)} = ${num(x.freteTarifado)}; mínimo ${num(r.frete.minimo)})${r.frete.custos_origem_moeda ? ` + custos na origem ${num(r.frete.custos_origem_moeda)}` : ''}`,
    r.frete.total_moeda,
  );
  add('CIF', 'Frete internacional (R$)', `${money(F, r.frete.total_moeda)} × ${num(x.rateFreight, 4)}`, r.frete.total_brl);
  if (input.seguro_tipo === 'SIMPLES') {
    add('CIF', 'Seguro (simples)', `${pct(s.seguro_pct)} × (${brl(r.cif.mercadoria_brl)} + ${brl(r.cif.frete_brl)})`, r.cif.seguro_brl);
  } else {
    const baseTxt = s.seguro_completo_base === 'CIF_IMPOSTOS' ? 'CIF + II + IPI + PIS + COFINS' : 'custo total do processo';
    add('CIF', 'Seguro (completo)', `${pct(s.seguro_pct)} × ${baseTxt} (cálculo iterativo até convergir)`, r.cif.seguro_brl);
  }
  if (r.cif.thc_brl) add('CIF', 'THC', `${money(F, n(input.freight.thc))} × ${num(x.rateFreight, 4)}`, r.cif.thc_brl);
  add('CIF', 'Valor CIF', `${brl(r.cif.mercadoria_brl)} + ${brl(r.cif.frete_brl)}${r.cif.thc_brl ? ` + THC ${brl(r.cif.thc_brl)}` : ''} + ${brl(r.cif.seguro_brl)}`, r.cif.total_brl);
  if (multi) for (const i of r.itens) add('CIF', `Rateio do CIF${label(i)}`, `${brl(r.cif.total_brl)} × ${num(i.participacao * 100, 4)}% (participação no valor)`, i.cif);

  // Nacionalização
  for (const i of r.itens) {
    add('Impostos', `II${label(i)}`, `${brl(i.cif)} × ${pct(i.aliquotas.ii)}${i.ex_tarifario ? ' (EX-tarifário)' : ''}`, i.ii);
    add('Impostos', `IPI${label(i)}`, `(${brl(i.cif)} + ${brl(i.ii)}) × ${pct(i.aliquotas.ipi)}`, i.ipi);
    add('Impostos', `PIS${label(i)}`, `${brl(i.cif)} × ${pct(i.aliquotas.pis)}`, i.pis);
    add('Impostos', `COFINS${label(i)}`, `${brl(i.cif)} × ${pct(i.aliquotas.cofins)}`, i.cofins);
  }
  add(
    'Impostos',
    'Taxa Siscomex',
    input.siscomex_alterado
      ? 'valor informado manualmente'
      : `${brl(s.siscomex_di_brl)} por DI + ${input.siscomex_adicoes} adição(ões) conforme faixa (uma por NCM)`,
    r.impostos.siscomex,
  );

  // Despesas
  add('Despesas', 'Despacho aduaneiro', 'cadastro do cliente', r.despesas.despacho);
  add('Despesas', 'Taxas no destino', `perfil de frete "${input.freight.label}"`, r.despesas.taxas_destino);
  if (input.storage) {
    const st = input.storage;
    const det = computeStorage(st, r.cif.total_brl);
    for (const d of det.linhas) add('Armazenagem', d.descricao, d.formula, d.valor);
    add('Armazenagem', `Total ${st.name}`, `subtotal ${brl(det.subtotal)} + acréscimo ${pct(st.acrescimo_pct)}`, r.despesas.armazenagem);
  } else add('Despesas', 'Armazenagem', 'não considerada', 0);
  const h = input.honorarios;
  add(
    'Despesas',
    'Honorários FORVM',
    input.honorarios_manual ? 'valor informado manualmente pela FORVM' : [h.fixo ? brl(h.fixo) : '', h.pct || h.min ? `máx(${pct(h.pct)} × base do ICMS sem honorários ${brl(x.baseHonorarios)}; mínimo ${brl(h.min)})` : ''].filter(Boolean).join(' + ') || 'não cobrado',
    r.despesas.honorarios,
  );
  add(
    'Despesas',
    'AFRMM',
    isMaritimo(input.freight.modal) ? `${brl(x.afrmmBase)} (frete marítimo${n(input.freight.thc) ? ' + THC' : ''}, sem custos de origem) × ${pct(s.afrmm_pct)} (truncado) + taxa fixa ${brl(s.afrmm_taxa_fixa_brl)}` : 'modal aéreo: não incide',
    r.despesas.afrmm,
  );

  // ICMS — calculado produto a produto, cada um com a sua condição.
  if (multi) add('ICMS', 'Despesas na base do ICMS (total a ratear)', 'despacho + Siscomex + armazenagem + honorários + AFRMM + taxas no destino', x.despesasBaseIcms);
  for (const i of r.itens) {
    const ic = i.icms;
    const L = label(i);
    add(
      'ICMS',
      `Base inicial${L}`,
      `CIF ${brl(i.cif)} + II ${brl(i.ii)} + PIS ${brl(i.pis)} + COFINS ${brl(i.cofins)} + despesas ${brl(i.despesas_rateadas)}${multi ? ` (${num(i.participacao * 100, 2)}% do total)` : ''}${ic.incluir_ipi ? ` + IPI ${brl(i.ipi)}` : ''}`,
      i.base_icms_inicial,
    );
    add('ICMS', `Base final${L}`, `${brl(i.base_icms_inicial)} ÷ ${num(ic.divisor, 4)} (${ic.label})`, i.base_icms_final);
    add('ICMS', `ICMS pago${L}`, `${brl(i.base_icms_final)} × ${pct(ic.aliquota_efetiva)} (alíquota efetiva)`, i.icms_pago);
    add('ICMS', `ICMS destacado${L}`, `${brl(i.base_icms_final)} × ${pct(ic.aliquota_credito)}`, i.icms_destaque);
    add('ICMS', `IPI de saída${L}`, `${brl(i.base_icms_final)} × ${pct(i.aliquotas.ipi)}`, i.ipi_saida);
    if (i.dif_ipi) add('ICMS', `Diferença de IPI${L}`, `${brl(i.ipi_saida)} − ${brl(i.ipi)}`, i.dif_ipi);
  }
  if (multi) add('ICMS', 'ICMS pago (total)', r.icms_condicoes.map((g) => `${g.label} ${brl(g.icms_pago)}`).join(' + '), r.icms.icms_pago);

  // Totais
  add('Totais', 'Custo total do processo', 'CIF + impostos + despesas + ICMS + dif. IPI + frete nacional', r.custo_total);
  add('Totais', 'Desembolso total', r.desembolso.inclui_cif ? 'custo total do processo (inclui CIF)' : 'custo total − CIF', r.desembolso.total);
  add('Totais', 'Créditos', `ICMS ${brl(r.creditos.icms)} + IPI ${brl(r.creditos.ipi)} + PIS ${brl(r.creditos.pis)} + COFINS ${brl(r.creditos.cofins)}`, r.creditos.total);
  add('Totais', 'Custo líquido final', `${brl(r.desembolso.total)} − ${brl(r.creditos.total)}`, r.custo_liquido);
  return m;
}

// ---------- Alertas ----------
function buildAlertas(input: CalcInput, items: CalcItem[], r: CalcResult): Alerta[] {
  const a: Alerta[] = [];
  const at = (texto: string, privado = false) => a.push({ nivel: 'atencao', texto, privado });
  const info = (texto: string) => a.push({ nivel: 'info', texto });
  for (const g of r.icms_condicoes) {
    if (!g.validado) at(`A condição de ICMS "${g.label}" ainda não foi validada pela FORVM. Confirme os parâmetros antes de usar o resultado.`);
    if (g.ajustes_manuais.length) at(`Condição "${g.label}" com parâmetros ajustados manualmente: ${g.ajustes_manuais.join(', ')}.`);
  }
  if (input.storage && !input.storage.validado) at(`A tabela de armazenagem "${input.storage.name}" ainda não foi validada pela FORVM.`);
  if (input.storage?.site_url) at(`A FORVM calcula a armazenagem de "${input.storage.name}" pelo site do terminal (${input.storage.site_url}); o valor da tabela é uma estimativa.`);
  if (input.storage) info(`Armazenagem pela tabela "${input.storage.name}"${input.storage.dias_extras ? ` com ${input.storage.dias_extras} dia(s) além do 1º período` : " (1º período)"}, com acréscimo de ${pct(input.storage.acrescimo_pct)}.`);
  for (const it of items) {
    if (!it.aliquotas_confirmadas) at(`Produto "${it.description}" (NCM ${it.ncm}): alíquotas ainda não conferidas pela FORVM.`);
    if (it.ex_tarifario) info(`Produto "${it.description}" com EX-tarifário: II ${pct(iiAplicado(it))} (normal ${pct(it.ii)}).`);
  }
  if (r.conta_ordem.dif_ipi < 0) at('A diferença de IPI ficou negativa. Revise as alíquotas e a base de cálculo.');
  if (r.frete.minimo_aplicado) info(`Foi aplicado o frete mínimo (${money(input.freight.currency, r.frete.minimo)}).`);
  if (input.siscomex_alterado) at(`Siscomex alterado manualmente para ${brl(input.siscomex_brl)}.`);
  if (input.honorarios_manual) at(`Honorários FORVM informados manualmente neste estudo: ${brl(r.despesas.honorarios)} (negociação do cliente não aplicada).`, true);

  for (const g of r.icms_condicoes) {
    info(
      `ICMS ${g.label} (efetiva ${pct(g.aliquota_efetiva)}, divisor ${num(g.divisor, 4)}, destaque ${pct(g.aliquota_credito)}${g.incluir_ipi ? ', IPI na base' : ''})${r.itens.length > 1 ? `: ${g.itens.join(', ')}` : ''}.`,
    );
  }
  if (r.itens.length > 1) info('Frete, seguro e despesas rateados entre os produtos pela participação de cada um no valor da mercadoria.');
  info(`Frete internacional estimado pelo perfil "${input.freight.label}"; sujeito a cotação.`);
  info(`Seguro calculado por padrão: ${SEGURO_TIPOS[input.seguro_tipo]}.`);
  if (!input.storage) info('Armazenagem não considerada (nenhuma tabela selecionada).');
  if (!input.frete_nacional_brl) info('Frete rodoviário nacional não informado.');
  if (input.regime === 'SIMPLES') info('Simples Nacional: sem aproveitamento de créditos de ICMS, IPI, PIS e COFINS.');
  if (input.regime === 'LUCRO_PRESUMIDO') info('Lucro Presumido: PIS e COFINS cumulativos, sem crédito. ICMS e IPI creditados.');
  if (items.some((i) => i.finalidade === 'ATIVO') && input.regime !== 'SIMPLES') {
    info('Ativo imobilizado: crédito de ICMS apropriado via CIAP em 48 parcelas; IPI não creditado.');
    if (input.regime === 'LUCRO_REAL') info('Ativo imobilizado: crédito de PIS/COFINS normalmente apropriado sobre a depreciação; exibido pelo valor integral.');
  }
  info(r.desembolso.inclui_cif ? 'O desembolso total inclui o valor CIF (mercadoria + frete + seguro).' : 'O desembolso total não inclui o valor CIF; a mercadoria aparece apenas no custo total do processo.');
  info('Simulação gerencial com valores estimados. Não substitui a validação fiscal da FORVM.');
  return a;
}
