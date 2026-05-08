#!/usr/bin/env node
// Rebuild demos/instruments-by-act/artifact/index.html from
// demos/instruments-by-act/web/index.html + a fresh fetch of the
// per-Act SI histograms. Produces a single self-contained HTML file
// you can open offline (or paste into an HTML artifact preview).
//
// Run from the repo root:
//   node demos/instruments-by-act/build-artifact.mjs
//
// The Act list is the FEATURED set in web/index.html plus a curated
// "more Acts" pool — both edited inline below. Adding an Act here
// means the picker in the artifact gets a new option.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateByAct } from './server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// id, name, year, blurb, featured.
const ACTS = [
  { id: 'wJgZW8CQ', name: 'Public Health (Control of Disease) Act 1984',         year: 1984, featured: true,  blurb: "The 'COVID lockdown vehicle' — most COVID-era restrictions were SIs under this 1984 Act." },
  { id: 'tjHKfkMm', name: 'Coronavirus Act 2020',                                 year: 2020, featured: true,  blurb: 'Emergency Act passed in March 2020. Smaller SI tail than the Public Health Act.' },
  { id: 'Ma8CbL0w', name: 'European Union (Withdrawal) Act 2018',                 year: 2018, featured: true,  blurb: 'The Brexit retained-EU-law vehicle. Massive SI flood Oct 2018 – Mar 2019.' },
  { id: 'blBt1z4K', name: 'European Union (Withdrawal Agreement) Act 2020',       year: 2020, featured: true,  blurb: 'Implements the UK–EU Withdrawal Agreement; smaller, focused SI run.' },
  { id: 'oD0HHKb3', name: 'Retained EU Law (Revocation and Reform) Act 2023',     year: 2023, featured: true,  blurb: "The 2023 'sunset and revoke' Act. Late-2023 SI surge." },
  { id: 'lyPkqhmP', name: 'Environment Act 2021',                                 year: 2021, featured: false, blurb: 'Post-EU domestic environmental framework.' },
  { id: '3jocakSs', name: 'Sanctions and Anti-Money Laundering Act 2018',         year: 2018, featured: false, blurb: 'Powers most current UK sanctions SIs (Russia, Belarus, etc.).' },
  { id: '3x7OAyEr', name: 'Finance Act 2021',                                     year: 2021, featured: false, blurb: 'Finance Acts produce SIs throughout the following tax year.' },
  { id: 'ucuEiEeE', name: 'United Kingdom Internal Market Act 2020',              year: 2020, featured: false, blurb: 'Internal trade post-Brexit.' },
  { id: 'Sus0VwFW', name: 'Companies Act 2006',                                   year: 2006, featured: false, blurb: 'Backbone of UK company law; steady SI cadence.' },
  { id: 'zR0cqxW6', name: 'Environmental Protection Act 1990',                    year: 1990, featured: false, blurb: 'Older environmental framework (some SIs only post-2017 visible).' },
  { id: 'SmQ2LS8f', name: 'Equality Act 2010',                                    year: 2010, featured: false, blurb: 'Equality and anti-discrimination.' },
  { id: 'SMARVqFK', name: 'Building Safety Act 2022',                             year: 2022, featured: false, blurb: 'Post-Grenfell building-safety regime.' },
  { id: '6dOHrNkW', name: 'Trade Act 2021',                                       year: 2021, featured: false, blurb: 'Continuity trade agreements after Brexit.' },
  { id: 'zcNyN794', name: 'Levelling-up and Regeneration Act 2023',               year: 2023, featured: false, blurb: 'Planning reform; SIs landing through 2024–2025.' },
];

// Minimal proxy ctx that fetches directly with no caching — fine for a
// one-shot build. Real demos use the proxy's cache, but this script is
// invoked rarely.
const fetchCtx = {
  throttleHost: () => Promise.resolve(),
  getCached: async (key, url) => {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const buf = Buffer.from(await r.arrayBuffer());
    return { entry: { status: r.status, body: buf, headers: { 'content-type': r.headers.get('content-type') || '' } } };
  },
};

async function buildOne(actId) {
  const out = {};
  for (const bucket of ['week', 'month']) {
    process.stderr.write(`  ${actId} ${bucket}…`);
    const t0 = Date.now();
    const agg = await aggregateByAct(fetchCtx, actId, bucket);
    out[bucket] = {
      count:   agg.count,
      dateMin: agg.dateMin,
      dateMax: agg.dateMax,
      buckets: agg.buckets,
    };
    process.stderr.write(` ${agg.count} SIs / ${agg.buckets.length} buckets  (${Date.now() - t0}ms)\n`);
  }
  return out;
}

async function main() {
  const records = [];
  for (const a of ACTS) {
    process.stderr.write(`Fetching ${a.name}…\n`);
    const data = await buildOne(a.id);
    records.push({ ...a, ...data });
  }
  const payload = {
    fetchedAt: new Date().toISOString().slice(0, 10),
    source:    'https://statutoryinstruments-api.parliament.uk/api/v2',
    licence:   'Open Parliament Licence v3.0 — https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/',
    acts:      records,
  };
  // Currently the artifact is hand-maintained alongside web/index.html.
  // Print the JSON so the operator can paste it into the <script
  // id="data"> block. (The web/ version uses /api/agg/ at runtime; the
  // artifact bakes this snapshot in instead.)
  process.stderr.write(`\nFetched ${records.length} acts. Embedded payload follows on stdout — paste it between the <script id="data"> tags in artifact/index.html and update fetchedAt.\n\n`);
  process.stdout.write(JSON.stringify(payload));
}

main().catch((e) => { process.stderr.write(`error: ${e.stack || e}\n`); process.exit(1); });
