// Statutory Instruments API.
// Base: https://statutoryinstruments-api.parliament.uk/api/v2
import { get } from '../http.mjs';

const BASE = 'https://statutoryinstruments-api.parliament.uk/api/v2';

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/StatutoryInstrument`, {
    searchTerm: opts.searchTerm ?? opts.term,
    instrumentTypeId: opts.instrumentTypeId,
    procedureId: opts.procedureId,
    layingBodyId: opts.layingBodyId,
    actId: opts.actId,
    madeDateFrom: opts.madeDateFrom,
    madeDateTo: opts.madeDateTo,
    laidDateFrom: opts.laidDateFrom,
    laidDateTo: opts.laidDateTo,
    comingIntoForceDateFrom: opts.comingIntoForceDateFrom,
    comingIntoForceDateTo: opts.comingIntoForceDateTo,
    procedureStep: opts.procedureStep,
    skip: opts.skip,
    take: opts.take ?? 20,
    sortOrder: opts.sortOrder,
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
export async function actsSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/ActOfParliament`, {
    searchTerm: opts.searchTerm ?? opts.term,
    chapter: opts.chapter,
    year: opts.year,
    skip: opts.skip,
    take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function act(id, ctx = {}) {
  const r = await get(`${BASE}/ActOfParliament/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

// ---- Reference ----
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
