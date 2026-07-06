// kgx-core.mjs — the Daisychain 1.0 DAL (data access layer) in JavaScript.
//
// Operates on the SPEC JSON produced by kgx_chain.py --json (the same
// Python that runs under Pyodide in pythonchain.html). The spec is the
// interchange boundary between the implementations:
//
//     TriG --(Python/rdflib: load)--> spec JSON --(JS or Python: plan)-->
//     {endpoint, sparql} --(JS or Python: run)--> SPARQL results JSON
//
// Both implementations MUST produce byte-identical plans for the same
// (spec, bead) input — tests/test_kgx_conformance.sh enforces this over
// every chain in demos/python-interop/examples/. If you change plan
// output here, change kgx_chain.py the same way (and vice versa).
//
// Environment: browser AND Node (no DOM access, fetch injectable).
// Spec: docs/kgx/daisychain-1.0.md

export const DAISYCHAIN_VERSION = '1.0';

// Prefixes the planner may prepend to a fused query. INSERTION ORDER
// MATTERS — the Python port iterates the same order so plans compare
// byte-identical.
export const KNOWN_PREFIXES = {
  wd:     'http://www.wikidata.org/entity/',
  wdt:    'http://www.wikidata.org/prop/direct/',
  p:      'http://www.wikidata.org/prop/',
  ps:     'http://www.wikidata.org/prop/statement/',
  pq:     'http://www.wikidata.org/prop/qualifier/',
  pqv:    'http://www.wikidata.org/prop/qualifier/value/',
  psv:    'http://www.wikidata.org/prop/statement/value/',
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
  owl:    'http://www.w3.org/2002/07/owl#',
  xsd:    'http://www.w3.org/2001/XMLSchema#',
  schema: 'https://id.parliament.uk/schema/',     // Parliament DDP
  schemaorg: 'http://schema.org/',
  geo:    'http://www.w3.org/2003/01/geo/wgs84_pos#',
  dct:    'http://purl.org/dc/terms/',
  foaf:   'http://xmlns.com/foaf/0.1/',
};

export function prependPrefixes(sparql) {
  const declared = new Set(
    [...sparql.matchAll(/PREFIX\s+(\w+):/gi)].map(m => m[1].toLowerCase())
  );
  // Which prefixes does the body USE (via `prefix:local` tokens, excluding
  // those inside <…> IRIs and "…" literals)?
  const stripped = sparql.replace(/<[^>]*>/g, ' ').replace(/"[^"]*"/g, ' ');
  const used = new Set();
  for (const px of Object.keys(KNOWN_PREFIXES)) {
    const re = new RegExp(`\\b${px}:`);
    if (re.test(stripped)) used.add(px);
  }
  const toAdd = [...used].filter(px => !declared.has(px.toLowerCase()));
  if (!toAdd.length) return sparql;
  return toAdd.map(px => `PREFIX ${px}: <${KNOWN_PREFIXES[px]}>`).join('\n') + '\n' + sparql;
}

// ---------------------------------------------------------------------------
// Spec navigation
// ---------------------------------------------------------------------------

export function allNodes(spec) {
  if (spec.dag)      return spec.dag;
  if (spec.steps)    return spec.steps;
  if (spec.branches) return spec.branches.flatMap(b => b.steps);
  return [];
}

// Resolve a bead reference: full URI, ':<suffix>' / '<suffix>' tail
// match, or 'last' (final node in spec traversal order).
export function resolveBead(spec, ref) {
  const nodes = allNodes(spec);
  if (!nodes.length) return null;
  if (ref === 'last' || ref === undefined || ref === null) {
    return nodes[nodes.length - 1];
  }
  let hit = nodes.find(n => n.uri === ref);
  if (hit) return hit;
  const tail = ref.startsWith(':') ? ref : ':' + ref;
  hit = nodes.find(n => (n.uri || '').endsWith(tail));
  return hit || null;
}

// ---------------------------------------------------------------------------
// plan — the optimising interpreter's fragment fusion
// ---------------------------------------------------------------------------

// Bead kinds whose kgx:sparqlFragment composes into one SPARQL body.
// Source binds ?p; Filter adds a positive constraint; Pivot walks to a
// fresh ?pN and rebinds. Augment carries a full kgx:sparql (with
// VALUES) that is its own query, so it can't be inlined.
const FUSABLE = new Set(['SourceBundle', 'FilterBundle', 'PivotBundle']);

// Walk the input edges back from `bead`, collecting every transitively
// upstream fusable bead on the SAME endpoint, upstream-first.
export function cumulativeBeads(spec, bead) {
  const endpoint = bead.grounding?.endpoint;
  if (!endpoint) return [bead];
  const byUri = new Map(allNodes(spec).map(n => [n.uri, n]));
  const visited = new Set();
  const collected = [];

  function walk(n) {
    if (visited.has(n.uri)) return;
    visited.add(n.uri);
    if (!FUSABLE.has(n.kind_kgx)) return;
    if (n.grounding?.endpoint !== endpoint) return;
    if (!n.grounding?.sparqlFragment) return;
    for (const e of (n.inputs || [])) {
      const parent = byUri.get(e.iri);
      if (parent) walk(parent);
    }
    collected.push(n);
  }
  walk(bead);
  return collected;
}

// plan(spec, beadRef) → {endpoint, sparql, beads} — the executable
// interpretation of "the chain up to and including this bead".
// SELECT DISTINCT suppresses join-multiplicity duplicates.
export function planBead(spec, beadRef, { limit = 50 } = {}) {
  const bead = resolveBead(spec, beadRef);
  if (!bead) throw new Error(`bead not found: ${beadRef}`);
  const g = bead.grounding || {};
  if (!g.endpoint) throw new Error(`bead has no endpoint: ${bead.uri}`);

  // Augment beads carry a full kgx:sparql — the plan IS that query.
  if (g.sparql && !g.sparqlFragment) {
    return {
      endpoint: g.endpoint,
      sparql: prependPrefixes(g.sparql),
      beads: [bead.uri],
    };
  }
  if (!g.sparqlFragment) throw new Error(`bead has no sparqlFragment: ${bead.uri}`);

  const chain = cumulativeBeads(spec, bead);
  const fused =
    'SELECT DISTINCT * WHERE {\n' +
    chain.map(b => '  ' + b.grounding.sparqlFragment).join('\n') +
    `\n} LIMIT ${limit}`;
  return {
    endpoint: g.endpoint,
    sparql: prependPrefixes(fused),
    beads: chain.map(b => b.uri),
  };
}

// ---------------------------------------------------------------------------
// run — execute a plan against its endpoint
// ---------------------------------------------------------------------------

export async function runPlan(plan, { fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) throw new Error('no fetch available — pass fetchImpl');
  const url = plan.endpoint + (plan.endpoint.includes('?') ? '&' : '?') +
              'query=' + encodeURIComponent(plan.sparql);
  const r = await f(url, { headers: { accept: 'application/sparql-results+json' } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error(`HTTP ${r.status} from ${plan.endpoint}`);
    err.status = r.status;
    err.body = body.slice(0, 500);
    throw err;
  }
  return r.json();
}

// ---------------------------------------------------------------------------
// validate — structural checks on a spec
// ---------------------------------------------------------------------------

export function validateSpec(spec) {
  const issues = [];
  const nodes = allNodes(spec);
  if (!nodes.length) issues.push({ level: 'error', msg: 'spec has no beads' });
  const uris = new Set(nodes.map(n => n.uri));
  for (const n of nodes) {
    for (const e of (n.inputs || [])) {
      if (!uris.has(e.iri)) {
        issues.push({ level: 'error', msg: `unresolved input ${e.iri} on ${n.uri}` });
      }
    }
    if (n.grounded === 'ungrounded') {
      issues.push({ level: 'warn', msg: `ungrounded bead ${n.uri}` });
    }
  }
  return { ok: !issues.some(i => i.level === 'error'), issues };
}
