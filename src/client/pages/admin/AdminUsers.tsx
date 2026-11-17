import type { User } from '../../../shared/domain.ts';
import { CrudTable, type FieldDef } from '../../components/Crud.tsx';
import { ActiveTag, Card, PageHeader } from '../../components/ui.tsx';
import { useDocumentTitle } from '../../lib/hooks.ts';
import { useAuth } from '../../lib/session.tsx';

const fields: FieldDef[] = [
  { name: 'username', label: 'Usuário', required: true },
  { name: 'name', label: 'Nome' },
  { name: 'password', label: 'Senha', type: 'password', required: true, help: 'Mínimo de 8 caracteres.' },
  { name: 'active', label: 'Ativo', type: 'checkbox' },
];
const editFields = fields.map((f) => (f.name === 'password' ? { ...f, label: 'Nova senha', required: false, help: 'Deixe em branco para manter a atual.' } : f));

export function AdminUsers() {
  useDocumentTitle('Equipe FORVM');
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Equipe FORVM" sub="Analistas com acesso administrativo: cadastros, parametrizações e todos os estudos." />
      <Card>
        <CrudTable<User>
          endpoint="/api/users"
          filter={(u) => u.role === 'admin'}
          fields={fields}
          editFields={editFields}
          fixed={{ role: 'admin' }}
          defaults={{ active: true }}
          newLabel="Novo analista"
          itemName="usuário"
          describe={(u) => u.username}
          canDelete={(u) => u.id !== user.id}
          columns={[
            { label: 'Usuário', render: (u) => <b>{u.username}</b> },
            { label: 'Nome', render: (u) => u.name ?? '' },
            { label: 'Status', render: (u) => <ActiveTag active={u.active} /> },
          ]}
        />
      </Card>
    </>
  );
}
