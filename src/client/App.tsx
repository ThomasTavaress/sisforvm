import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { Loading, Logo } from './components/ui.tsx';
import { useAuth, useSession } from './lib/session.tsx';
import { Account } from './pages/Account.tsx';
import { AdminUsers } from './pages/admin/AdminUsers.tsx';
import { ClientDetail } from './pages/admin/ClientDetail.tsx';
import { Clients } from './pages/admin/Clients.tsx';
import { Dashboard } from './pages/admin/Dashboard.tsx';
import { IcmsPage } from './pages/admin/Icms.tsx';
import { SettingsPage } from './pages/admin/Settings.tsx';
import { StoragePage } from './pages/admin/Storage.tsx';
import { ClientFreights } from './pages/client/Freights.tsx';
import { ClientHome } from './pages/client/Home.tsx';
import { ClientProducts } from './pages/client/Products.tsx';
import { Login } from './pages/Login.tsx';
import { Studies } from './pages/Studies.tsx';
import { StudyNew } from './pages/StudyNew.tsx';
import { StudyView } from './pages/StudyView.tsx';

export function App() {
  const { session, loading } = useSession();
  if (loading) return <Loading />;
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route element={session ? <Shell /> : <RedirectToLogin />}>
        <Route index element={<Home />} />
        <Route path="estudos" element={<Studies />} />
        <Route path="estudos/novo" element={<StudyNew />} />
        <Route path="estudos/:id" element={<StudyView />} />
        <Route path="conta" element={<Account />} />
        <Route path="produtos" element={<ClientOnly><ClientProducts /></ClientOnly>} />
        <Route path="fretes" element={<ClientOnly><ClientFreights /></ClientOnly>} />
        <Route path="admin" element={<AdminOnly />}>
          <Route path="clientes" element={<Clients />} />
          <Route path="clientes/:id/:tab?" element={<ClientDetail />} />
          <Route path="armazenagem" element={<StoragePage />} />
          <Route path="icms" element={<IcmsPage />} />
          <Route path="parametros" element={<SettingsPage />} />
          <Route path="usuarios" element={<AdminUsers />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function RedirectToLogin() {
  const loc = useLocation();
  return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
}

function Home() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Dashboard /> : <ClientHome />;
}

function AdminOnly() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
function ClientOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <Navigate to="/admin/clientes" replace /> : <>{children}</>;
}

function NotFound() {
  return (
    <div className="card">
      <div className="card-body">
        <p>Página não encontrada.</p>
      </div>
    </div>
  );
}

function Shell() {
  const { user, client, isAdmin } = useAuth();
  const { logout } = useSession();
  const loc = useLocation();
  useEffect(() => {
    // Em navegadores recentes scrollTo devolve uma Promise: não pode ser o retorno do efeito.
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const links: [string, string][] = isAdmin
    ? [
        ['/', 'Painel'],
        ['/admin/clientes', 'Clientes'],
        ['/estudos/novo', 'Novo estudo'],
        ['/estudos', 'Estudos'],
        ['/admin/armazenagem', 'Armazenagem'],
        ['/admin/icms', 'ICMS'],
        ['/admin/parametros', 'Parâmetros'],
        ['/admin/usuarios', 'Equipe'],
      ]
    : [
        ['/', 'Início'],
        ['/estudos/novo', 'Novo estudo'],
        ['/estudos', 'Meus estudos'],
        ['/produtos', 'Produtos'],
        ['/fretes', 'Fretes'],
      ];
  return (
    <>
      <a className="skip" href="#main">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Início">
          <Logo />
        </NavLink>
        <nav aria-label="Principal">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/' || to === '/estudos'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <span className="who">
            {client?.company_name ?? 'FORVM'} · <b>{user.username}</b>
          </span>
          <NavLink to="/conta" className="btn small secondary">
            Conta
          </NavLink>
          <button className="btn small secondary" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}
