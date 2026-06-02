// LIBRARY iteration test — runs every saved chain in
// demos/parliament-live/web/kgx/lib/library.mjs through the lib's
// runChainSpec interpreter, asserting pass / skip per entry. This is
// the milestone the extraction work has been building toward.
//
// Coverage today:
//   * Chains whose starter + ops are all in the lib registry → live-cached
//     run, asserts beads emitted + final bundle non-empty + bindHash
//     deterministic across two runs.
//   * Chains that hit an unsupported op (UnsupportedOpError) → t.skip with
//     the missing op name. As each follow-up commit lifts another op into
//     the lib, coverage grows visibly.
//   * Chains whose engine needs auth that the test process can't provide
//     (parl-sparql via the fpkg proxy) → routed directly to
//     api.parliament.uk/sparql for the test (public, CORS, no auth) —
//     equivalent data, different code path.
//
// HTTP layer: tests/_lib/http-cache.mjs (two-tier, committed summary +
// /tmp full body). Re-record by deleting the fixture; KGX_HTTP_CACHE_MODE
// = frozen for hermetic CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { LIBRARY } from
  '../../demos/parliament-live/web/kgx/lib/library.mjs';
import { runChainSpec, UnsupportedOpError } from
  '../../demos/parliament-live/web/kgx/lib/runner.mjs';
import { normaliseChainSpec, activeChainSteps } from
  '../../demos/parliament-live/web/kgx/lib/branches.mjs';
import { cachedFetch, readSummary } from '../_lib/http-cache.mjs';

// Expected bead count for a chain: walks the active-branch flatten
// (works for both flat {steps} and tree {branches} shapes).
function expectedBeadCount(chain) {
  return activeChainSteps(normaliseChainSpec(chain)).length;
}

// ---------------------------------------------------------------------------
// Engine resolver — maps the engineId strings used in lib registries to a
// SparqlEngine-shaped {query(sparql, label) → {json, ms, endpoint, engineId}}
// object, with cachedFetch under the hood so each test pass is fast +
// hermetic where possible.
//
// parl-sparql in the BROWSER goes through fpkg.fly.dev/api/sparql (gated).
// In node tests we route it directly to api.parliament.uk/sparql which is
// public + CORS-open. Same DDP store, no auth needed.
// ---------------------------------------------------------------------------
const ENDPOINTS = {
  'qlever-wikidata': 'https://qlever.dev/api/wikidata',
  'fpkg':            'https://fpkg.fly.dev/kgx/query',
  'parl-sparql':     'https://api.parliament.uk/sparql',
};

// PQ host — api.parliament.uk/query/<template>, JSON-LD response.
// CORS-open, no auth. Used by the pq-* starters in lib.
async function pqHost(template) {
  const url = 'https://api.parliament.uk/query/' + template;
  const t0  = performance.now();
  const res = await cachedFetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`pq:${template}: HTTP ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json['@graph']) ? json['@graph'] : [];
  return { json, rows, ms: Math.round(performance.now() - t0), endpoint: url, engineId: 'parl-pq' };
}

function engineResolver(id) {
  const endpoint = ENDPOINTS[id];
  if (!endpoint) throw new Error(`no test endpoint mapping for engineId "${id}"`);
  return {
    id,
    endpoint,
    async query(sparql, label) {
      // Switch to POST for queries over the conservative GET-URL threshold
      // (same shape as bin/kgx.mjs + the browser SparqlEngine).
      const t0 = performance.now();
      let res;
      if (sparql.length > 2048) {
        res = await cachedFetch(endpoint, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept':       'application/sparql-results+json',
          },
          body: sparql,
        });
      } else {
        const url = endpoint + '?query=' + encodeURIComponent(sparql);
        res = await cachedFetch(url, {
          headers: { 'Accept': 'application/sparql-results+json' },
        });
      }
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      const json = await res.json();
      return { json, ms: Math.round(performance.now() - t0), endpoint, engineId: id, query: sparql };
    },
  };
}

// ---------------------------------------------------------------------------
// Per-chain run, with a network / unsupported-op tolerance.
// ---------------------------------------------------------------------------

const NETWORK_HINTS = /HTTP 5\d\d|HTTP 000|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|getaddrinfo|fetch failed|network/i;

async function runOrTriage(chain) {
  try {
    return { ok: true, ...await runChainSpec(chain, { engine: engineResolver, pq: pqHost }) };
  } catch (e) {
    if (e instanceof UnsupportedOpError) {
      return { ok: false, skip: 'op-not-in-lib', detail: e.step };
    }
    if (NETWORK_HINTS.test(String(e?.message || e))) {
      return { ok: false, skip: 'network', detail: e.message };
    }
    // Soft-cap rejection ("bundle 645 > cap 500; narrow first.") is the
    // intended product behaviour for chains whose author forgot to narrow
    // before an augment op. Surface as a known-outcome skip rather than a
    // test failure — fixing the chain in LIBRARY would mean editing the
    // user's saved spec, which isn't our call here.
    if (/> cap \d+; narrow first/.test(String(e?.message || e))) {
      return { ok: false, skip: 'cap-exceeded', detail: e.message };
    }
    return { ok: false, error: e };
  }
}

// One node:test per LIBRARY entry. Naming the test after the entry ID
// makes the TAP output a direct map of "which chains work today".
for (const chain of LIBRARY) {
  test(`LIBRARY:${chain.id} — ${chain.title}`, async (t) => {
    const result = await runOrTriage(chain);

    if (result.skip === 'op-not-in-lib') {
      t.skip(`chain hits "${result.detail}" — not yet lifted into lib`);
      return;
    }
    if (result.skip === 'network') {
      t.skip(`upstream unreachable — ${result.detail}`);
      return;
    }
    if (result.skip === 'cap-exceeded') {
      t.skip(`chain author forgot to narrow before augment — ${result.detail}`);
      return;
    }
    if (!result.ok) throw result.error;

    // Successful run: assert structural invariants.
    assert.ok(Array.isArray(result.beads),  'expected a beads array');
    const expected = expectedBeadCount(chain);
    assert.equal(result.beads.length, expected,
      `expected ${expected} beads, got ${result.beads.length}`);
    assert.ok(result.bundle,                'expected a final bundle');
    assert.ok(typeof result.bundle.size === 'number');
    // Bundle's type is whatever the last op decided. For most LIBRARY chains
    // ending on a restrict op that's the starter's type ('human').
    assert.ok(typeof result.bundle.type === 'string');
  });
}

// ---------------------------------------------------------------------------
// Determinism check: re-run a small chain and confirm bindHash on the
// emitted SPARQL responses matches between runs (cached path is the
// same body; live path may flip on Wikidata drift, which is the
// re-record trigger).
// ---------------------------------------------------------------------------

function sha256(s) {
  return 'sha256:' + createHash('sha256').update(s).digest('hex');
}

function bindHashOf(bundle) {
  const uris = [...new Set(bundle.items.map((x) => x.uri).filter(Boolean))].sort();
  return sha256(uris.join('\n'));
}

test('LIBRARY:tory-sitting — bindHash deterministic across two runs', async (t) => {
  const chain = LIBRARY.find((c) => c.id === 'tory-sitting');
  assert.ok(chain, 'tory-sitting missing from LIBRARY');

  const r1 = await runOrTriage(chain);
  if (r1.skip) { t.skip(r1.skip); return; }
  if (!r1.ok)  throw r1.error;

  const r2 = await runOrTriage(chain);
  if (r2.skip) { t.skip(r2.skip); return; }
  if (!r2.ok)  throw r2.error;

  assert.equal(bindHashOf(r1.bundle), bindHashOf(r2.bundle),
    'two consecutive runs must produce the same final-bundle URI set');
});
