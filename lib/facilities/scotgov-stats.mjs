// statistics.gov.scot — Scottish Government statistics as RDF linked-
// data cube (DataCube vocabulary) with a SPARQL endpoint.
// Base: https://statistics.gov.scot/sparql
//
// Tier-3 third-party. Operator: Scottish Government. OGL v3.0.
// Free, no auth. Polite User-Agent expected.
//
// The endpoint sometimes returns 503 under load — retry with
// backoff and prefer short queries. For bulk export, the same data
// is published as CSV downloads at statistics.gov.scot.
import { get, postForm } from '../http.mjs';

const ENDPOINT = 'https://statistics.gov.scot/sparql';
const DEFAULT_UA = 'forgetmenot-scotgov-stats/0.1 (+https://github.com/danbri/forgetmenot)';

// Raw SPARQL. Returns parsed JSON results bindings by default; pass
// `format: 'xml' | 'csv' | 'tsv'` for other formats. POSTs for
// long queries (URL length).
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

// Preset: list the published datasets (DataCubes).
// Each row carries the dataset URI + a human label.
export async function datasets(opts = {}, ctx = {}) {
  const limit = opts.take ?? opts.limit ?? 50;
  const sparql = `
    PREFIX qb: <http://purl.org/linked-data/cube#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT DISTINCT ?dataset ?label WHERE {
      ?dataset a qb:DataSet .
      OPTIONAL { ?dataset rdfs:label ?label . FILTER(LANG(?label) = "en") }
    }
    LIMIT ${Number(limit)}
  `;
  return query(sparql, opts, ctx);
}

// Preset: dimensions defined on one dataset (its measure + filter axes).
export async function dimensions(datasetUri, opts = {}, ctx = {}) {
  const sparql = `
    PREFIX qb: <http://purl.org/linked-data/cube#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT DISTINCT ?dim ?label WHERE {
      <${String(datasetUri)}> qb:structure/qb:component/qb:dimension ?dim .
      OPTIONAL { ?dim rdfs:label ?label . FILTER(LANG(?label) = "en") }
    }
  `;
  return query(sparql, opts, ctx);
}
