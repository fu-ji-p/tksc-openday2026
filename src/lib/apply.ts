import type { ApplyInfo, ApplyMethod, EventInfo, MyApply } from '../types';
import { formatInstantJa } from './time';

/** Where an advance application stands right now. Same rule as the official site. */
export type ApplyPhase = 'pending' | 'before' | 'open' | 'closed';

export const PHASE_LABEL: Record<ApplyPhase, string> = {
  pending: '準備中',
  before: '受付開始前',
  open: '受付中',
  closed: '受付終了',
};

export const METHOD_LABEL: Record<ApplyMethod, string> = {
  lottery: '抽選',
  first: '先着順',
  tbd: '未発表',
};

export const MY_APPLY_LABEL: Record<MyApply, string> = {
  applied: '申込済',
  won: '当選・予約確定',
  lost: '落選',
};

export function applyPhase(ap: ApplyInfo, nowMs: number): ApplyPhase {
  if (ap.pending || !ap.end) return 'pending';
  if (ap.start && nowMs < Date.parse(ap.start)) return 'before';
  return nowMs < Date.parse(ap.end) ? 'open' : 'closed';
}

/** "あと3日" / "あと5時間" / "あと20分" until an instant; null when it has passed. */
export function remaining(iso: string, nowMs: number): string | null {
  const ms = Date.parse(iso) - nowMs;
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min >= 48 * 60) return `あと${Math.floor(min / 1440)}日`;
  if (min >= 60) return `あと${Math.floor(min / 60)}時間`;
  return `あと${Math.max(min, 1)}分`;
}

/** Deadline within 3 days (and still open). */
export function isUrgent(ap: ApplyInfo, nowMs: number): boolean {
  return applyPhase(ap, nowMs) === 'open' && Date.parse(ap.end!) - nowMs < 3 * 86_400_000;
}

const PHASE_ORDER: Record<ApplyPhase, number> = { open: 0, before: 1, pending: 2, closed: 3 };

/** Events that take applications: open ones first by deadline, then not-yet-open, undecided, closed. */
export function sortForApplying(events: EventInfo[], nowMs: number): EventInfo[] {
  const key = (e: EventInfo): [number, number] => {
    const ph = applyPhase(e.apply!, nowMs);
    const t = ph === 'before' ? Date.parse(e.apply!.start!) : e.apply!.end ? Date.parse(e.apply!.end) : 0;
    return [PHASE_ORDER[ph], t];
  };
  return events
    .filter((e) => e.apply)
    .slice()
    .sort((a, b) => {
      const [a0, a1] = key(a);
      const [b0, b1] = key(b);
      return a0 - b0 || a1 - b1 || a.no.localeCompare(b.no);
    });
}

/** One-line deadline text: "締切 11/17(火) 23:59（あと3日）" / "受付開始 11/16(月) 12:00" / "準備中". */
export function deadlineText(ap: ApplyInfo, nowMs: number): string {
  const ph = applyPhase(ap, nowMs);
  if (ph === 'pending') return '申込方法は準備中';
  if (ph === 'before') return `受付開始 ${formatInstantJa(ap.start!)} ／ 締切 ${formatInstantJa(ap.end!)}`;
  if (ph === 'closed') return `${formatInstantJa(ap.end!)} に受付終了`;
  const left = remaining(ap.end!, nowMs);
  return `締切 ${formatInstantJa(ap.end!)}${left ? `（${left}）` : ''}`;
}
