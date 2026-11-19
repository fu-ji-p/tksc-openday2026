import { program } from '../data';
import { useLastChecked } from '../hooks/useLastChecked';
import { formatDateJa, formatInstantJa } from '../lib/time';

/** "公式サイトの最終確認 11/20(金) 8:36（内容の最終更新 11/20(金)）" */
export function DataFreshness() {
  const checkedAt = useLastChecked();
  const updated = formatDateJa(program.event.generatedAt);
  return (
    <span className="freshness">
      {checkedAt ? `公式サイトの最終確認 ${formatInstantJa(checkedAt)}（内容の最終更新 ${updated}）` : `内容の最終更新 ${updated}`}
    </span>
  );
}
