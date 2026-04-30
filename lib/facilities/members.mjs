// UK Parliament Members API.
// Base: https://members-api.parliament.uk/api
// Spec: https://members-api.parliament.uk/swagger/v1/swagger.json

import { get, getBytes } from '../http.mjs';

const BASE = 'https://members-api.parliament.uk/api';

// Search current Members. House: 1=Commons, 2=Lords. Take ≤ 20.
export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/Search`, {
    Name: opts.name,
    Location: opts.location,
    PostCode: opts.postcode,
    PartyId: opts.partyId,
    House: houseId(opts.house),
    MembershipStartedSince: opts.membershipStartedSince,
    IsEligible: opts.isEligible,
    IsCurrentMember: opts.isCurrentMember,
    PolicyInterestId: opts.policyInterestId,
    NameStartsWith: opts.nameStartsWith,
    skip: opts.skip,
    take: opts.take ?? 20,
    ...opts.query,
  }, ctx);
  return r.body;
}

export async function searchHistorical(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/SearchHistorical`, {
    name: opts.name,
    skip: opts.skip,
    take: opts.take ?? 20,
    ...opts.query,
  }, ctx);
  return r.body;
}

export async function getById(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function biography(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Biography`, {}, ctx);
  return r.body;
}

export async function contact(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Contact`, {}, ctx);
  return r.body;
}

export async function synopsis(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Synopsis`, {}, ctx);
  return r.body;
}

export async function focus(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Focus`, {}, ctx);
  return r.body;
}

export async function experience(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Experience`, {}, ctx);
  return r.body;
}

export async function staff(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Staff`, {}, ctx);
  return r.body;
}

export async function voting(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Voting`, {
    house: houseId(opts.house),
    page: opts.page,
  }, ctx);
  return r.body;
}

export async function writtenQuestions(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/WrittenQuestions`, {
    page: opts.page,
  }, ctx);
  return r.body;
}

export async function edms(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/Edms`, {
    page: opts.page,
  }, ctx);
  return r.body;
}

export async function contributionSummary(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/ContributionSummary`, {}, ctx);
  return r.body;
}

export async function registeredInterests(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/RegisteredInterests`, {}, ctx);
  return r.body;
}

export async function latestElectionResult(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/LatestElectionResult`, {}, ctx);
  return r.body;
}

export async function portraitUrl(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/PortraitUrl`, {}, ctx);
  return r.body;
}

export async function portrait(id, ctx = {}) {
  return getBytes(`${BASE}/Members/${encodeURIComponent(id)}/Portrait`, {}, ctx);
}

export async function thumbnailUrl(id, ctx = {}) {
  const r = await get(`${BASE}/Members/${encodeURIComponent(id)}/ThumbnailUrl`, {}, ctx);
  return r.body;
}

export async function thumbnail(id, ctx = {}) {
  return getBytes(`${BASE}/Members/${encodeURIComponent(id)}/Thumbnail`, {}, ctx);
}

// ---- Constituencies (under /api/Location/Constituency) ----

export async function constituencySearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Location/Constituency/Search`, {
    searchText: opts.searchText,
    skip: opts.skip,
    take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function constituency(id, ctx = {}) {
  const r = await get(`${BASE}/Location/Constituency/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function constituencyGeometry(id, ctx = {}) {
  const r = await get(`${BASE}/Location/Constituency/${encodeURIComponent(id)}/Geometry`, {}, ctx);
  return r.body;
}

export async function constituencyElectionResults(id, ctx = {}) {
  const r = await get(`${BASE}/Location/Constituency/${encodeURIComponent(id)}/ElectionResults`, {}, ctx);
  return r.body;
}

// ---- Parties ----

export async function partiesActive(house, ctx = {}) {
  const r = await get(`${BASE}/Parties/GetActive/${encodeURIComponent(house)}`, {}, ctx);
  return r.body;
}

export async function partiesState(house, forDate, ctx = {}) {
  const r = await get(`${BASE}/Parties/StateOfTheParties/${encodeURIComponent(house)}/${encodeURIComponent(forDate)}`, {}, ctx);
  return r.body;
}

export async function lordsByType(forDate, ctx = {}) {
  const r = await get(`${BASE}/Parties/LordsByType/${encodeURIComponent(forDate)}`, {}, ctx);
  return r.body;
}

// ---- Posts ----

export async function governmentPosts(ctx = {}) {
  const r = await get(`${BASE}/Posts/GovernmentPosts`, {}, ctx);
  return r.body;
}

export async function oppositionPosts(ctx = {}) {
  const r = await get(`${BASE}/Posts/OppositionPosts`, {}, ctx);
  return r.body;
}

export async function speakerAndDeputies(forDate, ctx = {}) {
  const r = await get(`${BASE}/Posts/SpeakerAndDeputies/${encodeURIComponent(forDate)}`, {}, ctx);
  return r.body;
}

export async function spokespersons(ctx = {}) {
  const r = await get(`${BASE}/Posts/Spokespersons`, {}, ctx);
  return r.body;
}

// ---- Reference data ----

export async function referenceDepartments(ctx = {}) {
  const r = await get(`${BASE}/Reference/Departments`, {}, ctx);
  return r.body;
}

export async function referenceAnsweringBodies(ctx = {}) {
  const r = await get(`${BASE}/Reference/AnsweringBodies`, {}, ctx);
  return r.body;
}

export async function referencePolicyInterests(ctx = {}) {
  const r = await get(`${BASE}/Reference/PolicyInterests`, {}, ctx);
  return r.body;
}

// House string ↔ enum int. The API's two House params are inconsistent;
// some accept the integer enum, some accept the string.
function houseId(h) {
  if (h === undefined || h === null || h === '') return undefined;
  const s = String(h).toLowerCase();
  if (s === '1' || s === 'commons') return 1;
  if (s === '2' || s === 'lords') return 2;
  return h;
}
