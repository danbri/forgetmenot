// UK Parliament (and generic) XML sitemap fetcher + parser.
//
// Fetches and parses `sitemap.xml` / `sitemapindex.xml` (the Sitemaps 0.9
// protocol), recurses a sitemap *index* into its child sitemaps, and
// enumerates every `<loc>`. Use it to inventory the *public web URLs* of the
// Parliament estate — including the many pages (guidance, "get involved",
// visiting, Library landing pages, publication types …) that have no JSON API
// representation, which the wrapped REST/SPARQL facilities do NOT cover.
//
// CLOUDFLARE — what actually works (probed 2026-06-05):
// Most parliament.uk *web* hosts now sit behind a Cloudflare "managed
// challenge" that returns HTTP 403 ("Just a moment…") to many clients. The
// behaviour is *transport-fingerprint* dependent, not User-Agent dependent:
//   - curl and a headless Chrome are challenged (403) — even with an honest UA.
//   - Node's built-in fetch (undici) currently passes for these sitemap
//     fetches: `fetchSitemap()`/`enumerate()` retrieve the real XML (verified
//     against www.parliament.uk/sitemapindex.xml → 6 child sitemaps,
//     sitemap.xml → ~15,966 URLs). We send an honest identifying UA and do NOT
//     spoof a browser or solve the challenge — a sitemap is published *for*
//     crawlers, so this is a plain polite GET, not bot-evasion.
//   - This edge behaviour can change without notice. So the parser is
//     DECOUPLED from the fetch: if a live fetch starts 403-ing, retrieve the
//     XML from a context Cloudflare permits (a normal browser passes the
//     challenge in one click; verified Googlebot passes) and feed the saved
//     bytes to `parse()` / `parseFile()`. Be polite: `enumerate` is sequential
//     with an optional `--delay-ms`.
//
// Authoritative sitemap locations are the `Sitemap:` line of each host's
// robots.txt; the entries below are the conventional/confirmed roots.

import { rawFetch } from '../http.mjs';

const XML_ACCEPT = 'application/xml, text/xml, application/xhtml+xml, */*';

// Conventional sitemap entry points across the Parliament web presence.
// `www.parliament.uk/sitemapindex.xml` is confirmed (declared in its
// robots.txt); the rest are the conventional per-host locations to try.
export const PARLIAMENT_SITEMAPS = [
  { host: 'www.parliament.uk',                sitemap: 'https://www.parliament.uk/sitemapindex.xml', kind: 'index', note: 'corporate site; confirmed in robots.txt' },
  { host: 'hansard.parliament.uk',            sitemap: 'https://hansard.parliament.uk/sitemap.xml' },
  { host: 'bills.parliament.uk',              sitemap: 'https://bills.parliament.uk/sitemap.xml' },
  { host: 'committees.parliament.uk',         sitemap: 'https://committees.parliament.uk/sitemap.xml' },
  { host: 'members.parliament.uk',            sitemap: 'https://members.parliament.uk/sitemap.xml' },
  { host: 'publications.parliament.uk',       sitemap: 'https://publications.parliament.uk/sitemap.xml' },
  { host: 'questions-statements.parliament.uk', sitemap: 'https://questions-statements.parliament.uk/sitemap.xml' },
  { host: 'lordslibrary.parliament.uk',       sitemap: 'https://lordslibrary.parliament.uk/sitemap.xml' },
  { host: 'commonslibrary.parliament.uk',     sitemap: 'https://commonslibrary.parliament.uk/sitemap.xml' },
  { host: 'whatson.parliament.uk',            sitemap: 'https://whatson.parliament.uk/sitemap.xml' },
];

// Static helper: the known Parliament sitemap entry points. Works offline.
export function hosts(opts = {}, ctx = {}) {
  return PARLIAMENT_SITEMAPS;
}

const CHALLENGE_RE = /just a moment|cf-chl|challenge-platform|enable javascript and cookies|cloudflare/i;

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Parse a sitemap XML string.
//   <sitemapindex> -> { type:'index',  sitemaps:[{loc,lastmod}] }
//   <urlset>       -> { type:'urlset',  urls:[{loc,lastmod,changefreq,priority}] }
// Pure and dependency-free (regex over the well-defined Sitemaps 0.9 schema),
// so it runs in Node and the browser with no XML library.
export function parse(xml) {
  if (typeof xml !== 'string') throw new Error('parse() expects an XML string.');
  if (!/<(sitemapindex|urlset)[\s>]/i.test(xml)) {
    if (CHALLENGE_RE.test(xml)) {
      throw new Error(
        'This looks like a Cloudflare challenge page, not a sitemap. The parliament.uk ' +
        'web hosts block automated fetches — open the sitemap in a normal browser (it passes ' +
        'the challenge), save the XML, and feed it to parse()/parseFile().');
    }
    throw new Error('Not a sitemap: no <sitemapindex> or <urlset> root element found.');
  }
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const blockRe = isIndex ? /<sitemap\b[\s\S]*?<\/sitemap>/gi : /<url\b[\s\S]*?<\/url>/gi;
  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? decodeXml(m[1].trim()) : undefined;
  };
  const items = [];
  for (const block of xml.match(blockRe) || []) {
    const loc = pick(block, 'loc');
    if (!loc) continue;
    const entry = { loc };
    const lastmod = pick(block, 'lastmod');
    if (lastmod) entry.lastmod = lastmod;
    if (!isIndex) {
      const cf = pick(block, 'changefreq'); if (cf) entry.changefreq = cf;
      const pr = pick(block, 'priority');   if (pr) entry.priority = pr;
    }
    items.push(entry);
  }
  return isIndex ? { type: 'index', sitemaps: items } : { type: 'urlset', urls: items };
}

// Fetch a sitemap URL and parse it. NOTE: live parliament *web* hosts are
// usually Cloudflare-403 (see top-of-file); the *-api hosts and arbitrary
// other sites work fine.
export async function fetchSitemap(url, opts = {}, ctx = {}) {
  const r = await rawFetch(url, { method: 'GET' }, { ...ctx, accept: XML_ACCEPT });
  const body = typeof r.body === 'string' ? r.body : new TextDecoder().decode(new Uint8Array(r.body || []));
  return parse(body);
}

// Parse a local sitemap file (Node only — the offline path: save the XML from
// a browser that passed the challenge, then point this at it).
export async function parseFile(path, opts = {}, ctx = {}) {
  const { readFileSync } = await import('node:fs');
  return parse(readFileSync(path, 'utf8'));
}

// Recurse a sitemap (index -> child sitemaps) and return a flat URL list.
// opts: { maxSitemaps=100, limit=Infinity, delayMs=0 }. Sequential by design
// (polite). Per-child fetch errors are captured, not thrown, so one blocked
// child sitemap doesn't sink the whole enumeration.
export async function enumerate(url, opts = {}, ctx = {}) {
  const maxSitemaps = Number(opts.maxSitemaps ?? 100);
  const limit = opts.limit ? Number(opts.limit) : Infinity;
  const delayMs = Number(opts.delayMs ?? 0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const root = await fetchSitemap(url, {}, ctx);
  if (root.type === 'urlset') {
    return { root: url, kind: 'urlset', childSitemaps: 0, urlCount: root.urls.length,
             urls: root.urls.slice(0, limit) };
  }
  const children = root.sitemaps.slice(0, maxSitemaps);
  const sitemaps = [];
  const urls = [];
  for (const child of children) {
    if (urls.length >= limit) break;
    try {
      const sub = await fetchSitemap(child.loc, {}, ctx);
      const subUrls = sub.type === 'urlset' ? sub.urls : [];
      sitemaps.push({ loc: child.loc, urls: subUrls.length });
      for (const u of subUrls) { if (urls.length >= limit) break; urls.push(u); }
    } catch (e) {
      sitemaps.push({ loc: child.loc, error: e.message });
    }
    if (delayMs) await sleep(delayMs);
  }
  return { root: url, kind: 'index', childSitemaps: children.length,
           urlsTruncated: urls.length >= limit, urlCount: urls.length, sitemaps, urls };
}

// Group a flat URL list (array of {loc} or strings) by host, with per-host
// counts and a sample. Cheap way to see which corners of the estate a sitemap
// covers — and, by comparison with the wrapped facilities, which have no API.
export function byHost(urls = []) {
  const out = {};
  for (const u of urls) {
    const loc = typeof u === 'string' ? u : u.loc;
    if (!loc) continue;
    let host; try { host = new URL(loc).host; } catch { host = '(invalid)'; }
    (out[host] ||= { count: 0, sample: [] });
    out[host].count++;
    if (out[host].sample.length < 3) out[host].sample.push(loc);
  }
  return Object.entries(out)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([host, v]) => ({ host, count: v.count, sample: v.sample }));
}
