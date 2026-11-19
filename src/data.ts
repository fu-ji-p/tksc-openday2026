import programJson from '../data/program.json';
import updatesJson from '../data/updates.json';
import type { UpdateEntry, AreaId, EventInfo, Needs, Place, Program, Session } from './types';

export const program = programJson as unknown as Program;
export const DATE = program.event.date;
/** changes found on the official site, newest first */
export const updates = updatesJson as UpdateEntry[];
export const LATEST_UPDATE = updates[0]?.date ?? '';
export const placeById = new Map<string, Place>(program.places.map((p) => [p.id, p]));
export const eventByNo = new Map<string, EventInfo>(program.events.map((e) => [e.no, e]));
export const sessionById = new Map<string, Session>(program.sessions.map((s) => [s.id, s]));
export const fixedSessions = program.sessions.filter((s) => !s.open);

export const sessionsByEvent = new Map<string, Session[]>(program.events.map((e) => [e.no, []]));
for (const s of program.sessions) sessionsByEvent.get(s.event)?.push(s);

export const NEEDS_LABEL: Record<Needs, string> = {
  apply: '事前申込',
  ticket: '整理券',
  first: '先着順',
};

export function sessionArea(s: Session): AreaId {
  return (s.place ? placeById.get(s.place)?.area : s.area) ?? eventByNo.get(s.event)?.areas[0] ?? 'E';
}

/** "E-2 広報・情報棟 視聴覚室" for a grid place; the official place text for drop-in sessions. */
export function sessionPlace(s: Session): string {
  const p = s.place ? placeById.get(s.place) : undefined;
  if (p) return [p.code === p.building ? '' : p.code, p.building, p.room].filter(Boolean).join(' ');
  return (eventByNo.get(s.event)?.placeText ?? '').replace(/\n/g, ' / ');
}

/** "② 宇宙飛行士講演" / "ラウンジ"つなぐ" ① — 来場者みんなで…" */
export function sessionTitle(s: Session): string {
  const title = eventByNo.get(s.event)?.title ?? s.event;
  const head = [s.sub, s.label].filter(Boolean).join(' ');
  if (!head) return title;
  return s.sub ? `${head} — ${title}` : `${head} ${title}`;
}
