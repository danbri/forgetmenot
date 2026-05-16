// Client-side filtering / paging helper for the facilities whose
// upstream API does not expose a server-side filter we want to offer
// (notably treaties + statutory instruments, which have no date-range
// query parameter despite advertising response fields that are dates).
//
// The helper auto-pages through the upstream API, applies a client
// predicate, and returns the same `{ items, totalResults }` shape the
// raw endpoint returns. It also surfaces metadata under the
// underscore-prefixed keys so callers can see how aggressive the
// scan was.
//
//   await collectFiltered({
//     fetchPage: ({ skip, take }) => api.search({ skip, take, ...other }),
//     predicate: (item) => item.laidDate >= '2026-02-16',
//     take: 50,                 // number of post-filter results to keep
//     pageSize: 200,            // page size to ask the API for
//     maxFetch: 2000,           // safety cap on records pulled
//     stopWhen: (item) => item.laidDate < '2026-02-16', // optional
//                                                       // monotonic-end
//                                                       // shortcut
//   });

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_FETCH = 2000;

// Unwrap the API's `{ items: [{ value: {...} }], totalResults }`
// envelope into a plain { items: [...] } where `items` are the inner
// `value` objects. Both the SI and Treaties endpoints use that
// double-wrap; the helper handles either shape.
function unwrap(page) {
  if (!page) return { items: [], totalResults: 0, raw: [] };
  const raw = Array.isArray(page.items) ? page.items : [];
  const items = raw.map((r) => (r && typeof r === 'object' && 'value' in r ? r.value : r));
  return { items, totalResults: page.totalResults ?? raw.length, raw };
}

export async function collectFiltered({
  fetchPage,
  predicate,
  stopWhen,
  take = 50,
  pageSize = DEFAULT_PAGE_SIZE,
  maxFetch = DEFAULT_MAX_FETCH,
  skip = 0,
} = {}) {
  if (typeof fetchPage !== 'function') {
    throw new Error('collectFiltered: fetchPage is required');
  }
  const pred = typeof predicate === 'function' ? predicate : () => true;
  const stop = typeof stopWhen === 'function' ? stopWhen : null;

  const kept = [];
  const keptRaw = [];
  let fetched = 0;
  let unfilteredTotal = null;
  let exhausted = false;
  let cursor = skip;

  while (kept.length < take && fetched < maxFetch) {
    const remaining = Math.min(pageSize, maxFetch - fetched);
    const page = await fetchPage({ skip: cursor, take: remaining });
    const { items, totalResults, raw } = unwrap(page);
    if (unfilteredTotal === null) unfilteredTotal = totalResults;
    if (items.length === 0) { exhausted = true; break; }
    fetched += items.length;
    cursor += items.length;

    let earlyStop = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (stop && stop(it)) { earlyStop = true; break; }
      if (pred(it)) {
        kept.push(it);
        keptRaw.push(raw[i]);
        if (kept.length >= take) break;
      }
    }
    if (earlyStop) { exhausted = true; break; }
    // Page returned fewer than requested → no more pages.
    if (items.length < remaining) { exhausted = true; break; }
  }

  return {
    items: keptRaw,                 // preserve the API's outer envelope shape
    values: kept,                   // unwrapped values for convenience
    totalResults: kept.length,
    _unfilteredTotal: unfilteredTotal,
    _fetched: fetched,
    _exhausted: exhausted,
  };
}

// Helpers for building date-window predicates / stop callbacks.
// All three accept undefined bounds → effectively unbounded.
export function dateBetween(field, from, to) {
  const f = from ? String(from) : null;
  const t = to ? String(to) : null;
  return (item) => {
    const v = item?.[field];
    if (!v) return false;
    const s = String(v).slice(0, 10);
    if (f && s < f) return false;
    if (t && s > t) return false;
    return true;
  };
}

// For monotonically-descending result orderings (e.g. SI / treaties
// default sort), once we see an item older than `from` we can stop.
export function olderThanCutoff(field, from) {
  if (!from) return null;
  const f = String(from);
  return (item) => {
    const v = item?.[field];
    if (!v) return false;
    return String(v).slice(0, 10) < f;
  };
}

// Combine multiple predicates with AND. Skips null/undefined ones.
export function andPredicates(...preds) {
  const ps = preds.filter((p) => typeof p === 'function');
  if (ps.length === 0) return () => true;
  return (item) => ps.every((p) => p(item));
}
