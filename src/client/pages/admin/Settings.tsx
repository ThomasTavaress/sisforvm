import { useEffect, useState } from 'react';
import { siscomexFor, type Settings } from '../../../shared/domain.ts';
import { brl } from '../../../shared/format.ts';
import { NumberInput } from '../../components/NumberInput.tsx';
import { Alert, Card, Loading, PageHeader } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useData, useDocumentTitle } from '../../lib/hooks.ts';
import { useSession } from '../../lib/session.tsx';
import { useToast } from '../../lib/toast.tsx';

export function SettingsPage() {
  useDocumentTitle('Parâmetros');
  const { data, error } = useData<Settings>('/api/settings');
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const { refresh } = useSession();
  useEffect(() => {
    setS(data);
  }, [data]);
  if (error) return <Alert kind="err">{error}</Alert>;
  if (!s) return <Loading />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const n = (k: keyof Settings, v: number | null) => set(k, (v ?? 0) as never);

  return (
    <>
      <PageHeader
        title="Parâmetros gerais"
        sub="Valem para todos os clientes e entram nos novos estudos. Estudos já salvos guardam os parâmetros da época e não mudam."
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api.put('/api/settings', s);
            await refresh();
            toast('Parâmetros salvos.');
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      >
        <Card title="Premissas de cálculo (decisão da FORVM)">
          <fieldset className="choice">
            <legend>O desembolso total inclui o valor CIF?</legend>
            <label>
              <input type="radio" checked={s.desembolso_inclui_cif} onChange={() => set('desembolso_inclui_cif', true)} />
              <span>
                <b>Sim</b>: desembolso = CIF + impostos + despesas + ICMS + dif. IPI + frete nacional. O custo líquido é o custo total da importação.
              </span>
            </label>
            <label>
              <input type="radio" checked={!s.desembolso_inclui_cif} onChange={() => set('desembolso_inclui_cif', false)} />
              <span>
                <b>Não</b> (como no <i>motor-calculo-saida.md</i>): desembolso = só impostos, despesas, custos Conta e Ordem e frete nacional. O relatório mostra também o custo total com mercadoria.
              </span>
            </label>
          </fieldset>
          <fieldset className="choice">
            <legend>Base do seguro “completo” (valor total do processo)</legend>
            <label>
              <input type="radio" checked={s.seguro_completo_base === 'CUSTO_TOTAL'} onChange={() => set('seguro_completo_base', 'CUSTO_TOTAL')} />
              <span>
                <b>Custo total do processo</b>: CIF + impostos + despesas + ICMS + dif. IPI + frete nacional.
              </span>
            </label>
            <label>
              <input type="radio" checked={s.seguro_completo_base === 'CIF_IMPOSTOS'} onChange={() => set('seguro_completo_base', 'CIF_IMPOSTOS')} />
              <span>
                <b>CIF + tributos federais</b>: CIF + II + IPI + PIS + COFINS.
              </span>
            </label>
          </fieldset>
        </Card>

        <Card title="Taxa Siscomex">
          <p className="sub">
            Valor por DI + valor por adição conforme a faixa. O simulador conta uma adição por NCM distinta. Com os valores atuais: 1 NCM = {brl(siscomexFor(1, s))} · 2 NCMs = {brl(siscomexFor(2, s))} · 3 NCMs ={' '}
            {brl(siscomexFor(3, s))}.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sisdi">Valor por DI (R$)</label>
              <NumberInput id="sisdi" value={s.siscomex_di_brl} fixed onChange={(v) => n('siscomex_di_brl', v)} />
            </div>
          </div>
          <table className="list tiers">
            <thead>
              <tr>
                <th>Adições</th>
                <th className="num">Valor por adição (R$)</th>
              </tr>
            </thead>
            <tbody>
              {s.siscomex_adicoes.map((f, i) => {
                const de = i === 0 ? 1 : (s.siscomex_adicoes[i - 1].ate ?? 0) + 1;
                return (
                  <tr key={i}>
                    <td>{f.ate == null ? `a partir da ${de}ª` : de === f.ate ? `${de}ª` : `da ${de}ª à ${f.ate}ª`}</td>
                    <td className="num">
                      <NumberInput
                        aria-label={`Valor da faixa ${i + 1}`}
                        value={f.valor}
                        fixed
                        className="right"
                        onChange={(v) => set('siscomex_adicoes', s.siscomex_adicoes.map((x, k) => (k === i ? { ...x, valor: v ?? 0 } : x)))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card title="Valores padrão">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="seg">Seguro (% da base)</label>
              <NumberInput id="seg" value={s.seguro_pct} decimals={4} onChange={(v) => n('seguro_pct', v)} />
            </div>
            <div className="field">
              <label htmlFor="afr">AFRMM (% do frete marítimo)</label>
              <NumberInput id="afr" value={s.afrmm_pct} decimals={4} onChange={(v) => n('afrmm_pct', v)} />
            </div>
            <div className="field">
              <label htmlFor="afrfx">AFRMM · taxa fixa (R$)</label>
              <NumberInput id="afrfx" value={s.afrmm_taxa_fixa_brl} fixed onChange={(v) => n('afrmm_taxa_fixa_brl', v)} />
              <span className="help">Somada ao % (R$ 20,00 nas simulações FORVM). O % é truncado em centavos.</span>
            </div>
            <div className="field">
              <label htmlFor="cub">Cubagem aérea (kg por m³)</label>
              <NumberInput id="cub" value={s.fator_cubagem_aereo} decimals={0} onChange={(v) => n('fator_cubagem_aereo', v)} />
            </div>
            <div className="field">
              <label htmlFor="wm">LCL: kg equivalentes a 1 CBM (W/M)</label>
              <NumberInput id="wm" value={s.kg_por_cbm_lcl} decimals={0} onChange={(v) => n('kg_por_cbm_lcl', v)} />
            </div>
            <div className="field full">
              <label htmlFor="ct">Contato FORVM exibido ao cliente</label>
              <input id="ct" value={s.contato_forvm} onChange={(e) => set('contato_forvm', e.target.value)} />
            </div>
          </div>
        </Card>
        {err && <Alert kind="err">{err}</Alert>}
        <div className="form-actions">
          <button className="btn">Salvar parâmetros</button>
        </div>
      </form>
    </>
  );
}
