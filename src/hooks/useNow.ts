import { useEffect, useState } from 'react';
import { jstNow, type JstNow } from '../lib/time';

/**
 * For testing date-dependent behaviour (application deadlines, the "now" line):
 * open the app with ?now=2026-11-28T10:30 (interpreted as JST wall-clock time).
 */
function debugNow(): JstNow | null {
  try {
    const v = new URLSearchParams(window.location.search).get('now');
    const m = v && /^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) return null;
    const ms = Date.parse(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+09:00`);
    return { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]), ms };
  } catch {
    return null;
  }
}

/** JST clock that updates once a minute (and when the tab becomes visible again). */
export function useNow(): JstNow {
  const [now, setNow] = useState<JstNow>(() => debugNow() ?? jstNow());
  useEffect(() => {
    if (debugNow()) return;
    const tick = () => setNow(jstNow());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}
