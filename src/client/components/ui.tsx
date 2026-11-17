import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

/** Logo oficial (public/logo.png); enquanto o arquivo não existir, mostra um wordmark provisório. */
export function Logo({ compact = false }: { compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!failed) return <img src="/logo.png" alt="FORVM Comércio Exterior" className="logo-img" onError={() => setFailed(true)} />;
  return (
    <span className="logo-fallback" aria-label="FORVM Comércio Exterior">
      <svg viewBox="0 0 24 24" width={compact ? 20 : 26} height={compact ? 20 : 26} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="12" cy="12" rx="4.5" ry="10" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 12h20M4 7h16M4 17h16" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
      <b>FORVM</b>
      {!compact && <small>COMÉRCIO EXTERIOR</small>}
    </span>
  );
}

export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-title">
          <h2>{title}</h2>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Tag({ kind = 'info', children }: { kind?: 'ok' | 'warn' | 'off' | 'info'; children: ReactNode }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

export const ActiveTag = ({ active }: { active: boolean }) => (active ? <Tag kind="ok">Ativo</Tag> : <Tag kind="off">Inativo</Tag>);

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err'; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === 'err' ? 'alert' : undefined}>{children}</div>;
}

export function Loading({ text = 'Carregando…' }: { text?: string }) {
  return <p className="loading">{text}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Stat({ value, label, warn, href }: { value: ReactNode; label: string; warn?: boolean; href?: string }) {
  const body = (
    <>
      <b>{value}</b>
      <span>{label}</span>
    </>
  );
  return href ? (
    <Link className={`stat ${warn ? 'warn' : ''}`} to={href}>
      {body}
    </Link>
  ) : (
    <div className={`stat ${warn ? 'warn' : ''}`}>{body}</div>
  );
}
