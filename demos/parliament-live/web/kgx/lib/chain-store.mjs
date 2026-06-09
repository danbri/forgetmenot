// =============================================================================
// kgx/lib/chain-store.mjs — pure helpers for the chain-store endpoint.
//
// The fpkg deployment runs TWO Oxigraph instances:
//   - /kgx/query           — the bundled READ-ONLY parliamentary RDF
//   - /kgx/chains-query    — a writable side store for user-saved chains
//   - /kgx/chains-update   — its SPARQL Update endpoint
//
// Each saved chain lives in its own named graph (urn:kgx:flow:<uuid>),
// with the manifest produced by chainToTrig() forming the entire graph
// content. This module owns the small pure bits — SPARQL string assembly,
// flow IRI extraction, parsing the list of saved chains.
//
// Kept DOM-free so the CLI can adopt it too (kgx chain push / list).
// =============================================================================

const FLOW_IRI_RE = /<(urn:kgx:flow:[^>]+)>/;

// Extract the flow IRI that chainToTrig embeds as the graph name. Returns
// null if the manifest doesn't carry one (shouldn't happen — chainToTrig
// always mints one, but we don't pretend).
export function flowIriOfTrig(trig) {
  const m = FLOW_IRI_RE.exec(String(trig || ''));
  return m ? m[1] : null;
}

// Build a SPARQL Update string that DROPs the graph (if it exists) and
// INSERTs the manifest contents in one transaction. The TriG manifest's
// braces serialise straight into the GRAPH block — chainToTrig already
// emits `<flowIri> { triples }`, which is identical to the syntax SPARQL
// 1.1 Update expects inside `INSERT DATA { GRAPH … { … } }`.
//
// We use DROP SILENT + INSERT DATA rather than the more conservative
// DELETE/INSERT, so re-saving a chain with the same flow IRI is a clean
// replace, not an append.
export function buildSaveUpdate(trig) {
  const flow = flowIriOfTrig(trig);
  if (!flow) throw new Error('buildSaveUpdate: no urn:kgx:flow: IRI in manifest');
  // Strip the @prefix declarations from the TriG and reuse them at the
  // top of the SPARQL Update (SPARQL doesn't accept @prefix; it wants
  // bare PREFIX). The triples block in between stays verbatim.
  const prefixLines = [];
  const trigBody = String(trig).replace(/^@prefix\s+([^\s]+)\s+(<[^>]+>)\s*\.\s*$/gm,
    (_full, name, iri) => { prefixLines.push(`PREFIX ${name} ${iri}`); return ''; });
  // The remaining body should start with `<flowIri> { ... }`. Wrap it in
  // INSERT DATA { GRAPH <flowIri> { ... } }. The TriG already names the
  // graph; we strip that opening and re-emit it as a GRAPH block so the
  // shape matches SPARQL Update grammar.
  const graphMatch = trigBody.match(/<urn:kgx:flow:[^>]+>\s*\{([\s\S]*)\}\s*$/);
  if (!graphMatch) throw new Error('buildSaveUpdate: TriG body must end with <flowIri> { ... }');
  const inner = graphMatch[1].trim();
  return `${prefixLines.join('\n')}

DROP SILENT GRAPH <${flow}> ;
INSERT DATA {
  GRAPH <${flow}> {
${inner}
  }
}`;
}

// SELECT every saved chain graph + its title (if known). Returns the
// SPARQL query string. The page issues this to /kgx/chains-query.
export function buildListQuery() {
  return `
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?flow ?title ?id ?ts WHERE {
  GRAPH ?flow {
    ?flow dct:title ?title .
    OPTIONAL { ?flow dct:identifier ?id }
    OPTIONAL { ?flow dct:created    ?ts }
  }
  FILTER(STRSTARTS(STR(?flow), "urn:kgx:flow:"))
} ORDER BY DESC(?ts) ?title`;
}

// Parse the SELECT bindings into a plain list — one entry per saved chain.
export function parseChainList(bindings) {
  return (bindings || []).map((b) => ({
    flowIri: b.flow?.value,
    title:   b.title?.value || '',
    id:      b.id?.value || null,
    ts:      b.ts?.value || null,
  }));
}

// CONSTRUCT the entire contents of one chain graph. Use to load a chain
// from the store and re-hydrate (parse it back into a spec).
export function buildLoadQuery(flowIri) {
  if (!/^urn:kgx:flow:/.test(String(flowIri || ''))) {
    throw new Error(`buildLoadQuery: not a flow IRI: ${flowIri}`);
  }
  return `
CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <${flowIri}> { ?s ?p ?o } }`;
}
