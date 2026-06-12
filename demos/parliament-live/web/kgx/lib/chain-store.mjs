// =============================================================================
// kgx/lib/chain-store.mjs — pure helpers for the chain-store endpoint.
//
// The fpkg deployment runs TWO Oxigraph instances:
//   - /kgx/query           — the bundled READ-ONLY parliamentary RDF
//   - /kgx/chains-query    — a writable side store for user-saved chains
//   - /kgx/chains-update   — its SPARQL Update endpoint
//
// Each saved chain lives in its own named graph (urn:kgx:chain:<uuid>),
// with the manifest produced by chainToTrig() forming the entire graph
// content. This module owns the small pure bits — SPARQL string assembly,
// chain IRI extraction, parsing the list of saved chains.
//
// Kept DOM-free so the CLI can adopt it too (kgx chain push / list).
// =============================================================================

const CHAIN_IRI_RE = /<(urn:kgx:chain:[^>]+)>/;

// Extract the chain graph IRI that chainToTrig embeds as the graph
// name. Returns null if the manifest doesn't carry one (shouldn't
// happen — chainToTrig always mints one, but we don't pretend).
// Kept named `flowIriOfTrig` for callers and tests; the value is the
// chain graph IRI (`urn:kgx:chain:<uuid>`).
export function flowIriOfTrig(trig) {
  const m = CHAIN_IRI_RE.exec(String(trig || ''));
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
  if (!flow) throw new Error('buildSaveUpdate: no urn:kgx:chain: IRI in manifest');
  // Strip the @prefix declarations from the TriG and reuse them at the
  // top of the SPARQL Update (SPARQL doesn't accept @prefix; it wants
  // bare PREFIX). The triples block in between stays verbatim.
  const prefixLines = [];
  const trigBody = String(trig).replace(/^@prefix\s+([^\s]+)\s+(<[^>]+>)\s*\.\s*$/gm,
    (_full, name, iri) => { prefixLines.push(`PREFIX ${name} ${iri}`); return ''; });
  // The remaining body should end with `<chainIri> { ... }`. Wrap it in
  // INSERT DATA { GRAPH <chainIri> { ... } }.
  const graphMatch = trigBody.match(/<urn:kgx:chain:[^>]+>\s*\{([\s\S]*)\}\s*$/);
  if (!graphMatch) throw new Error('buildSaveUpdate: TriG body must end with <chainIri> { ... }');
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
  // Filter scopes to chain graphs only, ignoring whatever else might
  // live in the writable Oxigraph.
  return `
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?flow ?title ?id ?ts WHERE {
  GRAPH ?flow {
    ?flow dct:title ?title .
    OPTIONAL { ?flow dct:identifier ?id }
    OPTIONAL { ?flow dct:created    ?ts }
  }
  FILTER(STRSTARTS(STR(?flow), "urn:kgx:chain:"))
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
  if (!/^urn:kgx:chain:/.test(String(flowIri || ''))) {
    throw new Error(`buildLoadQuery: not a chain IRI: ${flowIri}`);
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
  if (!/^urn:kgx:chain:/.test(String(flowIri || ''))) {
    throw new Error(`buildLoadSelectQuery: not a chain IRI: ${flowIri}`);
  }
  return `
SELECT ?s ?p ?o WHERE { GRAPH <${flowIri}> { ?s ?p ?o } }`;
}

// Vocabulary terms — long form, since the bindings come back fully
// expanded.
const KGX        = 'urn:kgx:vocab:';
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

// Convert one parsed bundle (uri, kind, props) into a chain-spec step.
// Pulled out so single-branch and multi-branch paths share it.
function bundleToStep(b) {
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
}

// Topo-walk a set of in-branch bundles starting from the supplied root.
// Refuses disconnected sets and multiple successors (which would only
// happen if the manifest is corrupt or carries unparented forks).
function walkBranchBundles(branchBundles, root) {
  const byPrev = new Map();
  for (const b of branchBundles) {
    if (!b.derivedFrom) continue;
    if (byPrev.has(b.derivedFrom)) {
      throw new Error(`parseChainSpec: bundle ${b.derivedFrom} has multiple successors in the same branch`);
    }
    byPrev.set(b.derivedFrom, b);
  }
  const ordered = [root];
  while (ordered.length < branchBundles.length) {
    const cur  = ordered[ordered.length - 1];
    const next = byPrev.get(cur.uri);
    if (!next) break;
    ordered.push(next);
  }
  if (ordered.length !== branchBundles.length) {
    throw new Error(`parseChainSpec: walked ${ordered.length} of ${branchBundles.length} bundles — branch not connected`);
  }
  return ordered;
}

// Parse SELECT ?s ?p ?o bindings back into a chain spec — the inverse
// of chainToTrig() for both single-branch and multi-branch cases.
//
// Single-valued predicates win (each subject's property map is last-
// write). That matches the manifest shape where every predicate appears
// at most once per bundle. Order is recovered by walking kgx:derivedFrom
// from the root forward, not by trusting any naming convention on
// bundle IRIs.
//
// Multi-branch detection: presence of `kgx:activeBranch` on the chain
// graph self-statement OR any `kgx:branch` tag on a bundle. The shape
// of the returned spec mirrors the normaliser's two accepted inputs —
// `{ steps }` for single-branch, `{ branches, activeBranch }` for the
// tree shape.
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
  const title         = meta.get(DCT_TITLE);
  const sub           = meta.get(DCT_DESC);
  const id            = meta.get(DCT_ID);
  const ts            = meta.get(DCT_CREATED);
  const activeBranch  = meta.get(`${KGX}activeBranch`);

  const bundles = [];
  for (const [uri, props] of bySubj.entries()) {
    const t = props.get(RDF_TYPE);
    if (!BUNDLE_KINDS.has(t)) continue;
    bundles.push({
      uri,
      kind:        t,
      derivedFrom: props.get(`${KGX}derivedFrom`) || null,
      branch:      props.get(`${KGX}branch`)      || null,
      starterId:   props.get(`${KGX}starterId`),
      op:          props.get(`${KGX}op`),
      opValue:     props.get(`${KGX}opValue`),
      relTemplate: props.get(`${KGX}relTemplate`),
      relVariant:  props.get(`${KGX}relVariant`),
    });
  }

  if (!bundles.length) throw new Error('parseChainSpec: no bundles in graph');

  const isMultiBranch = activeBranch !== undefined || bundles.some((b) => b.branch);

  let chainPart;
  if (!isMultiBranch) {
    const roots = bundles.filter((b) => !b.derivedFrom);
    if (roots.length === 0) throw new Error('parseChainSpec: no root bundle (every bundle has kgx:derivedFrom)');
    if (roots.length > 1)   throw new Error(`parseChainSpec: ${roots.length} root bundles — manifest must carry kgx:branch tags or kgx:activeBranch for multi-branch`);
    const ordered = walkBranchBundles(bundles, roots[0]);
    chainPart = { steps: ordered.map(bundleToStep) };
  } else {
    // Multi-branch: group bundles by their `kgx:branch` tag, walk each
    // sub-chain independently, then recover each branch's forkedFrom
    // (parent branch id + bead index) by locating its root's cross-
    // branch predecessor in the parent's ordered bundle list.
    const branchUris = new Map();   // branchId → Set<uri>
    const branchBundles = new Map();// branchId → bundle[]
    for (const b of bundles) {
      if (!b.branch) throw new Error(`parseChainSpec: bundle ${b.uri} missing kgx:branch tag in a multi-branch manifest`);
      if (!branchBundles.has(b.branch)) {
        branchBundles.set(b.branch, []);
        branchUris.set(b.branch, new Set());
      }
      branchBundles.get(b.branch).push(b);
      branchUris.get(b.branch).add(b.uri);
    }
    // Order each branch's bundles by walking derivedFrom from the
    // branch-local root forward. The branch-local root is the bundle
    // whose derivedFrom either is null or is outside this branch.
    const orderedByBranch = new Map();
    for (const [bid, bs] of branchBundles.entries()) {
      const uris = branchUris.get(bid);
      const roots = bs.filter((b) => !b.derivedFrom || !uris.has(b.derivedFrom));
      if (roots.length !== 1) {
        throw new Error(`parseChainSpec: branch "${bid}" has ${roots.length} in-branch roots, expected 1`);
      }
      orderedByBranch.set(bid, walkBranchBundles(bs, roots[0]));
    }
    // Build each branch spec. forkedFrom is reconstructed by finding
    // the parent bundle in some other branch's ordered list.
    const branches = [];
    for (const [bid, ordered] of orderedByBranch.entries()) {
      const branchSpec = { id: bid, steps: ordered.map(bundleToStep) };
      const rootDf = ordered[0].derivedFrom;
      if (rootDf) {
        let found = false;
        for (const [pid, pOrdered] of orderedByBranch.entries()) {
          if (pid === bid) continue;
          const idx = pOrdered.findIndex((x) => x.uri === rootDf);
          if (idx >= 0) {
            branchSpec.forkedFrom = { branch: pid, beadIdx: idx };
            found = true;
            break;
          }
        }
        if (!found) {
          throw new Error(`parseChainSpec: branch "${bid}" root derives from ${rootDf} but no other branch contains that bundle`);
        }
      }
      branches.push(branchSpec);
    }
    chainPart = { branches };
    if (activeBranch !== undefined) chainPart.activeBranch = activeBranch;
  }

  const spec = { ...chainPart };
  if (title !== undefined) spec.title = title;
  if (sub   !== undefined) spec.sub   = sub;
  if (id    !== undefined) spec.id    = id;
  if (ts    !== undefined) spec._ts   = ts;
  return spec;
}
