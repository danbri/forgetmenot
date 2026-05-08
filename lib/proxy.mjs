// Shared UK Parliament API proxy core.
//
// Several demos in this repo (and likely future ones) need the same
// thing: a tiny zero-dep Node http server that
//
//   - whitelists a small set of UK Parliament APIs,
//   - applies a TTL cache (different per route),
//   - coalesces concurrent requests for the same URL,
//   - throttles per upstream host,
//   - adds CORS + Open Parliament Licence attribution to every response,
//   - serves static files from a webRoot directory.
//
// Parliament APIs do not allow CORS, so the page can never call them
// directly — the proxy is the only path. Each demo declares its routes
// and a TTL policy; the mechanics live here.
//
// Documented as a skill at skills/parliament-proxy/SKILL.md.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const OPL_ATTRIBUTION =
  'Contains Parliamentary information licensed under the Open Parliament Licence v3.0 ' +
  '(https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/)';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

export function makeMatchRoute(routes) {
  return function matchRoute(reqPath) {
    for (const r of routes) {
      if (r.exact) {
        if (reqPath === r.prefix) return { route: r, tail: '' };
      } else if (reqPath.startsWith(r.prefix)) {
        return { route: r, tail: reqPath.slice(r.prefix.length) };
      }
    }
    return null;
  };
}

export function buildUpstreamUrl(route, tail, search) {
  const base = route.upstreamPath;
  const pathOut = route.exact ? base : (base + tail);
  return `https://${route.upstreamHost}${pathOut}${search || ''}`;
}

// Per-host pacer: enforce a minimum gap between successive upstream
// requests to the same origin. Caching + coalescing already prevent
// repeat calls for the *same* URL; this is the cross-URL throttle so
// a burst of distinct fetches doesn't hammer one host.
function makeHostThrottle(hostGapMs) {
  const lastHostHit = new Map();
  return function throttleHost(host) {
    const prev = lastHostHit.get(host) || Promise.resolve();
    let resolveNext;
    const next = new Promise(res => { resolveNext = res; });
    const waited = prev.then(() => new Promise(r => setTimeout(r, hostGapMs)));
    lastHostHit.set(host, next);
    return waited.then(() => { resolveNext(); });
  };
}

async function fetchUpstream(url, acceptHeader, throttleHost) {
  const u = new URL(url);
  await throttleHost(u.host);
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), 30_000);
  try {
    const headers = {};
    if (acceptHeader) headers['accept'] = acceptHeader;
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow', headers });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct  = res.headers.get('content-type') || 'application/octet-stream';
    return {
      status: res.status,
      headers: { 'content-type': ct, 'x-upstream-url': url },
      body: buf,
    };
  } finally {
    clearTimeout(t);
  }
}

// In-process LRU-ish TTL cache + concurrent-request coalescing.
function makeCache() {
  const cache    = new Map();
  const inflight = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
  }, 60_000);
  sweep.unref();

  async function getCached(key, url, ttlMs, acceptHeader, throttleHost) {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return { entry: hit, source: 'hit' };

    const pending = inflight.get(key);
    if (pending) return { entry: await pending, source: 'coalesced' };

    const p = (async () => {
      const fresh = await fetchUpstream(url, acceptHeader, throttleHost);
      const entry = { ...fresh, expires: Date.now() + ttlMs, fetchedAt: Date.now() };
      if (fresh.status >= 200 && fresh.status < 400) cache.set(key, entry);
      return entry;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return { entry: await p, source: 'miss' };
  }

  return { cache, getCached };
}

function cookiesOf(req) {
  const cookies = req.headers['cookie'] || '';
  const out = {};
  for (const part of cookies.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

// ----------------------------------------------------------------------------
// createProxy({ routes, ttlPolicy, webRoot, ... }) -> { server, listen, ... }
// ----------------------------------------------------------------------------
//
// `routes`:        Array<{ prefix, upstreamHost, upstreamPath, exact? }>
// `ttlPolicy`:     (route, tail) => ms
// `webRoot`:       absolute path to static dir (index.html lives here)
// `attribution`:   string for X-Attribution header (default: OPL v3.0)
// `port`/`host`:   defaults 8787 / 127.0.0.1
// `password`:      when set, /api/* and /_cache require Bearer / cookie
// `allowOrigin`:   default '*'
// `hostGapMs`:     min gap between calls to the same upstream host (default 200)
// `verbose`:       log one line per proxied request
// `extraRoutes`:   Array<{ method, path | matcher, handler(req, res, ctx) }>
//                  ctx exposes { ROUTES, getCached, cache, throttleHost,
//                                buildUpstreamUrl, setCommonHeaders, json,
//                                attribution }
//                  Handlers run BEFORE proxy matching and can short-circuit
//                  the request (return truthy to consume it).

export function createProxy(opts) {
  const ROUTES         = opts.routes;
  const ttlPolicy      = opts.ttlPolicy;
  const WEB_ROOT       = opts.webRoot;
  const attribution    = opts.attribution || OPL_ATTRIBUTION;
  const PORT           = Number(opts.port || process.env.PORT || 8787);
  const HOST           = opts.host || process.env.HOST || '127.0.0.1';
  const PASSWORD       = opts.password ?? process.env.PROXY_PASSWORD ?? '';
  const ALLOW_ORIGIN   = opts.allowOrigin || process.env.ALLOW_ORIGIN || '*';
  const HOST_GAP_MS    = Number(opts.hostGapMs || 200);
  const VERBOSE        = opts.verbose ?? (process.env.VERBOSE === '1');
  const AUTH_COOKIE    = opts.authCookie || 'fpkg_auth';
  const extraRoutes    = opts.extraRoutes || [];

  if (!Array.isArray(ROUTES))    throw new Error('createProxy: routes[] required');
  if (typeof ttlPolicy !== 'function') throw new Error('createProxy: ttlPolicy fn required');
  if (!WEB_ROOT)                 throw new Error('createProxy: webRoot required');

  const matchRoute   = makeMatchRoute(ROUTES);
  const throttleHost = makeHostThrottle(HOST_GAP_MS);
  const { cache, getCached } = makeCache();

  function setCommonHeaders(res) {
    res.setHeader('access-control-allow-origin',  ALLOW_ORIGIN);
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-expose-headers',
      'x-cache, x-cache-age, x-ttl, x-upstream-url, x-attribution');
    res.setHeader('x-attribution', attribution);
  }

  function notFound(res) {
    setCommonHeaders(res);
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  }

  function json(res, status, obj) {
    setCommonHeaders(res);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  }

  function authOk(req) {
    if (!PASSWORD) return true;
    const h = req.headers['authorization'] || '';
    if (h.startsWith('Bearer ') && h.slice(7) === PASSWORD) return true;
    if (cookiesOf(req)[AUTH_COOKIE] === PASSWORD) return true;
    return false;
  }

  async function serveStatic(req, res) {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const full = path.join(WEB_ROOT, p);
    if (!full.startsWith(WEB_ROOT)) return notFound(res);
    if (!existsSync(full) || !statSync(full).isFile()) return notFound(res);
    const ext  = path.extname(full).toLowerCase();
    const body = await readFile(full);
    setCommonHeaders(res);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    // index.html: always revalidate (we redeploy frequently and a stale
    // index keeps referring to fixed-and-gone JS).
    if (ext === '.html') headers['cache-control'] = 'no-cache, must-revalidate';
    res.writeHead(200, headers);
    res.end(body);
  }

  // Context object passed into extra-route handlers so they can reuse
  // the cache, hit upstream APIs through the same throttle, etc.
  const ctx = {
    ROUTES, matchRoute, buildUpstreamUrl,
    cache, getCached, throttleHost, fetchUpstream,
    setCommonHeaders, json, notFound, attribution, authOk,
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        setCommonHeaders(res);
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== 'GET') {
        setCommonHeaders(res);
        res.writeHead(405, { 'content-type': 'text/plain' });
        res.end('method not allowed');
        return;
      }

      const u = new URL(req.url, `http://localhost:${PORT}`);

      // Built-in diagnostics.
      if (u.pathname === '/_health') {
        return json(res, 200, { ok: true, cacheEntries: cache.size, authRequired: !!PASSWORD });
      }
      if (u.pathname === '/_cache') {
        if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
        const rows = [...cache.entries()].map(([k, v]) => ({
          key: k, status: v.status,
          ageMs: Date.now() - v.fetchedAt,
          ttlRemainingMs: v.expires - Date.now(),
        }));
        return json(res, 200, { entries: rows });
      }

      // App-specific extra routes (e.g. /api/agg/...).
      for (const r of extraRoutes) {
        const matches = r.path
          ? u.pathname === r.path
          : (typeof r.matcher === 'function' && r.matcher(u.pathname));
        if (!matches) continue;
        if (r.method && r.method !== req.method) continue;
        if (r.auth !== false && !authOk(req)) return json(res, 401, { error: 'unauthorized' });
        const handled = await r.handler(req, res, { ...ctx, url: u });
        if (handled !== false) return;          // false means "fall through"
      }

      // Whitelisted proxy.
      const m = matchRoute(u.pathname);
      if (!m) return serveStatic(req, res);
      if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });

      const ttlMs  = ttlPolicy(m.route, m.tail);
      const upUrl  = buildUpstreamUrl(m.route, m.tail, u.search);
      const accept = req.headers['accept'] || '';
      const cKey   = upUrl + '||' + accept;
      const { entry, source } = await getCached(cKey, upUrl, ttlMs, accept, throttleHost);

      if (VERBOSE) {
        const age = Date.now() - entry.fetchedAt;
        process.stderr.write(
          `[${new Date().toISOString()}] ${source.padEnd(9)} ttl=${ttlMs}ms age=${age}ms ${u.pathname}${u.search}\n`,
        );
      }

      setCommonHeaders(res);
      res.setHeader('content-type', entry.headers['content-type']);
      res.setHeader('x-cache', source);
      res.setHeader('x-cache-age', String(Date.now() - entry.fetchedAt));
      res.setHeader('x-ttl', String(ttlMs));
      res.setHeader('x-upstream-url', entry.headers['x-upstream-url']);
      res.writeHead(entry.status);
      res.end(entry.body);
    } catch (err) {
      process.stderr.write(`[error] ${err.stack || err}\n`);
      setCommonHeaders(res);
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'upstream_failure', detail: String(err.message || err) }));
    }
  });

  function listen(cb) {
    server.listen(PORT, HOST, () => cb && cb({ port: PORT, host: HOST, authRequired: !!PASSWORD }));
  }

  return {
    server, listen, ctx,
    matchRoute, buildUpstreamUrl, getCached, cache, throttleHost,
    PORT, HOST, ROUTES, attribution,
  };
}

// Convenience helper: a tiny URLSearchParams-aware GET that goes through
// the proxy's cache + throttle. Useful for app-specific aggregation
// endpoints — they should NEVER bypass the cache, otherwise rebuilding
// an aggregation triggers fresh upstream calls every time.
export async function cachedGet(ctx, route, tail, search, ttlMs) {
  const url = buildUpstreamUrl(route, tail, search);
  const key = url + '||application/json';
  const { entry } = await ctx.getCached(key, url, ttlMs, 'application/json', ctx.throttleHost);
  return entry;
}
