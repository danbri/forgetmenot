// Unit tests for the fetch-sitemap parser — lib/facilities/fetch-sitemap.mjs.
// Pure/offline: no network. Covers index vs urlset, entity decoding,
// challenge detection, recursion (enumerate) with an injected fetch, and byHost.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, enumerate, byHost, hosts } from '../../lib/facilities/fetch-sitemap.mjs';

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.parliament.uk/sitemap.xml</loc><lastmod>2026-06-01</lastmod></sitemap>
  <sitemap><loc>https://www.parliament.uk/aboutsitemap.xml</loc></sitemap>
</sitemapindex>`;

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.parliament.uk/about/how/role/?a=1&amp;b=2</loc><lastmod>2026-05-09</lastmod><priority>0.8</priority></url>
  <url><loc>https://www.parliament.uk/get-involved/</loc></url>
</urlset>`;

test('parse() detects a sitemap index', () => {
  const r = parse(INDEX);
  assert.equal(r.type, 'index');
  assert.equal(r.sitemaps.length, 2);
  assert.equal(r.sitemaps[0].loc, 'https://www.parliament.uk/sitemap.xml');
  assert.equal(r.sitemaps[0].lastmod, '2026-06-01');
  assert.equal(r.sitemaps[1].lastmod, undefined); // absent, not empty
});

test('parse() detects a urlset and entity-decodes <loc>', () => {
  const r = parse(URLSET);
  assert.equal(r.type, 'urlset');
  assert.equal(r.urls.length, 2);
  assert.equal(r.urls[0].loc, 'https://www.parliament.uk/about/how/role/?a=1&b=2'); // &amp; -> &
  assert.equal(r.urls[0].priority, '0.8');
});

test('parse() throws a clear error on a Cloudflare challenge page', () => {
  const challenge = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>';
  assert.throws(() => parse(challenge), /Cloudflare challenge/i);
});

test('parse() throws on non-sitemap XML', () => {
  assert.throws(() => parse('<rss><channel></channel></rss>'), /Not a sitemap/i);
});

test('enumerate() recurses an index via an injected fetch and respects --limit', async () => {
  // ctx.fetch is honoured by lib/http.mjs rawFetch — stub the two sitemaps.
  const bodies = {
    'https://x/index.xml': INDEX,
    'https://www.parliament.uk/sitemap.xml': URLSET,
    'https://www.parliament.uk/aboutsitemap.xml': URLSET,
  };
  const fakeFetch = async (url) => ({
    ok: true, status: 200, url,
    headers: new Map([['content-type', 'application/xml']]),
    text: async () => bodies[url] ?? (() => { throw new Error('no stub for ' + url); })(),
  });
  const out = await enumerate('https://x/index.xml', { limit: 3 }, { fetch: fakeFetch, retries: 0 });
  assert.equal(out.sitemapsVisited, 3);   // index + its 2 child urlsets
  assert.equal(out.urlCount, 3);          // capped by limit (2 + 2 = 4 available)
  assert.equal(out.urlsTruncated, true);
  assert.equal(out.sitemaps[0].type, 'index');
  assert.equal(out.sitemaps.filter(s => s.type === 'urlset').length, 2);
});

test('enumerate() recurses nested indexes (index -> index -> urlset)', async () => {
  const bodies = {
    'https://x/top.xml': `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://x/mid.xml</loc></sitemap></sitemapindex>`,
    'https://x/mid.xml': `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://x/leaf.xml</loc></sitemap></sitemapindex>`,
    'https://x/leaf.xml': URLSET,
  };
  const fakeFetch = async (url) => ({
    ok: true, status: 200, url,
    headers: new Map([['content-type', 'application/xml']]),
    text: async () => bodies[url],
  });
  const out = await enumerate('https://x/top.xml', {}, { fetch: fakeFetch, retries: 0 });
  assert.equal(out.sitemapsVisited, 3);   // top + mid + leaf — two levels of indexing
  assert.equal(out.urlCount, 2);          // the leaf urlset's 2 urls
});

test('byHost() groups and counts', () => {
  const g = byHost([
    'https://www.parliament.uk/a', 'https://www.parliament.uk/b',
    { loc: 'https://hansard.parliament.uk/x' },
  ]);
  assert.equal(g[0].host, 'www.parliament.uk');
  assert.equal(g[0].count, 2);
  assert.equal(g[1].host, 'hansard.parliament.uk');
});

test('hosts() returns the known Parliament entry points', () => {
  const h = hosts();
  assert.ok(h.length >= 5);
  assert.equal(h[0].sitemap, 'https://www.parliament.uk/sitemapindex.xml');
});
