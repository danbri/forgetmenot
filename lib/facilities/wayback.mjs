// Internet Archive Wayback Machine client.
//
// We use Wayback as a fallback when an origin blocks us (Cloudflare
// 403, persistent 5xx, robots-disallow at the origin) but the URL
// is publicly archived. Only the public Wayback APIs are used; no
// auth token needed.
//
// Two endpoints we care about:
//
//   * Availability — single closest capture for a URL:
//       GET https://archive.org/wayback/available?url=<url>&timestamp=<YYYYMMDDhhmmss?>
//     Returns { archived_snapshots: { closest: { available, url, timestamp, status } } }
//
//   * CDX server — full capture history with filters:
//       GET https://web.archive.org/cdx/search/cdx?url=<url>&output=json[&from=...&to=...&limit=N&filter=...]
//     Returns a JSON list whose first row is column names.
//
// Memento URL form (used to fetch a specific snapshot):
//     https://web.archive.org/web/<timestamp>/<original_url>
//   `<timestamp>` is `YYYYMMDDhhmmss`. Append `id_` after the
//   timestamp (`/web/<ts>id_/<url>`) to get the original raw bytes
//   without Wayback's banner-injection rewriting — important for
//   archival work where we want the exact bytes the origin served.
//
// Etiquette: identify ourselves clearly, stay under a few QPS,
// don't parallelise heavily. The user-supplied UA in
// POLITENESS.userAgent (sites.mjs) is reused via ctx.userAgent.

import { rawFetch } from '../http.mjs';

const AVAIL_BASE = 'https://archive.org/wayback/available';
const CDX_BASE   = 'https://web.archive.org/cdx/search/cdx';

// Build a memento URL for a given (timestamp, originalUrl). The
// `id_` modifier returns the unmodified body — no Wayback toolbar
// rewrite. We always use it for archival fidelity.
export function mementoUrl(timestamp, originalUrl, { rawBytes = true } = {}) {
  const mod = rawBytes ? 'id_' : '';
  return `https://web.archive.org/web/${timestamp}${mod}/${originalUrl}`;
}

// Closest single capture. Returns:
//   { available: boolean, url, timestamp, status, mementoUrl }
// or null if no capture is known.
export async function closest(url, opts = {}, ctx = {}) {
  const params = new URLSearchParams({ url });
  if (opts.timestamp) params.set('timestamp', String(opts.timestamp));
  const r = await rawFetch(`${AVAIL_BASE}?${params}`, { method: 'GET' }, {
    ...ctx,
    accept: 'application/json',
    retries: ctx.retries ?? 1,
  });
  const snap = r.body?.archived_snapshots?.closest;
  if (!snap || !snap.available) return null;
  return {
    available: true,
    url: snap.url,
    timestamp: snap.timestamp,
    status: snap.status,
    mementoUrl: mementoUrl(snap.timestamp, opts.original || url),
  };
}

// CDX search. Returns the array-of-arrays from Wayback, transposed
// into objects keyed by column name for ergonomics.
//
// Common opts:
//   from / to     — YYYYMMDDhhmmss timestamps
//   limit         — max rows
//   filter        — array or single string, applied as repeated
//                   ?filter= params (CDX server semantics; e.g.
//                   ['statuscode:200', '!mimetype:warc/revisit']).
//   collapse      — array or single string ('urlkey:0', 'timestamp:8')
//   matchType     — 'exact' | 'prefix' | 'host' | 'domain'
export async function captures(url, opts = {}, ctx = {}) {
  const params = new URLSearchParams({ url, output: 'json' });
  if (opts.from)      params.set('from', String(opts.from));
  if (opts.to)        params.set('to',   String(opts.to));
  if (opts.limit)     params.set('limit', String(opts.limit));
  if (opts.matchType) params.set('matchType', String(opts.matchType));
  for (const f of asArray(opts.filter))   params.append('filter', f);
  for (const c of asArray(opts.collapse)) params.append('collapse', c);

  const r = await rawFetch(`${CDX_BASE}?${params}`, { method: 'GET' }, {
    ...ctx,
    accept: 'application/json',
    retries: ctx.retries ?? 1,
  });
  const rows = Array.isArray(r.body) ? r.body : [];
  if (rows.length === 0) return [];
  const cols = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
    return obj;
  });
}

// Convenience: pick the most recent successful (status 2xx) capture
// of `url`, falling back to any capture if none was 200. Returns
// the same shape as closest().
export async function bestCapture(url, opts = {}, ctx = {}) {
  // First try Availability: cheaper and fewer rate-limit hits.
  const c = await closest(url, opts, ctx);
  if (c && /^2/.test(c.status || '')) return c;

  // CDX with a 2xx filter for the most recent successful snapshot.
  const rows = await captures(url, {
    ...opts,
    limit: -1,                          // CDX honours negative limit = N most recent
    filter: ['statuscode:200', '!mimetype:warc/revisit'],
  }, ctx);
  const last = rows[rows.length - 1];
  if (!last) return c;                  // None found — return whatever closest() said
  return {
    available: true,
    url: last.original,
    timestamp: last.timestamp,
    status: last.statuscode,
    mementoUrl: mementoUrl(last.timestamp, last.original),
  };
}

// Fetch the raw archived bytes via the `id_` memento modifier. The
// returned object mirrors rawFetch's shape so the caller can drop
// it in alongside a live response.
//
// Failure modes: timestamp/url combo doesn't exist (404), Wayback
// rate-limited us (429/503), or memento-URL was redirected to a
// Wayback "calendar" page (we detect by content-type).
export async function fetchSnapshot(timestamp, originalUrl, ctx = {}) {
  const url = mementoUrl(timestamp, originalUrl);
  const r = await rawFetch(url, { method: 'GET' }, {
    ...ctx,
    accept: ctx.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    retries: ctx.retries ?? 1,
  });
  return r;
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}
