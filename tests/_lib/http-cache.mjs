// =============================================================================
// tests/_lib/http-cache.mjs — record/replay HTTP cache for tests
//
// Tests that need a real SPARQL response (or any HTTP fetch) call
// `cachedFetch(url, init)` instead of `fetch`. On first run the request
// goes live and the response is written to disk; subsequent runs read
// from disk and never touch the network.
//
// Cache directory: tests/fixtures/http-cache/<aa>/<full-sha256>.json
// (sharded by first two hex chars so directories don't grow unbounded).
//
// Cache key: sha256(method  + "\n" + url + "\n" + accept-header + "\n" + body)
//   - method case-normalised
//   - body either a string or a Buffer
//   - accept-header pulled out separately because the same URL+body can
//     return different content-types on negotiation
//
// Modes (env KGX_HTTP_CACHE_MODE):
//   cache  (default) - read from disk if present, otherwise fetch live + write
//   live              - always fetch, never read or write (re-record by hand)
//   frozen            - only read; throw on miss (use in CI for hermetic runs)
//
// Re-record: `rm -rf tests/fixtures/http-cache/` then `npm test`.
// The cache files are checked into git so drift on the upstream is visible
// in the diff when a re-record happens.
//
// Underscore-prefixed directory so `node --test 'tests/**/*.test.mjs'`
// patterns that match unit/ + integration/ don't pick this up.
// =============================================================================

import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  statSync, readdirSync, unlinkSync, rmdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = path.join(__dirname, '..', 'fixtures', 'http-cache');
const VALID_MODES = new Set(['cache', 'live', 'frozen']);

function mode() {
  const m = (process.env.KGX_HTTP_CACHE_MODE || 'cache').toLowerCase();
  if (!VALID_MODES.has(m)) {
    throw new Error(`KGX_HTTP_CACHE_MODE=${m} not in ${[...VALID_MODES].join(', ')}`);
  }
  return m;
}

function asString(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return String(body);
}

function acceptOf(headers) {
  if (!headers) return '';
  // Tolerate Headers / plain object / array-of-pairs.
  if (typeof headers.get === 'function') return headers.get('accept') || '';
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'accept') return headers[k];
  }
  return '';
}

export function cacheKey({ method = 'GET', url, body = '', headers = {} } = {}) {
  if (!url) throw new Error('cacheKey: url is required');
  const h = createHash('sha256');
  h.update(String(method).toUpperCase()); h.update('\n');
  h.update(String(url));                  h.update('\n');
  h.update(acceptOf(headers));            h.update('\n');
  h.update(asString(body));
  return h.digest('hex');
}

function cachePath(key) {
  return path.join(CACHE_DIR, key.slice(0, 2), key + '.json');
}

// Drop-in replacement for global fetch, with a disk cache between us
// and the network. Returns a Response-shaped object.
export async function cachedFetch(url, init = {}) {
  const method  = init.method  || 'GET';
  const body    = init.body    || '';
  const headers = init.headers || {};
  const key     = cacheKey({ method, url, body, headers });
  const file    = cachePath(key);
  const m       = mode();

  if (m !== 'live' && existsSync(file)) {
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    return new Response(rec.body, { status: rec.status, headers: rec.headers });
  }

  if (m === 'frozen') {
    throw new Error(
      `cachedFetch: cache miss for ${method} ${url} (key ${key.slice(0, 12)}…); ` +
      `KGX_HTTP_CACHE_MODE=frozen requires every request to be pre-recorded. ` +
      `Re-record with: rm -rf ${path.relative(process.cwd(), CACHE_DIR)} && npm test`,
    );
  }

  const res = await fetch(url, init);
  const text = await res.text();

  if (m === 'cache') {
    mkdirSync(path.dirname(file), { recursive: true });
    const bodyPreview = asString(body).slice(0, 200);
    writeFileSync(file, JSON.stringify({
      meta: {
        method, url,
        recordedAt: new Date().toISOString(),
        bodyPreview: bodyPreview || undefined,
      },
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: text,
    }, null, 2));
  }

  return new Response(text, { status: res.status, headers: Object.fromEntries(res.headers.entries()) });
}

// Wipe the on-disk cache. Bounded to CACHE_DIR — never deletes anything else.
export function clearCache() {
  if (!existsSync(CACHE_DIR)) return;
  const wipe = (p) => {
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const e of readdirSync(p)) wipe(path.join(p, e));
      rmdirSync(p);
    } else {
      unlinkSync(p);
    }
  };
  wipe(CACHE_DIR);
}

export { CACHE_DIR };
