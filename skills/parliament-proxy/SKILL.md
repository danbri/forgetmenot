---
name: uk-parliament-proxy
description: Build a small zero-dep Node http server that fronts a whitelist of UK Parliament APIs with TTL cache, request coalescing, per-host throttling, CORS, and Open Parliament Licence v3.0 attribution. Use whenever you need a browser-callable endpoint that points at parliament.uk APIs (which do not allow CORS), or are spinning up a new demo under demos/. Pairs with every other facility skill in this repo — those skills tell you which endpoints to whitelist and what TTL is sensible.
---

# UK Parliament proxy server

Parliament APIs do not allow CORS, so a browser page **cannot** call
`*.parliament.uk` directly. Every demo here goes through a tiny Node
proxy that:

- whitelists a fixed set of upstream APIs,
- applies a per-route TTL cache,
- coalesces concurrent requests for the same URL,
- throttles per upstream host (so a burst of distinct fetches doesn't
  hammer one origin),
- adds CORS + the Open Parliament Licence v3.0 attribution to every
  response,
- serves a static `web/` directory for the demo's HTML/JS/CSS,
- exposes `/_health` and `/_cache` for ops.

The shared core lives at [`lib/proxy.mjs`](../../lib/proxy.mjs). Demos
declare their **routes** and **TTL policy**; the mechanics are reused.

## Why this is a separate skill

Multiple demos need the same proxy mechanics — the very first one,
[`demos/parliament-live`](../../demos/parliament-live), wrote them
inline; later ones (`demos/instruments-by-act`, anything new under
`demos/`) import from `lib/proxy.mjs`. Treating the proxy as its own
skill stops every demo re-implementing cache + CORS + attribution from
scratch (and getting them subtly wrong).

## Hard rules

These are non-negotiable for any demo using this skill:

1. **The proxy is the only path.** A page must never call
   `*.parliament.uk` directly. Always go via `/api/...` on the same
   origin (or absolute `http://localhost:PORT/api/...` if loaded from a
   different origin). Parliament APIs do not allow CORS.
2. **OPL attribution is non-negotiable.** Every page must visibly carry
   "Contains Parliamentary information licensed under the Open
   Parliament Licence v3.0" with a link to the licence. Every proxy
   response carries the same in `X-Attribution`. This is a licence
   condition, not a stylistic choice.
3. **No semantic logic in the whitelist.** The proxy is whitelist +
   cache + attribution + CORS. Decisions about *which* fields to
   render, *which* entities to follow, *what* to display — those are
   app concerns, in the page or in `extraRoutes` handlers. The proxy
   itself is a "dumb pipe with policy".
4. **Don't impersonate.** The Royal Arms and Crowned Portcullis are
   explicitly excluded from the OPL — never use them. "UK Parliament"
   appears only in factual data-source labels and in the OPL
   attribution; the page itself reads as a third-party prototype.
5. **TTL must reflect mutability.** Live data (`now-api`) ≤ 5 s.
   Search results 60–600 s. Recorded immutable resources (Hansard
   debate text, recorded divisions, member portraits) hours to a day.
   Never extend a TTL beyond what the data's mutability supports. Read
   the comments at the top of each demo's `server.mjs` for prior art.

## Usage

```js
import { createProxy, OPL_ATTRIBUTION } from '../../lib/proxy.mjs';

const ROUTES = [
  // /api/si/<...>  ->  https://statutoryinstruments-api.parliament.uk/api/v2/<...>
  { prefix: '/api/si/',
    upstreamHost: 'statutoryinstruments-api.parliament.uk',
    upstreamPath: '/api/v2/' },
];

function ttlPolicy(route, tail) {
  if (route.prefix === '/api/si/') {
    if (/^StatutoryInstrument\/\w+$/.test(tail)) return 24 * 3600_000; // detail
    return 600_000;                                                    // search
  }
  return 60_000;
}

const { listen } = createProxy({
  routes: ROUTES,
  ttlPolicy,
  webRoot: new URL('./web', import.meta.url).pathname,
  port: 8788,
  // App-specific endpoints that aren't a single upstream — typically
  // server-side aggregations across many upstream calls. They reuse
  // the proxy's cache + throttle via the `ctx` argument.
  extraRoutes: [
    { method: 'GET', path: '/api/agg/instruments-by-act',
      handler: async (req, res, ctx) => { /* fetch + bucket + json */ } },
  ],
});

listen(({ port }) => console.log(`listening on http://127.0.0.1:${port}/`));
```

### Route shape

```ts
type Route = {
  prefix: string;           // e.g. '/api/si/'
  upstreamHost: string;     // e.g. 'statutoryinstruments-api.parliament.uk'
  upstreamPath: string;     // e.g. '/api/v2/'
  exact?: boolean;          // when true, prefix must match exactly
                            // (used for fixed query endpoints like /api/sparql)
};
```

### TTL policy

A function `(route, tail) => ms`. The `tail` is what comes after
`route.prefix`. Bucket by route, then by sub-pattern. Always comment
*why* a TTL is what it is so a future reader can tell whether the data
mutability has changed.

### Extra routes (server-side aggregation)

Use these for endpoints that aren't a single proxied upstream — most
often, an aggregation that fans out N requests, buckets the results,
and returns a small JSON. Reach for `ctx.getCached(key, url, ttlMs,
accept, ctx.throttleHost)` so each upstream call still goes through
the cache and per-host throttle. **Do not** fetch with bare `fetch()`
inside extra-route handlers; that bypasses the cache.

The `ctx` passed to handlers exposes:

- `ROUTES`, `matchRoute`, `buildUpstreamUrl` — for resolving a
  whitelisted upstream URL programmatically
- `cache`, `getCached`, `throttleHost`, `fetchUpstream` — caching +
  throttle primitives
- `setCommonHeaders(res)`, `json(res, status, obj)`, `notFound(res)` —
  response helpers
- `attribution`, `authOk(req)` — OPL string + auth check

Return `false` from a handler to fall through to the next matcher
(static / proxy). Otherwise the handler is expected to write the
response itself.

## Diagnostics

- `GET /_health`  → `{ok:true, cacheEntries, authRequired}`
- `GET /_cache`   → cache contents (keys + age + TTL remaining); requires auth if password set

## Auth

Set `PROXY_PASSWORD` (or pass `password`) and the proxy gates `/api/*`
+ `/_cache`. JS clients send `Authorization: Bearer <password>`;
browser image tags use the `fpkg_auth` cookie. When unset (e.g. local
dev), the proxy is open.

## Existing demos

| Demo | Routes | Notes |
|---|---|---|
| [`demos/parliament-live`](../../demos/parliament-live) | now, members, hansard, commons-votes, lords-votes, sparql | The original; predates this shared lib and still has its proxy core inline. Migration to `lib/proxy.mjs` is mechanical and welcomed. |
| [`demos/instruments-by-act`](../../demos/instruments-by-act) | statutoryinstruments | First user of `lib/proxy.mjs`. Adds an `/api/agg/instruments-by-act` aggregator that buckets SIs by laying-date for one or more enabling Acts. |

## When you extend a demo

1. Read the `SKILL.md` of the upstream API you want to add (e.g.
   [`skills/statutory-instruments`](../statutory-instruments/SKILL.md))
   so you know the parameter shape and pagination quirks.
2. Add the route + TTL policy.
3. Probe the endpoint with `curl` and read the actual JSON keys
   **before** writing a renderer or aggregator — pattern-matching
   from a sibling endpoint produces confidently-wrong field names.
4. If your aggregation could fan out to many upstream calls, prefer an
   `extraRoutes` handler that uses `ctx.getCached` so the work is
   shared across users and survives a page reload.
