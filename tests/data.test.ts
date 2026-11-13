import { describe, expect, it } from 'vitest';
import { eventByNo, fixedSessions, placeById, program, sessionsByEvent } from '../src/data';
import { GRID_END, GRID_START, overlaps } from '../src/lib/layout';
import { toMinutes } from '../src/lib/time';

describe('program.json', () => {
  it('has the 57 published events, 14 with advance application and 4 with tickets', () => {
    expect(program.events).toHaveLength(57);
    expect(program.events.filter((e) => e.apply)).toHaveLength(14);
    expect(program.events.filter((e) => e.ticket)).toHaveLength(4);
  });

  it('gives every event at least one selectable session with a unique id', () => {
    for (const e of program.events) expect(sessionsByEvent.get(e.no)?.length, e.no).toBeGreaterThan(0);
    const ids = program.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of program.sessions) expect(eventByNo.has(s.event), s.id).toBe(true);
  });

  it('keeps fixed sessions on the grid, on 5-minute steps, without overlaps in a room', () => {
    for (const s of fixedSessions) {
      expect(placeById.has(s.place!), s.id).toBe(true);
      expect(toMinutes(s.start) % 5 + toMinutes(s.end) % 5, s.id).toBe(0);
      expect(toMinutes(s.start) >= GRID_START && toMinutes(s.end) <= GRID_END && toMinutes(s.start) < toMinutes(s.end), s.id).toBe(true);
    }
    for (const a of fixedSessions) for (const b of fixedSessions) {
      if (a.id < b.id && a.place === b.place) expect(overlaps(a, b), `${a.id} ${b.id}`).toBe(false);
    }
  });

  it('has a deadline and a booking URL for every application that is not pending', () => {
    for (const e of program.events) {
      if (!e.apply || e.apply.pending) continue;
      expect(Number.isFinite(Date.parse(e.apply.end ?? '')), e.no).toBe(true);
      expect(e.apply.url, e.no).toMatch(/^https:\/\//);
    }
  });

  it('marks who needs what on sessions of partially restricted events', () => {
    const needs = (id: string) => program.sessions.find((s) => s.id === id)?.needs;
    expect([needs('04/1'), needs('04/2')]).toEqual(['first', 'ticket']);
    expect([needs('40'), needs('40/1')]).toEqual([undefined, 'ticket']);
    expect([needs('45'), needs('45/L1'), needs('45/M')]).toEqual([undefined, 'apply', 'ticket']);
    expect([needs('05'), needs('51'), needs('14/1')]).toEqual(['apply', undefined, 'apply']);
  });
});
