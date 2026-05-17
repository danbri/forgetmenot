// Bill Papers — Rails app at api.parliament.uk/bill-papers.
//
// No JSON API: alternate formats are CSV (bulk catalogue) and RSS
// (per-bill paper feed). The HTML site is the source of truth for
// the navigation; this library wraps the CSV/RSS surfaces only.
//
// Confirmed alternate-format links (May 2026):
//   /bill-papers/bills.csv                    full bill catalogue
//   /bill-papers/publication-types.csv        publication-type index
//   /bill-papers/bills/{id}.csv               papers attached to one bill
//   /bill-papers/bills/{id}.rss               RSS feed of those papers
// HTML-only (no alt format):
//   /bill-papers/sessions, /bill-types, /bill-categories,
//   /bill-papers/bills/{id} detail page.
import { get, getBytes } from '../http.mjs';

const BASE = 'https://api.parliament.uk/bill-papers';

// ---- Bulk CSV catalogues ----
export async function billsCsv(ctx = {}) {
  const r = await get(`${BASE}/bills.csv`, {}, { ...ctx, accept: 'text/csv' });
  return r.body;
}

export async function publicationTypesCsv(ctx = {}) {
  const r = await get(`${BASE}/publication-types.csv`, {}, { ...ctx, accept: 'text/csv' });
  return r.body;
}

// ---- Per-bill ----
// One bill's papers as CSV (rows = publications attached to the bill).
export async function billCsv(billId, ctx = {}) {
  const r = await get(`${BASE}/bills/${encodeURIComponent(billId)}.csv`, {}, { ...ctx, accept: 'text/csv' });
  return r.body;
}

// One bill's papers as RSS feed.
export async function billRss(billId, ctx = {}) {
  const r = await get(`${BASE}/bills/${encodeURIComponent(billId)}.rss`, {}, { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// HTML detail page URL (no JSON alternate). Provided so callers can
// link the user out to the canonical record.
export function billHtmlUrl(billId) {
  return `${BASE}/bills/${encodeURIComponent(billId)}`;
}

// ---- Helper: parse the CSV index into objects ----
// The CSVs are RFC 4180 style with double-quoted strings and HTML
// entities inside descriptions; this parser returns each row as
// { header: value } pairs.
export function parseCsv(csv) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const rows = lines.map(parseCsvLine);
  const header = rows[0];
  return rows.slice(1).map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])));
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let i = 0;
  let inQuote = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQuote = false; i++; continue; }
      cur += c; i++;
    } else {
      if (c === '"') { inQuote = true; i++; continue; }
      if (c === ',') { out.push(cur); cur = ''; i++; continue; }
      cur += c; i++;
    }
  }
  out.push(cur);
  return out;
}
