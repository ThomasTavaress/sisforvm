import { Link } from 'react-router';
import type { StudySummary } from '../../../shared/domain.ts';
import { StudiesTable } from '../../components/StudiesTable.tsx';
import { Alert, Card, Loading, PageHeader, Stat } from '../../components/ui.tsx';
import { useData, useDocumentTitle } from '../../lib/hooks.ts';

interface Dash {
  clients: number;
  studies: number;
  studies_30d: number;
  pending_products: number;
  unvalidated_storage: number;
  unvalidated_icms: number;
  pending_list: { id: number; description: string; ncm: string; client_id: number; company_name: string }[];
}

export function Dashboard() {
  useDocumentTitle('Painel');
  const d = useData<Dash>('/api/dashboard');
  const s = useData<StudySummary[]>('/api/studies?limit=10');
  if (d.error) return <Alert kind="err">{d.error}</Alert>;
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <>
      <PageHeader title="Painel FORVM" sub="Cadastros, parametrizações e acompanhamento dos estudos dos clientes." actions={<Link className="btn" to="/estudos/novo">+ Novo estudo</Link>} />
      <div className="stats">
        <Stat value={x.clients} label="Clientes ativos" href="/admin/clientes" />
        <Stat value={x.studies} label="Estudos realizados" href="/estudos" />
        <Stat value={x.studies_30d} label="Estudos em 30 dias" />
        <Stat value={x.pending_products} label="Produtos a conferir" warn={x.pending_products > 0} />
        <Stat value={x.unvalidated_storage} label="Tabelas de armazenagem a validar" warn={x.unvalidated_storage > 0} href="/admin/armazenagem" />
        <Stat value={x.unvalidated_icms} label="Condições de ICMS a validar" warn={x.unvalidated_icms > 0} href="/admin/icms" />
      </div>
      {x.pending_list.length > 0 && (
        <Card title="Produtos cadastrados por clientes, a conferir">
          <ul className="plain-list">
            {x.pending_list.map((p) => (
              <li key={p.id}>
                <Link to={`/admin/clientes/${p.client_id}/produtos`}>{p.company_name}</Link> · {p.description} · <span className="mono">{p.ncm}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Últimos estudos" actions={<Link to="/estudos" className="btn small secondary">Ver todos</Link>}>
        {s.data ? <StudiesTable rows={s.data} showClient /> : <Loading />}
      </Card>
    </>
  );
}
