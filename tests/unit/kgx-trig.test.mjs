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
  assert.throws(() => chainToTrig({}),                 /no steps/);
  assert.throws(() => chainToTrig({ steps: [] }),      /no steps/);
});

test('chainToTrig serialises every LIBRARY entry without throwing', () => {
  for (const chain of LIBRARY) {
    assert.doesNotThrow(() => chainToTrig(chain, { graphIri: FIXED_GRAPH }),
      `${chain.id}: chainToTrig threw`);
  }
});
