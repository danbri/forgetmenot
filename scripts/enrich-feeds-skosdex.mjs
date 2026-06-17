#!/usr/bin/env node
// Enrich the Parliament RSS feed catalogue with controlled-vocabulary
// subject codes, via hosted skosdex (no local model). For each Library
// *topic* feed it resolves the topic title to concepts in EuroVoc, GEMET
// and the UK Parliament thesaurus by English label match, then (where a
// Parliament-thesaurus concept matched) bridges semantically to nearby
// ESCO/GEMET concepts through skosdex's embedding KNN.
//
// One computation, two faithful serializations — exactly the architecture
// FPKG already uses for every other graph:
//   - feeds-enrichment.json   reader-fetchable sidecar (cached by server)
//   - feeds-enrichment.nq.gz  named graph loaded into the Oxigraph store
//
// Deliberately precision-first (keeps only exact / conservative-partial
// label matches and high-score embedding neighbours) so the shipped tags
// are eyeballable rather than noisy. Resilient: if skosdex is largely
// unreachable it aborts WITHOUT overwriting the prior enrichment.
//
// Usage:  node scripts/enrich-feeds-skosdex.mjs [--sleep 80] [--min-cov 0.5]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as skosdex from '../lib/facilities/skosdex.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SLEEP_MS = Number(arg('sleep', 80));
const MIN_COVERAGE = Number(arg('min-cov', 0.5)); // abort-guard: min fraction of titles that must resolve

const SITEMAP_DIR = `${ROOT}/third_party/data/parliament-sitemap`;
const FEEDS_JSON = `${SITEMAP_DIR}/feeds.json`;
const OUT_JSON = `${SITEMAP_DIR}/feeds-enrichment.json`;
const OUT_NQ = `${SITEMAP_DIR}/feeds-enrichment.nq.gz`;
const SERVED_JSON = `${ROOT}/demos/parliament-live/web/kgx/feeds-enrichment.json`;

const GRAPH = 'https://forgetmenot.local/graph/feeds-enrichment';
const DCT_SUBJECT = 'http://purl.org/dc/terms/subject';
const SKOS_PREF = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const SKOS_INSCHEME = 'http://www.w3.org/2004/02/skos/core#inScheme';

// Label-search schemes (precision-first). EuroVoc = broad topical; GEMET =
// environment-only-ish but fairly broad; the Parliament thesaurus is
// Parliament's own vocab — but it skews to NAMED ENTITIES (e.g. "AGIP
// (Africa)"), so a loose token-subset partial there grabs junk. Allow
// partials only for the topical thesauri; require EXACT for Parliament's.
const SCHEMES = [
  { slug: 'eurovoc', uri: 'http://eurovoc.europa.eu/100141', allowPartial: true, embedSeed: false },
  { slug: 'gemet', uri: 'http://www.eionet.europa.eu/gemet/gemetThesaurus', allowPartial: true, embedSeed: true },
  { slug: 'uk-parliament-thesaurus', uri: 'http://data.parliament.uk/terms/', allowPartial: false, embedSeed: true },
];
// Embedding bridge is a "see also" expansion seeded ONLY from a clean exact
// match in an embedded scheme (Parliament-thesaurus or GEMET), so a bad
// seed can't cascade. EuroVoc is not in the embedding space.
const EMBED_MIN_SCORE = 0.55;
const EMBED_CAP = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const toks = (s) => new Set(norm(s).split(' ').filter(Boolean));
const subset = (a, b) => [...a].every((x) => b.has(x));

// Single-token concepts too generic to be a useful subject on their own — a
// feed titled "Public Spending" shouldn't get tagged just "public".
const GENERIC_LABELS = new Set(['policy', 'public', 'world']);

// Classify a candidate label against the query title.
function matchLevel(title, label, allowPartial) {
  if (!label) return null;
  if (norm(title) === norm(label)) return 'exact';
  if (!allowPartial) return null;
  const t = toks(title), l = toks(label);
  if (!t.size || !l.size) return null;
  // Accept a partial ONLY when the concept GENERALISES the feed — its label
  // tokens are a subset of the feed-title tokens, i.e. the feed is a more
  // specific instance of a broader concept ("Rented Housing" → housing,
  // "Further Education" → education). REJECT the other direction (title ⊆ label),
  // where the concept is a *narrower sibling* that merely contains the feed word
  // ("Economy" → "underground economy", "Water" → "hot water"): that was the
  // semantic-drift class that made the tags untrustworthy.
  if (subset(l, t) && Math.abs(t.size - l.size) <= 1) {
    if (l.size === 1 && GENERIC_LABELS.has([...l][0])) return null;  // too generic alone
    return 'partial';
  }
  return null;
}

async function bestLabelMatch(title, scheme) {
  let res;
  try {
    res = await skosdex.search(title, { scheme: scheme.uri, rows: 6, lang: 'en',
      fl: 'id,prefLabel_en,altLabel_en' });
  } catch (e) { return { error: String(e.message || e) }; }
  const docs = res?.response?.docs || [];
  let best = null;
  for (const d of docs) {
    const labels = [].concat(d.prefLabel_en || [], d.altLabel_en || []);
    for (const lab of labels) {
      const lvl = matchLevel(title, lab, scheme.allowPartial);
      if (lvl && (!best || (lvl === 'exact' && best.match !== 'exact'))) {
        best = { concept: d.id, scheme: scheme.slug, schemeUri: scheme.uri,
          label: (d.prefLabel_en && d.prefLabel_en[0]) || lab, matchedOn: lab, via: 'label', match: lvl };
      }
      if (best && best.match === 'exact') break;
    }
    if (best && best.match === 'exact') break;
  }
  return { best };
}

async function embedNeighbours(conceptIri) {
  let res;
  try { res = await skosdex.similar(conceptIri, { k: 6, cross: 1 }); }
  catch { return []; }
  return (res?.results || [])
    .filter((r) => r.score >= EMBED_MIN_SCORE && r.id !== conceptIri)
    .slice(0, EMBED_CAP)
    .map((r) => ({ concept: r.id, scheme: r.scheme, label: r.label,
      via: 'embedding', match: 'semantic', score: Math.round(r.score * 1e4) / 1e4 }));
}

// ---- main -----------------------------------------------------------------
const feeds = JSON.parse(readFileSync(FEEDS_JSON, 'utf8')).feeds || [];
const topics = feeds.filter((f) => f.scope === 'topic');
// Dedupe lookups by title — Commons & Lords share many topic titles, and we
// want both chambers' feeds to land on the SAME concept (free "related feeds").
const byTitle = new Map();
for (const f of topics) {
  const key = norm(f.title);
  if (!byTitle.has(key)) byTitle.set(key, { title: f.title, feeds: [] });
  byTitle.get(key).feeds.push(f);
}

console.error(`Enriching ${topics.length} topic feeds (${byTitle.size} distinct titles) via skosdex…`);
const titleSubjects = new Map(); // normTitle -> subjects[]
let resolved = 0, failures = 0;
for (const [key, { title }] of byTitle) {
  const subjects = [];
  let embedSeed = null; // { concept, rank } — clean exact concept to expand from
  for (let i = 0; i < SCHEMES.length; i++) {
    const scheme = SCHEMES[i];
    const { best, error } = await bestLabelMatch(title, scheme);
    if (error) { failures++; continue; }
    if (best) {
      subjects.push(best);
      // Seed the embedding bridge only from an EXACT match in an embedded
      // scheme; prefer Parliament-thesaurus (rank 0) over GEMET (rank by index).
      if (scheme.embedSeed && best.match === 'exact' && (!embedSeed || i < embedSeed.rank)) {
        embedSeed = { concept: best.concept, rank: i };
      }
    }
    await sleep(SLEEP_MS);
  }
  if (embedSeed) {
    const seen = new Set(subjects.map((s) => s.concept));
    for (const nb of await embedNeighbours(embedSeed.concept)) {
      if (!seen.has(nb.concept)) { subjects.push(nb); seen.add(nb.concept); }
    }
    await sleep(SLEEP_MS);
  }
  if (subjects.length) resolved++;
  titleSubjects.set(key, subjects);
}

// Abort-guard: if skosdex was largely down, don't clobber prior good data.
const coverage = byTitle.size ? resolved / byTitle.size : 0;
console.error(`Resolved ${resolved}/${byTitle.size} titles (coverage ${(coverage * 100).toFixed(0)}%); ${failures} lookup errors.`);
if (coverage < MIN_COVERAGE && existsSync(OUT_JSON)) {
  console.error(`Coverage ${(coverage * 100).toFixed(0)}% < ${(MIN_COVERAGE * 100)}% — skosdex likely degraded; keeping existing enrichment, not overwriting.`);
  process.exit(2);
}

// Build the per-feed sidecar JSON (keyed by feed id) + the named graph.
const enrichment = {};
for (const f of topics) {
  const subs = titleSubjects.get(norm(f.title)) || [];
  if (subs.length) enrichment[f.id] = { url: f.url, title: f.title, subjects: subs };
}

const nqEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
const lines = [];
lines.push(`<${GRAPH}> <http://purl.org/dc/terms/created> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> <${GRAPH}> .`);
lines.push(`<${GRAPH}> <http://www.w3.org/2000/01/rdf-schema#comment> "RSS feed subject enrichment via skosdex (label match + embedding KNN)."@en <${GRAPH}> .`);
const emittedConcept = new Set();
for (const f of topics) {
  const subs = titleSubjects.get(norm(f.title)) || [];
  for (const s of subs) {
    lines.push(`<${f.url}> <${DCT_SUBJECT}> <${s.concept}> <${GRAPH}> .`);
    if (!emittedConcept.has(s.concept)) {
      emittedConcept.add(s.concept);
      if (s.label) lines.push(`<${s.concept}> <${SKOS_PREF}> "${nqEsc(s.label)}"@en <${GRAPH}> .`);
      if (s.schemeUri) lines.push(`<${s.concept}> <${SKOS_INSCHEME}> <${s.schemeUri}> <${GRAPH}> .`);
    }
  }
}

const meta = {
  generated: new Date().toISOString(),
  source: 'skosdex.fly.dev (label search + embedding KNN)',
  note: 'Subject codes for Library TOPIC feeds. via=label is an exact/partial English-label match; via=embedding is an all-MiniLM-L6-v2 nearest-concept bridge (score = cosine). EuroVoc/GEMET/Parliament-thesaurus by label; ESCO/GEMET neighbours by embedding.',
  schemes: SCHEMES.map((s) => s.slug),
  graph: GRAPH,
  counts: { topicFeeds: topics.length, distinctTitles: byTitle.size, feedsTagged: Object.keys(enrichment).length },
  feeds: enrichment,
};
writeFileSync(OUT_JSON, JSON.stringify(meta, null, 1));
writeFileSync(SERVED_JSON, JSON.stringify(meta));
writeFileSync(OUT_NQ, gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8'), { level: 9 }));

const viaCounts = {};
for (const e of Object.values(enrichment)) for (const s of e.subjects) viaCounts[`${s.scheme}/${s.via}`] = (viaCounts[`${s.scheme}/${s.via}`] || 0) + 1;
console.error(`Wrote ${Object.keys(enrichment).length} tagged feeds; ${lines.length} quads.`);
console.error('Subjects by scheme/via:', JSON.stringify(viaCounts));
