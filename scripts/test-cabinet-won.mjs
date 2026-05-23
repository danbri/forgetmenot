#!/usr/bin/env node
// scripts/test-cabinet-won.mjs
//
// Cross-source SPARQL test: does the current UK cabinet — as
// reported by GOV.UK — actually contain Commons MPs who won
// their seats at GE 2024?
//
// Touches three local corpora over one local SPARQL endpoint
// PLUS the live public Parliament endpoint at api.parliament.uk/sparql:
//
//   1. govuk-orgchart/extractors/factoids/all.nq
//        — current cabinet roles via fm:CurrentOfficeHolder +
//          fm:currentRoleTitle starting with "Secretary of State" /
//          a small set of named senior posts.
//   2. identity-graph/identity.nq
//        — bridges govuk people-page IRIs to Members API URIs
//          via owl:sameAs, and the latter carry parl:memberId.
//   3. psephology/all.nq.gz
//        — every winning candidacy as pe:WinningCandidacyResult
//          on a pe:Candidacy linked to a pe:Election dated 2024-07-04.
//
// The bridge: govuk slug → owl:sameAs → Members API URI →
//             parl:memberId → psephology Person → Candidacy →
//             Election (2024-07-04).
//
// And separately, the live api.parliament.uk/sparql endpoint is
// queried for the same MNIS ids' current
// parl:memberHasParliamentaryIncumbency to cross-check that DDP
// agrees they are sitting MPs.
//
// Run:
//   npm run psephology:up                         # one-time
//   npm run sparql:serve -- third_party/data/psephology/all.nq.gz \
//                           third_party/identity-graph/identity.nq \
//                           third_party/govuk/html/orgcharts/extractors/factoids/all.nq
//   # in another shell, once "Application startup complete" appears:
//   node scripts/test-cabinet-won.mjs
//
// The script doesn't spawn the local endpoint itself — it
// assumes one is up on http://127.0.0.1:8765/, since loading
// half a million triples into rdflib-endpoint takes 40-60 s
// and you typically want it warm across multiple queries.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const exec = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parl = resolve(repoRoot, 'bin/parl.mjs');

const LOCAL = 'http://127.0.0.1:8765/';

// ---------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------
async function sparqlQuery(endpoint, query) {
  const body = new URLSearchParams({ query }).toString();
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
    },
    body,
  });
  if (!r.ok) throw new Error(`${endpoint}: HTTP ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------
// 1. Local: the cabinet-grade roles + three-graph join
// ---------------------------------------------------------------
async function checkLocal() {
  const q = `
    PREFIX pe:   <http://parliament.uk/ontologies/election/>
    PREFIX parl: <https://id.parliament.uk/schema/>
    PREFIX fm:   <https://forgetmenot.local/vocab#>
    PREFIX owl:  <http://www.w3.org/2002/07/owl#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
    SELECT ?slug ?title ?mnis ?cgName ?vc ?vs ?won WHERE {
      ?gp a fm:CurrentOfficeHolder ;
          fm:currentRoleTitle ?title .
      FILTER(STRSTARTS(STR(?title), "Secretary of State") ||
             REGEX(STR(?title),
               "^(Chancellor of the Exchequer|Prime Minister|Lord Privy Seal|Lord President of the Council|Leader of the House|Paymaster General|Minister Without Portfolio|Chief Secretary to the Treasury|Attorney General|Lord Chancellor)"))
      BIND(REPLACE(STR(?gp), "^.*/", "") AS ?slug)
      OPTIONAL {
        ?api owl:sameAs ?gp ; parl:memberId ?mnisStr .
        BIND(xsd:integer(?mnisStr) AS ?mnis)
        OPTIONAL {
          ?p parl:memberId ?mnis .
          ?c pe:isOfPerson ?p ; pe:inElection ?e .
          ?r pe:resultOfCandidacy ?c ; pe:voteCount ?vc .
          OPTIONAL { ?r pe:voteShare ?vs }
          ?e pe:forConstituencyGroup ?cg ;
             pe:electionPollingOn "2024-07-04"^^xsd:date .
          ?cg rdfs:label ?cgName .
          BIND(EXISTS { ?r a pe:WinningCandidacyResult } AS ?won)
        }
      }
    } ORDER BY ?title`;
  const j = await sparqlQuery(LOCAL, q);
  return j.results.bindings.map(b => ({
    slug:  b.slug?.value || '',
    title: b.title?.value || '',
    mnis:  b.mnis?.value ? Number(b.mnis.value) : null,
    cgName: b.cgName?.value || '',
    voteCount: b.vc?.value ? Number(b.vc.value) : null,
    voteShare: b.vs?.value ? Number(b.vs.value) : null,
    won:   b.won?.value === 'true',
  }));
}

// ---------------------------------------------------------------
// 2. Live DDP: parl:memberHasParliamentaryIncumbency without endDate
// ---------------------------------------------------------------
async function checkDDP(mnisIds) {
  const values = mnisIds.map(n => `(${n})`).join(' ');
  const q = `
    PREFIX parl: <https://id.parliament.uk/schema/>
    SELECT ?mnis ?given ?family ?house ?seatName WHERE {
      VALUES (?mnis) { ${values} }
      ?ddp parl:memberMnisId ?mnisStr .
      FILTER(xsd:integer(?mnisStr) = ?mnis)
      OPTIONAL { ?ddp parl:personGivenName ?given }
      OPTIONAL { ?ddp parl:personFamilyName ?family }
      OPTIONAL {
        ?ddp parl:memberHasParliamentaryIncumbency ?inc .
        FILTER NOT EXISTS { ?inc parl:parliamentaryIncumbencyEndDate ?ed }
        OPTIONAL {
          ?inc parl:seatIncumbencyHasHouseSeat ?seat .
          ?seat parl:houseSeatHasHouse ?h .
          ?h parl:houseName ?house .
          OPTIONAL { ?seat parl:houseSeatHasConstituencyGroup ?cg .
                     ?cg parl:constituencyGroupName ?seatName . }
        }
        OPTIONAL { ?inc parl:houseIncumbencyHasHouse ?h2 . ?h2 parl:houseName ?house . }
      }
    }`;
  // The CLI takes care of HTTP details + the inevitable retry on 500.
  const { stdout } = await exec('node', [parl, 'sparql', 'query', q],
    { maxBuffer: 64 * 1024 * 1024 });
  const rows = JSON.parse(stdout).results.bindings;
  // DDP can return multiple incumbency rows per person. Collapse to
  // best-known (prefer Commons).
  const best = new Map();
  for (const b of rows) {
    const mnis = Number(b.mnis.value);
    const cur  = best.get(mnis) || { mnis };
    cur.given  ||= b.given?.value;
    cur.family ||= b.family?.value;
    if (!cur.house || b.house?.value === 'House of Commons')
      cur.house = b.house?.value || cur.house;
    if (b.seatName?.value) cur.seatName = b.seatName.value;
    best.set(mnis, cur);
  }
  return [...best.values()];
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
console.log('1/2  Local merged endpoint @', LOCAL);
let local;
try {
  local = await checkLocal();
} catch (e) {
  console.error(`Local endpoint not reachable: ${e.message}`);
  console.error('Start it with:');
  console.error('  npm run sparql:serve -- \\');
  console.error('    third_party/data/psephology/all.nq.gz \\');
  console.error('    third_party/identity-graph/identity.nq \\');
  console.error('    third_party/govuk/html/orgcharts/extractors/factoids/all.nq');
  process.exit(2);
}

console.log(`     ${local.length} cabinet-grade office holders found.`);
console.log();

// Render the table
const colW = { slug: 28, mnis: 6, cg: 32, vc: 7, vs: 7, won: 4 };
const fmt = (s, w, pad = 'left') => {
  s = String(s);
  if (s.length > w) s = s.slice(0, w - 1) + '…';
  return pad === 'right' ? s.padStart(w) : s.padEnd(w);
};
const head = `${fmt('slug', colW.slug)} ${fmt('mnis', colW.mnis)} ` +
  `${fmt('constituency (psephology)', colW.cg)} ${fmt('votes', colW.vc, 'right')} ` +
  `${fmt('share', colW.vs, 'right')} ${fmt('won', colW.won)} role`;
console.log(head);
console.log('-'.repeat(head.length + 40));
for (const r of local) {
  const won  = r.won ? '✓' : (r.mnis ? '·' : '—');
  const vs   = r.voteShare ? `${(r.voteShare * 100).toFixed(1)}%` : '—';
  console.log(
    `${fmt(r.slug, colW.slug)} ${fmt(r.mnis ?? '—', colW.mnis)} ` +
    `${fmt(r.cgName || '—', colW.cg)} ${fmt(r.voteCount ?? '—', colW.vc, 'right')} ` +
    `${fmt(vs, colW.vs, 'right')} ${fmt(won, colW.won)} ${r.title}`
  );
}
const won = local.filter(r => r.won);
const missingBridge = local.filter(r => !r.mnis);
const peers = local.filter(r => r.mnis && !r.won);
console.log();
console.log(`     LOCAL JOIN: ${won.length} won ✓  ·  ${peers.length} peer-or-no-result  ·  ${missingBridge.length} no identity-graph bridge`);

// ----- DDP cross-check -----
const mnisIds = [...new Set(local.filter(r => r.mnis).map(r => r.mnis))].sort((a,b)=>a-b);
console.log();
console.log('2/2  Live DDP @ api.parliament.uk/sparql for the', mnisIds.length, 'bridged MNIS ids:');
const ddp = await checkDDP(mnisIds);
const inCommons = ddp.filter(r => r.house === 'House of Commons');
const inLords   = ddp.filter(r => r.house === 'House of Lords');
const noCurrent = ddp.filter(r => !r.house);
console.log();
console.log(`     DDP sees ${inCommons.length} sitting in Commons, ${inLords.length} in Lords, ${noCurrent.length} with no current incumbency`);
if (noCurrent.length) {
  console.log();
  console.log('     DDP-currency gap (members psephology says won in 2024 but DDP has no');
  console.log('     "current" incumbency row for):');
  for (const r of noCurrent) {
    const cab = local.find(L => L.mnis === r.mnis);
    console.log(`       MNIS ${r.mnis}  ${r.given || '?'} ${r.family || '?'}  (${cab?.title || '?'})`);
  }
}

// Exit code: 0 if every confirmed Commons cabinet member was found in psephology,
// 1 if there are unexplained gaps.
const peersExpected = new Set(['baroness-smith-of-basildon', 'richard-hermer']);
const unexplained = local.filter(r =>
  !r.won && !peersExpected.has(r.slug) && r.mnis
);
if (unexplained.length) {
  console.error();
  console.error('UNEXPLAINED gaps (mnis bridge present but no winning candidacy in psephology):');
  for (const r of unexplained) console.error(`  ${r.slug} (mnis ${r.mnis}) — ${r.title}`);
  process.exit(1);
}
console.log();
console.log('PASS — every Commons cabinet member with a working identity-graph bridge');
console.log('       has a pe:WinningCandidacyResult at GE 2024-07-04 in psephology.');
