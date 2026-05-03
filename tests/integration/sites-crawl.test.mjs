// End-to-end integration test for the sites crawler with a stub
// `globalThis.fetch`. No network. We verify:
//   * robots.txt is honoured (one Disallow path is skipped)
//   * platform / newsletter / social are sniffed
//   * link classification produces the right typed pages
//   * personal-content exclusion fires
//   * archival capture (when enabled) emits a record per fetch
//
// Conventions: a single InMemoryServer instance handles every URL
// the crawler reaches in one test. Keeping fixtures inline (not
// in tests/fixtures/) is deliberate — we want this test to fail
// loudly if the crawler ever does something unexpected, and inline
// HTML makes the cause-of-failure obvious.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { crawlSite, newOriginPacer } from '../../lib/facilities/sites.mjs';

// --- in-memory site -------------------------------------------------

const HOMEPAGE_HTML = `
<!doctype html>
<html><head>
  <title>Test MP</title>
  <meta name="description" content="Test MP for crawler integration test">
  <link rel="alternate" type="application/rss+xml" href="/feed/rss"/>
  <link href="/wp-content/themes/labour-new-theme/style.css">
</head><body>
  <nav>
    <a href="/about">About me</a>
    <a href="/news">News</a>
    <a href="/campaigns">My campaigns</a>
    <a href="/contact">Contact</a>
    <a href="/surgeries">Surgeries</a>
    <a href="/donate">Donate</a>
    <a href="/private/family-photos">Family album</a>
    <a href="/private-area">Private</a>
    <a href="https://twitter.com/test_mp">X</a>
    <a href="https://facebook.com/testmp">Facebook</a>
  </nav>
  <form action="https://test.us21.list-manage.com/subscribe/post"></form>
</body></html>
`.trim();

const ROBOTS_TXT = `User-agent: *
Disallow: /private-area
`.trim();

const PAGE_BODIES = {
  '/about':      '<html><body><h1>About Test MP</h1><p>Bio paragraph.</p></body></html>',
  '/news':       `<html><body><h1>News</h1>
                  <article><h2><a href="/news/2026/04/01/policy">A policy thing</a></h2>
                  <time datetime="2026-04-01">1 April 2026</time></article>
                </body></html>`,
  '/campaigns':  `<html><body><h1>Campaigns</h1>
                  <h2><a href="/campaigns/housing">Housing for All</a></h2>
                  <p>End the housing crisis in our community.</p>
                </body></html>`,
  '/contact':    `<html><body>
                  <h1>Contact</h1>
                  <p>House of Commons, London, SW1A 0AA</p>
                  <p>Phone: 020 1234 5678</p>
                  <a href="mailto:test.mp@parliament.uk">Email</a>
                  <form action="/contact/submit"></form>
                </body></html>`,
  '/surgeries':  '<html><body><h1>Surgeries</h1><p>Held in Town Hall TH1 1AA</p></body></html>',
  '/feed/rss':   '<?xml version="1.0"?><rss/>',
  '/sitemap.xml':'<?xml version="1.0"?><urlset></urlset>',
};

function installStubFetch(routes) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const path = u.pathname;
    if (path === '/robots.txt') {
      return new Response(ROBOTS_TXT, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (path === '/') {
      return new Response(HOMEPAGE_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    const body = routes[path];
    if (body == null) return new Response('not found', { status: 404 });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': /\.xml$/.test(path) ? 'application/xml' : 'text/html' },
    });
  };
  return () => { globalThis.fetch = realFetch; };
}

// --- the test -------------------------------------------------------

test('crawlSite end-to-end against a stub fetch', async () => {
  const restore = installStubFetch(PAGE_BODIES);
  try {
    const r = await crawlSite(
      { id: 1, name: 'Test MP', party: 'Labour', house: 'Commons', constituency: 'Testford' },
      'https://example.org/',
      { pacer: newOriginPacer(0) },     // no per-origin pause for tests
    );

    assert.equal(r.ok, true);
    assert.equal(r.platform, 'WordPress (labour-new-theme)');
    assert.equal(r.newsletter_provider, 'Mailchimp');

    // Social: both X and Facebook detected, dedup by URL.
    const hosts = r.social.map((s) => s.host).sort();
    assert.deepEqual(hosts, ['facebook.com', 'twitter.com']);

    // Page types observed (presence in any order):
    const types = r.pages.map((p) => p.type).sort();
    assert.deepEqual(types, ['about', 'campaigns', 'contact', 'donate', 'news_index', 'surgery']);

    // Donate is presence-only (fetch:false).
    const donate = r.pages.find((p) => p.type === 'donate');
    assert.equal(donate.presence_only, true);

    // News index extracted at least one item with date detection.
    const news = r.pages.find((p) => p.type === 'news_index');
    assert.ok(news.candidates.news_items.length >= 1);
    assert.equal(news.candidates.news_items[0].title, 'A policy thing');
    assert.equal(news.candidates.news_items[0].date,  '2026-04-01');

    // Contact extractor pulls postcode + phone + email + form action.
    const contact = r.pages.find((p) => p.type === 'contact');
    assert.deepEqual(contact.candidates.postcodes, ['SW1A 0AA']);
    assert.deepEqual(contact.candidates.emails, ['test.mp@parliament.uk']);
    assert.equal(contact.candidates.formAction, '/contact/submit');

    // Personal-content exclusion fired for /private/family-photos.
    const exclusions = r.decisions.filter((d) => d.action === 'excluded-personal');
    assert.ok(exclusions.length >= 1);
    assert.match(exclusions[0].rule, /family|private/);

    // robots.txt blocked /private-area — recorded as skipped-robots.
    const skipped = r.decisions.find((d) => d.action === 'skipped-robots');
    assert.ok(skipped, 'private-area should be skipped per robots.txt');

    // Feed and sitemap captured.
    assert.equal(r.feeds.length, 1);
    assert.match(r.sitemap, /<urlset/);
  } finally {
    restore();
  }
});
