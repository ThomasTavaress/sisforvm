import type { Product } from '../../../shared/domain.ts';
import { CrudTable } from '../../components/Crud.tsx';
import { productColumns, productFields } from '../../components/fields.tsx';
import { Card, PageHeader } from '../../components/ui.tsx';
import { useDocumentTitle } from '../../lib/hooks.ts';

export function ClientProducts() {
  useDocumentTitle('Produtos');
  return (
    <>
      <PageHeader title="Meus produtos" sub="Cadastre NCM e alíquotas. A FORVM confere os produtos que você cadastra ou altera." />
      <Card>
        <CrudTable<Product>
          endpoint="/api/products"
          fields={productFields(false)}
          defaults={{ pis: 2.1, cofins: 9.65 }}
          newLabel="Novo produto"
          itemName="produto"
          describe={(r) => r.description}
          columns={productColumns}
          empty="Nenhum produto cadastrado ainda."
        />
      </Card>
    </>
  );
}
