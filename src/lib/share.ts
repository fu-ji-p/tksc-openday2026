import type { MyApply } from '../types';
import { sanitize, type ScheduleState } from './storage';

const CODE: Record<MyApply, string> = { applied: 'a', won: 'w', lost: 'l' };
const DECODE: Record<string, MyApply> = { a: 'applied', w: 'won', l: 'lost' };

/**
 * URL that carries the whole record in its hash (nothing is sent to a server; Pages logs never see it).
 *   #s=12,14/2&t=12@1130&a=14w,19a
 */
export function shareUrl(state: ScheduleState, base: string = window.location.href): string {
  const u = new URL(base);
  u.search = '';
  const parts: string[] = [];
  if (state.selected.length > 0) parts.push('s=' + state.selected.join(','));
  const times = Object.entries(state.times).filter(([id]) => state.selected.includes(id));
  if (times.length > 0) parts.push('t=' + times.map(([id, t]) => `${id}@${t.replace(':', '')}`).join(','));
  const apply = Object.entries(state.apply);
  if (apply.length > 0) parts.push('a=' + apply.map(([no, v]) => no + CODE[v]).join(','));
  u.hash = parts.join('&');
  return u.toString();
}

/** Record carried by a share link, or null when the hash has none. */
export function parseShareHash(hash: string): ScheduleState | null {
  const raw = hash.replace(/^#/, '');
  if (!/(^|&)[sa]=/.test(raw)) return null;
  const q = new Map(
    raw.split('&').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))] as const;
    }),
  );
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
  const times: Record<string, string> = {};
  for (const x of list('t')) {
    const m = /^(.+)@(\d{2})(\d{2})$/.exec(x);
    if (m) times[m[1]] = `${m[2]}:${m[3]}`;
  }
  const apply: Record<string, string> = {};
  for (const x of list('a')) {
    const v = DECODE[x.slice(-1)];
    if (v) apply[x.slice(0, -1)] = v;
  }
  return sanitize({ selected: list('s'), times, apply });
}
