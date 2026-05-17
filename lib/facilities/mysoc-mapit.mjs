// MapIt — mySociety's UK postcode / area service.
// Base: https://mapit.mysociety.org
//
// Tier-3 third-party (operator: mySociety). Joins to Parliament data
// via constituency GSS codes (WMC type) → members-api constituency
// records.
//
// Polite-use note: mySociety operates a public free tier with rate
// limits. For production / volume use, mySociety asks operators to
// register for an API key and pass it as `?api_key=...`. The library
// accepts `apiKey` in opts (or via `ctx.apiKey`) and never logs it.
import { get } from '../http.mjs';

const BASE = 'https://mapit.mysociety.org';

function keyParam(opts, ctx) {
  return opts.apiKey ?? ctx.apiKey ?? undefined;
}

// ---- Postcode lookups ----
// Returns the postcode's lat/lon plus every administrative area it
// sits inside (constituency, council, ward, parish, GLA …).
export async function postcode(pc, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/postcode/${encodeURIComponent(pc)}`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}

// Partial-postcode lookup (e.g. "SW1P"). Returns the same shape as
// /postcode but coordinates are the centroid of the partial.
export async function partialPostcode(partial, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/postcode/partial/${encodeURIComponent(partial)}`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}

// Postcode autocomplete / search (text → list of matching postcodes).
export async function postcodeSearch(q, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/postcode/postcode_search/${encodeURIComponent(q)}`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}

// ---- Point lookup (lat/lon → areas) ----
// `srid` is usually 4326 (WGS84 lat/lon) or 27700 (OSGB easting/northing).
export async function point(srid, x, y, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/point/${encodeURIComponent(srid)}/${encodeURIComponent(x)},${encodeURIComponent(y)}`, {
    api_key: keyParam(opts, ctx),
    type: opts.type,
  }, ctx);
  return r.body;
}

// ---- Areas ----
// One area by its MapIt id.
export async function area(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/area/${encodeURIComponent(id)}`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}

// Area geometry — boundary polygon as GeoJSON-ish.
export async function geometry(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/area/${encodeURIComponent(id)}/geometry`, {
    api_key: keyParam(opts, ctx),
    simplify_tolerance: opts.simplifyTolerance,
  }, ctx);
  return r.body;
}

// Children of an area (e.g. constituency → wards).
export async function children(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/area/${encodeURIComponent(id)}/children`, {
    api_key: keyParam(opts, ctx),
    type: opts.type,
  }, ctx);
  return r.body;
}

// A real postcode that sits inside this area (useful for sanity / demo).
export async function examplePostcode(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/area/${encodeURIComponent(id)}/example_postcode`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}

// List every area of a given type (e.g. WMC = UK Parliament constituency,
// LBO = London borough, UTA = Unitary Authority, COI = County, …).
export async function areasOfType(type, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/areas/${encodeURIComponent(type)}`, {
    api_key: keyParam(opts, ctx),
    generation: opts.generation,
  }, ctx);
  return r.body;
}

// Lookup an area by an external code (ons / gss / unit_id / nuts).
// MapIt redirects to the canonical /area/{id} (HTTP 302), which `get()`
// follows transparently.
export async function byCode(scheme, code, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/code/${encodeURIComponent(scheme)}/${encodeURIComponent(code)}`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}

// List MapIt "generations" (boundary epochs). The generation field on
// each area record records when its boundaries are valid.
export async function generations(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/generations`, {
    api_key: keyParam(opts, ctx),
  }, ctx);
  return r.body;
}
