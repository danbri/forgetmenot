// SHACL checker glue for the UK Parliament SPARQL endpoint.
//
// The conceptual bit: SHACL validates an RDF *graph* (historically, the
// structured data on one web page). Our data lives in a *database* — the
// public DDP triple store behind api.parliament.uk/sparql. You don't hand a
// whole store to a validator; you carve out the part you care about.
//
// The bridge is SPARQL CONSTRUCT / DESCRIBE: the query selects a *subgraph*
// ("the bit of the database to check") and the endpoint returns it as an RDF
// document — exactly the input schemarama validates:
//
//     pick a bit  ->  SPARQL CONSTRUCT/DESCRIBE  ->  RDF subgraph  ->  SHACL
//
// In practice you sample (DESCRIBE one resource, or CONSTRUCT ... LIMIT n for a
// class) or pipeline RDF that some other API already produced (validateRdf).
//
// Turtle support: schemarama's string auto-parser (stringToQuads) only sniffs
// JSON-LD / microdata / RDFa, and its exported parseNQuads is strict N-Quads
// (rejects @prefix). SPARQL CONSTRUCT and most RDF APIs emit *Turtle*, so we
// use a locally rebuilt bundle (browser/third_party, see scripts/build-
// schemarama-bundle.sh) that additionally exports parseTurtle.

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

// Parse an RDF string (Turtle by default) into a schemarama/n3 Store.
export async function parse(rdfText, format = 'turtle') {
  const f = FORMATS[format];
  if (!f) throw new Error(`unknown RDF format: ${format}`);
  return await f.parse(schemarama(), rdfText);
}

// Run a CONSTRUCT/DESCRIBE and return the subgraph as text in `format`.
// The endpoint sends Access-Control-Allow-Origin: *, so this works from any
// static page with no proxy.
export async function extract(constructQuery, { endpoint = ENDPOINT, format = 'turtle' } = {}) {
  const url = `${endpoint}?query=${encodeURIComponent(constructQuery)}`;
  const r = await fetch(url, { headers: { Accept: FORMATS[format].accept } });
  const body = await r.text();
  if (!r.ok) throw new Error(`SPARQL ${r.status}: ${body.slice(0, 300)}`);
  return body;
}

// Validate RDF you already have (e.g. piped from another API) against SHACL
// shapes (Turtle string). Returns { triples, conforms, failures }.
export async function validateRdf(rdfText, shapesTurtle, { format = 'turtle', annotations = {} } = {}) {
  const store = await parse(rdfText, format);
  const validator = new (schemarama().ShaclValidator)(shapesTurtle, { annotations });
  const report = await validator.validate(store);
  return {
    triples: store.getQuads().length,
    conforms: report.failures.length === 0,
    failures: report.failures,
  };
}

// Convenience: extract a subgraph from the endpoint, then validate it.
export async function check(constructQuery, shapesTurtle, opts = {}) {
  const format = opts.format || 'turtle';
  const rdf = await extract(constructQuery, { endpoint: opts.endpoint || ENDPOINT, format });
  return validateRdf(rdf, shapesTurtle, { format, annotations: opts.annotations });
}
