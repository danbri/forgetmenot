// Treaties API.
// Base: https://treaties-api.parliament.uk/api
import { get } from '../http.mjs';

const BASE = 'https://treaties-api.parliament.uk/api';

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Treaty`, {
    SearchText: opts.searchText ?? opts.term,
    Country: opts.country,
    TreatyTypeId: opts.treatyTypeId,
    SubjectId: opts.subjectId,
    LayingBodyId: opts.layingBodyId,
    LaidDateFrom: opts.laidDateFrom,
    LaidDateTo: opts.laidDateTo,
    ScrutinyPeriodEndsFrom: opts.scrutinyPeriodEndsFrom,
    ScrutinyPeriodEndsTo: opts.scrutinyPeriodEndsTo,
    Status: opts.status,
    Skip: opts.skip,
    Take: opts.take ?? 20,
    SortOrder: opts.sortOrder,
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
