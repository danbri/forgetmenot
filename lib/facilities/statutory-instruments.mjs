// Statutory Instruments API.
// Base: https://statutoryinstruments-api.parliament.uk/api/v2
//
// Spec: _specs/si.json (OpenAPI v3). Parameter names below match the
// spec; the API itself is case-insensitive on query keys.
//
// NOTE: the underlying API does NOT support date-range filtering. To
// slice by laid/made/coming-into-force date, fetch by other criteria
// (e.g. procedure, layingBody) and filter client-side on the response
// fields `commonsLayingDate`, `lordsLayingDate`, `paperMadeDate`.
import { get } from '../http.mjs';
import { collectFiltered, dateBetween, olderThanCutoff, andPredicates } from '../client-filter.mjs';

const BASE = 'https://statutoryinstruments-api.parliament.uk/api/v2';

async function rawSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument`, {
    Name: opts.name ?? opts.searchTerm ?? opts.term,
    Procedure: opts.procedure ?? opts.procedureId,
    ScheduledDebate: opts.scheduledDebate,
    MotionToStop: opts.motionToStop,
    ConcernsRaisedByCommittee: opts.concernsRaisedByCommittee,
    ParliamentaryProcessConcluded: opts.parliamentaryProcessConcluded,
    DepartmentId: opts.departmentId,
    LayingBodyId: opts.layingBodyId,
    RecommendedForProcedureChange: opts.recommendedForProcedureChange,
    ActOfParliamentId: opts.actOfParliamentId ?? opts.actId,
    House: opts.house,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

// Public search. Passes through server-side filters AND applies
// client-side date filters that the API does not support:
//   laidDateFrom / laidDateTo  — filter on commonsLayingDate
//                                 (falls back to lordsLayingDate)
//   madeDateFrom / madeDateTo  — filter on paperMadeDate
// Default sort is most-recent-first, so the helper short-circuits
// once items fall below `laidDateFrom`. Return shape is
// `{ items, totalResults }` with extra `_unfilteredTotal`, `_fetched`,
// `_exhausted` metadata.
export async function search(opts = {}, ctx = {}) {
  const needsClient = (
    opts.laidDateFrom || opts.laidDateTo ||
    opts.madeDateFrom || opts.madeDateTo
  );
  if (!needsClient) return rawSearch(opts, ctx);

  const datePred = andPredicates(
    (opts.laidDateFrom || opts.laidDateTo)
      ? (item) => {
          const d = (item?.commonsLayingDate || item?.lordsLayingDate || '').slice(0, 10);
          if (!d) return false;
          if (opts.laidDateFrom && d < opts.laidDateFrom) return false;
          if (opts.laidDateTo && d > opts.laidDateTo) return false;
          return true;
        }
      : null,
    (opts.madeDateFrom || opts.madeDateTo)
      ? dateBetween('paperMadeDate', opts.madeDateFrom, opts.madeDateTo)
      : null,
  );

  // Short-circuit once we cross below the earliest cutoff. Records
  // default-sort by paperMadeDate desc, so use that field when only
  // madeDateFrom is set, otherwise commonsLayingDate.
  const stopField = opts.laidDateFrom ? 'commonsLayingDate' : 'paperMadeDate';
  const stopCutoff = opts.laidDateFrom || opts.madeDateFrom;

  return collectFiltered({
    fetchPage: ({ skip, take }) =>
      rawSearch({ ...opts,
                  laidDateFrom: undefined, laidDateTo: undefined,
                  madeDateFrom: undefined, madeDateTo: undefined,
                  skip, take }, ctx),
    predicate: datePred,
    stopWhen: olderThanCutoff(stopField, stopCutoff),
    take: opts.take ?? 20,
    pageSize: opts.pageSize ?? 200,
    maxFetch: opts.maxFetch ?? 2000,
    skip: opts.skip ?? 0,
  });
}

export async function getById(instrumentId, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument/${encodeURIComponent(instrumentId)}`, {}, ctx);
  return r.body;
}

export async function timeline(instrumentId, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument/${encodeURIComponent(instrumentId)}/BusinessItems`, {}, ctx);
  return r.body;
}

export async function timelineById(timelineId, ctx = {}) {
  const r = await get(`${BASE}/Timeline/${encodeURIComponent(timelineId)}/BusinessItems`, {}, ctx);
  return r.body;
}

// ---- Acts of Parliament ----
// Spec only exposes Id (array) and Name. `chapter`, `year`, `searchTerm`
// are NOT supported — the API silently ignores them.
export async function actsSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/ActOfParliament`, {
    Id: opts.id,
    Name: opts.name ?? opts.searchTerm ?? opts.term,
  }, ctx);
  return r.body;
}

export async function act(id, ctx = {}) {
  const r = await get(`${BASE}/ActOfParliament/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

// ---- Reference (no query parameters per spec) ----
export async function layingBodies(ctx = {}) {
  const r = await get(`${BASE}/LayingBody`, {}, ctx);
  return r.body;
}

export async function procedures(ctx = {}) {
  const r = await get(`${BASE}/Procedure`, {}, ctx);
  return r.body;
}

export async function procedure(id, ctx = {}) {
  const r = await get(`${BASE}/Procedure/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}
