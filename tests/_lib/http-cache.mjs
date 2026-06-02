// =============================================================================
// tests/_lib/http-cache.mjs — two-tier record/replay HTTP cache
//
// Why two tiers:
//
//   Tier 1 — COMMITTED SUMMARY at  tests/fixtures/http-cache/<aa>/<key>.json
//            Small JSON: status, vars, rows, bindHash, sample (first 3
//            bindings), recorded timestamp. ~1-5 KB per response. This is
//            what's diffable in PRs and what CI replays from.
//
//   Tier 2 — RUNTIME FULL BODY at  /tmp/kgx-http-cache/<aa>/<key>.body
//            The exact bytes returned by the upstream. Ephemeral (/tmp
//            survives reboots on most setups but isn't authoritative).
//            Local re-runs go through here so iteration speed matches the
//            old "full body in fixtures" feel without 6 MB-per-fixture
//            git bloat.
//
// Reading order (mode 'cache' or 'frozen'):
//   1. If /tmp has the full body, serve it. Fast, exact.
//   2. Else if a committed summary exists AND mode is 'frozen', SYNTHESIZE
//      a Response from `{ head:{vars}, results:{bindings: sample} }`.
//      Tests that need only `vars + rows + bindHash` work fine. Tests that
//      iterate every binding will see only the 3 samples — that's a
//      deliberate trade for hermetic CI.
//   3. Mode 'cache' may fetch live and write both tiers.
//   4. Mode 'live' always fetches; writes both tiers anyway so the next
//      run is fast.
//   5. Mode 'frozen' with no /tmp AND no summary throws.
//
// Cache key: sha256(METHOD + "\n" + url + "\n" + accept-header + "\n" + body)
//
// Re-record a fixture: `rm tests/fixtures/http-cache/aa/<key>.json` and
// re-run tests in mode 'cache' (default).  Drop /tmp by `rm -rf
// /tmp/kgx-http-cache` if you want a hard live-refresh.
// =============================================================================

import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  statSync, readdirSync, unlinkSync, rmdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SUMMARY_DIR = path.join(__dirname, '..', 'fixtures', 'http-cache');
const FULL_DIR    = path.join(os.tmpdir(), 'kgx-http-cache');
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

function summaryPath(key) {
  return path.join(SUMMARY_DIR, key.slice(0, 2), key + '.json');
}
function fullPath(key) {
  return path.join(FULL_DIR, key.slice(0, 2), key + '.body');
}

function bindHashOf(bindings) {
  // sha256 over canonical-ordered JSON of each binding. Stable across row
  // re-orderings (most SPARQL engines don't guarantee row order).
  const rows = bindings.map((b) => {
    const keys = Object.keys(b).sort();
    const sorted = {};
    for (const k of keys) sorted[k] = b[k];
    return JSON.stringify(sorted);
  });
  rows.sort();
  return 'sha256:' + createHash('sha256').update('[' + rows.join(',') + ']').digest('hex');
}

function summarize(url, method, status, contentType, text) {
  const base = {
    meta: { method, url, recordedAt: new Date().toISOString() },
    status,
    contentType,
  };
  try {
    const json = JSON.parse(text);
    const bindings = json?.results?.bindings ?? [];
    const vars     = json?.head?.vars ?? [];
    return {
      ...base,
      shape:    'sparql-results-json',
      vars,
      rows:     bindings.length,
      bindHash: bindHashOf(bindings),
      sample:   bindings.slice(0, 3),
    };
  } catch {
    return {
      ...base,
      shape: 'opaque',
      bodyLength: text.length,
      bodyPreview: text.slice(0, 200),
    };
  }
}

function synthesizeFromSummary(summary) {
  // Only meaningful for SPARQL-shape summaries: rebuild a Response whose
  // body parses to head/vars + results.bindings = sample. Tests that
  // assert on `vars` or summary-aggregate fields work; tests that scan
  // every binding will see only the 3 sample rows. That's the deliberate
  // trade for hermetic frozen-mode CI without large fixtures.
  if (summary.shape !== 'sparql-results-json') {
    return new Response(summary.bodyPreview || '', {
      status: summary.status || 200,
      headers: { 'content-type': summary.contentType || 'text/plain' },
    });
  }
  const synthetic = JSON.stringify({
    head:    { vars: summary.vars || [] },
    results: { bindings: summary.sample || [] },
  });
  return new Response(synthetic, {
    status: summary.status || 200,
    headers: { 'content-type': summary.contentType || 'application/sparql-results+json' },
  });
}

// Public surface (matches a subset of global fetch).
export async function cachedFetch(url, init = {}) {
  const method  = init.method  || 'GET';
  const body    = init.body    || '';
  const headers = init.headers || {};
  const key     = cacheKey({ method, url, body, headers });
  const sumF    = summaryPath(key);
  const fullF   = fullPath(key);
  const m       = mode();

  // 1. /tmp full body always wins when present + mode allows it.
  if (m !== 'live' && existsSync(fullF)) {
    const buf  = readFileSync(fullF);
    const meta = existsSync(sumF) ? JSON.parse(readFileSync(sumF, 'utf8')) : {};
    return new Response(buf, {
      status: meta.status || 200,
      headers: { 'content-type': meta.contentType || 'application/octet-stream' },
    });
  }

  // 2. Frozen mode: synthesize from summary, or throw.
  if (m === 'frozen') {
    if (existsSync(sumF)) return synthesizeFromSummary(JSON.parse(readFileSync(sumF, 'utf8')));
    throw new Error(
      `cachedFetch frozen: no /tmp body AND no summary for ${method} ${url} ` +
      `(key ${key.slice(0, 12)}…). Pre-warm /tmp by running once in 'cache' mode.`,
    );
  }

  // 3. Live fetch (mode 'cache' or 'live').
  const res = await fetch(url, init);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  const status = res.status;
  const contentType = res.headers.get('content-type') || '';

  // 4. Persist both tiers. Even mode 'live' writes them so the next run
  //    is fast; 'live' just guarantees this run hits the network.
  mkdirSync(path.dirname(fullF), { recursive: true });
  writeFileSync(fullF, buf);
  mkdirSync(path.dirname(sumF), { recursive: true });
  writeFileSync(sumF, JSON.stringify(summarize(url, method, status, contentType, text), null, 2));

  return new Response(buf, {
    status,
    headers: { 'content-type': contentType || 'application/octet-stream' },
  });
}

// Read a committed summary for assertions / drift checks. Returns null if
// no fixture is present.
export function readSummary(url, init = {}) {
  const method  = init.method  || 'GET';
  const body    = init.body    || '';
  const headers = init.headers || {};
  const key = cacheKey({ method, url, body, headers });
  const sumF = summaryPath(key);
  if (!existsSync(sumF)) return null;
  return JSON.parse(readFileSync(sumF, 'utf8'));
}

// Test ephemera cleanup. Wipes only the named CACHE_DIRs.
export function clearCache() {
  const wipe = (root) => {
    if (!existsSync(root)) return;
    const rec = (p) => {
      const s = statSync(p);
      if (s.isDirectory()) {
        for (const e of readdirSync(p)) rec(path.join(p, e));
        rmdirSync(p);
      } else unlinkSync(p);
    };
    rec(root);
  };
  wipe(SUMMARY_DIR);
  wipe(FULL_DIR);
}

export { SUMMARY_DIR, FULL_DIR };
