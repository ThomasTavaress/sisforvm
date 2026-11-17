import { FINALIDADE_SCOPES, REGIME_SCOPES, type IcmsCondition } from '../../../shared/domain.ts';
import { num, pct } from '../../../shared/format.ts';
import { CrudTable } from '../../components/Crud.tsx';
import { icmsFields } from '../../components/fields.tsx';
import { Card, PageHeader, Tag } from '../../components/ui.tsx';
import { useDocumentTitle } from '../../lib/hooks.ts';

export function IcmsPage() {
  useDocumentTitle('ICMS');
  return (
    <>
      <PageHeader
        title="Parametrizações de ICMS"
        sub="Base inicial = CIF + II + PIS + COFINS + despesas aduaneiras (+ IPI quando indicado). Base final = base inicial ÷ divisor. ICMS pago = base final × alíquota efetiva."
      />
      <Card>
        <CrudTable<IcmsCondition>
          endpoint="/api/icms_conditions"
          fields={icmsFields}
          newLabel="Nova condição"
          itemName="condição"
          defaults={{ regime_scope: 'NORMAL', finalidade: 'REVENDA', calc_dif_ipi: true, active: true, sort: 100 }}
          describe={(r) => r.label}
          columns={[
            {
              label: 'Condição',
              render: (r) => (
                <>
                  <b>{r.label}</b>
                  {r.notes && <div className="help">{r.notes}</div>}
                </>
              ),
            },
            { label: 'Regime', render: (r) => REGIME_SCOPES[r.regime_scope] },
            { label: 'Finalidade', render: (r) => FINALIDADE_SCOPES[r.finalidade] },
            { label: 'Efetiva', num: true, render: (r) => (r.aliquota_efetiva != null ? pct(r.aliquota_efetiva) : '—') },
            { label: 'Divisor', num: true, render: (r) => (r.divisor != null ? num(r.divisor, 4) : '—') },
            { label: 'Destaque', num: true, render: (r) => (r.aliquota_credito != null ? pct(r.aliquota_credito) : '—') },
            { label: 'IPI na base', render: (r) => (r.incluir_ipi ? <Tag kind="ok">Sim</Tag> : <Tag kind="off">Não</Tag>) },
            {
              label: 'Situação',
              render: (r) => (
                <>
                  {r.validado ? <Tag kind="ok">Validada</Tag> : <Tag kind="warn">A validar</Tag>}
                  {r.user_editable && <Tag>Cliente informa</Tag>}
                  {!r.active && <Tag kind="off">Inativa</Tag>}
                </>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
