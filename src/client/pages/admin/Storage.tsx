import { useState } from 'react';
import { computeStorage } from '../../../shared/calc.ts';
import { STORAGE_MODAIS, type StorageLine, type StorageModal, type StorageTable } from '../../../shared/domain.ts';
import { brl, pct } from '../../../shared/format.ts';
import { Modal } from '../../components/Modal.tsx';
import { NumberInput } from '../../components/NumberInput.tsx';
import { Alert, Card, Loading, PageHeader, Tag } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useData, useDocumentTitle } from '../../lib/hooks.ts';
import { useToast } from '../../lib/toast.tsx';

type Draft = Omit<StorageTable, 'id'> & { id?: number };

const TIPOS: Record<StorageLine['tipo'], string> = {
  pct_cif: '% do CIF (com mínimo)',
  fixo: 'Valor fixo',
  por_unidade: 'Por volume/pallet',
  pct_subtotal: '% sobre linhas anteriores',
  faixa_cif: '% do CIF por faixa de dias (aeroporto)',
  por_kg: 'Por kg de peso bruto',
  faixa_peso: 'Valor por faixa de peso',
};

const novaTabela = (): Draft => ({
  name: '',
  modal: 'LCL',
  location: null,
  acrescimo_pct: 5,
  site_url: null,
  validado: false,
  active: true,
  notes: null,
  linhas: [{ id: 'periodo1', descricao: '1º período (10 dias)', tipo: 'pct_cif', pct: 0, minimo: 0, aplica: 'primeiro' }],
});

function resumo(t: StorageTable): string {
  const fx = t.linhas.find((l) => l.tipo === 'faixa_cif');
  if (fx?.faixas?.length) return `${pct(fx.faixas[0].pct)} até ${fx.faixas[0].ate_dias} dias úteis (faixas)`;
  const p1 = t.linhas.find((l) => l.tipo === 'pct_cif' && l.aplica !== 'adicional');
  return p1 ? `${pct(p1.pct ?? 0)} do CIF (mín. ${brl(p1.minimo ?? 0)})` : '—';
}

export function StoragePage() {
  useDocumentTitle('Armazenagem');
  const { data, error, reload } = useData<StorageTable[]>('/api/storage_tables');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const toast = useToast();
  const rows = (data ?? []).filter((t) => mostrarInativas || t.active);

  return (
    <>
      <PageHeader
        title="Tabelas de armazenagem"
        sub="Uma tabela por terminal, com as mesmas linhas da planilha: períodos sobre o CIF, taxas fixas, cobranças por volume, tributos e o acréscimo sobre o total."
        actions={<button className="btn" onClick={() => setEditing(novaTabela())}>+ Nova tabela</button>}
      />
      <Card>
        <div className="crud-toolbar">
          <label className="field check">
            <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
            <span>Mostrar tabelas inativas</span>
          </label>
          {data && <span className="help">{rows.length} tabela(s)</span>}
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        {!data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Modal</th>
                  <th>Terminal</th>
                  <th>1º período</th>
                  <th className="num">Linhas</th>
                  <th className="num">Acréscimo</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{STORAGE_MODAIS[t.modal]}</td>
                    <td>
                      <b>{t.name}</b>
                      {t.location && <div className="help">{t.location}</div>}
                    </td>
                    <td>{resumo(t)}</td>
                    <td className="num">{t.linhas.length}</td>
                    <td className="num">{pct(t.acrescimo_pct)}</td>
                    <td>
                      {t.validado ? <Tag kind="ok">Validada</Tag> : <Tag kind="warn">A validar</Tag>}
                      {!t.active && <Tag kind="off">Inativa</Tag>}
                    </td>
                    <td className="row-actions">
                      <button className="btn small secondary" onClick={() => setEditing(structuredClone(t))}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <StorageEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast('Tabela salva.');
            setEditing(null);
            void reload();
          }}
          onDeleted={() => {
            toast('Tabela excluída.');
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

function slug(texto: string, existentes: string[]): string {
  const base =
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30) || 'linha';
  let id = base;
  for (let k = 2; existentes.includes(id); k++) id = `${base}_${k}`;
  return id;
}

function StorageEditor({ draft, onClose, onSaved, onDeleted }: { draft: Draft; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [t, setT] = useState<Draft>(draft);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cifTeste, setCifTeste] = useState<number | null>(100000);
  const [diasTeste, setDiasTeste] = useState<number | null>(0);
  const [pesoTeste, setPesoTeste] = useState<number | null>(100);
  const set = (p: Partial<Draft>) => setT((x) => ({ ...x, ...p }));
  const setLinha = (i: number, p: Partial<StorageLine>) => set({ linhas: t.linhas.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= t.linhas.length) return;
    const l = [...t.linhas];
    [l[i], l[j]] = [l[j], l[i]];
    set({ linhas: l });
  };

  const teste = computeStorage(
    {
      name: t.name,
      linhas: t.linhas,
      acrescimo_pct: t.acrescimo_pct,
      validado: t.validado,
      dias_extras: diasTeste ?? 0,
      volumes: 0,
      opcionais: t.linhas.filter((l) => l.opcional && l.padrao).map((l) => l.id),
      peso_kg: pesoTeste ?? 0,
    },
    cifTeste ?? 0,
  );

  const salvar = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = { name: t.name, modal: t.modal, location: t.location, acrescimo_pct: t.acrescimo_pct, site_url: t.site_url, validado: t.validado, active: t.active, notes: t.notes, linhas: t.linhas };
      if (t.id) await api.put(`/api/storage_tables/${t.id}`, body);
      else await api.post('/api/storage_tables', body);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={t.id ? `Editar tabela · ${draft.name}` : 'Nova tabela de armazenagem'} open wide onClose={onClose}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="st-nome">Terminal / tabela</label>
          <input id="st-nome" value={t.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="st-modal">Modal</label>
          <select id="st-modal" value={t.modal} onChange={(e) => set({ modal: e.target.value as StorageModal })}>
            {Object.entries(STORAGE_MODAIS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st-local">Local</label>
          <input id="st-local" value={t.location ?? ''} onChange={(e) => set({ location: e.target.value || null })} />
        </div>
        <div className="field">
          <label htmlFor="st-acr">Acréscimo sobre o total (%)</label>
          <NumberInput id="st-acr" value={t.acrescimo_pct} onChange={(v) => set({ acrescimo_pct: v ?? 0 })} />
        </div>
        <div className="field full">
          <label htmlFor="st-site">Site / simulador oficial do terminal</label>
          <input id="st-site" type="url" placeholder="https://… (quando a FORVM calcula pelo site do porto)" value={t.site_url ?? ''} onChange={(e) => set({ site_url: e.target.value || null })} />
        </div>
      </div>

      <div className="table-wrap linhas-editor">
        <table className="list">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Parâmetros</th>
              <th>Opcional</th>
              <th aria-label="Ordem e exclusão" />
            </tr>
          </thead>
          <tbody>
            {t.linhas.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <input aria-label="Descrição" value={l.descricao} onChange={(e) => setLinha(i, { descricao: e.target.value })} />
                  <input aria-label="Observação" className="obs" placeholder="observação" value={l.obs ?? ''} onChange={(e) => setLinha(i, { obs: e.target.value || null })} />
                </td>
                <td>
                  <select aria-label="Tipo" value={l.tipo} onChange={(e) => setLinha(i, { tipo: e.target.value as StorageLine['tipo'] })}>
                    {Object.entries(TIPOS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="params">
                    {(l.tipo === 'pct_cif' || l.tipo === 'pct_subtotal') && (
                      <label>
                        %<NumberInput value={l.pct ?? null} decimals={4} onChange={(v) => setLinha(i, { pct: v })} />
                      </label>
                    )}
                    {(l.tipo === 'fixo' || l.tipo === 'por_unidade') && (
                      <label>
                        R$<NumberInput value={l.valor ?? null} fixed onChange={(v) => setLinha(i, { valor: v })} />
                      </label>
                    )}
                    {l.tipo === 'por_kg' && (
                      <label>
                        R$/kg<NumberInput value={l.valor ?? null} decimals={4} onChange={(v) => setLinha(i, { valor: v })} />
                      </label>
                    )}
                    {l.tipo === 'faixa_cif' && <FaixasEditor linha={l} onChange={(p) => setLinha(i, p)} />}
                    {l.tipo === 'faixa_peso' && <FaixasPesoEditor linha={l} onChange={(p) => setLinha(i, p)} />}
                    {(l.tipo === 'pct_cif' || l.tipo === 'por_unidade' || l.tipo === 'por_kg' || l.tipo === 'faixa_cif' || l.tipo === 'faixa_peso') && (
                      <label>
                        mín.<NumberInput value={l.minimo ?? null} fixed onChange={(v) => setLinha(i, { minimo: v })} />
                      </label>
                    )}
                    {l.tipo === 'pct_cif' && (
                      <select
                        aria-label="Quando cobra"
                        value={l.aplica === 'adicional' ? (l.dias_periodo ? 'periodo' : 'dia') : 'primeiro'}
                        onChange={(e) =>
                          setLinha(i, e.target.value === 'primeiro' ? { aplica: 'primeiro', dias_periodo: null } : { aplica: 'adicional', dias_periodo: e.target.value === 'periodo' ? (l.dias_periodo ?? 10) : null })
                        }
                      >
                        <option value="primeiro">uma vez (1º período)</option>
                        <option value="dia">por dia extra</option>
                        <option value="periodo">por período extra</option>
                      </select>
                    )}
                    {l.tipo === 'pct_cif' && l.aplica === 'adicional' && l.dias_periodo != null && (
                      <label>
                        dias/período<NumberInput value={l.dias_periodo} decimals={0} onChange={(v) => setLinha(i, { dias_periodo: Math.max(1, Math.round(v ?? 1)) })} />
                      </label>
                    )}
                    {l.tipo === 'pct_subtotal' && (
                      <span className="help">{l.sobre?.length ? `sobre: ${l.sobre.join(', ')}` : 'sobre todas as linhas anteriores'}</span>
                    )}
                    <label title="Cobrar só quando o peso bruto passar deste valor">
                      só acima de<NumberInput value={l.acima_kg ?? null} decimals={0} placeholder="—" onChange={(v) => setLinha(i, { acima_kg: v })} />
                      kg
                    </label>
                  </div>
                </td>
                <td>
                  <label className="field check">
                    <input type="checkbox" checked={!!l.opcional} onChange={(e) => setLinha(i, { opcional: e.target.checked, padrao: e.target.checked ? (l.padrao ?? true) : undefined })} />
                    <span>opcional</span>
                  </label>
                  {l.opcional && (
                    <label className="field check">
                      <input type="checkbox" checked={!!l.padrao} onChange={(e) => setLinha(i, { padrao: e.target.checked })} />
                      <span>já marcado</span>
                    </label>
                  )}
                </td>
                <td className="row-actions">
                  <button type="button" className="icon-btn" aria-label="Subir linha" onClick={() => mover(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" aria-label="Descer linha" onClick={() => mover(i, 1)}>
                    ↓
                  </button>
                  <button type="button" className="icon-btn danger" aria-label={`Remover ${l.descricao}`} onClick={() => set({ linhas: t.linhas.filter((_, k) => k !== i) })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn small secondary"
        onClick={() => set({ linhas: [...t.linhas, { id: slug('nova linha', t.linhas.map((l) => l.id)), descricao: 'Nova linha', tipo: 'fixo', valor: 0 }] })}
      >
        + Adicionar linha
      </button>

      <div className="teste-armazenagem">
        <b>Conferir:</b>
        <label>
          CIF R$ <NumberInput value={cifTeste} fixed onChange={setCifTeste} />
        </label>
        <label>
          dias extras <NumberInput value={diasTeste} decimals={0} onChange={setDiasTeste} />
        </label>
        <label>
          peso kg <NumberInput value={pesoTeste} decimals={0} onChange={setPesoTeste} />
        </label>
        <span>
          subtotal {brl(teste.subtotal)} → <b>total {brl(teste.total)}</b>
        </span>
      </div>

      <div className="form-grid">
        <label className="field check">
          <input type="checkbox" checked={t.validado} onChange={(e) => set({ validado: e.target.checked })} />
          <span>Valores vigentes validados</span>
        </label>
        <label className="field check">
          <input type="checkbox" checked={t.active} onChange={(e) => set({ active: e.target.checked })} />
          <span>Ativa (aparece no simulador)</span>
        </label>
        <div className="field full">
          <label htmlFor="st-notes">Observações</label>
          <textarea id="st-notes" rows={2} value={t.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
        </div>
      </div>
      {err && <Alert kind="err">{err}</Alert>}
      <footer className="modal-foot">
        {t.id &&
          (confirmDelete ? (
            <span className="confirma">
              Excluir de vez?
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  try {
                    await api.del(`/api/storage_tables/${t.id}`);
                    onDeleted();
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
              >
                Sim, excluir
              </button>
              <button type="button" className="btn small secondary" onClick={() => setConfirmDelete(false)}>
                Não
              </button>
            </span>
          ) : (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              Excluir
            </button>
          ))}
        <span className="spacer" />
        <button type="button" className="btn secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn" disabled={saving || !t.name.trim()} onClick={salvar}>
          {saving ? 'Salvando…' : 'Salvar tabela'}
        </button>
      </footer>
    </Modal>
  );
}

/** Faixas cumulativas por dias úteis (tabelas Infraero/GRU) + adicional a cada N dias. */
function FaixasEditor({ linha, onChange }: { linha: StorageLine; onChange: (p: Partial<StorageLine>) => void }) {
  const faixas = linha.faixas ?? [];
  const setF = (k: number, p: Partial<{ ate_dias: number; pct: number }>) => onChange({ faixas: faixas.map((f, j) => (j === k ? { ...f, ...p } : f)) });
  return (
    <div className="faixas">
      {faixas.map((f, k) => (
        <span key={k} className="faixa">
          até<NumberInput aria-label={`Faixa ${k + 1}: até dias`} value={f.ate_dias} decimals={0} onChange={(v) => setF(k, { ate_dias: Math.max(1, Math.round(v ?? 1)) })} />
          dias:<NumberInput aria-label={`Faixa ${k + 1}: %`} value={f.pct} decimals={4} onChange={(v) => setF(k, { pct: v ?? 0 })} />%
          <button type="button" className="icon-btn danger" aria-label={`Remover faixa ${k + 1}`} onClick={() => onChange({ faixas: faixas.filter((_, j) => j !== k) })}>
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="btn small secondary"
        onClick={() => onChange({ faixas: [...faixas, { ate_dias: (faixas[faixas.length - 1]?.ate_dias ?? 0) + 10, pct: 0 }] })}
      >
        + faixa
      </button>
      <span className="faixa">
        depois: +<NumberInput aria-label="Adicional %" value={linha.adicional_pct ?? null} decimals={4} onChange={(v) => onChange({ adicional_pct: v })} />% a cada
        <NumberInput aria-label="Adicional a cada dias" value={linha.adicional_dias ?? null} decimals={0} onChange={(v) => onChange({ adicional_dias: v })} />
        dias
      </span>
    </div>
  );
}

/** Valor fixo por faixa de peso bruto + adicional acima da última faixa, × multiplicador. */
function FaixasPesoEditor({ linha, onChange }: { linha: StorageLine; onChange: (p: Partial<StorageLine>) => void }) {
  const faixas = linha.faixas_peso ?? [];
  const setF = (k: number, p: Partial<{ ate_kg: number; valor: number }>) => onChange({ faixas_peso: faixas.map((f, j) => (j === k ? { ...f, ...p } : f)) });
  return (
    <div className="faixas">
      {faixas.map((f, k) => (
        <span key={k} className="faixa">
          até<NumberInput aria-label={`Faixa ${k + 1}: até kg`} value={f.ate_kg} decimals={0} onChange={(v) => setF(k, { ate_kg: Math.max(1, v ?? 1) })} />
          kg: R$<NumberInput aria-label={`Faixa ${k + 1}: valor`} value={f.valor} fixed onChange={(v) => setF(k, { valor: v ?? 0 })} />
          <button type="button" className="icon-btn danger" aria-label={`Remover faixa ${k + 1}`} onClick={() => onChange({ faixas_peso: faixas.filter((_, j) => j !== k) })}>
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="btn small secondary"
        onClick={() => onChange({ faixas_peso: [...faixas, { ate_kg: (faixas[faixas.length - 1]?.ate_kg ?? 0) + 100, valor: 0 }] })}
      >
        + faixa
      </button>
      <span className="faixa">
        acima: + R$<NumberInput aria-label="Adicional R$" value={linha.adicional_valor ?? null} fixed onChange={(v) => onChange({ adicional_valor: v })} /> a cada
        <NumberInput aria-label="Adicional a cada kg" value={linha.adicional_kg ?? null} decimals={0} onChange={(v) => onChange({ adicional_kg: v })} />
        kg
      </span>
      <span className="faixa">
        ×<NumberInput aria-label="Multiplicador" value={linha.multiplicador ?? null} decimals={2} placeholder="1" onChange={(v) => onChange({ multiplicador: v })} />
      </span>
    </div>
  );
}
