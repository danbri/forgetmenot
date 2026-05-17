// Food Standards Agency — Food Hygiene Rating Scheme API.
// Base: https://api.ratings.food.gov.uk
//
// Tier-3 third-party. Operator: Food Standards Agency. OGL v3.0.
// No API key, but the API requires the header `x-api-version: 2`.
//
// Coverage: ~660,000 food businesses across England, Wales, NI
// (scored 0-5) and Scotland (PASS / IMPROVEMENT REQUIRED). Each
// business carries the council that inspected it, the inspection
// date, and a breakdown into hygiene + structural + management
// confidence scores.
import { get } from '../http.mjs';

const BASE = 'https://api.ratings.food.gov.uk';
const HEADERS = { 'x-api-version': '2' };

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// ---- Establishments (the actual ratings) ----
export async function establishments(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Establishments`, dropEmpty({
    name: opts.name,
    address: opts.address,
    longitude: opts.lon, latitude: opts.lat,
    maxDistanceLimit: opts.maxDistanceKm,
    businessTypeId: opts.businessTypeId,
    schemeTypeKey: opts.schemeTypeKey,      // 'FHRS' (E/W/NI) | 'FHIS' (Scotland)
    ratingKey: opts.ratingKey,              // 'fhrs_0_en' .. 'fhrs_5_en', 'fhis_pass_en', etc.
    ratingOperatorKey: opts.ratingOperatorKey,  // for range queries
    countryId: opts.countryId,
    localAuthorityId: opts.localAuthorityId,
    sortOptionKey: opts.sortOptionKey,       // 'distance', 'rating', 'establishmentname', ...
    pageNumber: opts.page ?? opts.pageNumber,
    pageSize: opts.take ?? opts.pageSize ?? 20,
  }), { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } });
  return r.body;
}

// One establishment by id.
export async function establishment(id, ctx = {}) {
  const r = await get(`${BASE}/Establishments/${encodeURIComponent(id)}`, {},
    { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } });
  return r.body;
}

// ---- Reference data ----

// Local authorities (the councils that perform inspections).
// 363 entries as of May 2026.
export async function authorities(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Authorities`, dropEmpty({
    name: opts.name, regionId: opts.regionId, countryId: opts.countryId,
    pageNumber: opts.page, pageSize: opts.take ?? 50,
  }), { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } });
  return r.body;
}

// One authority by id.
export async function authority(id, ctx = {}) {
  const r = await get(`${BASE}/Authorities/${encodeURIComponent(id)}`, {},
    { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } });
  return r.body;
}

// Reference vocabularies (small lookup tables).
export async function regions(ctx = {}) {
  const r = await get(`${BASE}/Regions`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
export async function countries(ctx = {}) {
  const r = await get(`${BASE}/Countries`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
export async function businessTypes(ctx = {}) {
  const r = await get(`${BASE}/BusinessTypes`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
export async function ratings(ctx = {}) {
  const r = await get(`${BASE}/Ratings`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
export async function ratingOperators(ctx = {}) {
  const r = await get(`${BASE}/RatingOperators`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
export async function schemeTypes(ctx = {}) {
  const r = await get(`${BASE}/SchemeTypes`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
export async function sortOptions(ctx = {}) {
  const r = await get(`${BASE}/SortOptions`, {}, { ...ctx, accept: 'application/json', headers: { ...HEADERS, ...(ctx.headers || {}) } }); return r.body;
}
