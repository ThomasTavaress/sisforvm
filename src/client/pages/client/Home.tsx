import { Link } from 'react-router';
import { REGIMES, type StudySummary } from '../../../shared/domain.ts';
import { StudiesTable } from '../../components/StudiesTable.tsx';
import { Card, Loading, PageHeader } from '../../components/ui.tsx';
import { useData, useDocumentTitle } from '../../lib/hooks.ts';
import { useAuth } from '../../lib/session.tsx';

export function ClientHome() {
  useDocumentTitle('Início');
  const { client, settings } = useAuth();
  const { data } = useData<StudySummary[]>('/api/studies?limit=8');
  if (!client) return null;
  return (
    <>
      <PageHeader
        title={client.company_name}
        sub={`${REGIMES[client.tax_regime]} · ${[client.city, client.state].filter(Boolean).join('/') || '—'} · CNPJ ${client.cnpj || '—'}`}
        actions={<Link className="btn" to="/estudos/novo">+ Novo estudo de custos</Link>}
      />
      <div className="hero">
        <div>
          <h2>Como funciona</h2>
          <ol>
            <li>Escolha os produtos (NCM e alíquotas vêm do cadastro) e informe os valores.</li>
            <li>Selecione modal, origem e incoterm: o frete e as taxas no destino já estão pré-configurados pela FORVM.</li>
            <li>Veja o resultado ao vivo, compare modais e salve: o estudo recebe uma referência ({client.sigla}01, {client.sigla}02…).</li>
          </ol>
        </div>
        <p className="fine">Dúvidas ou carga especial/perigosa: {settings.contato_forvm}</p>
      </div>
      <Card title="Últimos estudos" actions={<Link to="/estudos" className="btn small secondary">Ver todos</Link>}>
        {data ? <StudiesTable rows={data} /> : <Loading />}
      </Card>
    </>
  );
}
