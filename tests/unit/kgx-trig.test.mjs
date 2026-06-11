// Unit tests for the workflow-level TriG serialiser —
// demos/parliament-live/web/kgx/lib/trig.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainToTrig } from '../../demos/parliament-live/web/kgx/lib/trig.mjs';
import { LIBRARY }     from '../../demos/parliament-live/web/kgx/lib/library.mjs';

const SAMPLE = {
  id: 'sample',
  title: 'Sitting Labour MPs',
  sub: 'Seed → Labour → sitting',
  steps: [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'party', value: 'Labour Party' },
    { kind: 'op', op: 'sitting' },
  ],
};

const FIXED_GRAPH = '<urn:kgx:flow:fixed-for-test>';

// ---------------------------------------------------------------------------
// shape
// ---------------------------------------------------------------------------

test('chainToTrig emits prefixes + a named graph wrapping bundle triples', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  assert.match(ttl, /@prefix kgx:/);
  assert.match(ttl, /@prefix dct:/);
  assert.match(ttl, new RegExp(FIXED_GRAPH.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + '\\s*{'));
  assert.match(ttl, /}\s*$/);
});

test('chainToTrig does NOT declare the unused kgxs: source prefix', () => {
  // F3 in trig-manifest-review.md: the kgxs: PREFIX was declared but no
  // emitter ever used it. Removing it keeps the manifest header honest.
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  assert.doesNotMatch(ttl, /@prefix kgxs:/);
});

test('chainToTrig writes dct:title / dct:description / dct:identifier when present', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  assert.match(ttl, /dct:title\s+"Sitting Labour MPs"/);
  assert.match(ttl, /dct:description\s+"Seed → Labour → sitting"/);
  assert.match(ttl, /dct:identifier\s+"sample"/);
});

test('chainToTrig assigns the right bundle-kind term per step', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  // step 0 starter → SourceBundle
  assert.match(ttl, /<https:\/\/forgetmenot\.local\/bundle\/b0>\s*a\s*kgx:SourceBundle/);
  // step 1 op:party (a restrict) → FilterBundle
  assert.match(ttl, /<https:\/\/forgetmenot\.local\/bundle\/b1>\s*a\s*kgx:FilterBundle/);
  // step 2 op:sitting → FilterBundle
  assert.match(ttl, /<https:\/\/forgetmenot\.local\/bundle\/b2>\s*a\s*kgx:FilterBundle/);
});

test('chainToTrig threads kgx:derivedFrom between consecutive bundles', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  // b1 derives from b0
  assert.match(ttl,
    /<https:\/\/forgetmenot\.local\/bundle\/b1>[\s\S]*?kgx:derivedFrom\s+<https:\/\/forgetmenot\.local\/bundle\/b0>/);
  // b2 derives from b1
  assert.match(ttl,
    /<https:\/\/forgetmenot\.local\/bundle\/b2>[\s\S]*?kgx:derivedFrom\s+<https:\/\/forgetmenot\.local\/bundle\/b1>/);
});

test('chainToTrig carries op + opValue on filter steps', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  assert.match(ttl, /kgx:op\s+"party"/);
  assert.match(ttl, /kgx:opValue\s+"Labour Party"/);
  assert.match(ttl, /kgx:op\s+"sitting"/);
});

test('chainToTrig carries relTemplate + relVariant on rel-pivot steps', () => {
  const ttl = chainToTrig({
    title: 'children-family',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'rel-pivot', template: 'children', variant: 'family' },
    ],
  }, { graphIri: FIXED_GRAPH });
  assert.match(ttl, /kgx:relTemplate\s+"children"/);
  assert.match(ttl, /kgx:relVariant\s+"family"/);
  // and the bundle type is PivotBundle
  assert.match(ttl, /<https:\/\/forgetmenot\.local\/bundle\/b1>\s*a\s*kgx:PivotBundle/);
});

test('chainToTrig classifies augment ops as AugmentBundle', () => {
  for (const opId of ['enrich', 'parl-enrich', 'identity-bridge']) {
    const ttl = chainToTrig({
      title: `${opId} test`,
      steps: [
        { kind: 'starter', id: 'uk-mps-1900' },
        { kind: 'op', op: opId },
      ],
    }, { graphIri: FIXED_GRAPH });
    assert.match(ttl, /<https:\/\/forgetmenot\.local\/bundle\/b1>\s*a\s*kgx:AugmentBundle/,
      `${opId}: expected AugmentBundle`);
  }
});

test('chainToTrig escapes embedded quotes in titles + values', () => {
  const ttl = chainToTrig({
    title: 'Has "quotes" and a \\backslash',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'A "Tricky" Party' },
    ],
  }, { graphIri: FIXED_GRAPH });
  assert.match(ttl, /dct:title\s+"Has \\"quotes\\" and a \\\\backslash"/);
  assert.match(ttl, /kgx:opValue\s+"A \\"Tricky\\" Party"/);
});

test('chainToTrig throws on an empty / missing-steps spec', () => {
  // Goes through the branch normaliser now; the error text differs by
  // path but both reject empty specs.
  assert.throws(() => chainToTrig({}),                 /declare either `steps` or `branches`/);
  assert.throws(() => chainToTrig({ steps: [] }),      /no steps/);
});

test('chainToTrig serialises every LIBRARY entry without throwing', () => {
  for (const chain of LIBRARY) {
    assert.doesNotThrow(() => chainToTrig(chain, { graphIri: FIXED_GRAPH }),
      `${chain.id}: chainToTrig threw`);
  }
});

// ---------------------------------------------------------------------------
// Execution records: chainToTrig(spec, { beads }) emits prov:Activity / kgx:Run
// per bead, alongside the bundle defs.
// ---------------------------------------------------------------------------

const FAKE_BEADS = [
  { id: 'uk-mps-1900',    kind: 'starter', size: 6917, engineId: 'qlever-wikidata', ms: 1200, bindHash: 'sha256:abc' },
  { id: 'party',          kind: 'op',      size:  120, ms: 4 },
  { id: 'sitting',        kind: 'op',      size:   95, ms: 2 },
];

test('chainToTrig with beads emits prov:Activity per step + kgx:Run typed', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH, beads: FAKE_BEADS });
  // each step has a corresponding run record
  for (let i = 0; i < FAKE_BEADS.length; i++) {
    assert.match(ttl, new RegExp(`<https://forgetmenot\\.local/run/r${i}>\\s+a\\s+prov:Activity, kgx:Run`),
      `expected run record r${i}`);
  }
});

test('chainToTrig run records carry prov:generated → the corresponding bundle', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH, beads: FAKE_BEADS });
  for (let i = 0; i < FAKE_BEADS.length; i++) {
    assert.match(ttl,
      new RegExp(`<https://forgetmenot\\.local/run/r${i}>[\\s\\S]*?prov:generated\\s+<https://forgetmenot\\.local/bundle/b${i}>`),
      `r${i} must prov:generate b${i}`);
  }
});

test('chainToTrig run records carry engineId / durationMs / resultSize / bindHash where present', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH, beads: FAKE_BEADS });
  assert.match(ttl, /kgx:engineId\s+"qlever-wikidata"/);
  assert.match(ttl, /kgx:durationMs\s+"1200"\^\^xsd:integer/);
  assert.match(ttl, /kgx:resultSize\s+"6917"\^\^xsd:integer/);
  assert.match(ttl, /kgx:bindHash\s+"sha256:abc"/);
});

test('chainToTrig run records share a prov:startedAtTime when ranAt is supplied', () => {
  const ranAt = '2026-06-02T18:00:00Z';
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH, beads: FAKE_BEADS, ranAt });
  // every run record carries the timestamp
  const matches = ttl.match(/prov:startedAtTime\s+"2026-06-02T18:00:00Z"\^\^xsd:dateTime/g);
  assert.equal(matches?.length, FAKE_BEADS.length,
    `expected ${FAKE_BEADS.length} prov:startedAtTime occurrences, got ${matches?.length}`);
});

test('chainToTrig without beads does not emit run records', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  assert.equal(/prov:Activity/.test(ttl), false);
  assert.equal(/kgx:Run/.test(ttl), false);
});

// ---------------------------------------------------------------------------
// Multi-branch emission — Phase 1d of the trig-manifest-review.md migration.
// Single-branch chains keep their byte-identical legacy shape (no
// `kgx:branch` tags, no `kgx:activeBranch`); fork chains get them so the
// reader can recover the tree structure.
// ---------------------------------------------------------------------------

const FORK_SPEC = {
  title: 'Fork demo',
  sub:   'main → birthplaces sibling',
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

test('chainToTrig: single-branch chain emits NO kgx:branch / kgx:activeBranch (legacy shape)', () => {
  const ttl = chainToTrig(SAMPLE, { graphIri: FIXED_GRAPH });
  assert.doesNotMatch(ttl, /kgx:branch\b/);
  assert.doesNotMatch(ttl, /kgx:activeBranch\b/);
});

test('chainToTrig: multi-branch chain stamps kgx:activeBranch on the chain graph', () => {
  const ttl = chainToTrig(FORK_SPEC, { graphIri: FIXED_GRAPH });
  assert.match(ttl,
    new RegExp(`${FIXED_GRAPH.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\\s+kgx:activeBranch\\s+"with-bp"`));
});

test('chainToTrig: multi-branch chain tags every bundle with its kgx:branch', () => {
  const ttl = chainToTrig(FORK_SPEC, { graphIri: FIXED_GRAPH });
  // main bundles tagged "main"
  for (let i = 0; i < 3; i++) {
    assert.match(ttl,
      new RegExp(`<https://forgetmenot\\.local/bundle/b${i}>[\\s\\S]*?kgx:branch\\s+"main"`),
      `bundle b${i} should be tagged kgx:branch "main"`);
  }
  // with-bp bundle has its branch-scoped IRI and the with-bp tag
  assert.match(ttl,
    /<https:\/\/forgetmenot\.local\/bundle\/with-bp\/b0>[\s\S]*?kgx:branch\s+"with-bp"/);
});

test('chainToTrig: forked branch derives from the parent at the fork point', () => {
  const ttl = chainToTrig(FORK_SPEC, { graphIri: FIXED_GRAPH });
  // with-bp/b0 derives from main's b2 (forkedFrom.beadIdx=2). The cross-
  // branch derivedFrom IS the fork relation; no separate predicate needed.
  assert.match(ttl,
    /<https:\/\/forgetmenot\.local\/bundle\/with-bp\/b0>[\s\S]*?kgx:derivedFrom\s+<https:\/\/forgetmenot\.local\/bundle\/b2>/);
});
