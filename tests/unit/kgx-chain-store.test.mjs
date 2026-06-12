// Pure unit tests for the chain-store SPARQL helpers. No live Oxigraph
// dependency — the helpers are string assembly + bindings parsing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  flowIriOfTrig, buildSaveUpdate, buildListQuery, parseChainList, buildLoadQuery,
  buildLoadSelectQuery, parseChainSpec,
} from '../../demos/parliament-live/web/kgx/lib/chain-store.mjs';
import { chainToTrig } from '../../demos/parliament-live/web/kgx/lib/trig.mjs';

const flatSpec = {
  title: 'Demo chain',
  steps: [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'sitting' },
  ],
};

test('flowIriOfTrig — extracts the chain graph IRI a manifest carries', () => {
  const trig = chainToTrig(flatSpec);
  const iri = flowIriOfTrig(trig);
  assert.ok(/^urn:kgx:chain:/.test(iri), `expected urn:kgx:chain:…, got ${iri}`);
});

test('flowIriOfTrig — null on a manifest without one (defensive)', () => {
  assert.equal(flowIriOfTrig('@prefix dct: <http://purl.org/dc/terms/> .'), null);
  assert.equal(flowIriOfTrig(''),   null);
  assert.equal(flowIriOfTrig(null), null);
});

test('buildSaveUpdate — produces DROP SILENT + INSERT DATA into the correct GRAPH', () => {
  const trig = chainToTrig(flatSpec);
  const upd  = buildSaveUpdate(trig);
  const flow = flowIriOfTrig(trig);
  assert.match(upd, /^PREFIX kgx:/m,             'must hoist the @prefix lines to SPARQL PREFIX form');
  assert.match(upd, new RegExp(`DROP SILENT GRAPH <${flow}>`),
    'must DROP the graph first so re-save is a clean replace');
  assert.match(upd, new RegExp(`INSERT DATA \\{\\s*GRAPH <${flow}>`),
    'must INSERT DATA into the same named graph');
  // The manifest's dct:title triple should survive into the inner block.
  assert.match(upd, /dct:title "Demo chain"/);
  assert.doesNotMatch(upd, /^@prefix/m, 'no stray @prefix lines should remain in the update');
});

test('buildSaveUpdate — throws when there is no chain IRI', () => {
  assert.throws(() => buildSaveUpdate('not a trig manifest'),
    /no urn:kgx:chain: IRI in manifest/);
});

test('buildSaveUpdate — throws when the TriG body is malformed', () => {
  // Only the prefix block, no graph body. The save would write nothing,
  // so we'd rather error than silently no-op.
  const bad = chainToTrig(flatSpec).replace(/\{[\s\S]*\}/, '');
  assert.throws(() => buildSaveUpdate(bad),
    /TriG body must end with <chainIri> \{ \.\.\. \}/);
});

test('buildListQuery — a SPARQL SELECT keyed on the chain IRI prefix', () => {
  const q = buildListQuery();
  assert.match(q, /SELECT \?flow \?title \?id \?ts/);
  assert.match(q, /STRSTARTS\(STR\(\?flow\), "urn:kgx:chain:"\)/,
    'filter must scope to chain graphs (urn:kgx:chain:<uuid>)');
  assert.match(q, /ORDER BY DESC\(\?ts\) \?title/,
    'newest first; title as tiebreaker for chains without a ts');
});

test('parseChainList — pulls plain {flowIri,title,id,ts} from bindings', () => {
  const bindings = [
    { flow: { value: 'urn:kgx:chain:1' }, title: { value: 'A' }, id: { value: 'a-id' }, ts: { value: '2026-01-01' } },
    { flow: { value: 'urn:kgx:chain:2' }, title: { value: 'B' } },
  ];
  const out = parseChainList(bindings);
  assert.deepEqual(out, [
    { flowIri: 'urn:kgx:chain:1', title: 'A', id: 'a-id', ts: '2026-01-01' },
    { flowIri: 'urn:kgx:chain:2', title: 'B', id: null,   ts: null },
  ]);
});

test('parseChainList — survives empty + null inputs', () => {
  assert.deepEqual(parseChainList(null), []);
  assert.deepEqual(parseChainList([]),   []);
});

test('buildLoadQuery — CONSTRUCT all triples in the named graph', () => {
  const flow = 'urn:kgx:chain:abc-123';
  const q = buildLoadQuery(flow);
  assert.match(q, new RegExp(`GRAPH <${flow}>`));
  assert.match(q, /CONSTRUCT \{ \?s \?p \?o \}/);
});

test('buildLoadQuery — refuses non-flow IRIs', () => {
  assert.throws(() => buildLoadQuery('http://example.org/foo'),
    /not a chain IRI/);
});

// ---------------------------------------------------------------------------
// buildLoadSelectQuery + parseChainSpec — the chain rehydrate path used by
// the page's _loadChainFromStore. SELECT every quad in the chain graph,
// parse bundles back into a spec by walking kgx:derivedFrom.
// ---------------------------------------------------------------------------

const KGX = 'urn:kgx:vocab:';
const DCT = 'http://purl.org/dc/terms/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

// Mimic the SELECT ?s ?p ?o JSON shape that Oxigraph hands back: each
// binding is { s: {value}, p: {value}, o: {value} }. Tiny helper so the
// test cases below stay readable.
function row(s, p, o) {
  return { s: { value: s }, p: { value: p }, o: { value: o } };
}

test('buildLoadSelectQuery — SELECT ?s ?p ?o scoped to the chain graph', () => {
  const q = buildLoadSelectQuery('urn:kgx:chain:abc');
  assert.match(q, /SELECT \?s \?p \?o/);
  assert.match(q, /GRAPH <urn:kgx:chain:abc>/);
});

test('buildLoadSelectQuery — refuses non-flow IRIs', () => {
  assert.throws(() => buildLoadSelectQuery('http://example.org/foo'),
    /not a chain IRI/);
  assert.throws(() => buildLoadSelectQuery(''),     /not a chain IRI/);
  assert.throws(() => buildLoadSelectQuery(null),   /not a chain IRI/);
});

test('parseChainSpec — recovers the canonical linear chain from a flat bindings list', () => {
  const flow = 'urn:kgx:chain:test-1';
  const b0 = 'urn:kgx:test-bundle/b0';
  const b1 = 'urn:kgx:test-bundle/b1';
  const b2 = 'urn:kgx:test-bundle/b2';
  const bindings = [
    // Chain metadata
    row(flow, `${DCT}title`,       'Sitting Labour MPs'),
    row(flow, `${DCT}description`, 'Seed → Labour → sitting'),
    row(flow, `${DCT}identifier`,  'sample'),
    // b0 — source
    row(b0,  RDF_TYPE,           `${KGX}SourceBundle`),
    row(b0,  `${KGX}starterId`,  'uk-mps-1900'),
    // b1 — filter party=Labour Party, derived from b0
    row(b1,  RDF_TYPE,           `${KGX}FilterBundle`),
    row(b1,  `${KGX}derivedFrom`, b0),
    row(b1,  `${KGX}op`,         'party'),
    row(b1,  `${KGX}opValue`,    'Labour Party'),
    // b2 — filter sitting, derived from b1
    row(b2,  RDF_TYPE,           `${KGX}FilterBundle`),
    row(b2,  `${KGX}derivedFrom`, b1),
    row(b2,  `${KGX}op`,         'sitting'),
  ];
  const spec = parseChainSpec(bindings, flow);
  assert.equal(spec.title, 'Sitting Labour MPs');
  assert.equal(spec.sub,   'Seed → Labour → sitting');
  assert.equal(spec.id,    'sample');
  assert.deepEqual(spec.steps, [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'party', value: 'Labour Party' },
    { kind: 'op', op: 'sitting' },
  ]);
});

test('parseChainSpec — handles PivotBundle (relTemplate + relVariant)', () => {
  const flow = 'urn:kgx:chain:test-2';
  const b0 = 'urn:kgx:test-bundle/b0';
  const b1 = 'urn:kgx:test-bundle/b1';
  const bindings = [
    row(b0, RDF_TYPE,            `${KGX}SourceBundle`),
    row(b0, `${KGX}starterId`,   'uk-mps-1900'),
    row(b1, RDF_TYPE,            `${KGX}PivotBundle`),
    row(b1, `${KGX}derivedFrom`,  b0),
    row(b1, `${KGX}relTemplate`, 'children'),
    row(b1, `${KGX}relVariant`,  'family'),
  ];
  const spec = parseChainSpec(bindings, flow);
  assert.deepEqual(spec.steps, [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'rel-pivot', template: 'children', variant: 'family' },
  ]);
});

test('parseChainSpec — recovers AugmentBundle steps (enrich / parl-enrich / identity-bridge)', () => {
  const flow = 'urn:kgx:chain:test-3';
  const b0 = 'urn:kgx:test-bundle/b0';
  const b1 = 'urn:kgx:test-bundle/b1';
  const bindings = [
    row(b0, RDF_TYPE,            `${KGX}SourceBundle`),
    row(b0, `${KGX}starterId`,   'uk-mps-1900'),
    row(b1, RDF_TYPE,            `${KGX}AugmentBundle`),
    row(b1, `${KGX}derivedFrom`,  b0),
    row(b1, `${KGX}op`,          'enrich'),
  ];
  const spec = parseChainSpec(bindings, flow);
  assert.deepEqual(spec.steps[1], { kind: 'op', op: 'enrich' });
});

test('parseChainSpec — walks derivedFrom regardless of bindings order', () => {
  // Oxigraph doesn't guarantee any order; parser must topo-sort.
  const flow = 'urn:kgx:chain:test-4';
  const b0 = 'urn:kgx:test-bundle/b0';
  const b1 = 'urn:kgx:test-bundle/b1';
  const b2 = 'urn:kgx:test-bundle/b2';
  const bindings = [
    row(b2, `${KGX}op`,           'sitting'),
    row(b1, `${KGX}derivedFrom`,   b0),
    row(b2, RDF_TYPE,             `${KGX}FilterBundle`),
    row(b0, `${KGX}starterId`,    'uk-mps-1900'),
    row(b2, `${KGX}derivedFrom`,   b1),
    row(b0, RDF_TYPE,             `${KGX}SourceBundle`),
    row(b1, `${KGX}op`,           'party'),
    row(b1, `${KGX}opValue`,      'Labour Party'),
    row(b1, RDF_TYPE,             `${KGX}FilterBundle`),
  ];
  const spec = parseChainSpec(bindings, flow);
  assert.deepEqual(spec.steps.map((s) => s.kind === 'starter' ? s.id : s.op),
    ['uk-mps-1900', 'party', 'sitting']);
});

test('parseChainSpec — refuses unrooted, multi-rooted, or disconnected single-branch graphs', () => {
  const flow = 'urn:kgx:chain:test-bad';
  // No bundles
  assert.throws(() => parseChainSpec([], flow), /no bundles/);
  // Two source bundles with no derivedFrom and no kgx:branch tags. The
  // single-branch path triggers, finds two roots, refuses with a hint
  // that the manifest needs kgx:branch / kgx:activeBranch to be parsed
  // as multi-branch.
  assert.throws(() => parseChainSpec([
    row('urn:kgx:test-bundle/x', RDF_TYPE, `${KGX}SourceBundle`),
    row('urn:kgx:test-bundle/y', RDF_TYPE, `${KGX}SourceBundle`),
  ], flow), /multi-branch/);
  // Two bundles, both with derivedFrom pointing nowhere meaningful — no root
  assert.throws(() => parseChainSpec([
    row('urn:kgx:test-bundle/x', RDF_TYPE, `${KGX}FilterBundle`),
    row('urn:kgx:test-bundle/x', `${KGX}derivedFrom`, 'urn:kgx:test-bundle/missing'),
    row('urn:kgx:test-bundle/y', RDF_TYPE, `${KGX}FilterBundle`),
    row('urn:kgx:test-bundle/y', `${KGX}derivedFrom`, 'urn:kgx:test-bundle/missing'),
  ], flow), /no root bundle/);
});

test('parseChainSpec — requires a flowIri', () => {
  assert.throws(() => parseChainSpec([], null),      /flowIri required/);
  assert.throws(() => parseChainSpec([], undefined), /flowIri required/);
});

test('chainToTrig + parseChainSpec round-trip: multi-branch (fork) chain', () => {
  // The library's `fork-demo` shape: main = 3 steps, with-bp = 1 step
  // forked from main at beadIdx=2. Round-trip must recover both
  // branches, the forkedFrom link, and the activeBranch pointer.
  const fork = {
    title: 'Fork demo',
    sub:   'main → birthplaces',
    id:    'fork-demo',
    activeBranch: 'with-bp',
    branches: [
      {
        id: 'main',
        steps: [
          { kind: 'starter', id: 'uk-mps-1900' },
          { kind: 'op', op: 'party', value: 'Labour Party' },
          { kind: 'op', op: 'sitting' },
        ],
      },
      {
        id: 'with-bp',
        forkedFrom: { branch: 'main', beadIdx: 2 },
        steps: [
          { kind: 'op', op: 'rel-pivot', template: 'birthplaces', variant: 'default' },
        ],
      },
    ],
  };
  const flow = 'urn:kgx:chain:rt-fork';
  const trig = chainToTrig(fork, { graphIri: `<${flow}>` });
  const bindings = trigToFlatBindings(trig, flow);
  const out = parseChainSpec(bindings, flow);

  assert.equal(out.title,        fork.title);
  assert.equal(out.sub,          fork.sub);
  assert.equal(out.id,           fork.id);
  assert.equal(out.activeBranch, fork.activeBranch);

  // Compare branches structurally (order in branches[] is not contract).
  const sortById = (xs) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sortById(out.branches), sortById(fork.branches));
});

test('parseChainSpec — refuses a multi-branch manifest with an untagged bundle', () => {
  // If kgx:activeBranch is on the chain graph but a bundle is missing
  // its kgx:branch tag, the manifest is malformed — refuse loudly.
  const flow = 'urn:kgx:chain:bad-multi';
  const b0 = 'urn:kgx:test-bundle/b0';
  const bindings = [
    row(flow, `${KGX}activeBranch`, 'main'),
    row(b0, RDF_TYPE, `${KGX}SourceBundle`),
    row(b0, `${KGX}starterId`, 'uk-mps-1900'),
    // no kgx:branch on b0
  ];
  assert.throws(() => parseChainSpec(bindings, flow),
    /missing kgx:branch tag in a multi-branch manifest/);
});

test('parseChainSpec — refuses a forked branch whose root derives from nothing in scope', () => {
  // The branch root's derivedFrom IRI doesn't appear in any other branch.
  // That's structurally broken; fail rather than emit a half-formed spec.
  const flow = 'urn:kgx:chain:dangling-fork';
  const b0  = 'urn:kgx:test-bundle/b0';
  const ab0 = 'urn:kgx:test-bundle/a/b0';
  const bindings = [
    row(flow, `${KGX}activeBranch`, 'a'),
    // main branch root
    row(b0, RDF_TYPE, `${KGX}SourceBundle`),
    row(b0, `${KGX}starterId`, 'uk-mps-1900'),
    row(b0, `${KGX}branch`, 'main'),
    // a-branch root, derivedFrom an IRI that's not in any branch
    row(ab0, RDF_TYPE, `${KGX}FilterBundle`),
    row(ab0, `${KGX}derivedFrom`, 'urn:kgx:test-bundle/nowhere'),
    row(ab0, `${KGX}branch`, 'a'),
    row(ab0, `${KGX}op`, 'sitting'),
  ];
  assert.throws(() => parseChainSpec(bindings, flow),
    /no other branch contains that bundle/);
});

test('chainToTrig + parseChainSpec round-trip via a flat-bindings extractor', () => {
  // Round-trip the canonical case. The extractor below mirrors the
  // shapes chainToTrig emits exactly; if it ever drifts (new predicate,
  // new term, multi-branch), this test will fail loudly and we know
  // both ends need updating in lockstep.
  const sample = {
    title: 'Sitting Labour MPs',
    sub:   'Seed → Labour → sitting',
    id:    'sample',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
    ],
  };
  const flow = 'urn:kgx:chain:rt-1';
  const trig = chainToTrig(sample, { graphIri: `<${flow}>` });
  const bindings = trigToFlatBindings(trig, flow);
  const out = parseChainSpec(bindings, flow);
  assert.equal(out.title, sample.title);
  assert.equal(out.sub,   sample.sub);
  assert.equal(out.id,    sample.id);
  assert.deepEqual(out.steps, sample.steps);
});

// ---- tiny TriG → bindings extractor scoped to the chainToTrig shape ----
// chainToTrig emits one subject block per line group, predicates in the
// kgx: / dct: / rdf: prefixes, objects as either <IRI>, "literal", or
// "literal"^^xsd:type. That's narrow enough to parse without a real
// Turtle library — we own the writer.
function trigToFlatBindings(trig, flow) {
  const NS = {
    kgx:  'urn:kgx:vocab:',
    dct:  'http://purl.org/dc/terms/',
    rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    prov: 'http://www.w3.org/ns/prov#',
    xsd:  'http://www.w3.org/2001/XMLSchema#',
  };
  const expand = (curieOrIri) => {
    if (curieOrIri.startsWith('<')) return curieOrIri.slice(1, -1);
    if (curieOrIri === 'a')         return `${NS.rdf}type`;
    const m = curieOrIri.match(/^([a-zA-Z]+):(.+)$/);
    if (m && NS[m[1]]) return NS[m[1]] + m[2];
    return curieOrIri;
  };
  const bindings = [];
  let currentSubject = null;
  const lines = trig.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('@prefix')) continue;
    if (line === '}') continue;
    // Graph open: "<urn:kgx:chain:…> {"
    if (/^<[^>]+>\s*\{$/.test(line)) { currentSubject = null; continue; }
    // Subject-headed line: "<iri> pred obj [; ...]" or "<iri> pred obj ."
    // (Catches flow-self statements like `<urn:kgx:chain:…> dct:title "X" .`
    // as well as bundle/run blocks.)
    const subjStart = line.match(/^<([^>]+)>\s+(.+?)\s*([;.])$/);
    if (subjStart) {
      currentSubject = subjStart[1];
      pushPredObj(bindings, currentSubject, subjStart[2], NS);
      if (subjStart[3] === '.') currentSubject = null;
      continue;
    }
    // Continuation line within an open subject block.
    const cont = line.match(/^(.+?)\s*([;.])$/);
    if (cont && currentSubject) {
      pushPredObj(bindings, currentSubject, cont[1], NS);
      if (cont[2] === '.') currentSubject = null;
      continue;
    }
  }
  return bindings;

  function pushPredObj(out, subject, segment, NS) {
    // segment = "predicate object" where object may contain spaces if a
    // quoted literal. Use a simple split on the first whitespace AFTER
    // the predicate token.
    const m = segment.match(/^(\S+)\s+(.+)$/);
    if (!m) return;
    const [, pTok, oTok] = m;
    out.push({
      s: { value: subject },
      p: { value: expand(pTok) },
      o: { value: parseObject(oTok, NS) },
    });
  }
  function parseObject(tok, NS) {
    // <IRI>
    if (tok.startsWith('<') && tok.endsWith('>')) return tok.slice(1, -1);
    // "literal"^^xsd:type — strip the datatype for the SELECT value
    const typed = tok.match(/^"((?:[^"\\]|\\.)*)"\^\^/);
    if (typed) return typed[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    // "literal"
    const lit = tok.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (lit) return lit[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    // Bare token (treat as CURIE)
    if (/^[a-zA-Z]+:/.test(tok)) {
      const [pfx, local] = tok.split(/:(.+)/);
      if (NS[pfx]) return NS[pfx] + local;
    }
    return tok;
  }
}
