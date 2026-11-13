import { useEffect, useRef } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';
import type { MyApply, Place, Session } from '../types';
import { program } from '../data';
import {
  GRID_END,
  GRID_START,
  HEADER_PX,
  SUB_COUNT,
  SUB_PX,
  TIME_COL_PX,
  VENUE_COL_MIN_PX,
  groupByArea,
  minutesToOffset,
  timeSlots,
} from '../lib/layout';
import { fromMinutes } from '../lib/time';
import { SessionCard } from './SessionCard';

interface Props {
  places: Place[];
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

export function Timetable({ places, sessions, selected, apply, matchSet, nowMinutes, onOpen }: Props) {
  const groups = groupByArea(places);
  const slots = timeSlots();
  const colIndex = new Map(places.map((p, i) => [p.id, i + 2]));
  // First place of every area group after the first one gets a thick divider on its left.
  const groupStart = new Set(groups.slice(1).map((g) => g.places[0].id));
  const placeClass = (p: Place) => ' area-' + p.area + (groupStart.has(p.id) ? ' is-group-start' : '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  // Columns are at least 96px (phones scroll horizontally); on wide screens they grow to fill the width.
  const colPx = Math.max(VENUE_COL_MIN_PX, Math.floor((width - TIME_COL_PX) / places.length));
  const style = {
    gridTemplateColumns: `${TIME_COL_PX}px repeat(${places.length}, ${colPx}px)`,
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
        <span className="legend-note">時刻が決まった回だけを表示。出入り自由のイベントは「イベント一覧」へ</span>
      </div>
      <div className="tt-scroll" ref={scrollRef}>
        <div className="tt-grid" style={style}>
          <div className="tt-corner" style={{ gridRow: 1, gridColumn: 1 }} />
          {groups.map((g, gi) => {
            const first = places.indexOf(g.places[0]) + 2;
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
          {places.map((p, i) => (
            <div
              key={p.id}
              className={'tt-venue' + placeClass(p)}
              style={{ gridRow: 1, gridColumn: i + 2 }}
              title={`${p.code} ${p.building} ${p.room}`}
            >
              <span className="tt-venue-name">{p.code}</span>
              <span className="tt-venue-room">{p.room || p.building}</span>
            </div>
          ))}
          {/* time column: one label per 15-minute row, absolutely positioned inside the body row */}
          <div className="tt-timecol" style={{ gridRow: 2, gridColumn: 1 }}>
            {slots.map((t) => (
              <div key={t} className={'tt-time' + (t % 60 === 0 ? ' is-hour' : '')} style={{ top: minutesToOffset(t) }}>
                {t % 30 === 0 ? fromMinutes(t) : ''}
              </div>
            ))}
          </div>
          {/* column separators */}
          {places.map((p, i) => (
            <div key={p.id} className={'tt-col' + placeClass(p)} style={{ gridRow: 2, gridColumn: i + 2 }} />
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
          {showNow && nowMinutes !== null && (
            <div
              className="tt-now"
              style={{ gridRow: 2, gridColumn: `1 / span ${places.length + 1}`, top: minutesToOffset(nowMinutes) }}
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
