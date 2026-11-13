/** "09:05" -> 545 (minutes since midnight) */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 545 -> "9:05" ; pad=true -> "09:05" */
export function fromMinutes(min: number, pad = false): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad ? String(h).padStart(2, '0') : h}:${String(m).padStart(2, '0')}`;
}

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** "2026-11-10" -> "11/10(火)" */
export function formatDateJa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAY_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${wd})`;
}

export interface JstNow {
  date: string; // YYYY-MM-DD in JST
  minutes: number; // minutes since midnight in JST
  ms: number; // epoch milliseconds
}

/** Date + time in Japan Standard Time for an instant, regardless of the device time zone. */
export function jstParts(ms: number): { date: string; minutes: number } {
  const d = new Date(ms + 9 * 3600_000);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function jstNow(now: Date = new Date()): JstNow {
  return { ...jstParts(now.getTime()), ms: now.getTime() };
}

/** ISO instant -> "11/17(火) 23:59" in JST. Seconds are dropped (23:59:59 reads as 23:59). */
export function formatInstantJa(iso: string): string {
  const p = jstParts(Date.parse(iso));
  return `${formatDateJa(p.date)} ${fromMinutes(p.minutes)}`;
}
