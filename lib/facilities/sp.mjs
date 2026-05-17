// Scottish Parliament Open Data API.
// Base: https://data.parliament.scot/api
//
// Tier-3 third-party. Operator: The Scottish Parliament. OGL v3.0.
// JSON; **must send `Accept: application/json` header** (the default
// content negotiation returns 405 otherwise).
//
// Endpoints confirmed reachable (May 2026): Members, Constituencies,
// Regions, Parties, Committees. Plus other capitalised-PascalCase
// endpoints documented at data.parliament.scot/Documentation.
import { get } from '../http.mjs';

const BASE = 'https://data.parliament.scot/api';

// Generic JSON GET — the API uses PascalCase resource names.
async function jget(resource, ctx = {}) {
  const r = await get(`${BASE}/${resource}`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// ---- People ----
export async function members(ctx = {}) { return jget('Members', ctx); }
export async function memberParties(ctx = {}) { return jget('MemberParties', ctx); }
export async function memberElectionConstituencyStatuses(ctx = {}) {
  return jget('MemberElectionConstituencyStatuses', ctx);
}
export async function memberElectionRegionStatuses(ctx = {}) {
  return jget('MemberElectionRegionStatuses', ctx);
}

// ---- Geography ----
export async function constituencies(ctx = {}) { return jget('Constituencies', ctx); }
export async function regions(ctx = {}) { return jget('Regions', ctx); }

// ---- Parties ----
export async function parties(ctx = {}) { return jget('Parties', ctx); }

// ---- Committees ----
export async function committees(ctx = {}) { return jget('Committees', ctx); }
export async function committeeMembers(ctx = {}) { return jget('CommitteeMembers', ctx); }

// ---- Helpers ----
// Resource cataloguing — tries every plausible PascalCase resource
// name and reports which ones return 200. Useful when documentation
// drifts. Returns { ok: [names], notFound: [names] }.
export async function probeResources(names, ctx = {}) {
  const ok = []; const notFound = [];
  for (const name of names) {
    try {
      const r = await get(`${BASE}/${name}`, {},
        { ...ctx, accept: 'application/json' });
      if (r.ok) ok.push(name); else notFound.push(name);
    } catch { notFound.push(name); }
  }
  return { ok, notFound };
}
