import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import { REGIMES, type Client, type FreightProfile, type Product, type StudySummary, type User } from '../../../shared/domain.ts';
import { dateTimeBR } from '../../../shared/format.ts';
import { CrudTable, FieldInput, toPayload, type FieldDef } from '../../components/Crud.tsx';
import { clientFields, freightColumns, freightFields, productColumns, productFields } from '../../components/fields.tsx';
import { StudiesTable } from '../../components/StudiesTable.tsx';
import { ActiveTag, Alert, Card, Loading, PageHeader } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useData, useDocumentTitle } from '../../lib/hooks.ts';
import { useToast } from '../../lib/toast.tsx';

const TABS: [string, string][] = [
  ['dados', 'Dados'],
  ['usuarios', 'Usuários'],
  ['fretes', 'Fretes internacionais'],
  ['produtos', 'Produtos'],
  ['estudos', 'Estudos'],
];

const userFields: FieldDef[] = [
  { name: 'username', label: 'Usuário', required: true },
  { name: 'name', label: 'Nome' },
  { name: 'password', label: 'Senha', type: 'password', required: true, help: 'Mínimo de 8 caracteres.' },
  { name: 'active', label: 'Ativo', type: 'checkbox' },
];
const userEditFields: FieldDef[] = userFields.map((f) => (f.name === 'password' ? { ...f, label: 'Nova senha', required: false, help: 'Deixe em branco para manter a atual.' } : f));

export function ClientDetail() {
  const { id: idParam, tab = 'dados' } = useParams();
  const id = Number(idParam);
  const { data: client, error, reload } = useData<Client>(`/api/clients/${id}`);
  useDocumentTitle(client?.company_name ?? 'Cliente');
  if (error) return <Alert kind="err">{error}</Alert>;
  if (!client) return <Loading />;
  return (
    <>
      <PageHeader
        title={client.company_name}
        sub={
          <>
            Sigla <span className="ref">{client.sigla}</span> · {REGIMES[client.tax_regime]} · {[client.city, client.state].filter(Boolean).join('/') || '—'} · CNPJ {client.cnpj || '—'} ·{' '}
            <ActiveTag active={client.active} />
          </>
        }
        actions={
          <Link className="btn" to={`/estudos/novo?cliente=${client.id}`}>
            + Novo estudo para este cliente
          </Link>
        }
      />
      <nav className="tabs" aria-label="Seções do cliente">
        {TABS.map(([k, l]) => (
          <NavLink key={k} to={`/admin/clientes/${id}/${k}`} className={k === tab ? 'active' : ''}>
            {l}
          </NavLink>
        ))}
      </nav>
      {tab === 'dados' && <ClientForm client={client} onSaved={reload} />}
      {tab === 'usuarios' && (
        <Card title="Usuários de acesso do cliente">
          <CrudTable<User>
            endpoint="/api/users"
            filter={(u) => u.client_id === id}
            fields={userFields}
            editFields={userEditFields}
            fixed={{ role: 'cliente', client_id: id }}
            defaults={{ active: true }}
            newLabel="Novo usuário"
            itemName="usuário"
            describe={(u) => u.username}
            empty="Nenhum usuário. Crie o acesso do cliente aqui."
            columns={[
              { label: 'Usuário', render: (u) => <b>{u.username}</b> },
              { label: 'Nome', render: (u) => u.name ?? '' },
              { label: 'Status', render: (u) => <ActiveTag active={u.active} /> },
              { label: 'Criado em', render: (u) => dateTimeBR(u.created_at) },
            ]}
          />
        </Card>
      )}
      {tab === 'fretes' && (
        <Card title="Frete internacional · padronizado FORVM">
          <p className="sub">
            Uma opção para cada combinação de modal, origem e incoterm. Se o cliente tiver mais de uma origem, cadastre uma opção por origem. Containers especiais e carga perigosa exigem cotação por fora.
          </p>
          <CrudTable<FreightProfile>
            endpoint="/api/freight_profiles"
            query={{ client_id: id }}
            fixed={{ client_id: id }}
            fields={freightFields}
            defaults={{ modal: 'AEREO', incoterm: 'FOB', currency: 'USD', active: true, min_charge: 0, origin_fees: 0, dest_fees_brl: 0 }}
            newLabel="Nova opção de frete"
            itemName="opção de frete"
            describe={(r) => r.label}
            columns={[...freightColumns, { label: 'Status', render: (r) => <ActiveTag active={r.active} /> }]}
          />
        </Card>
      )}
      {tab === 'produtos' && (
        <Card title="Produtos">
          <p className="sub">NCM e alíquotas usadas automaticamente no simulador. Produtos cadastrados ou alterados pelo cliente ficam “a conferir”.</p>
          <CrudTable<Product>
            endpoint="/api/products"
            query={{ client_id: id }}
            fixed={{ client_id: id }}
            fields={productFields(true)}
            defaults={{ pis: 2.1, cofins: 9.65, confirmed: true, active: true }}
            newLabel="Novo produto"
            itemName="produto"
            describe={(r) => r.description}
            columns={[...productColumns, { label: 'Status', render: (r) => <ActiveTag active={r.active} /> }]}
          />
        </Card>
      )}
      {tab === 'estudos' && <ClientStudies id={id} />}
    </>
  );
}

function ClientForm({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(client as unknown as Record<string, unknown>);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    setValues(client as unknown as Record<string, unknown>);
  }, [client]);
  return (
    <Card title="Dados do cliente">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api.put(`/api/clients/${client.id}`, toPayload(clientFields, values));
            toast('Cliente atualizado.');
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="form-grid wide">
          {clientFields.map((f) => (
            <FieldInput key={f.name} f={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
          ))}
        </div>
        <p className="help">
          Próximo estudo: <b className="ref">{client.sigla}{String(client.study_seq + 1).padStart(2, '0')}</b>
        </p>
        {error && <Alert kind="err">{error}</Alert>}
        <div className="form-actions">
          <button className="btn">Salvar dados</button>
        </div>
      </form>
    </Card>
  );
}

function ClientStudies({ id }: { id: number }) {
  const { data } = useData<StudySummary[]>(`/api/studies?client_id=${id}`);
  return <Card title="Estudos do cliente">{data ? <StudiesTable rows={data} /> : <Loading />}</Card>;
}
