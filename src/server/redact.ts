// O que o cliente NÃO pode ver: a negociação da FORVM (honorários e despacho).
// Aplicado no servidor em tudo que sai para um usuário de cliente.
import type { CalcInput, CalcResult } from '../shared/calc.ts';
import type { Client, StudyForm } from '../shared/domain.ts';

export function redactClient(c: Client): Client {
  return { ...c, despacho_brl: 0, honorarios_fixo: 0, honorarios_pct: 0, honorarios_min: 0 };
}

export function redactForm(f: StudyForm): StudyForm {
  const { honorarios_manual_brl: _omit, ...rest } = f;
  return rest as StudyForm;
}

export function redactInput(i: CalcInput): CalcInput {
  return { ...i, honorarios: { fixo: 0, pct: 0, min: 0 }, honorarios_manual: false, despacho_brl: 0 };
}

/** O valor dos honorários continua aparecendo; a fórmula (% e mínimo) e os alertas internos, não. */
export function redactResult(r: CalcResult): CalcResult {
  return {
    ...r,
    memoria: r.memoria.map((m) => (m.descricao === 'Honorários FORVM' ? { ...m, formula: 'conforme negociação' } : m)),
    alertas: r.alertas.filter((a) => !a.privado),
  };
}
