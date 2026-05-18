#!/usr/bin/env node
// scripts/build-identity-graph.mjs
//
// Reconcile every UK Parliament member across the identifier
// systems we have evidence for — Members API id, MNIS id, DDP
// person LocalId, scraped site, scraped per-member dump, APPG
// officer roles, GOV.UK person factoid (if any) — and emit a
// single RDF N-Quads file with one named graph per source.
//
// Output:
//   third_party/identity-graph/identity.nq
//   third_party/identity-graph/_index.json
//
// Design notes:
// - Canonical IRI per person is the Members API URL
//   `https://members-api.parliament.uk/api/Members/<id>`. We use
//   that as the subject in every per-person quad.
// - The DDP IRI is asserted with owl:sameAs in the `:ddp` graph.
// - Local-corpus paths are recorded as plain string literals in
//   the `:scraped` graph (a downstream consumer can resolve them
//   relative to the repo).
// - APPG officer roles get a per-officership blank node with
//   role + APPG iri.
// - GOV.UK matches are best-effort by case-insensitive
//   "Given Family" name match against the people factoid corpus.
// - The build is read-only: no remote writes; one SPARQL fetch +
//   filesystem reads.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parl = resolve(repoRoot, 'bin/parl.mjs');
const outDir = resolve(repoRoot, 'third_party/identity-graph');
mkdirSync(outDir, { recursive: true });

// Namespaces
const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
  owl:    'http://www.w3.org/2002/07/owl#',
  schema: 'http://schema.org/',
  dcterms:'http://purl.org/dc/terms/',
  prov:   'http://www.w3.org/ns/prov#',
  void:   'http://rdfs.org/ns/void#',
  xsd:    'http://www.w3.org/2001/XMLSchema#',
  fmn:    'https://forgetmenot.local/identity#',
  parl:   'https://id.parliament.uk/schema/',
};

// Per-source named graphs. Each is described in the `prov` graph
// below with PROV-O / VoID metadata so a downstream consumer can
// see — without leaving the .nq file — where every quad came from.
const G = {
  members:  'https://forgetmenot.local/graph/identity/members-api',
  ddp:      'https://forgetmenot.local/graph/identity/ddp-sparql',
  scraped:  'https://forgetmenot.local/graph/identity/scraped',
  appg:     'https://forgetmenot.local/graph/identity/appg',
  govuk:    'https://forgetmenot.local/graph/identity/govuk',
  prov:     'https://forgetmenot.local/graph/identity/provenance',
};

// N-Quads escaping for string literals.
function nqStr(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g,  '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    + '"';
}
function iri(u) { return `<${u}>`; }
function memberIri(id) { return `https://members-api.parliament.uk/api/Members/${id}`; }
function appgIri(slug, edition) {
  return `https://publications.parliament.uk/pa/cm/cmallparty/${edition}/${slug}.htm`;
}

// Accumulate quads keyed by graph for stable, easily-diffable output.
const quads = []; // each: [s, p, o, g] where s/o are pre-formatted N-Quad terms

function add(s, p, o, g) { quads.push([s, p, o, g]); }
function addIri(s, p, o, g) { add(iri(s), iri(p), iri(o), iri(g)); }
function addLit(s, p, lit, g, datatype) {
  const o = datatype ? `${nqStr(lit)}^^${iri(datatype)}` : nqStr(lit);
  add(iri(s), iri(p), o, iri(g));
}

// ---------------------------------------------------------------
// 1. Local per-member dumps → Members API graph
// ---------------------------------------------------------------
const membersDir = resolve(repoRoot, 'third_party/data/members');
const memberFiles = existsSync(membersDir)
  ? readdirSync(membersDir).filter(f => /^\d+\.json$/.test(f))
  : [];
const members = new Map(); // id → { dump fields }
for (const f of memberFiles) {
  const id = Number(f.replace(/\.json$/, ''));
  const j = JSON.parse(readFileSync(resolve(membersDir, f), 'utf8'));
  members.set(id, j);
  const s = memberIri(id);
  addLit(s, NS.fmn + 'membersApiId', String(id), G.members);
  addLit(s, NS.fmn + 'mnisId',       String(id), G.members); // identical for current members
  if (j.name)              addLit(s, NS.schema + 'name',        j.name,             G.members);
  if (j.nameListAs)        addLit(s, NS.fmn + 'nameListAs',     j.nameListAs,       G.members);
  if (j.party)             addLit(s, NS.fmn + 'party',          j.party,            G.members);
  if (j.house)             addLit(s, NS.fmn + 'house',          j.house,            G.members);
  if (j.constituency)      addLit(s, NS.fmn + 'constituency',   j.constituency,     G.members);
  if (j.gender)            addLit(s, NS.schema + 'gender',      j.gender,           G.members);
  if (j.membershipStart)   addLit(s, NS.fmn + 'membershipStart',j.membershipStart.slice(0,10),
                                  G.members,
                                  'http://www.w3.org/2001/XMLSchema#date');
  // Type the subject
  add(iri(s), iri(NS.rdf + 'type'), iri(NS.schema + 'Person'), iri(G.members));
}
process.stderr.write(`Members from per-member dumps: ${members.size}\n`);

// ---------------------------------------------------------------
// 2. DDP person IRIs via one bulk SPARQL → DDP graph
//    Single query returns all 5,425 DDP↔MNIS bindings.
// ---------------------------------------------------------------
async function sparql(query) {
  const { stdout } = await exec('node', [parl, 'sparql', 'query', query],
    { maxBuffer: 64 * 1024 * 1024, timeoutMs: 120000 });
  return JSON.parse(stdout);
}

process.stderr.write('Fetching DDP↔MNIS bindings via SPARQL…\n');
const ddpRes = await sparql(`
  PREFIX schema: <https://id.parliament.uk/schema/>
  SELECT ?ddp ?mnis ?given ?family WHERE {
    ?ddp schema:memberMnisId ?mnis .
    OPTIONAL { ?ddp schema:personGivenName ?given }
    OPTIONAL { ?ddp schema:personFamilyName ?family }
  }
`);
const ddpByMnis = new Map(); // mnisId → { ddp, given, family }
for (const b of ddpRes.results?.bindings || []) {
  const mnis = Number(b.mnis.value);
  ddpByMnis.set(mnis, {
    ddp: b.ddp.value,
    given: b.given?.value,
    family: b.family?.value,
  });
}
process.stderr.write(`DDP bindings: ${ddpByMnis.size}\n`);

// Emit DDP-graph quads for every member we know about.
let ddpHits = 0;
for (const id of members.keys()) {
  const d = ddpByMnis.get(id);
  if (!d) continue;
  ddpHits++;
  const s = memberIri(id);
  addIri(s, NS.owl + 'sameAs', d.ddp, G.ddp);
  addLit(s, NS.fmn + 'ddpLocalId', d.ddp.replace(/^https:\/\/id\.parliament\.uk\//, ''), G.ddp);
  if (d.given)  addLit(s, NS.schema + 'givenName',  d.given,  G.ddp);
  if (d.family) addLit(s, NS.schema + 'familyName', d.family, G.ddp);
}
process.stderr.write(`Members successfully bridged to DDP: ${ddpHits}/${members.size}\n`);

// Also keep a DDP-only index for members we don't have a local
// dump for, so the graph captures the wider Parliament population.
let ddpOnly = 0;
for (const [mnis, d] of ddpByMnis) {
  if (members.has(mnis)) continue;
  ddpOnly++;
  const s = memberIri(mnis);
  add(iri(s), iri(NS.rdf + 'type'), iri(NS.schema + 'Person'), iri(G.ddp));
  addIri(s, NS.owl + 'sameAs', d.ddp, G.ddp);
  addLit(s, NS.fmn + 'mnisId', String(mnis), G.ddp);
  addLit(s, NS.fmn + 'ddpLocalId', d.ddp.replace(/^https:\/\/id\.parliament\.uk\//, ''), G.ddp);
  if (d.given)  addLit(s, NS.schema + 'givenName',  d.given,  G.ddp);
  if (d.family) addLit(s, NS.schema + 'familyName', d.family, G.ddp);
}
process.stderr.write(`Additional DDP-only persons (no local dump): ${ddpOnly}\n`);

// ---------------------------------------------------------------
// 3. Scraped corpus presence → scraped graph
// ---------------------------------------------------------------
const sitesDir = resolve(repoRoot, 'third_party/data/sites');
let scrapedHits = 0;
for (const id of members.keys()) {
  const dir = resolve(sitesDir, String(id));
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
  const manifestPath = resolve(dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  scrapedHits++;
  const s = memberIri(id);
  const rel = `third_party/data/sites/${id}/`;
  addLit(s, NS.fmn + 'scrapedSiteDir', rel, G.scraped);
  // Surface feeds if present.
  const feedsDir = resolve(dir, 'feeds');
  if (existsSync(feedsDir)) {
    for (const f of readdirSync(feedsDir)) {
      addLit(s, NS.fmn + 'scrapedFeed', `${rel}feeds/${f}`, G.scraped);
    }
  }
  // Surface platform/social if recorded.
  try {
    const mf = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (mf.platform)    addLit(s, NS.fmn + 'sitePlatform', mf.platform, G.scraped);
    if (mf.homepageUrl && /^https?:\/\/[^\s<>]+$/.test(mf.homepageUrl)) {
      addIri(s, NS.schema + 'url', mf.homepageUrl, G.scraped);
    }
    for (const sc of mf.social || []) {
      if (sc.url && /^https?:\/\/[^\s<>]+$/.test(sc.url)) {
        addIri(s, NS.schema + 'sameAs', sc.url, G.scraped);
      }
    }
  } catch (e) { /* keep going */ }
  // Member dump path itself
  addLit(s, NS.fmn + 'memberDump', `third_party/data/members/${id}.json`, G.scraped);
}
process.stderr.write(`Members with scraped site present: ${scrapedHits}\n`);

// ---------------------------------------------------------------
// 4. APPG officer roles → APPG graph
// ---------------------------------------------------------------
const appgPath = resolve(repoRoot, 'third_party/data/appg/resolved.json');
let appgHits = 0;
if (existsSync(appgPath)) {
  const appg = JSON.parse(readFileSync(appgPath, 'utf8'));
  const edition = appg.edition;
  for (const g of appg.groups || []) {
    const slug = g.slug;
    if (!slug) continue;
    const groupUri = appgIri(slug, edition);
    // Type the group itself.
    add(iri(groupUri), iri(NS.rdf + 'type'), iri(NS.fmn + 'AppgGroup'), iri(G.appg));
    addLit(groupUri, NS.schema + 'name', g.title || '', G.appg);
    if (g.subject) addLit(groupUri, NS.fmn + 'subject', g.subject, G.appg);
    if (g.category) addLit(groupUri, NS.fmn + 'category', g.category, G.appg);
    for (const o of g.officers || []) {
      const memberId = o.resolution?.member?.id;
      if (!memberId || o.resolution?.status !== 'matched') continue;
      appgHits++;
      const s = memberIri(memberId);
      // Officership as a blank node so we can carry the role.
      const bn = `_:appg_${slug.replace(/[^a-z0-9]/gi, '_')}_${memberId}`;
      add(iri(s), iri(NS.fmn + 'appgOfficership'), bn, iri(G.appg));
      add(bn, iri(NS.fmn + 'appgGroup'), iri(groupUri), iri(G.appg));
      add(bn, iri(NS.fmn + 'appgRole'), nqStr(o.role || ''), iri(G.appg));
      // Wikidata if the resolver attached one.
      if (o.wikidata?.id) {
        addIri(s, NS.owl + 'sameAs', `https://www.wikidata.org/entity/${o.wikidata.id}`, G.appg);
      }
    }
  }
}
process.stderr.write(`APPG officerships attached to members: ${appgHits}\n`);

// ---------------------------------------------------------------
// 5. GOV.UK person factoids → govuk graph (best-effort)
//    Match by:
//      (a) slug match: gov.uk slug `rachel-reeves` ↔ DDP
//          `given-family` lowercased.
//      (b) name match: GOV.UK schema:name string cleaned of
//          honorifics + post-nominals ↔ DDP given+family.
//    Only commit a match when EXACTLY one DDP person matches.
// ---------------------------------------------------------------
const govukDir = resolve(repoRoot, 'third_party/govuk/html/orgcharts/extractors/factoids');
let govukHits = 0, govukAmbig = 0, govukNoMatch = 0;

// Honorifics that may prefix a GOV.UK name. Order matters: try
// longer ones first so e.g. "The Rt Hon Sir" peels off cleanly.
const HONORIFICS = [
  'The Rt Hon Dame', 'The Rt Hon Sir', 'The Right Hon', 'The Rt Hon',
  'The Most Hon', 'The Hon', 'Dame', 'Sir', 'Lord', 'Lady', 'Baroness',
  'Viscount', 'Earl', 'Dr', 'Professor', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx',
  'Rev', 'Revd', 'The', 'His Excellency', 'Her Excellency',
  // military / clergy / civil
  'Air Marshal', 'Air Vice-Marshal', 'General', 'Lieutenant General',
  'Major General', 'Brigadier', 'Colonel', 'Lieutenant Colonel',
  'Vice Admiral', 'Rear Admiral', 'Admiral', 'Wing Commander',
];
// Post-nominals to strip from the trailing end. Iterated repeatedly
// so "MP CBE QC" all peel off.
const POSTNOMS = new Set([
  'MP', 'MEP', 'MSP', 'MLA', 'AM',
  'KC', 'QC', 'PC',
  'MBE', 'OBE', 'CBE', 'DBE', 'KBE', 'GBE',
  'KCB', 'KCMG', 'GCB', 'GCMG', 'GCVO', 'KCVO', 'CMG', 'CVO',
  'FRS', 'FRSE', 'FRSA', 'FBA', 'FREng', 'FInstP',
  'BA', 'BSc', 'MA', 'MSc', 'PhD', 'DPhil', 'LLB', 'LLM',
  'RAF', 'RN', 'JP', 'TD', 'VC', 'DSO', 'MC', 'AFC',
  'KCSI', 'GCSI', 'CB', 'GBE',
]);

// Strip trailing post-nominals greedily (e.g. "KC OBE MP" all peel off).
function stripPostnoms(s) {
  let changed = true;
  while (changed) {
    changed = false;
    const m = /\s+([A-Z][A-Za-z]{1,5})$/.exec(s);
    if (m && POSTNOMS.has(m[1].toUpperCase())) { s = s.slice(0, m.index); changed = true; }
  }
  return s.replace(/\s+/g, ' ').trim();
}
// Strip leading honorifics greedily (e.g. "The Rt Hon Sir" all peel off).
function stripHonorifics(s) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const h of HONORIFICS) {
      const re = new RegExp(`^${h.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s+`, 'i');
      if (re.test(s)) { s = s.replace(re, ''); changed = true; break; }
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}
// MP-style: strip both ends, leaving "Given Family".
function cleanGovukName(raw) {
  return stripPostnoms(stripHonorifics(raw.trim()));
}
// Peer-style: keep the honorific (Baroness/Lord/Viscount/...) — that
// IS part of the name in the per-member dump — but strip post-noms.
function cleanGovukPeerName(raw) {
  return stripPostnoms(raw.trim());
}

if (existsSync(govukDir)) {
  // Build several indices into DDP persons + local member dumps:
  //   (a) bySlug   → memberId[]  — DDP lowercase `given-family`
  //   (b) byFull   → memberId[]  — DDP lowercase `given family`
  //   (c) byPeer   → memberId[]  — per-MP dump nameDisplayAs
  //                                lowercased (e.g.
  //                                "baroness anderson of stoke-on-trent")
  // For ambiguous cases we prefer candidates that have a local
  // per-member dump — those are MPs and peers active enough to
  // appear in our local corpus, i.e. the politicians GOV.UK is
  // most likely talking about.
  const bySlug = new Map();
  const byFull = new Map();
  const byPeer = new Map();
  for (const [mnis, d] of ddpByMnis) {
    if (!d.given || !d.family) continue;
    const slug = `${d.given} ${d.family}`.toLowerCase().replace(/\s+/g, '-');
    const full = `${d.given} ${d.family}`.toLowerCase();
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(mnis);
    if (!byFull.has(full)) byFull.set(full, []);
    byFull.get(full).push(mnis);
  }
  // Peer-style name index from the per-member dumps.
  for (const [id, dump] of members) {
    for (const v of [dump.name, dump.nameListAs, dump.nameDisplayAs]) {
      if (!v) continue;
      const k = v.toLowerCase().trim();
      if (!byPeer.has(k)) byPeer.set(k, []);
      if (!byPeer.get(k).includes(id)) byPeer.get(k).push(id);
    }
  }

  const preferLocal = (ids) => {
    const local = ids.filter(id => members.has(id));
    return local.length === 1 ? local[0] : null;
  };

  for (const slug of readdirSync(govukDir)) {
    if (!slug.startsWith('government__people__')) continue;
    const ttlPath = resolve(govukDir, slug, 'factoids.ttl');
    if (!existsSync(ttlPath)) continue;
    const ttl = readFileSync(ttlPath, 'utf8');
    const nameMatch = /schema1:name\s+"([^"]+)"@en/.exec(ttl);
    const urlMatch  = /^<(https:\/\/www\.gov\.uk\/government\/people\/[^>]+)>/m.exec(ttl);
    if (!nameMatch || !urlMatch) continue;
    const rawName = nameMatch[1];
    const govukUri = urlMatch[1];
    const govukSlug = slug.replace(/^government__people__/, '').replace(/\.cy$/, '');

    const cleaned = cleanGovukName(rawName).toLowerCase();
    const candidates = new Set();
    for (const id of bySlug.get(govukSlug) || []) candidates.add(id);
    for (const id of byFull.get(cleaned) || []) candidates.add(id);
    for (const id of bySlug.get(cleaned.replace(/\s+/g, '-')) || []) candidates.add(id);
    // Peer match — keep honorifics ("Baroness Sherlock"), strip
    // only post-noms ("OBE", "KC"). Also try the absolutely raw name.
    const peerCleaned = cleanGovukPeerName(rawName).toLowerCase();
    for (const id of byPeer.get(rawName.toLowerCase().trim()) || []) candidates.add(id);
    for (const id of byPeer.get(peerCleaned) || []) candidates.add(id);
    for (const id of byPeer.get(cleaned) || []) candidates.add(id);

    let memberId = null;
    if (candidates.size === 1) {
      memberId = [...candidates][0];
    } else if (candidates.size > 1) {
      memberId = preferLocal([...candidates]);
    }

    if (!memberId) {
      if (candidates.size === 0) govukNoMatch++;
      else                       govukAmbig++;
      continue;
    }
    govukHits++;
    const s = memberIri(memberId);
    addIri(s, NS.owl + 'sameAs', govukUri, G.govuk);
    addLit(s, NS.fmn + 'govukFactoidFile',
           `third_party/govuk/html/orgcharts/extractors/factoids/${slug}/factoids.ttl`,
           G.govuk);
    addLit(s, NS.fmn + 'govukCleanName', cleanGovukName(rawName), G.govuk);
  }
}
process.stderr.write(
  `Members cross-linked to GOV.UK people: ${govukHits} ` +
  `(${govukAmbig} ambiguous, ${govukNoMatch} no match)\n`
);

// ---------------------------------------------------------------
// 6. Provenance graph
//
// Every quad above belongs to one of five named graphs. This
// graph (a sixth) DESCRIBES the other five with PROV-O + VoID:
//
//   - what each graph is (void:Dataset + dcterms:title/description)
//   - the source artefact it derives from (dcterms:source +
//     prov:wasDerivedFrom — a remote URL or a local file path)
//   - how many quads it contains (void:triples)
//   - which build activity produced it (prov:wasGeneratedBy)
//   - when (prov:generatedAtTime)
//
// One prov:Activity describes the build run itself, tying back to
// the script (`prov:wasAssociatedWith`) and the git revision when
// available. Downstream consumers can therefore answer "where did
// this quad come from, when, and using what source?" by
// dereferencing the named graph the quad appears in.
// ---------------------------------------------------------------

const now = new Date().toISOString();
const buildIri = `https://forgetmenot.local/identity/build/${now.replace(/[:.]/g, '-')}`;
const scriptIri = `https://forgetmenot.local/identity/agent/build-identity-graph`;

// Try to capture the current git HEAD so provenance is reproducible.
let gitRev = null;
try {
  const { stdout } = await exec('git', ['rev-parse', '--short=12', 'HEAD'], { timeoutMs: 5000 });
  gitRev = stdout.trim();
} catch { /* not in a git checkout; skip */ }

// Build activity
add(iri(buildIri), iri(NS.rdf + 'type'), iri(NS.prov + 'Activity'), iri(G.prov));
addLit(buildIri, NS.prov + 'startedAtTime', now, G.prov, NS.xsd + 'dateTime');
addLit(buildIri, NS.prov + 'endedAtTime',   now, G.prov, NS.xsd + 'dateTime');
add(iri(buildIri), iri(NS.prov + 'wasAssociatedWith'), iri(scriptIri), iri(G.prov));
addLit(buildIri, NS.rdfs + 'label', 'forgetmenot identity-graph build', G.prov);
if (gitRev) addLit(buildIri, NS.fmn + 'gitRevision', gitRev, G.prov);

// The script as a SoftwareAgent
add(iri(scriptIri), iri(NS.rdf + 'type'), iri(NS.prov + 'SoftwareAgent'), iri(G.prov));
addLit(scriptIri, NS.rdfs + 'label', 'scripts/build-identity-graph.mjs', G.prov);
addLit(scriptIri, NS.dcterms + 'source', 'scripts/build-identity-graph.mjs', G.prov);

// Description per source graph.
const graphMeta = [
  {
    iri: G.members,
    title: 'Members API per-MP dumps',
    description: 'Flattened per-MP JSON dumps written by `parl members crawl`. ' +
                 'Captures Members API id, MNIS id, name, party, house, constituency, ' +
                 'and contact metadata.',
    sources: ['third_party/data/members/', 'https://members-api.parliament.uk/'],
  },
  {
    iri: G.ddp,
    title: 'DDP (data.parliament) public SPARQL graph',
    description: 'DDP person IRIs (LocalIds), given/family names, and the owl:sameAs ' +
                 'bridge from Members API id. Sourced by a single bulk SPARQL query ' +
                 'over the public DDP store.',
    sources: ['https://api.parliament.uk/sparql'],
  },
  {
    iri: G.scraped,
    title: 'Per-MP polite website crawl',
    description: 'Presence of a polite scrape of each MP\'s public political website — ' +
                 'platform, homepage URL, RSS/Atom feeds, and declared social profiles.',
    sources: ['third_party/data/sites/'],
  },
  {
    iri: G.appg,
    title: 'APPG officer roles',
    description: 'All-Party Parliamentary Group officerships, resolved from the ' +
                 'official Register publication to Members API ids by `parl appg resolve`.',
    sources: ['third_party/data/appg/resolved.json',
              'https://publications.parliament.uk/pa/cm/cmallparty/'],
  },
  {
    iri: G.govuk,
    title: 'GOV.UK people factoids',
    description: 'Cross-links from Members API id to GOV.UK ministerial / official ' +
                 'people pages, where a confident name match exists.',
    sources: ['third_party/govuk/html/orgcharts/extractors/factoids/',
              'https://www.gov.uk/government/people/'],
  },
];

// Count quads per graph so we can emit void:triples.
const quadsPerGraph = new Map();
for (const q of quads) {
  const g = q[3].replace(/^<|>$/g, '');
  quadsPerGraph.set(g, (quadsPerGraph.get(g) || 0) + 1);
}

for (const m of graphMeta) {
  const s = m.iri;
  add(iri(s), iri(NS.rdf + 'type'), iri(NS.void + 'Dataset'), iri(G.prov));
  add(iri(s), iri(NS.rdf + 'type'), iri(NS.prov + 'Entity'),  iri(G.prov));
  addLit(s, NS.dcterms + 'title',       m.title,       G.prov);
  addLit(s, NS.dcterms + 'description', m.description, G.prov);
  addLit(s, NS.dcterms + 'created',     now,           G.prov, NS.xsd + 'dateTime');
  addLit(s, NS.prov    + 'generatedAtTime', now,       G.prov, NS.xsd + 'dateTime');
  add(iri(s), iri(NS.prov + 'wasGeneratedBy'), iri(buildIri), iri(G.prov));
  for (const src of m.sources) {
    if (/^https?:\/\//.test(src)) {
      add(iri(s), iri(NS.dcterms + 'source'),       iri(src), iri(G.prov));
      add(iri(s), iri(NS.prov   + 'wasDerivedFrom'), iri(src), iri(G.prov));
    } else {
      addLit(s, NS.dcterms + 'source', src, G.prov);
    }
  }
  const tcount = quadsPerGraph.get(m.iri) || 0;
  addLit(s, NS.void + 'triples', String(tcount), G.prov, NS.xsd + 'integer');
}

// The provenance graph itself: self-describing.
add(iri(G.prov), iri(NS.rdf + 'type'), iri(NS.void + 'Dataset'), iri(G.prov));
addLit(G.prov, NS.dcterms + 'title', 'Provenance graph for forgetmenot identity-graph', G.prov);
addLit(G.prov, NS.dcterms + 'description',
       'PROV-O + VoID descriptions of the other five named graphs in identity.nq.',
       G.prov);
addLit(G.prov, NS.prov + 'generatedAtTime', now, G.prov, NS.xsd + 'dateTime');
add(iri(G.prov), iri(NS.prov + 'wasGeneratedBy'), iri(buildIri), iri(G.prov));

process.stderr.write(
  `Provenance: 1 prov:Activity + ${graphMeta.length} void:Dataset descriptions ` +
  `(git rev ${gitRev || 'unknown'})\n`
);

// ---------------------------------------------------------------
// Emit N-Quads
// ---------------------------------------------------------------
const lines = quads.map(q => q.join(' ') + ' .');
const nqPath = resolve(outDir, 'identity.nq');
writeFileSync(nqPath, lines.join('\n') + '\n');
process.stderr.write(`Wrote ${nqPath} (${quads.length} quads)\n`);

// Summary
const idx = {
  generatedAt: new Date().toISOString(),
  output: 'third_party/identity-graph/identity.nq',
  totals: {
    quads: quads.length,
    members_local: members.size,
    members_bridged_to_ddp: ddpHits,
    members_with_scraped_site: scrapedHits,
    appg_officerships_attached: appgHits,
    govuk_people_matched: govukHits,
    ddp_only_persons: ddpOnly,
  },
  namedGraphs: G,
  namespaces: NS,
  sample: lines.slice(0, 10),
};
writeFileSync(resolve(outDir, '_index.json'), JSON.stringify(idx, null, 2));
process.stderr.write(`Wrote ${resolve(outDir, '_index.json')}\n`);
