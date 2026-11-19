import { describe, expect, it } from 'vitest';
import { LATEST_UPDATE, eventByNo, fixedSessions, placeById, program, sessionsByEvent, updates } from '../src/data';
import { GRID_END, GRID_START, overlaps } from '../src/lib/layout';
import { toMinutes } from '../src/lib/time';

describe('program.json', () => {
  it('has the 58 published events, 14 with advance application and 4 with tickets', () => {
    expect(program.events).toHaveLength(58);
    expect(program.events.filter((e) => e.apply)).toHaveLength(14);
    expect(program.events.filter((e) => e.ticket)).toHaveLength(4);
  });

  it('gives every event at least one selectable session with a unique id', () => {
    for (const e of program.events) expect(sessionsByEvent.get(e.no)?.length, e.no).toBeGreaterThan(0);
    const ids = program.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of program.sessions) expect(eventByNo.has(s.event), s.id).toBe(true);
  });

  it('keeps fixed sessions on the grid, on 5-minute steps, without two events overlapping in a room', () => {
    for (const s of fixedSessions) {
      expect(placeById.has(s.place!), s.id).toBe(true);
      expect(toMinutes(s.start) % 5 + toMinutes(s.end) % 5, s.id).toBe(0);
      expect(toMinutes(s.start) >= GRID_START && toMinutes(s.end) <= GRID_END && toMinutes(s.start) < toMinutes(s.end), s.id).toBe(true);
    }
    for (const a of fixedSessions) for (const b of fixedSessions) {
      // slots of one event may overlap (rolling starts, e.g. 23); the grid then draws each up to the next start
      if (a.id < b.id && a.event !== b.event && a.place === b.place) expect(overlaps(a, b), `${a.id} ${b.id}`).toBe(false);
    }
  });

  it('has a deadline and a booking URL for every application that is not pending', () => {
    for (const e of program.events) {
      if (!e.apply || e.apply.pending) continue;
      expect(Number.isFinite(Date.parse(e.apply.end ?? '')), e.no).toBe(true);
      expect(e.apply.url, e.no).toMatch(/^https:\/\//);
    }
  });

  it('gives every ticketed event hand-out times that sit in a grid column before the sessions they are for', () => {
    for (const e of program.events) {
      if (!e.ticket) continue;
      expect(e.ticket.slots?.length, e.no).toBeGreaterThan(0);
      const ticketed = fixedSessions.filter((s) => s.event === e.no && s.needs === 'ticket');
      for (const t of e.ticket.slots!) {
        expect(placeById.has(t.place), e.no).toBe(true);
        expect(toMinutes(t.time) >= GRID_START && toMinutes(t.time) % 5 === 0, e.no).toBe(true);
        expect(e.ticket.time, e.no).toContain(t.time);
        // the marker (15 minutes tall) must not sit on top of a session card in that column
        const mark = { start: t.time, end: `${t.time.slice(0, 3)}${String(Number(t.time.slice(3)) + 15).padStart(2, '0')}` };
        for (const s of fixedSessions) if (s.place === t.place) expect(overlaps(mark, s), `${e.no} ${t.time} ${s.id}`).toBe(false);
      }
      expect(ticketed.some((s) => toMinutes(s.start) > toMinutes(e.ticket!.slots![0].time)), e.no).toBe(true);
    }
  });

  it('marks who needs what on sessions of partially restricted events', () => {
    const needs = (id: string) => program.sessions.find((s) => s.id === id)?.needs;
    expect([needs('04/1'), needs('04/2')]).toEqual(['first', 'ticket']);
    expect([needs('40'), needs('40/1')]).toEqual([undefined, 'ticket']);
    expect([needs('45'), needs('45/L1'), needs('45/M')]).toEqual([undefined, 'apply', 'ticket']);
    expect([needs('05/1'), needs('23/8'), needs('51'), needs('14/1')]).toEqual(['apply', 'apply', undefined, 'apply']);
    // 05 and 23 are booked per slot on their booking pages: no all-day entry
    expect(program.sessions.some((s) => s.id === '05' || s.id === '23')).toBe(false);
    expect([sessionsByEvent.get('05')!.length, sessionsByEvent.get('23')!.length]).toEqual([3, 8]);
    // 51: drop-in exhibition + 8 simulator slots booked on the tokubetsu-yuutan site
    expect(sessionsByEvent.get('51')!.map((s) => s.needs ?? '-')).toEqual(['-', ...Array(8).fill('apply')]);
  });
});

describe('updates.json', () => {
  it('lists days newest first, each with text and only known event numbers', () => {
    expect(updates.length).toBeGreaterThan(0);
    const dates = updates.map((u) => u.date);
    for (const d of dates) expect(d).toMatch(/^2026-\d{2}-\d{2}$/);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    expect(LATEST_UPDATE).toBe(dates[0]);
    for (const u of updates) {
      expect(u.items.length, u.date).toBeGreaterThan(0);
      for (const it of u.items) {
        expect(it.text.trim().length, u.date).toBeGreaterThan(0);
        if (it.no) expect(eventByNo.has(it.no), `${u.date} ${it.no}`).toBe(true);
      }
    }
  });
});
