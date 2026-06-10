// Unit tests for the augment op registry —
// demos/parliament-live/web/kgx/lib/augment.mjs.
//
// Pure: no network. The SPARQL hygiene gates that ride on
// rel-templates + starters apply here too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { AUGMENT_OPS, effectiveWikidataUri } from '../../demos/parliament-live/web/kgx/lib/augment.mjs';
import { assertNoAliasCollisions } from
  '../../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KGX = path.join(__dirname, '..', '..', 'bin', 'kgx.mjs');

function runKgx(args) {
  try {
    return { ok: true, stdout: execFileSync('node', [KGX, ...args], { encoding: 'utf8', timeout: 15_000 }), code: 0 };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', code: e.status };
  }
}

const VALID_ROLES = new Set(['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']);

const QID_ITEMS  = [{ uri: 'http://www.wikidata.org/entity/Q9682' }];
const MNIS_ITEMS = [{ uri: 'urn:fpkg:x', mpid: '4001' }];

function dummyItemsFor(aug) {
  if (aug.id === 'identity-bridge') return MNIS_ITEMS;
  return QID_ITEMS;
}

const VALID_KINDS = new Set(['enrich', 'federate']);

test('every AUGMENT_OP has the declarative-plan fields + role + kind', () => {
  for (const [id, aug] of Object.entries(AUGMENT_OPS)) {
    assert.equal(aug.id, id,                          `${id}: id mismatch`);
    assert.ok(typeof aug.engineId === 'string',       `${id}: no engineId`);
    assert.equal(typeof aug.requires, 'function',     `${id}: requires() missing`);
    assert.equal(typeof aug.query,    'function',     `${id}: query() missing`);
    assert.equal(typeof aug.parse,    'function',     `${id}: parse() missing`);
    assert.ok(typeof aug.note === 'string',           `${id}: no note`);
    assert.ok(VALID_ROLES.has(aug.role),
      `${id}: role="${aug.role}" not in {${[...VALID_ROLES].join(', ')}}`);
    assert.ok(VALID_KINDS.has(aug.kind),
      `${id}: kind="${aug.kind}" not in {${[...VALID_KINDS].join(', ')}}`);
    if (aug.kind === 'federate') {
      assert.ok(typeof aug.joinKey === 'string' && aug.joinKey.length,
        `${id}: federate ops must declare a joinKey`);
    }
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

test('effectiveWikidataUri: native QID OR bridged QID OR null', () => {
  // Native: item's own URI is already a Wikidata QID (QLever-seeded chains).
  assert.equal(
    effectiveWikidataUri({ uri: 'http://www.wikidata.org/entity/Q9682' }),
    'http://www.wikidata.org/entity/Q9682');

  // Bridged: parl-current-mps item with a DDP URI; identity-bridge has set
  // extra.identity.wikidataQid. enrich must follow the bridge to enrich
  // Wikidata facets without forging the item's primary URI.
  assert.equal(
    effectiveWikidataUri({
      uri: 'https://id.parliament.uk/abc123',
      extra: { identity: { wikidataQid: 'http://www.wikidata.org/entity/Q42' } },
    }),
    'http://www.wikidata.org/entity/Q42');

  // No QID, no bridge → null (enrich requires() returns false for the bundle).
  assert.equal(
    effectiveWikidataUri({ uri: 'https://id.parliament.uk/xyz789' }),
    null);
  assert.equal(effectiveWikidataUri({}),            null);
  assert.equal(effectiveWikidataUri({ extra: {} }), null);
});

test('enrich.requires() admits the identity-bridge case (DDP URI + extra.identity.wikidataQid)', () => {
  // The Tory MPs chain bug: parl-current-mps items have DDP URIs, not QIDs;
  // after `bridge`, extra.identity.wikidataQid is set. Pre-fix enrich
  // returned false here and rejected the bundle.
  const bridged = { items: [{
    uri: 'https://id.parliament.uk/abc123',
    extra: { identity: { wikidataQid: 'http://www.wikidata.org/entity/Q42' } },
  }] };
  assert.equal(AUGMENT_OPS.enrich.requires(bridged), true);

  // And query() must emit the bridged QID, not the DDP URI, in VALUES.
  const sparql = AUGMENT_OPS.enrich.query(bridged.items);
  assert.match(sparql, /<http:\/\/www\.wikidata\.org\/entity\/Q42>/);
  assert.doesNotMatch(sparql, /id\.parliament\.uk/);
});

// ---------------------------------------------------------------------------
// applicableTo — the declarative twin of the page's relevant(b) closures,
// used by `kgx chain candidates` to filter augments by upstream bundle type.
// Mirrors the OP_FIELDS guards in kgx-restrict.test.mjs.
// ---------------------------------------------------------------------------

test('every AUGMENT_OP declares applicableTo with at least one type', () => {
  for (const [id, aug] of Object.entries(AUGMENT_OPS)) {
    assert.ok(aug.applicableTo, `${id}: missing applicableTo`);
    assert.ok(Array.isArray(aug.applicableTo.types) && aug.applicableTo.types.length > 0,
      `${id}: applicableTo must declare at least one bundle type`);
  }
});

test('every applicableTo type is one the daisychain actually produces', () => {
  // Same allowlist as the OP_FIELDS guard in kgx-restrict.test.mjs: the
  // page's per-type OPS palette plus the generic Wikidata bundle types
  // pivots emit. A typo here ('humn') would silently hide the op from
  // `kgx chain candidates` for every type — catch it now.
  const KNOWN = new Set([
    'human', 'constituency', 'party', 'appg', 'formal_body', 'concept', 'si',
    'wd_thing', 'wd_class', 'building', 'place', 'org',
  ]);
  for (const [id, { applicableTo }] of Object.entries(AUGMENT_OPS)) {
    for (const t of applicableTo.types) {
      assert.ok(KNOWN.has(t), `op "${id}" declares unknown bundle type "${t}"`);
    }
    // Field lists, when present, must be non-empty string arrays.
    for (const key of ['requiresFields', 'anyOfFields']) {
      const fields = applicableTo[key];
      if (fields === undefined) continue;
      assert.ok(Array.isArray(fields) && fields.length > 0 &&
        fields.every((f) => typeof f === 'string'),
        `op "${id}": applicableTo.${key} must be a non-empty string array`);
    }
    if (applicableTo.uriPattern !== undefined) {
      assert.ok(typeof applicableTo.uriPattern === 'string' && applicableTo.uriPattern.length,
        `op "${id}": applicableTo.uriPattern must be a non-empty string`);
      // Documented pattern, but it must at least compile as a RegExp.
      assert.doesNotThrow(() => new RegExp(applicableTo.uriPattern),
        `op "${id}": applicableTo.uriPattern is not a valid regex`);
    }
  }
});

test('applicableTo gates mirror the page relevant(b) closures', () => {
  // enrich: human bundle with Q-URIs (no field gate on the page).
  assert.deepEqual(AUGMENT_OPS.enrich.applicableTo,
    { types: ['human'], uriPattern: 'Q\\d+$' });
  // parl-enrich: Q-URI AND (sitting || mpid).
  assert.deepEqual(AUGMENT_OPS['parl-enrich'].applicableTo,
    { types: ['human'], uriPattern: 'Q\\d+$', anyOfFields: ['sitting', 'mpid'] });
  // identity-bridge: items with mpid.
  assert.deepEqual(AUGMENT_OPS['identity-bridge'].applicableTo,
    { types: ['human'], requiresFields: ['mpid'] });
});

// ---------------------------------------------------------------------------
// `kgx chain candidates` — augments are filtered by applicableTo.types by
// default; `--all` restores the blind registry dump.
// ---------------------------------------------------------------------------

test('chain candidates --type human surfaces all augments with applicableTo', () => {
  const r = runKgx(['chain', 'candidates', '--type', 'human']);
  assert.equal(r.code, 0, r.stderr || r.stdout);
  const o = JSON.parse(r.stdout);
  assert.equal(o.augmentsFiltered, true);
  assert.deepEqual(o.augmentOps.map((a) => a.id).sort(),
    Object.keys(AUGMENT_OPS).sort());
  for (const a of o.augmentOps) {
    assert.ok(a.applicableTo && Array.isArray(a.applicableTo.types),
      `${a.id}: candidates output must carry applicableTo`);
    assert.ok(a.applicableTo.types.includes('human'),
      `${a.id}: surfaced on human but does not declare it`);
  }
});

test('chain candidates --type si surfaces NO augments (all three are human-only)', () => {
  const r = runKgx(['chain', 'candidates', '--type', 'si']);
  assert.equal(r.code, 0, r.stderr || r.stdout);
  const o = JSON.parse(r.stdout);
  assert.deepEqual(o.augmentOps, []);
});

test('chain candidates --type si --all restores the blind augment dump', () => {
  const r = runKgx(['chain', 'candidates', '--type', 'si', '--all']);
  assert.equal(r.code, 0, r.stderr || r.stdout);
  const o = JSON.parse(r.stdout);
  assert.equal(o.augmentsFiltered, false);
  assert.deepEqual(o.augmentOps.map((a) => a.id).sort(),
    Object.keys(AUGMENT_OPS).sort());
});
