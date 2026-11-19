import { useEffect, useState } from 'react';

/**
 * When the official site was last checked (public/checked.json, rewritten by every scheduled check
 * even when nothing changed). Fetched at run time so it is current even when the app bundle is not.
 */
let request: Promise<string | null> | null = null;

function load(): Promise<string | null> {
  request ??= fetch(`${import.meta.env.BASE_URL}checked.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { checkedAt?: unknown } | null) => (j && typeof j.checkedAt === 'string' && !Number.isNaN(Date.parse(j.checkedAt)) ? j.checkedAt : null))
    .catch(() => null);
  return request;
}

export function useLastChecked(): string | null {
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setCheckedAt(v));
    return () => {
      alive = false;
    };
  }, []);
  return checkedAt;
}
