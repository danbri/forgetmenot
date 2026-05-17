// Office for Budget Responsibility — fiscal forecasts + scrutiny of
// HM Treasury Budgets, costings of manifesto pledges.
// Base: https://obr.uk
//
// Tier-3 third-party. Operator: OBR (statutory non-departmental
// public body). OGL v3.0.
//
// No JSON API; surface is HTML + WordPress / RSS feeds. We wrap
// the feeds and provide a `page` fetcher that returns HTML for
// LLM extraction or human reading.
import { get } from '../http.mjs';

const BASE = 'https://obr.uk';

// All-publications RSS feed.
export async function feed(ctx = {}) {
  const r = await get(`${BASE}/topics/feed/`, {},
    { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// Topic-scoped RSS feed (slug from the OBR site, e.g. 'efo',
// 'fsr', 'wmar', 'forecast-evaluation-report', 'policy-costing').
export async function topicFeed(slug, ctx = {}) {
  const r = await get(`${BASE}/${encodeURIComponent(slug)}/feed/`, {},
    { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// Try the WP JSON if it's exposed (some OBR pages support it).
export async function reports(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/wp-json/wp/v2/posts`, {
    search: opts.search,
    per_page: opts.take ?? 10,
    page: opts.page,
  }, { ...ctx, accept: 'application/json' });
  return r.body;
}

// Fetch one HTML page. Useful for retrieving a specific
// publication landing page when the LLM has a slug.
export async function page(path, ctx = {}) {
  const cleanPath = String(path).replace(/^\//, '');
  const r = await get(`${BASE}/${cleanPath}`, {}, { ...ctx, accept: 'text/html' });
  return r.body;
}
