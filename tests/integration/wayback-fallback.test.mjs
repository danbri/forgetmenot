// Integration test: when the live origin returns 403, the crawler
// falls back to the most-recent successful Wayback capture and
// records the provenance on the page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crawlSite, newOriginPacer } from '../../lib/facilities/sites.mjs';

test('crawlSite falls back to Wayback when the origin returns 403', async () => {
  // Stub `fetch` to:
  //   1. Reject the live homepage with 403 (Cloudflare-style block).
  //   2. Serve robots.txt (200, empty).
  //   3. For Wayback availability, return the most-recent capture.
  //   4. For the memento URL, return the archived homepage HTML.
  // Sub-pages aren't followed in this test (we only want to prove
  // the homepage fallback path).
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/robots.txt')) return new Response('', { status: 200 });
    if (u.includes('/llms.txt') || u.includes('/ai.txt'))
      return new Response('', { status: 404 });
    if (u.endsWith('/sitemap.xml')) return new Response('not found', { status: 404 });

    if (u === 'https://example.org/')
      return new Response('forbidden', { status: 403 });

    if (u.startsWith('https://archive.org/wayback/available')) {
      return new Response(JSON.stringify({
        archived_snapshots: { closest: {
          available: true, status: '200', timestamp: '20260301000000',
          url: 'https://web.archive.org/web/20260301000000/https://example.org/',
        }},
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://web.archive.org/web/20260301000000id_/')) {
      return new Response('<html><head><title>Archived MP</title></head><body><nav><a href="/about">About</a></nav></body></html>',
        { headers: { 'content-type': 'text/html' }, status: 200 });
    }
    if (u === 'https://example.org/about')
      return new Response('forbidden', { status: 403 });
    if (u.startsWith('https://web.archive.org/cdx/search/cdx')) {
      return new Response('[]', { headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
  try {
    const r = await crawlSite(
      { id: 1, name: 'Test', party: 'Lab', house: 'Commons' },
      'https://example.org/',
      { pacer: newOriginPacer(0) },
    );
    assert.equal(r.ok, true);
    // Homepage came from Wayback, with the timestamp recorded.
    assert.equal(r.homepage_provenance, 'wayback:20260301000000');
    assert.match(r.homepage.title, /Archived MP/);
  } finally {
    globalThis.fetch = real;
  }
});

test('crawlSite stays on origin if waybackFallback:false is set', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/robots.txt')) return new Response('', { status: 200 });
    if (u.includes('/llms.txt') || u.includes('/ai.txt'))
      return new Response('', { status: 404 });
    return new Response('forbidden', { status: 403 });
  };
  try {
    const r = await crawlSite(
      { id: 1, name: 'Test' },
      'https://example.org/',
      { pacer: newOriginPacer(0) },
      { waybackFallback: false },
    );
    assert.equal(r.ok, false);
    assert.equal(r.homepage_error.status, 403);
  } finally {
    globalThis.fetch = real;
  }
});
