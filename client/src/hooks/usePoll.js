import { useEffect, useState, useRef } from 'react';

export function usePoll(fn, intervalMs, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer;
    const run = async () => {
      try {
        const result = await fn();
        if (mounted.current) { setData(result); setError(null); }
      } catch (e) {
        if (mounted.current) setError(e);
      } finally {
        if (mounted.current && intervalMs) timer = setTimeout(run, intervalMs);
      }
    };
    run();
    return () => { mounted.current = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
