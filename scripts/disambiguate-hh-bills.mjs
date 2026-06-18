#!/usr/bin/env node
// Disambiguate Historic Hansard bill pages. Each /bills/{slug} page conflates
// every same-named bill across history (one `companies-bill` for 1860 AND
// 1989). We split a bill's dated stage references into INSTANCES by clustering
// on time gaps: a bill's passage rarely spans more than a couple of years, so a
// multi-year gap between stages marks a different bill of the same name.
//
// In:  third_party/data/historic-hansard-bills/bills.json
// Out: bills-disambiguated.json  (instances, each with date span + stages)
//      bills-by-session.json     (instances grouped by start-year — the
//                                 "which bills did this session touch" view)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = `${ROOT}/third_party/data/historic-hansard-bills`;
const GAP_YEARS = 4;   // > this gap between consecutive stages => a new instance
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ord = (d) => { const [y, m, day] = d.split('-'); return Number(y) * 372 + (MON[m] || 0) * 31 + Number(day); }; // sortable day-ish
const yr = (d) => Number(d.split('-')[0]);

const src = JSON.parse(readFileSync(`${DIR}/bills.json`, 'utf8')).bills;
const instances = [];
for (const rec of Object.values(src)) {
  const stages = rec.stages.filter((s) => /^\d{4}-/.test(s.date)).sort((a, b) => ord(a.date) - ord(b.date));
  if (!stages.length) { instances.push({ slug: rec.slug, title: rec.title, instance: 1, stageCount: 0, stages: [] }); continue; }
  let cluster = [stages[0]];
  let n = 0;
  const flush = () => {
    n++;
    instances.push({
      slug: rec.slug, title: rec.title, instance: n,
      yearStart: yr(cluster[0].date), yearEnd: yr(cluster[cluster.length - 1].date),
      dateStart: cluster[0].date, dateEnd: cluster[cluster.length - 1].date,
      stageCount: cluster.length, houses: [...new Set(cluster.map((s) => s.house))], stages: cluster,
    });
  };
  for (let i = 1; i < stages.length; i++) {
    if (yr(stages[i].date) - yr(cluster[cluster.length - 1].date) > GAP_YEARS) { flush(); cluster = []; }
    cluster.push(stages[i]);
  }
  flush();
}

const multi = instances.filter((i) => i.instance > 1 || instances.some((j) => j.slug === i.slug && j.instance > 1));
writeFileSync(`${DIR}/bills-disambiguated.json`, JSON.stringify({
  generated: new Date().toISOString(), gapYears: GAP_YEARS,
  note: 'Each Historic Hansard bill page split into time-clustered instances (gap > 4yr = distinct bill of the same name). yearStart..yearEnd approximates the session(s) the bill ran in.',
  counts: { sourcePages: Object.keys(src).length, instances: instances.length,
            pagesThatSplit: new Set(instances.filter((i) => i.instance > 1).map((i) => i.slug)).size },
  instances,
}, null, 1));

// "Which bills did each session/year touch" — group instances by start year.
const bySession = {};
for (const i of instances) {
  if (!i.yearStart) continue;
  (bySession[i.yearStart] ||= []).push({ slug: i.slug, title: i.title, yearStart: i.yearStart, yearEnd: i.yearEnd, stageCount: i.stageCount });
}
writeFileSync(`${DIR}/bills-by-session.json`, JSON.stringify({
  generated: new Date().toISOString(),
  note: 'Bill instances grouped by start year — a first "session -> bills it touched" index (year as session proxy).',
  years: Object.keys(bySession).length, bySession,
}, null, 1));

console.error(`Pages: ${Object.keys(src).length} -> instances: ${instances.length} (${new Set(instances.filter((i) => i.instance > 1).map((i) => i.slug)).size} pages split into multiple bills)`);
