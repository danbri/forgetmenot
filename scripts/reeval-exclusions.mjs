#!/usr/bin/env node
// Re-evaluate the `excluded-personal` decisions in an existing site
// crawl using the CURRENT excludeReason() implementation. Reports:
//   - rule-by-rule: how many of the previously-excluded URLs would
//     still be excluded today, and how many would now be admitted
//   - sample of admitted URLs per rule
//
// This is a non-destructive read; it does not modify any data on
// disk. Useful for documenting drift between the snapshot and the
// current code base.
//
// Usage: node scripts/reeval-exclusions.mjs [<sites-dir>]

import { readdirSync, readFileSync } from 'node:fs';
import { excludeReason } from '../lib/facilities/sites.mjs';

const dir = process.argv[2] || 'third_party/data/sites';
const ids = readdirSync(dir).filter((f) => /^\d+$/.test(f));

const stats = {};       // rule -> { snapshot_excluded, still_excluded, now_admitted, sample_admitted: [] }

for (const id of ids) {
  let m;
  try { m = JSON.parse(readFileSync(`${dir}/${id}/manifest.json`, 'utf8')); }
  catch { continue; }
  for (const d of (m.decisions || [])) {
    if (d.action !== 'excluded-personal') continue;
    const rule = d.rule || '?';
    stats[rule] ||= { snapshot_excluded: 0, still_excluded: 0, now_admitted: 0, sample_admitted: [] };
    stats[rule].snapshot_excluded++;
    const re = excludeReason(d.url);
    if (re) stats[rule].still_excluded++;
    else {
      stats[rule].now_admitted++;
      if (stats[rule].sample_admitted.length < 4) {
        stats[rule].sample_admitted.push({ id: m.member?.id, url: d.url });
      }
    }
  }
}

const ordered = Object.entries(stats)
  .map(([rule, v]) => ({ rule, ...v }))
  .sort((a, b) => b.snapshot_excluded - a.snapshot_excluded);

const totals = ordered.reduce(
  (a, x) => ({ snapshot: a.snapshot + x.snapshot_excluded,
               still: a.still + x.still_excluded,
               admitted: a.admitted + x.now_admitted }),
  { snapshot: 0, still: 0, admitted: 0 },
);

const out = {
  generated_at: new Date().toISOString(),
  source_dir: dir,
  totals,
  per_rule: ordered,
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
