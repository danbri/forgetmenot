// Statutory Instruments API.
// Base: https://statutoryinstruments-api.parliament.uk/api/v2
//
// Spec: _specs/si.json (OpenAPI v3). Parameter names below match the
// spec; the API itself is case-insensitive on query keys.
//
// NOTE: the underlying API does NOT support date-range filtering. To
// slice by laid/made/coming-into-force date, fetch by other criteria
// (e.g. procedure, layingBody) and filter client-side on the response
// fields `commonsLayingDate`, `lordsLayingDate`, `paperMadeDate`.
import { get } from '../http.mjs';

const BASE = 'https://statutoryinstruments-api.parliament.uk/api/v2';

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument`, {
    Name: opts.name ?? opts.searchTerm ?? opts.term,
    Procedure: opts.procedure ?? opts.procedureId,
    ScheduledDebate: opts.scheduledDebate,
    MotionToStop: opts.motionToStop,
    ConcernsRaisedByCommittee: opts.concernsRaisedByCommittee,
    ParliamentaryProcessConcluded: opts.parliamentaryProcessConcluded,
    DepartmentId: opts.departmentId,
    LayingBodyId: opts.layingBodyId,
    RecommendedForProcedureChange: opts.recommendedForProcedureChange,
    ActOfParliamentId: opts.actOfParliamentId ?? opts.actId,
    House: opts.house,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function getById(instrumentId, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument/${encodeURIComponent(instrumentId)}`, {}, ctx);
  return r.body;
}

export async function timeline(instrumentId, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument/${encodeURIComponent(instrumentId)}/BusinessItems`, {}, ctx);
  return r.body;
}

export async function timelineById(timelineId, ctx = {}) {
  const r = await get(`${BASE}/Timeline/${encodeURIComponent(timelineId)}/BusinessItems`, {}, ctx);
  return r.body;
}

// ---- Acts of Parliament ----
// Spec only exposes Id (array) and Name. `chapter`, `year`, `searchTerm`
// are NOT supported — the API silently ignores them.
export async function actsSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/ActOfParliament`, {
    Id: opts.id,
    Name: opts.name ?? opts.searchTerm ?? opts.term,
  }, ctx);
  return r.body;
}

export async function act(id, ctx = {}) {
  const r = await get(`${BASE}/ActOfParliament/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

// ---- Reference (no query parameters per spec) ----
export async function layingBodies(ctx = {}) {
  const r = await get(`${BASE}/LayingBody`, {}, ctx);
  return r.body;
}

export async function procedures(ctx = {}) {
  const r = await get(`${BASE}/Procedure`, {}, ctx);
  return r.body;
}

export async function procedure(id, ctx = {}) {
  const r = await get(`${BASE}/Procedure/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}
