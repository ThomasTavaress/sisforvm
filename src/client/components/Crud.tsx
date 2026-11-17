import { useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import { useData } from '../lib/hooks.ts';
import { useToast } from '../lib/toast.tsx';
import { Modal } from './Modal.tsx';
import { NumberInput } from './NumberInput.tsx';
import { Alert, Empty, Loading } from './ui.tsx';

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'password';
  required?: boolean;
  help?: string;
  options?: [string, string][];
  decimals?: number;
  maxLength?: number;
  /** número vazio vira null (em vez de 0) */
  nullable?: boolean;
  full?: boolean;
  readonly?: boolean;
};

export type Column<T> = { label: string; num?: boolean; render: (row: T) => ReactNode };

type Values = Record<string, unknown>;

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${f.name}`;
  const help = f.help ? <span className="help">{f.help}</span> : null;
  if (f.type === 'checkbox')
    return (
      <label className={`field check ${f.full ? 'full' : ''}`} htmlFor={id}>
        <input id={id} type="checkbox" checked={!!value} disabled={f.readonly} onChange={(e) => onChange(e.target.checked)} />
        <span>{f.label}</span>
        {help}
      </label>
    );
  let input: ReactNode;
  if (f.type === 'select')
    input = (
      <select id={id} value={String(value ?? '')} required={f.required} disabled={f.readonly} onChange={(e) => onChange(e.target.value || null)}>
        {!f.required && <option value="">—</option>}
        {f.options?.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    );
  else if (f.type === 'number')
    input = <NumberInput id={id} value={value as number | null} decimals={f.decimals ?? 4} required={f.required} readOnly={f.readonly} onChange={(v) => onChange(v)} />;
  else if (f.type === 'textarea') input = <textarea id={id} rows={2} value={String(value ?? '')} readOnly={f.readonly} onChange={(e) => onChange(e.target.value)} />;
  else
    input = (
      <input
        id={id}
        type={f.type === 'password' ? 'password' : 'text'}
        autoComplete={f.type === 'password' ? 'new-password' : 'off'}
        value={String(value ?? '')}
        required={f.required}
        maxLength={f.maxLength}
        readOnly={f.readonly}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <div className={`field ${f.full || f.type === 'textarea' ? 'full' : ''}`}>
      <label htmlFor={id}>
        {f.label}
        {f.required && <span className="req"> *</span>}
      </label>
      {input}
      {help}
    </div>
  );
}

/** Converte valores do formulário para o formato da API. */
export function toPayload(fields: FieldDef[], values: Values): Values {
  const out: Values = {};
  for (const f of fields) {
    if (f.readonly) continue;
    let v = values[f.name];
    if (f.type === 'number') v = v == null ? (f.nullable ? null : f.required ? v : 0) : v;
    else if (f.type === 'checkbox') v = !!v;
    else if (f.type === 'password' && !v) continue;
    else if (typeof v === 'string') v = v.trim();
    out[f.name] = v;
  }
  return out;
}

export function FormModal({
  title,
  fields,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  initial: Values;
  onSubmit: (payload: Values) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={title} open onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await onSubmit(toPayload(fields, values));
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="form-grid">
          {fields.map((f) => (
            <FieldInput key={f.name} f={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
          ))}
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        <footer className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export interface CrudProps<T extends { id: number }> {
  endpoint: string;
  query?: Record<string, string | number>;
  fields?: FieldDef[];
  editFields?: FieldDef[];
  columns: Column<T>[];
  fixed?: Values;
  defaults?: Values;
  canCreate?: boolean;
  canEdit?: boolean | ((row: T) => boolean);
  canDelete?: boolean | ((row: T) => boolean);
  newLabel?: string;
  itemName?: string;
  empty?: string;
  filter?: (row: T) => boolean;
  rowActions?: (row: T) => ReactNode;
  describe?: (row: T) => string;
  toolbar?: ReactNode;
}

export function CrudTable<T extends { id: number }>(p: CrudProps<T>) {
  const qs = p.query ? `?${new URLSearchParams(Object.entries(p.query).map(([k, v]) => [k, String(v)]))}` : '';
  const { data, error, loading, reload } = useData<T[]>(p.endpoint + qs);
  const [editing, setEditing] = useState<{ row: T | null } | null>(null);
  const toast = useToast();
  const rows = (data ?? []).filter(p.filter ?? (() => true));
  const allow = (v: boolean | ((r: T) => boolean) | undefined, r: T) => (typeof v === 'function' ? v(r) : v !== false);

  const remove = async (row: T) => {
    const name = p.describe?.(row) ?? `#${row.id}`;
    if (!confirm(`Excluir ${p.itemName ?? 'registro'} "${name}"?\nEsta ação não pode ser desfeita.`)) return;
    try {
      await api.del(`${p.endpoint}/${row.id}`);
      toast('Excluído.');
      void reload();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <div className="crud">
      {(p.canCreate !== false || p.toolbar) && (
        <div className="crud-toolbar">
          <div>{p.toolbar}</div>
          {p.canCreate !== false && p.fields && (
            <button className="btn" onClick={() => setEditing({ row: null })}>
              + {p.newLabel ?? 'Novo'}
            </button>
          )}
        </div>
      )}
      {error && <Alert kind="err">{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                {p.columns.map((c) => (
                  <th key={c.label} className={c.num ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={p.columns.length + 1}>
                    <Empty>{p.empty ?? 'Nenhum registro.'}</Empty>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    {p.columns.map((c) => (
                      <td key={c.label} className={c.num ? 'num' : ''}>
                        {c.render(r)}
                      </td>
                    ))}
                    <td className="row-actions">
                      {p.rowActions?.(r)}
                      {p.fields && allow(p.canEdit, r) && (
                        <button className="btn small secondary" onClick={() => setEditing({ row: r })}>
                          Editar
                        </button>
                      )}
                      {allow(p.canDelete, r) && p.fields && (
                        <button className="btn small danger" onClick={() => remove(r)}>
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && p.fields && (
        <FormModal
          title={editing.row ? `Editar ${p.itemName ?? ''}`.trim() : (p.newLabel ?? 'Novo')}
          fields={editing.row ? (p.editFields ?? p.fields) : p.fields}
          initial={editing.row ? { ...(editing.row as unknown as Values) } : { ...(p.defaults ?? {}) }}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            if (editing.row) await api.put(`${p.endpoint}/${editing.row.id}`, { ...payload, ...(p.fixed ?? {}) });
            else await api.post(p.endpoint, { ...payload, ...(p.fixed ?? {}) });
            toast(editing.row ? 'Atualizado.' : 'Cadastrado.');
            void reload();
          }}
        />
      )}
    </div>
  );
}
