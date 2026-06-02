// Unit tests for tests/_lib/http-cache.mjs.
//
// The cache wrapper is what every LIBRARY-chain test will sit on top of —
// so it gets its own focused tests rather than being implicitly exercised
// by everything else.  No network: each test installs a stub global.fetch
// in 'live' mode (force-record) or relies on the existing cache files in
// 'frozen' mode.  The 'cache' default mode is exercised end-to-end via
// the round-trip test (live-record + frozen-replay).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readdirSync, statSync, unlinkSync, rmdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  cachedFetch, cacheKey, clearCache, CACHE_DIR,
} from '../_lib/http-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Remove a single recorded cache file + the hex-shard dir if it's now empty.
// Used in finally{} so test runs don't accumulate stray dirs under fixtures/.
function tidyCacheFile(file) {
  if (existsSync(file)) unlinkSync(file);
  const dir = path.dirname(file);
  if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function withMode(m, fn) {
  const prev = process.env.KGX_HTTP_CACHE_MODE;
  process.env.KGX_HTTP_CACHE_MODE = m;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.KGX_HTTP_CACHE_MODE;
    else                    process.env.KGX_HTTP_CACHE_MODE = prev;
  }
}

function withStubFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = real; });
}

// We use a private sub-tree under CACHE_DIR for this test file so we never
// trample real fixtures. cacheKey is content-derived so a unique URL per
// test gives us isolation without touching clearCache().
function uniqueUrl(label) {
  return `https://test.invalid/http-cache/${encodeURIComponent(label)}`;
}

// ---------------------------------------------------------------------------
// cacheKey
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

test('cacheKey requires a url', () => {
  assert.throws(() => cacheKey({}), /url is required/);
});

// ---------------------------------------------------------------------------
// round-trip: live records → frozen replays
// ---------------------------------------------------------------------------

test('live mode hits the network and records to disk', async () => {
  const url = uniqueUrl('live-records-' + Date.now());
  let calls = 0;
  await withStubFetch(async () => {
    calls++;
    return new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } });
  }, () => withMode('live', async () => {
    const r = await cachedFetch(url);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'hello');
  }));
  assert.equal(calls, 1);
  // 'live' is "always fetch, never record" — file must NOT exist.
  const key = cacheKey({ method: 'GET', url });
  const file = path.join(CACHE_DIR, key.slice(0, 2), key + '.json');
  assert.equal(existsSync(file), false, `'live' mode unexpectedly wrote ${file}`);
});

test('cache mode: first call fetches + writes, second call reads from disk', async () => {
  const url = uniqueUrl('cache-records-' + Date.now());
  let calls = 0;
  try {
    await withStubFetch(async () => {
      calls++;
      return new Response(JSON.stringify({ n: calls }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }, () => withMode('cache', async () => {
      const r1 = await cachedFetch(url);
      assert.equal(await r1.text(), '{"n":1}');
      const r2 = await cachedFetch(url);
      assert.equal(await r2.text(), '{"n":1}', 'second call should replay the recorded body');
    }));
    assert.equal(calls, 1, 'second call should not hit the network');

    // File should exist on disk and round-trip cleanly.
    const key = cacheKey({ method: 'GET', url });
    const file = path.join(CACHE_DIR, key.slice(0, 2), key + '.json');
    assert.ok(existsSync(file), `expected cache file at ${file}`);
  } finally {
    // Don't litter the real fixtures dir with test ephemera.
    const key = cacheKey({ method: 'GET', url });
    const file = path.join(CACHE_DIR, key.slice(0, 2), key + '.json');
    tidyCacheFile(file);
  }
});

test('frozen mode throws on a cache miss', async () => {
  const url = uniqueUrl('frozen-miss-' + Date.now());
  await withMode('frozen', async () => {
    await assert.rejects(
      () => cachedFetch(url),
      /cache miss/i,
    );
  });
});

test('invalid mode is rejected', async () => {
  await withMode('blammo', async () => {
    await assert.rejects(() => cachedFetch('https://x/'), /KGX_HTTP_CACHE_MODE=blammo/);
  });
});
