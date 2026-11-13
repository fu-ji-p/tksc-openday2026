import type { EventInfo, MyApply } from '../types';
import { DATE, NEEDS_LABEL, program, sessionPlace, sessionTitle } from '../data';
import { MY_APPLY_LABEL, applyPhase, deadlineText } from '../lib/apply';
import { buildScheduleIcs, downloadText } from '../lib/ics';
import { hoursText, type Plan, type PlanItem } from '../lib/plan';
import { formatDateJa } from '../lib/time';

export const ICS_FILENAME = 'tksc-openday2026-myschedule.ics';

interface Props {
  plan: Plan;
  apply: Record<string, MyApply>;
  nowMs: number;
  /** compact print layout: no buttons */
  print?: boolean;
  onOpen?: (eventNo: string) => void;
  onRemove?: (id: string) => void;
  onPrint?: () => void;
}

function formatGap(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ''}` : `${m}分`;
}

function downloadIcs(plan: Plan, apply: Record<string, MyApply>) {
  const appUrl = typeof location !== 'undefined' ? location.origin + import.meta.env.BASE_URL : undefined;
  const text = buildScheduleIcs(
    {
      date: DATE,
      items: plan.timed,
      apply,
      title: (it) => sessionTitle(it.session),
      place: (it) => sessionPlace(it.session),
      needsLabel: (it) => (it.session.needs ? NEEDS_LABEL[it.session.needs] : null),
    },
    { calendarName: '特別公開2026 マイスケジュール', appUrl },
  );
  downloadText(text, ICS_FILENAME, 'text/calendar;charset=utf-8');
}

interface Todo {
  key: string;
  level: 'warn' | 'info' | 'ok';
  event: EventInfo;
  text: string;
  url?: string;
}

/** Things to do before the day for the selected events: apply, wait for the result, queue for a ticket. */
function buildTodos(items: PlanItem[], apply: Record<string, MyApply>, nowMs: number): Todo[] {
  const out: Todo[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const e = it.event;
    const key = `${e.no}:${it.session.needs ?? ''}`;
    if (!it.session.needs || seen.has(key)) continue;
    seen.add(key);
    if (it.session.needs === 'apply' && e.apply) {
      const mine = apply[e.no];
      const ph = applyPhase(e.apply, nowMs);
      if (mine === 'won') out.push({ key, level: 'ok', event: e, text: '当選・予約確定' });
      else if (mine === 'lost') out.push({ key, level: 'warn', event: e, text: '落選と記録されています。予定から外すか、当日枠を確認してください' });
      else if (mine === 'applied') out.push({ key, level: 'info', event: e, text: `申込済 ― 結果: ${e.apply.result ?? '案内を確認'}` });
      else if (ph === 'open') out.push({ key, level: 'warn', event: e, text: `未申込 ― ${deadlineText(e.apply, nowMs)}`, url: e.apply.url });
      else if (ph === 'closed') out.push({ key, level: 'warn', event: e, text: `未申込のまま受付終了（${deadlineText(e.apply, nowMs)}）` });
      else out.push({ key, level: 'info', event: e, text: `事前申込が必要 ― ${deadlineText(e.apply, nowMs)}` });
    } else if (it.session.needs === 'ticket' && e.ticket) {
      out.push({ key, level: 'info', event: e, text: `当日整理券 ― 配布 ${e.ticket.time}（${e.ticket.place}）` });
    } else if (it.session.needs === 'first') {
      out.push({ key, level: 'info', event: e, text: `当日先着順${e.firstCome ? ` ― ${e.firstCome}` : ''}` });
    }
  }
  const rank = { warn: 0, info: 1, ok: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.event.no.localeCompare(b.event.no));
}

export function MySchedule({ plan, apply, nowMs, print = false, onOpen, onRemove, onPrint }: Props) {
  const total = plan.timed.length + plan.free.length;
  const todos = buildTodos([...plan.timed, ...plan.free], apply, nowMs);

  const renderItem = (it: PlanItem) => {
    const s = it.session;
    const e = it.event;
    const move = plan.moveBefore.get(it.id);
    const mine = s.needs === 'apply' ? apply[e.no] : undefined;
    const conflict = plan.conflicts.has(it.id);
    return (
      <li key={it.id} className="sched-item-wrap">
        {move && (
          <div className="move-note">
            🚶 エリア移動: {move.from}エリア → {move.to}エリア
            {move.gapMinutes >= 0 ? `（空き ${formatGap(move.gapMinutes)}）` : '（時間が重なっています）'}
          </div>
        )}
        <article
          className={'sched-item need-' + (s.needs ?? 'free') + (conflict ? ' is-conflict' : '') + (it.offHours ? ' is-offhours' : '') + (mine === 'lost' ? ' is-lost' : '')}
          onClick={onOpen ? () => onOpen(e.no) : undefined}
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onKeyDown={onOpen ? (ev) => ev.key === 'Enter' && onOpen(e.no) : undefined}
        >
          <div className="sched-time">
            {it.timed ? (
              <>
                <span>{it.start}</span>
                <span className="sched-time-end">{it.end}</span>
                {(it.custom || s.endEstimated) && <span className="sched-est">{it.custom ? '自分で設定' : '終了は目安'}</span>}
              </>
            ) : (
              <span className="sched-anytime">いつでも</span>
            )}
          </div>
          <div className="sched-main">
            <div className="sched-badges">
              <span className={'evno evno-sm area-' + it.area}>{e.no}</span>
              {s.needs && <span className={'tag need-' + s.needs}>{NEEDS_LABEL[s.needs]}</span>}
              {s.needs === 'apply' && <span className={'tag mine-' + (mine ?? 'none')}>{mine ? MY_APPLY_LABEL[mine] : '未申込'}</span>}
              {conflict && <span className="badge badge-warn">重複</span>}
              {it.offHours && <span className="badge badge-alert">時間外</span>}
            </div>
            <h3 className="sched-title">{sessionTitle(s)}</h3>
            <div className="sched-venue">
              <span className={'bld-tag area-' + it.area}>{it.area}エリア</span> {sessionPlace(s)}
            </div>
            {it.offHours && (
              <div className="time-alert" role="alert">
                ⚠ {it.start} は実施していない時間です。開催は {hoursText(s)}。{!print && 'タップして行く時刻を変えてください。'}
              </div>
            )}
            {!it.timed && (
              <div className="sched-chair">
                開催 {hoursText(s)}
                {!print && ' ・ タップして行く時刻を決められます'}
              </div>
            )}
            {s.needs === 'ticket' && e.ticket && (
              <div className="sched-chair">
                整理券: {e.ticket.time}（{e.ticket.place}）
              </div>
            )}
            {print && e.note && <div className="sched-chair">{e.note}</div>}
          </div>
          {onRemove && (
            <button
              type="button"
              className="sched-remove"
              aria-label="削除"
              onClick={(ev) => {
                ev.stopPropagation();
                onRemove(it.id);
              }}
            >
              ×
            </button>
          )}
        </article>
      </li>
    );
  };

  return (
    <div className={'sched' + (print ? ' sched-print' : '')}>
      {!print && (
        <div className="sched-toolbar">
          <span className="sched-count">
            {formatDateJa(DATE)} ・ {total}件を選択中
          </span>
          <span className="sched-actions">
            <button
              type="button"
              className="btn"
              onClick={() => downloadIcs(plan, apply)}
              disabled={plan.timed.length === 0}
              title="時刻の決まった予定を iCalendar (.ics) ファイルに保存します。Google カレンダー・iPhone のカレンダー・Outlook で開くと追加できます。"
            >
              📅 カレンダーに書き出し
            </button>
            <button type="button" className="btn" onClick={onPrint} disabled={total === 0}>
              🖨 印刷
            </button>
          </span>
        </div>
      )}
      {!print && (
        <p className="notice">
          選択内容はこのブラウザ内にだけ保存されます。当日使う端末（スマホ）で追加するのが確実です。
          パソコンで作った場合は ⚙ 設定の「リンクをコピー」でスマホへ送れます。
        </p>
      )}
      {!print && total === 0 && (
        <p className="sched-empty">
          まだ何も選んでいません。「タイムテーブル」や「イベント一覧」でイベントをタップし、行きたい回・当選した回の ＋ を押してください。
        </p>
      )}

      {todos.length > 0 && (
        <section className="sched-day">
          <h2 className="sched-date">申込・整理券の確認</h2>
          <ul className="todo-list">
            {todos.map((t) => (
              <li key={t.key} className={'todo todo-' + t.level}>
                <span className={'evno evno-sm area-' + t.event.areas[0]}>{t.event.no}</span>
                <span className="todo-main">
                  <span className="todo-title">{t.event.title}</span>
                  <span className="todo-text">{t.text}</span>
                </span>
                {!print && t.url && (
                  <a className="btn btn-sm btn-primary" href={t.url} target="_blank" rel="noreferrer">
                    予約 ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(plan.timed.length > 0 || !print) && (
        <section className="sched-day">
          <h2 className="sched-date">
            時刻の決まった予定
            {plan.conflicts.size > 0 && <span className="badge badge-warn">重複あり</span>}
            {plan.timed.some((x) => x.offHours) && <span className="badge badge-alert">時間外あり</span>}
          </h2>
          {plan.timed.length === 0 ? <p className="sched-none">選択なし</p> : <ol className="sched-list">{plan.timed.map(renderItem)}</ol>}
        </section>
      )}
      {plan.free.length > 0 && (
        <section className="sched-day">
          <h2 className="sched-date">いつでも行けるイベント</h2>
          <ol className="sched-list">{plan.free.map(renderItem)}</ol>
        </section>
      )}
      {print && (
        <p className="print-foot">
          このアプリは個人が作成したもので、JAXA 公式のものではありません。内容は {formatDateJa(program.event.generatedAt)}
          時点の公開情報にもとづきます。最新情報は公式サイトをご確認ください。（アプリ v{__APP_VERSION__}）
        </p>
      )}
    </div>
  );
}
