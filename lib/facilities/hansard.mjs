// UK Parliament Hansard API (modern, 1988→).
// Base: https://hansard-api.parliament.uk
//
// Spec: _specs/hansard.json. Two parameter-shapes coexist:
//
// - `/overview/*` and `/debates/{...}` endpoints take FLAT query
//   params (`house`, `date`, `year`, `month`, `section`, `sittingDate`,
//   `sectionTitle`, `debateSectionExtId`, `contentItemExternalId`).
// - `/search.*`, `/search/...`, `/search/debatebycolumn.*`, and
//   `/timeline-stats.*` endpoints take parameters under a
//   `queryParameters.<name>` prefix.
//
// Earlier versions of this library wrapped every endpoint with the
// `qp()` prefix; the overview endpoints actually 404 when called that
// way (e.g. `/overview/calendar.json` returns "No HTTP resource was
// found that matches the request URI" for `queryParameters.house`).
import { get } from '../http.mjs';

const BASE = 'https://hansard-api.parliament.uk';
const FMT = 'json';

// Prefix-wrap helper for the search-shape endpoints.
const qp = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[`queryParameters.${k}`] = v;
  }
  return out;
};

// Drop undefined/null/empty keys — used for the flat-param endpoints.
const flat = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
};

// ---- Overview (flat params per spec) ----
export async function lastSittingDate(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/lastsittingdate.${FMT}`, flat({ house: opts.house }), ctx);
  return r.body;
}

export async function firstYear(ctx = {}) {
  const r = await get(`${BASE}/overview/firstyear.${FMT}`, {}, ctx);
  return r.body;
}

export async function calendar(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/calendar.${FMT}`, flat({
    house: opts.house, year: opts.year, month: opts.month,
  }), ctx);
  return r.body;
}

export async function linkedSittingDates(opts = {}, ctx = {}) {
  // Spec param is `date` (not `sittingDate`).
  const r = await get(`${BASE}/overview/linkedsittingdates.${FMT}`, flat({
    house: opts.house, date: opts.date ?? opts.sittingDate,
  }), ctx);
  return r.body;
}

export async function sectionsForDay(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/sectionsforday.${FMT}`, flat({
    house: opts.house, date: opts.date,
  }), ctx);
  return r.body;
}

export async function sectionTrees(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/sectiontrees.${FMT}`, flat({
    house: opts.house, date: opts.date, section: opts.section,
    groupByOwner: opts.groupByOwner,
  }), ctx);
  return r.body;
}

export async function pdfsForDay(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/overview/pdfsforday.${FMT}`, flat({
    house: opts.house, date: opts.date,
  }), ctx);
  return r.body;
}

export async function speakersListForDay(date, house, ctx = {}) {
  const r = await get(`${BASE}/overview/speakerslist/${encodeURIComponent(date)}/${encodeURIComponent(house)}.${FMT}`, {}, ctx);
  return r.body;
}

// ---- Debate detail (flat params per spec) ----
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

// Spec REQUIRES `debateSectionExtId` as a flat query param.
export async function memberContributions(memberId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/debates/memberdebatecontributions/${encodeURIComponent(memberId)}.${FMT}`, flat({
    debateSectionExtId: opts.debateSectionExtId,
  }), ctx);
  return r.body;
}

export async function topLevelDebateByTitle(opts = {}, ctx = {}) {
  // Spec params are flat: house, date, sectionTitle.
  const r = await get(`${BASE}/debates/topleveldebatebytitle.${FMT}`, flat({
    house: opts.house,
    date: opts.date ?? opts.sittingDate,
    sectionTitle: opts.sectionTitle ?? opts.title,
  }), ctx);
  return r.body;
}

// ---- Search (queryParameters.* prefix per spec) ----
function searchParams(opts) {
  return qp({
    searchTerm: opts.searchTerm ?? opts.term,
    house: opts.house,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
    date: opts.date,
    memberId: opts.memberId,
    memberIds: opts.memberIds,
    divisionId: opts.divisionId,
    hansardIdentifier: opts.hansardIdentifier,
    department: opts.department,
    debateType: opts.debateType,
    includeFormer: opts.includeFormer,
    includeCurrent: opts.includeCurrent,
    withDivision: opts.withDivision,
    seriesNumber: opts.seriesNumber,
    volumeNumber: opts.volumeNumber,
    columnNumber: opts.columnNumber,
    committeeTitle: opts.committeeTitle,
    committeeType: opts.committeeType,
    includeCommitteeDivisions: opts.includeCommitteeDivisions,
    section: opts.section,
    outputType: opts.outputType,
    debateSectionId: opts.debateSectionId,
    timelineGroupingSize: opts.timelineGroupingSize,
    orderBy: opts.orderBy,
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
  // Spec uses `queryParameters.volumeNumber` / `queryParameters.columnNumber`
  // — the older library names `volume`/`column` were silently dropped.
  const r = await get(`${BASE}/search/debatebycolumn.${FMT}`, qp({
    house: opts.house,
    volumeNumber: opts.volumeNumber ?? opts.volume,
    columnNumber: opts.columnNumber ?? opts.column,
  }), ctx);
  return r.body;
}

// Spec REQUIRES flat `contentItemExternalId` and `house`. The older
// `qp({ contributionExtId })` shape was wrong in both name and prefix.
export async function debateByExternalId(contentItemExternalId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/search/debatebyexternalid.${FMT}`, flat({
    contentItemExternalId,
    house: opts.house,
  }), ctx);
  return r.body;
}

// ---- Stats ----
// Spec mixes shapes: `contributionType` and `isDebatesSearch` are flat
// while every search filter is prefixed with `queryParameters.`.
export async function timelineStats(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/timeline-stats.${FMT}`, {
    ...flat({
      contributionType: opts.contributionType,
      isDebatesSearch: opts.isDebatesSearch,
    }),
    ...qp({
      house: opts.house,
      startDate: opts.startDate ?? opts.from,
      endDate: opts.endDate ?? opts.to,
      searchTerm: opts.searchTerm ?? opts.term,
      memberId: opts.memberId,
      timelineGroupingSize: opts.timelineGroupingSize,
    }),
  }, ctx);
  return r.body;
}
