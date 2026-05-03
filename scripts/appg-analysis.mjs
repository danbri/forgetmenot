#!/usr/bin/env node
// scripts/appg-analysis.mjs
//
// Read `third_party/data/appg/resolved.json` (output of
// `parl appg resolve`) and compute:
//
//   * Headline counts (groups, officers, matched, ambiguous, missed)
//   * Subject Group vs Country Group split
//   * Officers-per-group distribution
//   * APPGs-per-MP distribution (only resolved officers)
//   * Top MPs by number of APPG officerships
//   * Party composition of officer roles overall
//   * Per-APPG party diversity (count of distinct parties / Shannon entropy)
//   * Most cross-party APPGs
//   * Bipartite → MP↔MP projection: top co-officer pairs by
//     number of shared APPGs (the "MPs who worked together"
//     signal the original prompt asked for)
//
// Output: `third_party/data/appg/analysis.json` and prints summary
// to stdout. Pure data — the PDF report consumes this file.
//
// This is intentionally a separate step from the PDF rendering so
// the analysis can be inspected on its own and re-rendered.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inPath  = resolve(process.argv[2] || 'third_party/data/appg/resolved.json');
const outPath = resolve(process.argv[3] || 'third_party/data/appg/analysis.json');

const data = JSON.parse(readFileSync(inPath, 'utf8'));
const groups = data.groups || [];

// Helper: classify Subject vs Country. The Register's literal
// category labels are "Subject Group" and "Country, Area or Region
// Group" — match the Country/Area/Region variant by token.
const isCountry = (g) => /\b(country|area|region)\b/i.test(g.category || '');

// ---------- Aggregates ----------
const totals = {
  groups: groups.length,
  subject: groups.filter((g) => !isCountry(g)).length,
  country: groups.filter(isCountry).length,
  officers: 0,
  matched: 0, ambiguous: 0, missed: 0, errors: 0,
};

// MP-id → { id, name, party, partyAbbr, house, appgs: [{slug, title, role, party_at_appg}] }
const mpIndex = new Map();
// Per-group party composition.
const groupPartyDiversity = [];
// Officer role distribution by party.
const partyRoles = {};   // party -> { Chair: n, 'Co-Chair': n, ... }
// Officer count distribution.
const officerCount = [];
// Pair counts (sorted-id pair) for MP↔MP projection.
const pairCounts = new Map();

for (const g of groups) {
  const officers = g.officers || [];
  totals.officers += officers.length;
  officerCount.push({ slug: g.slug, title: g.title, n: officers.length, country: isCountry(g) });

  // Party diversity for this group: count parties of MATCHED officers,
  // because the resolved party (from Members API) is the canonical one.
  const partiesInGroup = [];
  const matchedIds = [];
  for (const o of officers) {
    const status = o.resolution?.status;
    totals[status] = (totals[status] || 0) + 1;
    if (status === 'matched') {
      const m = o.resolution.member;
      if (!mpIndex.has(m.id)) {
        mpIndex.set(m.id, { id: m.id, name: m.name, party: m.party,
          partyAbbr: m.partyAbbr, house: m.house, appgs: [] });
      }
      mpIndex.get(m.id).appgs.push({
        slug: g.slug, title: g.title, role: o.role,
        category: isCountry(g) ? 'Country' : 'Subject',
      });
      partiesInGroup.push(m.party || m.partyAbbr || 'Unknown');
      matchedIds.push(m.id);

      const p = m.party || 'Unknown';
      partyRoles[p] = partyRoles[p] || {};
      partyRoles[p][o.role] = (partyRoles[p][o.role] || 0) + 1;
    }
  }

  // Diversity metrics for this group.
  const counts = {};
  for (const p of partiesInGroup) counts[p] = (counts[p] || 0) + 1;
  const total = partiesInGroup.length;
  // Shannon entropy in nats; 0 = single-party, ln(n_parties) max.
  let H = 0;
  for (const c of Object.values(counts)) {
    const p = c / total;
    H += p > 0 ? -p * Math.log(p) : 0;
  }
  groupPartyDiversity.push({
    slug: g.slug, title: g.title, country: isCountry(g),
    n_parties: Object.keys(counts).length,
    n_officers_resolved: total,
    party_counts: counts, entropy_nats: H,
  });

  // MP↔MP pair projection: every unordered pair of resolved officers
  // in the same APPG gets +1.
  matchedIds.sort((a, b) => a - b);
  for (let i = 0; i < matchedIds.length; i++) {
    for (let j = i + 1; j < matchedIds.length; j++) {
      const key = `${matchedIds[i]}|${matchedIds[j]}`;
      const e = pairCounts.get(key) || { a: matchedIds[i], b: matchedIds[j], shared: 0, groups: [] };
      e.shared++;
      e.groups.push(g.slug);
      pairCounts.set(key, e);
    }
  }
}

// MP-rollups
const mps = [...mpIndex.values()].map((m) => ({
  ...m, n_appgs: m.appgs.length,
}));
mps.sort((a, b) => b.n_appgs - a.n_appgs);

// APPGs-per-MP histogram (1, 2, 3, …).
const histAppgsPerMp = {};
for (const m of mps) histAppgsPerMp[m.n_appgs] = (histAppgsPerMp[m.n_appgs] || 0) + 1;

// Officers-per-group histogram.
const histOfficersPerGroup = {};
for (const g of officerCount) histOfficersPerGroup[g.n] = (histOfficersPerGroup[g.n] || 0) + 1;

// Top co-officer pairs. We export up to 1000 so the report can
// draw a network diagram on the top-N node subgraph (an edge
// between two high-degree MPs may have shared=1 and would be
// missed by a top-50 cap).
const topPairs = [...pairCounts.values()]
  .sort((a, b) => b.shared - a.shared)
  .slice(0, 1000)
  .map((e) => ({
    ...e,
    a_name: mpIndex.get(e.a)?.name || `#${e.a}`,
    b_name: mpIndex.get(e.b)?.name || `#${e.b}`,
    a_party: mpIndex.get(e.a)?.partyAbbr || mpIndex.get(e.a)?.party || '?',
    b_party: mpIndex.get(e.b)?.partyAbbr || mpIndex.get(e.b)?.party || '?',
  }));

// Party-pair co-officership matrix (how often parties X and Y share
// a bench, summed over all APPGs). Only count unordered pairs of
// matched officers within each group.
const partyPair = new Map();   // 'A|B' -> count, A < B
for (const g of groups) {
  const ms = (g.officers || [])
    .filter((o) => o.resolution?.status === 'matched')
    .map((o) => o.resolution.member.party || 'Unknown');
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const [a, b] = [ms[i], ms[j]].sort();
      const k = `${a}|${b}`;
      partyPair.set(k, (partyPair.get(k) || 0) + 1);
    }
  }
}
const partyPairList = [...partyPair.entries()]
  .map(([k, n]) => { const [a, b] = k.split('|'); return { a, b, n }; })
  .sort((a, b) => b.n - a.n);

// Most cross-party APPGs (high entropy + ≥3 distinct parties + ≥3 resolved officers).
const mostCrossParty = groupPartyDiversity
  .filter((g) => g.n_officers_resolved >= 3 && g.n_parties >= 3)
  .sort((a, b) => b.entropy_nats - a.entropy_nats || b.n_parties - a.n_parties)
  .slice(0, 25);

// Single-party APPGs (everyone the same).
const singleParty = groupPartyDiversity
  .filter((g) => g.n_officers_resolved >= 2 && g.n_parties === 1);

const out = {
  source: inPath,
  generatedAt: new Date().toISOString(),
  edition: data.edition,
  totals,
  party_overall:
    Object.fromEntries(
      Object.entries(partyRoles)
        .map(([p, roles]) => [p, { total: Object.values(roles).reduce((a, b) => a + b, 0), roles }])
        .sort((a, b) => b[1].total - a[1].total),
    ),
  hist_appgs_per_mp: histAppgsPerMp,
  hist_officers_per_group: histOfficersPerGroup,
  top_mps_by_appg_count: mps.slice(0, 30),
  party_pair_top: partyPairList.slice(0, 30),
  most_cross_party_appgs: mostCrossParty,
  single_party_appgs: singleParty.slice(0, 25),
  top_co_officer_pairs: topPairs,
  total_unique_mps_resolved: mps.length,
  total_pairs: pairCounts.size,
};

writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

// One-liner summary to stdout.
console.log(JSON.stringify({
  out: outPath,
  groups: totals.groups,
  officers: totals.officers,
  matched: totals.matched, ambiguous: totals.ambiguous, missed: totals.no_candidates || 0,
  unique_mps: mps.length,
  pairs: pairCounts.size,
  top_pair: topPairs[0],
}, null, 2));
