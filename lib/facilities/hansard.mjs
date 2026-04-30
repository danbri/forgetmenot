// UK Parliament Hansard API (modern, 1988→).
// Base: https://hansard-api.parliament.uk
// Endpoints take a .{format} suffix; we always use .json. Search
// parameters live under a `queryParameters.` prefix.
import { get } from '../http.mjs';

const BASE = 'https://hansard-api.parliament.uk';
const FMT = 'json';

const qp = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[`queryParameters.${k}`] = v;
  }
  return out;
};

// ---- Overview ----
export async function lastSittingDate(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/lastsittingdate.${FMT}`, { house: opts.house }, ctx);
  return r.body;
}

export async function firstYear(ctx = {}) {
  const r = await get(`${BASE}/overview/firstyear.${FMT}`, {}, ctx);
  return r.body;
}

export async function calendar(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/calendar.${FMT}`, qp({
    house: opts.house, year: opts.year, month: opts.month,
  }), ctx);
  return r.body;
}

export async function linkedSittingDates(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/linkedsittingdates.${FMT}`, qp({
    house: opts.house, sittingDate: opts.sittingDate ?? opts.date,
  }), ctx);
  return r.body;
}

export async function sectionsForDay(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/sectionsforday.${FMT}`, qp({
    house: opts.house, date: opts.date,
  }), ctx);
  return r.body;
}

export async function sectionTrees(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/sectiontrees.${FMT}`, qp({
    house: opts.house, date: opts.date, section: opts.section,
  }), ctx);
  return r.body;
}

export async function pdfsForDay(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/pdfsforday.${FMT}`, qp({
    house: opts.house, date: opts.date,
  }), ctx);
  return r.body;
}

export async function speakersListForDay(date, house, ctx = {}) {
  const r = await get(`${BASE}/overview/speakerslist/${encodeURIComponent(date)}/${encodeURIComponent(house)}.${FMT}`, {}, ctx);
  return r.body;
}

// ---- Debate detail ----
export async function debate(debateSectionExtId, ctx = {}) {
  const r = await get(`${BASE}/debates/debate/${encodeURIComponent(debateSectionExtId)}.${FMT}`, {}, ctx);
  return r.body;
}

export async function division(divisionExtId, ctx = {}) {
  const r = await get(`${BASE}/debates/division/${encodeURIComponent(divisionExtId)}.${FMT}`, {}, ctx);
  return r.body;
}

export async function divisionsIn(debateSectionExtId, ctx = {}) {
  const r = await get(`${BASE}/debates/divisions/${encodeURIComponent(debateSectionExtId)}.${FMT}`, {}, ctx);
  return r.body;
}

export async function speakersIn(debateSectionExtId, ctx = {}) {
  const r = await get(`${BASE}/debates/speakerslist/${encodeURIComponent(debateSectionExtId)}.${FMT}`, {}, ctx);
  return r.body;
}

export async function memberContributions(memberId, ctx = {}) {
  const r = await get(`${BASE}/debates/memberdebatecontributions/${encodeURIComponent(memberId)}.${FMT}`, {}, ctx);
  return r.body;
}

export async function topLevelDebateByTitle(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/debates/topleveldebatebytitle.${FMT}`, qp({
    house: opts.house, sittingDate: opts.sittingDate ?? opts.date, sectionTitle: opts.sectionTitle ?? opts.title,
  }), ctx);
  return r.body;
}

// ---- Search ----
function searchParams(opts) {
  return qp({
    searchTerm: opts.searchTerm ?? opts.term,
    house: opts.house,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
    partyId: opts.partyId,
    memberId: opts.memberId,
    take: opts.take ?? 20,
    skip: opts.skip,
  });
}

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchDebates(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/debates.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchDivisions(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/divisions.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchPetitions(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/petitions.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchMembers(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/members.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchCommittees(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/committees.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchCommitteeDebates(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/committeedebates.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function searchContributions(contributionType, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/contributions/${encodeURIComponent(contributionType)}.${FMT}`, {
    ...searchParams(opts),
    'queryParameters.outputType': opts.outputType ?? 'List',
  }, ctx);
  return r.body;
}

export async function memberContributionSummary(memberId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/membercontributionsummary/${encodeURIComponent(memberId)}.${FMT}`, searchParams(opts), ctx);
  return r.body;
}

export async function debateByColumn(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/debatebycolumn.${FMT}`, qp({
    house: opts.house, volume: opts.volume, column: opts.column,
  }), ctx);
  return r.body;
}

export async function debateByExternalId(contributionExtId, ctx = {}) {
  const r = await get(`${BASE}/search/debatebyexternalid.${FMT}`, qp({
    contributionExtId,
  }), ctx);
  return r.body;
}

// ---- Stats ----
export async function timelineStats(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/timeline-stats.${FMT}`, qp({
    contributionType: opts.contributionType,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
  }), ctx);
  return r.body;
}
