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
  fmn:    'https://forgetmenot.local/identity#',
  parl:   'https://id.parliament.uk/schema/',
};

// Per-source named graphs
const G = {
  members:  'https://forgetmenot.local/graph/identity/members-api',
  ddp:      'https://forgetmenot.local/graph/identity/ddp-sparql',
  scraped:  'https://forgetmenot.local/graph/identity/scraped',
  appg:     'https://forgetmenot.local/graph/identity/appg',
  govuk:    'https://forgetmenot.local/graph/identity/govuk',
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
//    Match by case-insensitive Given Family name. Ministers and
//    senior officials match cleanly; backbench MPs usually don't.
// ---------------------------------------------------------------
const govukDir = resolve(repoRoot, 'third_party/govuk/html/orgcharts/extractors/factoids');
let govukHits = 0;
if (existsSync(govukDir)) {
  // Build a name → memberId map from DDP bindings (more reliable
  // than the per-member dumps, which use `nameDisplayAs` strings
  // like "Lord Holmes of Richmond" that don't split cleanly).
  const byName = new Map();
  for (const [mnis, d] of ddpByMnis) {
    if (!d.given || !d.family) continue;
    const key = `${d.given} ${d.family}`.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(mnis);
  }
  for (const slug of readdirSync(govukDir)) {
    if (!slug.startsWith('government__people__')) continue;
    const ttlPath = resolve(govukDir, slug, 'factoids.ttl');
    if (!existsSync(ttlPath)) continue;
    const ttl = readFileSync(ttlPath, 'utf8');
    const nameMatch = /schema1:name\s+"([^"]+)"@en/.exec(ttl);
    const urlMatch  = /^<(https:\/\/www\.gov\.uk\/government\/people\/[^>]+)>/m.exec(ttl);
    if (!nameMatch || !urlMatch) continue;
    const name = nameMatch[1].toLowerCase();
    const govukUri = urlMatch[1];
    const matches = byName.get(name);
    if (!matches || matches.length !== 1) continue; // skip ambiguous / unmatched
    const memberId = matches[0];
    govukHits++;
    const s = memberIri(memberId);
    addIri(s, NS.owl + 'sameAs', govukUri, G.govuk);
    addLit(s, NS.fmn + 'govukFactoidFile', `third_party/govuk/html/orgcharts/extractors/factoids/${slug}/factoids.ttl`, G.govuk);
  }
}
process.stderr.write(`Members cross-linked to GOV.UK people: ${govukHits}\n`);

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
