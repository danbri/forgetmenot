// data.gov.uk — UK government data catalogue (CKAN).
// Base: https://data.gov.uk/api/3/action
//
// Tier-3 third-party. Operator: Government Digital Service (Cabinet
// Office). ~58,000 datasets aggregated from every central department
// + most local authorities + statutory bodies. OGL v3.0 (catalogue);
// individual dataset licences vary.
//
// CKAN is a published standard; this wrap exposes the actions
// useful for Parliament-adjacent research. For the full CKAN action
// list see https://docs.ckan.org/en/latest/api/.
import { get } from '../http.mjs';

const BASE = 'https://data.gov.uk/api/3/action';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// Full-text + facet search across all datasets.
//
// Common opts:
//   q              free text query
//   fq             Solr-style filter query (e.g. 'organization:hm-revenue-customs')
//   rows           page size (default 10, max 1000)
//   start          offset
//   sort           e.g. 'score desc', 'metadata_modified desc'
//   facet.field    JSON-encoded array of facet field names
export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/package_search`, dropEmpty({
    q: opts.query ?? opts.q,
    fq: opts.fq,
    rows: opts.take ?? opts.rows ?? 10,
    start: opts.skip ?? opts.start,
    sort: opts.sort,
    'facet.field': opts.facetField,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One dataset by id or slug.
export async function dataset(idOrSlug, ctx = {}) {
  const r = await get(`${BASE}/package_show`, { id: idOrSlug },
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// List of publishing organisations (i.e. who owns each dataset).
// `all_fields=true` to get details, otherwise just names.
export async function organisations(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/organization_list`, dropEmpty({
    all_fields: opts.allFields ? 'true' : undefined,
    limit: opts.take ?? opts.limit,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One organisation by slug.
export async function organisation(slug, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/organization_show`, dropEmpty({
    id: slug,
    include_datasets: opts.includeDatasets ? 'true' : undefined,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// CKAN tag list — useful for discovering the topic vocabulary.
export async function tags(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/tag_list`, dropEmpty({
    query: opts.query,
    all_fields: opts.allFields ? 'true' : undefined,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// Topic groups (CKAN groups — higher-level than tags).
export async function groups(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/group_list`, dropEmpty({
    all_fields: opts.allFields ? 'true' : undefined,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// Recently-modified datasets (handy for "what changed this week").
export async function recentlyModified(opts = {}, ctx = {}) {
  return search({
    ...opts,
    sort: 'metadata_modified desc',
  }, ctx);
}
