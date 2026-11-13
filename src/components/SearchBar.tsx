interface Props {
  value: string;
  onChange: (q: string) => void;
  /** number of matching events (only when a query is active) */
  count: number | null;
}

export function SearchBar({ value, onChange, count }: Props) {
  return (
    <div className="searchbar">
      <div className="search-row">
        <input
          type="search"
          className="search-input"
          placeholder="検索: イベント名・場所・番号・カテゴリ"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          enterKeyHint="search"
          aria-label="検索"
        />
        {value && (
          <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="検索をクリア">
            ×
          </button>
        )}
        {count !== null && <span className="search-total">{count}件</span>}
      </div>
    </div>
  );
}
