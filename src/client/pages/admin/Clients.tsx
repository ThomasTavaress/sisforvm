import { Link } from 'react-router';
import { REGIMES, type Client } from '../../../shared/domain.ts';
import { CrudTable } from '../../components/Crud.tsx';
import { clientFields } from '../../components/fields.tsx';
import { ActiveTag, Card, PageHeader } from '../../components/ui.tsx';
import { useDocumentTitle } from '../../lib/hooks.ts';

export function Clients() {
  useDocumentTitle('Clientes');
  return (
    <>
      <PageHeader title="Clientes" sub="Empresas com acesso personalizado ao simulador. Abra um cliente para cadastrar usuários, fretes e produtos." />
      <Card>
        <CrudTable<Client>
          endpoint="/api/clients"
          fields={clientFields}
          newLabel="Novo cliente"
          itemName="cliente"
          defaults={{ tax_regime: 'LUCRO_REAL', state: 'SC', active: true, despacho_brl: 0, honorarios_fixo: 0, honorarios_pct: 0, honorarios_min: 0 }}
          canEdit={false}
          describe={(r) => r.company_name}
          columns={[
            { label: 'Empresa', render: (r) => <Link to={`/admin/clientes/${r.id}`}><b>{r.company_name}</b></Link> },
            { label: 'Sigla', render: (r) => <span className="ref">{r.sigla}</span> },
            { label: 'Situação tributária', render: (r) => REGIMES[r.tax_regime] },
            { label: 'Cidade/UF', render: (r) => [r.city, r.state].filter(Boolean).join(' / ') },
            { label: 'CNPJ', render: (r) => r.cnpj ?? '' },
            { label: 'Estudos', num: true, render: (r) => r.study_seq },
            { label: 'Status', render: (r) => <ActiveTag active={r.active} /> },
          ]}
          rowActions={(r) => (
            <Link className="btn small" to={`/admin/clientes/${r.id}`}>
              Abrir
            </Link>
          )}
        />
      </Card>
    </>
  );
}
