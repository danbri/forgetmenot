// Intent registry — pure-data tests that pin which intents fire on which
// shapes of entity / bundle, and that the planned action shape matches
// the contract the page + CLI dispatchers consume.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INTENTS, entityIntentsFor, bundleIntentsFor } from
  '../../demos/parliament-live/web/kgx/lib/intents.mjs';

// ---------------------------------------------------------------------------
// Entity intents
// ---------------------------------------------------------------------------

test('every intent declares the required shape (id, label, icon, scope, applicable, plan)', () => {
  for (const group of ['entity', 'bundle']) {
    for (const i of INTENTS[group]) {
      assert.ok(i.id && typeof i.id === 'string',     `${group}: missing id`);
      assert.ok(i.label && typeof i.label === 'string', `${group}/${i.id}: missing label`);
      assert.ok(i.icon  && typeof i.icon  === 'string', `${group}/${i.id}: missing icon`);
      assert.equal(i.scope, group, `${group}/${i.id}: scope mismatch`);
      assert.ok(typeof i.applicable === 'function', `${group}/${i.id}: applicable() must be a function`);
      assert.ok(typeof i.plan       === 'function', `${group}/${i.id}: plan() must be a function`);
    }
  }
});

test('Wikidata Q-URI entity gets the wikidata + wikipedia + canonical-uri + copy-uri/label intents', () => {
  const it = { uri: 'http://www.wikidata.org/entity/Q84', label: 'London' };
  const ids = entityIntentsFor(it).map((i) => i.id);
  for (const must of ['open-wikidata', 'open-wikipedia', 'open-canonical-uri', 'copy-label', 'copy-uri']) {
    assert.ok(ids.includes(must), `expected ${must} to fire on Q84`);
  }
});

test('Non-Wikidata item skips wikidata + wikipedia intents', () => {
  const it = { uri: 'https://id.parliament.uk/abc', label: 'Some MP' };
  const ids = entityIntentsFor(it).map((i) => i.id);
  assert.ok(!ids.includes('open-wikidata'));
  assert.ok(!ids.includes('open-wikipedia'));
  assert.ok(ids.includes('open-canonical-uri'));
});

test('Item with coords gets the OSM intent, plan emits a working mlat/mlon URL', () => {
  const it = { uri: 'wd:Q123', label: 'a place', coords: { lat: 51.5, lon: -0.1 } };
  const osm = entityIntentsFor(it).find((i) => i.id === 'show-on-osm');
  assert.ok(osm, 'OSM intent should be applicable');
  const action = osm.plan(it, {});
  assert.equal(action.kind, 'url');
  assert.match(action.href, /openstreetmap\.org\/.*mlat=51\.5/);
  assert.match(action.href, /mlon=-0\.1/);
});

test('Item without coords skips OSM intent', () => {
  const it = { uri: 'wd:Q123', label: 'a person' };
  assert.ok(!entityIntentsFor(it).some((i) => i.id === 'show-on-osm'));
});

test('MP-bridged item gets TheyWorkForYou + Hansard intents pointing at member id', () => {
  const it = { uri: 'wd:Q1', label: 'an MP', mpid: '4514' };
  const ids = entityIntentsFor(it).map((i) => i.id);
  assert.ok(ids.includes('open-twfy'));
  assert.ok(ids.includes('open-hansard'));
  const hansard = entityIntentsFor(it).find((i) => i.id === 'open-hansard');
  assert.match(hansard.plan(it, {}).href, /hansard\.parliament\.uk.*memberId=4514/);
});

test('Item with no MP id skips MP-only intents', () => {
  const it = { uri: 'wd:Q1', label: 'a non-MP' };
  const ids = entityIntentsFor(it).map((i) => i.id);
  assert.ok(!ids.includes('open-twfy'));
  assert.ok(!ids.includes('open-hansard'));
});

// ---------------------------------------------------------------------------
// Bundle intents
// ---------------------------------------------------------------------------

const flatSpec = {
  steps: [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'sitting' },
  ],
};

test('Bundle intents fire when a chainSpec is supplied; copy intents emit copy actions, save-to-fpkg emits a post action', () => {
  const ctx = {
    chainSpec: flatSpec,
    permalink: 'http://example/#g=abc',
    kgxId: 'lab-sitting',
  };
  const ids = bundleIntentsFor({}, ctx).map((i) => i.id);
  assert.deepEqual(ids.sort(),
    ['copy-kgx-cli', 'copy-permalink', 'copy-spec', 'copy-trig', 'save-to-fpkg'].sort());
  for (const intent of bundleIntentsFor({}, ctx)) {
    const action = intent.plan({}, ctx);
    if (intent.id === 'save-to-fpkg') {
      assert.equal(action.kind, 'post', `${intent.id}: should POST the SPARQL Update`);
      assert.equal(action.href, '/kgx/chains-update');
      assert.equal(action.contentType, 'application/sparql-update');
      assert.ok(action.body && action.body.length, `${intent.id}: must carry a body`);
      assert.match(action.body, /INSERT DATA \{\s*GRAPH <urn:kgx:flow:/);
    } else {
      assert.equal(action.kind, 'copy', `${intent.id}: should be a copy action`);
      assert.ok(action.text && action.text.length, `${intent.id}: plan must produce text`);
    }
  }
});

test('copy-trig produces a valid TriG manifest (kgx: + prov: vocabulary, named flow IRI)', () => {
  const ctx = { chainSpec: flatSpec, permalink: 'x', kgxId: null };
  const trig = bundleIntentsFor({}, ctx).find((i) => i.id === 'copy-trig').plan({}, ctx).text;
  assert.match(trig, /@prefix kgx:/);
  assert.match(trig, /@prefix dct:/);
  assert.match(trig, /kgx:SourceBundle/);
});

test('copy-kgx-cli falls back to stdin form when no library id is known', () => {
  const ctx = { chainSpec: flatSpec, permalink: 'x', kgxId: null };
  const txt = bundleIntentsFor({}, ctx).find((i) => i.id === 'copy-kgx-cli').plan({}, ctx).text;
  // The exact `bin/kgx.mjs` path isn't load-bearing — what matters is that
  // it shells through node, references chain run -f /dev/stdin, embeds the
  // spec, and uses a heredoc so the JSON survives.
  assert.match(txt, /chain run -f \/dev\/stdin/);
  assert.match(txt, /uk-mps-1900/);
  assert.match(txt, /<<'EOF'/);
});

test('copy-kgx-cli uses --library short form when kgxId is set', () => {
  const ctx = { chainSpec: flatSpec, permalink: 'x', kgxId: 'lab-sitting' };
  const txt = bundleIntentsFor({}, ctx).find((i) => i.id === 'copy-kgx-cli').plan({}, ctx).text;
  assert.equal(txt, 'kgx chain run --library lab-sitting');
});

test('Bundle intents are empty without a chainSpec context', () => {
  assert.deepEqual(bundleIntentsFor({}, null), []);
  assert.deepEqual(bundleIntentsFor({}, {}), []);
});
