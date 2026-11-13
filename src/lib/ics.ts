import type { EventInfo, MyApply } from '../types';
import { MY_APPLY_LABEL } from './apply';
import type { PlanItem } from './plan';

/**
 * iCalendar (RFC 5545) export.
 * Times are written in UTC (JST − 9h) so every calendar app places them correctly without a VTIMEZONE block.
 */

const CRLF = '\r\n';
const DOMAIN = 'tksc-openday2026';
const VENUE = 'JAXA筑波宇宙センター';

/** Escape text for an iCalendar property value. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line at 75 octets (continuation lines start with a space).
 * Multi-byte safe, and an escape pair such as "\," is never split across lines.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  const units: string[] = [];
  const chars = Array.from(line);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\\' && i + 1 < chars.length) units.push(chars[i] + chars[++i]);
    else units.push(chars[i]);
  }
  for (const ch of units) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ' ' + l)).join(CRLF);
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** "2026-11-28" + "10:00" (JST) → "20261128T010000Z" */
export function jstToUtcStamp(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return stamp(Date.UTC(y, mo - 1, d, h - 9, mi, 0));
}

export interface IcsOptions {
  /** calendar name shown by some apps */
  calendarName: string;
  /** app URL put into each event's description */
  appUrl?: string;
  /** fixed DTSTAMP for deterministic output (tests); defaults to now */
  now?: Date;
}

export interface ScheduleIcsInput {
  date: string;
  items: PlanItem[];
  apply: Record<string, MyApply>;
  title: (item: PlanItem) => string;
  place: (item: PlanItem) => string;
  needsLabel: (item: PlanItem) => string | null;
}

function wrap(body: string[], opts: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${DOMAIN} timetable//JA`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.calendarName)}`,
    'X-WR-TIMEZONE:Asia/Tokyo',
    ...body,
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** My Schedule: one VEVENT per item that has a definite time. */
export function buildScheduleIcs(input: ScheduleIcsInput, opts: IcsOptions): string {
  const dtstamp = stamp((opts.now ?? new Date()).getTime());
  const body: string[] = [];
  for (const it of input.items) {
    if (!it.timed) continue;
    const desc: string[] = [`イベント番号 ${it.event.no}`];
    const need = input.needsLabel(it);
    if (need) {
      const mine = it.session.needs === 'apply' ? input.apply[it.event.no] : undefined;
      desc.push(`参加方法: ${need}${it.session.needs === 'apply' ? `（${mine ? MY_APPLY_LABEL[mine] : '未申込'}）` : ''}`);
    }
    if (it.session.needs === 'ticket' && it.event.ticket) desc.push(`整理券: ${it.event.ticket.time} ／ ${it.event.ticket.place}`);
    if (it.custom) desc.push('※ 自分で決めた時刻です（出入り自由のイベント）');
    if (it.offHours) desc.push('⚠ この時刻は実施していない時間です。開催時間を確認してください');
    if (it.session.endEstimated) desc.push('※ 終了時刻は目安です');
    if (it.event.summary) desc.push('', it.event.summary);
    if (opts.appUrl) desc.push('', `特別公開2026 マイスケジュール: ${opts.appUrl}`);
    body.push(
      'BEGIN:VEVENT',
      `UID:${it.id.replace('/', '-')}@${DOMAIN}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${jstToUtcStamp(input.date, it.start)}`,
      `DTEND:${jstToUtcStamp(input.date, it.end)}`,
      `SUMMARY:${icsEscape(input.title(it))}`,
      `LOCATION:${icsEscape(`${input.place(it)}（${VENUE}）`)}`,
      `DESCRIPTION:${icsEscape(desc.join('\n'))}`,
      'END:VEVENT',
    );
  }
  return wrap(body, opts);
}

/** Application deadlines (30-minute events ending at the deadline) for events still accepting applications. */
export function buildDeadlineIcs(events: EventInfo[], nowMs: number, opts: IcsOptions): string {
  const dtstamp = stamp((opts.now ?? new Date(nowMs)).getTime());
  const body: string[] = [];
  for (const e of events) {
    const ap = e.apply;
    if (!ap || ap.pending || !ap.end) continue;
    const end = Date.parse(ap.end);
    if (end <= nowMs) continue;
    const desc: string[] = [];
    if (ap.target) desc.push(`対象: ${ap.target}`);
    if (ap.url) desc.push(`予約ページ: ${ap.url}`);
    if (ap.result) desc.push(`結果: ${ap.result}`);
    if (opts.appUrl) desc.push('', `特別公開2026 マイスケジュール: ${opts.appUrl}`);
    body.push(
      'BEGIN:VEVENT',
      `UID:deadline-${e.no}@${DOMAIN}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(end - 30 * 60_000)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${icsEscape(`【申込締切】${e.no} ${e.title}`)}`,
      `DESCRIPTION:${icsEscape(desc.join('\n'))}`,
    );
    if (ap.url) body.push(`URL:${ap.url}`);
    body.push('END:VEVENT');
  }
  return wrap(body, opts);
}

/** Hand a text file to the browser as a download. */
export function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
