// SHACL checker glue for SPARQL endpoints.
//
// The conceptual bit: SHACL validates an RDF *graph* (historically, the
// structured data on one web page). Our data lives in a *database* — a SPARQL
// endpoint. You don't hand a whole store to a validator; you carve out the part
// you care about.
//
// The bridge is SPARQL CONSTRUCT / DESCRIBE: the query selects a *subgraph*
// ("the bit to check") and the endpoint returns it as an RDF document — exactly
// the input schemarama validates:
//
//     pick a bit  ->  SPARQL CONSTRUCT/DESCRIBE  ->  RDF subgraph  ->  SHACL
//
// You sample (DESCRIBE one resource, or CONSTRUCT ... LIMIT n), pipeline RDF
// another API produced (validateRdf), or *federate*: extract a base subgraph
// from one endpoint, enrich it with a CONSTRUCT against another (e.g. Wikidata,
// joined via the identity mappings we serve), merge, and validate the union
// (fetchQuery + parse + validateStore).
//
// Turtle: schemarama's string auto-parser only sniffs JSON-LD / microdata /
// RDFa, and its exported parseNQuads is strict N-Quads (rejects @prefix). SPARQL
// CONSTRUCT/DESCRIBE and most RDF APIs emit Turtle, so we use a locally rebuilt
// bundle (browser/third_party, see scripts/build-schemarama-bundle.sh) that also
// exports parseTurtle.

export const ENDPOINT = 'https://api.parliament.uk/sparql';

// SPARQL Accept header + schemarama parser for each RDF serialisation.
const FORMATS = {
  turtle:    { accept: 'text/turtle',          parse: (s, t) => s.parseTurtle(t) },
  ntriples:  { accept: 'application/n-triples', parse: (s, t) => s.parseNQuads(t) },
  nquads:    { accept: 'application/n-quads',   parse: (s, t) => s.parseNQuads(t) },
  jsonld:    { accept: 'application/ld+json',   parse: (s, t) => s.stringToQuads(t) },
};

function schemarama() {
  const s = globalThis.schemarama;
  if (!s) throw new Error(
    'schemarama bundle not loaded. Include third_party/schemarama.bundle.min.js ' +
    'before this module.');
  return s;
}

// Run a query and return the response body as text in `format`.
// (Note: browsers set User-Agent themselves; WDQS accepts browser requests.)
export async function fetchQuery(endpoint, query, format = 'turtle') {
  const f = FORMATS[format];
  if (!f) throw new Error(`unknown RDF format: ${format}`);
  const url = `${endpoint}?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { Accept: f.accept } });
  const body = await r.text();
  if (!r.ok) throw new Error(`SPARQL ${r.status} from ${endpoint}: ${body.slice(0, 300)}`);
  return body;
}

// Parse an RDF string (Turtle by default) into a schemarama/n3 Store.
export async function parse(rdfText, format = 'turtle') {
  const f = FORMATS[format];
  if (!f) throw new Error(`unknown RDF format: ${format}`);
  return await f.parse(schemarama(), rdfText);
}

// Validate an already-built Store against SHACL shapes (Turtle string).
export async function validateStore(store, shapesTurtle, annotations = {}) {
  const validator = new (schemarama().ShaclValidator)(shapesTurtle, { annotations });
  const report = await validator.validate(store);
  return {
    triples: store.getQuads().length,
    conforms: report.failures.length === 0,
    failures: report.failures,
  };
}

// CONSTRUCT/DESCRIBE -> subgraph text. The endpoints we use send CORS, so this
// works from any static page with no proxy.
export async function extract(constructQuery, { endpoint = ENDPOINT, format = 'turtle' } = {}) {
  return fetchQuery(endpoint, constructQuery, format);
}

// Validate RDF you already have (e.g. piped from another API).
export async function validateRdf(rdfText, shapesTurtle, { format = 'turtle', annotations = {} } = {}) {
  return validateStore(await parse(rdfText, format), shapesTurtle, annotations);
}

// Extract a subgraph from one endpoint, then validate it.
export async function check(constructQuery, shapesTurtle, opts = {}) {
  const format = opts.format || 'turtle';
  const rdf = await extract(constructQuery, { endpoint: opts.endpoint || ENDPOINT, format });
  return validateRdf(rdf, shapesTurtle, { format, annotations: opts.annotations });
}

// Federated check: extract a base subgraph, enrich it from a second endpoint
// (whose CONSTRUCT is built from entity ids found in the base graph), merge, and
// validate the union. `enrich.entityRegex` pulls ids (e.g. Wikidata QIDs) out of
// the base Turtle; `enrich.build(ids)` returns the enrichment CONSTRUCT.
export async function checkFederated(baseQuery, shapesTurtle, opts = {}) {
  const baseEndpoint = opts.endpoint || ENDPOINT;
  const baseTtl = await fetchQuery(baseEndpoint, baseQuery, 'turtle');
  const store = await parse(baseTtl, 'turtle');
  let enrichedFrom = null;
  if (opts.enrich) {
    const ids = [...new Set([...baseTtl.matchAll(opts.enrich.entityRegex)].map(m => m[1] || m[0]))];
    if (ids.length) {
      const enrichTtl = await fetchQuery(opts.enrich.endpoint, opts.enrich.build(ids), 'turtle');
      for (const q of (await parse(enrichTtl, 'turtle')).getQuads()) store.addQuad(q);
      enrichedFrom = { endpoint: opts.enrich.endpoint, ids: ids.length };
    }
  }
  const res = await validateStore(store, shapesTurtle, opts.annotations || {});
  return { ...res, enrichedFrom };
}
