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

// SELECT every quad in the chain graph. The page consumes this — the
// SELECT shape returns JSON bindings the browser can parse without a
// Turtle parser dependency. parseChainSpec() walks the bindings into
// a chain spec ready to feed `library-pick`.
//
// CONSTRUCT (buildLoadQuery, above) remains for callers that want raw
// RDF — e.g. an external tool re-running the manifest's SPARQL — but
// is not what the page uses to rehydrate.
export function buildLoadSelectQuery(flowIri) {
  if (!/^urn:kgx:flow:/.test(String(flowIri || ''))) {
    throw new Error(`buildLoadSelectQuery: not a flow IRI: ${flowIri}`);
  }
  return `
SELECT ?s ?p ?o WHERE { GRAPH <${flowIri}> { ?s ?p ?o } }`;
}

// Vocabulary terms — long form, since the bindings come back fully
// expanded. The KGX namespace mirrors trig.mjs PREFIXES. If we
// rationalise the IRI scheme (review.md Phase 2), the constants here
// move with it — the writer + reader stay in lockstep.
const KGX = 'https://forgetmenot.local/vocab/kgx/';
const RDF_TYPE    = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DCT_TITLE   = 'http://purl.org/dc/terms/title';
const DCT_DESC    = 'http://purl.org/dc/terms/description';
const DCT_ID      = 'http://purl.org/dc/terms/identifier';
const DCT_CREATED = 'http://purl.org/dc/terms/created';

const BUNDLE_KINDS = new Set([
  `${KGX}SourceBundle`,
  `${KGX}FilterBundle`,
  `${KGX}PivotBundle`,
  `${KGX}AugmentBundle`,
]);

// Parse SELECT ?s ?p ?o bindings back into a chain spec — the inverse
// of chainToTrig() for the linear active-branch case.
//
// Single-valued predicates win (each subject's property map is last-write).
// That matches the current manifest shape where every predicate appears
// at most once per bundle. When multi-branch emission lands, the parser
// will need a more careful traversal — but the contract here stays:
// `(flowIri, bindings) → spec`.
//
// Order is recovered by walking kgx:derivedFrom from the root forward,
// not by trusting any naming convention on bundle IRIs.
export function parseChainSpec(bindings, flowIri) {
  if (!flowIri) throw new Error('parseChainSpec: flowIri required');
  const bySubj = new Map();
  for (const b of bindings || []) {
    const s = b?.s?.value;
    const p = b?.p?.value;
    const o = b?.o?.value;
    if (!s || !p || o === undefined) continue;
    if (!bySubj.has(s)) bySubj.set(s, new Map());
    bySubj.get(s).set(p, o);
  }

  const meta = bySubj.get(flowIri) || new Map();
  const title = meta.get(DCT_TITLE);
  const sub   = meta.get(DCT_DESC);
  const id    = meta.get(DCT_ID);
  const ts    = meta.get(DCT_CREATED);

  const bundles = [];
  for (const [uri, props] of bySubj.entries()) {
    const t = props.get(RDF_TYPE);
    if (!BUNDLE_KINDS.has(t)) continue;
    bundles.push({
      uri,
      kind:        t,
      derivedFrom: props.get(`${KGX}derivedFrom`) || null,
      starterId:   props.get(`${KGX}starterId`),
      op:          props.get(`${KGX}op`),
      opValue:     props.get(`${KGX}opValue`),
      relTemplate: props.get(`${KGX}relTemplate`),
      relVariant:  props.get(`${KGX}relVariant`),
    });
  }

  if (!bundles.length) throw new Error('parseChainSpec: no bundles in graph');
  const roots = bundles.filter((b) => !b.derivedFrom);
  if (roots.length === 0) throw new Error('parseChainSpec: no root bundle (every bundle has kgx:derivedFrom)');
  if (roots.length > 1)   throw new Error(`parseChainSpec: ${roots.length} root bundles — multi-branch manifests not yet supported`);

  // Walk derivedFrom chain forward. Bounded by bundle count to avoid
  // infinite loops on cycles (which shouldn't happen, but).
  const byPrev = new Map();
  for (const b of bundles) {
    if (!b.derivedFrom) continue;
    if (byPrev.has(b.derivedFrom)) {
      throw new Error(`parseChainSpec: bundle ${b.derivedFrom} has multiple successors — multi-branch manifests not yet supported`);
    }
    byPrev.set(b.derivedFrom, b);
  }

  const ordered = [roots[0]];
  while (ordered.length < bundles.length) {
    const cur  = ordered[ordered.length - 1];
    const next = byPrev.get(cur.uri);
    if (!next) break;
    ordered.push(next);
  }
  if (ordered.length !== bundles.length) {
    throw new Error(`parseChainSpec: walked ${ordered.length} of ${bundles.length} bundles — graph not connected`);
  }

  const steps = ordered.map((b) => {
    if (b.kind === `${KGX}SourceBundle`) {
      if (!b.starterId) throw new Error(`parseChainSpec: SourceBundle ${b.uri} has no kgx:starterId`);
      return { kind: 'starter', id: b.starterId };
    }
    if (b.kind === `${KGX}PivotBundle`) {
      if (!b.relTemplate) throw new Error(`parseChainSpec: PivotBundle ${b.uri} has no kgx:relTemplate`);
      const step = { kind: 'op', op: 'rel-pivot', template: b.relTemplate };
      if (b.relVariant !== undefined) step.variant = b.relVariant;
      return step;
    }
    // FilterBundle / AugmentBundle — both carry kgx:op (+ optional kgx:opValue).
    if (!b.op) throw new Error(`parseChainSpec: ${b.kind.split('/').pop()} ${b.uri} has no kgx:op`);
    const step = { kind: 'op', op: b.op };
    if (b.opValue !== undefined) step.value = b.opValue;
    return step;
  });

  const spec = { steps };
  if (title !== undefined) spec.title = title;
  if (sub   !== undefined) spec.sub   = sub;
  if (id    !== undefined) spec.id    = id;
  if (ts    !== undefined) spec._ts   = ts;
  return spec;
}
