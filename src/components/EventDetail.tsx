import { useEffect } from 'react';
import type { EventInfo, MyApply, Session } from '../types';
import { NEEDS_LABEL, program, sessionPlace, sessionsByEvent } from '../data';
import { METHOD_LABEL, applyPhase, deadlineText } from '../lib/apply';
import { EventNo, MyApplyPicker, PhasePill } from './Badges';

interface Props {
  event: EventInfo;
  selected: Set<string>;
  times: Record<string, string>;
  mine: MyApply | undefined;
  nowMs: number;
  onToggle: (sessionId: string) => void;
  onSetTime: (sessionId: string, time: string | null) => void;
  onSetApply: (no: string, status: MyApply | null) => void;
  onClose: () => void;
}

function hoursText(s: Session): string {
  return (s.hours ?? [[s.start, s.end]]).map(([a, b]) => `${a}–${b}`).join(' ／ ');
}

export function EventDetail({ event, selected, times, mine, nowMs, onToggle, onSetTime, onSetApply, onClose }: Props) {
  const sessions = sessionsByEvent.get(event.no) ?? [];
  const ap = event.apply;
  const phase = ap ? applyPhase(ap, nowMs) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <span className="sheet-head-tags">
            <EventNo event={event} />
            {event.areas.map((a) => (
              <span key={a} className={'bld-tag area-' + a}>
                {a}エリア
              </span>
            ))}
            {event.status && <span className="badge badge-warn">{event.status}</span>}
          </span>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <div className="sheet-body">
          <h2 id="sheet-title" className="sheet-title">
            {event.title}
          </h2>
          {event.summary && <p className="sheet-summary">{event.summary}</p>}
          <dl className="sheet-meta">
            <dt>場所</dt>
            <dd className="pre">{event.placeText}</dd>
            <dt>時間</dt>
            <dd className="pre">{event.timeText}</dd>
            {event.duration && (
              <>
                <dt>所要</dt>
                <dd>{event.duration}</dd>
              </>
            )}
            {event.target && (
              <>
                <dt>対象</dt>
                <dd>{event.target}</dd>
              </>
            )}
            {event.capacity && (
              <>
                <dt>定員</dt>
                <dd>{event.capacity}</dd>
              </>
            )}
            {event.firstCome && (
              <>
                <dt>先着</dt>
                <dd>{event.firstCome}</dd>
              </>
            )}
            {event.note && (
              <>
                <dt>備考</dt>
                <dd className="pre">{event.note}</dd>
              </>
            )}
            {event.categories.length > 0 && (
              <>
                <dt>分類</dt>
                <dd>{event.categories.join('・')}</dd>
              </>
            )}
          </dl>

          {ap && phase && (
            <section className="pcard need-apply">
              <h3>
                事前申込{ap.target ? `：${ap.target}` : ''} <PhasePill apply={ap} nowMs={nowMs} />
              </h3>
              <dl className="resv-meta">
                <dt>締切</dt>
                <dd className="resv-deadline">{deadlineText(ap, nowMs)}</dd>
                <dt>方式</dt>
                <dd>{METHOD_LABEL[ap.method]}</dd>
                <dt>結果</dt>
                <dd>{ap.result ?? (ap.pending ? '未発表' : '公式の案内なし')}</dd>
                {ap.note && (
                  <>
                    <dt>注意</dt>
                    <dd className="pre">{ap.note}</dd>
                  </>
                )}
              </dl>
              <div className="resv-actions">
                {phase === 'open' && ap.url && (
                  <a className="btn btn-primary btn-sm" href={ap.url} target="_blank" rel="noreferrer">
                    予約ページへ ↗
                  </a>
                )}
                <MyApplyPicker value={mine} onChange={(v) => onSetApply(event.no, v)} />
              </div>
              <p className="hint">申込や当選の状況を自分用のメモとして記録できます（この端末にだけ保存）。</p>
            </section>
          )}
          {event.ticket && (
            <section className="pcard need-ticket">
              <h3>当日整理券{event.ticket.target ? `：${event.ticket.target}` : ''}</h3>
              <dl className="resv-meta">
                <dt>配布</dt>
                <dd className="resv-deadline">{event.ticket.time}</dd>
                <dt>場所</dt>
                <dd>{event.ticket.place}</dd>
                {event.ticket.count && (
                  <>
                    <dt>枚数</dt>
                    <dd>{event.ticket.count}</dd>
                  </>
                )}
              </dl>
            </section>
          )}

          <h3 className="slots-h">マイスケジュールに追加</h3>
          {sessions.some((s) => !s.open) && sessions.length > 1 && (
            <p className="talks-hint">参加する回（当選した回）を選んでください。複数選べます。</p>
          )}
          <ul className="slots">
            {sessions.map((s) => {
              const on = selected.has(s.id);
              return (
                <li key={s.id} className={'slot' + (on ? ' is-picked' : '')}>
                  <button
                    type="button"
                    className={'talk-pick' + (on ? ' is-on' : '')}
                    aria-pressed={on}
                    aria-label={on ? 'マイスケジュールから外す' : 'マイスケジュールに追加'}
                    onClick={() => onToggle(s.id)}
                  >
                    {on ? '✓' : '＋'}
                  </button>
                  <span className="slot-main">
                    <span className="slot-time">
                      {s.open ? `いつでも（${hoursText(s)}）` : `${s.label ?? ''} ${s.start}–${s.end}`}
                      {s.endEstimated && <span className="sched-est">終了は目安</span>}
                    </span>
                    <span className="slot-sub">
                      {s.sub ? `${s.sub} ・ ` : ''}
                      {sessionPlace(s)}
                    </span>
                    {s.open && on && (
                      <label className="slot-timepick">
                        行く時刻（任意）
                        <input
                          type="time"
                          min={s.start}
                          max={s.end}
                          step={300}
                          value={times[s.id] ?? ''}
                          onChange={(e) => onSetTime(s.id, e.target.value || null)}
                        />
                        {times[s.id] && (
                          <button type="button" className="linkbtn" onClick={() => onSetTime(s.id, null)}>
                            時刻を消す
                          </button>
                        )}
                      </label>
                    )}
                  </span>
                  {s.needs && <span className={'tag need-' + s.needs}>{NEEDS_LABEL[s.needs]}</span>}
                </li>
              );
            })}
          </ul>
          <p className="hint">
            <a href={program.event.listUrl} target="_blank" rel="noreferrer">
              公式サイトのイベント一覧
            </a>
            でイベント番号 {event.no} の詳しい紹介を確認できます。
          </p>
        </div>
      </aside>
    </>
  );
}
