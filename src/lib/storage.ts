import type { MyApply } from '../types';

export const STORAGE_KEY = 'tksc-openday2026.schedule.v1';

/** Everything a visitor records. Stored as one JSON value in localStorage. */
export interface ScheduleState {
  /** selected Session ids, e.g. ["12", "14/2"] */
  selected: string[];
  /** visitor-chosen start time for drop-in sessions: { "12": "11:30" } */
  times: Record<string, string>;
  /** own application status per event number: { "14": "won" } */
  apply: Record<string, MyApply>;
}

export interface ScheduleFile extends ScheduleState {
  updatedAt: string; // ISO 8601
}

export const EMPTY: ScheduleState = { selected: [], times: {}, apply: {} };

/** Minimal subset of the Web Storage API so the functions can be tested without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// event number ("14", or with a branch number "10-1"), optionally '/' + slot key
const EVENT_RE = /^\d{2}(-\d{1,2})?$/;
const ID_RE = /^\d{2}(-\d{1,2})?(\/[A-Za-z0-9]{1,4})?$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const APPLY = new Set<string>(['applied', 'won', 'lost']);

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Keep only well-formed entries. IDs that are not in the current program are kept (see useSchedule). */
export function sanitize(obj: unknown): ScheduleState | null {
  const o = record(obj);
  if (!Array.isArray(o.selected)) return null;
  const selected = Array.from(new Set(o.selected.filter((x): x is string => typeof x === 'string' && ID_RE.test(x))));
  const times: Record<string, string> = {};
  for (const [k, v] of Object.entries(record(o.times))) if (ID_RE.test(k) && typeof v === 'string' && TIME_RE.test(v)) times[k] = v;
  const apply: Record<string, MyApply> = {};
  for (const [k, v] of Object.entries(record(o.apply))) if (EVENT_RE.test(k) && typeof v === 'string' && APPLY.has(v)) apply[k] = v as MyApply;
  return { selected, times, apply };
}

/** Validate arbitrary JSON (from localStorage or an imported file). Returns null when unusable. */
export function parseScheduleJson(text: string | null | undefined): ScheduleFile | null {
  if (!text) return null;
  try {
    const obj: unknown = JSON.parse(text);
    const state = sanitize(obj);
    if (!state) return null;
    const u = record(obj).updatedAt;
    return { ...state, updatedAt: typeof u === 'string' ? u : new Date(0).toISOString() };
  } catch {
    return null;
  }
}

/** State from storage; empty when missing or broken. */
export function loadSchedule(storage: StorageLike | null | undefined): ScheduleState {
  try {
    const f = parseScheduleJson(storage?.getItem(STORAGE_KEY));
    return f ? { selected: f.selected, times: f.times, apply: f.apply } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function serializeSchedule(state: ScheduleState, now: Date = new Date()): string {
  const file: ScheduleFile = {
    selected: Array.from(new Set(state.selected)),
    times: state.times,
    apply: state.apply,
    updatedAt: now.toISOString(),
  };
  return JSON.stringify(file, null, 2);
}

export function saveSchedule(storage: StorageLike | null | undefined, state: ScheduleState, now: Date = new Date()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, serializeSchedule(state, now));
    return true;
  } catch {
    return false; // e.g. private mode / quota exceeded: keep working in memory
  }
}
