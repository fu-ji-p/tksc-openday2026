import type { EventInfo } from '../types';

/** NFKC (full-width -> half-width etc.), lower-case, trimmed. */
export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

/** Space-separated terms (all must match). Empty query -> []. */
export function queryTerms(query: string): string[] {
  return normalize(query).split(/[\s　]+/).filter(Boolean);
}

const cache = new WeakMap<EventInfo, string>();
function text(e: EventInfo): string {
  let h = cache.get(e);
  if (!h) {
    h = normalize([e.no, e.title, e.summary, e.placeText, e.categories.join(' '), e.participation.join(' '), e.note ?? ''].join('\n'));
    cache.set(e, h);
  }
  return h;
}

/** Numbers of events whose number, title, summary, place or category match every term. null when the query is empty. */
export function matchEvents(events: EventInfo[], query: string): Set<string> | null {
  const terms = queryTerms(query);
  if (terms.length === 0) return null;
  const out = new Set<string>();
  for (const e of events) {
    const h = text(e);
    if (terms.every((t) => h.includes(t))) out.add(e.no);
  }
  return out;
}
