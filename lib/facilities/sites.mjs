// MP-website crawler.
//
// Goal: build a structured, audit-friendly profile of each MP's
// PUBLIC POLITICAL activity from their personal/constituency
// website, while staying clear of personal/family content. The
// crawler is deliberately:
//
//   * MINIMAL  — at most one homepage + one robots + one sitemap +
//     a small set of explicitly-typed political pages per site.
//   * POLITE   — honours robots.txt for User-agent: *, throttles
//     between requests to the same origin, conservative timeouts,
//     identifies itself with a visible UA.
//   * INCLUSIVE — every member with a website is attempted; nobody
//     is excluded by party or platform.
//   * AUDITABLE — the inclusion rules (which slugs we follow) and
//     exclusion rules (which slugs we drop on personal/family
//     grounds) are declared as exported constants at the top of
//     this file. A `manifest.json` written per crawl records every
//     decision: which links were classified into which type, which
//     were skipped, and why.
//   * LOSSLESS  — for every page actually fetched we also save the
//     raw HTML next to the parsed JSON. If our extraction
//     misrepresents anything, the source is on disk to compare.
//
// LLM-assist policy: this module contains NO model calls. All
// extraction is rule-based. Downstream analysis (proposing graph
// schemas, clustering campaigns, etc.) can read the stored HTML
// and JSON and use a model — but the crawler itself is
// deterministic so the user can review and challenge each rule.

import { rawFetch, HttpError } from '../http.mjs';

// ---------------------------------------------------------------
// 1. Taxonomy of MP-website page types
// ---------------------------------------------------------------
//
// Each entry has:
//   key       — short identifier used in JSON output
//   match     — list of lowercase slug fragments. A URL path or
//               link text containing ANY fragment is a candidate
//               for that type.
//   fetch     — true to download and parse the page body. False to
//               record presence-only (e.g. donation forms, where
//               the link itself is the signal and the destination
//               is usually a third-party form).
//   notes     — explanation of why we treat it this way.
//
// The list is intentionally short and weighted toward UK-MP
// idioms (surgery, advice centre, parliamentary record, EDM, etc.)
// but extensible. Order matters only for tie-breaking when one
// URL matches several types — earlier wins.
export const POLITICAL_TYPES = [
  // Identity / Bio
  { key: 'about',         match: ['about', 'biography', 'who-i-am', 'meet-', 'profile'],
    fetch: true,  notes: 'Self-description, role, constituency, party.' },

  // News & blog
  { key: 'news_index',    match: ['news', 'press', 'blog', 'updates', 'latest', 'articles', 'columns', 'media'],
    fetch: true,  notes: 'Index of dated posts. Individual posts are not auto-followed at depth 1.' },

  // Parliamentary record
  { key: 'parliament',    match: ['in-parliament', 'parliamentary', 'westminster', 'voting-record', 'votes', 'speeches', 'questions', 'edm'],
    fetch: true,  notes: 'Parliamentary activity summary. Often links to Hansard / TheyWorkForYou.' },

  // Issues / Campaigns / Priorities
  { key: 'campaigns',     match: ['campaign', 'priorities', 'priority', 'issues', 'mission', 'agenda', 'pledge', 'manifesto'],
    fetch: true,  notes: 'Stated political priorities. The richest cross-MP signal.' },

  // Petitions
  { key: 'petition',      match: ['petition', 'sign-the-petition', 'survey', 'consultation', 'have-your-say'],
    fetch: true,  notes: 'Specific petition or consultation page.' },

  // Constituency services
  { key: 'surgery',       match: ['surgery', 'surgeries', 'advice-centre', 'advice-surgeries', 'advice-clinics', 'drop-in', 'casework'],
    fetch: true,  notes: 'Where/how constituents can meet the MP.' },

  // Contact
  { key: 'contact',       match: ['contact', 'get-in-touch', 'reach-me'],
    fetch: true,  notes: 'Office address(es), email, phone, web form.' },

  // Get involved (volunteering, joining the local party)
  { key: 'get_involved',  match: ['get-involved', 'volunteer', 'join', 'support-me', 'help', 'take-action', 'action'],
    fetch: true,  notes: 'Volunteering / activism CTAs.' },

  // Newsletter / mailing list
  { key: 'newsletter',    match: ['newsletter', 'sign-up', 'subscribe', 'mailing-list', 'email-updates'],
    fetch: true,  notes: 'Lets us identify the email-marketing provider (Mailchimp etc.).' },

  // Donate (presence-only, never deep-fetch)
  { key: 'donate',        match: ['donate', 'donation', 'contribute', 'support-our-work'],
    fetch: false, notes: 'Donation links almost always go off-site to party donation forms.' },

  // Jobs in the office
  { key: 'jobs',          match: ['jobs', 'vacancies', 'careers', 'work-for-me', 'employment'],
    fetch: true,  notes: 'Office staff vacancies — public-political function.' },

  // Events / calendar
  { key: 'events',        match: ['events', 'calendar', 'diary'],
    fetch: true,  notes: 'Public meetings, surgeries, public engagements.' },

  // Compliance / boilerplate (kept for auditing the site itself)
  { key: 'accessibility', match: ['accessibility'],
    fetch: false, notes: 'Often a boilerplate page from the party CMS.' },
  { key: 'privacy',       match: ['privacy', 'cookies', 'data-protection', 'gdpr'],
    fetch: false, notes: 'Boilerplate. Useful for fingerprinting platforms.' },
];

// ---------------------------------------------------------------
// 2. Personal/non-political exclusion list
// ---------------------------------------------------------------
//
// If ANY of these substrings appears in a URL path (case-insensitive),
// the link is dropped before classification. The aim is to avoid
// fetching pages that are clearly about the MP's family, children,
// home life, hobbies, religious worship, etc. — material that is
// often public on the website but not within the scope of "their
// political activity".
//
// We err on the side of caution: ambiguous slugs (e.g. "personal-statement"
// — a parliamentary genre) are NOT in the list. We exclude only
// slugs whose plain English meaning is clearly out of scope.
//
// Each entry is paired with a short justification so a reviewer can
// see why we chose to skip it.
export const EXCLUDE_PERSONAL = [
  // Family identifiers
  ['family',           'family-life pages'],
  ['my-family',        'explicit family page'],
  ['kids',             'children'],
  ['children',         'children — beyond their public role'],
  ['daughter',         'named family member'],
  ['son',              'named family member'],
  ['wife',             'spouse content'],
  ['husband',          'spouse content'],
  ['spouse',           'spouse content'],
  ['parents',          'family'],
  ['wedding',          'private life event'],
  ['anniversary',      'private life event'],

  // Pets
  ['my-dog',           'personal pet'],
  ['my-cat',           'personal pet'],
  ['my-pet',           'personal pet'],
  ['pets',             'personal pet'],

  // Holidays / leisure
  ['holiday-photos',   'private travel imagery'],
  ['holidays',         'private travel'],
  ['vacation',         'private travel'],
  ['gallery-personal', 'private gallery'],
  ['home-life',        'private domestic content'],

  // Religious worship pages on personal sites — out of scope of
  // political activity even though they may appear in public bios.
  // We keep faith-related campaign work in scope (under campaigns).
  ['my-faith',         'personal religious content'],
  ['worship',          'religious worship content'],
];

// ---------------------------------------------------------------
// 3. Politeness defaults
// ---------------------------------------------------------------
//
// These are the operational dials. Tightening any of them is safe
// (less load on the target). Loosening should be a deliberate
// choice — flag it in the manifest.
export const POLITENESS = {
  // We identify the bot but use a Mozilla-compatible token so
  // Cloudflare-protected sites don't auto-503/520 us purely on
  // UA-based bot heuristics. The repo URL in the comment string
  // makes our identity reviewable from any access log.
  //
  // The complementary `From:` header (set in politeFetch) gives
  // webmasters a clear contact channel — this is the long-standing
  // convention from RFC 9110 §10.1.2 for identifying polite bots.
  userAgent:
    'Mozilla/5.0 (compatible; forgetmenot-mp-site-crawler/0.1; ' +
    '+https://github.com/danbri/forgetmenot)',
  // Plain-text contact for the From: header.
  contact: 'https://github.com/danbri/forgetmenot/issues',

  // Per-origin pause between requests, milliseconds.
  perOriginDelayMs: 1500,

  // Per-request timeout.
  timeoutMs: 15_000,

  // Hard cap on how many pages we will fetch per site (excluding
  // robots.txt, sitemap, and feeds).
  maxPagesPerSite: 12,

  // We stay on the homepage's hostname only — no off-site crawl.
  sameOriginOnly: true,

  // Crawl depth from the homepage. 1 = homepage + pages it links
  // to, no recursion.
  maxDepth: 1,
};

// ---------------------------------------------------------------
// 4. URL helpers
// ---------------------------------------------------------------

// Canonicalise a URL: strip fragment, normalise scheme/host, drop
// the trailing slash on the path (except for root). Preserves query
// because some sites encode the page id in the query.
export function canonicalUrl(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch { return null; }
}

export function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

// ---------------------------------------------------------------
// 5. robots.txt
// ---------------------------------------------------------------
//
// Minimal parser sufficient for the User-agent: * stanza. We do NOT
// honour Crawl-delay (we always use POLITENESS.perOriginDelayMs,
// which is at least as polite as most published values) but we DO
// honour Disallow paths — exact prefix match against the URL path.
//
// If robots.txt is unreachable we proceed (per RFC 9309 §2.3.1.3
// — "if the robots.txt is unreachable, the crawler MAY assume no
// restrictions"). We still pace requests politely.

export function parseRobots(text) {
  // Returns { allow:[], disallow:[] } from the User-agent: * group.
  // Unknown directives are ignored.
  const lines = String(text || '').split(/\r?\n/);
  const groups = [];           // accumulating groups by UA
  let current = null;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    const key = k.toLowerCase();
    const val = v.trim();
    if (key === 'user-agent') {
      // A new UA group starts here.
      current = { uas: [val.toLowerCase()], allow: [], disallow: [] };
      groups.push(current);
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current[key].push(val);
    }
  }
  // Pick the most permissive group matching '*'. Fallback to empty
  // (= no restrictions) if no '*' group is present.
  const star = groups.find((g) => g.uas.includes('*'));
  return star
    ? { allow: star.allow.filter(Boolean), disallow: star.disallow.filter(Boolean) }
    : { allow: [], disallow: [] };
}

// True if the URL path is allowed under the given parsed robots.
// Allow-rule precedence is the longest matching prefix.
export function robotsAllows(robots, url) {
  let path;
  try { path = new URL(url).pathname; } catch { return true; }
  let bestAllow = -1, bestDisallow = -1;
  for (const a of robots.allow)
    if (a && path.startsWith(a) && a.length > bestAllow) bestAllow = a.length;
  for (const d of robots.disallow) {
    // Empty Disallow means "allow all" — skip.
    if (!d) continue;
    if (path.startsWith(d) && d.length > bestDisallow) bestDisallow = d.length;
  }
  // If neither matches, allowed. If both, longer rule wins; ties go to allow.
  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

// ---------------------------------------------------------------
// 6. Polite fetch with per-origin throttling
// ---------------------------------------------------------------

// One in-memory map of origin → "next allowed timestamp". The
// crawler uses a single instance throughout one run. If the same
// origin is requested back-to-back it will block until enough time
// has passed since the previous request.
class OriginPacer {
  constructor(delayMs = POLITENESS.perOriginDelayMs) {
    this.delayMs = delayMs;
    this.next = new Map();
  }
  async wait(origin) {
    const now = Date.now();
    const after = this.next.get(origin) || 0;
    const sleep = Math.max(0, after - now);
    this.next.set(origin, now + sleep + this.delayMs);
    if (sleep) await new Promise((r) => setTimeout(r, sleep));
  }
}

// Wrap rawFetch with: same UA, declared accept, paced per origin,
// and a guard that surfaces network/HTTP errors as a structured
// `{ ok:false, ... }` rather than throwing — the caller wants to
// continue with the next site.
//
// On 5xx we retry once after a 4-second pause. Many MP sites are
// fronted by Cloudflare or similar and intermittently return 503
// during their challenge-evaluation; one polite retry usually
// succeeds. We do NOT retry on 4xx (those are deliberate refusals).
async function politeFetch(url, pacer, ctx = {}) {
  const origin = originOf(url);
  const headers = {
    'Accept-Language': 'en-GB,en;q=0.9',
    From: POLITENESS.contact,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (origin) await pacer.wait(origin);
    try {
      const r = await rawFetch(url, { method: 'GET', headers }, {
        ...ctx,
        userAgent: ctx.userAgent || POLITENESS.userAgent,
        timeoutMs: ctx.timeoutMs || POLITENESS.timeoutMs,
        accept: ctx.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        retries: 0,
      });
      return { ok: true, status: r.status, url: r.url, headers: r.headers, body: r.body };
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      if (attempt === 0 && status >= 500 && status < 600) {
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      return { ok: false, url, status, message: e.message };
    }
  }
  // Unreachable, satisfies the linter.
  return { ok: false, url, status: 0, message: 'unreachable' };
}

// ---------------------------------------------------------------
// 7. Link discovery and classification
// ---------------------------------------------------------------

// Cheap HTML helpers — we deliberately do not pull in a parser
// dependency. The repo's design keeps lib/ stdlib-only.
function stripTags(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAttr(html, tag, attr) {
  // Returns array of attribute values for the given tag/attr pair.
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// Extract <a href="..."> with their visible text, normalised to
// canonical absolute URLs. Returns array of { href, text }.
export function extractAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = canonicalUrl(m[1], baseUrl);
    if (!href) continue;
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    out.push({ href, text: stripTags(m[2]).slice(0, 200) });
  }
  // Dedupe by URL keeping first text seen (usually the menu label).
  const seen = new Map();
  for (const a of out) if (!seen.has(a.href)) seen.set(a.href, a);
  return [...seen.values()];
}

// Decide whether a link should be excluded as personal/family.
// Returns the matched rule (substring + reason) or null.
export function excludeReason(url) {
  let path;
  try { path = new URL(url).pathname.toLowerCase(); } catch { return null; }
  for (const [needle, why] of EXCLUDE_PERSONAL) {
    if (path.includes(needle)) return { rule: needle, reason: why };
  }
  return null;
}

// Same-site check that tolerates the common `www.` prefix and
// accepts subdomains of the homepage's registrable domain. We
// don't pull in a Public Suffix List here — for our corpus the
// www-strip + suffix rule covers the realistic cases (e.g.
// `www.foo.co.uk` and `foo.co.uk` are the same site; `news.foo.org`
// is the same site as `foo.org`; `secure.labour.org.uk` is NOT
// the same site as `lizkendall.org`).
export function sameSite(host, originHost) {
  if (!host || !originHost) return false;
  const a = String(host).toLowerCase().replace(/^www\./, '');
  const b = String(originHost).toLowerCase().replace(/^www\./, '');
  if (a === b) return true;
  if (a.endsWith('.' + b)) return true;
  if (b.endsWith('.' + a)) return true;
  return false;
}

// Classify a link into a POLITICAL_TYPES key (or null).
// Inputs:
//   href  — canonical absolute URL
//   text  — visible link text from the menu/anchor
//   originHost — the homepage's hostname (we only classify same-site;
//                see sameSite() for the equivalence rule)
// Returns:
//   { type, key, fetch } | null
//
// The classifier checks slug fragments first (high precision),
// then link text (broader, lower precision).
export function classifyLink(href, text, originHost) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (POLITENESS.sameOriginOnly && !sameSite(url.hostname, originHost)) return null;

  const path = url.pathname.toLowerCase();
  const t = String(text || '').toLowerCase();

  for (const entry of POLITICAL_TYPES) {
    for (const needle of entry.match) {
      if (matchesNeedle(path, needle) || textMatchesNeedle(t, needle)) {
        return { type: entry.key, fetch: entry.fetch, matched: needle };
      }
    }
  }
  return null;
}

// Word-boundary substring match for URL paths, with optional
// trailing 's' so a singular needle like `campaign` matches both
// `/campaign` and `/campaigns` without us listing the plural
// separately. Without word boundaries, broad needles (`news`,
// `about`) swallow longer slugs (`newsletter`, `aboutme`).
//
// Cases:
//   `/campaigns`     vs `campaign`  → matches (s consumed, then end)
//   `/newsletter`    vs `news`      → does NOT match (after news+s? is `l`)
//   `/category/news` vs `news`      → matches (boundaries `/` and end)
//   `/campaigning`   vs `campaign`  → does NOT match (after `campaign` is `i`)
function matchesNeedle(path, needle) {
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${safe}s?([^a-z0-9]|$)`, 'i').test(path);
}

// For visible link text we accept either the hyphenated form or
// the spaced form ("get in touch" or "get-in-touch"). Same word-
// boundary + optional trailing 's' rule.
function textMatchesNeedle(text, needle) {
  if (!text) return false;
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[ -]');
  return new RegExp(`(^|[^a-z0-9])${safe}s?([^a-z0-9]|$)`, 'i').test(text);
}

// ---------------------------------------------------------------
// 8. Feed, sitemap and platform discovery
// ---------------------------------------------------------------

// Inspect <link rel="alternate" type="application/rss+xml" ...>
// and the common feed paths used by WordPress / Squarespace /
// Wix / NationBuilder.
export function discoverFeedUrls(html, baseUrl) {
  const found = new Set();
  const linkRe = /<link\b[^>]*\brel=["']alternate["'][^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/type=["'](application\/(rss|atom)\+xml|application\/feed\+json)["']/i.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const can = canonicalUrl(href, baseUrl);
    if (can) found.add(can);
  }
  return [...found];
}

// Platform fingerprints sniffed from the homepage HTML. Cheap
// regex tests against well-known asset paths or generator strings.
// This is for grouping/QA only — not for behaviour gating.
export function detectPlatform(html) {
  const tests = [
    [/wixstatic\.com|wix\.com\/website-builder/i,  'Wix'],
    [/squarespace-cdn\.com|squarespace\.com/i,    'Squarespace'],
    [/labour-new-theme/i,                          'WordPress (labour-new-theme)'],
    [/wp-content\/themes\/conservatives/i,         'WordPress (Conservatives theme)'],
    [/wp-content/i,                                'WordPress'],
    [/Powered by Bluetree|bluetreedevelopment/i,   'Bluetree (Conservative party CMS)'],
    [/nationbuilder\.com|nationbuilder\.org/i,    'NationBuilder'],
    [/cdn\.shopify\.com/i,                         'Shopify'],
    [/webflow\.com|wf-domain/i,                    'Webflow'],
    [/ghost\.io|ghost\.org/i,                      'Ghost'],
    [/cargo\.site/i,                               'Cargo'],
  ];
  for (const [re, name] of tests) if (re.test(html)) return name;
  // Generator <meta>
  const gen = (html.match(/<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/i) || [])[1];
  if (gen) return `meta:generator=${gen}`;
  return null;
}

// Newsletter-provider sniffer — looks at FORM ACTIONS and EMBED
// SRCs, plus common JS asset hosts.
export function detectNewsletterProvider(html) {
  const tests = [
    [/list-manage\.com/i,           'Mailchimp'],
    [/substack\.com/i,              'Substack'],
    [/actionnetwork\.org/i,         'Action Network'],
    [/mailerlite\.com/i,            'MailerLite'],
    [/convertkit\.com|kit\.com/i,   'ConvertKit'],
    [/sendinblue\.com|brevo\.com/i, 'Brevo (Sendinblue)'],
    [/campaign-archive\.com/i,      'Mailchimp (archive)'],
    [/hubspot\.com/i,               'HubSpot'],
  ];
  for (const [re, name] of tests) if (re.test(html)) return name;
  return null;
}

// Social-link extractor. We capture only the destination, never
// scrape the platform itself.
export function extractSocialLinks(html) {
  const re = /href=["'](https?:\/\/(?:www\.)?(twitter\.com|x\.com|facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|threads\.net|bsky\.app|linkedin\.com|substack\.com|mastodon\.[^/]+|t\.me|whatsapp\.com|wa\.me)\/[^"']*)["']/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ url: m[1], host: m[2] });
  }
  return out;
}

// ---------------------------------------------------------------
// 9. Per-page extractors (best-effort, lossless)
// ---------------------------------------------------------------
//
// Each extractor returns a mini-schema specific to the page type.
// All of them ALWAYS preserve `text_excerpt` (first 4 KB of clean
// text) so a downstream LLM has the original wording even if the
// structured fields are imperfect.

const CLEAN_EXCERPT_BYTES = 4000;

function commonExtract(html, url, type) {
  const title = stripTags((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const metaDesc = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) || [])[1] || '';
  const h1 = stripTags((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  const headings = [];
  const hRe = /<(h[2-3])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = hRe.exec(html)) !== null) headings.push(`${m[1]}: ${stripTags(m[2])}`);
  const text = stripTags(html);
  return {
    url, type, title, h1, meta_description: metaDesc,
    headings: headings.slice(0, 80),
    text_excerpt: text.slice(0, CLEAN_EXCERPT_BYTES),
    text_length: text.length,
  };
}

// Sidebar/widget headings that appear on WordPress and other CMS
// templates and would otherwise pollute the campaigns extractor.
// These match against the LOWERCASED, TRIMMED title text. Anything
// here is dropped from campaign candidates. Reviewers: flag
// anything in this list that you think is a real political topic
// — false negatives matter more than false positives here.
const NOISE_HEADINGS = new Set([
  'search', 'archive', 'archives', 'categories', 'recent posts',
  'recent comments', 'meta', 'subscribe', 'follow me', 'newsletter',
  'sign up', 'sign-up', 'tags', 'navigation', 'menu', 'main menu',
  'primary menu', 'sidebar', 'footer', 'header', 'social', 'social network',
  'social media', 'share', 'links', 'useful links', 'related links',
  'get in touch', 'contact', 'contact me', 'contact us', 'get involved',
  'pages', 'site map', 'sitemap', 'login', 'log in', 'register',
  'donate', 'leave a comment', 'leave a reply', 'about', 'about me',
  'about us', 'comments', 'cookies', 'privacy', 'cookie notice',
]);

// Campaigns/issues page — try to enumerate listed campaigns. Most
// templates list them as cards with titles and short descriptions;
// the cheapest robust signal is "h2/h3 followed by a paragraph",
// optionally inside an <a>. We over-generate candidates and then
// drop common sidebar/widget headings (NOISE_HEADINGS).
function extractCampaigns(html, url) {
  const base = commonExtract(html, url, 'campaigns');
  const items = [];
  const cardRe = /<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1>\s*(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const title = stripTags(m[2]);
    if (!title || title.length < 3 || title.length > 200) continue;
    if (NOISE_HEADINGS.has(title.toLowerCase().trim())) continue;
    const summary = stripTags(m[3] || '').slice(0, 500);
    // Try to find an enclosing <a href> for this title.
    const beforeIdx = html.lastIndexOf('<a ', m.index);
    let link = null;
    if (beforeIdx !== -1 && m.index - beforeIdx < 600) {
      const aOpen = html.slice(beforeIdx, m.index);
      const href = (aOpen.match(/href=["']([^"']+)["']/i) || [])[1];
      if (href) link = canonicalUrl(href, url);
    }
    items.push({ title, summary, url: link });
  }
  return { ...base, candidates: { campaigns: items.slice(0, 50) } };
}

// Try to lift a YYYY-MM-DD date out of a WordPress-style permalink
// (`/2026/04/13/slug`). Returns ISO date or null.
function dateFromUrl(href) {
  const m = String(href || '').match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Heuristic: does this URL look like a news/article permalink?
// We want to drop sidebar navigation items that happen to share
// the same DOM container as real news cards.
function looksLikeNewsUrl(href) {
  if (!href) return false;
  return /\/news\/|\/blog\/|\/post\/|\/article(s)?\/|\/press\/|\/category\/|\/(20\d{2})\/\d{1,2}\//i.test(href);
}

// News index — enumerate <article>/<li>/<div> blocks containing a
// title link and (where present) a date. We intentionally OVER-
// generate candidates and then filter:
//   - drop NOISE_HEADINGS (sidebar widgets, navigation labels)
//   - keep only items whose URL has a news-shaped path OR whose
//     title is ≥4 words (long enough to be an article headline)
// Date detection: <time datetime=...> > visible "13 April 2026"
// > WordPress permalink date.
function extractNewsIndex(html, url) {
  const base = commonExtract(html, url, 'news_index');
  const items = [];
  // Loose pattern: an anchor inside a card, with a <time> nearby.
  const blockRe = /<(article|li|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(html)) !== null && items.length < 60) {
    const block = m[2];
    const a = block.match(/<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>([\s\S]{1,200}?)<\/a>/i);
    if (!a) continue;
    const link = canonicalUrl(a[1], url);
    const title = stripTags(a[2]).trim();
    if (!title || title.length < 6) continue;
    if (!link || link === url) continue;

    // Date precedence:
    //   1. <time datetime="..."> on the card (semantic best case)
    //   2. visible date string ("13 April 2026")
    //   3. WordPress-style permalink (`/YYYY/MM/DD/slug`)
    let date = null;
    const timeAttr = block.match(/<time\b[^>]*\bdatetime=["']([^"']+)["']/i);
    if (timeAttr) date = timeAttr[1];
    if (!date) {
      const t = block.match(/\b(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
      if (t) date = t[1];
    }
    if (!date) date = dateFromUrl(link);

    // Filters to drop sidebar/navigation noise. Items must look
    // like a real news permalink OR have a date OR be a multi-word
    // headline. Anything in NOISE_HEADINGS is always dropped.
    const titleLower = title.toLowerCase().trim();
    if (NOISE_HEADINGS.has(titleLower)) continue;
    const wordCount = titleLower.split(/\s+/).length;
    if (!date && !looksLikeNewsUrl(link) && wordCount < 4) continue;

    items.push({ title, url: link, date });
  }
  // Dedupe by URL.
  const seen = new Set();
  const dedup = items.filter((it) => (seen.has(it.url) ? false : (seen.add(it.url), true)));
  return { ...base, candidates: { news_items: dedup.slice(0, 40) } };
}

// Surgery / advice-centre page — pull addresses, postcodes, phone,
// email, and any external booking link.
function extractSurgery(html, url) {
  const base = commonExtract(html, url, 'surgery');
  const postcodes = [...new Set([...html.matchAll(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g
  )].map((x) => x[1]))].slice(0, 10);
  const phones = [...new Set([...stripTags(html).matchAll(
    /\b(0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})\b/g
  )].map((x) => x[1]))].slice(0, 10);
  const emails = [...new Set([...html.matchAll(
    /mailto:([^"'>\s?]+)/gi
  )].map((x) => x[1]))].slice(0, 10);
  const externalBooking = (
    html.match(/href=["'](https?:\/\/(?:www\.)?(?:calendly|doodle|youcanbook|setmore|acuityscheduling|bookwhen|simplybook)[^"']+)["']/i)
    || []
  )[1] || null;
  return { ...base, candidates: { postcodes, phones, emails, externalBooking } };
}

// Contact page — addresses (heuristic line-by-line), emails,
// phones, form action.
function extractContact(html, url) {
  const base = commonExtract(html, url, 'contact');
  const text = stripTags(html);
  const postcodes = [...new Set([...text.matchAll(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g
  )].map((x) => x[1]))].slice(0, 10);
  const emails = [...new Set([...html.matchAll(
    /mailto:([^"'>\s?]+)/gi
  )].map((x) => x[1]))].slice(0, 10);
  const phones = [...new Set([...text.matchAll(
    /\b(0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})\b/g
  )].map((x) => x[1]))].slice(0, 10);
  const formAction = (html.match(/<form\b[^>]*\baction=["']([^"']+)["']/i) || [])[1] || null;
  return { ...base, candidates: { postcodes, phones, emails, formAction } };
}

// Newsletter page — capture provider + form action.
function extractNewsletter(html, url) {
  const base = commonExtract(html, url, 'newsletter');
  const provider = detectNewsletterProvider(html);
  const formAction = (html.match(/<form\b[^>]*\baction=["']([^"']+)["']/i) || [])[1] || null;
  return { ...base, candidates: { provider, formAction } };
}

// Default extractor — common fields + nothing custom.
function extractGeneric(html, url, type) {
  return commonExtract(html, url, type);
}

const EXTRACTORS = {
  campaigns: extractCampaigns,
  news_index: extractNewsIndex,
  surgery: extractSurgery,
  contact: extractContact,
  newsletter: extractNewsletter,
};

// ---------------------------------------------------------------
// 10. Main orchestrator: crawl one site
// ---------------------------------------------------------------
//
// Inputs:
//   member       — { id, name, party, partyAbbr, house, constituency, ... }
//                  (slim summary as written by the members crawl)
//   homepageUrl  — string, expected to be the MP's personal website
//
// Outputs the full structured result. The CLI layer (bin/parl.mjs)
// is responsible for writing it to disk.
export async function crawlSite(member, homepageUrl, opts = {}, ctx = {}) {
  const pacer = opts.pacer || new OriginPacer();
  const startedAt = new Date().toISOString();
  const log = [];   // chronological decisions, surfaced in manifest
  const decisions = []; // per-link classification audit

  const homepage = canonicalUrl(homepageUrl, homepageUrl);
  if (!homepage) {
    return { member, homepageUrl, ok: false, error: 'invalid url', startedAt };
  }
  const origin = originOf(homepage);
  const originHost = new URL(homepage).hostname;

  // 10.1 robots.txt
  const robotsUrl = `${origin}/robots.txt`;
  const robotsResp = await politeFetch(robotsUrl, pacer, ctx);
  let robots = { allow: [], disallow: [] };
  if (robotsResp.ok && typeof robotsResp.body === 'string') {
    robots = parseRobots(robotsResp.body);
    log.push({ step: 'robots', status: 'fetched', disallow: robots.disallow.length });
  } else {
    log.push({ step: 'robots', status: 'unavailable', http: robotsResp.status });
  }

  // 10.2 Homepage
  if (!robotsAllows(robots, homepage)) {
    log.push({ step: 'homepage', status: 'blocked-by-robots' });
    return {
      member, homepageUrl: homepage, origin, ok: false, blocked: true,
      robots: { disallow: robots.disallow },
      startedAt, finishedAt: new Date().toISOString(), log,
    };
  }
  const homeResp = await politeFetch(homepage, pacer, ctx);
  if (!homeResp.ok || typeof homeResp.body !== 'string') {
    log.push({ step: 'homepage', status: 'fetch-failed', http: homeResp.status, message: homeResp.message });
    return {
      member, homepageUrl: homepage, origin, ok: false,
      homepage_error: { status: homeResp.status, message: homeResp.message },
      startedAt, finishedAt: new Date().toISOString(), log,
    };
  }
  const homepageHtml = homeResp.body;
  // The final URL after redirects becomes the base for relative
  // hrefs and the source of `originHost` for same-origin checks.
  // This matters when an MP's listed URL 301s to another domain
  // (e.g. mikewood.mp → mike4kss.com).
  const finalHomepage = homeResp.url || homepage;
  const finalOriginHost = (() => {
    try { return new URL(finalHomepage).hostname; } catch { return originHost; }
  })();
  log.push({
    step: 'homepage',
    status: 'ok',
    bytes: homepageHtml.length,
    final_url: finalHomepage !== homepage ? finalHomepage : undefined,
  });

  // 10.3 Sitemap (best-effort, single attempt)
  let sitemap = null;
  if (robotsAllows(robots, `${origin}/sitemap.xml`)) {
    const r = await politeFetch(`${origin}/sitemap.xml`, pacer, ctx);
    if (r.ok && typeof r.body === 'string' && /<urlset|<sitemapindex/i.test(r.body)) {
      sitemap = r.body;
      log.push({ step: 'sitemap', status: 'ok', bytes: sitemap.length });
    } else {
      log.push({ step: 'sitemap', status: 'absent', http: r.status });
    }
  }

  // 10.4 Discover & fetch RSS/Atom feeds (cap at 3 — many WP sites
  // expose comment feeds we don't want).
  const feedUrls = discoverFeedUrls(homepageHtml, homepage)
    .filter((u) => !/comments|comment-feed/i.test(u))
    .slice(0, 3);
  const feeds = [];
  for (const fu of feedUrls) {
    if (!robotsAllows(robots, fu)) {
      log.push({ step: 'feed', url: fu, status: 'blocked-by-robots' });
      continue;
    }
    const r = await politeFetch(fu, pacer, ctx);
    if (r.ok && typeof r.body === 'string') {
      feeds.push({ url: fu, body: r.body, bytes: r.body.length });
      log.push({ step: 'feed', url: fu, status: 'ok', bytes: r.body.length });
    } else {
      log.push({ step: 'feed', url: fu, status: 'failed', http: r.status });
    }
  }

  // 10.5 Platform / newsletter sniff (homepage signals)
  const platform = detectPlatform(homepageHtml);
  const newsletterProvider = detectNewsletterProvider(homepageHtml);
  const social = extractSocialLinks(homepageHtml);

  // 10.6 Classify menu links and pick the first match per type
  const anchors = extractAnchors(homepageHtml, finalHomepage);
  const buckets = new Map();   // type -> { url, text, matched, fetch }
  for (const a of anchors) {
    // Personal-content guard FIRST. We never even classify excluded URLs.
    const ex = excludeReason(a.href);
    if (ex) {
      decisions.push({ url: a.href, text: a.text, action: 'excluded-personal', rule: ex.rule, reason: ex.reason });
      continue;
    }
    // robots check — record but don't fetch
    if (!robotsAllows(robots, a.href)) {
      decisions.push({ url: a.href, text: a.text, action: 'skipped-robots' });
      continue;
    }
    const cls = classifyLink(a.href, a.text, finalOriginHost);
    if (!cls) {
      decisions.push({ url: a.href, text: a.text, action: 'unclassified' });
      continue;
    }
    if (!buckets.has(cls.type)) {
      buckets.set(cls.type, { url: a.href, text: a.text, type: cls.type, matched: cls.matched, fetch: cls.fetch });
      decisions.push({ url: a.href, text: a.text, action: 'classified', type: cls.type, matched: cls.matched });
    } else {
      decisions.push({ url: a.href, text: a.text, action: 'classified-duplicate', type: cls.type });
    }
  }

  // 10.7 Fetch + extract each chosen page (subject to maxPagesPerSite).
  const pages = [];
  let fetched = 0;
  for (const entry of buckets.values()) {
    if (!entry.fetch) {
      pages.push({ url: entry.url, type: entry.type, presence_only: true, link_text: entry.text });
      continue;
    }
    if (fetched >= POLITENESS.maxPagesPerSite) {
      log.push({ step: 'page', url: entry.url, status: 'cap-reached' });
      break;
    }
    const r = await politeFetch(entry.url, pacer, ctx);
    if (!r.ok || typeof r.body !== 'string') {
      pages.push({ url: entry.url, type: entry.type, error: { status: r.status, message: r.message } });
      log.push({ step: 'page', url: entry.url, status: 'failed', http: r.status });
      continue;
    }
    fetched++;
    const ex = (EXTRACTORS[entry.type] || extractGeneric)(r.body, r.url, entry.type);
    pages.push({
      ...ex,
      link_text: entry.text,
      http_status: r.status,
      bytes: r.body.length,
      matched_token: entry.matched,
      raw_html: r.body,           // lossless: kept for downstream review
    });
    log.push({ step: 'page', url: entry.url, status: 'ok', type: entry.type, bytes: r.body.length });
  }

  // 10.8 Result
  return {
    member,
    homepageUrl: homepage,
    origin,
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    platform,
    newsletter_provider: newsletterProvider,
    social,
    feeds,                  // raw bodies; LLM/post-process can parse later
    sitemap,                // raw body
    homepage: {
      ...commonExtract(homepageHtml, homepage, 'homepage'),
      raw_html: homepageHtml,
    },
    pages,
    robots,
    decisions,              // per-link audit trail
    log,                    // chronological steps
  };
}

// Convenience export to let the CLI share one pacer across many
// concurrent crawls (so concurrent same-origin requests still pace).
export function newOriginPacer(delayMs) { return new OriginPacer(delayMs); }
