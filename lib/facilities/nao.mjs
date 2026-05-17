// National Audit Office — audits of UK government departments.
// Base: https://www.nao.org.uk
//
// Tier-3 third-party. Operator: National Audit Office (an
// independent body answerable to Parliament via the Public
// Accounts Committee). OGL v3.0.
//
// Two surfaces:
//   /wp-json/wp/v2/posts        — WordPress REST API for reports
//   /reports/feed/              — RSS feed of new reports
import { get } from '../http.mjs';

const BASE = 'https://www.nao.org.uk';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// List / search reports via the WP REST API.
//   reports({ search: 'defence', per_page: 10, page: 1 })
// Returns the WP post objects (date, slug, title, excerpt, content).
export async function reports(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/wp-json/wp/v2/posts`, dropEmpty({
    search: opts.search ?? opts.query,
    categories: opts.categories,
    per_page: opts.take ?? opts.perPage ?? 10,
    page: opts.page,
    order: opts.order,
    orderby: opts.orderby,
    after: opts.after,     // ISO 8601 datestamp
    before: opts.before,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One report by WP id.
export async function report(id, ctx = {}) {
  const r = await get(`${BASE}/wp-json/wp/v2/posts/${encodeURIComponent(id)}`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// Reports RSS feed (alternative to wp-json).
export async function feed(ctx = {}) {
  const r = await get(`${BASE}/reports/feed/`, {},
    { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// WP categories — useful for filtering reports by topic
// (e.g. "Defence", "Health and social care").
export async function categories(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/wp-json/wp/v2/categories`, dropEmpty({
    per_page: opts.take ?? 100, page: opts.page,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}
