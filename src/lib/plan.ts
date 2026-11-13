import type { AreaId, EventInfo, Session } from '../types';
import { areaMoves, conflictingIds, sortByStart, type AreaMove } from './layout';
import { fromMinutes, toMinutes } from './time';

/** One row of My Schedule. */
export interface PlanItem {
  /** the selection entry = Session.id */
  id: string;
  session: Session;
  event: EventInfo;
  area: AreaId;
  start: string;
  end: string;
  /** has a definite time: a fixed slot, or a drop-in session the visitor pinned to a time */
  timed: boolean;
  /** the time was chosen by the visitor (drop-in session) */
  custom: boolean;
  /** the chosen time falls outside the opening hours (e.g. in the lunch break) */
  offHours: boolean;
}

export interface Lookup {
  sessionById: Map<string, Session>;
  eventByNo: Map<string, EventInfo>;
  areaOf: (s: Session) => AreaId;
}

const HHMM = /^\d{2}:\d{2}$/;

/** Opening hours of a drop-in session: one range, or several when there is a break. */
export function openingHours(s: Session): [string, string][] {
  return s.hours ?? [[s.start, s.end]];
}

/** "10:00–12:00 ／ 13:00–15:30" */
export function hoursText(s: Session): string {
  return openingHours(s)
    .map(([a, b]) => `${a}–${b}`)
    .join(' ／ ');
}

/** Is the session running at this time? The closing minute itself counts as closed. */
export function isOpenAt(s: Session, time: string): boolean {
  const t = toMinutes(time);
  return openingHours(s).some(([a, b]) => toMinutes(a) <= t && t < toMinutes(b));
}

/** Resolve a selection entry against the program; null when the session no longer exists. */
export function resolveItem(id: string, times: Record<string, string>, db: Lookup): PlanItem | null {
  const session = db.sessionById.get(id);
  const event = session && db.eventByNo.get(session.event);
  if (!session || !event) return null;
  const base = { id, session, event, area: db.areaOf(session) };
  if (!session.open) return { ...base, start: session.start, end: session.end, timed: true, custom: false, offHours: false };
  const t = times[id];
  if (t && HHMM.test(t)) {
    const end = Math.min(toMinutes(t) + (session.visit ?? 30), 24 * 60 - 1);
    return { ...base, start: t, end: fromMinutes(end, true), timed: true, custom: true, offHours: !isOpenAt(session, t) };
  }
  return { ...base, start: session.start, end: session.end, timed: false, custom: false, offHours: false };
}

export interface Plan {
  /** items with a definite time, sorted */
  timed: PlanItem[];
  /** drop-in items without a chosen time, in event-number order */
  free: PlanItem[];
  conflicts: Set<string>;
  /** area change that happens right before the item with this id */
  moveBefore: Map<string, AreaMove>;
}

export function buildPlan(selected: string[], times: Record<string, string>, db: Lookup): Plan {
  const items = selected.map((id) => resolveItem(id, times, db)).filter((x): x is PlanItem => !!x);
  const timed = sortByStart(items.filter((x) => x.timed));
  const free = items.filter((x) => !x.timed).sort((a, b) => a.id.localeCompare(b.id));
  const moveBefore = new Map<string, AreaMove>();
  for (const m of areaMoves(timed)) moveBefore.set(m.toId, m);
  return { timed, free, conflicts: conflictingIds(timed), moveBefore };
}

/** Event numbers that have at least one selected session. */
export function selectedEvents(selected: string[], db: Lookup): Set<string> {
  const out = new Set<string>();
  for (const id of selected) {
    const s = db.sessionById.get(id);
    if (s) out.add(s.event);
  }
  return out;
}
