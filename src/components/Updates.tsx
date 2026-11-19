import { useEffect } from 'react';
import { eventByNo, program, updates } from '../data';
import { formatDateJa } from '../lib/time';

interface Props {
  /** the newest update date the visitor had already seen when the sheet opened ('' = never) */
  seenBefore: string;
  onOpenEvent: (no: string) => void;
  onClose: () => void;
}

/** "What changed on the official site": the official page shows no change log, so the daily check records one here. */
export function Updates({ seenBefore, onOpenEvent, onClose }: Props) {
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
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="updates-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 id="updates-title" className="sheet-title updates-title">
            更新情報
          </h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <div className="sheet-body">
          <p className="notice">
            公式サイトには更新情報が出ないため、このアプリが毎朝
            <a href={program.event.site} target="_blank" rel="noreferrer">
              公式サイト
            </a>
            を確認し、見つけた変更をここに載せています。最新の内容は公式サイトで確認してください。
          </p>
          {updates.length === 0 && <p className="sched-none">まだ更新はありません。</p>}
          {updates.map((u) => (
            <section key={u.date} className="update-day">
              <h3 className="update-date">
                {formatDateJa(u.date)}
                {u.date > seenBefore && <span className="badge badge-new">NEW</span>}
              </h3>
              <ul className="update-list">
                {u.items.map((it, i) => {
                  const e = it.no ? eventByNo.get(it.no) : undefined;
                  return (
                    <li key={i} className="update-item">
                      {e ? (
                        <button
                          type="button"
                          className="update-event"
                          onClick={() => {
                            onClose();
                            onOpenEvent(e.no);
                          }}
                        >
                          <span className={'evno evno-sm area-' + e.areas[0]}>{e.no}</span>
                          <span className="update-event-title">{e.title}</span>
                        </button>
                      ) : null}
                      <p className="update-text">{it.text}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
