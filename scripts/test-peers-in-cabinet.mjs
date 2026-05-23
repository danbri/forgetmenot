#!/usr/bin/env node
// scripts/test-peers-in-cabinet.mjs
//
// Two questions over the local SPARQL endpoint:
//   1. Who are the peers in the CURRENT UK cabinet?
//   2. Who was the most recent peer in a DEPARTMENTAL cabinet role
//      (Secretary of State / Chancellor / etc., excluding the
//      routinely-peer Lords-leadership posts)?
//
// Both run against the merged govuk-orgchart + identity-graph
// local endpoint. (Psephology not needed — these questions are
// about appointments, not elections.)
//
// Pre:
//   npm run sparql:serve -- \
//     third_party/govuk/html/orgcharts/extractors/factoids/all.nq \
//     third_party/identity-graph/identity.nq
// then in another shell:
//   node scripts/test-peers-in-cabinet.mjs

const LOCAL = 'http://127.0.0.1:8765/';

async function sparqlQuery(query) {
  const r = await fetch(LOCAL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
    },
    body: new URLSearchParams({ query }).toString(),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Cabinet-grade role-title test, applied as a SPARQL filter clause
// so both queries match the same definition of "cabinet".
const CABINET_ROLE_FILTER = `
  FILTER(STRSTARTS(STR(?title), "Secretary of State") ||
         REGEX(STR(?title),
           "^(Chancellor of the Exchequer|Prime Minister|Lord Privy Seal|Lord President of the Council|Leader of the House|Paymaster General|Minister Without Portfolio|Chief Secretary to the Treasury|Attorney General|Lord Chancellor)"))`;

// Peerage detection: "Lord ", "Baroness ", etc. as substrings of
// schema:name. Match on the NAME, not the URL slug — David Cameron
// kept slug `david-cameron` after becoming Lord Cameron.
const PEER_NAME_FILTER = `
  FILTER(CONTAINS(STR(?personName), " Lord ") ||
         CONTAINS(STR(?personName), " Baron ") ||
         CONTAINS(STR(?personName), " Baroness ") ||
         CONTAINS(STR(?personName), " Viscount ") ||
         CONTAINS(STR(?personName), " Earl "))`;

// --- Q1: current peers in cabinet ---
const Q1 = `
  PREFIX fm:     <https://forgetmenot.local/vocab#>
  PREFIX schema: <http://schema.org/>
  SELECT ?personName ?title WHERE {
    ?gp a fm:CurrentOfficeHolder ;
        fm:currentRoleTitle ?title ;
        schema:name ?personName .
    ${PEER_NAME_FILTER}
    ${CABINET_ROLE_FILTER}
  } ORDER BY ?title`;

// --- Q2: peer tenures in DEPARTMENTAL cabinet roles, recent first ---
//
// "Departmental" = a real Whitehall department, so we exclude the
// always-peer roles (Lords leadership, Lord Privy Seal, Lord
// President), and routinely-junior ones (Minister of State,
// Parliamentary Under-Secretary). We also de-dup against the
// year-only-typed RoleTenure rows by keeping only xsd:date dates.
const Q2 = `
  PREFIX fm:     <https://forgetmenot.local/vocab#>
  PREFIX schema: <http://schema.org/>
  PREFIX xsd:    <http://www.w3.org/2001/XMLSchema#>
  SELECT ?personName ?roleTitle ?start ?end WHERE {
    ?t a fm:RoleTenure ;
       fm:role ?role ;
       fm:holder ?holder .
    OPTIONAL { ?t fm:tenureStart ?start }
    OPTIONAL { ?t fm:tenureEnd ?end }
    ?role   schema:name ?roleTitle .
    ?holder schema:name ?personName .
    ${PEER_NAME_FILTER.replaceAll('?personName', '?personName')}
    FILTER(CONTAINS(STR(?roleTitle), "Foreign") ||
           CONTAINS(STR(?roleTitle), "Home Secretary") ||
           CONTAINS(STR(?roleTitle), "Chancellor of the Exchequer") ||
           CONTAINS(STR(?roleTitle), "Defence") ||
           CONTAINS(STR(?roleTitle), "Justice") ||
           CONTAINS(STR(?roleTitle), "Education") ||
           CONTAINS(STR(?roleTitle), "Health") ||
           CONTAINS(STR(?roleTitle), "Business") ||
           CONTAINS(STR(?roleTitle), "Trade") ||
           CONTAINS(STR(?roleTitle), "Transport") ||
           CONTAINS(STR(?roleTitle), "Energy") ||
           CONTAINS(STR(?roleTitle), "Environment") ||
           CONTAINS(STR(?roleTitle), "Work and Pensions") ||
           CONTAINS(STR(?roleTitle), "Communities") ||
           CONTAINS(STR(?roleTitle), "Housing") ||
           CONTAINS(STR(?roleTitle), "Northern Ireland") ||
           CONTAINS(STR(?roleTitle), "Scotland") ||
           CONTAINS(STR(?roleTitle), "Wales") ||
           CONTAINS(STR(?roleTitle), "Culture, Media") ||
           CONTAINS(STR(?roleTitle), "Science"))
    # Exclude routinely-peer or routinely-junior posts
    FILTER(!CONTAINS(STR(?roleTitle), "Lord Privy Seal"))
    FILTER(!CONTAINS(STR(?roleTitle), "Leader"))
    FILTER(!CONTAINS(STR(?roleTitle), "Whip"))
    FILTER(!CONTAINS(STR(?roleTitle), "Minister of State"))
    FILTER(!CONTAINS(STR(?roleTitle), "Parliamentary Under-Secretary"))
    FILTER(!CONTAINS(STR(?roleTitle), "Advocate General"))
    FILTER(!CONTAINS(STR(?roleTitle), "Spokesperson"))
    # De-dup against the year-only-typed rows
    FILTER(!BOUND(?start) || DATATYPE(?start) = xsd:date)
  } ORDER BY DESC(?end) DESC(?start)`;

// Known data-quality artefact this script is expected to surface
// without it being a real positive. Documented in upstream-bugs.md.
const KNOWN_FALSE_POSITIVES = new Set([
  'The Rt Hon Baroness Nicky Morgan', // peerage 2020; Ed Sec 2014-16
]);

// Categorise a cabinet role for the "what kind of peer-in-cabinet
// is this?" question. The headline-newsworthy case is a peer
// running a Whitehall department (Foreign, Home, Defence, …).
// Lords-leadership posts are structurally peer and not news;
// law-officer posts (Attorney General etc.) are sometimes peer,
// sometimes Commons.
function categoriseRole(title) {
  if (/^Secretary of State|Chancellor of the Exchequer|Chief Secretary to the Treasury|Prime Minister|Deputy Prime Minister|Minister for the Cabinet Office/i.test(title))
    return 'whitehall';        // running a Whitehall department
  if (/Attorney General|Solicitor General|Advocate General|Lord Chancellor/i.test(title))
    return 'law-officer';      // sometimes peer, sometimes Commons
  if (/Leader of the House of Lords|Lord Privy Seal|Lord President of the Council/i.test(title))
    return 'lords-leadership'; // structurally peer
  return 'cross-cutting';      // Paymaster General, Minister Without Portfolio, etc.
}
const CATEGORY_NOTE = {
  'whitehall':        'running a Whitehall department (the headline-newsworthy case)',
  'law-officer':      'law officer (sometimes peer, sometimes Commons)',
  'lords-leadership': 'Lords leadership (always a peer — structural, not unusual)',
  'cross-cutting':    'cross-cutting / non-departmental role',
};

try {
  const r1raw = (await sparqlQuery(Q1)).results.bindings;
  // Tag each Q1 row with its category so the "what kind of peer
  // in cabinet?" reading is explicit, not lumped.
  const r1 = r1raw.map(r => ({
    name: r.personName.value,
    title: r.title.value,
    category: categoriseRole(r.title.value),
  }));
  console.log(`Q1 — peers in the CURRENT cabinet: ${r1.length}`);
  const byCat = {};
  for (const r of r1) (byCat[r.category] = byCat[r.category] || []).push(r);
  for (const cat of ['whitehall', 'law-officer', 'cross-cutting', 'lords-leadership']) {
    if (!byCat[cat]) continue;
    console.log(`  [${cat}] — ${CATEGORY_NOTE[cat]}`);
    for (const r of byCat[cat]) {
      console.log(`    ${r.name.padEnd(36)} ${r.title}`);
    }
  }
  const whitehallCurrent = byCat['whitehall']?.length || 0;
  console.log();
  console.log(`     Currently running a Whitehall department from the Lords: ${whitehallCurrent}.`);
  if (whitehallCurrent === 0) {
    console.log('     (The headline-newsworthy "peer running a department" case.)');
  }

  const r2 = (await sparqlQuery(Q2)).results.bindings;
  console.log();
  console.log(`Q2 — past peer tenures in Whitehall-departmental cabinet roles, recent first:`);
  let real = 0, falsePositives = 0;
  for (const r of r2) {
    const name = r.personName.value;
    const s = r.start?.value || '—';
    const e = r.end?.value   || 'still serving';
    const role = r.roleTitle.value;
    const fp = KNOWN_FALSE_POSITIVES.has(name);
    if (fp) falsePositives++; else real++;
    const flag = fp ? ' [FALSE POSITIVE: peer-name-vs-tenure-date join]' : '';
    console.log(`  ${s}  ${e}  ${name.padEnd(36)} ${role}${flag}`);
  }
  console.log();
  console.log(`     ${real} confirmed peer-secretary tenure(s); ${falsePositives} known false-positive(s) flagged.`);

  if (real === 0) {
    console.error('UNEXPECTED: no confirmed peer-secretary tenure found.');
    process.exit(1);
  }

  // Stable smoke-test: the most recent confirmed one should be Lord Cameron at FCDO.
  const realRows = r2.filter(r => !KNOWN_FALSE_POSITIVES.has(r.personName.value));
  const top = realRows[0];
  if (!/Lord Cameron/.test(top.name || top.personName.value) || !/Foreign/.test(top.roleTitle.value)) {
    console.error(`UNEXPECTED top row: ${top.personName.value} — ${top.roleTitle.value}`);
    process.exit(1);
  }
  console.log();
  console.log('PASS — most recent peer running a Whitehall department, per the data:');
  console.log(`       ${top.personName.value}, ${top.roleTitle.value}, ${top.start?.value} → ${top.end?.value}`);
} catch (e) {
  if (e.message?.includes('fetch failed')) {
    console.error('Local endpoint not reachable. Start it with:');
    console.error('  npm run sparql:serve -- \\');
    console.error('    third_party/govuk/html/orgcharts/extractors/factoids/all.nq \\');
    console.error('    third_party/identity-graph/identity.nq');
    process.exit(2);
  }
  throw e;
}
