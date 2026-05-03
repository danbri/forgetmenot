#!/usr/bin/env node
// scripts/build-waf-registry.mjs
//
// Walk every per-site manifest under third_party/data/sites/ and
// emit a top-level `_waf-registry.json` listing sites that the
// crawler classified as WAF-blocked, plus a "needs_classification"
// list of failures the current crawl couldn't classify (typically
// older snapshots that pre-date the WAF detector — the operator
// can re-crawl them with --refetch to populate).
//
// Output format (top-level _waf-registry.json):
//   {
//     "fetchedAt": "...",
//     "by_provider": {
//       "cloudflare": [{id, name, party, homepage, evidence}, ...],
//       "akamai": [...], "aws-waf": [...], ...
//     },
//     "needs_classification": [
//       { id, name, party, homepage, status, message }
//     ],
//     "total_blocked": N,
//     "total_unclassified": M
//   }

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

const sitesDir = pathResolve(process.argv[2] || 'third_party/data/sites');

const byProvider = {};
const needsClassification = [];
let totalBlocked = 0;

for (const entry of readdirSync(sitesDir)) {
  if (!/^\d+$/.test(entry)) continue;
  let m;
  try { m = JSON.parse(readFileSync(`${sitesDir}/${entry}/manifest.json`, 'utf8')); }
  catch { continue; }

  // New-format manifests carry waf_block when applicable.
  if (m.waf_block && m.waf_block.provider) {
    const p = m.waf_block.provider;
    (byProvider[p] = byProvider[p] || []).push({
      id: m.member?.id, name: m.member?.name, party: m.member?.partyAbbr || m.member?.party,
      homepage: m.homepageUrl, evidence: m.waf_block.evidence, status: m.waf_block.status,
    });
    totalBlocked++;
    continue;
  }

  // Old manifests: no waf_block field. If the homepage failed with
  // 4xx / 5xx, list it as needing classification (a refetch with
  // current code will populate waf_block).
  if (!m.ok && m.homepage_error?.status) {
    needsClassification.push({
      id: m.member?.id, name: m.member?.name, party: m.member?.partyAbbr || m.member?.party,
      homepage: m.homepageUrl,
      status: m.homepage_error.status, message: m.homepage_error.message,
    });
  }
}

const out = {
  fetchedAt: new Date().toISOString(),
  source_dir: sitesDir,
  total_blocked: totalBlocked,
  total_unclassified: needsClassification.length,
  by_provider: byProvider,
  needs_classification: needsClassification,
};
const outPath = `${sitesDir}/_waf-registry.json`;
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  out: outPath,
  total_blocked: totalBlocked,
  providers: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, v.length])),
  needs_classification: needsClassification.length,
}, null, 2));
