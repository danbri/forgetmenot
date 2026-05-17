// DemocracyClub Candidates — every UK electoral candidate, past and
// declared, with sources and stable IDs.
// Base: https://candidates.democracyclub.org.uk/api/next/
//
// Tier-3 third-party. Operator: DemocracyClub. CC-BY-SA + ODbL-ish
// for derived data. Free JSON, no auth.
import { get } from '../http.mjs';

const BASE = 'https://candidates.democracyclub.org.uk/api/next';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// ---- Ballots ----
// A "ballot" is one election in one electoral area (one polling card).
export async function ballots(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/ballots/`, dropEmpty({
    election_date: opts.electionDate,
    election_id: opts.electionId,
    election_id_regex: opts.electionIdRegex,
    post_id: opts.postId,
    page: opts.page, page_size: opts.take ?? opts.pageSize,
  }), ctx);
  return r.body;
}

export async function ballot(ballotPaperId, ctx = {}) {
  const r = await get(`${BASE}/ballots/${encodeURIComponent(ballotPaperId)}/`, {}, ctx);
  return r.body;
}

// ---- People ----
// A "person" is one candidate identity across many elections.
export async function persons(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/persons/`, dropEmpty({
    name: opts.name,
    page: opts.page, page_size: opts.take ?? opts.pageSize,
  }), ctx);
  return r.body;
}

export async function person(id, ctx = {}) {
  const r = await get(`${BASE}/persons/${encodeURIComponent(id)}/`, {}, ctx);
  return r.body;
}

// ---- Elections ----
export async function elections(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/elections/`, dropEmpty({
    election_date: opts.electionDate,
    election_id: opts.electionId,
    page: opts.page, page_size: opts.take ?? opts.pageSize,
  }), ctx);
  return r.body;
}

export async function election(id, ctx = {}) {
  const r = await get(`${BASE}/elections/${encodeURIComponent(id)}/`, {}, ctx);
  return r.body;
}

// ---- Posts (electoral areas) ----
export async function posts(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/posts/`, dropEmpty({
    page: opts.page, page_size: opts.take ?? opts.pageSize,
  }), ctx);
  return r.body;
}

export async function post(id, ctx = {}) {
  const r = await get(`${BASE}/posts/${encodeURIComponent(id)}/`, {}, ctx);
  return r.body;
}

// ---- Parties ----
export async function parties(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/parties/`, dropEmpty({
    page: opts.page, page_size: opts.take ?? opts.pageSize,
  }), ctx);
  return r.body;
}
