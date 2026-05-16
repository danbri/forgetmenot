// Treaties API.
// Base: https://treaties-api.parliament.uk/api
//
// Spec: _specs/treaties.json. The `/api/Treaty` search endpoint
// accepts only the following filters per the OpenAPI document:
//   SearchText, GovernmentOrganisationId, Series, ParliamentaryProcess,
//   DebateScheduled, MotionsTabledAboutATreaty, CommitteeRaisedConcerns,
//   House, Skip, Take.
// Earlier versions of this library sent `Country`, `TreatyTypeId`,
// `SubjectId`, `LayingBodyId`, `LaidDateFrom`, `LaidDateTo`,
// `ScrutinyPeriodEndsFrom`, `ScrutinyPeriodEndsTo`, `Status`, and
// `SortOrder` — none of which are in the spec; the API silently
// dropped them, so all date-range and laying-body filters were
// no-ops and returned the full unfiltered set.
//
// There is NO server-side date filter. To slice by laying date,
// filter client-side on `layingDate` / `endOfScrutinyPeriod` in the
// response.
import { get } from '../http.mjs';
import { collectFiltered, dateBetween, olderThanCutoff, andPredicates } from '../client-filter.mjs';

const BASE = 'https://treaties-api.parliament.uk/api';

// Server-only call. Use this when you know the API supports the
// filter you need (the keys listed in the comment at the top of this
// file). For client-side date / department filters use `search()`.
async function rawSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Treaty`, {
    SearchText: opts.searchText ?? opts.term,
    GovernmentOrganisationId: opts.governmentOrganisationId ?? opts.orgId,
    Series: opts.series,
    ParliamentaryProcess: opts.parliamentaryProcess,
    DebateScheduled: opts.debateScheduled,
    MotionsTabledAboutATreaty: opts.motionsTabledAboutATreaty,
    CommitteeRaisedConcerns: opts.committeeRaisedConcerns,
    House: opts.house,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

// Public search. Passes through server-side filters AND applies
// client-side ones for parameters the API doesn't expose:
//   laidDateFrom / laidDateTo    — filter on `laidDate` (or
//                                  commonsLayingDate / lordsLayingDate)
//   signedDateFrom / signedDateTo — filter on `signedDate`
//   layingBodyId                 — filter on layingBodyDepartment.id
//   leadDepartmentId             — filter on leadDepartment.id
// When any of those are set, the function auto-pages through the
// API (sorted most-recent-first), short-circuiting once results fall
// below `laidDateFrom`. The return shape matches the raw endpoint
// (`{ items, totalResults }`) with extra `_unfilteredTotal`,
// `_fetched` and `_exhausted` metadata.
export async function search(opts = {}, ctx = {}) {
  const needsClient = (
    opts.laidDateFrom || opts.laidDateTo ||
    opts.signedDateFrom || opts.signedDateTo ||
    opts.layingBodyId || opts.leadDepartmentId
  );
  if (!needsClient) return rawSearch(opts, ctx);

  const datePred = andPredicates(
    (opts.laidDateFrom || opts.laidDateTo)
      ? dateBetween('laidDate', opts.laidDateFrom, opts.laidDateTo)
      : null,
    (opts.signedDateFrom || opts.signedDateTo)
      ? dateBetween('signedDate', opts.signedDateFrom, opts.signedDateTo)
      : null,
    opts.layingBodyId
      ? (item) => item?.layingBodyDepartment?.id === Number(opts.layingBodyId)
        || item?.layingBodyDepartment?.id === opts.layingBodyId
      : null,
    opts.leadDepartmentId
      ? (item) => item?.leadDepartment?.id === Number(opts.leadDepartmentId)
        || item?.leadDepartment?.id === opts.leadDepartmentId
      : null,
  );

  return collectFiltered({
    fetchPage: ({ skip, take }) =>
      rawSearch({ ...opts, laidDateFrom: undefined, laidDateTo: undefined,
                  signedDateFrom: undefined, signedDateTo: undefined,
                  layingBodyId: undefined, leadDepartmentId: undefined,
                  skip, take }, ctx),
    predicate: datePred,
    stopWhen: olderThanCutoff('laidDate', opts.laidDateFrom),
    take: opts.take ?? 20,
    pageSize: opts.pageSize ?? 200,
    maxFetch: opts.maxFetch ?? 2000,
    skip: opts.skip ?? 0,
  });
}

export async function getById(id, ctx = {}) {
  const r = await get(`${BASE}/Treaty/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function timeline(id, ctx = {}) {
  const r = await get(`${BASE}/Treaty/${encodeURIComponent(id)}/BusinessItems`, {}, ctx);
  return r.body;
}

export async function businessItem(id, ctx = {}) {
  const r = await get(`${BASE}/BusinessItem/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function governmentOrganisations(ctx = {}) {
  const r = await get(`${BASE}/GovernmentOrganisation`, {}, ctx);
  return r.body;
}

export async function seriesMembership(ctx = {}) {
  const r = await get(`${BASE}/SeriesMembership`, {}, ctx);
  return r.body;
}
