import { describe, expect, it } from 'vitest';
import { eventByNo, sessionArea, sessionById } from '../src/data';
import {
  areaMoves,
  buildColumns,
  cardRect,
  columnWidths,
  conflictingIds,
  drawSpans,
  groupByArea,
  laneCode,
  minutesToOffset,
  GRID_START,
  LANE_COL_PX,
  SUB_PX,
} from '../src/lib/layout';
import { buildPlan, hoursText, isOpenAt, isPassedOver, resolveItem, selectedEvents, wonEventsWithPick, type Lookup } from '../src/lib/plan';
import { matchEvents } from '../src/lib/search';
import { program } from '../src/data';

const db: Lookup = { sessionById, eventByNo, areaOf: sessionArea };

describe('layout', () => {
  it('cuts overlapping slots of a room at the next start so the cards stack', () => {
    const spans = drawSpans([
      { id: 'a', place: 'X', start: '10:30', end: '11:30' },
      { id: 'b', place: 'X', start: '11:00', end: '12:00' },
      { id: 'c', place: 'X', start: '12:00', end: '13:00' },
      { id: 'd', place: 'Y', start: '11:00', end: '12:00' },
    ]);
    expect(spans.get('a')).toEqual({ start: '10:30', end: '11:00' });
    expect([spans.has('b'), spans.has('c'), spans.has('d')]).toEqual([false, false, false]);
  });

  it('places cards proportionally to their duration', () => {
    expect(minutesToOffset(GRID_START)).toBe(0);
    expect(cardRect({ start: '10:05', end: '11:00' })).toEqual({ top: SUB_PX, height: 11 * SUB_PX });
    expect(cardRect({ start: '10:00', end: '10:00' }).height).toBe(SUB_PX);
  });

  it('groups the grid columns by area in E, S, C, W order', () => {
    expect(groupByArea(program.places).map((g) => g.area)).toEqual(['E', 'S', 'C', 'W']);
  });

  it('adds one narrow lane per all-day session after the rooms of its area', () => {
    const cols = buildColumns(['E', 'S', 'C', 'W'], program.places, program.sessions, sessionArea, (s) => eventByNo.get(s.event)?.placeText ?? '');
    expect(cols.filter((c) => c.kind === 'place')).toHaveLength(program.places.length);
    expect(cols.filter((c) => c.kind === 'lane')).toHaveLength(program.sessions.filter((s) => s.open).length);
    expect(groupByArea(cols).map((g) => g.area)).toEqual(['E', 'S', 'C', 'W']);
    expect(cols.slice(0, 7).map((c) => (c.kind === 'place' ? c.place.id : c.session.id))).toEqual(['SD', 'E2K', 'E2K1', 'E2F', 'E2AV', '01', '09']);
    const widths = columnWidths(cols, 375);
    expect(new Set(widths)).toEqual(new Set([96, LANE_COL_PX]));
  });

  it('shortens a place text to a lane header code', () => {
    expect(laneCode('C-1 総合開発推進棟 １階 大会議室')).toBe('C-1');
    expect(laneCode('S-10 総合環境試験棟')).toBe('S-10');
    expect(laneCode('ロケット広場（屋外）')).toBe('ロケッ');
    expect(laneCode('グランド')).toBe('グラン');
  });

  it('detects overlaps but not back-to-back items', () => {
    const a = { id: 'a', area: 'E' as const, start: '10:15', end: '11:15' };
    const b = { id: 'b', area: 'S' as const, start: '11:15', end: '12:15' };
    const c = { id: 'c', area: 'S' as const, start: '11:00', end: '11:30' };
    expect(conflictingIds([a, b])).toEqual(new Set());
    expect(conflictingIds([a, b, c])).toEqual(new Set(['a', 'b', 'c']));
    expect(areaMoves([a, b])).toEqual([{ toId: 'b', from: 'E', to: 'S', gapMinutes: 0 }]);
  });
});

describe('plan', () => {
  it('resolves a fixed slot, a drop-in session and a pinned drop-in session', () => {
    expect(resolveItem('14/2', {}, db)).toMatchObject({ start: '11:15', end: '12:15', timed: true, custom: false, area: 'S' });
    expect(resolveItem('12', {}, db)).toMatchObject({ timed: false, area: 'S' });
    expect(resolveItem('01', { '01': '11:00' }, db)).toMatchObject({ start: '11:00', end: '11:20', timed: true, custom: true });
    expect(resolveItem('99/1', {}, db)).toBeNull();
  });

  it('knows the lunch breaks of 01 and 33, the rain-changed hours of 20 and the shorter hours of 12', () => {
    const s = (id: string) => sessionById.get(id)!;
    expect(hoursText(s('01'))).toBe('10:00–12:00 ／ 13:00–15:30');
    expect(hoursText(s('20'))).toBe('11:30–15:00');
    expect(hoursText(s('33'))).toBe('10:00–12:00 ／ 13:00–15:30');
    expect([isOpenAt(s('01'), '11:55'), isOpenAt(s('01'), '12:00'), isOpenAt(s('01'), '12:30'), isOpenAt(s('01'), '13:00')]).toEqual([true, false, false, true]);
    expect([isOpenAt(s('20'), '11:29'), isOpenAt(s('20'), '11:30'), isOpenAt(s('33'), '12:59')]).toEqual([false, true, false]);
    expect([isOpenAt(s('12'), '10:00'), isOpenAt(s('12'), '10:15'), isOpenAt(s('12'), '14:30')]).toEqual([false, true, false]);
  });

  it('flags a visit time chosen outside the opening hours', () => {
    expect(resolveItem('01', { '01': '12:20' }, db)).toMatchObject({ timed: true, custom: true, offHours: true });
    expect(resolveItem('01', { '01': '11:00' }, db)).toMatchObject({ offHours: false });
    expect(resolveItem('01', {}, db)).toMatchObject({ timed: false, offHours: false });
    expect(resolveItem('14/2', {}, db)).toMatchObject({ offHours: false });
  });

  it('sorts timed items, separates free ones, and reports conflicts and area moves', () => {
    const plan = buildPlan(['48/1', '12', '14/1', '02/1', '99'], {}, db);
    expect(plan.timed.map((x) => x.id)).toEqual(['02/1', '14/1', '48/1']);
    expect(plan.free.map((x) => x.id)).toEqual(['12']);
    expect(plan.conflicts).toEqual(new Set(['02/1', '14/1', '48/1']));
    expect(plan.moveBefore.get('14/1')).toMatchObject({ from: 'E', to: 'S' });
    expect(plan.moveBefore.get('48/1')).toMatchObject({ from: 'S', to: 'W' });
  });

  it('fades the other application slots once the won slot is picked', () => {
    const s = (id: string) => sessionById.get(id)!;
    const faded = (sel: string[], apply: Record<string, 'applied' | 'won' | 'lost'>) => {
      const selected = new Set(sel);
      const won = wonEventsWithPick(program.sessions, selected, apply);
      return program.sessions.filter((x) => isPassedOver(x, selected, won)).map((x) => x.id);
    };
    expect(faded(['14/2'], { '14': 'won' })).toEqual(['14/1', '14/3', '14/4']);
    expect(faded(['14/2', '14/3'], { '14': 'won' })).toEqual(['14/1', '14/4']);
    // not yet won, or won but no slot picked yet: nothing fades
    expect(faded(['14/2'], { '14': 'applied' })).toEqual([]);
    expect(faded(['14/2'], {})).toEqual([]);
    expect(faded([], { '14': 'won' })).toEqual([]);
    // only the slots that need an application fade: the drop-in part and the ticketed meeting of 45 stay
    expect(faded(['45/L2'], { '45': 'won' })).toEqual(['45/L1', '45/L3', '45/L4']);
    expect(s('45/M').needs).toBe('ticket');
  });

  it('lists the events that have a selected session', () => {
    expect(selectedEvents(['14/1', '14/2', '45', 'zz'], db)).toEqual(new Set(['14', '45']));
  });
});

describe('search', () => {
  it('matches number, title, place and category with AND and width folding', () => {
    expect(matchEvents(program.events, '')).toBeNull();
    expect(matchEvents(program.events, '宇宙飛行士講演')).toEqual(new Set(['48']));
    expect(matchEvents(program.events, 'ＨＴＶ－Ｘ ゲーム')?.has('54')).toBe(true);
    expect(matchEvents(program.events, 'スペースチャンバ 事前申込')).toEqual(new Set(['14']));
  });
});
