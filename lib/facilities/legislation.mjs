// legislation.gov.uk SPARQL endpoint — HTTP Basic auth.
//
// The public endpoint at https://www.legislation.gov.uk/sparql returns 401:
// it is credential-gated. Credentials come ONLY from the environment —
//   LEGISLATION_SPARQL_USER, LEGISLATION_SPARQL_PASSWORD
// set via a gitignored `.env` (sourced into your shell) locally, or as
// GitHub Actions secrets in CI. Never hardcode, never put them in the URL
// (URLs get logged) — we send them as an `Authorization: Basic` header.
import { rawFetch, buildUrl } from '../http.mjs';

export const ENDPOINT = 'https://www.legislation.gov.uk/sparql';

const ACCEPTS = {
  json: 'application/sparql-results+json',
  xml: 'application/sparql-results+xml',
  csv: 'text/csv',
  turtle: 'text/turtle',
};

// Build the Basic-auth header from the environment, or throw a helpful error.
export function authHeader() {
  const u = process.env.LEGISLATION_SPARQL_USER;
  const p = process.env.LEGISLATION_SPARQL_PASSWORD;
  if (!u || !p) {
    throw new Error(
      'legislation SPARQL needs LEGISLATION_SPARQL_USER and ' +
      'LEGISLATION_SPARQL_PASSWORD in the environment (see .env.example). ' +
      'Set them in your shell / a gitignored .env, or as GitHub Actions secrets.');
  }
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

// Run a SPARQL query. GET by default; `method: 'post'` for long queries.
// `format`: json (default) | xml | csv | turtle.
export async function query(sparql, opts = {}, ctx = {}) {
  const accept = ACCEPTS[opts.format || 'json'] || ACCEPTS.json;
  const headers = { Authorization: authHeader() };
  const init = opts.method === 'post'
    ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: sparql }).toString() }
    : { method: 'GET', headers };
  const url = opts.method === 'post' ? ENDPOINT : buildUrl(ENDPOINT, { query: sparql });
  const r = await rawFetch(url, init, { ...ctx, accept });
  return r.body;
}

// Convenience: top classes / top predicates (the time-series stats).
export async function classCounts(opts = {}, ctx = {}) {
  const limit = opts.limit ?? 50;
  return query(`SELECT ?t (COUNT(*) AS ?n) WHERE { ?s a ?t } GROUP BY ?t ORDER BY DESC(?n) LIMIT ${limit}`, opts, ctx);
}
export async function predicateCounts(opts = {}, ctx = {}) {
  const limit = opts.limit ?? 50;
  return query(`SELECT ?p (COUNT(*) AS ?n) WHERE { ?s ?p ?o } GROUP BY ?p ORDER BY DESC(?n) LIMIT ${limit}`, opts, ctx);
}
