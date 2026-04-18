import { useEffect, useRef } from 'react';

export default function usePolling(fetchFunction, intervalMs = 30000, enabled = true) {
  const savedCallback = useRef(fetchFunction);

  useEffect(() => {
    savedCallback.current = fetchFunction;
  }, [fetchFunction]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
      }
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
