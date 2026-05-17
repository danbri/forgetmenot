// Wikidata SPARQL — public query endpoint at query.wikidata.org.
// Tier-3 third-party. Operator: Wikimedia Foundation. CC0.
//
// Headline use in this repo: cross-ID glue between Parliament data
// and every other identifier ecosystem. The right Wikidata property
// numbers for UK-politician cross-refs are NOT hardcoded here —
// they drift and the catalogue is too large to embed safely. To
// discover them for a known politician, fetch the entity JSON with
// `entity(qid)` and read the `claims` keys.
import { get, postForm } from '../http.mjs';

const ENDPOINT = 'https://query.wikidata.org/sparql';

// WDQS requires a polite User-Agent identifying the project + a
// contact URL.
const DEFAULT_UA = 'forgetmenot-wikidata/0.1 (+https://github.com/danbri/forgetmenot)';

// Raw SPARQL query. Returns parsed JSON results by default; pass
// `format: 'xml' | 'csv' | 'tsv'` for other formats. Auto-POSTs
// for queries > 1500 chars (URL length).
export async function query(sparql, opts = {}, ctx = {}) {
  const fmt = opts.format ?? 'json';
  const accept = fmt === 'json' ? 'application/sparql-results+json'
              : fmt === 'xml'  ? 'application/sparql-results+xml'
              : fmt === 'csv'  ? 'text/csv'
              : fmt === 'tsv'  ? 'text/tab-separated-values'
              : 'application/sparql-results+json';
  const userAgent = ctx.userAgent ?? opts.userAgent ?? DEFAULT_UA;
  if (opts.method === 'POST' || sparql.length > 1500) {
    const r = await postForm(ENDPOINT, { query: sparql }, { ...ctx, accept, userAgent });
    return r.body;
  }
  const r = await get(ENDPOINT, { query: sparql }, { ...ctx, accept, userAgent });
  return r.body;
}

// Linked-Data JSON for one Wikidata QID — every claim + label +
// description + sitelinks. Useful for discovering which property
// IDs apply to UK politicians (look at `claims` keys).
export async function entity(qid, ctx = {}) {
  const id = encodeURIComponent(qid);
  const userAgent = ctx.userAgent ?? DEFAULT_UA;
  const r = await get(
    `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,
    {}, { ...ctx, userAgent, accept: 'application/json' },
  );
  return r.body;
}

// Convenience: search for entities matching a label string. Uses
// the Wikidata web API, not SPARQL — faster for "what's the QID of
// Keir Starmer" type questions.
export async function searchEntities(label, opts = {}, ctx = {}) {
  const userAgent = ctx.userAgent ?? DEFAULT_UA;
  const r = await get('https://www.wikidata.org/w/api.php', {
    action: 'wbsearchentities',
    search: label,
    language: opts.language ?? 'en',
    type: opts.type ?? 'item',
    limit: opts.take ?? opts.limit ?? 10,
    format: 'json',
  }, { ...ctx, userAgent, accept: 'application/json' });
  return r.body;
}
