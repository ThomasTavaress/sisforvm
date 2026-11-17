import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { conditionForItem, suggestCondition, type BuildContext } from '../../shared/build.ts';
import type { CalcResult } from '../../shared/calc.ts';
import {
  FINALIDADES, MODAIS, MOEDAS, REGIMES, SEGURO_TIPOS, freightUnitLabel, siscomexFor, storageModalOf,
  type Client, type FreightProfile, type IcmsCondition, type IcmsOverride, type Modal, type Moeda, type Product, type StorageTable, type StudyDetail, type StudyForm,
} from '../../shared/domain.ts';
import { brl, money, num, pct } from '../../shared/format.ts';
import { NumberInput } from '../components/NumberInput.tsx';
import { Alertas, Memoria, ReportBody } from '../components/Report.tsx';
import { Alert, Card, Loading, PageHeader, Tag } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useData, useDocumentTitle } from '../lib/hooks.ts';
import { useAuth, useSession } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';

type Item = StudyForm['items'][number];
const emptyItem = (): Item => ({ product_id: 0, value: 0, quantity: null, ex_tarifario: false });

const blankForm = (clientId: number): StudyForm => ({
  client_id: clientId,
  title: '',
  finalidade: 'REVENDA',
  currency: 'USD',
  rates: {},
  seguro_tipo: 'SIMPLES',
  items: [emptyItem()],
  freight_profile_id: 0,
  cargo: { peso_kg: null, volume_m3: null, containers: 1 },
  carga_especial: false,
  storage_table_id: null,
  storage_dias_extras: 0,
  storage_volumes: null,
  storage_opcionais: null,
  frete_nacional_brl: null,
  icms_overrides: {},
  siscomex_brl: null,
});

export function StudyNew() {
  useDocumentTitle('Novo estudo');
  const { isAdmin, user, settings, client: ownClient } = useAuth();
  const { refresh: refreshSession } = useSession();
  const [params] = useSearchParams();
  const fromId = params.get('de');
  const nav = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<StudyForm>(() => blankForm(isAdmin ? Number(params.get('cliente')) || 0 : user.client_id!));
  // Condições de ICMS que o admin está ajustando manualmente (ids).
  const [adjusting, setAdjusting] = useState<number[]>([]);
  const [storageTouched, setStorageTouched] = useState(false);
  const [fromRef, setFromRef] = useState<string | null>(null);
  const [tab, setTab] = useState<'resultado' | 'memoria'>('resultado');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ptaxBusy, setPtaxBusy] = useState<string | null>(null);

  const clients = useData<Client[]>(isAdmin ? '/api/clients' : null);
  const conds = useData<IcmsCondition[]>('/api/icms_conditions');
  const storages = useData<StorageTable[]>('/api/storage_tables');
  const scope = form.client_id ? (isAdmin ? `?client_id=${form.client_id}` : '') : null;
  const products = useData<Product[]>(scope === null ? null : `/api/products${scope}`);
  const freights = useData<FreightProfile[]>(scope === null ? null : `/api/freight_profiles${scope}`);
  const source = useData<StudyDetail>(fromId ? `/api/studies/${fromId}` : null);

  const client: Client | null = isAdmin ? (clients.data?.find((c) => c.id === form.client_id) ?? null) : ownClient;
  const activeProducts = useMemo(() => (products.data ?? []).filter((p) => p.active), [products.data]);
  const activeFreights = useMemo(() => (freights.data ?? []).filter((f) => f.active), [freights.data]);

  const ctx: BuildContext | null = useMemo(
    () =>
      client && conds.data && storages.data && products.data && freights.data
        ? { role: isAdmin ? 'admin' : 'cliente', client, products: activeProducts, freights: activeFreights, storages: storages.data, conditions: conds.data, settings }
        : null,
    [client, conds.data, storages.data, products.data, freights.data, activeProducts, activeFreights, isAdmin, settings],
  );

  // Duplicar estudo: carrega o formulário salvo.
  useEffect(() => {
    if (!source.data) return;
    const f = source.data.form;
    setForm({ ...f, items: f.items.map((i) => ({ ...i })) });
    setFromRef(source.data.reference);
    setStorageTouched(true);
    if (isAdmin)
      setAdjusting(
        Object.entries(f.icms_overrides ?? {})
          .filter(([, o]) => Object.keys(o).some((k) => ['divisor', 'aliquota_credito', 'incluir_ipi', 'calc_dif_ipi'].includes(k)))
          .map(([id]) => Number(id)),
      );
  }, [source.data, isAdmin]);

  const freight = activeFreights.find((f) => f.id === form.freight_profile_id) ?? null;

  // Escolhe automaticamente um frete válido (prefere FOB).
  useEffect(() => {
    if (!freights.data || freight || !activeFreights.length) return;
    const pick = activeFreights.find((f) => f.incoterm === 'FOB') ?? activeFreights[0];
    setForm((s) => ({ ...s, freight_profile_id: pick.id }));
  }, [freights.data, freight, activeFreights]);

  // Armazenagem coerente com o modal.
  useEffect(() => {
    if (!freight || !storages.data) return;
    const sm = storageModalOf(freight.modal);
    const cur = storages.data.find((s) => s.id === form.storage_table_id);
    if (cur && cur.modal === sm) return;
    if (cur || !storageTouched) {
      // prefere uma tabela validada; exemplos "a validar" só se não houver outra
      const def = storages.data.find((s) => s.active && s.modal === sm && s.validado) ?? storages.data.find((s) => s.active && s.modal === sm);
      setForm((s) => ({ ...s, storage_table_id: def?.id ?? null }));
    }
  }, [freight, storages.data, form.storage_table_id, storageTouched]);

  // Ajustes enviados: sem TTD → só a alíquota efetiva; demais só quando o admin marcou "ajustar".
  const effectiveForm = useMemo((): StudyForm => {
    const overrides: StudyForm['icms_overrides'] = {};
    for (const [id, o] of Object.entries(form.icms_overrides)) {
      const c = conds.data?.find((x) => x.id === Number(id));
      if (!c) continue;
      if (isAdmin && adjusting.includes(c.id)) overrides[id] = o;
      else if (c.user_editable && o.aliquota_efetiva != null) overrides[id] = { aliquota_efetiva: o.aliquota_efetiva };
    }
    return { ...form, items: form.items.filter((i) => i.product_id), icms_overrides: overrides };
  }, [form, conds.data, adjusting, isAdmin]);

  // Resultado ao vivo: calculado no servidor (o cliente nunca recebe a negociação da FORVM).
  const [calc, setCalc] = useState<{ result?: CalcResult; error?: string }>({});
  const previewKey = JSON.stringify(effectiveForm);
  useEffect(() => {
    if (!effectiveForm.client_id || !effectiveForm.items.length) {
      setCalc({ error: 'Adicione ao menos um produto.' });
      return;
    }
    let ativo = true;
    const t = setTimeout(() => {
      api
        .post<CalcResult>('/api/studies/preview', effectiveForm)
        .then((result) => ativo && setCalc({ result }))
        .catch((e: Error) => ativo && setCalc({ error: e.message }));
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // Condições de ICMS em uso, com os produtos de cada uma.
  const usedConds = useMemo(() => {
    if (!ctx) return [];
    const map = new Map<number, { cond: IcmsCondition; itens: string[] }>();
    for (const it of form.items) {
      if (!it.product_id) continue;
      const c = conditionForItem(it, ctx, form);
      if (!c) continue;
      const name = activeProducts.find((p) => p.id === it.product_id)?.description ?? '';
      const e = map.get(c.id) ?? { cond: c, itens: [] };
      e.itens.push(name);
      map.set(c.id, e);
    }
    return [...map.values()];
  }, [ctx, form, activeProducts]);

  const currencies = [...new Set([form.currency, freight?.currency].filter(Boolean))] as Moeda[];

  // ---------- atualizadores ----------
  const patch = (p: Partial<StudyForm>) => setForm((s) => ({ ...s, ...p }));
  const patchItem = (i: number, p: Partial<Item>) => setForm((s) => ({ ...s, items: s.items.map((it, k) => (k === i ? { ...it, ...p } : it)) }));

  const selectFreight = (by: { modal?: Modal; origin?: string; incoterm?: string; id?: number }) => {
    if (by.id) return patch({ freight_profile_id: by.id });
    const modal = by.modal ?? freight?.modal;
    const origin = by.origin ?? freight?.origin_country;
    const inc = by.incoterm ?? freight?.incoterm;
    const cand = activeFreights.filter((f) => f.modal === modal);
    const pick =
      cand.find((f) => f.origin_country === origin && f.incoterm === inc) ??
      cand.find((f) => f.origin_country === origin && f.incoterm === 'FOB') ??
      cand.find((f) => f.origin_country === origin) ??
      (by.origin ? activeFreights.find((f) => f.origin_country === by.origin && f.incoterm === 'FOB') ?? activeFreights.find((f) => f.origin_country === by.origin) : undefined) ??
      cand[0];
    if (pick) patch({ freight_profile_id: pick.id });
  };

  const fetchPtax = async (m: Moeda) => {
    setPtaxBusy(m);
    try {
      const r = await api.get<{ venda: number; data: string }>(`/api/ptax/${m}`);
      setForm((s) => ({ ...s, rates: { ...s.rates, [m]: r.venda } }));
      toast(`PTAX ${m} (venda) ${num(r.venda, 4)} · ${r.data.slice(0, 16)}`);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setPtaxBusy(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await api.post<{ id: number; reference: string }>('/api/studies', effectiveForm);
      toast(`Estudo ${r.reference} salvo.`);
      void refreshSession(); // atualiza a sequência (próxima referência)
      void clients.reload();
      nav(`/estudos/${r.id}`);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  };

  // ---------- render ----------
  const loadingBase = conds.loading || storages.loading || (isAdmin && clients.loading) || (!!fromId && source.loading);
  if (loadingBase) return <Loading />;

  const modals = [...new Set(activeFreights.map((f) => f.modal))];
  const origins = [...new Set(activeFreights.filter((f) => f.modal === freight?.modal).map((f) => f.origin_country))];
  const incoterms = [...new Set(activeFreights.filter((f) => f.modal === freight?.modal && f.origin_country === freight?.origin_country).map((f) => f.incoterm))];
  const options = activeFreights.filter((f) => f.modal === freight?.modal && f.origin_country === freight?.origin_country && f.incoterm === freight?.incoterm);
  const stOptions = (storages.data ?? []).filter((s) => s.active && freight && s.modal === storageModalOf(freight.modal));
  const stTable = stOptions.find((s) => s.id === form.storage_table_id) ?? null;
  const isFcl = freight?.modal === 'FCL20' || freight?.modal === 'FCL40';
  // Siscomex automático: uma adição por NCM distinta.
  const adicoes = new Set(form.items.filter((i) => i.product_id && i.value > 0).map((i) => activeProducts.find((p) => p.id === i.product_id)?.ncm)).size || 1;
  const siscomexPadrao = siscomexFor(adicoes, settings);
  const r = calc.result;

  return (
    <>
      <PageHeader
        title="Novo estudo de custos"
        sub={
          <>
            {fromRef && (
              <>
                Duplicado de <b className="ref">{fromRef}</b> ·{' '}
              </>
            )}
            Referência gerada ao salvar{client ? <>: próxima <b className="ref">{client.sigla}{String(client.study_seq + 1).padStart(2, '0')}</b></> : ''}.
          </>
        }
      />
      <div className="sim">
        <div className="sim-form">
          <Card title="Dados gerais">
            <div className="form-grid">
              {isAdmin && (
                <div className="field">
                  <label htmlFor="cli">Cliente</label>
                  <select
                    id="cli"
                    value={form.client_id || ''}
                    onChange={(e) => {
                      setAdjusting([]);
                      setStorageTouched(false);
                      setForm({ ...blankForm(Number(e.target.value)), rates: form.rates, currency: form.currency });
                    }}
                  >
                    <option value="">Selecione…</option>
                    {clients.data?.filter((c) => c.active).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="tit">Descrição do estudo</label>
                <input id="tit" value={form.title} placeholder="Opcional (ex.: Pedido 4512)" maxLength={200} onChange={(e) => patch({ title: e.target.value })} />
              </div>
              <div className="field">
                <label>Situação tributária</label>
                <input value={client ? REGIMES[client.tax_regime] : ''} readOnly tabIndex={-1} />
              </div>
              <div className="field">
                <label htmlFor="fin">Finalidade</label>
                <select id="fin" value={form.finalidade} onChange={(e) => patch({ finalidade: e.target.value as StudyForm['finalidade'] })}>
                  {Object.entries(FINALIDADES).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="moe">Moeda da mercadoria</label>
                <select id="moe" value={form.currency} onChange={(e) => patch({ currency: e.target.value as Moeda })}>
                  {MOEDAS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="seg">Seguro internacional</label>
                <select id="seg" value={form.seguro_tipo} onChange={(e) => patch({ seguro_tipo: e.target.value as StudyForm['seguro_tipo'] })}>
                  {Object.entries(SEGURO_TIPOS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rates">
              {currencies.map((m) => (
                <div className="field rate" key={m}>
                  <label htmlFor={`rate-${m}`}>Taxa do dia · {m} (R$)</label>
                  <div className="input-btn">
                    <NumberInput id={`rate-${m}`} value={form.rates[m] ?? null} decimals={4} placeholder="0,0000" onChange={(v) => setForm((s) => ({ ...s, rates: { ...s.rates, [m]: v ?? undefined } }))} />
                    <button type="button" className="btn small secondary" disabled={ptaxBusy === m} onClick={() => fetchPtax(m)}>
                      {ptaxBusy === m ? '…' : 'PTAX'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Produtos">
            {!client ? (
              <p className="help">Selecione o cliente.</p>
            ) : products.loading ? (
              <Loading />
            ) : !activeProducts.length ? (
              <Alert kind="warn">
                Nenhum produto cadastrado. <Link to={isAdmin ? `/admin/clientes/${client.id}/produtos` : '/produtos'}>Cadastrar produto</Link>
              </Alert>
            ) : (
              <>
                <div className="items">
                  {form.items.map((it, i) => {
                    const p = activeProducts.find((x) => x.id === it.product_id);
                    return (
                      <div className="item" key={i}>
                        <div className="field grow">
                          <label htmlFor={`p-${i}`}>Produto {form.items.length > 1 ? i + 1 : ''}</label>
                          <select id={`p-${i}`} value={it.product_id || ''} onChange={(e) => patchItem(i, { product_id: Number(e.target.value), ex_tarifario: false })}>
                            <option value="">Selecione…</option>
                            {activeProducts.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.code ? `${x.code} · ` : ''}
                                {x.description}
                              </option>
                            ))}
                          </select>
                          {p && (
                            <span className="help">
                              NCM <b className="mono">{p.ncm}</b> · II {pct(it.ex_tarifario ? (p.ii_ex ?? 0) : p.ii)} · IPI {pct(p.ipi)} · PIS {pct(p.pis)} · COFINS {pct(p.cofins)}{' '}
                              {!p.confirmed && <Tag kind="warn">a conferir</Tag>}
                            </span>
                          )}
                        </div>
                        <div className="field money">
                          <label htmlFor={`v-${i}`}>Valor ({form.currency})</label>
                          <NumberInput id={`v-${i}`} value={it.value || null} fixed onChange={(v) => patchItem(i, { value: v ?? 0 })} className="right" />
                        </div>
                        <div className="field qty">
                          <label htmlFor={`q-${i}`}>Qtd.</label>
                          <NumberInput id={`q-${i}`} value={it.quantity} decimals={3} placeholder="opc." onChange={(v) => patchItem(i, { quantity: v })} className="right" />
                        </div>
                        <label className="field check ex" title="Possui EX-tarifário: II zerado">
                          <input type="checkbox" checked={it.ex_tarifario} disabled={!p} onChange={(e) => patchItem(i, { ex_tarifario: e.target.checked })} />
                          <span>EX</span>
                        </label>
                        {form.items.length > 1 && (
                          <button type="button" className="icon-btn danger" aria-label={`Remover produto ${i + 1}`} onClick={() => patch({ items: form.items.filter((_, k) => k !== i) })}>
                            ×
                          </button>
                        )}
                        {p && ctx && <ItemTax item={it} index={i} ctx={ctx} form={form} onChange={(x) => patchItem(i, x)} />}
                      </div>
                    );
                  })}
                </div>
                <div className="row-between">
                  <button type="button" className="btn small secondary" onClick={() => patch({ items: [...form.items, emptyItem()] })}>
                    + Adicionar produto
                  </button>
                  <Link className="help" to={isAdmin ? `/admin/clientes/${client.id}/produtos` : '/produtos'}>
                    Cadastrar novo produto
                  </Link>
                </div>
              </>
            )}
          </Card>

          <Card title="Frete internacional">
            {client && !freights.loading && !activeFreights.length ? (
              <Alert kind="warn">Nenhuma opção de frete cadastrada para este cliente. A FORVM precisa pré-configurar os fretes.</Alert>
            ) : freight ? (
              <>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="mod">Modal</label>
                    <select id="mod" value={freight.modal} onChange={(e) => selectFreight({ modal: e.target.value as Modal })}>
                      {modals.map((m) => (
                        <option key={m} value={m}>
                          {MODAIS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ori">Origem</label>
                    <select id="ori" value={freight.origin_country} onChange={(e) => selectFreight({ origin: e.target.value })}>
                      {origins.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="inc">Incoterm</label>
                    <select id="inc" value={freight.incoterm} onChange={(e) => selectFreight({ incoterm: e.target.value })}>
                      {incoterms.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  {options.length > 1 && (
                    <div className="field">
                      <label htmlFor="opt">Opção</label>
                      <select id="opt" value={freight.id} onChange={(e) => selectFreight({ id: Number(e.target.value) })}>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <p className="freight-info">
                  <b>{freight.label}</b>: {money(freight.currency, freight.rate)} / {freightUnitLabel(freight.modal)} · mín. {money(freight.currency, freight.min_charge)}
                  {freight.origin_fees ? ` · origem ${money(freight.currency, freight.origin_fees)}` : ''} · destino {brl(freight.dest_fees_brl)}
                  {freight.transit_days ? ` · ${freight.transit_days} dias` : ''}
                </p>
                <div className="form-grid">
                  {isFcl ? (
                    <div className="field">
                      <label htmlFor="cnt">Quantidade de containers</label>
                      <NumberInput id="cnt" value={form.cargo.containers} decimals={0} onChange={(v) => patch({ cargo: { ...form.cargo, containers: v } })} />
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label htmlFor="kg">Peso bruto (kg)</label>
                        <NumberInput id="kg" value={form.cargo.peso_kg} decimals={2} onChange={(v) => patch({ cargo: { ...form.cargo, peso_kg: v } })} />
                      </div>
                      <div className="field">
                        <label htmlFor="m3">Volume (m³)</label>
                        <NumberInput id="m3" value={form.cargo.volume_m3} decimals={3} onChange={(v) => patch({ cargo: { ...form.cargo, volume_m3: v } })} />
                      </div>
                    </>
                  )}
                </div>
                <label className="field check special">
                  <input type="checkbox" checked={form.carga_especial} onChange={(e) => patch({ carga_especial: e.target.checked })} />
                  <span>Container especial (reefer, open top, flat rack…) ou carga perigosa</span>
                </label>
                {form.carga_especial && (
                  <Alert kind="warn">
                    Containers especiais e carga perigosa exigem <b>cotação por fora</b>. Fale com a FORVM: {settings.contato_forvm}.
                  </Alert>
                )}
              </>
            ) : client ? (
              <Loading />
            ) : (
              <p className="help">Selecione o cliente.</p>
            )}
          </Card>

          <Card title="Armazenagem e despesas">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="arm">Tabela de armazenagem</label>
                <select
                  id="arm"
                  value={form.storage_table_id ?? ''}
                  onChange={(e) => {
                    setStorageTouched(true);
                    // nova tabela: volta às linhas opcionais padrão dela
                    patch({ storage_table_id: e.target.value ? Number(e.target.value) : null, storage_opcionais: null });
                  }}
                >
                  <option value="">Não considerar</option>
                  {stOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.validado ? '' : ' (a validar)'}
                    </option>
                  ))}
                </select>
              </div>
              {stTable && (
                <div className="field">
                  <label htmlFor="dias">Dias além do 1º período</label>
                  <NumberInput id="dias" value={form.storage_dias_extras} decimals={0} onChange={(v) => patch({ storage_dias_extras: Math.max(0, Math.round(v ?? 0)) })} />
                  <span className="help">
                    {(() => {
                      const fx = stTable.linhas.find((l) => l.tipo === 'faixa_cif')?.faixas?.[0];
                      if (fx) return `1º período: até ${fx.ate_dias} dias úteis. Total = ${fx.ate_dias + (form.storage_dias_extras || 0)} dias úteis.`;
                      return `${stTable.linhas.find((l) => l.aplica === 'primeiro')?.descricao ?? '1º período'} já incluído.`;
                    })()}
                  </span>
                </div>
              )}
              {stTable?.linhas.some((l) => l.tipo === 'por_unidade') && (
                <div className="field">
                  <label htmlFor="vol">Volumes / pallets (picking)</label>
                  <NumberInput id="vol" value={form.storage_volumes} decimals={0} placeholder="0" onChange={(v) => patch({ storage_volumes: v })} />
                </div>
              )}
              <div className="field">
                <label htmlFor="fn">Frete rodoviário nacional (R$)</label>
                <NumberInput id="fn" value={form.frete_nacional_brl} fixed placeholder="0,00" onChange={(v) => patch({ frete_nacional_brl: v })} />
              </div>
              {isAdmin && (
                <div className="field">
                  <label htmlFor="sis">Siscomex (R$)</label>
                  <NumberInput id="sis" value={form.siscomex_brl} fixed placeholder={`${num(siscomexPadrao)} (automático)`} onChange={(v) => patch({ siscomex_brl: v })} />
                </div>
              )}
              {isAdmin && (
                <div className="field">
                  <label htmlFor="honm">Honorários FORVM deste estudo (R$)</label>
                  <NumberInput id="honm" value={form.honorarios_manual_brl ?? null} fixed placeholder="negociação do cliente" onChange={(v) => patch({ honorarios_manual_brl: v })} />
                  <span className="help">Só a FORVM. Vazio = % da base do ICMS negociado com o cliente.</span>
                </div>
              )}
            </div>
            {stTable?.site_url && (
              <Alert kind="warn">
                A FORVM calcula a armazenagem de {stTable.name} pelo site do terminal. O valor abaixo é uma estimativa. Site oficial:{' '}
                <a href={stTable.site_url} target="_blank" rel="noreferrer">
                  {stTable.site_url}
                </a>
              </Alert>
            )}
            {stTable && stTable.linhas.some((l) => l.opcional) && (
              <fieldset className="opcionais">
                <legend>Itens opcionais da tabela {stTable.name}</legend>
                {stTable.linhas
                  .filter((l) => l.opcional)
                  .map((l) => {
                    const marcadas = form.storage_opcionais ?? stTable.linhas.filter((x) => x.opcional && x.padrao).map((x) => x.id);
                    return (
                      <label className="field check" key={l.id}>
                        <input
                          type="checkbox"
                          checked={marcadas.includes(l.id)}
                          onChange={(e) => patch({ storage_opcionais: e.target.checked ? [...marcadas, l.id] : marcadas.filter((x) => x !== l.id) })}
                        />
                        <span>
                          {l.descricao}
                          {l.obs ? <span className="help"> · {l.obs}</span> : null}
                        </span>
                      </label>
                    );
                  })}
              </fieldset>
            )}
            {client && isAdmin && (
              <p className="help">
                Despacho {brl(client.despacho_brl)} · Honorários FORVM{' '}
                {[client.honorarios_fixo ? brl(client.honorarios_fixo) : '', client.honorarios_pct ? `${pct(client.honorarios_pct)} da base do ICMS (mín. ${brl(client.honorarios_min)})` : ''].filter(Boolean).join(' + ') || '—'} · Siscomex {brl(siscomexPadrao)} ({adicoes} {adicoes === 1 ? 'adição' : 'adições'})
              </p>
            )}
          </Card>

          <Card title="ICMS por condição">
            <p className="help">
              A condição de ICMS é definida em cada produto (acima). Despesas, frete e seguro entram na base de cada produto pela participação dele no valor da mercadoria.
            </p>
            {!usedConds.length ? (
              <p className="help">Adicione produtos para ver as condições aplicadas.</p>
            ) : (
              usedConds.map(({ cond, itens }) => {
                const id = String(cond.id);
                const adj = isAdmin && adjusting.includes(cond.id);
                const ov = form.icms_overrides[id] ?? {};
                const applied = r?.icms_condicoes.find((g) => g.code === cond.code);
                const setOv = (o: Partial<IcmsOverride>) => patch({ icms_overrides: { ...form.icms_overrides, [id]: { ...ov, ...o } } });
                return (
                  <div className="icms-box" key={cond.id}>
                    <div className="row-between tight">
                      <b>{cond.label}</b>
                      {!cond.validado && <Tag kind="warn">a validar</Tag>}
                    </div>
                    <span className="help">Produtos: {itens.join(', ')}</span>
                    {isAdmin && !cond.user_editable && (
                      <label className="field check">
                        <input
                          type="checkbox"
                          checked={adj}
                          onChange={(e) => setAdjusting((l) => (e.target.checked ? [...l, cond.id] : l.filter((x) => x !== cond.id)))}
                        />
                        <span>Ajustar parâmetros manualmente (fica registrado no estudo)</span>
                      </label>
                    )}
                    {cond.user_editable && <p className="help">Sem TTD: informe a alíquota efetiva do estado. Divisor = 1 − alíquota; destaque = alíquota efetiva.</p>}
                    <div className="form-grid three">
                      <IcmsNum label="Alíquota efetiva (%)" value={(cond.user_editable || adj ? ov.aliquota_efetiva : undefined) ?? applied?.aliquota_efetiva ?? cond.aliquota_efetiva} editable={cond.user_editable || adj} onChange={(v) => setOv({ aliquota_efetiva: v })} />
                      <IcmsNum label="Divisor" decimals={6} value={(adj ? ov.divisor : undefined) ?? applied?.divisor ?? cond.divisor} editable={adj} onChange={(v) => setOv({ divisor: v })} />
                      <IcmsNum label="Destaque / crédito (%)" value={(adj ? ov.aliquota_credito : undefined) ?? applied?.aliquota_credito ?? cond.aliquota_credito} editable={adj} onChange={(v) => setOv({ aliquota_credito: v })} />
                    </div>
                    <div className="row">
                      {(['incluir_ipi', 'calc_dif_ipi'] as const).map((k) => (
                        <label className="field check" key={k}>
                          <input type="checkbox" disabled={!adj} checked={(adj ? ov[k] : undefined) ?? cond[k]} onChange={(e) => setOv({ [k]: e.target.checked })} />
                          <span>{k === 'incluir_ipi' ? 'IPI na base do ICMS' : 'Calcular diferença de IPI'}</span>
                        </label>
                      ))}
                    </div>
                    {applied && (
                      <span className="help">
                        Base {brl(applied.base_inicial)} ÷ {num(applied.divisor, 4)} = {brl(applied.base_final)} · ICMS pago {brl(applied.icms_pago)} · destacado {brl(applied.icms_destaque)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <aside className="sim-result" aria-label="Resultado da simulação">
          <div className="result-card">
            <div className="kpis">
              <div>
                <span>Desembolso total</span>
                <b>{r ? brl(r.desembolso.total) : '—'}</b>
              </div>
              <div>
                <span>Créditos</span>
                <b>{r ? brl(r.creditos.total) : '—'}</b>
              </div>
              <div className="main">
                <span>Custo líquido final</span>
                <b>{r ? brl(r.custo_liquido) : '—'}</b>
              </div>
              {r && r.itens.length === 1 && r.itens[0].custo_unitario != null && (
                <div>
                  <span>Custo unitário</span>
                  <b>{brl(r.itens[0].custo_unitario)}</b>
                </div>
              )}
            </div>
            <div className="result-tabs" role="tablist">
              {(
                [
                  ['resultado', 'Resultado'],
                  ['memoria', 'Memória de cálculo'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="result-body">
              {!r ? (
                <Alert kind="info">{calc.error ?? 'Preencha os dados para ver o resultado.'}</Alert>
              ) : tab === 'resultado' ? (
                <>
                  <ReportBody r={r} />
                  <Alertas r={r} />
                </>
              ) : (
                <Memoria r={r} />
              )}
            </div>
            <div className="result-foot">
              {saveError && <Alert kind="err">{saveError}</Alert>}
              <button className="btn block" disabled={!r || saving || form.carga_especial} onClick={save}>
                {saving ? 'Salvando…' : 'Salvar estudo'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function IcmsNum({ label, value, editable, onChange, decimals = 4 }: { label: string; value: number | null | undefined; editable: boolean; onChange: (v: number | null) => void; decimals?: number }) {
  return (
    <div className="field">
      <label>{label}</label>
      <NumberInput value={value ?? null} decimals={decimals} readOnly={!editable} onChange={onChange} />
    </div>
  );
}

/** Finalidade e condição de ICMS de um produto (vazio = segue o estudo / sugestão automática). */
function ItemTax({ item, index, ctx, form, onChange }: { item: Item; index: number; ctx: BuildContext; form: StudyForm; onChange: (p: Partial<Item>) => void }) {
  const auto = suggestCondition(ctx.conditions, ctx.client, item.finalidade ?? form.finalidade, item.ex_tarifario);
  return (
    <div className="item-tax">
      <div className="field">
        <label htmlFor={`fi-${index}`}>Finalidade</label>
        <select id={`fi-${index}`} value={item.finalidade ?? ''} onChange={(e) => onChange({ finalidade: (e.target.value || null) as Item['finalidade'] })}>
          <option value="">Padrão do estudo ({FINALIDADES[form.finalidade]})</option>
          {Object.entries(FINALIDADES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`ic-${index}`}>Condição de ICMS</label>
        <select id={`ic-${index}`} value={item.icms_condition_id ?? ''} onChange={(e) => onChange({ icms_condition_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Automática{auto ? `: ${auto.label}` : ''}</option>
          {ctx.conditions
            .filter((c) => c.active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.validado ? '' : ' (a validar)'}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

