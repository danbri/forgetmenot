// instruments-by-act — proxy + static + server-side aggregation.
//
// Run:   node server.mjs
// Open:  http://localhost:8788/
//
// Whitelists the Statutory Instruments API and adds two aggregation
// endpoints used by web/index.html:
//
//   GET /api/agg/acts?term=<q>&take=20
//     → list of Acts of Parliament matching <q>, with counts of how
//       many SIs each one has enabled (so the search UI can rank
//       useful enabling Acts above one-offs).
//
//   GET /api/agg/instruments-by-act?actId=<id>&bucket=week|month
//     → { actId, name, count, buckets:[{date, count}] }
//       paginates the SI search server-side, buckets by laying date,
//       returns a small JSON.
//
// Both reuse the proxy's cache + per-host throttle via ctx.getCached so
// repeat aggregations don't refetch upstream and concurrent requests
// for the same actId are coalesced.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxy, OPL_ATTRIBUTION } from '../../lib/proxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT  = path.join(__dirname, 'web');

// ---- Routes -----------------------------------------------------------------

export const ROUTES = [
  // /api/si/<...>  ->  https://statutoryinstruments-api.parliament.uk/api/v2/<...>
  { prefix: '/api/si/',
    upstreamHost: 'statutoryinstruments-api.parliament.uk',
    upstreamPath: '/api/v2/' },
];

// ---- TTL policy -------------------------------------------------------------
//
// SIs are append-only from the page's POV: new ones land but old ones
// don't change. An SI's per-id detail is effectively immutable once
// laid; search results gain entries roughly weekly. Be generous.
export function ttlPolicy(route, tail) {
  if (route.prefix === '/api/si/') {
    if (/^StatutoryInstrument\/[A-Za-z0-9]+$/.test(tail)) return 24 * 3600_000;
    if (/^ActOfParliament\/[A-Za-z0-9]+$/.test(tail))     return 24 * 3600_000;
    if (/^Procedure(\/|$)/.test(tail))                    return 24 * 3600_000;
    if (/^LayingBody/.test(tail))                         return 24 * 3600_000;
    return 3600_000;                          // searches: 1h
  }
  return 60_000;
}

// ---- Aggregation helpers ----------------------------------------------------

const SI_ROUTE = ROUTES[0];
const PAGE_SIZE = 200;
const AGG_TTL = 6 * 3600_000;   // re-bucketed ≤4× a day

// Pick one laying date for an SI. Spec is "before Parliament", so pick
// the *earlier* of the two House laying dates. If neither is set, fall
// back to paperMadeDate (the date the SI was made by the minister —
// some SIs are made and laid simultaneously).
export function layingDateOf(siValue) {
  const commons = siValue.commonsLayingDate;
  const lords   = siValue.lordsLayingDate;
  if (commons && lords) return commons < lords ? commons : lords;
  return commons || lords || siValue.paperMadeDate || null;
}

// "2020-W12" or "2020-03"
export function bucketKey(dateIso, bucket) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  if (bucket === 'month') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  // ISO week
  const day = d.getUTCDay() || 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Fetch one page of SI search results through the proxy's cache.
async function siPage(ctx, params) {
  const search = '?' + new URLSearchParams(params).toString();
  const url    = `https://${SI_ROUTE.upstreamHost}${SI_ROUTE.upstreamPath}StatutoryInstrument${search}`;
  const key    = url + '||application/json';
  const ttl    = ttlPolicy(SI_ROUTE, 'StatutoryInstrument' + search);
  const { entry } = await ctx.getCached(key, url, ttl, 'application/json', ctx.throttleHost);
  if (entry.status >= 400) {
    const body = entry.body.toString('utf8').slice(0, 200);
    throw new Error(`SI upstream ${entry.status}: ${body}`);
  }
  return JSON.parse(entry.body.toString('utf8'));
}

async function actDetail(ctx, actId) {
  const url   = `https://${SI_ROUTE.upstreamHost}${SI_ROUTE.upstreamPath}ActOfParliament/${encodeURIComponent(actId)}`;
  const key   = url + '||application/json';
  const ttl   = ttlPolicy(SI_ROUTE, `ActOfParliament/${actId}`);
  const { entry } = await ctx.getCached(key, url, ttl, 'application/json', ctx.throttleHost);
  if (entry.status >= 400) return null;
  return JSON.parse(entry.body.toString('utf8'));
}

async function actSearch(ctx, term) {
  const search = '?' + new URLSearchParams({ Name: term, Take: 50 }).toString();
  const url    = `https://${SI_ROUTE.upstreamHost}${SI_ROUTE.upstreamPath}ActOfParliament${search}`;
  const key    = url + '||application/json';
  const { entry } = await ctx.getCached(key, url, AGG_TTL, 'application/json', ctx.throttleHost);
  if (entry.status >= 400) {
    const body = entry.body.toString('utf8').slice(0, 200);
    throw new Error(`Acts upstream ${entry.status}: ${body}`);
  }
  return JSON.parse(entry.body.toString('utf8'));
}

// Walk every SI under an Act and build a date-bucket histogram.
// We rely on the upstream cache for both pages and the aggregation
// itself (the cache key includes Skip/Take so re-walks are free).
export async function aggregateByAct(ctx, actId, bucket) {
  // First page also tells us totalResults.
  const first = await siPage(ctx, { ActOfParliamentId: actId, Take: PAGE_SIZE, Skip: 0 });
  const total = first.totalResults || (first.items?.length ?? 0);
  const counts = new Map();   // bucketKey -> count
  let dateMin = null, dateMax = null;

  function ingest(items) {
    for (const it of items) {
      const v = it.value || it;
      const date = layingDateOf(v);
      if (!date) continue;
      const k = bucketKey(date, bucket);
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
      const ymd = date.slice(0, 10);
      if (!dateMin || ymd < dateMin) dateMin = ymd;
      if (!dateMax || ymd > dateMax) dateMax = ymd;
    }
  }
  ingest(first.items || []);
  for (let skip = PAGE_SIZE; skip < total; skip += PAGE_SIZE) {
    const page = await siPage(ctx, { ActOfParliamentId: actId, Take: PAGE_SIZE, Skip: skip });
    ingest(page.items || []);
  }

  const buckets = [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  return { actId, count: total, dateMin, dateMax, bucket, buckets };
}

// ---- Extra routes -----------------------------------------------------------

const extraRoutes = [
  // Resolve a search term to a ranked list of Acts. We fan out one
  // SI search per candidate to get the "how many SIs has this Act
  // enabled" badge — capped at 12 so a wide search ("act") doesn't
  // chew the upstream. Every fan-out call goes through the cache.
  { method: 'GET', path: '/api/agg/acts',
    handler: async (req, res, ctx) => {
      const term = ctx.url.searchParams.get('term') || '';
      const cap  = Math.min(Number(ctx.url.searchParams.get('take') || 12), 25);
      if (!term || term.length < 2) {
        return ctx.json(res, 400, { error: 'term required (min 2 chars)' });
      }
      let acts;
      try { acts = await actSearch(ctx, term); }
      catch (e) { return ctx.json(res, 502, { error: 'acts upstream failed', detail: e.message }); }

      const slice = acts.slice(0, cap);
      const out = await Promise.all(slice.map(async (a) => {
        try {
          const head = await siPage(ctx, { ActOfParliamentId: a.id, Take: 1 });
          return { id: a.id, name: a.name, year: a.year, royalAssent: a.royalAssent,
                   number: a.number, link: a.link, instrumentCount: head.totalResults || 0 };
        } catch {
          return { id: a.id, name: a.name, year: a.year, royalAssent: a.royalAssent,
                   number: a.number, link: a.link, instrumentCount: null };
        }
      }));
      out.sort((a, b) => (b.instrumentCount || 0) - (a.instrumentCount || 0));
      return ctx.json(res, 200, { term, count: out.length, acts: out });
    } },

  // Bucketed SI laying-date histogram for one Act.
  { method: 'GET', path: '/api/agg/instruments-by-act',
    handler: async (req, res, ctx) => {
      const actId  = ctx.url.searchParams.get('actId');
      const bucket = ctx.url.searchParams.get('bucket') === 'month' ? 'month' : 'week';
      if (!actId) return ctx.json(res, 400, { error: 'actId required' });

      // Fetch act metadata + histogram in parallel — both are cached.
      let agg, act;
      try {
        [agg, act] = await Promise.all([
          aggregateByAct(ctx, actId, bucket),
          actDetail(ctx, actId),
        ]);
      } catch (e) {
        return ctx.json(res, 502, { error: 'agg failed', detail: e.message });
      }
      const out = { ...agg, name: act?.name || null, year: act?.year || null,
                    royalAssent: act?.royalAssent || null, link: act?.link || null };
      return ctx.json(res, 200, out);
    } },
];

// ---- createProxy -----------------------------------------------------------

const proxy = createProxy({
  routes: ROUTES,
  ttlPolicy,
  webRoot: WEB_ROOT,
  port: Number(process.env.PORT || 8788),
  attribution: OPL_ATTRIBUTION,
  extraRoutes,
});

// Re-export internals so tests can poke at them.
export const matchRoute = proxy.matchRoute;
export const buildUpstreamUrl = proxy.buildUpstreamUrl;
export const ttlMsFor = ttlPolicy;
export const server = proxy.server;

const invokedAsMain = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsMain) {
  proxy.listen(({ port, host, authRequired }) => {
    process.stdout.write(`instruments-by-act listening on http://${host}:${port}/\n`);
    process.stdout.write(`  auth: ${authRequired ? 'required' : 'open (dev)'}\n`);
    process.stdout.write(`  /api/si/<StatutoryInstrumentApiPath>\n`);
    process.stdout.write(`  /api/agg/acts?term=<q>\n`);
    process.stdout.write(`  /api/agg/instruments-by-act?actId=<id>&bucket=week|month\n`);
    process.stdout.write(`  /_health  /_cache\n`);
  });
}
