import { useRef, useState } from 'react';
import { shareUrl } from '../lib/share';
import { program } from '../data';
import { DataFreshness } from './DataFreshness';
import { parseScheduleJson, serializeSchedule, type ScheduleState } from '../lib/storage';

interface Props {
  state: ScheduleState;
  /** entries that exist in the current program */
  visibleCount: number;
  onReplace: (state: ScheduleState) => void;
  onClear: () => void;
  onClose: () => void;
}

export function SettingsMenu({ state, visibleCount, onReplace, onClear, onClose }: Props) {
  const selected = state.selected;
  const recordCount = selected.length + Object.keys(state.apply).length;
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const json = () => serializeSchedule(state);

  const copyText = async (t: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setMsg(okMsg);
    } catch {
      setText(t);
      setMsg('コピーできないため下の欄に表示しました。手動でコピーしてください');
    }
  };

  const shareLink = async () => {
    const url = shareUrl(state);
    if (navigator.share) {
      try {
        await navigator.share({ title: '特別公開2026 マイスケジュール', url });
        return;
      } catch {
        /* cancelled: fall back to copy */
      }
    }
    await copyText(url, 'リンクをコピーしました。スマホのブラウザで開くと読み込めます');
  };

  const download = () => {
    const blob = new Blob([json()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tksc-openday2026-schedule.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importText = (t: string) => {
    const parsed = parseScheduleJson(t);
    if (!parsed) {
      setMsg('読み込めませんでした。{"selected":[...]} 形式のJSONを貼り付けてください');
      return;
    }
    onReplace({ selected: parsed.selected, times: parsed.times, apply: parsed.apply });
    setMsg(`${parsed.selected.length}件の予定と${Object.keys(parsed.apply).length}件の申込メモを読み込みました`);
    setText('');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    importText(await f.text());
    if (fileRef.current) fileRef.current.value = '';
  };

  const clear = () => {
    if (recordCount === 0 || window.confirm('マイスケジュールと申込状況のメモをすべて消します。よろしいですか？')) {
      onClear();
      setMsg('すべて消しました');
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 id="settings-title" className="settings-title">
            設定
          </h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <div className="sheet-body settings">
          <p className="notice">
            選んだ予定と申込状況のメモはこのブラウザ内（localStorage）にだけ保存され、サーバーには送られません。
            別の端末やブラウザには自動では引き継がれないため、<strong>当日使う端末で追加する</strong>のが確実です。
            パソコンで作った場合は下の「リンクをコピー」でスマホへ送ってください。
          </p>
          <section>
            <h3>別の端末へ送る</h3>
            <p className="hint">
              予定 {visibleCount}件 ・ 申込メモ {Object.keys(state.apply).length}件
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={shareLink} disabled={recordCount === 0}>
                🔗 リンクをコピー / 共有
              </button>
            </div>
            <p className="hint">リンクをスマホで開くと、含まれる予定と申込メモを読み込むか確認されます。</p>
          </section>
          <section>
            <h3>JSONを書き出し</h3>
            <div className="row">
              <button type="button" className="btn" onClick={download}>
                ファイルを保存
              </button>
              <button type="button" className="btn" onClick={() => copyText(json(), 'クリップボードにコピーしました')}>
                クリップボードにコピー
              </button>
            </div>
          </section>
          <section>
            <h3>JSONを読み込み</h3>
            <p className="hint">読み込むと現在の予定と申込メモは置き換えられます。</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                ファイルを選択
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            <textarea
              className="json-area"
              rows={4}
              placeholder='{"selected":["12", "14/2", ...]}'
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="button" className="btn" disabled={!text.trim()} onClick={() => importText(text)}>
              貼り付けた内容を読み込む
            </button>
          </section>
          <section>
            <h3>すべて消す</h3>
            <button type="button" className="btn btn-danger" onClick={clear}>
              予定と申込メモを消す
            </button>
          </section>
          {msg && <p className="settings-msg">{msg}</p>}
          <section className="about">
            <h3>このアプリについて（v{__APP_VERSION__}）</h3>
            <p className="hint">
              このアプリは個人が作成した非公式ツールで、JAXA 公式のものではありません。内容は公式サイトの公開情報をもとに作成しています。
              <DataFreshness />。確認の後の変更（申込方法の発表、時間の変更、中止など）は反映されていない場合があります。受付状況は端末の時計から判定した目安です。申込や来場の前に必ず
              <a href={program.event.site} target="_blank" rel="noreferrer">
                公式サイト
              </a>
              をご確認ください。
            </p>
            <p className="hint">「終了は目安」と表示される時刻は、公式に終了時刻の記載がないため仮に置いたものです。</p>
            <p className="hint">
              利用状況の把握のため、訪問数を GoatCounter で匿名計測しています（Cookie や個人を特定する情報は使いません）。
              マイスケジュールや申込状況のメモの内容は送信されません。
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}
