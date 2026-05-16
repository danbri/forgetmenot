// Lords Votes API.
// Base: https://lordsvotes-api.parliament.uk
//
// Notes per spec (_specs/lordsvotes.json):
// - Parameters are flat (no `queryParameters.` prefix).
// - Pagination params are lowercase `skip` / `take`.
// - `groupedbyparty` and `search` share the same query filter set;
//   neither takes a `divisionId` — for a single division use
//   `DivisionNumber`.
// - `search` does NOT take `MemberVotedAye`; that filter doesn't exist
//   in the Lords API.
import { get } from '../http.mjs';

const BASE = 'https://lordsvotes-api.parliament.uk';

export async function getById(divisionId, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/${encodeURIComponent(divisionId)}`, {}, ctx);
  return r.body;
}

function searchFilters(opts) {
  return {
    SearchTerm: opts.searchTerm ?? opts.term,
    MemberId: opts.memberId,
    IncludeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    StartDate: opts.startDate ?? opts.from,
    EndDate: opts.endDate ?? opts.to,
    DivisionNumber: opts.divisionNumber,
    'TotalVotesCast.Comparator': opts.totalVotesCastComparator,
    'TotalVotesCast.ValueToCompare': opts.totalVotesCastValue,
    'Majority.Comparator': opts.majorityComparator,
    'Majority.ValueToCompare': opts.majorityValue,
  };
}

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/search`, {
    ...searchFilters(opts),
    skip: opts.skip,
    take: opts.take ?? 25,
  }, ctx);
  return r.body;
}

export async function searchTotalResults(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/searchTotalResults`, searchFilters(opts), ctx);
  return r.body;
}

export async function groupedByParty(opts = {}, ctx = {}) {
  // Back-compat: callers used to pass a positional divisionId; treat
  // any non-object argument as { divisionNumber }.
  if (typeof opts !== 'object' || opts === null) {
    opts = { divisionNumber: opts };
  }
  const r = await get(`${BASE}/data/Divisions/groupedbyparty`, searchFilters({
    ...opts,
    divisionNumber: opts.divisionNumber ?? opts.divisionId,
  }), ctx);
  return r.body;
}

export async function memberVoting(memberId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/membervoting`, {
    MemberId: memberId,
    IncludeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    SearchTerm: opts.searchTerm ?? opts.term,
    StartDate: opts.startDate ?? opts.from,
    EndDate: opts.endDate ?? opts.to,
    DivisionNumber: opts.divisionNumber,
    skip: opts.skip,
    take: opts.take ?? 25,
  }, ctx);
  return r.body;
}
