import { describe, expect, it } from 'vitest';
import { EMPTY, STORAGE_KEY, loadSchedule, parseScheduleJson, saveSchedule, serializeSchedule, type StorageLike } from '../src/lib/storage';
import { reducer } from '../src/hooks/useSchedule';
import { parseShareHash, shareUrl } from '../src/lib/share';

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const sample = { selected: ['12', '14/2', '45/L1'], times: { '12': '11:30' }, apply: { '14': 'won', '19': 'applied' } } as const;

describe('storage', () => {
  it('uses the event-specific key', () => {
    expect(STORAGE_KEY).toBe('tksc-openday2026.schedule.v1');
  });

  it('round-trips selection, times and application status', () => {
    const m = memory();
    expect(saveSchedule(m, { ...sample, selected: [...sample.selected] })).toBe(true);
    expect(loadSchedule(m)).toEqual(sample);
  });

  it('starts empty when storage is missing, broken or throws', () => {
    expect(loadSchedule(null)).toEqual(EMPTY);
    const m = memory();
    m.setItem(STORAGE_KEY, '{broken');
    expect(loadSchedule(m)).toEqual(EMPTY);
    expect(loadSchedule({ getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} })).toEqual(EMPTY);
  });

  it('drops malformed entries but keeps well-formed ids that are not in the program', () => {
    const f = parseScheduleJson(
      JSON.stringify({
        selected: ['12', '99/9', '<script>', 5, '12', '10-1/2'],
        times: { '12': '11:30', '13': '25:00', bad: '10:00' },
        apply: { '14': 'won', '15': 'maybe', 'x': 'won' },
      }),
    );
    expect(f?.selected).toEqual(['12', '99/9', '10-1/2']);
    expect(f?.times).toEqual({ '12': '11:30' });
    expect(f?.apply).toEqual({ '14': 'won' });
  });

  it('accepts a file without times/apply and rejects one without selected', () => {
    expect(parseScheduleJson('{"selected":["01"]}')).toMatchObject({ selected: ['01'], times: {}, apply: {} });
    expect(parseScheduleJson('{"apply":{}}')).toBeNull();
    expect(parseScheduleJson('')).toBeNull();
  });

  it('serializes with an updatedAt stamp', () => {
    const text = serializeSchedule({ selected: ['01', '01'], times: {}, apply: {} }, new Date('2026-11-14T00:00:00Z'));
    expect(JSON.parse(text)).toEqual({ selected: ['01'], times: {}, apply: {}, updatedAt: '2026-11-14T00:00:00.000Z' });
  });
});

describe('reducer', () => {
  it('toggles a session and forgets its chosen time when removed', () => {
    let s = reducer(EMPTY, { type: 'toggle', id: '12' });
    s = reducer(s, { type: 'time', id: '12', time: '11:30' });
    expect(s).toEqual({ selected: ['12'], times: { '12': '11:30' }, apply: {} });
    s = reducer(s, { type: 'toggle', id: '12' });
    expect(s).toEqual(EMPTY);
  });

  it('records and clears the application status independently of the selection', () => {
    let s = reducer(EMPTY, { type: 'apply', no: '14', status: 'applied' });
    s = reducer(s, { type: 'apply', no: '14', status: 'won' });
    expect(s.apply).toEqual({ '14': 'won' });
    expect(reducer(s, { type: 'apply', no: '14', status: null }).apply).toEqual({});
  });
});

describe('share link', () => {
  it('round-trips the whole record through the URL hash', () => {
    const url = shareUrl({ ...sample, selected: [...sample.selected] }, 'https://example.com/app/?now=x');
    expect(url).toBe('https://example.com/app/#s=12,14/2,45/L1&t=12@1130&a=14w,19a');
    expect(parseShareHash(new URL(url).hash)).toEqual(sample);
  });

  it('returns null for unrelated hashes and ignores junk', () => {
    expect(parseShareHash('')).toBeNull();
    expect(parseShareHash('#top')).toBeNull();
    expect(parseShareHash('#s=12,%3Cx%3E&a=14z')).toEqual({ selected: ['12'], times: {}, apply: {} });
  });
});
