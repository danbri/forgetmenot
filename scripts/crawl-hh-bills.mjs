#!/usr/bin/env node
// Crawl Historic Hansard's per-bill pages (1803–2005) into a structured
// bill -> stages dataset under third_party/. The source is HTML only, so we
// cache each page per-URL (resumable, like the thesaurus crawler) and parse
// the dated stage links out of it.
//
// Output (third_party/data/historic-hansard-bills/):
//   bills-index.json   every bill slug + title from the A-Z index
//   bills.json         bill -> [{ house, date, title, url }] stage references
//   bills.nq.gz        same as a named graph for the fpkg store
//
// Usage:  node scripts/crawl-hh-bills.mjs [--max N] [--sleep 300] [--index-only]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const MAX = Number(arg('max', 0));            // 0 = all
const SLEEP = Number(arg('sleep', 300));
const BASE = 'https://api.parliament.uk/historic-hansard';
const CACHE = `${ROOT}/cache-hh-bills`;       // gitignored, resumable
const OUT = `${ROOT}/third_party/data/historic-hansard-bills`;
const GRAPH = 'https://forgetmenot.local/graph/historic-hansard-bills';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(CACHE, { recursive: true }); mkdirSync(OUT, { recursive: true });

// Per-URL cache: hash(url) -> .html. Returns { html, cached }.
async function fetchCached(url) {
  const f = `${CACHE}/${createHash('sha256').update(url).digest('hex').slice(0, 24)}.html`;
  if (existsSync(f)) return { html: readFileSync(f, 'utf8'), cached: true };
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'forgetmenot/hh-bills (https://github.com/danbri/forgetmenot)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      writeFileSync(f, html); return { html, cached: false };
    } catch (e) {
      if (a === 4) { console.error(`  give up ${url}: ${e.message}`); return { html: null, cached: false }; }
      await sleep(Math.min(30000, SLEEP + 2 ** a * 1000));
    }
  }
}

// Parse the A-Z index into [{ slug, title }].
function parseIndex(html) {
  const out = new Map();
  for (const m of html.matchAll(/<a[^>]+href="(?:[^"]*)?\/bills\/([a-z0-9][a-z0-9-]*)"[^>]*>([^<]*)<\/a>/gi)) {
    const slug = m[1]; const title = m[2].trim().replace(/\s+/g, ' ');
    if (!slug.includes('-')) continue;     // drop A-Z letter-nav (/bills/b) + /bills/index
    if (!out.has(slug)) out.set(slug, { slug, title: title || slug });
  }
  return [...out.values()];
}

// Parse one bill page into stage references: dated links to sitting debates.
function parseStages(html) {
  const stages = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a[^>]+href="((?:[^"]*)?\/(commons|lords)\/(\d{4})\/(\w{3})\/(\d{1,2})\/[a-z0-9-]+)"[^>]*>([^<]*)<\/a>/gi)) {
    const [, href, house, y, mon, d, text] = m;
    const url = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(url)) continue; seen.add(url);
    stages.push({ house, date: `${y}-${mon}-${d.padStart(2, '0')}`, title: text.trim().replace(/\s+/g, ' '), url });
  }
  return stages;
}

// ---- main -----------------------------------------------------------------
console.error('Fetching bills A-Z index…');
const { html: idxHtml } = await fetchCached(`${BASE}/bills/index.html`);
if (!idxHtml) { console.error('index fetch failed'); process.exit(1); }
let bills = parseIndex(idxHtml);
console.error(`Index lists ${bills.length} bill pages.`);
writeFileSync(`${OUT}/bills-index.json`, JSON.stringify(
  { source: `${BASE}/bills/index.html`, generated: new Date().toISOString(), count: bills.length, bills }, null, 1));

if (has('index-only')) { console.error('index-only: wrote bills-index.json, stopping.'); process.exit(0); }

if (MAX) bills = bills.slice(0, MAX);
const records = {}; let done = 0, totalStages = 0;
for (const b of bills) {
  const { html, cached } = await fetchCached(`${BASE}/bills/${b.slug}`);
  if (html) {
    const stages = parseStages(html);
    records[b.slug] = { slug: b.slug, title: b.title, stageCount: stages.length, stages };
    totalStages += stages.length;
  }
  if (++done % 100 === 0) console.error(`  ${done}/${bills.length} bills, ${totalStages} stage refs so far`);
  if (!cached) await sleep(SLEEP);
}

writeFileSync(`${OUT}/bills.json`, JSON.stringify(
  { source: BASE, graph: GRAPH, generated: new Date().toISOString(),
    note: 'Historic Hansard per-bill stage references (1803–2005). Slugs are by bill NAME and CONFLATE same-named bills across sessions — disambiguate by date cluster.',
    counts: { bills: Object.keys(records).length, stageRefs: totalStages }, bills: records }, null, 1));

// Minimal named graph: bill -> debatedAt -> sitting, with date + house.
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const lines = [];
for (const r of Object.values(records)) {
  const bill = `${BASE}/bills/${r.slug}`;
  lines.push(`<${bill}> <http://www.w3.org/2000/01/rdf-schema#label> "${esc(r.title)}" <${GRAPH}> .`);
  for (const s of r.stages) {
    lines.push(`<${bill}> <https://forgetmenot.local/schema/debatedAt> <${s.url}> <${GRAPH}> .`);
    lines.push(`<${s.url}> <http://purl.org/dc/terms/date> "${s.date}" <${GRAPH}> .`);
    lines.push(`<${s.url}> <https://forgetmenot.local/schema/house> "${s.house}" <${GRAPH}> .`);
  }
}
writeFileSync(`${OUT}/bills.nq.gz`, gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8'), { level: 9 }));
console.error(`Wrote ${Object.keys(records).length} bills, ${totalStages} stage refs; ${lines.length} quads.`);
