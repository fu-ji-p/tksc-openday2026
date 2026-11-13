import { useMemo, useState } from 'react';
import type { AreaId, EventInfo, MyApply } from '../types';
import { program } from '../data';
import { MY_APPLY_LABEL } from '../lib/apply';
import { EventNo, ParticipationBadges } from './Badges';

type How = 'all' | 'apply' | 'ticket' | 'free';

interface Props {
  events: EventInfo[];
  /** event numbers with at least one selected session */
  picked: Set<string>;
  apply: Record<string, MyApply>;
  matchSet: Set<string> | null;
  onOpen: (eventNo: string) => void;
}

const HOW_LABEL: Record<How, string> = { all: 'すべて', apply: '事前申込', ticket: '整理券', free: '申込不要' };

function matchesHow(e: EventInfo, how: How): boolean {
  if (how === 'apply') return !!e.apply;
  if (how === 'ticket') return !!e.ticket;
  if (how === 'free') return !e.apply && !e.ticket;
  return true;
}

export function EventList({ events, picked, apply, matchSet, onOpen }: Props) {
  const [area, setArea] = useState<AreaId | 'all'>('all');
  const [how, setHow] = useState<How>('all');
  const [category, setCategory] = useState('');
  const categories = useMemo(() => Array.from(new Set(events.flatMap((e) => e.categories))), [events]);

  const shown = events.filter(
    (e) =>
      (area === 'all' || e.areas.includes(area)) &&
      matchesHow(e, how) &&
      (category === '' || e.categories.includes(category)) &&
      (!matchSet || matchSet.has(e.no)),
  );

  return (
    <div className="page">
      <div className="filters">
        <div className="chips" role="group" aria-label="エリア">
          <button type="button" className={'fchip' + (area === 'all' ? ' is-on' : '')} onClick={() => setArea('all')}>
            全エリア
          </button>
          {program.areas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={'fchip area-' + a.id + (area === a.id ? ' is-on' : '')}
              onClick={() => setArea(area === a.id ? 'all' : a.id)}
            >
              {a.id}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="参加方法">
          {(Object.keys(HOW_LABEL) as How[]).map((h) => (
            <button key={h} type="button" className={'fchip' + (how === h ? ' is-on' : '')} onClick={() => setHow(h)}>
              {HOW_LABEL[h]}
            </button>
          ))}
          <select className="fselect" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="カテゴリ">
            <option value="">カテゴリ: すべて</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="list-count">{shown.length}件</p>
      <ul className="evlist">
        {shown.map((e) => {
          const mine = apply[e.no];
          return (
            <li key={e.no}>
              <button type="button" className={'evrow' + (picked.has(e.no) ? ' is-picked' : '')} onClick={() => onOpen(e.no)}>
                <EventNo event={e} />
                <span className="evrow-main">
                  <span className="evrow-title">{e.title}</span>
                  <span className="evrow-meta">
                    {e.placeText.split('\n')[0]}
                    {e.placeText.includes('\n') ? ' ほか' : ''} ・ {e.timeText.split('\n')[0]}
                  </span>
                  <span className="evrow-tags">
                    <ParticipationBadges event={e} />
                    {mine && <span className={'tag mine-' + mine}>{MY_APPLY_LABEL[mine]}</span>}
                  </span>
                </span>
                {picked.has(e.no) && (
                  <span className="evrow-check" aria-label="マイスケジュールに追加済み">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="sched-empty">条件に合うイベントがありません。</p>}
    </div>
  );
}
