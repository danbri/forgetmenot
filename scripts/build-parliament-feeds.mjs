#!/usr/bin/env node
// Build a concrete catalogue of RSS/Atom feeds across the UK Parliament web
// estate, for update-tracking AND for a searchable/filterable UI. Derives REAL
// feed URLs from the cached taxonomy sitemaps (every topic/type/tag/author
// archive on the WordPress Library hosts exposes <archive>/feed/) plus the
// first-party API RSS feeds, with enough metadata (host, chamber, scope, group,
// tags, facet counts) to power search, filter, and tag/subview toggles.
//
// Output (under third_party/data/parliament-sitemap/):
//   feeds.json   { generated, note, facets, feeds:[{id,url,title,host,hostLabel,
//                  chamber,scope,group,path,slug,tags,tracks,format,source}] }
//   feeds.ttl    same as Turtle (dcterms + fmn: vocab)
//
// One feed per class was HTTP-validated (200, application/rss+xml) on build.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sm from '../lib/facilities/fetch-sitemap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = `${ROOT}/third_party/data/parliament-sitemap`;
const RAW = `${DIR}/raw`;

const titleize = (slug) => slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const segsAfter = (loc, base) => {
  const p = new URL(loc).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const i = p.indexOf(base);
  return i === -1 ? p : p.slice(i + 1);
};

const HOSTS = {
  'commonslibrary.parliament.uk': { label: 'House of Commons Library', chamber: 'Commons', short: 'cl' },
  'lordslibrary.parliament.uk': { label: 'House of Lords Library', chamber: 'Lords', short: 'll' },
};
// taxonomy sitemap file -> { scope, base path segment }
const TAX = {
  'rb_topics': { scope: 'topic', base: 'topic' },
  'rb_types': { scope: 'type', base: 'type' },
  'post_tag': { scope: 'tag', base: 'tag' },
  'rb_authors': { scope: 'author', base: 'authors' },
};

const feeds = [];
const seenId = new Set();
const mkId = (parts) => {
  let id = parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let n = id; let i = 2; while (seenId.has(n)) n = `${id}-${i++}`;
  seenId.add(n); return n;
};

for (const [host, info] of Object.entries(HOSTS)) {
  feeds.push({
    id: mkId([info.short, 'all']), url: `https://${host}/feed/`,
    title: `${info.label} — all posts`, host, hostLabel: info.label, chamber: info.chamber,
    scope: 'site', group: null, path: '', slug: 'all',
    tags: ['library', info.chamber.toLowerCase(), 'all'],
    tracks: `https://${host}/`, format: 'application/rss+xml', source: `https://${host}/feed/`,
  });
  for (const [file, { scope, base }] of Object.entries(TAX)) {
    let xml; try { xml = gunzipSync(readFileSync(`${RAW}/${host}/${file}-sitemap.xml.gz`)).toString(); } catch { continue; }
    const src = `https://${host}/${file}-sitemap.xml`;
    for (const { loc } of sm.parse(xml).urls) {
      const segs = segsAfter(loc, base);
      const slug = segs[segs.length - 1] || '';
      const group = scope === 'topic' && segs.length > 1 ? segs[0] : null;
      feeds.push({
        id: mkId([info.short, scope, slug]), url: `${loc}feed/`, title: titleize(slug),
        host, hostLabel: info.label, chamber: info.chamber, scope,
        group, path: segs.join('/'), slug,
        tags: ['library', info.chamber.toLowerCase(), scope, ...(group ? [group] : [])],
        tracks: loc, format: 'application/rss+xml', source: src,
      });
    }
  }
}

// First-party API RSS (validated; documented in the bills skill).
for (const [slug, title] of [['allbills', 'All Bills'], ['publicbills', 'Public Bills'], ['privatebills', 'Private Bills']]) {
  feeds.push({
    id: mkId(['bills', slug]), url: `https://bills-api.parliament.uk/api/v1/Rss/${slug}.rss`,
    title, host: 'bills-api.parliament.uk', hostLabel: 'Bills API', chamber: null, scope: 'api',
    group: 'bills', path: slug, slug, tags: ['api', 'bills'],
    tracks: 'https://bills.parliament.uk/', format: 'application/rss+xml', source: 'skills/bills',
  });
}

// Facets for filter UI: counts per dimension.
const facet = (key) => feeds.reduce((a, f) => { const v = f[key]; if (v != null) a[v] = (a[v] || 0) + 1; return a; }, {});
const tagFacet = feeds.reduce((a, f) => { for (const t of f.tags) a[t] = (a[t] || 0) + 1; return a; }, {});
const out = {
  generated: new Date().toISOString(),
  note: 'Concrete RSS/Atom feeds across the UK Parliament web estate, with metadata for search/filter/tag toggles. Derived from the cached taxonomy sitemaps (WordPress Library hosts expose <archive>/feed/) + first-party API RSS. One feed per class HTTP-validated (200, application/rss+xml).',
  facets: { total: feeds.length, host: facet('host'), hostLabel: facet('hostLabel'), chamber: facet('chamber'), scope: facet('scope'), group: facet('group'), tag: tagFacet },
  feeds,
};
writeFileSync(`${DIR}/feeds.json`, JSON.stringify(out, null, 1));

// Turtle (with the extra metadata)
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
let ttl = `@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix fmn:     <https://forgetmenot.local/vocab/feeds#> .

fmn:Feed a rdfs:Class ; rdfs:label "Syndication feed (RSS/Atom)" .
# ${out.note}
# generated ${out.generated} — ${feeds.length} feeds
`;
for (const f of feeds) {
  ttl += `\n<${f.url}> a fmn:Feed ;
  dcterms:title "${esc(f.title)}" ;
  dcterms:format "${f.format}" ;
  fmn:host "${f.host}" ;
  fmn:scope "${f.scope}" ;${f.chamber ? `\n  fmn:chamber "${f.chamber}" ;` : ''}${f.group ? `\n  fmn:group "${esc(f.group)}" ;` : ''}
  ${f.tags.map(t => `fmn:tag "${esc(t)}"`).join(' ;\n  ')} ;
  fmn:tracks <${f.tracks}> ;
  dcterms:source <${f.source.startsWith('http') ? f.source : 'https://github.com/danbri/forgetmenot/tree/main/' + f.source}> .\n`;
}
writeFileSync(`${DIR}/feeds.ttl`, ttl);

console.log('feeds:', feeds.length, '| facets:', JSON.stringify({ scope: out.facets.scope, chamber: out.facets.chamber }));
