import type { ApplyInfo, EventInfo, MyApply } from '../types';
import { MY_APPLY_LABEL, PHASE_LABEL, applyPhase } from '../lib/apply';

/** Coloured square with the event number (area colour). */
export function EventNo({ event }: { event: EventInfo }) {
  return <span className={'evno area-' + event.areas[0]}>{event.no}</span>;
}

/** 受付中 / 受付開始前 / 準備中 / 受付終了 */
export function PhasePill({ apply, nowMs }: { apply: ApplyInfo; nowMs: number }) {
  const ph = applyPhase(apply, nowMs);
  return <span className={'pill phase-' + ph}>{PHASE_LABEL[ph]}</span>;
}

/** 事前申込 / 整理券 / 先着順 badges of an event. */
export function ParticipationBadges({ event }: { event: EventInfo }) {
  return (
    <>
      {event.apply && <span className="tag need-apply">事前申込{event.apply.target ? `（${event.apply.target}）` : ''}</span>}
      {event.ticket && <span className="tag need-ticket">整理券{event.ticket.target ? `（${event.ticket.target}）` : ''}</span>}
      {event.firstCome && <span className="tag need-first">先着順</span>}
    </>
  );
}

const OPTIONS: (MyApply | null)[] = [null, 'applied', 'won', 'lost'];

/** Segmented control for the visitor's own application status. */
export function MyApplyPicker({ value, onChange }: { value: MyApply | undefined; onChange: (v: MyApply | null) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label="自分の申込状況">
      {OPTIONS.map((o) => {
        const on = (value ?? null) === o;
        return (
          <button
            key={o ?? 'none'}
            type="button"
            role="radio"
            aria-checked={on}
            className={'seg-btn' + (on ? ' is-on seg-' + (o ?? 'none') : '')}
            onClick={(e) => {
              e.stopPropagation();
              onChange(o);
            }}
          >
            {o ? MY_APPLY_LABEL[o] : '未申込'}
          </button>
        );
      })}
    </div>
  );
}
