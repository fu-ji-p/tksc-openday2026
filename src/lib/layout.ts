import type { AreaId, Place } from '../types';
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

export interface AreaGroup {
  area: AreaId;
  places: Place[];
}

/** Consecutive places grouped by area (for the two-row header). */
export function groupByArea(places: Place[]): AreaGroup[] {
  const groups: AreaGroup[] = [];
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
