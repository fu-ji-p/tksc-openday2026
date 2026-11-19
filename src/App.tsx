import { useCallback, useEffect, useMemo, useState } from 'react';
import { DATE, LATEST_UPDATE, eventByNo, fixedSessions, program, sessionArea, sessionById } from './data';
import { EventDetail } from './components/EventDetail';
import { EventList } from './components/EventList';
import { MySchedule } from './components/MySchedule';
import { Reservations } from './components/Reservations';
import { SearchBar } from './components/SearchBar';
import { SettingsMenu } from './components/SettingsMenu';
import { Timetable } from './components/Timetable';
import { Updates } from './components/Updates';
import { useNow } from './hooks/useNow';
import { useSchedule } from './hooks/useSchedule';
import { applyPhase, isUrgent } from './lib/apply';
import { buildColumns } from './lib/layout';
import { buildPlan, selectedEvents, type Lookup } from './lib/plan';
import { matchEvents } from './lib/search';
import { parseShareHash } from './lib/share';
import type { ScheduleState } from './lib/storage';
import { formatDateJa } from './lib/time';

type View = 'timetable' | 'list' | 'apply' | 'schedule';

const db: Lookup = { sessionById, eventByNo, areaOf: sessionArea };
const ONLY_MINE_KEY = 'tksc-openday2026.onlyMine';
/** newest update date the visitor has opened (UI convenience, separate from the schedule) */
const SEEN_UPDATES_KEY = 'tksc-openday2026.seenUpdates';
const isKnown = (id: string) => sessionById.has(id);
const gridColumns = buildColumns(
  program.areas.map((a) => a.id),
  program.places,
  program.sessions,
  sessionArea,
  (s) => eventByNo.get(s.event)?.placeText ?? '',
);

export default function App() {
  const now = useNow();
  const [view, setView] = useState<View>('timetable');
  const schedule = useSchedule(isKnown);
  const { state } = schedule;
  const [openNo, setOpenNo] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const close = useCallback(() => setOpenNo(null), []);
  const open = openNo ? eventByNo.get(openNo) : undefined;

  // timetable filter "only what I added": a per-device convenience, remembered separately from the schedule itself
  const [onlyMine, setOnlyMineState] = useState(() => {
    try {
      return window.localStorage.getItem(ONLY_MINE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setOnlyMine = useCallback((on: boolean) => {
    setOnlyMineState(on);
    try {
      window.localStorage.setItem(ONLY_MINE_KEY, on ? '1' : '0');
    } catch {
      /* private mode: keep it for this visit only */
    }
  }, []);

  // "更新情報": a dot on the button until the newest entry has been opened once
  const [seenUpdates, setSeenUpdates] = useState(() => {
    try {
      return window.localStorage.getItem(SEEN_UPDATES_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [updatesOpen, setUpdatesOpen] = useState<string | null>(null); // value = seen date when opened
  const hasNewUpdate = LATEST_UPDATE !== '' && LATEST_UPDATE > seenUpdates;
  const openUpdates = () => {
    setUpdatesOpen(seenUpdates);
    setSeenUpdates(LATEST_UPDATE);
    try {
      window.localStorage.setItem(SEEN_UPDATES_KEY, LATEST_UPDATE);
    } catch {
      /* private mode */
    }
  };

  const [query, setQuery] = useState('');
  const matchSet = useMemo(() => matchEvents(program.events, query), [query]);

  const selectedSet = useMemo(() => new Set(state.selected), [state.selected]);
  const picked = useMemo(() => selectedEvents(state.selected, db), [state.selected]);
  const plan = useMemo(() => buildPlan(state.selected, state.times, db), [state.selected, state.times]);
  // entries that resolve against the current program (stale ids stay stored but are not counted)
  const visibleCount = plan.timed.length + plan.free.length;
  // open applications closing within 3 days that the visitor has not dealt with yet
  const urgentCount = useMemo(
    () => program.events.filter((e) => e.apply && !state.apply[e.no] && isUrgent(e.apply, now.ms)).length,
    [state.apply, now.ms],
  );
  const openApplyCount = useMemo(
    () => program.events.filter((e) => e.apply && applyPhase(e.apply, now.ms) === 'open').length,
    [now.ms],
  );

  // A share link (#s=...) opened on another device: offer to import it (banner), then drop the hash.
  const [pendingImport, setPendingImport] = useState<ScheduleState | null>(null);
  useEffect(() => {
    const check = () => {
      const shared = parseShareHash(window.location.hash);
      if (!shared) return;
      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (shared.selected.length > 0 || Object.keys(shared.apply).length > 0) setPendingImport(shared);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);
  const acceptImport = () => {
    if (pendingImport) schedule.replace(pendingImport);
    setPendingImport(null);
    setView('schedule');
  };

  const tab = (v: View, label: string, extra?: React.ReactNode) => (
    <button type="button" className={'navtab' + (view === v ? ' is-active' : '')} onClick={() => setView(v)} aria-current={view === v}>
      {label}
      {extra}
    </button>
  );

  return (
    <>
      <div className="app screen-only">
        <header className="topbar">
          <h1 className="topbar-title">
            <span className="title-long">{program.event.name} マイスケジュール</span>
            <span className="title-short">筑波宇宙センター特別公開2026</span>
          </h1>
          <span className="topbar-date">
            {formatDateJa(DATE)} {program.event.open}–{program.event.close}
          </span>
          <button
            type="button"
            className={'topbtn' + (hasNewUpdate ? ' has-new' : '')}
            onClick={openUpdates}
            aria-label={hasNewUpdate ? '更新情報（新しい更新あり）' : '更新情報'}
          >
            更新情報
          </button>
          <button type="button" className="iconbtn" aria-label="設定" onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
        </header>
        <nav className="navtabs" aria-label="画面切替">
          {tab('timetable', 'タイムテーブル')}
          {tab('list', 'イベント一覧')}
          {tab(
            'apply',
            '予約・整理券',
            urgentCount > 0 ? (
              <span className="count count-warn" title="締切が3日以内の未申込">
                {urgentCount}
              </span>
            ) : openApplyCount > 0 ? (
              <span className="count count-muted">{openApplyCount}</span>
            ) : null,
          )}
          {tab('schedule', 'マイスケジュール', visibleCount > 0 ? <span className="count">{visibleCount}</span> : null)}
        </nav>
        {pendingImport && (
          <div className="import-banner" role="alert">
            <span>
              リンクに{pendingImport.selected.length}件の予定と{Object.keys(pendingImport.apply).length}件の申込メモが含まれています。読み込みますか？
              {visibleCount > 0 && `（この端末の${visibleCount}件は置き換えられます）`}
            </span>
            <span className="row">
              <button type="button" className="btn btn-sm btn-primary" onClick={acceptImport}>
                読み込む
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setPendingImport(null)}>
                無視
              </button>
            </span>
          </div>
        )}
        {(view === 'timetable' || view === 'list') && <SearchBar value={query} onChange={setQuery} count={matchSet ? matchSet.size : null} />}
        {view === 'timetable' && (
          <main className="main">
            <Timetable
              columns={gridColumns}
              sessions={fixedSessions}
              selected={selectedSet}
              apply={state.apply}
              matchSet={matchSet}
              nowMinutes={now.date === DATE ? now.minutes : null}
              onlyMine={onlyMine}
              onOnlyMine={setOnlyMine}
              onOpen={setOpenNo}
            />
          </main>
        )}
        {view === 'list' && (
          <main className="main main-scroll">
            <EventList events={program.events} picked={picked} apply={state.apply} matchSet={matchSet} onOpen={setOpenNo} />
          </main>
        )}
        {view === 'apply' && (
          <main className="main main-scroll">
            <Reservations events={program.events} apply={state.apply} nowMs={now.ms} onSetApply={schedule.setApply} onOpen={setOpenNo} />
          </main>
        )}
        {view === 'schedule' && (
          <main className="main main-scroll">
            <MySchedule plan={plan} apply={state.apply} nowMs={now.ms} onOpen={setOpenNo} onRemove={schedule.remove} onPrint={() => window.print()} />
          </main>
        )}
        {open && (
          <EventDetail
            event={open}
            selected={selectedSet}
            times={state.times}
            mine={state.apply[open.no]}
            nowMs={now.ms}
            onToggle={schedule.toggle}
            onSetTime={schedule.setTime}
            onSetApply={schedule.setApply}
            onClose={close}
          />
        )}
        {updatesOpen !== null && <Updates seenBefore={updatesOpen} onOpenEvent={setOpenNo} onClose={() => setUpdatesOpen(null)} />}
        {settingsOpen && (
          <SettingsMenu
            state={state}
            visibleCount={visibleCount}
            onReplace={schedule.replace}
            onClear={schedule.clear}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
      {/* Print layout (A4 portrait). Hidden on screen; Cmd/Ctrl+P works from any view. */}
      <div className="print-root print-only">
        <header className="print-head">
          <h1>
            {program.event.name} マイスケジュール（{formatDateJa(DATE)}）
          </h1>
          <p>
            {window.location.href.split(/[?#]/)[0]} ・ 印刷: {new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </p>
        </header>
        <MySchedule plan={plan} apply={state.apply} nowMs={now.ms} print />
      </div>
    </>
  );
}
