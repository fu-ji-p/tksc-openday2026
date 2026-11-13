import type { MyApply, Session } from '../types';
import { eventByNo } from '../data';
import { cardRect } from '../lib/layout';

/** short labels: cards can be as narrow as 96px */
const MINE_SHORT = { applied: '申込済', won: '当選', lost: '落選' } as const;
const NEED_SHORT = { apply: '申込', ticket: '整理', first: '先着' } as const;

interface Props {
  session: Session;
  column: number; // 1-based css grid column
  selected: boolean;
  /** the visitor's application status (sessions that need an application) */
  mine: MyApply | undefined;
  dimmed: boolean; // search active and this card does not match
  matched: boolean; // search active and this card matches
  /** another slot of this event is the one the visitor won: show this one faded */
  passed?: boolean;
  /** narrow all-day lane: vertical title, no time row */
  lane?: boolean;
  /** draw this time range instead of the session's own (all-day events with a break) */
  span?: { start: string; end: string };
  onOpen: (eventNo: string) => void;
}

export function SessionCard({ session, column, selected, mine, dimmed, matched, passed = false, lane = false, span, onOpen }: Props) {
  const time = span ?? session;
  const rect = cardRect(time);
  const event = eventByNo.get(session.event);
  const title = event?.title ?? session.event;
  const cls =
    'card' +
    (lane ? ' card-lane' : '') +
    ' need-' +
    (session.needs ?? 'free') +
    (selected ? ' is-selected' : '') +
    (mine === 'won' ? ' is-won' : '') +
    (mine === 'lost' || passed ? ' is-lost' : '') +
    (dimmed ? ' is-dimmed' : '') +
    (matched ? ' is-matched' : '');
  return (
    <button
      type="button"
      className={cls}
      style={{ gridRow: 2, gridColumn: column, top: rect.top, height: rect.height }}
      onClick={() => onOpen(session.event)}
      aria-pressed={selected}
      title={`${session.event} ${time.start}-${time.end} ${title}${lane ? '（出入り自由）' : ''}${passed ? '（別の回に当選）' : ''}`}
    >
      {lane ? (
        <span className="card-no">{session.event}</span>
      ) : (
        <span className="card-time">
          <span className="card-no">{session.event}</span>
          {session.start}–{session.end}
          {session.needs && <span className="card-need">{NEED_SHORT[session.needs]}</span>}
        </span>
      )}
      <span className="card-title">
        {session.label}
        {session.sub ? `${session.sub}｜` : ''}
        {title}
      </span>
      {mine && <span className={'card-mine mine-' + mine}>{MINE_SHORT[mine]}</span>}
      {selected && (
        <span className="card-check" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}
