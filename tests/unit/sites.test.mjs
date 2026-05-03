// Unit tests for lib/facilities/sites.mjs.
// Cover: URL canonicalisation, same-site rule, robots parser/applier,
// link classification, personal-content exclusion, anchor + feed +
// social discovery, platform fingerprinting, page extractors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalUrl, originOf, sameSite,
  parseRobots, robotsAllows,
  classifyLink, excludeReason,
  extractAnchors, discoverFeedUrls, extractSocialLinks,
  detectPlatform, detectNewsletterProvider,
  POLITICAL_TYPES, EXCLUDE_PERSONAL,
} from '../../lib/facilities/sites.mjs';

// ---------- URL helpers ----------

test('canonicalUrl strips fragment, normalises trailing slash', () => {
  assert.equal(canonicalUrl('/about/', 'https://x.org/'),  'https://x.org/about');
  assert.equal(canonicalUrl('/',       'https://x.org/'),  'https://x.org/');
  assert.equal(canonicalUrl('/a#top',  'https://x.org/'),  'https://x.org/a');
  assert.equal(canonicalUrl('https://other.com/y?z=1', 'https://x.org/'), 'https://other.com/y?z=1');
});

test('canonicalUrl returns null when no base + non-URL is given', () => {
  // With no base, anything that isn't an absolute URL is unparseable.
  assert.equal(canonicalUrl('not-a-url'), null);
  // With a base, even an exotic-looking string is treated as a relative
  // path — that's a feature of the WHATWG URL parser, not a bug here.
  assert.equal(canonicalUrl('::weird::', 'https://x.org/'), 'https://x.org/::weird::');
});

test('originOf returns the URL origin', () => {
  assert.equal(originOf('https://www.example.com/path'), 'https://www.example.com');
});

test('sameSite tolerates www prefix and accepts subdomains', () => {
  // Documented equivalences from the comments next to sameSite():
  assert.equal(sameSite('www.lizkendall.org', 'lizkendall.org'),    true);
  assert.equal(sameSite('lizkendall.org',     'www.lizkendall.org'), true);
  assert.equal(sameSite('news.lizkendall.org','lizkendall.org'),    true);
  assert.equal(sameSite('lizkendall.org',     'news.lizkendall.org'),true);
  // But NOT cross-site through a shared parent like .org or .co.uk:
  assert.equal(sameSite('lizkendall.org',     'labour.org.uk'),     false);
  assert.equal(sameSite('foo.gov.uk',         'bar.gov.uk'),        false);
});

// ---------- robots.txt ----------

test('parseRobots picks the User-agent: * stanza', () => {
  const txt = `
    User-agent: BadBot
    Disallow: /

    User-agent: *
    Disallow: /private
    Disallow: /tmp/
    Allow: /tmp/public

    Sitemap: https://x.org/sitemap.xml
  `;
  const r = parseRobots(txt);
  assert.deepEqual(r.disallow, ['/private', '/tmp/']);
  assert.deepEqual(r.allow,    ['/tmp/public']);
});

test('parseRobots tolerates absent file / empty input', () => {
  assert.deepEqual(parseRobots(''),          { allow: [], disallow: [] });
  assert.deepEqual(parseRobots(null),        { allow: [], disallow: [] });
  assert.deepEqual(parseRobots(undefined),   { allow: [], disallow: [] });
});

test('robotsAllows: longest-prefix wins, empty Disallow is "allow all"', () => {
  const r = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public');
  assert.equal(robotsAllows(r, 'https://x.org/admin'),         false);
  assert.equal(robotsAllows(r, 'https://x.org/admin/public'),  true);   // Allow longer
  assert.equal(robotsAllows(r, 'https://x.org/elsewhere'),     true);

  const open = parseRobots('User-agent: *\nDisallow:');
  assert.equal(robotsAllows(open, 'https://x.org/anything'),   true);
});

// ---------- link classification ----------

test('classifyLink picks the right POLITICAL_TYPES key by slug', () => {
  const host = 'x.org';
  const t = (href, text = '') => classifyLink(href, text, host);
  assert.equal(t('https://x.org/about').type,                  'about');
  assert.equal(t('https://x.org/about/me').type,               'about');
  assert.equal(t('https://x.org/news').type,                   'news_index');
  assert.equal(t('https://x.org/category/local-news').type,    'news_index');
  assert.equal(t('https://x.org/in-parliament').type,          'parliament');
  assert.equal(t('https://x.org/voting-record').type,          'parliament');
  assert.equal(t('https://x.org/campaigns').type,              'campaigns');
  assert.equal(t('https://x.org/my-priorities').type,          'campaigns');
  assert.equal(t('https://x.org/petition/123').type,           'petition');
  assert.equal(t('https://x.org/surgeries').type,              'surgery');
  assert.equal(t('https://x.org/contact').type,                'contact');
  assert.equal(t('https://x.org/get-involved').type,           'get_involved');
  assert.equal(t('https://x.org/newsletter').type,             'newsletter');
  // /donate is the only POLITICAL_TYPES entry with fetch:false.
  assert.equal(t('https://x.org/donate').type,  'donate');
  assert.equal(t('https://x.org/donate').fetch, false);
  assert.equal(t('https://x.org/jobs').type,                   'jobs');
  assert.equal(t('https://x.org/events').type,                 'events');
  assert.equal(t('https://x.org/accessibility').type,          'accessibility');
  assert.equal(t('https://x.org/privacy-policy').type,         'privacy');
});

test('classifyLink returns null for off-site links and uncategorised slugs', () => {
  assert.equal(classifyLink('https://other.com/about', '', 'x.org'),   null);
  assert.equal(classifyLink('https://x.org/random-page', '', 'x.org'), null);
});

test('classifyLink can match by visible link text when the slug is opaque', () => {
  // Some sites have URLs like /p/123 and rely on link text to convey
  // type. Our matcher checks text after the slug fails.
  const cls = classifyLink('https://x.org/p/123', 'Get in touch', 'x.org');
  assert.equal(cls?.type, 'contact');
});

// ---------- personal-content exclusion ----------

test('excludeReason flags family / personal slugs with an explanation', () => {
  // The reason returned is whichever needle in EXCLUDE_PERSONAL
  // matches FIRST. For `/my-family` that's the broader `family`
  // rule (it appears earlier in the list and is itself a substring
  // of `my-family`). The exact needle reported is informational —
  // what matters for behaviour is that the URL is excluded.
  const ex = excludeReason('https://x.org/my-family');
  assert.ok(ex, 'should be excluded');
  assert.match(ex.rule, /family/);
  assert.match(ex.reason, /family/i);

  // Each entry in EXCLUDE_PERSONAL must produce a hit on a URL
  // containing it as a path substring (some other earlier rule
  // may match first; we only assert that SOMETHING matches).
  for (const [needle] of EXCLUDE_PERSONAL) {
    const url = `https://x.org/section/${needle}`;
    const e = excludeReason(url);
    assert.ok(e, `EXCLUDE_PERSONAL needle "${needle}" should match its own URL`);
  }
});

test('excludeReason returns null on plainly political URLs', () => {
  assert.equal(excludeReason('https://x.org/about'),    null);
  assert.equal(excludeReason('https://x.org/news'),     null);
  assert.equal(excludeReason('https://x.org/contact'),  null);
});

test('excludeReason uses word boundaries (no false positives on `son`/`children`)', () => {
  // Regression for an over-eager substring match found by the
  // first 436-site analysis run. `son` was firing on `/lesson`,
  // `/season`, `/parson`, `/comparison`, etc. and `child` on any
  // word containing `child` like `/parents-and-childcare-rights`
  // (legitimate political content).
  assert.equal(excludeReason('https://x.org/lessons-from-the-pandemic'), null);
  assert.equal(excludeReason('https://x.org/season-greetings'),          null);
  assert.equal(excludeReason('https://x.org/comparison-of-budgets'),     null);
  // But true family pages are still caught:
  assert.ok(excludeReason('https://x.org/my-son'));
  assert.ok(excludeReason('https://x.org/photos-of-children'));
});

// ---------- anchor + feed + social extraction ----------

test('extractAnchors returns deduplicated absolute URLs with link text', () => {
  const html = `
    <a href="/about">About me</a>
    <a href="/about">About</a>      <!-- dup, kept once -->
    <a href="https://other.com/x">X</a>
    <a href="mailto:foo@bar">Mail</a> <!-- dropped -->
    <a href="tel:+44">Phone</a>      <!-- dropped -->
    <a href="javascript:void(0)">JS</a> <!-- dropped -->
  `;
  const anchors = extractAnchors(html, 'https://x.org/');
  const hrefs = anchors.map((a) => a.href).sort();
  assert.deepEqual(hrefs, ['https://other.com/x', 'https://x.org/about']);
  assert.equal(anchors.find((a) => a.href === 'https://x.org/about').text, 'About me');
});

test('discoverFeedUrls finds rel=alternate RSS/Atom links', () => {
  const html = `
    <link rel="alternate" type="application/rss+xml" href="/feed/rss"/>
    <link rel="alternate" type="application/atom+xml" href="/feed/atom"/>
    <link rel="alternate" type="text/html" href="/printable"/>
  `;
  const feeds = discoverFeedUrls(html, 'https://x.org/');
  assert.deepEqual(feeds.sort(), ['https://x.org/feed/atom', 'https://x.org/feed/rss']);
});

test('extractSocialLinks identifies known platforms only', () => {
  const html = `
    <a href="https://twitter.com/x">tw</a>
    <a href="https://www.facebook.com/x">fb</a>
    <a href="https://instagram.com/x">ig</a>
    <a href="https://bsky.app/profile/x.bsky.social">bsky</a>
    <a href="https://random.example.com/">no</a>
  `;
  const social = extractSocialLinks(html);
  const hosts = social.map((s) => s.host).sort();
  assert.deepEqual(hosts, ['bsky.app', 'facebook.com', 'instagram.com', 'twitter.com']);
});

// ---------- platform / newsletter sniffers ----------

test('detectPlatform recognises the common UK-MP CMSes', () => {
  assert.equal(detectPlatform('<img src="https://static.wixstatic.com/x.png">'),   'Wix');
  assert.equal(detectPlatform('<img src="https://images.squarespace-cdn.com/x">'), 'Squarespace');
  assert.equal(detectPlatform('<link href="/wp-content/themes/labour-new-theme/style.css">'),
               'WordPress (labour-new-theme)');
  assert.equal(detectPlatform('<link href="/wp-content/plugins/x">'), 'WordPress');
  assert.equal(detectPlatform('Powered by Bluetree'),                  'Bluetree (Conservative party CMS)');
  assert.equal(detectPlatform('<script src="https://x.nationbuilder.com/y">'),     'NationBuilder');
});

test('detectPlatform falls back to <meta name=generator> when no fingerprint matches', () => {
  const p = detectPlatform('<meta name="generator" content="Drupal 10 (https://www.drupal.org)">');
  assert.equal(p, 'meta:generator=Drupal 10 (https://www.drupal.org)');
});

test('detectNewsletterProvider names the provider when present', () => {
  assert.equal(detectNewsletterProvider('<form action="https://x.us21.list-manage.com/subscribe/post">'), 'Mailchimp');
  assert.equal(detectNewsletterProvider('<iframe src="https://author.substack.com/embed">'),              'Substack');
  assert.equal(detectNewsletterProvider('<form action="https://actionnetwork.org/forms/x/signups">'),     'Action Network');
  assert.equal(detectNewsletterProvider('<p>plain html with no provider</p>'),                            null);
});
