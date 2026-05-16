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

const BASE = 'https://treaties-api.parliament.uk/api';

export async function search(opts = {}, ctx = {}) {
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
