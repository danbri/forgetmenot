// UK Parliament SPARQL endpoint.
// Endpoint: https://api.parliament.uk/sparql
// GET with ?query=<urlencoded SPARQL>. POST is also accepted.
import { rawFetch, buildUrl, postForm } from '../http.mjs';

export const ENDPOINT = 'https://api.parliament.uk/sparql';

const ACCEPTS = {
  json: 'application/sparql-results+json',
  xml: 'application/sparql-results+xml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  turtle: 'text/turtle',
  rdfxml: 'application/rdf+xml',
};

// Run a SELECT/ASK query and return parsed JSON results.
// `query` is a SPARQL string. Pass `format: 'csv'`, etc., for raw text.
// `method: 'post'` to use POST (recommended for long queries).
export async function query(sparql, opts = {}, ctx = {}) {
  const accept = ACCEPTS[opts.format || 'json'] || ACCEPTS.json;
  if (opts.method === 'post') {
    const r = await postForm(ENDPOINT, { query: sparql }, { ...ctx, accept });
    return r.body;
  }
  const r = await rawFetch(buildUrl(ENDPOINT, { query: sparql }), { method: 'GET' }, { ...ctx, accept });
  return r.body;
}

// Convenience: list all classes used in the store.
export async function listClasses(opts = {}, ctx = {}) {
  const limit = opts.limit ?? 200;
  return query(
    `SELECT DISTINCT ?cls (COUNT(?s) AS ?n) WHERE { ?s a ?cls } GROUP BY ?cls ORDER BY DESC(?n) LIMIT ${limit}`,
    {}, ctx);
}

// Predicates used on instances of a class.
export async function predicatesOf(classUri, opts = {}, ctx = {}) {
  const limit = opts.limit ?? 200;
  return query(
    `SELECT DISTINCT ?p (COUNT(?s) AS ?n) WHERE { ?s a <${classUri}> ; ?p ?o } GROUP BY ?p ORDER BY DESC(?n) LIMIT ${limit}`,
    {}, ctx);
}

// rdfs:Class / owl:Class enumeration with labels.
export async function rdfsClasses(ctx = {}) {
  return query(`
SELECT DISTINCT ?cls ?label WHERE {
  { ?cls a <http://www.w3.org/2000/01/rdf-schema#Class> }
  UNION
  { ?cls a <http://www.w3.org/2002/07/owl#Class> }
  OPTIONAL { ?cls <http://www.w3.org/2000/01/rdf-schema#label> ?label }
} ORDER BY ?cls`, {}, ctx);
}

// rdfs:subClassOf graph.
export async function classHierarchy(opts = {}, ctx = {}) {
  const limit = opts.limit ?? 1000;
  return query(
    `SELECT ?sub ?super WHERE { ?sub <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?super } LIMIT ${limit}`,
    {}, ctx);
}

// SKOS concept schemes.
export async function skosSchemes(ctx = {}) {
  return query(`
SELECT DISTINCT ?scheme ?label WHERE {
  ?scheme a <http://www.w3.org/2004/02/skos/core#ConceptScheme> .
  OPTIONAL { ?scheme <http://www.w3.org/2000/01/rdf-schema#label> ?label }
}`, {}, ctx);
}

// DESCRIBE a resource.
export async function describe(uri, opts = {}, ctx = {}) {
  return query(`DESCRIBE <${uri}>`, { format: opts.format ?? 'turtle' }, ctx);
}
