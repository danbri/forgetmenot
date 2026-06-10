// Unit tests for the source-op ("starter") registry —
// demos/parliament-live/web/kgx/lib/starters.mjs.
//
// Mixed strategy:
//   * SPARQL hygiene checks on the query (no network) — fast, deterministic.
//   * parseMpRows shape check on a hand-built bindings fixture (no network).
//   * One LIVE-RECORDED run via the http-cache wrapper — records the QLever
//     response on first run, replays from disk on subsequent runs, pins the
//     bindHash of the URI set. Re-record by deleting
//     tests/fixtures/http-cache/.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STARTERS, POST1900_MPS_QUERY, SEED_LIMIT, parseMpRows,
  PARL_CURRENT_MPS_QUERY, parseParlCurrentRows,
} from '../../demos/parliament-live/web/kgx/lib/starters.mjs';
import { assertNoAliasCollisions } from
  '../../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';
import { cachedFetch, readSummary } from '../_lib/http-cache.mjs';

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set(['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']);

test('every starter carries the declarative-plan fields + a source role', () => {
  for (const s of STARTERS) {
    assert.ok(typeof s.id === 'string' && s.id.length, `missing id`);
    assert.ok(typeof s.label === 'string',             `${s.id}: no label`);
    assert.ok(typeof s.type === 'string',              `${s.id}: no output type`);
    // Three shapes: SPARQL (engineId+query) / PQ (pqTemplate) / inline
    // (items[] baked into the entry — useful for demo seeds).
    const sparqlShape = typeof s.engineId === 'string' && typeof s.query === 'string' && s.query.length;
    const pqShape     = typeof s.pqTemplate === 'string' && s.pqTemplate.length;
    const inlineShape = Array.isArray(s.items) && s.items.length > 0;
    assert.ok(sparqlShape || pqShape || inlineShape,
      `${s.id}: must be SPARQL-shape (engineId+query) / PQ-shape (pqTemplate) / inline (items[])`);
    // SPARQL + PQ starters parse server bindings; inline starters carry
    // their own already-shaped items, so parse() is optional there.
    if (sparqlShape || pqShape) {
      assert.equal(typeof s.parse, 'function', `${s.id}: parse() must be a function`);
    }
    assert.ok(VALID_ROLES.has(s.role),
      `${s.id}: role="${s.role}" not in {${[...VALID_ROLES].join(', ')}}`);
  }
});

// Filter helper — SPARQL hygiene only runs on SPARQL-shape starters; PQ
// starters use named templates served by api.parliament.uk/query/, not
// inline SPARQL of our own.
const SPARQL_STARTERS = STARTERS.filter((s) => typeof s.query === 'string');

// ---------------------------------------------------------------------------
// SPARQL hygiene on the query — same gates the rel-templates tests pin.
// Catches §18.2.4.4 alias collisions and any undeclared-prefix bugs at
// extraction time, so the same shape can't ship for the starter family
// either.
// ---------------------------------------------------------------------------

function declaredPrefixes(sparql) {
  return new Set([...sparql.matchAll(/\bPREFIX\s+([A-Za-z_][\w-]*)\s*:/gi)].map((m) => m[1]));
}

function usedPrefixes(sparql) {
  const stripped = sparql.replace(/<[^>]*>/g, '').replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  const out = new Set();
  for (const m of stripped.matchAll(/\b([A-Za-z_][\w-]*):[A-Za-z_][\w-]*/g)) out.add(m[1]);
  return out;
}

test('every SPARQL starter.query passes the §18.2.4.4 alias-collision gate', () => {
  for (const s of SPARQL_STARTERS) {
    assert.doesNotThrow(
      () => assertNoAliasCollisions(s.query, s.id),
      `${s.id}: emits a §18.2.4.4 violation`,
    );
  }
});

test('every SPARQL starter.query declares every PNAME prefix it uses', () => {
  for (const s of SPARQL_STARTERS) {
    const declared = declaredPrefixes(s.query);
    const used     = usedPrefixes(s.query);
    for (const pfx of used) {
      assert.ok(declared.has(pfx),
        `${s.id}: uses "${pfx}:…" but never declares PREFIX ${pfx}:`);
    }
  }
});

// ---------------------------------------------------------------------------
// POST1900_MPS_QUERY: shape-level checks
// ---------------------------------------------------------------------------

test('POST1900_MPS_QUERY uses the SEED_LIMIT constant', () => {
  assert.match(POST1900_MPS_QUERY, new RegExp(`LIMIT\\s+${SEED_LIMIT}\\b`));
});

test('POST1900_MPS_QUERY pivots on the Wikidata MP-position class Q16707842', () => {
  assert.match(POST1900_MPS_QUERY, /wd:Q16707842/);
});

// ---------------------------------------------------------------------------
// parseMpRows: shape-mapping from bindings to items
// ---------------------------------------------------------------------------

const SAMPLE_ROW = {
  p:            { type: 'uri',     value: 'http://www.wikidata.org/entity/Q9682' },
  l:            { type: 'literal', value: 'Elizabeth II' },
  imgUri:       { type: 'uri',     value: 'http://example/lizII.jpg' },
  mpid:         { type: 'literal', value: '12345' },
  firstYr:      { type: 'literal', value: '1952' },
  latestStart:  { type: 'literal', value: '1952' },
  lastYr:       { type: 'literal', value: '2022' },
  sittingFlag:  { type: 'literal', value: '0' },
  parties:      { type: 'literal', value: 'Independent|Crown' },
  gender:       { type: 'literal', value: 'female' },
  citizenships: { type: 'literal', value: 'United Kingdom' },
};

test('parseMpRows maps a bindings row into the human-bundle item shape', () => {
  const [item] = parseMpRows([SAMPLE_ROW]);
  assert.equal(item.uri,         'http://www.wikidata.org/entity/Q9682');
  assert.equal(item.label,       'Elizabeth II');
  assert.equal(item.image,       'http://example/lizII.jpg');
  assert.equal(item.mpid,        '12345');
  assert.equal(item.firstYr,     1952);
  assert.equal(item.latestStart, 1952);
  assert.equal(item.lastYr,      2022);
  assert.equal(item.sitting,     false);
  assert.deepEqual(item.parties, ['Independent', 'Crown']);
  assert.equal(item.gender,      'female');
  assert.deepEqual(item.citizenships, ['United Kingdom']);
  assert.equal(item.decade,      '2020s');   // sitting=false → use lastYr=2022 → 2020s
});

test('parseMpRows treats sittingFlag === "1" as sitting=true', () => {
  const r = { ...SAMPLE_ROW, sittingFlag: { type: 'literal', value: '1' } };
  const [item] = parseMpRows([r]);
  assert.equal(item.sitting, true);
});

test('parseMpRows: lastYr=9999 sentinel maps to null', () => {
  const r = { ...SAMPLE_ROW, lastYr: { type: 'literal', value: '9999' } };
  const [item] = parseMpRows([r]);
  assert.equal(item.lastYr, null);
});

test('parseMpRows handles missing optional fields (empty strings, null pipes)', () => {
  const sparse = {
    p:           { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' },
    parties:     { type: 'literal', value: '' },
    citizenships:{ type: 'literal', value: '' },
  };
  const [item] = parseMpRows([sparse]);
  assert.equal(item.uri, 'http://www.wikidata.org/entity/Q1');
  assert.equal(item.label, 'Q1');           // falls back to last URI segment
  assert.equal(item.image, null);
  assert.equal(item.mpid,  null);
  assert.deepEqual(item.parties, []);
  assert.deepEqual(item.citizenships, []);
  assert.equal(item.decade, null);
});

// ---------------------------------------------------------------------------
// parl-current-mps: the DDP-shaped projection in FPKG's Oxigraph.
// Lifted from the inline daisychain starter; AS-collision fixed.
// ---------------------------------------------------------------------------

const SAMPLE_PARL_ROW = {
  p:     { type: 'uri',     value: 'https://id.parliament.uk/abc123' },
  giv:   { type: 'literal', value: 'Alice' },
  fam:   { type: 'literal', value: 'Adams' },
  const: { type: 'literal', value: 'North Cornwall' },
  party: { type: 'literal', value: 'Labour Party' },
  mpid:  { type: 'literal', value: '4001' },
  start: { type: 'literal', value: '2024-07-04' },
};

test('parl-current-mps query: no §18.2.4.4 collisions', () => {
  // The previous inline version had `(SAMPLE(?fam) AS ?fam)` etc. — fixed
  // by renaming WHERE-side variables.  Pin the fix here so it can't
  // regress.
  assertNoAliasCollisions(PARL_CURRENT_MPS_QUERY, 'parl-current-mps');
});

test('parseParlCurrentRows maps a DDP row into the human-bundle shape', () => {
  const [item] = parseParlCurrentRows([SAMPLE_PARL_ROW]);
  assert.equal(item.uri,     'https://id.parliament.uk/abc123');
  assert.equal(item.label,   'Alice Adams');
  // Members API thumbnail routed through OUR proxy: upstream Thumbnail
  // doesn't send ACAO (probed 2026-06-10), so the WebGL2 atlas's
  // crossOrigin="anonymous" path needs the proxy. server.mjs bypasses
  // auth for Thumbnail/Portrait so shared links still render.
  assert.equal(item.image,   '/api/members/Members/4001/Thumbnail');
  assert.equal(item.mpid,    '4001');
  assert.equal(item.firstYr, 2024);
  assert.equal(item.lastYr,  null);
  assert.equal(item.sitting, true);
  assert.deepEqual(item.parties, ['Labour Party']);
  assert.equal(item.decade,  '2020s');
  // The pre-populated extra sidecar means the bead reads "enriched"
  // without an explicit `enrich (Parliament)` op.
  assert.equal(item.extra?.parl?.personUri,    'https://id.parliament.uk/abc123');
  assert.equal(item.extra?.parl?.constituency, 'North Cornwall');
  assert.equal(item.extra?.parl?.currentParty, 'Labour Party');
  assert.equal(item.extra?.parl?.familyName,   'Adams');
  assert.equal(item.extra?.parl?.givenName,    'Alice');
});

test('parseParlCurrentRows falls back to URI suffix when name fields are empty', () => {
  const r = { p: { type: 'uri', value: 'https://id.parliament.uk/xyz789' } };
  const [item] = parseParlCurrentRows([r]);
  assert.equal(item.label, 'xyz789');
  assert.equal(item.mpid,  null);
  // No mpid → no Members API thumbnail URL.
  assert.equal(item.image, null);
  assert.deepEqual(item.parties, []);
  assert.equal(item.extra?.parl?.familyName, null);
});

// ---------------------------------------------------------------------------
// Live (cached) end-to-end: run uk-mps-1900 against QLever via the
// two-tier http-cache.
//
//   First run (cache mode, no fixture): hits qlever.dev, writes BOTH
//     tests/fixtures/http-cache/<aa>/<key>.json (small summary, committed)
//     AND /tmp/kgx-http-cache/<aa>/<key>.body (full body, ephemeral).
//   Repeat local runs: read from /tmp, no network.
//   CI (frozen mode, no /tmp): synthesizes Response from the committed
//     summary's sample bindings — `vars + rows + bindHash` are exact;
//     the test only iterates the sample so it still passes hermetically.
//
// Skips gracefully on network errors so a transient QLever outage doesn't
// false-fail.
// ---------------------------------------------------------------------------

const NETWORK_HINTS = /HTTP 5\d\d|HTTP 000|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|getaddrinfo|fetch failed|network/i;

test('uk-mps-1900 returns ≥6,000 distinct MPs from QLever (live, cached)', async (t) => {
  const uk = STARTERS.find((s) => s.id === 'uk-mps-1900');
  assert.ok(uk, 'uk-mps-1900 missing from STARTERS');

  const url  = `https://qlever.dev/api/wikidata?query=${encodeURIComponent(uk.query)}`;
  const init = { headers: { 'Accept': 'application/sparql-results+json' } };

  let res;
  try {
    res = await cachedFetch(url, init);
  } catch (e) {
    if (NETWORK_HINTS.test(String(e?.message || e))) {
      t.skip(`QLever unreachable — ${e?.message}`);
      return;
    }
    throw e;
  }
  assert.equal(res.status, 200, `unexpected HTTP ${res.status}`);

  // Summary is the test-grade pin: works in any mode (cache/live/frozen)
  // since both cache and live always write it.
  const summary = readSummary(url, init);
  assert.ok(summary, 'expected a committed summary after the fetch');
  assert.equal(summary.shape, 'sparql-results-json');
  assert.ok(summary.vars.includes('p'), `expected ?p in summary vars; got ${summary.vars}`);
  assert.ok(summary.rows >= 6000, `expected ≥6000 MPs in committed summary; got ${summary.rows}`);
  assert.match(summary.bindHash, /^sha256:[0-9a-f]{64}$/);

  // parseMpRows on the sample bindings — exercises the parse function in
  // both cache and frozen modes. The synthesized frozen Response carries
  // sample.length (capped at 3) bindings; the cache/live Response carries
  // the full set.
  const json = JSON.parse(await res.text());
  const items = uk.parse(json.results.bindings);
  assert.ok(items.length >= 1, 'parse must emit at least one item');
  for (const item of items) {
    assert.ok(/^https?:\/\/.+\/Q\d+$/.test(item.uri),
      `expected Wikidata QID URI; got ${item.uri}`);
  }
});
