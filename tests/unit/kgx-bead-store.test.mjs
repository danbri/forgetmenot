// Unit tests for the per-bead quad cache —
// demos/parliament-live/web/kgx/lib/bead-store.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BeadStore } from '../../demos/parliament-live/web/kgx/lib/bead-store.mjs';

const G_ENRICH = 'urn:kgx:bead:test-uuid:enrich';
const G_PARL   = 'urn:kgx:bead:test-uuid:parl-enrich';
const G_BRIDGE = 'urn:kgx:bead:test-uuid:identity-bridge';

const ASHLEY = 'http://www.wikidata.org/entity/Q15986921';
const DOB    = 'urn:kgx:vocab:dob';
const BIRTHPLACE = 'urn:kgx:vocab:birthplace';
const CONSTITUENCY = 'urn:kgx:vocab:parlConstituency';

// ---------------------------------------------------------------------------
// Construction + addQuad
// ---------------------------------------------------------------------------

test('BeadStore: empty store has size 0 and returns empty for any subject', () => {
  const s = new BeadStore();
  assert.equal(s.size(), 0);
  assert.deepEqual(s.propertyOf(ASHLEY, DOB), []);
  assert.deepEqual(s.propertiesOf(ASHLEY),   []);
  assert.deepEqual(s.graphScope(),           []);
});

test('BeadStore: addQuad rejects malformed arguments', () => {
  const s = new BeadStore();
  assert.throws(() => s.addQuad('',     DOB, '1970-01-01', G_ENRICH), /subject must be a non-empty string/);
  assert.throws(() => s.addQuad(ASHLEY, '',  '1970-01-01', G_ENRICH), /predicate must be a non-empty string/);
  assert.throws(() => s.addQuad(ASHLEY, DOB, '1970-01-01', ''),       /graph must be a non-empty string/);
  assert.throws(() => s.addQuad(null,   DOB, '1970-01-01', G_ENRICH), /subject must be a non-empty string/);
});

test('BeadStore: constructor rejects non-BeadStore parents', () => {
  assert.throws(() => new BeadStore({}),   /parent must be a BeadStore or null/);
  assert.throws(() => new BeadStore('p'),  /parent must be a BeadStore or null/);
});

// ---------------------------------------------------------------------------
// Basic property access
// ---------------------------------------------------------------------------

test('BeadStore: propertyOf returns the matching {o, g}', () => {
  const s = new BeadStore();
  s.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);
  const vals = s.propertyOf(ASHLEY, DOB);
  assert.deepEqual(vals, [{ o: '1970-08-14', g: G_ENRICH }]);
});

test('BeadStore: propertyOf returns [] for unknown subject or predicate', () => {
  const s = new BeadStore();
  s.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);
  assert.deepEqual(s.propertyOf('http://example/Other', DOB), []);
  assert.deepEqual(s.propertyOf(ASHLEY, 'urn:kgx:vocab:unknown'), []);
});

test('BeadStore: multiple values for the same (s, p) across DIFFERENT graphs are all returned', () => {
  // Two sources both assert dob; renderer wants both for provenance.
  const s = new BeadStore();
  s.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);
  s.addQuad(ASHLEY, DOB, '1970-08-14', G_PARL);
  const vals = s.propertyOf(ASHLEY, DOB);
  assert.equal(vals.length, 2);
  assert.deepEqual(new Set(vals.map((v) => v.g)), new Set([G_ENRICH, G_PARL]));
});

test('BeadStore: propertiesOf returns every (p, o, g) for a subject', () => {
  const s = new BeadStore();
  s.addQuad(ASHLEY, DOB,          '1970-08-14',                G_ENRICH);
  s.addQuad(ASHLEY, BIRTHPLACE,   'http://www.wikidata.org/entity/Q60', G_ENRICH);
  s.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater',                G_PARL);
  const all = s.propertiesOf(ASHLEY);
  assert.equal(all.length, 3);
  const byP = Object.fromEntries(all.map((t) => [t.p, { o: t.o, g: t.g }]));
  assert.deepEqual(byP[DOB],          { o: '1970-08-14',                      g: G_ENRICH });
  assert.deepEqual(byP[BIRTHPLACE],   { o: 'http://www.wikidata.org/entity/Q60', g: G_ENRICH });
  assert.deepEqual(byP[CONSTITUENCY], { o: 'Bridgwater',                      g: G_PARL   });
});

test('BeadStore: graphScope returns every contributing graph IRI, unique', () => {
  const s = new BeadStore();
  s.addQuad(ASHLEY, DOB,          '1970-08-14', G_ENRICH);
  s.addQuad(ASHLEY, BIRTHPLACE,   'Q60',        G_ENRICH);  // same graph
  s.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  assert.deepEqual(new Set(s.graphScope()), new Set([G_ENRICH, G_PARL]));
});

test('BeadStore: size counts every quad', () => {
  const s = new BeadStore();
  s.addQuad(ASHLEY, DOB,          '1970-08-14', G_ENRICH);
  s.addQuad(ASHLEY, BIRTHPLACE,   'Q60',        G_ENRICH);
  s.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  s.addQuad('OTHER', DOB, '1980-01-01', G_ENRICH);
  assert.equal(s.size(), 4);
});

// ---------------------------------------------------------------------------
// Parent chain — the slim-channel "graphScope grows" semantics.
// Each augment bead inherits its predecessor's quads without copying.
// ---------------------------------------------------------------------------

test('BeadStore: parent chain — propertyOf surfaces parent quads', () => {
  const parl = new BeadStore();
  parl.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  const enr  = new BeadStore(parl);
  enr.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);

  // The enrich bead's full scope = its delta + parl's delta.
  assert.deepEqual(enr.propertyOf(ASHLEY, CONSTITUENCY),
    [{ o: 'Bridgwater', g: G_PARL }]);
  assert.deepEqual(enr.propertyOf(ASHLEY, DOB),
    [{ o: '1970-08-14', g: G_ENRICH }]);
  // The parent doesn't see the child's quads.
  assert.deepEqual(parl.propertyOf(ASHLEY, DOB), []);
});

test('BeadStore: parent chain — own quads precede parent quads in propertyOf', () => {
  // Both bead and parent assert the same predicate; "delta first" so
  // the most-recent fact shows up first in the renderer's list.
  const parent = new BeadStore();
  parent.addQuad(ASHLEY, DOB, '1970-08-14', G_PARL);
  const child  = new BeadStore(parent);
  child.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);
  const vals = child.propertyOf(ASHLEY, DOB);
  assert.deepEqual(vals.map((v) => v.g), [G_ENRICH, G_PARL]);
});

test('BeadStore: parent chain — propertiesOf walks ancestors', () => {
  const a = new BeadStore();
  a.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  const b = new BeadStore(a);
  b.addQuad(ASHLEY, 'urn:kgx:vocab:wikidataQid',
    'http://www.wikidata.org/entity/Q15986921', G_BRIDGE);
  const c = new BeadStore(b);
  c.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);

  const all = c.propertiesOf(ASHLEY);
  assert.equal(all.length, 3);
  assert.deepEqual(new Set(all.map((t) => t.p)),
    new Set([CONSTITUENCY, 'urn:kgx:vocab:wikidataQid', DOB]));
});

test('BeadStore: parent chain — graphScope unions every ancestor', () => {
  const a = new BeadStore();
  a.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  const b = new BeadStore(a);
  b.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);
  const c = new BeadStore(b);
  // c contributes no quads of its own (e.g. a pure filter bead with
  // no augment) — its scope is still {parl, enrich} from ancestors.
  assert.deepEqual(new Set(c.graphScope()), new Set([G_PARL, G_ENRICH]));
});

test('BeadStore: parent chain — size sums every ancestor', () => {
  const a = new BeadStore();
  a.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  a.addQuad('OTHER', CONSTITUENCY, 'Somewhere', G_PARL);
  const b = new BeadStore(a);
  b.addQuad(ASHLEY, DOB, '1970-08-14', G_ENRICH);
  assert.equal(b.size(), 3);
  assert.equal(a.size(), 2);
});

test('BeadStore: shared parent — sibling stores see the same parent quads', () => {
  // A fork would create two child stores with the same parent — both
  // see the parent's facts independently.
  const parent = new BeadStore();
  parent.addQuad(ASHLEY, CONSTITUENCY, 'Bridgwater', G_PARL);
  const left  = new BeadStore(parent);
  const right = new BeadStore(parent);
  assert.deepEqual(left.propertyOf(ASHLEY, CONSTITUENCY),
                   right.propertyOf(ASHLEY, CONSTITUENCY));
});
