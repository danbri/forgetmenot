#!/usr/bin/env node
// Build a concrete catalogue of RSS/Atom feeds across the UK Parliament web
// estate, for update-tracking (knowing what changed without re-crawling the
// ~1.09M-URL sitemap set). Derives REAL feed URLs from the cached taxonomy
// sitemaps (every topic/type/tag/author archive on the WordPress Library hosts
// exposes <archive>/feed/) plus the first-party API RSS feeds.
//
// Output (under third_party/data/parliament-sitemap/):
//   feeds.json   array of {url, title, host, scope, tracks, format, source}
//   feeds.ttl    same as Turtle (dcterms + a small fmn: vocab)
//
// One feed per class was HTTP-validated (200, application/rss+xml) on the build
// date; the rest follow the identical WordPress pattern.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sm from '../lib/facilities/fetch-sitemap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = `${ROOT}/third_party/data/parliament-sitemap`;
const RAW = `${DIR}/raw`;

const titleize = (slug) => slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const lastSeg = (u) => { const p = new URL(u).pathname.replace(/\/$/, '').split('/'); return p[p.length - 1] || ''; };

// WordPress Library hosts: taxonomy sitemap file -> feed scope.
const WP = {
  'commonslibrary.parliament.uk': 'House of Commons Library',
  'lordslibrary.parliament.uk': 'House of Lords Library',
};
const TAX = { 'rb_topics': 'topic', 'rb_types': 'type', 'post_tag': 'tag', 'rb_authors': 'author' };

const feeds = [];

for (const [host, label] of Object.entries(WP)) {
  // main site feed
  feeds.push({ url: `https://${host}/feed/`, title: `${label} — all posts`, host, scope: 'site',
    tracks: `https://${host}/`, format: 'application/rss+xml', source: `https://${host}/feed/` });
  for (const [file, scope] of Object.entries(TAX)) {
    let xml;
    try { xml = gunzipSync(readFileSync(`${RAW}/${host}/${file}-sitemap.xml.gz`)).toString(); }
    catch { continue; }
    const src = `https://${host}/${file}-sitemap.xml`;
    for (const { loc } of sm.parse(xml).urls) {
      feeds.push({ url: `${loc}feed/`, title: titleize(lastSeg(loc)), host, scope,
        tracks: loc, format: 'application/rss+xml', source: src });
    }
  }
}

// First-party API RSS (validated; documented in the bills + library-feeds skills).
const API = [
  { url: 'https://bills-api.parliament.uk/api/v1/Rss/allbills.rss', title: 'All Bills', host: 'bills-api.parliament.uk', scope: 'api', tracks: 'https://bills.parliament.uk/', format: 'application/rss+xml', source: 'skills/bills' },
  { url: 'https://bills-api.parliament.uk/api/v1/Rss/publicbills.rss', title: 'Public Bills', host: 'bills-api.parliament.uk', scope: 'api', tracks: 'https://bills.parliament.uk/', format: 'application/rss+xml', source: 'skills/bills' },
  { url: 'https://bills-api.parliament.uk/api/v1/Rss/privatebills.rss', title: 'Private Bills', host: 'bills-api.parliament.uk', scope: 'api', tracks: 'https://bills.parliament.uk/', format: 'application/rss+xml', source: 'skills/bills' },
];
feeds.push(...API);

const meta = {
  generated: new Date().toISOString(),
  note: 'Concrete RSS/Atom feeds across the UK Parliament web estate for update-tracking. Derived from the cached taxonomy sitemaps (WordPress Library hosts expose <archive>/feed/ on every topic/type/tag/author) plus first-party API RSS. One feed per class HTTP-validated (200, application/rss+xml).',
  counts: feeds.reduce((a, f) => (a[f.scope] = (a[f.scope] || 0) + 1, a), { total: feeds.length }),
};

writeFileSync(`${DIR}/feeds.json`, JSON.stringify({ ...meta, feeds }, null, 1));

// Turtle
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
let ttl = `@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix fmn:     <https://forgetmenot.local/vocab/feeds#> .

fmn:Feed a rdfs:Class ; rdfs:label "Syndication feed (RSS/Atom)" .
# ${meta.note}
# generated ${meta.generated} — ${meta.counts.total} feeds
`;
for (const f of feeds) {
  ttl += `\n<${f.url}> a fmn:Feed ;
  dcterms:title "${esc(f.title)}" ;
  dcterms:format "${f.format}" ;
  fmn:host "${f.host}" ;
  fmn:scope "${f.scope}" ;
  fmn:tracks <${f.tracks}> ;
  dcterms:source <${f.source.startsWith('http') ? f.source : 'https://github.com/danbri/forgetmenot/tree/main/' + f.source}> .\n`;
}
writeFileSync(`${DIR}/feeds.ttl`, ttl);

console.log('feeds:', JSON.stringify(meta.counts));
console.log('wrote feeds.json + feeds.ttl');
