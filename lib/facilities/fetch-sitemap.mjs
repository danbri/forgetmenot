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

// Recurse a sitemap to any depth (index -> index -> … -> urlset) and return a
// flat URL list. opts: { maxSitemaps=500, maxDepth=6, limit=Infinity, delayMs=0 }.
// Sequential by design (polite). Per-sitemap fetch errors are captured, not
// thrown, so one blocked child doesn't sink the whole enumeration.
export async function enumerate(url, opts = {}, ctx = {}) {
  const maxSitemaps = Number(opts.maxSitemaps ?? 500);
  const maxDepth = Number(opts.maxDepth ?? 6);
  const limit = opts.limit ? Number(opts.limit) : Infinity;
  const delayMs = Number(opts.delayMs ?? 0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const sitemaps = [];   // { loc, depth, type, urls|error }
  const urls = [];
  const seen = new Set();
  let fetched = 0;

  async function walk(loc, depth) {
    if (urls.length >= limit || fetched >= maxSitemaps || depth > maxDepth) return;
    if (seen.has(loc)) return; seen.add(loc); fetched++;
    let r;
    try { r = await fetchSitemap(loc, {}, ctx); }
    catch (e) { sitemaps.push({ loc, depth, type: 'error', error: e.message }); return; }
    if (r.type === 'index') {
      sitemaps.push({ loc, depth, type: 'index', children: r.sitemaps.length });
      for (const s of r.sitemaps) {
        if (delayMs) await sleep(delayMs);
        await walk(s.loc, depth + 1);
        if (urls.length >= limit || fetched >= maxSitemaps) break;
      }
    } else {
      sitemaps.push({ loc, depth, type: 'urlset', urls: r.urls.length });
      for (const u of r.urls) { if (urls.length >= limit) break; urls.push(u); }
    }
  }
  await walk(url, 0);

  return {
    root: url,
    sitemapsVisited: fetched,
    urlsTruncated: urls.length >= limit,
    urlCount: urls.length,
    sitemaps,
    urls,
  };
}

// Build a nested {name, path, count, children[]} hierarchy from a flat URL list,
// keyed by host then successive path segments. Pure. opts:
//   maxDepth   — how many path segments deep to split (default 4)
//   minCount   — collapse branches smaller than this into a "(N pages)" leaf (default 1)
// Internal nodes carry `count` = total leaves beneath. Good input for a D3
// treemap / icicle / sunburst of the web estate's shape.
export function pathHierarchy(urls = [], opts = {}) {
  const maxDepth = Number(opts.maxDepth ?? 4);
  const minCount = Number(opts.minCount ?? 1);
  const root = { name: 'parliament.uk', children: new Map(), count: 0 };

  for (const u of urls) {
    const loc = typeof u === 'string' ? u : u.loc;
    if (!loc) continue;
    let parsed; try { parsed = new URL(loc); } catch { continue; }
    const segs = [parsed.host, ...parsed.pathname.split('/').filter(Boolean).slice(0, maxDepth)];
    let node = root; root.count++;
    let path = '';
    for (const seg of segs) {
      path = path ? `${path}/${seg}` : seg;
      let child = node.children.get(seg);
      if (!child) { child = { name: seg, path, children: new Map(), count: 0 }; node.children.set(seg, child); }
      child.count++;
      node = child;
    }
  }

  // Map -> array; prune small branches into a rollup leaf; add a "(section
  // root)" leaf for URLs that terminate at an internal node, so the sum of all
  // leaves equals the total URL count exactly (clean partition/treemap sizing).
  function finalize(node) {
    const kids = [...node.children.values()];
    if (!kids.length) { delete node.children; return node; }
    const childSum = kids.reduce((a, k) => a + k.count, 0);
    const self = node.count - childSum;          // URLs ending exactly at this node
    const keep = [];
    let rolled = 0;
    for (const k of kids) {
      if (k.count < minCount) { rolled += k.count; continue; }
      keep.push(finalize(k));
    }
    keep.sort((a, b) => b.count - a.count);
    if (rolled > 0) keep.push({ name: `… ${rolled} smaller`, count: rolled, rollup: true });
    if (self > 0) keep.push({ name: `(${node.name} root)`, count: self, self: true });
    node.children = keep;
    return node;
  }
  return finalize(root);
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
