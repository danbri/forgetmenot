// EUR-Lex CELLAR SPARQL — EU law and case-law as Linked Data, with
// extensive cross-references to national-law transpositions.
// Base: https://publications.europa.eu/webapi/rdf/sparql
//
// Tier-3 third-party. Operator: Publications Office of the European
// Union. Free, no auth. Polite User-Agent expected.
//
// Of particular UK-Parliament interest: Retained EU Law Act 2023
// research, citation of CELLAR URIs from legislation.gov.uk's RDF.
//
// NOTE on presets: CELLAR's Common Data Model (CDM) vocabulary is
// large and not always intuitive (a CELEX-by-id query that "looks
// right" with `cdm:resource_legal_id_celex` returned 0 for GDPR
// during this skill's development, suggesting the predicate or the
// CELEX string needs adjustment). We therefore ship only the generic
// `query()` and document the discover-via-the-CDM-ontology pattern
// in the skill body, rather than hardcoding presets we cannot verify
// across multiple acts. Same lesson as wikidata.mjs's earlier
// P5388-Antarctic-coves moment.
import { get, postForm } from '../http.mjs';

const ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
const DEFAULT_UA = 'forgetmenot-eur-lex/0.1 (+https://github.com/danbri/forgetmenot)';

// Raw SPARQL. JSON results bindings by default; pass `format` for
// other shapes. POSTs for queries > 1500 chars.
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
