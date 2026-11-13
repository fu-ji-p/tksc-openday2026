import { describe, expect, it } from 'vitest';
import { applyPhase, deadlineText, isUrgent, remaining, sortForApplying } from '../src/lib/apply';
import { formatInstantJa, jstParts } from '../src/lib/time';
import type { ApplyInfo, EventInfo } from '../src/types';

const at = (s: string) => Date.parse(s + '+09:00');
const ap = (over: Partial<ApplyInfo> = {}): ApplyInfo => ({
  method: 'lottery',
  pending: false,
  start: '2026-10-23T00:00:00+09:00',
  end: '2026-11-17T23:59:59+09:00',
  url: 'https://example.com/form',
  ...over,
});
const ev = (no: string, apply?: ApplyInfo): EventInfo => ({
  no, title: 'T' + no, areas: ['E'], categories: [], placeText: '', timeText: '', summary: '', participation: [], apply,
});

describe('application phase', () => {
  it('follows start and end like the official site', () => {
    expect(applyPhase(ap(), at('2026-10-22T23:59'))).toBe('before');
    expect(applyPhase(ap(), at('2026-11-14T12:00'))).toBe('open');
    expect(applyPhase(ap(), at('2026-11-17T23:59'))).toBe('open');
    expect(applyPhase(ap(), at('2026-11-18T00:00'))).toBe('closed');
  });

  it('is pending while the organiser has not published the details', () => {
    expect(applyPhase({ method: 'tbd', pending: true }, at('2026-11-14T12:00'))).toBe('pending');
  });
});

describe('deadline text', () => {
  it('formats instants in JST whatever the device time zone', () => {
    expect(formatInstantJa('2026-11-17T23:59:59+09:00')).toBe('11/17(火) 23:59');
    expect(formatInstantJa('2026-11-17T14:59:59Z')).toBe('11/17(火) 23:59');
    expect(jstParts(Date.parse('2026-11-27T15:30:00Z'))).toEqual({ date: '2026-11-28', minutes: 30 });
  });

  it('counts down in days, hours, minutes', () => {
    const end = '2026-11-17T23:59:59+09:00';
    expect(remaining(end, at('2026-11-14T12:00'))).toBe('あと3日');
    expect(remaining(end, at('2026-11-17T12:00'))).toBe('あと11時間');
    expect(remaining(end, at('2026-11-17T23:40'))).toBe('あと19分');
    expect(remaining(end, at('2026-11-18T00:00'))).toBeNull();
  });

  it('describes each phase', () => {
    expect(deadlineText(ap(), at('2026-11-14T12:00'))).toBe('締切 11/17(火) 23:59（あと3日）');
    expect(deadlineText(ap(), at('2026-11-20T12:00'))).toBe('11/17(火) 23:59 に受付終了');
    expect(deadlineText(ap({ start: '2026-11-16T12:00:00+09:00' }), at('2026-11-14T12:00'))).toContain('受付開始 11/16(月) 12:00');
    expect(deadlineText({ method: 'tbd', pending: true }, 0)).toBe('申込方法は準備中');
  });

  it('flags deadlines within three days', () => {
    expect(isUrgent(ap(), at('2026-11-14T12:00'))).toBe(false);
    expect(isUrgent(ap(), at('2026-11-15T12:00'))).toBe(true);
    expect(isUrgent(ap(), at('2026-11-18T12:00'))).toBe(false);
  });
});

describe('ordering for the reservations list', () => {
  it('puts open applications first by deadline, then upcoming, undecided, closed', () => {
    const events = [
      ev('01'),
      ev('02', ap({ end: '2026-11-23T23:59:59+09:00' })),
      ev('05', ap({ end: '2026-11-13T15:00:00+09:00' })),
      ev('14', ap()),
      ev('32', ap({ start: '2026-11-16T12:00:00+09:00', end: '2026-11-22T23:45:00+09:00' })),
      ev('48', { method: 'tbd', pending: true }),
    ];
    expect(sortForApplying(events, at('2026-11-14T12:00')).map((e) => e.no)).toEqual(['14', '02', '32', '48', '05']);
  });
});
