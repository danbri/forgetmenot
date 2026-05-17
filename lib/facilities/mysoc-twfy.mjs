// TheyWorkForYou (mySociety) — UK Parliament data with mySociety analyses.
// Base: https://www.theyworkforyou.com/api
//
// Tier-3 third-party. Operator: mySociety. Requires a free API key
// from https://www.theyworkforyou.com/api/key (set TWFY_API_KEY env
// var, pass --api-key, or include in ctx).
import { get } from '../http.mjs';

const BASE = 'https://www.theyworkforyou.com/api';

function keyParam(opts, ctx) {
  const k = opts.apiKey ?? ctx.apiKey ?? (typeof process !== 'undefined' ? process.env?.TWFY_API_KEY : null);
  if (!k) {
    throw new Error('TWFY: API key required. Get one at https://www.theyworkforyou.com/api/key, then pass --api-key or set TWFY_API_KEY.');
  }
  return k;
}

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// ---- People ----
export async function getMPs(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getMPs`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    date: opts.date, search: opts.search, party: opts.party,
  }), ctx);
  return r.body;
}

export async function getMP(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getMP`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    postcode: opts.postcode, constituency: opts.constituency,
    id: opts.id,         // TWFY person id
    always_return: opts.alwaysReturn,
  }), ctx);
  return r.body;
}

export async function getMPInfo(personId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getMPInfo`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    id: personId, fields: opts.fields,
  }), ctx);
  return r.body;
}

export async function getMPInfoBatch(ids, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getMPsInfo`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    id: Array.isArray(ids) ? ids.join(',') : ids,
    fields: opts.fields,
  }), ctx);
  return r.body;
}

export async function getLord(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getLord`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    id: opts.id, search: opts.search,
  }), ctx);
  return r.body;
}

export async function getLords(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getLords`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    date: opts.date, party: opts.party,
  }), ctx);
  return r.body;
}

// ---- Constituencies ----
export async function getConstituencies(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getConstituencies`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js', date: opts.date,
  }), ctx);
  return r.body;
}

export async function getConstituency(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getConstituency`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    postcode: opts.postcode, name: opts.name,
  }), ctx);
  return r.body;
}

// ---- Speeches / debates / written ----
export async function getDebates(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getDebates`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    type: opts.type ?? 'commons',  // commons | lords | westminsterhall | scotland | northernireland
    date: opts.date, search: opts.search, person: opts.person,
    gid: opts.gid, order: opts.order, page: opts.page, num: opts.num,
  }), ctx);
  return r.body;
}

export async function getWrans(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getWrans`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    date: opts.date, search: opts.search, person: opts.person,
    gid: opts.gid, order: opts.order, page: opts.page, num: opts.num,
  }), ctx);
  return r.body;
}

export async function getWMS(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getWMS`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    date: opts.date, search: opts.search, person: opts.person,
    gid: opts.gid, order: opts.order, page: opts.page, num: opts.num,
  }), ctx);
  return r.body;
}

// ---- Comments (user discussion on TWFY) ----
export async function getComments(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getComments`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    start_date: opts.startDate, end_date: opts.endDate,
    search: opts.search, pid: opts.pid, page: opts.page, num: opts.num,
  }), ctx);
  return r.body;
}

// ---- Geometry helpers ----
export async function getGeometry(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getGeometry`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    name: opts.name,
  }), ctx);
  return r.body;
}

export async function getBoundary(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/getBoundary`, dropEmpty({
    key: keyParam(opts, ctx), output: 'js',
    name: opts.name,
  }), ctx);
  return r.body;
}
