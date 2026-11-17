import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { parseNumber } from '../../shared/format.ts';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  /** Máximo de casas decimais exibidas. */
  decimals?: number;
  /** Sempre exibe todas as casas (ex.: valores em moeda). */
  fixed?: boolean;
};

function show(v: number | null | undefined, decimals: number, fixed: boolean) {
  if (v == null || !Number.isFinite(v)) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: fixed ? decimals : 0, maximumFractionDigits: decimals }).format(v);
}

/** Campo numérico no formato brasileiro (1.234,56). Mantém o texto digitado enquanto o campo está em foco. */
export function NumberInput({ value, onChange, decimals = 2, fixed = false, onBlur, onFocus, ...rest }: Props) {
  const [text, setText] = useState(show(value, decimals, fixed));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(show(value, decimals, fixed));
  }, [value, focused, decimals, fixed]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
    />
  );
}
