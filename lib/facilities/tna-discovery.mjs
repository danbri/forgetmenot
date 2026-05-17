// TNA Discovery — The National Archives' catalogue covering its own
// holdings plus partner archives across the UK (~37M descriptions).
// Base: https://discovery.nationalarchives.gov.uk/API
//
// Tier-3 third-party. Operator: The National Archives. OGL v3.0.
// No auth.
//
// Two parallel endpoint surfaces exist:
//   /API/search/records?sps.searchQuery=…&sps.resultsPageSize=…   (older sps. style)
//   /API/search/v1/records?searchQuery=…&resultsPageSize=…        (v1, cleaner)
// This library uses the v1 form by default; pass `style: 'sps'` to
// fall back to the older shape.
import { get } from '../http.mjs';

const BASE = 'https://discovery.nationalarchives.gov.uk/API';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// Build a params object using the right key style for the endpoint.
function paramsFor(opts) {
  const isV1 = opts.style !== 'sps';
  const prefix = isV1 ? '' : 'sps.';
  const p = (k) => `${prefix}${k}`;
  return dropEmpty({
    [p('searchQuery')]: opts.query ?? opts.searchQuery,
    [p('resultsPageSize')]: opts.take ?? opts.resultsPageSize,
    [p('batchStartMark')]: opts.batchStartMark,        // cursor pagination
    [p('recordCollections')]: opts.recordCollections,  // e.g. "Records"
    [p('recordSeries')]: opts.recordSeries,            // e.g. "FO 94"
    [p('heldByCode')]: opts.heldByCode,                // 'TNA' | 'OTH'
    [p('referenceFirstCharacter')]: opts.referenceFirstCharacter,
    [p('titleFirstCharacter')]: opts.titleFirstCharacter,
    [p('dateFrom')]: opts.dateFrom,
    [p('dateTo')]: opts.dateTo,
    [p('catalogueLevels')]: opts.catalogueLevels,
    [p('closureStatuses')]: opts.closureStatuses,
    [p('sortBy')]: opts.sortBy,
  });
}

// ---- Records ----

// Search records. Returns the v1 envelope with `records[]` plus
// aggregations: `taxonomySubjects`, `timePeriods`, `departments`,
// `catalogueLevels`, `closureStatuses`, `sources`, `repositories`,
// `heldByReps`, `referenceFirstLetters`, `titleFirstLetters`, `count`,
// `nextBatchMark`.
export async function searchRecords(opts = {}, ctx = {}) {
  const path = opts.style === 'sps'
    ? `${BASE}/search/records`
    : `${BASE}/search/v1/records`;
  const r = await get(path, paramsFor(opts), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One record's full metadata by Discovery id (Cxxxxxxx or Dxxxxxxx).
export async function record(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/records/v1/details/${encodeURIComponent(id)}`,
    dropEmpty({ includeChildren: opts.includeChildren }),
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// Children of a record (series → pieces, etc.). The `record()` call
// with `includeChildren: true` returns them inline; this is a
// convenience that returns the children array directly.
export async function children(id, ctx = {}) {
  const body = await record(id, { includeChildren: true }, ctx);
  return Array.isArray(body?.children) ? body.children : [];
}

// ---- Repositories (archives that hold records) ----

// Search the repository directory.
export async function searchRepositories(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/v1/repositories`, dropEmpty({
    searchQuery: opts.query ?? opts.searchQuery,
    resultsPageSize: opts.take ?? opts.resultsPageSize,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One repository's details by Archon code (e.g. A13530000 for TNA itself).
export async function repository(archonCode, ctx = {}) {
  const r = await get(`${BASE}/repositories/v1/details/${encodeURIComponent(archonCode)}`,
    {}, { ...ctx, accept: 'application/json' });
  return r.body;
}

// ---- Helpers ----

// Search confined to a particular record series, e.g. FO 94 (Foreign
// Office Ratifications of Treaties). Headline use-case: Parliament-
// adjacent archival research.
export async function inSeries(series, opts = {}, ctx = {}) {
  return searchRecords({ ...opts, recordSeries: series }, ctx);
}

// Stable URL of a single record on the Discovery website (browser-
// friendly, useful for citations).
export function recordUrl(id) {
  return `https://discovery.nationalarchives.gov.uk/details/r/${encodeURIComponent(id)}`;
}
