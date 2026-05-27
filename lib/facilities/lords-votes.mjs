// Lords Votes API.
// Base: https://lordsvotes-api.parliament.uk
// Note: parameters are flat (no `queryParameters.` prefix).
import { get } from '../http.mjs';

const BASE = 'https://lordsvotes-api.parliament.uk';

export async function getById(divisionId, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/${encodeURIComponent(divisionId)}`, {}, ctx);
  return r.body;
}

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/search`, {
    SearchTerm: opts.searchTerm ?? opts.term,
    MemberId: opts.memberId,
    IncludeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    StartDate: opts.startDate ?? opts.from,
    EndDate: opts.endDate ?? opts.to,
    DivisionNumber: opts.divisionNumber,
    MemberVotedAye: opts.memberVotedAye,
    skip: opts.skip,
    take: opts.take ?? 25,
  }, ctx);
  return r.body;
}

export async function searchTotalResults(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/searchTotalResults`, {
    SearchTerm: opts.searchTerm ?? opts.term,
    MemberId: opts.memberId,
    StartDate: opts.startDate ?? opts.from,
    EndDate: opts.endDate ?? opts.to,
  }, ctx);
  return r.body;
}

export async function groupedByParty(divisionId, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/groupedbyparty`, { divisionId }, ctx);
  return r.body;
}

export async function memberVoting(memberId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/Divisions/membervoting`, {
    MemberId: memberId,
    IncludeWhenMemberWasTeller: opts.includeWhenMemberWasTeller,
    skip: opts.skip,
    take: opts.take ?? 25,
  }, ctx);
  return r.body;
}
