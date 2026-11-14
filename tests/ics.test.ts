import { describe, expect, it } from 'vitest';
import { eventByNo, program, sessionArea, sessionById, sessionPlace, sessionTitle, NEEDS_LABEL } from '../src/data';
import { hasUpcomingDeadline, buildDeadlineIcs, buildScheduleIcs, foldLine, icsEscape, jstToUtcStamp } from '../src/lib/ics';
import { buildPlan } from '../src/lib/plan';

const now = new Date('2026-11-14T03:00:00Z');
const db = { sessionById, eventByNo, areaOf: sessionArea };

describe('ics helpers', () => {
  it('escapes text', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('converts JST to UTC', () => {
    expect(jstToUtcStamp('2026-11-28', '10:00')).toBe('20261128T010000Z');
    expect(jstToUtcStamp('2026-11-28', '08:30')).toBe('20261127T233000Z');
  });

  it('folds at 75 octets without splitting characters or escapes', () => {
    const folded = foldLine('SUMMARY:' + 'あ'.repeat(40) + '\\,' + 'い'.repeat(40));
    const enc = new TextEncoder();
    for (const l of folded.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe('SUMMARY:' + 'あ'.repeat(40) + '\\,' + 'い'.repeat(40));
  });
});

describe('schedule calendar', () => {
  const plan = buildPlan(['14/2', '12', '01'], { '01': '13:00' }, db);
  const text = buildScheduleIcs(
    {
      date: program.event.date,
      items: [...plan.timed, ...plan.free],
      apply: { '14': 'won' },
      title: (it) => sessionTitle(it.session),
      place: (it) => sessionPlace(it.session),
      needsLabel: (it) => (it.session.needs ? NEEDS_LABEL[it.session.needs] : null),
    },
    { calendarName: 'テスト', now },
  );
  const unfolded = text.replace(/\r\n /g, '');

  it('writes one event per timed item with stable UIDs', () => {
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(unfolded).toContain('UID:14-2@tksc-openday2026');
    expect(unfolded).toContain('UID:01@tksc-openday2026');
    expect(unfolded).not.toContain('UID:12@');
  });

  it('uses the slot time, the pinned time and the application status', () => {
    expect(unfolded).toContain('DTSTART:20261128T021500Z');
    expect(unfolded).toContain('DTEND:20261128T031500Z');
    expect(unfolded).toContain('DTSTART:20261128T040000Z');
    expect(unfolded).toContain('参加方法: 事前申込（当選・予約確定）');
    expect(unfolded).toContain('LOCATION:S-4 8mφ放射計スペースチャンバ棟（JAXA筑波宇宙センター）');
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('deadline calendar', () => {
  it('lists only applications that are still open or upcoming', () => {
    const nowMs = Date.parse('2026-11-18T12:00:00+09:00');
    const text = buildDeadlineIcs(program.events, nowMs, { calendarName: '締切', now }).replace(/\r\n /g, '');
    expect(text).toContain('UID:deadline-02@tksc-openday2026');
    expect(text).toContain('DTEND:20261123T145959Z');
    expect(text).not.toContain('UID:deadline-14@');
    expect(text).not.toContain('UID:deadline-48@');
    expect(text).not.toContain('VALARM');
  });

  it('writes one event with two reminders when asked', () => {
    const nowMs = Date.parse('2026-11-18T12:00:00+09:00');
    const text = buildDeadlineIcs([eventByNo.get('02')!], nowMs, { calendarName: '締切', now, alarms: true }).replace(/\r\n /g, '');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(text.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(text).toContain('TRIGGER:-PT23H30M');
    expect(text).toContain('TRIGGER:-PT2H30M');
    expect(text.indexOf('END:VALARM')).toBeLessThan(text.indexOf('END:VEVENT'));
    expect([hasUpcomingDeadline(eventByNo.get('02')!, nowMs), hasUpcomingDeadline(eventByNo.get('14')!, nowMs), hasUpcomingDeadline(eventByNo.get('48')!, nowMs)]).toEqual([true, false, false]);
  });
});
