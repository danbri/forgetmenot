// FixMyStreet — mySociety's per-council issue-reporting service.
// Base: https://www.fixmystreet.com
//
// Tier-3 third-party. Operator: mySociety. CC-BY-SA / odbl-ish.
//
// FixMyStreet does NOT publish a stable JSON REST API (the older
// /reports.json and /api endpoints both return 404 as of May 2026).
// What IS available, and what we wrap:
//   - RSS feeds for an area: /rss/reports/<area>
//   - RSS feeds for a postcode / lat-lon: /rss/around?…
//   - The legacy /around HTML page (for follow-up scraping if needed)
//
// The CIVIC-tech FixMyStreet open-source platform has its own JSON
// API spec at https://github.com/mysociety/fixmystreet/wiki/API — but
// it's only exposed on the cobrand instances that opt in (e.g.
// fixmystreet.com itself doesn't). If that changes we'd extend this
// facility.
import { get } from '../http.mjs';

const BASE = 'https://www.fixmystreet.com';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// RSS feed of all reports.
export async function feed(ctx = {}) {
  const r = await get(`${BASE}/rss/reports`, {},
    { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// RSS feed for one council / area name (e.g. "London", "Bristol").
export async function feedByArea(area, ctx = {}) {
  const r = await get(`${BASE}/rss/reports/${encodeURIComponent(area)}`, {},
    { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// RSS feed for a postcode or lat/lon. Pass `postcode` OR `lat`+`lon`.
// Optional `distance` (km, default 2), `state` ('open' | 'fixed' |
// 'all'), `category` (one of the council's category names).
export async function feedAround(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/rss/around`, dropEmpty({
    pc: opts.postcode,
    latitude: opts.lat ?? opts.latitude,
    longitude: opts.lon ?? opts.longitude,
    d: opts.distance,
    state: opts.state,
    category: opts.category,
  }), { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// HTML page for one area (no JSON variant available).
export async function aroundHtml(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/around`, dropEmpty({
    pc: opts.postcode,
    latitude: opts.lat ?? opts.latitude,
    longitude: opts.lon ?? opts.longitude,
  }), { ...ctx, accept: 'text/html' });
  return r.body;
}

// One report's stable URL (just a string, no fetch).
export function reportUrl(reportId) {
  return `${BASE}/report/${encodeURIComponent(reportId)}`;
}
