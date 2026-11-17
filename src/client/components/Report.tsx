import { Fragment, useState } from 'react';
import type { CalcResult } from '../../shared/calc.ts';
import { brl, num, pct } from '../../shared/format.ts';

const Band = ({ children }: { children: string }) => <div className="band">{children}</div>;

type Row = [label: string, brlValue: number];

/** Tabela no padrão da planilha FORVM: descrição · moeda · R$, com linha de total. */
function MoneyTable({ moeda, taxa, rows, total, showMoeda = true }: { moeda: string; taxa: number; rows: Row[]; total?: Row; showMoeda?: boolean }) {
  const m = (v: number) => num(v / taxa);
  return (
    <table className="rep">
      <thead>
        <tr>
          <th>Descrição</th>
          {showMoeda && <th className="num">{moeda}</th>}
          <th className="num">R$</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([l, v]) => (
          <tr key={l}>
            <td>{l}</td>
            {showMoeda && <td className="num">{m(v)}</td>}
            <td className="num">{num(v)}</td>
          </tr>
        ))}
        {total && (
          <tr className="total">
            <td>{total[0]}</td>
            {showMoeda && <td className="num">{m(total[1])}</td>}
            <td className="num">{num(total[1])}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Corpo do relatório no layout da planilha pré-cálculo FORVM. */
export function ReportBody({ r }: { r: CalcResult }) {
  const g = r.dados_gerais;
  const M = g.moeda;
  const T = g.taxa;
  const showItems = r.itens.length > 1 || r.itens.some((i) => i.quantidade);
  const multiCond = r.icms_condicoes.length > 1;
  const freteNac = r.conta_ordem.frete_nacional;
  return (
    <div className="report-body">
      <dl className="panel">
        <div><dt>Origem</dt><dd>{g.origem_detalhe || g.origem}{g.origem_detalhe ? ` · ${g.origem}` : ''}</dd></div>
        <div><dt>NCM</dt><dd>{g.ncms.join('; ')}</dd></div>
        <div><dt>Destino</dt><dd>{g.destino_detalhe || '—'}</dd></div>
        <div><dt>Moeda</dt><dd>{M}{g.moeda_frete !== M ? ` · frete em ${g.moeda_frete}` : ''}</dd></div>
        <div><dt>Transporte</dt><dd>{g.modal}{g.transit_days ? ` · ${g.transit_days} dias` : ''}</dd></div>
        <div><dt>Peso bruto</dt><dd>{g.peso_bruto_kg ? `${num(g.peso_bruto_kg)} kg` : '—'}</dd></div>
        <div><dt>Taxa fiscal</dt><dd>{num(T, 4)}{g.moeda_frete !== M ? ` · ${g.moeda_frete} ${num(g.taxa_frete, 4)}` : ''}</dd></div>
        <div><dt>Incoterm</dt><dd>{g.incoterm}</dd></div>
        <div><dt>Tipo de operação</dt><dd>Conta e Ordem</dd></div>
        <div><dt>Frete tarifado</dt><dd>{num(r.frete.quantidade)} {r.frete.unidade}</dd></div>
        <div><dt>Finalidade</dt><dd>{g.finalidade}</dd></div>
        <div><dt>Seguro</dt><dd>{r.cif.seguro_tipo}</dd></div>
        <div><dt>Tributação</dt><dd>{g.regime}</dd></div>
        <div><dt>Operação</dt><dd>{g.condicao_icms}</dd></div>
      </dl>

      <Band>Valor da mercadoria</Band>
      <table className="rep">
        <thead>
          <tr>
            <th>Descrição</th>
            <th className="num">{M}</th>
            <th className="num">R$</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>FOB</td><td className="num">{num(r.cif.mercadoria_moeda)}</td><td className="num">{num(r.cif.mercadoria_brl)}</td></tr>
          <tr>
            <td>Frete internacional{r.frete.custos_origem_moeda ? <span className="help"> (inclui custos na origem)</span> : null}</td>
            <td className="num">{num(r.cif.frete_moeda)}</td>
            <td className="num">{num(r.cif.frete_brl)}</td>
          </tr>
          <tr><td>THC</td><td className="num">{num(r.cif.thc_moeda ?? 0)}</td><td className="num">{num(r.cif.thc_brl ?? 0)}</td></tr>
          <tr><td>Seguro</td><td className="num">{num(r.cif.seguro_moeda)}</td><td className="num">{num(r.cif.seguro_brl)}</td></tr>
          <tr className="total"><td>CIF</td><td className="num">{num(r.cif.total_moeda)}</td><td className="num">{num(r.cif.total_brl)}</td></tr>
        </tbody>
      </table>

      <Band>Impostos na nacionalização</Band>
      <MoneyTable
        moeda={M}
        taxa={T}
        rows={[
          ['II - Imposto de Importação', r.impostos.ii],
          ['IPI - Nacionalização', r.impostos.ipi],
          ['PIS - Nacionalização', r.impostos.pis],
          ['COFINS - Nacionalização', r.impostos.cofins],
          [`Siscomex${g.adicoes > 1 ? ` (${g.adicoes} adições)` : ''}`, r.impostos.siscomex],
        ]}
        total={['Total impostos na nacionalização', r.impostos.total]}
      />

      <Band>Despesas aduaneiras</Band>
      <MoneyTable
        moeda={M}
        taxa={T}
        rows={[
          ...(r.despesas.afrmm ? ([['AFRMM - Marinha Mercante', r.despesas.afrmm]] as Row[]) : []),
          ['Honorários FORVM', r.despesas.honorarios],
          [g.modal_code === 'AEREO' ? 'Armazenagem aeroporto' : 'Armazenagem porto', r.despesas.armazenagem],
          ['Taxas no destino', r.despesas.taxas_destino],
          ['Honorário despachante', r.despesas.despacho],
        ]}
        total={['Total despesas aduaneiras', r.despesas.total]}
      />

      <Band>Custos Conta e Ordem</Band>
      <MoneyTable
        moeda={M}
        taxa={T}
        showMoeda={false}
        rows={[
          ...(multiCond
            ? r.icms_condicoes.map((g): Row => [`ICMS pago · ${g.label} (${pct(g.aliquota_efetiva)})`, g.icms_pago])
            : ([['ICMS pago', r.conta_ordem.icms_pago]] as Row[])),
          ['Dif. IPI', r.conta_ordem.dif_ipi],
        ]}
        total={['Valor total custos Conta e Ordem', r.conta_ordem.icms_pago + r.conta_ordem.dif_ipi]}
      />
      {r.icms_condicoes.map((g) => (
        <p className="fine" key={g.code + g.divisor}>
          {multiCond ? `${g.label} (${g.itens.join(', ')}): ` : ''}base do ICMS {brl(g.base_inicial)} ÷ {num(g.divisor, 4)} = {brl(g.base_final)} · alíquota efetiva {pct(g.aliquota_efetiva)}
        </p>
      ))}

      <Band>Despesas nacionais</Band>
      <MoneyTable moeda={M} taxa={T} showMoeda={false} rows={[['Frete entrega mercadoria', freteNac]]} total={['Valor total despesas nacionais', freteNac]} />

      <div className="bar">
        <span>Desembolso total</span>
        <span>{brl(r.desembolso.total)}</span>
      </div>

      <Band>Destaque de impostos para crédito</Band>
      <MoneyTable
        moeda={M}
        taxa={T}
        rows={[
          ...(multiCond
            ? r.icms_condicoes.map((g): Row => [`Crédito de ICMS · ${g.label} (${pct(g.aliquota_credito)})`, r.creditos.icms ? g.icms_destaque : 0])
            : ([[`Crédito de ICMS (${pct(r.icms_condicoes[0]?.aliquota_credito)})`, r.creditos.icms]] as Row[])),
          ['Crédito de PIS', r.creditos.pis],
          ['Crédito de COFINS', r.creditos.cofins],
          ['Crédito de IPI', r.creditos.ipi],
        ]}
        total={['Valor total do crédito dos impostos', r.creditos.total]}
      />

      <div className="bar soft">
        <span>Custo líquido (desembolso − créditos)</span>
        <span>{brl(r.custo_liquido)}</span>
      </div>
      {!r.desembolso.inclui_cif && (
        <div className="bar soft">
          <span>Custo total líquido (com mercadoria)</span>
          <span>{brl(r.custo_total_liquido)}</span>
        </div>
      )}

      {showItems && (
        <>
          <Band>Custo por produto</Band>
          <div className="table-wrap">
            <table className="rep">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>NCM</th>
                  <th>Finalidade · ICMS</th>
                  <th className="num">{M}</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Custo total</th>
                  <th className="num">Créditos</th>
                  <th className="num">Custo líquido</th>
                  <th className="num">Unitário</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((i, k) => (
                  <tr key={k}>
                    <td>
                      {i.descricao}
                      {i.ex_tarifario && <span className="tag">EX</span>}
                    </td>
                    <td className="mono">{i.ncm}</td>
                    <td className="small">
                      {i.finalidade}
                      <br />
                      {i.icms.label} ({pct(i.icms.aliquota_efetiva)} / {pct(i.icms.aliquota_credito)})
                    </td>
                    <td className="num">{num(i.valor_moeda)}</td>
                    <td className="num">{i.quantidade ? num(i.quantidade, 0) : '—'}</td>
                    <td className="num">{num(i.custo_total)}</td>
                    <td className="num">{num(i.creditos.total)}</td>
                    <td className="num">
                      <b>{num(i.custo_liquido_total)}</b>
                    </td>
                    <td className="num">{i.custo_unitario != null ? brl(i.custo_unitario) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">Custo por produto inclui a mercadoria. Frete, seguro e despesas rateados pela participação de cada produto no valor; ICMS calculado com a condição de cada produto.</p>
        </>
      )}
    </div>
  );
}

export function Alertas({ r }: { r: CalcResult }) {
  const atencao = r.alertas.filter((a) => a.nivel === 'atencao');
  const info = r.alertas.filter((a) => a.nivel === 'info');
  return (
    <div className="alertas">
      {atencao.length > 0 && (
        <ul className="alert-list warn">
          {atencao.map((a, i) => (
            <li key={i}>{a.texto}</li>
          ))}
        </ul>
      )}
      <ul className="alert-list">
        {info.map((a, i) => (
          <li key={i}>{a.texto}</li>
        ))}
      </ul>
    </div>
  );
}

/** Memória de cálculo: cada valor com a fórmula e os números usados. */
export function Memoria({ r, collapsible = false }: { r: CalcResult; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const groups = [...new Set(r.memoria.map((m) => m.grupo))];
  if (collapsible && !open)
    return (
      <button type="button" className="btn small secondary" onClick={() => setOpen(true)}>
        Ver memória de cálculo ({r.memoria.length} linhas)
      </button>
    );
  return (
    <div className="table-wrap">
      <table className="rep memoria">
        <thead>
          <tr>
            <th>Item</th>
            <th>Fórmula</th>
            <th className="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr className="group">
                <td colSpan={3}>{g}</td>
              </tr>
              {r.memoria
                .filter((m) => m.grupo === g)
                .map((m, i) => (
                  <tr key={i}>
                    <td>{m.descricao}</td>
                    <td className="formula">{m.formula}</td>
                    <td className="num">{num(m.valor)}</td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
