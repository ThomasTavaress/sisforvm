import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';

/** Carrega dados de uma URL; `reload` refaz a chamada. `url = null` não carrega. */
export function useData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await api.get<T>(url);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · FORVM` : 'FORVM · Simulador de Custos de Importação';
  }, [title]);
}
