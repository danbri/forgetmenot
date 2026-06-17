#!/usr/bin/env node
// Pull OCR'd full text of *Cobbett's Parliamentary History of England,
// 1066–1803* (the pre-Hansard record of debates) from the Internet Archive
// into third_party/. The Bodleian holds page IMAGES (would need OCR); IA
// already has OCR text for this long-out-of-copyright work — check-then-fill.
//
// Output (third_party/data/cobbetts-parl-history/):
//   <identifier>.txt.gz   gzipped OCR text per volume
//   index.json            volumes pulled + coverage notes
//
// Resumable: skips volumes already downloaded. Usage: node scripts/fetch-cobbetts.mjs
import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = `${ROOT}/third_party/data/cobbetts-parl-history`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Find the History volumes (exclude the post-1803 "Parliamentary Debates").
const q = 'title:("parliamentary history of england") AND mediatype:texts';
const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}`
  + `&fl[]=identifier&fl[]=title&fl[]=volume&fl[]=year&rows=200&output=json`;
const docs = (await (await fetch(searchUrl)).json()).response.docs
  .filter((d) => /parliamentary history/i.test(d.title || ''));
console.error(`IA lists ${docs.length} 'Parliamentary History' text items.`);

const index = [];
for (const d of docs) {
  const id = d.identifier;
  const gz = `${OUT}/${id}.txt.gz`;
  if (existsSync(gz)) { index.push({ id, title: d.title, volume: d.volume, year: d.year, bytes: statSync(gz).size, cached: true }); continue; }
  try {
    // find the *_djvu.txt file via item metadata
    const meta = await (await fetch(`https://archive.org/metadata/${id}`)).json();
    const tf = (meta.files || []).find((f) => /_djvu\.txt$/.test(f.name)) || (meta.files || []).find((f) => /\.txt$/.test(f.name) && !/_meta/.test(f.name));
    if (!tf) { console.error(`  ${id}: no text file`); continue; }
    const txt = await (await fetch(`https://archive.org/download/${id}/${encodeURIComponent(tf.name)}`)).text();
    const buf = gzipSync(Buffer.from(txt, 'utf8'), { level: 9 });
    writeFileSync(gz, buf);
    index.push({ id, title: d.title, volume: d.volume, year: d.year, textBytes: txt.length, gzBytes: buf.length });
    console.error(`  ${id}: ${(txt.length / 1024 / 1024).toFixed(1)} MB text -> ${(buf.length / 1024 / 1024).toFixed(1)} MB gz`);
    await sleep(400);
  } catch (e) { console.error(`  ${id}: ${e.message}`); }
}

writeFileSync(`${OUT}/index.json`, JSON.stringify({
  source: 'Internet Archive (OCR of Cobbett\'s Parliamentary History of England, 1066–1803)',
  work_images: 'https://digital.bodleian.ox.ac.uk/collections/cobbetts-parliamentary-history/',
  via: 'https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/parliament/',
  generated: new Date().toISOString(),
  note: 'Pre-1803 debates are unofficial; this is the most complete collection. IA coverage of the 36-vol work is partial (Google scans ~13 vols); enumerate gaps from this index and fill from other IA/HathiTrust sets.',
  volumes: index.length, volumesList: index,
}, null, 1));
console.error(`Wrote ${index.length} volumes to ${OUT}`);
