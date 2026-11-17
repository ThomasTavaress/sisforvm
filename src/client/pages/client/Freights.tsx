import type { FreightProfile } from '../../../shared/domain.ts';
import { CrudTable } from '../../components/Crud.tsx';
import { freightColumns } from '../../components/fields.tsx';
import { Card, PageHeader } from '../../components/ui.tsx';
import { useDocumentTitle } from '../../lib/hooks.ts';
import { useAuth } from '../../lib/session.tsx';

export function ClientFreights() {
  useDocumentTitle('Fretes');
  const { settings } = useAuth();
  return (
    <>
      <PageHeader title="Fretes internacionais" sub={`Opções estimadas pré-configuradas pela FORVM para sua empresa. Containers especiais ou carga perigosa: ${settings.contato_forvm}.`} />
      <Card>
        <CrudTable<FreightProfile> endpoint="/api/freight_profiles" canCreate={false} canEdit={false} canDelete={false} columns={freightColumns} empty="Nenhuma opção de frete cadastrada. Fale com a FORVM." />
      </Card>
    </>
  );
}
