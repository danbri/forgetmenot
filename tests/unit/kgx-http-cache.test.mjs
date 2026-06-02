// Unit tests for tests/_lib/http-cache.mjs (the two-tier wrapper).
//
// The wrapper is what every LIBRARY-chain test sits on top of so it gets
// its own focused tests. Stub global.fetch in 'cache' mode (which writes
// both tiers), then probe re-reads in each of the three modes. No real
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readdirSync, statSync, unlinkSync, rmdirSync, readFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  cachedFetch, cacheKey, readSummary,
  SUMMARY_DIR, FULL_DIR,
} from '../_lib/http-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// IMPORTANT: both helpers must `await fn()` before restoring state.
// A sync try-finally with `return fn()` restores state immediately
// (before fn's later awaits run) — which masquerades as a different
// mode on the second cachedFetch inside the same withMode block.
async function withMode(m, fn) {
  const prev = process.env.KGX_HTTP_CACHE_MODE;
  process.env.KGX_HTTP_CACHE_MODE = m;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.KGX_HTTP_CACHE_MODE;
    else                    process.env.KGX_HTTP_CACHE_MODE = prev;
  }
}

async function withStubFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

function uniqueUrl(label) {
  return `https://test.invalid/http-cache/${encodeURIComponent(label)}-${Date.now()}-${Math.random()}`;
}

function pathsFor(url, init = {}) {
  const key = cacheKey({ method: init.method || 'GET', url, body: init.body || '', headers: init.headers || {} });
  return {
    key,
    sum:  path.join(SUMMARY_DIR, key.slice(0, 2), key + '.json'),
    full: path.join(FULL_DIR,    key.slice(0, 2), key + '.body'),
  };
}

function tidy({ sum, full }) {
  for (const f of [sum, full]) {
    if (existsSync(f)) unlinkSync(f);
    const dir = path.dirname(f);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
}

// ---------------------------------------------------------------------------
// cacheKey — deterministic, sensitive to method / url / body / accept
// ---------------------------------------------------------------------------

test('cacheKey is deterministic for the same inputs', () => {
  const a = cacheKey({ method: 'POST', url: 'https://x/y', body: 'q=1', headers: { Accept: 'application/json' } });
  const b = cacheKey({ method: 'POST', url: 'https://x/y', body: 'q=1', headers: { Accept: 'application/json' } });
  assert.equal(a, b);
});

test('cacheKey changes when method / url / body / accept change', () => {
  const base = { method: 'GET', url: 'https://x/y', body: 'b', headers: { Accept: 'a' } };
  const k = cacheKey(base);
  assert.notEqual(k, cacheKey({ ...base, method: 'POST' }));
  assert.notEqual(k, cacheKey({ ...base, url: 'https://x/z' }));
  assert.notEqual(k, cacheKey({ ...base, body: 'B' }));
  assert.notEqual(k, cacheKey({ ...base, headers: { Accept: 'a2' } }));
});

test('cacheKey is case-insensitive on method and Accept header NAME', () => {
  const lower = cacheKey({ method: 'get', url: 'u', headers: { accept: 'x' } });
  const upper = cacheKey({ method: 'GET', url: 'u', headers: { Accept: 'x' } });
  assert.equal(lower, upper);
});

// ---------------------------------------------------------------------------
// Two-tier round trip: cache mode writes both tiers; frozen mode replays
// from committed summary alone.
// ---------------------------------------------------------------------------

test('cache mode: first call live + writes both tiers; second call reads /tmp', async () => {
  const url  = uniqueUrl('two-tier');
  const init = { headers: { Accept: 'application/sparql-results+json' } };
  const ps   = pathsFor(url, init);
  let calls = 0;
  try {
    const body = JSON.stringify({
      head:    { vars: ['s'] },
      results: { bindings: [
        { s: { type: 'uri', value: 'http://example/a' } },
        { s: { type: 'uri', value: 'http://example/b' } },
        { s: { type: 'uri', value: 'http://example/c' } },
        { s: { type: 'uri', value: 'http://example/d' } },
      ] },
    });
    await withStubFetch(async () => {
      calls++;
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/sparql-results+json' },
      });
    }, () => withMode('cache', async () => {
      const r1 = await cachedFetch(url, init);
      assert.equal(r1.status, 200);
      const text1 = await r1.text();
      assert.equal(text1, body, 'first response should be the live body verbatim');

      const r2 = await cachedFetch(url, init);
      assert.equal(await r2.text(), body, 'second response should replay from /tmp full body');
    }));
    assert.equal(calls, 1, 'second call must not hit the network');

    // Both tiers exist on disk.
    assert.ok(existsSync(ps.full), `expected /tmp full body at ${ps.full}`);
    assert.ok(existsSync(ps.sum),  `expected committed summary at ${ps.sum}`);

    // Summary has the structured fields (not the full body).
    const summary = JSON.parse(readFileSync(ps.sum, 'utf8'));
    assert.equal(summary.shape,    'sparql-results-json');
    assert.deepEqual(summary.vars, ['s']);
    assert.equal(summary.rows,     4);
    assert.equal(summary.sample.length, 3, 'sample is capped at 3 bindings');
    assert.match(summary.bindHash, /^sha256:[0-9a-f]{64}$/);
  } finally {
    tidy(ps);
  }
});

test('frozen mode replays from committed summary when /tmp is absent', async () => {
  const url  = uniqueUrl('frozen-summary');
  const init = { headers: { Accept: 'application/sparql-results+json' } };
  const ps   = pathsFor(url, init);
  try {
    // Prime the summary via cache-mode + live fetch.
    const body = JSON.stringify({
      head:    { vars: ['x', 'y'] },
      results: { bindings: [
        { x: { type: 'uri', value: 'A' }, y: { type: 'literal', value: '1' } },
        { x: { type: 'uri', value: 'B' }, y: { type: 'literal', value: '2' } },
      ] },
    });
    await withStubFetch(async () => new Response(body, {
      status: 200, headers: { 'content-type': 'application/sparql-results+json' },
    }), () => withMode('cache', () => cachedFetch(url, init)));

    // Wipe /tmp full body so frozen mode has only the summary.
    if (existsSync(ps.full)) unlinkSync(ps.full);

    let networkCalled = false;
    await withStubFetch(async () => { networkCalled = true; return new Response('', { status: 500 }); },
      () => withMode('frozen', async () => {
        const r = await cachedFetch(url, init);
        assert.equal(r.status, 200);
        const json = JSON.parse(await r.text());
        assert.deepEqual(json.head.vars, ['x', 'y'], 'synthesized response carries vars');
        assert.equal(json.results.bindings.length, 2, 'synthesized response carries the sample bindings');
      }));
    assert.equal(networkCalled, false, 'frozen mode must not call the network');
  } finally {
    tidy(ps);
  }
});

test('frozen mode throws when neither /tmp nor summary exists', async () => {
  const url = uniqueUrl('frozen-miss');
  await withMode('frozen', async () => {
    await assert.rejects(() => cachedFetch(url), /no \/tmp body AND no summary/);
  });
});

test('live mode always hits the network and writes /tmp + summary', async () => {
  const url = uniqueUrl('live-records');
  const ps  = pathsFor(url);
  let calls = 0;
  try {
    const body = JSON.stringify({ head: { vars: [] }, results: { bindings: [] } });
    await withStubFetch(async () => {
      calls++;
      return new Response(body, { status: 200, headers: { 'content-type': 'application/sparql-results+json' } });
    }, () => withMode('live', async () => {
      const r1 = await cachedFetch(url);
      assert.equal(r1.status, 200);
      const r2 = await cachedFetch(url);
      assert.equal(r2.status, 200);
    }));
    assert.equal(calls, 2, 'live mode hits the network on every call');
    assert.ok(existsSync(ps.full), 'live mode still writes /tmp for the next non-live run');
    assert.ok(existsSync(ps.sum),  'live mode still writes the summary');
  } finally {
    tidy(ps);
  }
});

test('readSummary returns null for an unrecorded request', () => {
  const url = uniqueUrl('never-recorded');
  assert.equal(readSummary(url), null);
});

test('readSummary returns the committed summary after a cache-mode fetch', async () => {
  const url  = uniqueUrl('readsummary');
  const init = { headers: { Accept: 'application/sparql-results+json' } };
  const ps   = pathsFor(url, init);
  try {
    const body = JSON.stringify({ head: { vars: ['p'] }, results: { bindings: [] } });
    await withStubFetch(async () => new Response(body, {
      status: 200, headers: { 'content-type': 'application/sparql-results+json' },
    }), () => withMode('cache', () => cachedFetch(url, init)));
    const sum = readSummary(url, init);
    assert.ok(sum, 'expected a summary');
    assert.equal(sum.rows, 0);
    assert.deepEqual(sum.vars, ['p']);
  } finally {
    tidy(ps);
  }
});

test('invalid mode is rejected', async () => {
  await withMode('blammo', async () => {
    await assert.rejects(() => cachedFetch('https://x/'), /KGX_HTTP_CACHE_MODE=blammo/);
  });
});
