// Unit tests for the augment op registry —
// demos/parliament-live/web/kgx/lib/augment.mjs.
//
// Pure: no network. The SPARQL hygiene gates that ride on
// rel-templates + starters apply here too.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AUGMENT_OPS } from '../../demos/parliament-live/web/kgx/lib/augment.mjs';
import { assertNoAliasCollisions } from
  '../../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';

const VALID_ROLES = new Set(['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']);

const QID_ITEMS  = [{ uri: 'http://www.wikidata.org/entity/Q9682' }];
const MNIS_ITEMS = [{ uri: 'urn:fpkg:x', mpid: '4001' }];

function dummyItemsFor(aug) {
  if (aug.id === 'identity-bridge') return MNIS_ITEMS;
  return QID_ITEMS;
}

test('every AUGMENT_OP has the declarative-plan fields + a source role', () => {
  for (const [id, aug] of Object.entries(AUGMENT_OPS)) {
    assert.equal(aug.id, id,                          `${id}: id mismatch`);
    assert.ok(typeof aug.engineId === 'string',       `${id}: no engineId`);
    assert.equal(typeof aug.requires, 'function',     `${id}: requires() missing`);
    assert.equal(typeof aug.query,    'function',     `${id}: query() missing`);
    assert.equal(typeof aug.parse,    'function',     `${id}: parse() missing`);
    assert.ok(typeof aug.note === 'string',           `${id}: no note`);
    assert.ok(VALID_ROLES.has(aug.role),
      `${id}: role="${aug.role}" not in {${[...VALID_ROLES].join(', ')}}`);
    assert.ok(typeof aug.cap === 'number' && aug.cap > 0,
      `${id}: cap must be a positive number`);
  }
});

test('every augment.query() returns a non-empty SPARQL string', () => {
  for (const [id, aug] of Object.entries(AUGMENT_OPS)) {
    const items = dummyItemsFor(aug);
    const sparql = aug.query(items);
    assert.equal(typeof sparql, 'string', `${id}: query() must return a string`);
    assert.ok(sparql.trim().length > 0,   `${id}: query() returned empty`);
  }
});

test('every augment.query() passes the §18.2.4.4 alias-collision gate', () => {
  for (const [id, aug] of Object.entries(AUGMENT_OPS)) {
    const items = dummyItemsFor(aug);
    const sparql = aug.query(items);
    assert.doesNotThrow(
      () => assertNoAliasCollisions(sparql, id),
      `${id}: emits a §18.2.4.4 violation`,
    );
  }
});

test('every augment.parse() called on [] returns []', () => {
  for (const [id, aug] of Object.entries(AUGMENT_OPS)) {
    const items = dummyItemsFor(aug);
    const out = aug.parse([], items);
    // Without bindings, parse should leave items unchanged.
    assert.deepEqual(out, items, `${id}: parse([]) should preserve items`);
  }
});

test('enrich + parl-enrich expect Wikidata QID URIs; identity-bridge expects .mpid', () => {
  // requires() rejects bundles that don't carry the right key.
  const emptyHumans = { items: [{ uri: 'urn:x' }] };
  assert.equal(AUGMENT_OPS.enrich.requires(emptyHumans),          false);
  assert.equal(AUGMENT_OPS['parl-enrich'].requires(emptyHumans),  false);
  assert.equal(AUGMENT_OPS['identity-bridge'].requires(emptyHumans), false);

  const sittingWithMpid = { items: [{ uri: 'http://www.wikidata.org/entity/Q1', sitting: true, mpid: '1' }] };
  assert.equal(AUGMENT_OPS.enrich.requires(sittingWithMpid),          true);
  assert.equal(AUGMENT_OPS['parl-enrich'].requires(sittingWithMpid),  true);
  assert.equal(AUGMENT_OPS['identity-bridge'].requires(sittingWithMpid), true);
});
