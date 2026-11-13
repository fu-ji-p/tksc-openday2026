import { useEffect, useRef } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';
import type { MyApply, Session } from '../types';
import { program } from '../data';
import {
  GRID_END,
  GRID_START,
  HEADER_PX,
  SLOT_PX,
  SUB_COUNT,
  SUB_PX,
  TIME_COL_PX,
  columnWidths,
  groupByArea,
  type Column,
  minutesToOffset,
  timeSlots,
} from '../lib/layout';
import { fromMinutes, toMinutes } from '../lib/time';
import { SessionCard } from './SessionCard';

interface Props {
  columns: Column[];
  /** fixed-time sessions (all-day ones come with their lane column) */
  sessions: Session[];
  selected: Set<string>;
  apply: Record<string, MyApply>;
  /** event numbers matching the search; null = no search active */
  matchSet: Set<string> | null;
  /** minutes since midnight in JST on the event day, else null */
  nowMinutes: number | null;
  onOpen: (eventNo: string) => void;
}

const areaName = new Map(program.areas.map((a) => [a.id, a.name]));

export function Timetable({ columns, sessions, selected, apply, matchSet, nowMinutes, onOpen }: Props) {
  const groups = groupByArea(columns);
  const slots = timeSlots();
  const colIndex = new Map(columns.map((c, i) => [c.kind === 'place' ? c.place.id : c.key, i + 2]));
  // First column of every area group after the first one gets a thick divider on its left.
  const groupStart = new Set(groups.slice(1).map((g) => g.places[0].key));
  const colClass = (c: Column) => ' area-' + c.area + (c.kind === 'lane' ? ' is-lane' : '') + (groupStart.has(c.key) ? ' is-group-start' : '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  // Rooms are at least 96px (phones scroll horizontally) and grow on wide screens; all-day lanes stay narrow.
  const style = {
    gridTemplateColumns: `${TIME_COL_PX}px ${columnWidths(columns, width).map((w) => w + 'px').join(' ')}`,
    gridTemplateRows: `${HEADER_PX}px ${SUB_COUNT * SUB_PX}px`,
  } as const;
  const showNow = nowMinutes !== null && nowMinutes >= GRID_START && nowMinutes <= GRID_END;

  // Scroll so the current time is visible when opening the timetable on the day.
  useEffect(() => {
    if (!showNow || !scrollRef.current || nowMinutes === null) return;
    const y = HEADER_PX + minutesToOffset(nowMinutes) - 120;
    scrollRef.current.scrollTo({ top: Math.max(0, y) });
    // only on mount, not every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNow]);

  // When a search is active, bring the first matching card into view.
  useEffect(() => {
    if (!matchSet || !scrollRef.current) return;
    const first = scrollRef.current.querySelector<HTMLElement>('.card.is-matched');
    first?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [matchSet]);

  return (
    <div className="tt-wrap">
      <div className="legend">
        <span className="legend-item need-apply">事前申込</span>
        <span className="legend-item need-ticket">整理券</span>
        <span className="legend-item need-first">先着順</span>
        <span className="legend-item need-free">申込不要</span>
        <span className="legend-item legend-ticket">🎫 整理券の配布開始</span>
        <span className="legend-note">細い列は終日（出入り自由）のイベント。色の帯が開催時間です</span>
      </div>
      <div className="tt-scroll" ref={scrollRef}>
        <div className="tt-grid" style={style}>
          <div className="tt-corner" style={{ gridRow: 1, gridColumn: 1 }} />
          {groups.map((g, gi) => {
            const first = columns.indexOf(g.places[0]) + 2;
            return (
              <div
                key={g.area}
                className={'tt-building area-' + g.area + (gi > 0 ? ' is-group-start' : '')}
                style={{ gridRow: 1, gridColumn: `${first} / span ${g.places.length}` }}
              >
                <span>{areaName.get(g.area)}</span>
              </div>
            );
          })}
          {columns.map((c, i) =>
            c.kind === 'place' ? (
              <div
                key={c.key}
                className={'tt-venue' + colClass(c)}
                style={{ gridRow: 1, gridColumn: i + 2 }}
                title={`${c.place.code} ${c.place.building} ${c.place.room}`}
              >
                <span className="tt-venue-name">{c.place.code}</span>
                <span className="tt-venue-room">{c.place.room || c.place.building}</span>
              </div>
            ) : (
              <div key={c.key} className={'tt-venue' + colClass(c)} style={{ gridRow: 1, gridColumn: i + 2 }} title="終日（出入り自由）">
                <span className="tt-venue-name">{c.session.event}</span>
                <span className="tt-venue-room">{c.code}</span>
              </div>
            ),
          )}
          {/* time column: one label per 15-minute row, absolutely positioned inside the body row */}
          <div className="tt-timecol" style={{ gridRow: 2, gridColumn: 1 }}>
            {slots.map((t) => (
              <div key={t} className={'tt-time' + (t % 60 === 0 ? ' is-hour' : '')} style={{ top: minutesToOffset(t) }}>
                {t % 30 === 0 ? fromMinutes(t) : ''}
              </div>
            ))}
          </div>
          {/* column separators */}
          {columns.map((c, i) => (
            <div key={c.key} className={'tt-col' + colClass(c)} style={{ gridRow: 2, gridColumn: i + 2 }} />
          ))}
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              column={colIndex.get(s.place ?? '') ?? 2}
              selected={selected.has(s.id)}
              mine={s.needs === 'apply' ? apply[s.event] : undefined}
              dimmed={matchSet !== null && !matchSet.has(s.event)}
              matched={matchSet !== null && matchSet.has(s.event)}
              onOpen={onOpen}
            />
          ))}
          {columns.map((c, i) =>
            c.kind !== 'lane'
              ? null
              : (c.session.hours ?? [[c.session.start, c.session.end] as [string, string]]).map(([start, end]) => (
                  <SessionCard
                    key={c.key + start}
                    session={c.session}
                    column={i + 2}
                    lane
                    span={{ start, end }}
                    selected={selected.has(c.session.id)}
                    mine={c.session.needs === 'apply' ? apply[c.session.event] : undefined}
                    dimmed={matchSet !== null && !matchSet.has(c.session.event)}
                    matched={matchSet !== null && matchSet.has(c.session.event)}
                    onOpen={onOpen}
                  />
                )),
          )}
          {/* when numbered tickets start being handed out, in the column of the sessions they are for */}
          {program.events.flatMap((e) =>
            (e.ticket?.slots ?? []).map((t) => {
              const col = colIndex.get(t.place);
              if (!col) return null;
              return (
                <button
                  key={e.no + t.time}
                  type="button"
                  className={'ticket-mark' + (matchSet !== null && !matchSet.has(e.no) ? ' is-dimmed' : '')}
                  style={{ gridRow: 2, gridColumn: col, top: minutesToOffset(toMinutes(t.time)), height: SLOT_PX }}
                  onClick={() => onOpen(e.no)}
                  title={`整理券配布 ${t.time}〜（${t.note}） ${e.ticket!.place} ／ ${e.no} ${e.title}`}
                >
                  <span className="ticket-mark-head">
                    <span className="card-no">{e.no}</span>🎫 {fromMinutes(toMinutes(t.time))}〜
                  </span>
                  <span className="ticket-mark-note">{t.note}の整理券</span>
                </button>
              );
            }),
          )}
          {showNow && nowMinutes !== null && (
            <div
              className="tt-now"
              style={{ gridRow: 2, gridColumn: `1 / span ${columns.length + 1}`, top: minutesToOffset(nowMinutes) }}
              aria-label={`現在時刻 ${fromMinutes(nowMinutes)}`}
            >
              <span className="tt-now-label">{fromMinutes(nowMinutes)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
