import { Link, useNavigate, useParams } from 'react-router';
import type { CalcResult } from '../../shared/calc.ts';
import type { StudyDetail } from '../../shared/domain.ts';
import { dateBR, dateTimeBR } from '../../shared/format.ts';
import { Alertas, Memoria, ReportBody } from '../components/Report.tsx';
import { Alert, Loading, Logo } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useData, useDocumentTitle } from '../lib/hooks.ts';
import { useAuth } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';

export function StudyView() {
  const { id } = useParams();
  const { data: s, error } = useData<StudyDetail>(`/api/studies/${id}`);
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  useDocumentTitle(s ? `Estudo ${s.reference}` : 'Estudo');
  if (error) return <Alert kind="err">{error}</Alert>;
  if (!s) return <Loading />;
  const r = s.result as CalcResult;

  return (
    <>
      <div className="page-header no-print">
        <div>
          <Link to="/estudos" className="back">
            ← Estudos
          </Link>
        </div>
        <div className="actions">
          <Link className="btn secondary" to={`/estudos/novo?de=${s.id}`}>
            Duplicar e ajustar
          </Link>
          <a className="btn secondary" href={`/api/studies/${s.id}/xlsx`} download>
            Excel
          </a>
          <button className="btn" onClick={() => window.print()}>
            Imprimir / PDF
          </button>
          {isAdmin && (
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm(`Excluir definitivamente o estudo ${s.reference}?\nEsta ação não pode ser desfeita.`)) return;
                try {
                  await api.del(`/api/studies/${s.id}`);
                  toast('Estudo excluído.');
                  nav('/estudos');
                } catch (e) {
                  toast((e as Error).message, 'err');
                }
              }}
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      <article className="report">
        <header className="rep-head">
          <span className="rep-brand">
            <Logo />
          </span>
          <div className="rep-title">
            <b>Simulação de custos de importação</b>
            <span>Conta e Ordem | {dateBR(s.created_at)}</span>
          </div>
        </header>
        <div className="rep-meta">
          <div>
            <small>Referência</small>
            <div className="rep-ref">{s.reference}</div>
          </div>
          <div className="right">
            <b>{s.company_name}</b>
            <br />
            <span className="muted">
              CNPJ {s.cnpj || '—'} · {[s.city, s.state].filter(Boolean).join('/')}
            </span>
            {s.title && (
              <>
                <br />
                <span>{s.title}</span>
              </>
            )}
          </div>
        </div>
        <div className="band strong">Planilha pré-cálculo</div>
        <ReportBody r={r} />
        <div className="band">Alertas e premissas</div>
        <Alertas r={r} />
        <section className="memoria-section">
          <div className="band">Memória de cálculo</div>
          <Memoria r={r} />
        </section>
        <footer className="rep-foot">
          <span>
            Gerado em {dateTimeBR(s.created_at)} por {s.created_by_name ?? '—'}. Valores estimados para fins gerenciais; frete, armazenagem e taxas sujeitos a cotação. Taxa de câmbio informada pelo usuário.
          </span>
          <b>FORVM | Simulação gerencial</b>
        </footer>
      </article>
    </>
  );
}
