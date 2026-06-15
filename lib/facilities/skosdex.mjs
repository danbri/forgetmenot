// skosdex — a skills-first index of many SKOS concept schemes.
// Hosted demo: https://skosdex.fly.dev/
// Source:      https://github.com/danbri/skosdex
//
// Tier-3 third-party (operated by skosdex, the SKOS aggregator; not
// UK Parliament). Free, no auth. Aggregates ~2.5M concepts from
// hundreds of openly-licensed thesauri (AGROVOC, EuroVoc, GEMET, LCSH,
// Getty AAT/ULAN, IPTC NewsCodes, Loterre, …) into two query surfaces:
//
//   1. Solr full-text index  — /solr/skos/select — the populated,
//      fast search surface (label / altLabel / definition).
//   2. SPARQL 1.1 endpoint   — /query (Oxigraph) — the bundled RDF as
//      ONE NAMED GRAPH PER SCHEME. The default graph is EMPTY, so a
//      plain `{ ?s ?p ?o }` returns nothing; you must wrap patterns in
//      `GRAPH ?g { … }` (or pass a default-graph-uri). This is the
//      single most common gotcha — see schemes() / search().
//
// Of UK-Parliament interest: the corpus carries the cross-vocabulary
// `skos:exactMatch` / `closeMatch` mapping web, so a concept in one
// thesaurus can be bridged to EuroVoc / GEMET / LCSH / Wikidata, which
// is useful for subject-tagging parliamentary material against an
// international controlled vocabulary.
import { rawFetch, buildUrl, postForm } from '../http.mjs';

export const BASE = 'https://skosdex.fly.dev';
export const ENDPOINT = `${BASE}/query`;
export const SOLR = `${BASE}/solr/skos/select`;
export const MANIFEST = `${BASE}/manifest.json`;

const SKOS = 'http://www.w3.org/2004/02/skos/core#';

const ACCEPTS = {
  json: 'application/sparql-results+json',
  xml: 'application/sparql-results+xml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  turtle: 'text/turtle',
  rdfxml: 'application/rdf+xml',
};

// Raw SPARQL against the Oxigraph endpoint. JSON results by default;
// pass `format` for other shapes. Reminder: data lives in named
// graphs only — wrap triple patterns in `GRAPH ?g { … }`.
// Long queries (or `method: 'post'`) go over POST.
export async function query(sparql, opts = {}, ctx = {}) {
  const accept = ACCEPTS[opts.format || 'json'] || ACCEPTS.json;
  if (opts.method === 'post' || sparql.length > 1500) {
    const r = await postForm(ENDPOINT, { query: sparql }, { ...ctx, accept });
    return r.body;
  }
  const r = await rawFetch(buildUrl(ENDPOINT, { query: sparql }), { method: 'GET' }, { ...ctx, accept });
  return r.body;
}

// Full-text search over the Solr index — the fast, populated surface.
// `q` is a Solr query string. Bare terms search the default field;
// field-scoped queries also work, e.g. `prefLabel:climate`.
// opts: { rows=20, start=0, fl, scheme, wt='json' }.
//   --scheme <uri>  adds an `fq=scheme:"<uri>"` filter.
export async function search(q, opts = {}, ctx = {}) {
  const params = {
    q: q || '*:*',
    rows: opts.rows ?? 20,
    start: opts.start ?? 0,
    wt: opts.wt ?? 'json',
  };
  if (opts.fl) params.fl = opts.fl;
  if (opts.scheme) params.fq = `scheme:"${opts.scheme}"`;
  const r = await rawFetch(buildUrl(SOLR, params), { method: 'GET' }, { ...ctx, accept: 'application/json' });
  return r.body;
}

// List the concept-scheme named graphs (each graph IRI == scheme IRI).
// opts: { limit=500 }.
export async function schemes(opts = {}, ctx = {}) {
  const limit = opts.limit ?? 500;
  return query(
    `SELECT DISTINCT ?g WHERE { GRAPH ?g { } } ORDER BY ?g LIMIT ${limit}`,
    {}, ctx);
}

// Labels + broader / narrower for one concept URI, searched across all
// named graphs (so you needn't know which scheme it lives in).
export async function concept(uri, opts = {}, ctx = {}) {
  return query(`
PREFIX skos: <${SKOS}>
SELECT ?p ?o WHERE {
  GRAPH ?g {
    <${uri}> ?p ?o .
    FILTER(?p IN (skos:prefLabel, skos:altLabel, skos:definition,
                  skos:broader, skos:narrower, skos:related,
                  skos:exactMatch, skos:closeMatch, skos:inScheme))
  }
}`, {}, ctx);
}

// The corpus manifest: every scheme with its slug, namespace URI,
// licence, and (where known) concept count. Includes copyleft /
// metadata-only schemes that are NOT in the distributed RDF bundle.
export async function manifest(ctx = {}) {
  const r = await rawFetch(MANIFEST, { method: 'GET' }, { ...ctx, accept: 'application/json' });
  return r.body;
}
