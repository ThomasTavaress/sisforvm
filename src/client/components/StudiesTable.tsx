import { Link } from 'react-router';
import type { StudySummary } from '../../shared/domain.ts';
import { brl, dateTimeBR, money } from '../../shared/format.ts';
import { Empty } from './ui.tsx';

export function StudiesTable({ rows, showClient }: { rows: StudySummary[]; showClient?: boolean }) {
  if (!rows.length) return <Empty>Nenhum estudo encontrado.</Empty>;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th>Referência</th>
            <th>Data</th>
            {showClient && <th>Cliente</th>}
            <th>Descrição</th>
            <th>Modal · origem</th>
            <th>Finalidade</th>
            <th className="num">Mercadoria</th>
            <th className="num">Desembolso</th>
            <th className="num">Custo líquido</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                <Link className="ref" to={`/estudos/${s.id}`}>
                  {s.reference}
                </Link>
              </td>
              <td className="nowrap">{dateTimeBR(s.created_at)}</td>
              {showClient && <td>{s.company_name}</td>}
              <td>{s.title}</td>
              <td>
                {s.modal}
                {s.origem ? ` · ${s.origem}` : ''}
              </td>
              <td>{s.finalidade}</td>
              <td className="num">{s.moeda ? money(s.moeda, s.fob) : ''}</td>
              <td className="num">{brl(s.desembolso)}</td>
              <td className="num">
                <b>{brl(s.custo_liquido)}</b>
              </td>
              <td className="row-actions">
                <Link className="btn small secondary" to={`/estudos/${s.id}`}>
                  Abrir
                </Link>
                <Link className="btn small secondary" to={`/estudos/novo?de=${s.id}`}>
                  Duplicar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
