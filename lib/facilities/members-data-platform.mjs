// MNIS / Members Data Platform.
// Base: https://data.parliament.uk/membersdataplatform
// Filter URL convention: /<filter>/<expansions>/?format=json
// Filter is pipe-separated key=value (pipes URL-encoded as %7C).
import { get } from '../http.mjs';

const BASE = 'https://data.parliament.uk/membersdataplatform/services/mnis';

// Build a filter segment from {House: 'Commons', IsEligible: true}.
function buildFilter(filter = {}) {
  const parts = [];
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}=${v}`);
  }
  if (parts.length === 0) return '';
  // The path delimiter is | encoded as %7C.
  return parts.join('|');
}

function buildExpansions(expansions) {
  if (!expansions || expansions.length === 0) return '';
  if (Array.isArray(expansions)) return expansions.join('|');
  return String(expansions);
}

// Members query. Default response is XML — JSON only on supported routes.
export async function membersQuery(filter = {}, expansions = [], opts = {}, ctx = {}) {
  const f = buildFilter(filter);
  const e = buildExpansions(expansions);
  const path = e ? `${f}/${e}` : f;
  const r = await get(`${BASE}/members/query/${encodeURIComponent(path).replace(/%7C/g, '%7C')}/`, {
    format: opts.format ?? 'json',
  }, ctx);
  return r.body;
}

export async function memberById(memberId, expansion, ctx = {}) {
  const seg = expansion ? `${memberId}/${encodeURIComponent(expansion)}` : memberId;
  const r = await get(`${BASE}/members/${seg}/`, {}, ctx);
  return r.body;
}

export async function partiesActive(house, ctx = {}) {
  const r = await get(`${BASE}/parties/active/${encodeURIComponent(house)}/`, {}, { ...ctx, accept: 'application/xml, */*' });
  return r.body;
}

export async function partiesState(house, date, ctx = {}) {
  const r = await get(`${BASE}/parties/state/${encodeURIComponent(house)}/${encodeURIComponent(date)}/`, {}, { ...ctx, accept: 'application/xml, */*' });
  return r.body;
}

export async function membersByPostcode(postcode, ctx = {}) {
  const r = await get(`${BASE}/members/byPostcode/${encodeURIComponent(postcode)}/`, {}, { ...ctx, accept: 'application/xml, */*' });
  return r.body;
}

export async function referenceParties(ctx = {}) {
  const r = await get(`${BASE}/referenceData/parties/`, {}, { ...ctx, accept: 'application/xml, */*' });
  return r.body;
}

export async function referenceHouses(ctx = {}) {
  const r = await get(`${BASE}/referenceData/houses/`, {}, { ...ctx, accept: 'application/xml, */*' });
  return r.body;
}

export async function referencePolicyInterests(ctx = {}) {
  const r = await get(`${BASE}/referenceData/policyInterests/`, {}, { ...ctx, accept: 'application/xml, */*' });
  return r.body;
}
