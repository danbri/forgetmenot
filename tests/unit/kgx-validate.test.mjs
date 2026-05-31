// Unit tests for SPARQL hygiene checks in
// demos/parliament-live/web/kgx/lib/sparql-validate.mjs and the
// `kgx validate` CLI verb that wraps them.
//
// Pure: no network, no fixtures. The validator is string-in / throw-or-pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { assertNoAliasCollisions } from
  '../../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KGX = path.join(__dirname, '..', '..', 'bin', 'kgx.mjs');

// ---------------------------------------------------------------------------
// assertNoAliasCollisions — direct unit tests
// ---------------------------------------------------------------------------

test('passes a query with no AS clauses', () => {
  const q = `SELECT ?x WHERE { ?x a <http://example/Thing> }`;
  assert.doesNotThrow(() => assertNoAliasCollisions(q, 'no-as'));
});

test('passes when alias names are distinct from WHERE-body vars', () => {
  const q = `
    SELECT ?b (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
    WHERE {
      ?b a <http://example/Thing> .
      OPTIONAL { ?b <http://example/label> ?lbl }
      OPTIONAL { ?b <http://example/image> ?img }
    } GROUP BY ?b`;
  assert.doesNotThrow(() => assertNoAliasCollisions(q, 'distinct'));
});

test('throws when an AS target reuses a WHERE-body variable (the works_by bug)', () => {
  const q = `
    SELECT ?b (SAMPLE(?coord) AS ?coord)
    WHERE {
      ?b a <http://example/Building> .
      OPTIONAL { ?b <http://example/coord> ?coord }
    } GROUP BY ?b`;
  assert.throws(
    () => assertNoAliasCollisions(q, 'works_by'),
    /\?coord also appears in the WHERE body/,
  );
});

test('error message names the colliding alias and references the spec section', () => {
  const q = `SELECT (SAMPLE(?x) AS ?x) WHERE { ?x ?p ?o }`;
  try {
    assertNoAliasCollisions(q, 'spec-cite');
    assert.fail('expected throw');
  } catch (e) {
    assert.match(e.message, /\?x/);
    assert.match(e.message, /18\.2\.4\.4/);
    assert.match(e.message, /\[spec-cite\]/);
  }
});

test('ignores aliases that only appear in ORDER BY (post-projection)', () => {
  // ?n is aliased; it appears only in ORDER BY (outside the WHERE block),
  // which is a legal SPARQL reference to the alias.
  const q = `
    SELECT ?b (COUNT(?a) AS ?n)
    WHERE { ?b <http://example/by> ?a }
    GROUP BY ?b
    ORDER BY DESC(?n)`;
  assert.doesNotThrow(() => assertNoAliasCollisions(q, 'order-by-ok'));
});

test('flags the first collision and surfaces only one error (fail-loud)', () => {
  // Two collisions in one query; we expect a single throw, naming one.
  const q = `
    SELECT (SAMPLE(?a) AS ?a) (SAMPLE(?b) AS ?b)
    WHERE { ?a ?p ?b }`;
  let err;
  try { assertNoAliasCollisions(q, 'two-cols'); } catch (e) { err = e; }
  assert.ok(err, 'expected throw');
  // Either ?a or ?b is named first — both are valid orderings, since the
  // validator stops on the first match. Just check one of them appears.
  assert.match(err.message, /\?(a|b) also appears in the WHERE body/);
});

test('case-insensitive on "AS"/"WHERE" keyword, case-sensitive on var names', () => {
  const q = `
    select ?b (sample(?coord) as ?coord)
    where { ?b <http://example/p> ?coord }`;
  assert.throws(
    () => assertNoAliasCollisions(q, 'lowercase'),
    /\?coord also appears in the WHERE body/,
  );
  // ?Coord (capital C) is a different variable — must not trigger.
  const q2 = `
    SELECT ?b (SAMPLE(?coord) AS ?Coord)
    WHERE { ?b <http://example/p> ?coord }`;
  assert.doesNotThrow(() => assertNoAliasCollisions(q2, 'case-sensitive'));
});

test('returns silently on queries without a WHERE keyword', () => {
  // DESCRIBE / ASK / CONSTRUCT shapes — the WHERE-less variants exist; the
  // validator should not throw, just no-op (nothing to check).
  const q = `DESCRIBE <http://example/thing>`;
  assert.doesNotThrow(() => assertNoAliasCollisions(q, 'describe'));
});

test('BIND(expr AS ?v) inside WHERE is not a SELECT-projection violation', () => {
  // SPARQL 1.1 §18.2.4.5 governs BIND target uniqueness, which is a
  // different rule from §18.2.4.4. The validator must not false-positive
  // on a BIND(...) whose target is also referenced (via SAMPLE/COUNT/etc.)
  // in the SELECT projection with a *different* alias. This is the exact
  // hk-skyscrapers shape from the daisychain demonstrator.
  const q = `
    SELECT ?b (SAMPLE(?yr) AS ?year)
    WHERE {
      ?b a <http://example/Building> .
      OPTIONAL { ?b <http://example/built> ?yrLit . BIND(YEAR(?yrLit) AS ?yr) }
    } GROUP BY ?b`;
  assert.doesNotThrow(() => assertNoAliasCollisions(q, 'bind-fresh'));
});

test('SELECT alias colliding with a BIND target IS a violation', () => {
  // If the SELECT alias is the same name as a variable bound by BIND
  // inside WHERE, the alias collides with a WHERE-scope variable and
  // §18.2.4.4 applies.
  const q = `
    SELECT ?b (SAMPLE(?yr) AS ?yr)
    WHERE {
      ?b a <http://example/Building> .
      OPTIONAL { ?b <http://example/built> ?yrLit . BIND(YEAR(?yrLit) AS ?yr) }
    } GROUP BY ?b`;
  assert.throws(
    () => assertNoAliasCollisions(q, 'bind-collide'),
    /\?yr also appears in the WHERE body/,
  );
});

// ---------------------------------------------------------------------------
// `kgx validate` CLI verb — integration
// ---------------------------------------------------------------------------

function runKgx(args) {
  try {
    const out = execFileSync('node', [KGX, ...args], { encoding: 'utf8' });
    return { ok: true, stdout: out, code: 0 };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', code: e.status };
  }
}

test('CLI validate: exit 0 + ok:true on a clean query', () => {
  const r = runKgx(['validate', '-q', 'SELECT ?x (COUNT(?y) AS ?n) WHERE { ?x ?p ?y } GROUP BY ?x']);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.deepEqual(j.checks, ['assertNoAliasCollisions']);
});

test('CLI validate: exit 1 + ok:false on a colliding query', () => {
  const r = runKgx(['validate', '-q', 'SELECT (SAMPLE(?x) AS ?x) WHERE { ?x ?p ?o }']);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.match(j.error, /\?x also appears in the WHERE body/);
});
