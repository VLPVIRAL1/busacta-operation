import { useEffect, useState } from "react";

/**
 * Two-way debounced bridge between a URL-backed string value and a local
 * text input. Keeps the input snappy (no re-render delay) while only
 * pushing to the URL after `delay` ms of silence.
 *
 * Returns [localValue, setLocalValue]. `setLocalValue` updates instantly;
 * the URL writer fires after the debounce. When the URL value changes
 * externally (back/forward, deep link), local state follows.
 */
export function useDebouncedSearch(
  urlValue: string,
  setUrlValue: (v: string) => void,
  delay = 250,
): [string, (v: string) => void] {
  const [local, setLocal] = useState(urlValue);

  // URL → local (deep links / back nav)
  useEffect(() => {
    setLocal(urlValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlValue]);

  // local → URL (debounced)
  useEffect(() => {
    if (local === urlValue) return;
    const t = setTimeout(() => setUrlValue(local), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, delay]);

  return [local, setLocal];
}
