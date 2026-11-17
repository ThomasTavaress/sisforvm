import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Logo } from '../components/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';

export function Login() {
  useDocumentTitle('Entrar');
  const { login } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-wrap">
      <form
        className="login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(username, password);
            nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="login-brand">
          <Logo />
        </div>
        <h1>Simulador de custos de importação</h1>
        <div className="field">
          <label htmlFor="u">Usuário</label>
          <input id="u" autoComplete="username" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="p">Senha</label>
          <input id="p" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <Alert kind="err">{error}</Alert>}
        <button className="btn block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="fine center">Acesso exclusivo para clientes e equipe FORVM.</p>
      </form>
    </div>
  );
}
