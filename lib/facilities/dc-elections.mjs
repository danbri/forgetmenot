// DemocracyClub EveryElection — every UK election (Westminster,
// devolved, mayoral, local, PCCs, parishes) with canonical IDs.
// Base: https://elections.democracyclub.org.uk/api/
//
// Tier-3 third-party. Operator: DemocracyClub. JSON, no auth.
import { get } from '../http.mjs';

const BASE = 'https://elections.democracyclub.org.uk/api';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// ---- Elections (each row is one ballot — Westminster constituency
// at one general election, mayoral seat at one mayoral, ward + date,
// etc.). election_id is the canonical opaque string id.
export async function elections(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/elections/`, dropEmpty({
    election_id: opts.electionId,
    election_id_regex: opts.electionIdRegex,
    date: opts.date,
    poll_open_date: opts.pollOpenDate,
    group: opts.group,                  // 'parl' | 'local' | 'mayor' | 'pcc' | 'sp' | 'naw' | 'nia' | …
    group_type: opts.groupType,         // 'election' | 'subtype' | 'organisation' | 'ballot'
    organisation: opts.organisation,
    division: opts.division,
    current: opts.current,
    limit: opts.take ?? opts.limit,
    offset: opts.skip ?? opts.offset,
  }), ctx);
  return r.body;
}

export async function election(id, ctx = {}) {
  const r = await get(`${BASE}/elections/${encodeURIComponent(id)}/`, {}, ctx);
  return r.body;
}

// ---- Reference data ----
export async function organisations(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/organisations/`, dropEmpty({
    organisation_type: opts.organisationType,
    limit: opts.take, offset: opts.skip,
  }), ctx);
  return r.body;
}

export async function organisationDivisions(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/organisation_divisions/`, dropEmpty({
    organisation: opts.organisation,
    division_type: opts.divisionType,
    limit: opts.take, offset: opts.skip,
  }), ctx);
  return r.body;
}

// ---- Election types reference ----
export async function electionTypes(ctx = {}) {
  const r = await get(`${BASE}/election_types/`, {}, ctx);
  return r.body;
}

export async function electionSubTypes(ctx = {}) {
  const r = await get(`${BASE}/election_sub_types/`, {}, ctx);
  return r.body;
}
