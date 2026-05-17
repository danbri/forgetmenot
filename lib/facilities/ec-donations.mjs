// Electoral Commission — donations / spending / loans / registers of
// political parties and other regulated entities.
// Base: https://search.electoralcommission.org.uk/api/search
//
// Tier-3 third-party. Operator: Electoral Commission. OGL. No auth.
// JSON pagination via start / rows.
import { get } from '../http.mjs';

const BASE = 'https://search.electoralcommission.org.uk/api/search';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

const COMMON = (opts) => dropEmpty({
  start: opts.skip ?? opts.start ?? 0,
  rows: opts.take ?? opts.rows ?? 25,
  query: opts.query,
  sort: opts.sort,
  order: opts.order,
});

// ---- Donations ----
export async function donations(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Donations`, dropEmpty({
    ...COMMON(opts),
    rptType: opts.rptType,
    recipient: opts.recipient,
    donorName: opts.donorName,
    donorType: opts.donorType,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    minValue: opts.minValue,
    maxValue: opts.maxValue,
    natureOfDonationName: opts.natureOfDonationName,
    isAggregation: opts.isAggregation,
    accepted: opts.accepted,
  }), ctx);
  return r.body;
}

// ---- Campaign spending (post-election returns) ----
export async function spending(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Spending`, dropEmpty({
    ...COMMON(opts),
    spenderName: opts.spenderName,
    election: opts.election,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    category: opts.category,
  }), ctx);
  return r.body;
}

// ---- Loans to political parties ----
export async function loans(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Loans`, dropEmpty({
    ...COMMON(opts),
    rptType: opts.rptType,
    recipient: opts.recipient,
    lenderName: opts.lenderName,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  }), ctx);
  return r.body;
}

// ---- Registered campaigners / referendum participants ----
export async function campaigners(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Campaigners`, dropEmpty({
    ...COMMON(opts),
    referendum: opts.referendum,
    election: opts.election,
  }), ctx);
  return r.body;
}

// ---- Registers (parties + non-party campaigners + accounting units) ----
export async function registers(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Registers`, dropEmpty({
    ...COMMON(opts),
    registerType: opts.registerType,
    status: opts.status,
  }), ctx);
  return r.body;
}
