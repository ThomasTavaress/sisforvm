import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { StudySummary } from '../../shared/domain.ts';
import { StudiesTable } from '../components/StudiesTable.tsx';
import { Alert, Card, Loading, PageHeader } from '../components/ui.tsx';
import { useData, useDocumentTitle } from '../lib/hooks.ts';
import { useAuth } from '../lib/session.tsx';

export function Studies() {
  const { isAdmin } = useAuth();
  useDocumentTitle(isAdmin ? 'Estudos' : 'Meus estudos');
  const { data, error } = useData<StudySummary[]>('/api/studies');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!data || !t) return data ?? [];
    return data.filter((r) => [r.reference, r.company_name, r.title, r.origem, r.modal, r.finalidade].join(' ').toLowerCase().includes(t));
  }, [data, q]);
  return (
    <>
      <PageHeader
        title={isAdmin ? 'Estudos de todos os clientes' : 'Meus estudos'}
        sub="Histórico de simulações com referência e data. Abra para ver o relatório ou duplique para ajustar um cenário."
        actions={<Link className="btn" to="/estudos/novo">+ Novo estudo</Link>}
      />
      <Card>
        <div className="crud-toolbar">
          <input type="search" className="search" placeholder="Buscar por referência, cliente, descrição, origem…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar estudos" />
          {data && <span className="help">{rows.length} de {data.length}</span>}
        </div>
        {error ? <Alert kind="err">{error}</Alert> : data ? <StudiesTable rows={rows} showClient={isAdmin} /> : <Loading />}
      </Card>
    </>
  );
}
