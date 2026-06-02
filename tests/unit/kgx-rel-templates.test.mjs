// Unit tests for the pivot/augment op-node table —
// demos/parliament-live/web/kgx/lib/rel-templates.mjs.
//
// What the tests pin, op-kind by op-kind (the cowpaths from daisychain
// /index.html, paved into a lib):
//
//   * Every REL_TEMPLATE declares the typed-edge contract:
//       inputType, outputType, engineId, variants[]
//   * Every variant's `build(items)` is PURE and returns a SPARQL string.
//   * Every emitted SPARQL passes the SPARQL 1.1 §18.2.4.4 hygiene gate
//     (sparql-validate.mjs). This is the bug class that took down the
//     works_by op in prod — pinning it at the lib level here means the
//     same shape can't slip through unnoticed for any other variant.
//   * Every Wikidata variant's emitted SPARQL contains the QIDs we passed
//     in, so the substitution path is intact.
//   * `valuesMnisPersons` enforces its emptiness contract (sibling of
//     valuesQids, which already has its contract pinned upstream).
//
// No network. The whole point of pulling these into a node-loadable
// module was making the op-kind contracts testable without network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REL_TEMPLATES, valuesMnisPersons } from
  '../../demos/parliament-live/web/kgx/lib/rel-templates.mjs';
import { assertNoAliasCollisions } from
  '../../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';

// ---------------------------------------------------------------------------
// Tiny dummy bundles for the requires()/build() gates.
// ---------------------------------------------------------------------------

const QIDS = [
  { uri: 'http://www.wikidata.org/entity/Q190106' },  // I.M. Pei
  { uri: 'http://www.wikidata.org/entity/Q23390'  },  // Frank Lloyd Wright
];

const MNIS_ITEMS = [
  { uri: 'urn:fpkg:person:1', mpid: '1467' },
  { uri: 'urn:fpkg:person:2', mpid: '4514' },
];

const DDP_SI_ITEMS = [
  { uri: 'https://id.parliament.uk/AbCdEf12' },
];

// Map inputType → a plausible items[] for build() to consume.
function dummyItemsFor(inputType, engineId) {
  if (engineId === 'fpkg' && inputType === 'human') return MNIS_ITEMS;
  if (engineId === 'parl-sparql' && inputType === 'si') return DDP_SI_ITEMS;
  return QIDS;
}

// ---------------------------------------------------------------------------
// Contract: shape of REL_TEMPLATES
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set(['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']);

test('every REL_TEMPLATE has the typed-edge contract fields + a source role', () => {
  for (const t of REL_TEMPLATES) {
    assert.ok(typeof t.id === 'string' && t.id.length, `template missing id`);
    assert.ok(typeof t.inputType  === 'string', `${t.id}: inputType missing`);
    assert.ok(typeof t.outputType === 'string', `${t.id}: outputType missing`);
    assert.ok(typeof t.engineId   === 'string', `${t.id}: engineId missing`);
    assert.ok(Array.isArray(t.variants) && t.variants.length,
              `${t.id}: must have at least one variant`);
    assert.ok(typeof t.requires === 'function',
              `${t.id}: requires() must be a function (gate on input shape)`);
    assert.ok(VALID_ROLES.has(t.role),
      `${t.id}: role="${t.role}" not in {${[...VALID_ROLES].join(', ')}}`);
  }
});

test('every variant carries kind ∈ {default,tighten,broaden} and a build()', () => {
  const allowedKinds = new Set(['default', 'tighten', 'broaden']);
  for (const t of REL_TEMPLATES) {
    for (const v of t.variants) {
      assert.ok(typeof v.id === 'string' && v.id.length, `${t.id}: variant missing id`);
      assert.ok(allowedKinds.has(v.kind),
        `${t.id}:${v.id}: kind="${v.kind}" not in {default,tighten,broaden}`);
      assert.equal(typeof v.build, 'function',
        `${t.id}:${v.id}: build() must be a function`);
      assert.ok(Array.isArray(v.namedGraphs),
        `${t.id}:${v.id}: namedGraphs must be an array (may be empty)`);
    }
  }
});

test('every REL_TEMPLATE has exactly one default variant', () => {
  for (const t of REL_TEMPLATES) {
    const defaults = t.variants.filter((v) => v.kind === 'default');
    assert.equal(defaults.length, 1,
      `${t.id}: expected exactly one default variant, got ${defaults.length}`);
  }
});

// ---------------------------------------------------------------------------
// Hygiene: every emitted SPARQL passes §18.2.4.4
// ---------------------------------------------------------------------------

test('every variant.build() returns a non-empty SPARQL string', () => {
  for (const t of REL_TEMPLATES) {
    const items = dummyItemsFor(t.inputType, t.engineId);
    for (const v of t.variants) {
      const sparql = v.build(items);
      assert.equal(typeof sparql, 'string', `${t.id}:${v.id}: build() returned non-string`);
      assert.ok(sparql.trim().length > 0, `${t.id}:${v.id}: build() returned empty`);
    }
  }
});

test('every variant.build() passes the §18.2.4.4 alias-collision gate', () => {
  // This is the bug class that shipped as the works_by failure
  // (commit 123ad3e7) — `(SAMPLE(?coord) AS ?coord)` colliding with a
  // WHERE-bound `?coord`. Pinning every variant here means the same
  // shape can't ship for any other op without a test failure.
  for (const t of REL_TEMPLATES) {
    const items = dummyItemsFor(t.inputType, t.engineId);
    for (const v of t.variants) {
      const sparql = v.build(items);
      assert.doesNotThrow(
        () => assertNoAliasCollisions(sparql, `${t.id}:${v.id}`),
        `${t.id}:${v.id}: build() emits a SPARQL §18.2.4.4 violation`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Hygiene: every PNAME prefix used in the emitted SPARQL must be declared.
// Caught by Parliament SPARQL (RDF4J family) with HTTP 400
// "QName 'X:Y' uses an undefined prefix". Was the cause of the
// current_constituency:default(646) failure reported 2026-06-01 — the
// template emitted `wd:Q…` in VALUES but only PREFIX'd schema: and rdfs:.
// ---------------------------------------------------------------------------

function declaredPrefixes(sparql) {
  return new Set([...sparql.matchAll(/\bPREFIX\s+([A-Za-z_][\w-]*)\s*:/gi)].map((m) => m[1]));
}

function usedPrefixes(sparql) {
  // Match `prefix:Local` PNAME forms used in the query body. Filter out
  // false positives: SPARQL `xsd:`/`rdf:`/`rdfs:` keywords inside angle-bracket
  // IRIs are not PNAMEs, and HTTP/HTTPS URLs contain `://` which isn't a PNAME.
  const used = new Set();
  // Strip out angle-bracketed IRIs and string literals first.
  const stripped = sparql
    .replace(/<[^>]*>/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '');
  for (const m of stripped.matchAll(/\b([A-Za-z_][\w-]*):[A-Za-z_][\w-]*/g)) {
    used.add(m[1]);
  }
  return used;
}

test('every variant.build() declares every prefix it uses', () => {
  for (const t of REL_TEMPLATES) {
    const items = dummyItemsFor(t.inputType, t.engineId);
    for (const v of t.variants) {
      const sparql = v.build(items);
      const declared = declaredPrefixes(sparql);
      const used     = usedPrefixes(sparql);
      for (const pfx of used) {
        assert.ok(declared.has(pfx),
          `${t.id}:${v.id}: emits "${pfx}:…" but never declares PREFIX ${pfx}:`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Substitution intact: input URIs appear in emitted SPARQL
// ---------------------------------------------------------------------------

test('Wikidata variants substitute the input QIDs into the query', () => {
  for (const t of REL_TEMPLATES) {
    if (t.engineId !== 'qlever-wikidata') continue;
    for (const v of t.variants) {
      const sparql = v.build(QIDS);
      for (const q of QIDS) {
        const qid = q.uri.match(/Q\d+$/)[0];
        assert.match(sparql, new RegExp(`wd:${qid}\\b`),
          `${t.id}:${v.id}: emitted SPARQL is missing wd:${qid}`);
      }
    }
  }
});

test('si_laying_body substitutes <URI> form, not wd: form', () => {
  const t = REL_TEMPLATES.find((x) => x.id === 'si_laying_body');
  assert.ok(t, 'si_laying_body template not found');
  const sparql = t.variants[0].build(DDP_SI_ITEMS);
  assert.match(sparql, /<https:\/\/id\.parliament\.uk\/AbCdEf12>/);
  assert.ok(!/wd:/.test(sparql), 'si_laying_body must not emit wd: prefix');
});

// ---------------------------------------------------------------------------
// MNIS-id substitution: appg_officer + the helper
// ---------------------------------------------------------------------------

test('valuesMnisPersons throws on empty / no .mpid', () => {
  assert.throws(() => valuesMnisPersons([]),               /0 MNIS ids/);
  assert.throws(() => valuesMnisPersons([{ uri: 'x' }]),   /0 MNIS ids/);
  assert.throws(() => valuesMnisPersons(undefined),        /0 MNIS ids/);
});

test('valuesMnisPersons emits the MNIS members URI', () => {
  const s = valuesMnisPersons(MNIS_ITEMS);
  assert.match(s, /<https:\/\/data\.parliament\.uk\/membersdataplatform\/services\/mnis\/members\/1467>/);
  assert.match(s, /<https:\/\/data\.parliament\.uk\/membersdataplatform\/services\/mnis\/members\/4514>/);
});

test('appg_officer uses the MNIS id form (not Wikidata QID)', () => {
  const t = REL_TEMPLATES.find((x) => x.id === 'appg_officer');
  assert.ok(t, 'appg_officer template not found');
  assert.equal(t.engineId, 'fpkg');
  assert.equal(t.requires({ items: MNIS_ITEMS }), true);
  assert.equal(t.requires({ items: QIDS }), false,
    'appg_officer requires .mpid, not .uri QIDs');
  const sparql = t.variants[0].build(MNIS_ITEMS);
  assert.match(sparql, /membersdataplatform\/services\/mnis\/members\/1467/);
});

// ---------------------------------------------------------------------------
// Tighten/broaden coverage: the design-showpiece template
// ---------------------------------------------------------------------------

test('children template carries default + tighten (sons/daughters) + broaden (family)', () => {
  const t = REL_TEMPLATES.find((x) => x.id === 'children');
  assert.ok(t, 'children template not found');
  const variantIds = t.variants.map((v) => `${v.kind}:${v.id}`);
  assert.deepEqual(variantIds, [
    'default:default',
    'tighten:sons',
    'tighten:daughters',
    'broaden:family',
  ]);
});

// ---------------------------------------------------------------------------
// Provenance: namedGraphs declared where they're actually used
// ---------------------------------------------------------------------------

test('appg_officer declares the FPKG named graph for provenance', () => {
  const t = REL_TEMPLATES.find((x) => x.id === 'appg_officer');
  const v = t.variants[0];
  assert.deepEqual(v.namedGraphs,
    ['https://forgetmenot.example/transparency#graph/appg-register']);
  // and the query actually references it.
  assert.match(v.build(MNIS_ITEMS),
    /GRAPH <https:\/\/forgetmenot\.example\/transparency#graph\/appg-register>/);
});
