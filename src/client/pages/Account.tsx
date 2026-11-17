import { useState } from 'react';
import { Alert, Card, PageHeader } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { useAuth } from '../lib/session.tsx';
import { useToast } from '../lib/toast.tsx';

export function Account() {
  useDocumentTitle('Minha conta');
  const { user, client } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Minha conta" sub={`${user.name ?? user.username}${client ? ` · ${client.company_name}` : ' · Equipe FORVM'}`} />
      <Card title="Alterar senha" className="narrow">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (next !== confirm) return setError('A confirmação não confere com a nova senha.');
            try {
              await api.post('/api/auth/password', { current, next });
              toast('Senha alterada. Outras sessões foram encerradas.');
              setCurrent('');
              setNext('');
              setConfirm('');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <div className="field">
            <label htmlFor="cur">Senha atual</label>
            <input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nx">Nova senha</label>
            <input id="nx" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
            <span className="help">Mínimo de 8 caracteres.</span>
          </div>
          <div className="field">
            <label htmlFor="cf">Confirmar nova senha</label>
            <input id="cf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <Alert kind="err">{error}</Alert>}
          <div>
            <button className="btn">Salvar nova senha</button>
          </div>
        </form>
      </Card>
    </>
  );
}
