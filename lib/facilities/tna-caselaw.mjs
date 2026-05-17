// Find Case Law — The National Archives' open service for UK
// court and tribunal judgments at caselaw.nationalarchives.gov.uk.
// Tier-3 third-party. Operator: TNA. Open Justice Licence.
//
// Distributed as Akoma Ntoso (LegalDocML) XML, with Atom feeds and
// a public search API. Coverage: Supreme Court, Court of Appeal,
// High Court (KBD / Chancery / Family / Administrative / Commercial /
// TCC), Upper Tribunals, Employment Appeal Tribunal, growing set of
// First-tier Tribunals.
import { get, getBytes } from '../http.mjs';

const BASE = 'https://caselaw.nationalarchives.gov.uk';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// Site-wide Atom feed of newest judgments.
export async function atomAll(ctx = {}) {
  const r = await get(`${BASE}/atom.xml`, {}, { ...ctx, accept: 'application/atom+xml, application/xml, text/xml' });
  return r.body;
}

// Court-specific Atom feed. `court` is the URL slug, e.g.
// 'uksc' (Supreme Court), 'ewca/civ' (CA Civil), 'ewhc/admin'
// (High Court Administrative), 'ukut/aac' (UT Admin Appeals).
export async function atomByCourt(court, ctx = {}) {
  const r = await get(`${BASE}/${court}/atom.xml`, {}, { ...ctx, accept: 'application/atom+xml, application/xml, text/xml' });
  return r.body;
}

// Public search. Returns HTML by default; pass `format: 'atom'` for
// an Atom feed of the same query.
export async function search(opts = {}, ctx = {}) {
  const fmt = opts.format ?? 'html';
  const params = dropEmpty({
    query: opts.query ?? opts.term,
    court: opts.court,
    judge: opts.judge,
    party: opts.party,
    from_date_0: opts.fromDay, from_date_1: opts.fromMonth, from_date_2: opts.fromYear,
    to_date_0: opts.toDay,     to_date_1: opts.toMonth,     to_date_2: opts.toYear,
    order: opts.order,
    page: opts.page,
    per_page: opts.take ?? opts.perPage,
  });
  const path = fmt === 'atom' ? '/judgments/search/atom.xml' : '/judgments/search';
  const r = await get(`${BASE}${path}`, params, {
    ...ctx,
    accept: fmt === 'atom' ? 'application/atom+xml, application/xml, text/xml' : 'text/html',
  });
  return r.body;
}

// One judgment by URI segment, e.g. 'ewhc/admin/2024/2042'.
// `format` ∈ 'xml' (Akoma Ntoso), 'pdf', 'html', 'data.xml' (alias for xml).
export async function judgment(uriSegment, opts = {}, ctx = {}) {
  const fmt = opts.format ?? 'xml';
  const ext = fmt === 'pdf' ? '/data.pdf'
            : fmt === 'html' ? ''
            : '/data.xml';
  const accept = fmt === 'pdf' ? 'application/pdf'
              : fmt === 'html' ? 'text/html'
              : 'application/akn+xml, application/xml, text/xml';
  if (fmt === 'pdf') {
    return getBytes(`${BASE}/${uriSegment}${ext}`, {}, ctx);
  }
  const r = await get(`${BASE}/${uriSegment}${ext}`, {}, { ...ctx, accept });
  return r.body;
}

// Canonical judgment URL string (no fetch).
export function judgmentUrl(uriSegment, format = 'html') {
  if (format === 'xml')  return `${BASE}/${uriSegment}/data.xml`;
  if (format === 'pdf')  return `${BASE}/${uriSegment}/data.pdf`;
  return `${BASE}/${uriSegment}`;
}

// Browse a court's index page (HTML).
export async function browseCourt(court, ctx = {}) {
  const r = await get(`${BASE}/${court}`, {}, { ...ctx, accept: 'text/html' });
  return r.body;
}
