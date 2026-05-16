// UK Parliament Members API.
// Base: https://members-api.parliament.uk/api
// Spec: https://members-api.parliament.uk/swagger/v1/swagger.json

import { get, getBytes } from '../http.mjs';

const BASE = 'https://members-api.parliament.uk/api';

// Search current Members. House: 1=Commons, 2=Lords. Take ≤ 20.
//
// The spec has no `PostCode` field — postcodes are looked up via
// `Location` (free-text constituency / postcode / placename). The old
// `postcode` option therefore funneled into the wrong key and was
// silently dropped; map it onto `Location` instead.
export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/Search`, {
    Name: opts.name,
    Location: opts.location ?? opts.postcode,
    PostTitle: opts.postTitle,
    PartyId: opts.partyId,
    House: houseId(opts.house),
    ConstituencyId: opts.constituencyId,
    NameStartsWith: opts.nameStartsWith,
    Gender: opts.gender,
    MembershipStartedSince: opts.membershipStartedSince,
    'MembershipEnded.MembershipEndedSince': opts.membershipEndedSince,
    'MembershipEnded.MembershipEndReasonIds': opts.membershipEndReasonIds,
    'MembershipInDateRange.WasMemberOnOrAfter': opts.wasMemberOnOrAfter,
    'MembershipInDateRange.WasMemberOnOrBefore': opts.wasMemberOnOrBefore,
    'MembershipInDateRange.WasMemberOfHouse': houseId(opts.wasMemberOfHouse),
    IsEligible: opts.isEligible,
    IsCurrentMember: opts.isCurrentMember,
    PolicyInterestId: opts.policyInterestId,
    Experience: opts.experience,
    skip: opts.skip,
    take: opts.take ?? 20,
    ...opts.query,
  }, ctx);
  return r.body;
}

export async function searchHistorical(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Members/SearchHistorical`, {
    name: opts.name,
    dateToSearchFor: opts.dateToSearchFor,
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

// ---- Bulk helpers (URL crawl) ----

// Slim summary projected from a Search hit. The Search response
// nests the member under .value; we flatten the bits we care about.
export function summariseHit(hit) {
  const v = hit?.value || hit;
  const party = v.latestParty || {};
  const m = v.latestHouseMembership || {};
  return {
    id: v.id,
    name: v.nameDisplayAs || v.nameListAs,
    nameListAs: v.nameListAs,
    party: party.name || null,
    partyAbbr: party.abbreviation || null,
    partyId: party.id ?? null,
    house: m.house === 1 ? 'Commons' : m.house === 2 ? 'Lords' : null,
    constituency: m.membershipFrom || null,
    constituencyId: m.membershipFromId ?? null,
    membershipStart: m.membershipStartDate || null,
    membershipEnd: m.membershipEndDate || null,
    gender: v.gender || null,
    thumbnailUrl: v.thumbnailUrl || null,
  };
}

// Async generator over every Search hit matching opts. Pages through
// the API in chunks of `pageSize` (max 20 per the spec).
export async function* iterMembers(opts = {}, ctx = {}) {
  const pageSize = Math.min(Number(opts.pageSize) || 20, 20);
  let skip = Number(opts.skip) || 0;
  const max = opts.max ? Number(opts.max) : Infinity;
  let yielded = 0;

  while (yielded < max) {
    const page = await search({ ...opts, skip, take: pageSize }, ctx);
    const items = page?.items || [];
    if (items.length === 0) break;
    for (const hit of items) {
      if (yielded >= max) break;
      yield hit;
      yielded++;
    }
    skip += items.length;
    if (typeof page.totalResults === 'number' && skip >= page.totalResults) break;
  }
}

// Fetch /Members/{id}/Contact and reshape into URL-centric buckets.
// Web contact entries have isWebAddress=true and the URL in line1;
// office entries pack postal address fields. Returns:
//   { social[], websites[], emails[], phones[], offices[], raw }
export async function urlsFor(id, opts = {}, ctx = {}) {
  const r = await contact(id, ctx);
  const items = Array.isArray(r?.value) ? r.value : [];
  const social = [];
  const websites = [];
  const emails = new Set();
  const phones = new Set();
  const offices = [];

  for (const c of items) {
    const url = (c.line1 || '').trim();
    if (c.isWebAddress) {
      const isWebsite = /website/i.test(c.type || '');
      const entry = { type: c.type, url };
      if (isWebsite) websites.push(entry);
      else social.push(entry);
    } else {
      offices.push({
        type: c.type,
        line1: c.line1 || null,
        line2: c.line2 || null,
        line3: c.line3 || null,
        line4: c.line4 || null,
        line5: c.line5 || null,
        postcode: c.postcode || null,
        phone: c.phone || null,
        fax: c.fax || null,
        email: c.email || null,
        notes: c.notes || null,
      });
    }
    if (c.email) emails.add(c.email);
    if (c.phone) phones.add(c.phone);
  }

  return {
    id: Number(id),
    social,
    websites,
    emails: [...emails],
    phones: [...phones],
    offices,
    raw: opts.includeRaw ? items : undefined,
  };
}

// Convenience: fetch slim summary + URL bundle for one member, merged.
export async function summaryWithUrls(idOrHit, opts = {}, ctx = {}) {
  const summary = typeof idOrHit === 'object'
    ? summariseHit(idOrHit)
    : await getById(idOrHit, ctx).then((m) => summariseHit(m));
  const urls = await urlsFor(summary.id, opts, ctx);
  // urls.id wins so we don't double-store it.
  return { ...summary, ...urls };
}
