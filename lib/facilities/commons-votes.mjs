// Commons Votes API.
// Base: https://commonsvotes-api.parliament.uk
// Quirk: search params nested under `queryParameters.<name>`.
import { get } from '../http.mjs';

const BASE = 'https://commonsvotes-api.parliament.uk';
const FMT = 'json';

const qp = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[`queryParameters.${k}`] = v;
  }
  return out;
};

export async function getById(divisionId, ctx = {}) {
  const r = await get(`${BASE}/data/division/${encodeURIComponent(divisionId)}.${FMT}`, {}, ctx);
  return r.body;
}

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/divisions.${FMT}/search`, qp({
    searchTerm: opts.searchTerm ?? opts.term,
    memberId: opts.memberId,
    includeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
    divisionNumber: opts.divisionNumber,
    skip: opts.skip,
    take: opts.take ?? 25,
  }), ctx);
  return r.body;
}

export async function searchTotalResults(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/divisions.${FMT}/searchTotalResults`, qp({
    searchTerm: opts.searchTerm ?? opts.term,
    memberId: opts.memberId,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
  }), ctx);
  return r.body;
}

// Note: the spec's "grouped by party" endpoint exposes the standard
// search filter set (searchTerm/memberId/startDate/endDate/divisionNumber)
// — it does NOT take a `divisionId`. To get the party breakdown for a
// specific division use `divisionNumber`.
export async function groupedByParty(opts = {}, ctx = {}) {
  // Back-compat: callers used to pass a positional divisionId; treat
  // any non-object argument as { divisionNumber }.
  if (typeof opts !== 'object' || opts === null) {
    opts = { divisionNumber: opts };
  }
  const r = await get(`${BASE}/data/divisions.${FMT}/groupedbyparty`, qp({
    searchTerm: opts.searchTerm ?? opts.term,
    memberId: opts.memberId,
    includeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
    divisionNumber: opts.divisionNumber ?? opts.divisionId,
  }), ctx);
  return r.body;
}

export async function memberVoting(memberId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/divisions.${FMT}/membervoting`, qp({
    memberId,
    searchTerm: opts.searchTerm ?? opts.term,
    includeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
    divisionNumber: opts.divisionNumber,
    skip: opts.skip,
    take: opts.take ?? 25,
  }), ctx);
  return r.body;
}
