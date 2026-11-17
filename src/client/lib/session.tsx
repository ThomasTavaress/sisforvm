import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Client, Settings, User } from '../../shared/domain.ts';
import { api, onUnauthorized } from './api.ts';

export interface Session {
  user: Pick<User, 'id' | 'username' | 'name' | 'role' | 'client_id'>;
  client: Client | null;
  settings: Settings;
}

interface Ctx {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.get<Session>('/api/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onUnauthorized(() => setSession(null));
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      session,
      loading,
      refresh,
      login: async (username, password) => {
        await api.post('/api/auth/login', { username, password });
        await refresh();
      },
      logout: async () => {
        await api.post('/api/auth/logout').catch(() => undefined);
        setSession(null);
      },
    }),
    [session, loading, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession fora do SessionProvider');
  return c;
}

/** Sessão garantida (usar apenas dentro de rotas autenticadas). */
export function useAuth(): Session & { isAdmin: boolean } {
  const { session } = useSession();
  if (!session) throw new Error('Sem sessão');
  return { ...session, isAdmin: session.user.role === 'admin' };
}
