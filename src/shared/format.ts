// Formatação pt-BR, usada no cálculo (memória) e na interface.

const cache = new Map<number, Intl.NumberFormat>();
function nf(d: number): Intl.NumberFormat {
  let f = cache.get(d);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    cache.set(d, f);
  }
  return f;
}

/**
 * Arredondamento comercial (meio para longe do zero) como o Excel: considera 15 dígitos
 * significativos, então 82.794,565 vira 82.794,57 mesmo sendo 82.794,56499… em binário.
 */
export function roundHalf(v: number, d = 2): number {
  if (!Number.isFinite(v)) return 0;
  const sign = v < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(v).toPrecision(15)}e${d}`);
  return sign * Number(`${Math.round(shifted)}e-${d}`);
}

export const num = (v: number | null | undefined, d = 2): string => nf(d).format(roundHalf(Number.isFinite(v as number) ? (v as number) : 0, d));
export const brl = (v: number | null | undefined): string => `R$ ${num(v)}`;
export const money = (cur: string, v: number | null | undefined): string => `${cur} ${num(v)}`;

/** Percentual com casas decimais só quando necessárias: 1,4% · 4% · 9,65%. */
export function pct(v: number | null | undefined): string {
  const n = Number(v) || 0;
  const s = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n);
  return `${s}%`;
}

/** Converte texto digitado em pt-BR ("1.234,56", "5,3", "5.35") em número. Vazio → null. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!t) return null;
  let s = t;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function dateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
export function dateBR(iso: string | null | undefined): string {
  return dateTimeBR(iso).split(' ')[0] ?? '';
}
