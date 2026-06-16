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
export const SIMILAR = `${BASE}/api/similar`;
export const EMBEDDINGS = `${BASE}/embeddings`;

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

// A query "looks structured" if it already uses Solr field/operator
// syntax — a field-scoped term (`prefLabel:climate`), a phrase, a
// boolean, a wildcard, a boost, etc. Such queries are passed through
// verbatim. Anything else is treated as free text (see search()).
const STRUCTURED = /[:()"~^*?\\]|\bAND\b|\bOR\b|\bNOT\b/;

// Build the Solr `q` for a free-text-or-raw search. Bare terms (the
// common case) are auto-scoped to the label fields because Solr's
// default field here is not the labels; structured/raw queries pass
// through. The index now carries per-language label fields
// (`prefLabel_en`, `altLabel_en`, `prefLabel_fr`, …), so a bare term
// defaults to ENGLISH-ONLY (`prefLabel_en`/`altLabel_en`) — pass
// `lang: 'any'` to search the language-mixed `prefLabel`/`altLabel`,
// or `lang: 'fr'` for another language. `field` overrides everything.
// Pure (no I/O) so it can be unit-tested.
export function buildSearchQuery(q, opts = {}) {
  const query = q || '*:*';
  if (opts.rawQ || query === '*:*' || STRUCTURED.test(query)) return query;
  let fields;
  if (opts.field) {
    fields = String(opts.field).split(',');
  } else {
    const lang = opts.lang ?? 'en';
    fields = lang === 'any' ? ['prefLabel', 'altLabel']
                            : [`prefLabel_${lang}`, `altLabel_${lang}`];
  }
  fields = fields.map((f) => f.trim()).filter(Boolean);
  return fields.map((f) => `${f}:(${query})`).join(' OR ');
}

// Full-text search over the Solr index — the fast, populated surface.
//
// `q` may be a raw Solr query (`prefLabel_en:climate`) OR plain free
// text. The catch: Solr's configured default field here is NOT the
// label text, so a *bare* term like `ocean` silently matches nothing.
// So unless the query already looks structured, we auto-scope it — and
// because the index now has per-language label fields, the default is
// ENGLISH-ONLY: `prefLabel_en:(…) OR altLabel_en:(…)`. That means an
// English query term just works *and* you don't get cross-language
// false hits. (`fl=prefLabel_en` reads back the English label too.)
//
// opts: { rows=20, start=0, fl, scheme, wt='json', field, rawQ, lang }.
//   --scheme <uri>  adds an `fq=scheme:"<uri>"` filter.
//   --lang en       label language to search (default en); `any` =
//                   the language-mixed prefLabel/altLabel; `fr`, … too.
//   --field a,b     explicit label fields (overrides --lang).
//   --raw-q         disable auto-scoping; pass `q` to Solr verbatim.
export async function search(q, opts = {}, ctx = {}) {
  const params = {
    q: buildSearchQuery(q, opts),
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

// Concept → concept nearest neighbours via skosdex's hosted embedding
// KNN (sentence-transformers all-MiniLM-L6-v2, 384-dim, cosine). No
// client-side model needed — pass a concept IRI and get the closest
// concepts back, optionally across all schemes (`cross=1`). Note the
// embedding space covers a curated subset of schemes (currently ESCO,
// GEMET, and the UK Parliament thesaurus), not the whole corpus.
// opts: { k=10, cross=1 }.
export async function similar(id, opts = {}, ctx = {}) {
  const params = { id, k: opts.k ?? 10, cross: opts.cross ?? 1 };
  const r = await rawFetch(buildUrl(SIMILAR, params), { method: 'GET' }, { ...ctx, accept: 'application/json' });
  return r.body;
}
