import { useMemo } from 'react';
import type { EventInfo, MyApply } from '../types';
import { program } from '../data';
import { METHOD_LABEL, applyPhase, deadlineText, isUrgent, sortForApplying } from '../lib/apply';
import { buildDeadlineIcs, downloadText } from '../lib/ics';
import { formatDateJa } from '../lib/time';
import { EventNo, MyApplyPicker, PhasePill } from './Badges';

interface Props {
  events: EventInfo[];
  apply: Record<string, MyApply>;
  nowMs: number;
  onSetApply: (no: string, status: MyApply | null) => void;
  onOpen: (eventNo: string) => void;
}

function appUrl(): string | undefined {
  return typeof location !== 'undefined' ? location.origin + import.meta.env.BASE_URL : undefined;
}

export function Reservations({ events, apply, nowMs, onSetApply, onOpen }: Props) {
  const applyEvents = useMemo(() => sortForApplying(events, nowMs), [events, nowMs]);
  const ticketEvents = events.filter((e) => e.ticket);
  const firstEvents = events.filter((e) => e.firstCome);
  const count = (s: MyApply) => applyEvents.filter((e) => apply[e.no] === s).length;
  const openCount = applyEvents.filter((e) => applyPhase(e.apply!, nowMs) === 'open').length;

  const exportDeadlines = () =>
    downloadText(
      buildDeadlineIcs(events, nowMs, { calendarName: '特別公開2026 申込締切', appUrl: appUrl() }),
      'tksc-openday2026-deadlines.ics',
      'text/calendar;charset=utf-8',
    );

  return (
    <div className="page">
      <section>
        <h2 className="page-h">
          事前申込 <span className="page-h-n">{applyEvents.length}件</span>
        </h2>
        <p className="notice">
          締切の近い順に並べています。受付状況は端末の時計から判定した目安で、{formatDateJa(program.event.generatedAt)}
          時点の公式情報をもとにしています。申込の前に必ず
          <a href={program.event.site} target="_blank" rel="noreferrer">
            公式サイト
          </a>
          と予約ページで最新の内容を確認してください。
        </p>
        <div className="resv-summary">
          <span>受付中 {openCount}件</span>
          <span>申込済 {count('applied')}</span>
          <span>当選・確定 {count('won')}</span>
          <span>落選 {count('lost')}</span>
          <button type="button" className="btn btn-sm" onClick={exportDeadlines} disabled={openCount === 0}>
            📅 締切をカレンダーに書き出し
          </button>
        </div>
        <ol className="resv-list">
          {applyEvents.map((e) => {
            const ap = e.apply!;
            const ph = applyPhase(ap, nowMs);
            return (
              <li key={e.no} className={'resv phase-' + ph + (isUrgent(ap, nowMs) ? ' is-urgent' : '')}>
                <button type="button" className="resv-head" onClick={() => onOpen(e.no)}>
                  <EventNo event={e} />
                  <span className="resv-title">{e.title}</span>
                  <PhasePill apply={ap} nowMs={nowMs} />
                </button>
                <dl className="resv-meta">
                  {ap.target && (
                    <>
                      <dt>対象</dt>
                      <dd>{ap.target} のみ事前申込</dd>
                    </>
                  )}
                  <dt>締切</dt>
                  <dd className="resv-deadline">{deadlineText(ap, nowMs)}</dd>
                  <dt>方式</dt>
                  <dd>
                    {METHOD_LABEL[ap.method]}
                    {e.capacity ? ` ／ 定員 ${e.capacity}` : ''}
                  </dd>
                  <dt>結果</dt>
                  <dd>{ap.result ?? (ap.pending ? '未発表' : '公式の案内なし')}</dd>
                  <dt>開催</dt>
                  <dd className="pre">{e.timeText}</dd>
                  {ap.note && (
                    <>
                      <dt>注意</dt>
                      <dd className="pre">{ap.note}</dd>
                    </>
                  )}
                </dl>
                <div className="resv-actions">
                  {ph === 'open' && ap.url ? (
                    <a className="btn btn-primary btn-sm" href={ap.url} target="_blank" rel="noreferrer">
                      予約ページへ ↗
                    </a>
                  ) : (
                    <span className="resv-nolink">
                      {ph === 'pending' ? '予約ページは未公開' : ph === 'before' ? '受付開始後に予約ページが開きます' : '受付は終了しました'}
                    </span>
                  )}
                  <MyApplyPicker value={apply[e.no]} onChange={(v) => onSetApply(e.no, v)} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="page-h">
          当日の整理券 <span className="page-h-n">{ticketEvents.length}件</span>
        </h2>
        <p className="notice">整理券は当日会場で配布されます。配布時間より前には並べません。参加する全員がそろってから並んでください。</p>
        <ol className="resv-list">
          {ticketEvents.map((e) => (
            <li key={e.no} className="resv is-ticket">
              <button type="button" className="resv-head" onClick={() => onOpen(e.no)}>
                <EventNo event={e} />
                <span className="resv-title">{e.title}</span>
              </button>
              <dl className="resv-meta">
                {e.ticket!.target && (
                  <>
                    <dt>対象</dt>
                    <dd>{e.ticket!.target}</dd>
                  </>
                )}
                <dt>配布</dt>
                <dd className="resv-deadline">{e.ticket!.time}</dd>
                <dt>場所</dt>
                <dd>{e.ticket!.place}</dd>
                {e.ticket!.count && (
                  <>
                    <dt>枚数</dt>
                    <dd>{e.ticket!.count}</dd>
                  </>
                )}
                <dt>開催</dt>
                <dd className="pre">{e.timeText}</dd>
              </dl>
            </li>
          ))}
        </ol>
      </section>

      {firstEvents.length > 0 && (
        <section>
          <h2 className="page-h">
            当日先着順 <span className="page-h-n">{firstEvents.length}件</span>
          </h2>
          <ol className="resv-list">
            {firstEvents.map((e) => (
              <li key={e.no} className="resv is-first">
                <button type="button" className="resv-head" onClick={() => onOpen(e.no)}>
                  <EventNo event={e} />
                  <span className="resv-title">{e.title}</span>
                </button>
                <dl className="resv-meta">
                  <dt>先着</dt>
                  <dd>{e.firstCome}</dd>
                  <dt>開催</dt>
                  <dd className="pre">{e.timeText}</dd>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
