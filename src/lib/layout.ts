import type { AreaId, Place, Session } from '../types';
import { toMinutes } from './time';

/** Grid geometry. Times are minutes since midnight. */
export const GRID_START = 10 * 60; // 10:00
export const GRID_END = 15 * 60 + 30; // 15:30
export const SLOT_MIN = 15; // one visible row = 15 minutes
export const SUB_MIN = 5; // internal resolution (10:05 starts exist)
export const SLOT_PX = 42; // pixel height of a 15-minute row (15-minute talks must stay readable)
export const SUB_PX = SLOT_PX / (SLOT_MIN / SUB_MIN);
export const VENUE_COL_MIN_PX = 96;
export const TIME_COL_PX = 44;
export const HEADER_PX = 52;

export const SUB_COUNT = (GRID_END - GRID_START) / SUB_MIN;

/** Labels for the time column: one per 15-minute row. */
export function timeSlots(): number[] {
  const out: number[] = [];
  for (let t = GRID_START; t < GRID_END; t += SLOT_MIN) out.push(t);
  return out;
}

/** Vertical pixel offset (from the top of the grid body) for a time. Clamped to the grid. */
export function minutesToOffset(min: number): number {
  const clamped = Math.min(Math.max(min, GRID_START), GRID_END);
  return ((clamped - GRID_START) / SUB_MIN) * SUB_PX;
}

export interface CardRect {
  top: number;
  height: number;
}

interface Span {
  start: string;
  end: string;
}

/** Card position inside the grid body, proportional to the duration. */
export function cardRect(session: Span): CardRect {
  const top = minutesToOffset(toMinutes(session.start));
  const bottom = minutesToOffset(toMinutes(session.end));
  return { top, height: Math.max(bottom - top, SUB_PX) };
}

export const LANE_COL_PX = 34; // narrow column of an all-day (drop-in) event

/**
 * A column of the timetable: a room with fixed-time slots, or a narrow lane that holds
 * one all-day (drop-in) event.
 */
export type Column =
  | { kind: 'place'; key: string; area: AreaId; place: Place }
  | { kind: 'lane'; key: string; area: AreaId; session: Session; code: string };

/** Short location for a lane header: the building code ("C-1") or the first characters of the place. */
export function laneCode(placeText: string): string {
  const m = /^([ESCW]-\d+)/.exec(placeText);
  return m ? m[1] : placeText.replace(/[「（(].*$/, '').slice(0, 3);
}

/** Columns in display order: per area, its rooms first, then one lane per drop-in session. */
export function buildColumns(
  areas: AreaId[],
  places: Place[],
  sessions: Session[],
  areaOf: (s: Session) => AreaId,
  placeTextOf: (s: Session) => string,
): Column[] {
  const out: Column[] = [];
  for (const area of areas) {
    for (const p of places) if (p.area === area) out.push({ kind: 'place', key: 'p:' + p.id, area, place: p });
    const lanes = sessions.filter((s) => s.open && areaOf(s) === area).sort((a, b) => a.id.localeCompare(b.id));
    for (const s of lanes) out.push({ kind: 'lane', key: 'l:' + s.id, area, session: s, code: laneCode(placeTextOf(s)) });
  }
  return out;
}

/** Pixel widths: lanes are fixed, rooms share the rest (never below the minimum). */
export function columnWidths(columns: Column[], available: number): number[] {
  const lanes = columns.filter((c) => c.kind === 'lane').length;
  const rooms = columns.length - lanes;
  const room = Math.max(VENUE_COL_MIN_PX, rooms > 0 ? Math.floor((available - TIME_COL_PX - lanes * LANE_COL_PX) / rooms) : 0);
  return columns.map((c) => (c.kind === 'lane' ? LANE_COL_PX : room));
}

export interface AreaGroup<T> {
  area: AreaId;
  places: T[];
}

/** Consecutive columns grouped by area (for the two-row header). */
export function groupByArea<T extends { area: AreaId }>(places: T[]): AreaGroup<T>[] {
  const groups: AreaGroup<T>[] = [];
  for (const p of places) {
    const last = groups[groups.length - 1];
    if (last && last.area === p.area) last.places.push(p);
    else groups.push({ area: p.area, places: [p] });
  }
  return groups;
}

/** Two spans overlap when their time ranges intersect (touching ends do not count). */
export function overlaps(a: Span, b: Span): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

export interface TimeItem extends Span {
  id: string;
  area: AreaId;
}

/** IDs of items that overlap with at least one other item in the list. */
export function conflictingIds(items: TimeItem[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (overlaps(items[i], items[j])) {
        out.add(items[i].id);
        out.add(items[j].id);
      }
    }
  }
  return out;
}

export function sortByStart<T extends TimeItem>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end) || a.id.localeCompare(b.id));
}

export interface AreaMove {
  toId: string;
  from: AreaId;
  to: AreaId;
  /** minutes between the end of the previous item and the start of the next (may be negative) */
  gapMinutes: number;
}

/** Area changes between consecutive items (E → W etc.). Input must be sorted by start time. */
export function areaMoves(items: TimeItem[]): AreaMove[] {
  const moves: AreaMove[] = [];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const next = items[i];
    if (prev.area !== next.area) {
      moves.push({ toId: next.id, from: prev.area, to: next.area, gapMinutes: toMinutes(next.start) - toMinutes(prev.end) });
    }
  }
  return moves;
}
