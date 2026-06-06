// Parliament-live proxy + static server.
//
// Zero-dep Node http server that fronts a small whitelist of UK Parliament
// APIs, applies a TTL policy informed by what each API advertises (and what
// the data actually changes like), coalesces concurrent requests, and adds
// CORS + Open Parliament Licence v3.0 attribution to every response.
//
// Run:   node server.mjs
// Open:  http://localhost:8787/
//
// Env:
//   PORT      default 8787
//   VERBOSE   "1" to log one line per request (default: quiet)
//   ALLOW_ORIGIN  default "*"  (set to your hosted origin in prod)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT  = path.join(__dirname, 'web');
const PORT      = Number(process.env.PORT || 8787);
const HOST      = process.env.HOST || '127.0.0.1';
const VERBOSE   = process.env.VERBOSE === '1';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
// PROXY_PASSWORD: when set, /api/* and /_cache require either
//   Authorization: Bearer <password>   (used by JS fetches)
//   or cookie  fpkg_auth=<password>    (used by image src)
// When unset (e.g. local dev), the proxy is open.
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || '';
const AUTH_COOKIE    = 'fpkg_auth';

const OPL_ATTRIBUTION =
  'Contains Parliamentary information licensed under the Open Parliament Licence v3.0 ' +
  '(https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/)';

// ---- Upstream whitelist -----------------------------------------------------

const ROUTES = [
  // /api/now/<zone>/<current|isoDate>
  //   -> https://now-api.parliament.uk/api/Message/message/<zone>/<...>
  { prefix: '/api/now/',
    upstreamHost: 'now-api.parliament.uk',
    upstreamPath: '/api/Message/message/' },

  // /api/members/<...>  ->  https://members-api.parliament.uk/api/<...>
  { prefix: '/api/members/',
    upstreamHost: 'members-api.parliament.uk',
    upstreamPath: '/api/' },

  // /api/hansard/<...>  ->  https://hansard-api.parliament.uk/<...>
  { prefix: '/api/hansard/',
    upstreamHost: 'hansard-api.parliament.uk',
    upstreamPath: '/' },

  // /api/cvotes/<...>   ->  https://commonsvotes-api.parliament.uk/data/<...>
  { prefix: '/api/cvotes/',
    upstreamHost: 'commonsvotes-api.parliament.uk',
    upstreamPath: '/data/' },

  // /api/lvotes/<...>   ->  https://lordsvotes-api.parliament.uk/data/<...>
  { prefix: '/api/lvotes/',
    upstreamHost: 'lordsvotes-api.parliament.uk',
    upstreamPath: '/data/' },

  // /api/sparql?query=...  ->  https://api.parliament.uk/sparql?query=...
  // Marked `public` like the sibling /api/query/ and /kgx/query: all three
  // front openly-published parliamentary RDF (the DDP store) under OPL
  // v3.0, and the upstream api.parliament.uk/sparql is itself CORS-open
  // and unauthenticated (see CLAUDE.md rule 3 table). Gating our wrapper
  // protected nothing the upstream doesn't already expose, while breaking
  // the only page paths that use raw SPARQL — the `recent-sis` starter and
  // the `parl-enrich` augment, both via the `parl-sparql` engine. Per-host
  // rate limiting still applies. The caching + attribution + CORS that rule
  // 3 wants from the proxy remain in force regardless of the auth flag.
  { prefix: '/api/sparql',
    upstreamHost: 'api.parliament.uk',
    upstreamPath: '/sparql',
    public: true,
    exact: true },

  // /api/query/<template>?p=v...  ->  https://api.parliament.uk/query/<template>?p=v...
  // Parameterised query browser — 124 named SPARQL templates over the
  // same DDP store as /api/sparql. Returns JSON-LD with @context +
  // @graph per template. Marked `public` like /kgx/query — DDP data
  // is openly-published RDF under OPL v3.0.
  { prefix: '/api/query/',
    upstreamHost: 'api.parliament.uk',
    upstreamPath: '/query/',
    public: true },

  // /kgx/query?query=...  ->  http://OXIGRAPH_BIND/query?query=...
  // Bundled SPARQL store containing the project's aggregated N-Quads
  // (transparency-graph, scrutiny-graph, accountability-graph,
  // identity-graph, psephology, parliament-lda-terms). Read-only,
  // backed by a RocksDB built at container startup. Routed locally
  // — see special case in buildUpstreamUrl() below. Marked `public`
  // so it bypasses the PROXY_PASSWORD gate that protects /api/* —
  // the data is openly-published parliamentary RDF under OPL v3.0.
  //
  // The legacy path /sparql redirects here (see request handler).
  { prefix: '/kgx/query',
    local: 'oxigraph',
    public: true,
    exact: true },
];

export function matchRoute(reqPath) {
  for (const r of ROUTES) {
    if (r.exact) {
      if (reqPath === r.prefix) return { route: r, tail: '' };
    } else if (reqPath.startsWith(r.prefix)) {
      return { route: r, tail: reqPath.slice(r.prefix.length) };
    }
  }
  return null;
}

// ---- TTL policy -------------------------------------------------------------
//
// See README at top of file. Returns ms.

export function ttlMsFor(route, tail) {
  if (route.prefix === '/api/now/') {
    // tail looks like "CommonsMain/current" or "CommonsMain/2026-04-29T13:00:00Z"
    const m = tail.match(/^[^/]+\/(.+)$/);
    if (!m) return 5_000;
    const datePart = m[1];
    if (datePart === 'current') return 5_000;
    const t = Date.parse(datePart);
    if (Number.isFinite(t) && Date.now() - t > 24 * 3600_000) {
      return 6 * 3600_000;       // historic slide, effectively immutable
    }
    return 5_000;
  }
  if (route.prefix === '/api/members/') {
    if (/\/Thumbnail($|\?)/.test(tail) || /\/Portrait($|\?)/.test(tail)) {
      return 86_400_000;          // images are stable
    }
    return 300_000;               // matches upstream max-age=300
  }
  if (route.prefix === '/api/hansard/') {
    if (/^overview\/lastsittingdate/.test(tail))   return 600_000;
    if (/^overview\/calendar/.test(tail))          return 3600_000;
    if (/^debates\/debate\//.test(tail))           return 86_400_000;
    if (/^debates\/division\//.test(tail))         return 86_400_000;
    if (/^debates\/divisions\//.test(tail))        return 60_000;
    if (/^overview\/sectionsforday/.test(tail))    return 60_000;
    if (/^search/.test(tail))                      return 60_000;
    return 60_000;
  }
  if (route.prefix === '/api/cvotes/' || route.prefix === '/api/lvotes/') {
    if (/^division\/\d+\.json/.test(tail)) return 86_400_000;  // a recorded vote is immutable
    if (/^divisions\/search/.test(tail))   return 600_000;
    return 60_000;
  }
  if (route.prefix === '/api/sparql') {
    return 60_000;
  }
  if (route.prefix === '/api/query/') {
    // Pre-canned templates over the DDP store. Same volatility as the
    // SPARQL endpoint they wrap, so the same minute-level TTL.
    return 60_000;
  }
  if (route.prefix === '/kgx/query') {
    // Bundled store is rebuilt by the data-rebuild workflow; queries
    // are cacheable for the lifetime of the container. Don't cache too
    // long — a redeploy reloads the data and the cache stays valid
    // because cache lives in-process.
    return 600_000;
  }
  return 30_000;
}

// ---- Cache + coalescing -----------------------------------------------------

const cache    = new Map();   // key -> { expires, status, headers, body }
const inflight = new Map();   // key -> Promise<entry>

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
}, 60_000).unref();

// Local bind for the bundled Oxigraph (when route.local === 'oxigraph').
// Container-internal address; never reachable from the public internet.
const OXIGRAPH_BIND = process.env.OXIGRAPH_BIND || '127.0.0.1:7878';

export function buildUpstreamUrl(route, tail, search) {
  if (route.local === 'oxigraph') {
    // Oxigraph's query endpoint lives at /query; we expose /sparql to
    // callers because that's the conventional public path.
    return `http://${OXIGRAPH_BIND}/query${search || ''}`;
  }
  const host = route.upstreamHost;
  const base = route.upstreamPath;
  const pathOut = route.exact ? base : (base + tail);
  return `https://${host}${pathOut}${search || ''}`;
}

// Re-export for tests
export { ROUTES };

// Per-upstream-host rate limit: enforce a minimum gap between successive
// upstream requests to the same host. Caching + coalescing already prevent
// repeat calls for the same URL; this is the *cross-URL* throttle so that
// a burst of distinct fetches (e.g. 12 thumbnails) doesn't hammer one host.
const HOST_GAP_MS = 200;
const lastHostHit = new Map();           // host -> Promise<void> (chain)
function throttleHost(host) {
  const prev = lastHostHit.get(host) || Promise.resolve();
  let resolveNext;
  const next = new Promise(res => { resolveNext = res; });
  // when the prior call has waited its gap, the next can start
  const waited = prev.then(() => new Promise(r => setTimeout(r, HOST_GAP_MS)));
  lastHostHit.set(host, next);
  // resolve `next` once the prior gap has elapsed AND we've started
  return waited.then(() => { resolveNext(); });
}

async function fetchUpstream(url, acceptHeader) {
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
      headers: {
        'content-type': ct,
        'x-upstream-url': url,
      },
      body: buf,
    };
  } finally {
    clearTimeout(t);
  }
}

async function getCached(key, url, ttlMs, acceptHeader) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return { entry: hit, source: 'hit' };

  const pending = inflight.get(key);
  if (pending) return { entry: await pending, source: 'coalesced' };

  const p = (async () => {
    const fresh = await fetchUpstream(url, acceptHeader);
    const entry = { ...fresh, expires: Date.now() + ttlMs, fetchedAt: Date.now() };
    if (fresh.status >= 200 && fresh.status < 400) cache.set(key, entry);
    return entry;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return { entry: await p, source: 'miss' };
}

// ---- Static file serving ----------------------------------------------------

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
  '.rq':   'application/sparql-query; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

async function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  // Extensionless clean URLs: /kgx/playground -> /kgx/playground.html,
  // /kgx/ -> /kgx/index.html. Doesn't shadow paths that exist verbatim.
  let full = path.join(WEB_ROOT, p);
  if (!full.startsWith(WEB_ROOT)) return notFound(res);
  if (!existsSync(full)) {
    // Extensionless clean URL: /kgx/playground -> /kgx/playground.html.
    if (!path.extname(p)) {
      const html = full + '.html';
      if (existsSync(html) && statSync(html).isFile()) full = html;
      else return notFound(res);
    } else {
      return notFound(res);
    }
  } else if (statSync(full).isDirectory()) {
    // Directory request, with OR without trailing slash: /kgx and /kgx/
    // both resolve to /kgx/index.html if it exists.
    const idx = path.join(full, 'index.html');
    if (existsSync(idx) && statSync(idx).isFile()) full = idx;
    else return notFound(res);
  }
  const ext = path.extname(full).toLowerCase();
  const body = await readFile(full);
  setCommonHeaders(res);
  // Always revalidate code-shaped static assets — pages, scripts/modules,
  // stylesheets. We redeploy frequently and a stale module (e.g.
  // /kgx/lib/rel-templates.mjs) referenced by a fresh HTML page is the
  // silent-failure shape that ate the current_constituency POST fix
  // until we noticed.  Images/fonts/JSON stay browser-cacheable.
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
  const REVALIDATE = new Set(['.html', '.mjs', '.js', '.css']);
  if (REVALIDATE.has(ext)) headers['cache-control'] = 'no-cache, must-revalidate';
  res.writeHead(200, headers);
  res.end(body);
}

// ---- Headers + helpers ------------------------------------------------------

function setCommonHeaders(res) {
  res.setHeader('access-control-allow-origin',  ALLOW_ORIGIN);
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-expose-headers',
    'x-cache, x-cache-age, x-ttl, x-upstream-url, x-attribution');
  res.setHeader('x-attribution', OPL_ATTRIBUTION);
}

function notFound(res) {
  setCommonHeaders(res);
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found\n');
}

function authOk(req) {
  if (!PROXY_PASSWORD) return true;
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) {
    if (h.slice(7) === PROXY_PASSWORD) return true;
  }
  const cookies = req.headers['cookie'] || '';
  for (const part of cookies.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === AUTH_COOKIE && decodeURIComponent(v.join('=')) === PROXY_PASSWORD) return true;
  }
  return false;
}

function json(res, status, obj) {
  setCommonHeaders(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// True when the client looks like a browser tab (no Accept, or Accept
// includes text/html). Used to: (a) serve the HTML playground at /sparql
// with no ?query=, (b) rewrite Oxigraph's application/sparql-results+xml
// to a well-known MIME so iOS Safari renders inline instead of saving
// the response as a file with no extension.
export function wantsBrowserView(req) {
  const a = String(req.headers['accept'] || '').toLowerCase();
  if (a === '' || a === '*/*') return true;
  return a.includes('text/html');
}

// ---- Request handler --------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      setCommonHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    // POST: SPARQL clients (Flint, YASGUI, sparql.py, our own SparqlEngine
    // for queries that overflow URL length limits …) need to POST queries
    // that are too long for a GET query string. Cloudflare et al. cap URLs
    // near 8 KB; a 646-item VALUES clause blows that. Allowed paths today:
    //   /kgx/query    -> bundled Oxigraph (raw body, application/sparql-query)
    //   /api/sparql   -> api.parliament.uk/sparql (auth-gated like the GET)
    // Either body shape is piped straight through (application/sparql-query
    // raw or application/x-www-form-urlencoded `query=…`). Not cached —
    // POST body would need hashing for a cache key, and one-shot probe
    // queries don't benefit.
    if (req.method === 'POST') {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const mPost = matchRoute(u.pathname);
      const isAllowedPost = mPost && (
        mPost.route.local === 'oxigraph' || mPost.route.prefix === '/api/sparql'
      );
      if (!isAllowedPost) {
        setCommonHeaders(res);
        res.writeHead(405, { 'content-type': 'text/plain' });
        res.end('method not allowed');
        return;
      }
      // Same auth gate as the GET path. /kgx/query is public; /api/sparql is
      // gated by PROXY_PASSWORD.
      if (!mPost.route.public && !authOk(req)) {
        return json(res, 401, { error: 'unauthorized' });
      }
      const body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
      const upUrl = buildUpstreamUrl(mPost.route, mPost.tail || '', '');
      const upstream = await fetch(upUrl, {
        method: 'POST',
        headers: {
          'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
          'accept': req.headers['accept'] || 'application/sparql-results+json',
        },
        body,
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      setCommonHeaders(res);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
      res.writeHead(upstream.status);
      res.end(buf);
      return;
    }

    if (req.method !== 'GET') {
      setCommonHeaders(res);
      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('method not allowed');
      return;
    }

    const u = new URL(req.url, `http://localhost:${PORT}`);

    // Legacy paths: /sparql → /kgx/query, /sparql.html → /kgx/playground.
    // Preserve the query string so existing ?query=… URLs keep working.
    if (u.pathname === '/sparql') {
      setCommonHeaders(res);
      res.writeHead(301, { location: '/kgx/query' + (u.search || '') });
      return res.end();
    }
    if (u.pathname === '/sparql.html') {
      setCommonHeaders(res);
      res.writeHead(301, { location: '/kgx/playground' });
      return res.end();
    }

    if (u.pathname === '/_health') {
      return json(res, 200, { ok: true, cacheEntries: cache.size, authRequired: !!PROXY_PASSWORD });
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

    const m = matchRoute(u.pathname);
    if (!m) return serveStatic(req, res);

    // /kgx/query with no ?query= AND a browser-style Accept header
    // redirects to the playground UI. iOS Safari otherwise saves
    // Oxigraph's empty-query response as a file with no extension.
    // The playground, Flint and YASGUI all hit /kgx/query directly
    // for actual queries.
    if (m.route.local === 'oxigraph'
        && !u.searchParams.get('query')
        && wantsBrowserView(req)) {
      setCommonHeaders(res);
      res.writeHead(302, { location: '/kgx/playground' });
      return res.end();
    }

    // Public routes — no auth required regardless of PROXY_PASSWORD.
    // /sparql serves the bundled Oxigraph store, which holds only
    // openly-published RDF (UK Parliament, OPL v3.0); no reason to gate
    // it behind the same shared secret as the live-API proxy.
    const isPublic = m.route.public === true;

    if (!isPublic && !authOk(req)) return json(res, 401, { error: 'unauthorized' });

    const ttlMs  = ttlMsFor(m.route, m.tail);
    const upUrl  = buildUpstreamUrl(m.route, m.tail, u.search);
    // Use Accept header in cache key so JSON / CSV / Turtle don't collide.
    const accept = req.headers['accept'] || '';
    const cKey   = upUrl + '||' + accept;
    const t0     = Date.now();
    const { entry, source } = await getCached(cKey, upUrl, ttlMs, accept);

    if (VERBOSE) {
      const age = Date.now() - entry.fetchedAt;
      process.stderr.write(
        `[${new Date().toISOString()}] ${source.padEnd(9)} ttl=${ttlMs}ms age=${age}ms ${u.pathname}${u.search}\n`
      );
    }

    setCommonHeaders(res);
    // For browser tabs hitting /sparql?query=… directly, rewrite Oxigraph's
    // application/sparql-results+{xml,json} to a well-known MIME so iOS
    // Safari renders the response inline. Machine clients that pin Accept
    // get the unrewritten content type via the cache key split.
    let outCt = entry.headers['content-type'] || 'application/octet-stream';
    if (m.route.local === 'oxigraph' && wantsBrowserView(req)) {
      if (outCt.includes('sparql-results+xml'))  outCt = 'application/xml; charset=utf-8';
      else if (outCt.includes('sparql-results+json')) outCt = 'application/json; charset=utf-8';
    }
    res.setHeader('content-type', outCt);
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

// Only start listening when invoked as the entry point. When this module is
// imported (e.g. by tests), the server stays inert.
const invokedAsMain = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsMain) {
  server.listen(PORT, HOST, () => {
    process.stdout.write(`fpkg proxy listening on http://${HOST}:${PORT}/\n`);
    process.stdout.write(`  auth: ${PROXY_PASSWORD ? 'required (PROXY_PASSWORD set)' : 'open (PROXY_PASSWORD unset — dev mode)'}\n`);
    process.stdout.write(`  /api/now/<zone>/<current|isoDate>\n`);
    process.stdout.write(`  /api/members/<MembersApiPath>\n`);
    process.stdout.write(`  /api/hansard/<HansardApiPath>\n`);
    process.stdout.write(`  /api/cvotes/<CommonsVotesPath>  /api/lvotes/<LordsVotesPath>\n`);
    process.stdout.write(`  /api/sparql?query=...\n`);
    process.stdout.write(`  /kgx/query?query=...   (bundled Oxigraph; legacy /sparql redirects here)\n`);
    process.stdout.write(`  /kgx/  /kgx/playground  /kgx/flint  /kgx/yas\n`);
    process.stdout.write(`  /_health  /_cache\n`);
  });
}

export { server };
