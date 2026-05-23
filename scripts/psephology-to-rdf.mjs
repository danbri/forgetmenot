#!/usr/bin/env node
// scripts/psephology-to-rdf.mjs
//
// Full RDFification of the local psephology Postgres database
// into a single N-Quads file per the table-to-ontology mapping in
// skills/psephology/reference.md.
//
// Output:
//   third_party/data/psephology/all.nq      (deleted after gzip
//                                            unless --keep-uncompressed)
//   third_party/data/psephology/all.nq.gz   (committed; FCDO precedent)
//
// One named graph per source table; one provenance graph at the
// end describing each graph with PROV-O + VoID and naming the
// upstream dump URL.
//
// Vocab discipline (docs/vocab.md):
//   - pe:   external — Parliament's election ontology
//   - parl: external — Parliament's stable IDs (memberId etc.)
//   - fm:   our own  — for everything pe: doesn't cover
//
// Run:  npm run psephology:rdf
// Pre:  the database must be up (npm run psephology:up).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, mkdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'third_party/data/psephology');
mkdirSync(outDir, { recursive: true });

const argv = process.argv.slice(2);
const SAMPLE = argv.includes('--sample');
const opt = {
  sample: SAMPLE,
  keepUncompressed: argv.includes('--keep-uncompressed'),
  out: argv.includes('--out')
       ? argv[argv.indexOf('--out') + 1]
       : resolve(outDir, SAMPLE ? 'sample.nq' : 'all.nq'),
};

const dumpDate = '2026-05-23'; // matches the canonical dump in /third_party/data/psephology/

// --- Namespaces ---
const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
  xsd:    'http://www.w3.org/2001/XMLSchema#',
  owl:    'http://www.w3.org/2002/07/owl#',
  prov:   'http://www.w3.org/ns/prov#',
  void:   'http://rdfs.org/ns/void#',
  dcterms:'http://purl.org/dc/terms/',
  skos:   'http://www.w3.org/2004/02/skos/core#',
  pe:     'http://parliament.uk/ontologies/election/',
  fm:     'https://forgetmenot.local/vocab#',
  parl:   'https://id.parliament.uk/schema/',
};
const BASE_IRI = 'https://forgetmenot.local/election';
const iri = (cls, id) => `${BASE_IRI}/${cls}/${id}`;
const GRAPH_BASE = 'https://forgetmenot.local/graph/psephology';

// --- Streaming N-Quads emit ---
const outPath = opt.out;
const stream = createWriteStream(outPath);
let nQuads = 0;
const quadsPerGraph = new Map();
function bumpGraph(g) { quadsPerGraph.set(g, (quadsPerGraph.get(g) || 0) + 1); }

function nqStr(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    + '"';
}
const wrapIri = u => `<${u}>`;

function write(line, g) {
  stream.write(line + ' .\n');
  nQuads++;
  bumpGraph(g);
}
function addIri(s, p, o, g) {
  write(`${wrapIri(s)} ${wrapIri(p)} ${wrapIri(o)} ${wrapIri(g)}`, g);
}
function addLit(s, p, lit, g, datatype) {
  const o = datatype ? `${nqStr(lit)}^^${wrapIri(datatype)}` : nqStr(lit);
  write(`${wrapIri(s)} ${wrapIri(p)} ${o} ${wrapIri(g)}`, g);
}
function addBNode(bn, p, o, g, isIri = true) {
  const obj = isIri ? wrapIri(o) : o;
  write(`${bn} ${wrapIri(p)} ${obj} ${wrapIri(g)}`, g);
}
// Triple with an IRI subject and a blank-node object.
function addBNodeObj(s, p, bn, g) {
  write(`${wrapIri(s)} ${wrapIri(p)} ${bn} ${wrapIri(g)}`, g);
}

// --- SQL helpers (reuse auth strategy from lib/facilities) ---
let _sudoOK = null;
async function canSudo() {
  if (_sudoOK !== null) return _sudoOK;
  try { await exec('sudo', ['-n', 'true'], { timeout: 2000 }); _sudoOK = true; }
  catch { _sudoOK = false; }
  return _sudoOK;
}
async function sql(query) {
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
                   FROM (${query.trim().replace(/;\s*$/, '')}) t;`;
  let cmd, args;
  if (await canSudo()) {
    cmd = 'sudo'; args = ['-n', '-u', 'postgres', 'psql', '-d', 'psephology', '-tAc', wrapped];
  } else {
    cmd = 'psql'; args = ['-h', 'localhost', '-U', 'postgres', '-d', 'psephology', '-tAc', wrapped];
  }
  const { stdout } = await exec(cmd, args, { maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout.trim() || '[]');
}

// --- Sample-mode row limit ---
const LIMIT = opt.sample ? ' LIMIT 5' : '';

// === 1. countries → pe:Country ===
{
  const g = `${GRAPH_BASE}/countries`;
  const rows = await sql(`SELECT id, name FROM countries${LIMIT}`);
  for (const r of rows) {
    const s = iri('Country', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'Country', g);
    if (r.name) addLit(s, NS.rdfs + 'label', r.name, g);
  }
  process.stderr.write(`  countries:                   ${rows.length}\n`);
}

// === 2. parliament_periods → pe:ParliamentPeriod ===
{
  const g = `${GRAPH_BASE}/parliament-periods`;
  // The columns vary slightly across schema versions; introspect.
  const cols = (await sql(`SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'parliament_periods'`))
    .map(r => r.column_name);
  const select = ['id'];
  if (cols.includes('number'))             select.push('number');
  if (cols.includes('start_on'))           select.push('start_on');
  if (cols.includes('dissolution_on'))     select.push('dissolution_on');
  const rows = await sql(`SELECT ${select.join(',')} FROM parliament_periods${LIMIT}`);
  for (const r of rows) {
    const s = iri('ParliamentPeriod', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'ParliamentPeriod', g);
    if (r.number != null) addLit(s, NS.pe + 'ordinality', String(r.number), g, NS.xsd + 'integer');
    if (r.start_on)       addLit(s, NS.fm + 'startOn',    r.start_on,        g, NS.xsd + 'date');
    if (r.dissolution_on) addLit(s, NS.fm + 'dissolutionOn', r.dissolution_on, g, NS.xsd + 'date');
  }
  process.stderr.write(`  parliament_periods:          ${rows.length}\n`);
}

// === 3. boundary_sets → pe:BoundarySet (+ pe:establishedBy via join) ===
{
  const g = `${GRAPH_BASE}/boundary-sets`;
  const rows = await sql(`SELECT id, start_on, end_on, description, country_id FROM boundary_sets${LIMIT}`);
  for (const r of rows) {
    const s = iri('BoundarySet', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'BoundarySet', g);
    if (r.description) addLit(s, NS.rdfs + 'label', r.description, g);
    if (r.start_on)    addLit(s, NS.fm + 'startOn', r.start_on, g, NS.xsd + 'date');
    if (r.end_on)      addLit(s, NS.fm + 'endOn',   r.end_on,   g, NS.xsd + 'date');
    if (r.country_id)  addIri(s, NS.fm + 'inCountry', iri('Country', r.country_id), g);
  }
  // establishedBy joins via boundary_set_legislation_items
  const joins = await sql(`SELECT boundary_set_id, legislation_item_id
                           FROM boundary_set_legislation_items${LIMIT}`);
  for (const r of joins) {
    addIri(iri('BoundarySet', r.boundary_set_id),
           NS.pe + 'establishedBy',
           iri('StatutoryThing', r.legislation_item_id),
           g);
  }
  process.stderr.write(`  boundary_sets:               ${rows.length} (+${joins.length} establishedBy)\n`);
}

// === 4. legislation_items → pe:StatutoryThing ===
{
  const g = `${GRAPH_BASE}/legislation-items`;
  // Discover columns first.
  const cols = (await sql(`SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'legislation_items'`))
    .map(r => r.column_name);
  const select = ['id'];
  for (const c of ['title', 'year', 'number', 'chapter', 'identifier', 'legislation_type_id']) {
    if (cols.includes(c)) select.push(c);
  }
  const rows = await sql(`SELECT ${select.join(',')} FROM legislation_items${LIMIT}`);
  for (const r of rows) {
    const s = iri('StatutoryThing', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'StatutoryThing', g);
    if (r.title)      addLit(s, NS.rdfs + 'label', r.title, g);
    if (r.year != null) addLit(s, NS.fm + 'year', String(r.year), g, NS.xsd + 'gYear');
    if (r.number != null) addLit(s, NS.fm + 'number', String(r.number), g, NS.xsd + 'integer');
    if (r.chapter)    addLit(s, NS.fm + 'chapter', r.chapter, g);
    if (r.identifier) addLit(s, NS.dcterms + 'identifier', r.identifier, g);
  }
  process.stderr.write(`  legislation_items:           ${rows.length}\n`);
}

// === 5. constituency_group_sets → pe:ConstituencyGroupSet ===
{
  const g = `${GRAPH_BASE}/constituency-group-sets`;
  const cols = (await sql(`SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'constituency_group_sets'`))
    .map(r => r.column_name);
  const select = ['id'];
  if (cols.includes('country_id'))   select.push('country_id');
  if (cols.includes('start_on'))     select.push('start_on');
  if (cols.includes('end_on'))       select.push('end_on');
  const rows = await sql(`SELECT ${select.join(',')} FROM constituency_group_sets${LIMIT}`);
  for (const r of rows) {
    const s = iri('ConstituencyGroupSet', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'ConstituencyGroupSet', g);
    if (r.country_id) addIri(s, NS.pe + 'constituencyGroupSetInCountry',
                              iri('Country', r.country_id), g);
    if (r.start_on)   addLit(s, NS.fm + 'startOn', r.start_on, g, NS.xsd + 'date');
    if (r.end_on)     addLit(s, NS.fm + 'endOn',   r.end_on,   g, NS.xsd + 'date');
  }
  process.stderr.write(`  constituency_group_sets:     ${rows.length}\n`);
}

// === 6. constituency_groups → pe:ConstituencyGroup ===
{
  const g = `${GRAPH_BASE}/constituency-groups`;
  const cols = (await sql(`SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'constituency_groups'`))
    .map(r => r.column_name);
  const select = ['id', 'name'];
  if (cols.includes('constituency_group_set_id')) select.push('constituency_group_set_id');
  const rows = await sql(`SELECT ${select.join(',')} FROM constituency_groups${LIMIT}`);
  for (const r of rows) {
    const s = iri('ConstituencyGroup', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'ConstituencyGroup', g);
    if (r.name) addLit(s, NS.rdfs + 'label', r.name, g);
    if (r.constituency_group_set_id) {
      addIri(s, NS.pe + 'formsPartOfConstituencyGroupSet',
             iri('ConstituencyGroupSet', r.constituency_group_set_id), g);
    }
  }
  process.stderr.write(`  constituency_groups:         ${rows.length}\n`);
}

// === 7. constituency_areas → pe:ConstituencyArea ===
{
  const g = `${GRAPH_BASE}/constituency-areas`;
  const cols = (await sql(`SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'constituency_areas'`))
    .map(r => r.column_name);
  const select = ['id'];
  if (cols.includes('boundary_set_id'))       select.push('boundary_set_id');
  if (cols.includes('constituency_group_id')) select.push('constituency_group_id');
  if (cols.includes('constituency_area_type_id')) select.push('constituency_area_type_id');
  const rows = await sql(`SELECT ${select.join(',')} FROM constituency_areas${LIMIT}`);
  for (const r of rows) {
    const s = iri('ConstituencyArea', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'ConstituencyArea', g);
    if (r.boundary_set_id)
      addIri(s, NS.pe + 'inBoundarySet', iri('BoundarySet', r.boundary_set_id), g);
    if (r.constituency_group_id)
      addIri(iri('ConstituencyGroup', r.constituency_group_id),
             NS.pe + 'boundedBy', s, g);
  }
  process.stderr.write(`  constituency_areas:          ${rows.length}\n`);
}

// === 8. political_parties → pe:PoliticalParty ===
{
  const g = `${GRAPH_BASE}/political-parties`;
  const rows = await sql(`SELECT id, name, abbreviation FROM political_parties${LIMIT}`);
  for (const r of rows) {
    const s = iri('PoliticalParty', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'PoliticalParty', g);
    if (r.name)         addLit(s, NS.rdfs + 'label',  r.name,         g);
    if (r.abbreviation) addLit(s, NS.fm + 'abbreviation', r.abbreviation, g);
  }
  process.stderr.write(`  political_parties:           ${rows.length}\n`);
}

// === 9. political_party_registrations → pe:PoliticalPartyRegistration ===
{
  const g = `${GRAPH_BASE}/political-party-registrations`;
  const cols = (await sql(`SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'political_party_registrations'`))
    .map(r => r.column_name);
  const select = ['id', 'political_party_id'];
  for (const c of ['registration_identifier', 'name', 'name_last_updated_on',
                   'country_id', 'start_on', 'end_on']) {
    if (cols.includes(c)) select.push(c);
  }
  const rows = await sql(`SELECT ${select.join(',')} FROM political_party_registrations${LIMIT}`);
  for (const r of rows) {
    const s = iri('PoliticalPartyRegistration', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'PoliticalPartyRegistration', g);
    addIri(s, NS.pe + 'registrationOf', iri('PoliticalParty', r.political_party_id), g);
    if (r.country_id)
      addIri(s, NS.pe + 'registrationIn', iri('Country', r.country_id), g);
    if (r.registration_identifier)
      addLit(s, NS.pe + 'registrationID', r.registration_identifier, g);
    if (r.name_last_updated_on)
      addLit(s, NS.pe + 'registeredPrimaryNameLastUpdatedOn',
             r.name_last_updated_on, g, NS.xsd + 'date');
    if (r.name) addLit(s, NS.rdfs + 'label', r.name, g);
    if (r.start_on) addLit(s, NS.fm + 'startOn', r.start_on, g, NS.xsd + 'date');
    if (r.end_on)   addLit(s, NS.fm + 'endOn',   r.end_on,   g, NS.xsd + 'date');
  }
  process.stderr.write(`  political_party_registrations: ${rows.length}\n`);
}

// === 10. general_elections → pe:GeneralElection ===
{
  const g = `${GRAPH_BASE}/general-elections`;
  const rows = await sql(`
    SELECT id, polling_on, is_notional,
           row_number() OVER (ORDER BY polling_on) AS ordinality
    FROM   general_elections${LIMIT}`);
  for (const r of rows) {
    const s = iri('GeneralElection', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'GeneralElection', g);
    if (r.polling_on)
      addLit(s, NS.pe + 'generalElectionPollingOn', r.polling_on, g, NS.xsd + 'date');
    addLit(s, NS.pe + 'ordinality', String(r.ordinality), g, NS.xsd + 'integer');
    if (r.is_notional)
      addLit(s, NS.pe + 'isNotional', 'true', g, NS.xsd + 'boolean');
  }
  process.stderr.write(`  general_elections:           ${rows.length}\n`);
}

// === 11. general_election_in_boundary_sets ===
{
  const g = `${GRAPH_BASE}/general-election-in-boundary-sets`;
  const rows = await sql(`SELECT id, general_election_id, boundary_set_id
                          FROM general_election_in_boundary_sets${LIMIT}`);
  for (const r of rows) {
    const s = iri('GeneralElectionInBoundarySet', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'GeneralElectionInBoundarySet', g);
    if (r.general_election_id)
      addIri(s, NS.pe + 'forGeneralElection', iri('GeneralElection', r.general_election_id), g);
    if (r.boundary_set_id)
      addIri(s, NS.pe + 'inBoundarySet', iri('BoundarySet', r.boundary_set_id), g);
  }
  process.stderr.write(`  general_election_in_boundary_sets: ${rows.length}\n`);
}

// === 12. electorates → pe:Electorate ===
// In this dump the size column is `population_count` and there is
// no recorded_on date column; the date can be inferred via
// elections.electorate_id ↔ elections.polling_on but we don't
// reify that here.
{
  const g = `${GRAPH_BASE}/electorates`;
  const rows = await sql(`SELECT id, population_count, constituency_group_id
                          FROM electorates${LIMIT}`);
  for (const r of rows) {
    const s = iri('Electorate', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'Electorate', g);
    if (r.population_count != null)
      addLit(s, NS.pe + 'recordedSize', String(r.population_count),
             g, NS.xsd + 'integer');
    if (r.constituency_group_id)
      addIri(s, NS.fm + 'forConstituencyGroup',
             iri('ConstituencyGroup', r.constituency_group_id), g);
  }
  process.stderr.write(`  electorates:                 ${rows.length}\n`);
}

// === 13. elections → pe:Election ===
{
  const g = `${GRAPH_BASE}/elections`;
  const rows = await sql(`
    SELECT id, polling_on, writ_issued_on, valid_vote_count, invalid_vote_count,
           majority, declaration_at, constituency_group_id, general_election_id,
           electorate_id, parliament_period_id, is_notional
    FROM   elections${LIMIT}`);
  for (const r of rows) {
    const s = iri('Election', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'Election', g);
    if (r.polling_on)       addLit(s, NS.pe + 'electionPollingOn', r.polling_on, g, NS.xsd + 'date');
    if (r.writ_issued_on)   addLit(s, NS.pe + 'writIssuedOn',      r.writ_issued_on, g, NS.xsd + 'date');
    if (r.valid_vote_count != null)
      addLit(s, NS.pe + 'validVoteCount',   String(r.valid_vote_count),   g, NS.xsd + 'integer');
    if (r.invalid_vote_count != null)
      addLit(s, NS.pe + 'invalidVoteCount', String(r.invalid_vote_count), g, NS.xsd + 'integer');
    if (r.majority != null)
      addLit(s, NS.pe + 'majority', String(r.majority), g, NS.xsd + 'integer');
    if (r.declaration_at)
      addLit(s, NS.pe + 'declarationTime', r.declaration_at.replace(' ', 'T'),
             g, NS.xsd + 'dateTime');
    if (r.constituency_group_id)
      addIri(s, NS.pe + 'forConstituencyGroup', iri('ConstituencyGroup', r.constituency_group_id), g);
    if (r.general_election_id)
      addIri(s, NS.pe + 'formsPartOfGeneralElection', iri('GeneralElection', r.general_election_id), g);
    if (r.electorate_id)
      addIri(s, NS.pe + 'hasElectorate', iri('Electorate', r.electorate_id), g);
    if (r.parliament_period_id)
      addIri(s, NS.pe + 'intoParliamentPeriod', iri('ParliamentPeriod', r.parliament_period_id), g);
    if (r.is_notional)
      addLit(s, NS.pe + 'isNotional', 'true', g, NS.xsd + 'boolean');
  }
  process.stderr.write(`  elections:                   ${rows.length}\n`);
}

// === 14. candidacies → pe:Candidacy + reified pe:CandidacyResult ===
//
// IMPORTANT: `candidacies.member_id` is the psephology-local
// `members.id`, NOT the MNIS / Members API id. We JOIN to
// `members.mnis_id` to surface the real Parliament identifier in
// the bridge predicate (`parl:memberId`). For candidacies that
// never became MPs, member_id is NULL and no person blank node is
// emitted.
{
  const g = `${GRAPH_BASE}/candidacies`;
  const rows = await sql(`
    SELECT c.id, c.candidate_given_name, c.candidate_family_name,
           c.is_standing_as_commons_speaker, c.is_standing_as_independent,
           c.is_notional, c.result_position, c.is_winning_candidacy,
           c.vote_count, c.vote_share, c.vote_change, c.election_id,
           m.mnis_id
    FROM   candidacies c
    LEFT   JOIN members m ON m.id = c.member_id${LIMIT}`);
  for (const r of rows) {
    const s = iri('Candidacy', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'Candidacy', g);
    if (r.candidate_given_name)  addLit(s, NS.pe + 'candidateGivenName',  r.candidate_given_name,  g);
    if (r.candidate_family_name) addLit(s, NS.pe + 'candidateFamilyName', r.candidate_family_name, g);
    if (r.is_standing_as_commons_speaker)
      addLit(s, NS.pe + 'asCommonsSpeaker', 'true', g, NS.xsd + 'boolean');
    if (r.is_standing_as_independent)
      addLit(s, NS.pe + 'asIndependent', 'true', g, NS.xsd + 'boolean');
    if (r.is_notional)
      addLit(s, NS.pe + 'isNotional', 'true', g, NS.xsd + 'boolean');
    if (r.election_id)
      addIri(s, NS.pe + 'inElection', iri('Election', r.election_id), g);

    // Result reified as a blank node attached via pe:resultOfCandidacy,
    // typed pe:WinningCandidacyResult when applicable.
    const bn = `_:result_${r.id}`;
    const resultClass = r.is_winning_candidacy
      ? NS.pe + 'WinningCandidacyResult'
      : NS.pe + 'CandidacyResult';
    addBNode(bn, NS.rdf + 'type', resultClass, g);
    addBNode(bn, NS.pe + 'resultOfCandidacy', s, g);
    if (r.result_position != null)
      addBNode(bn, NS.pe + 'resultPosition', `"${r.result_position}"^^<${NS.xsd}integer>`, g, false);
    if (r.vote_count != null)
      addBNode(bn, NS.pe + 'voteCount', `"${r.vote_count}"^^<${NS.xsd}integer>`, g, false);
    if (r.vote_share != null)
      addBNode(bn, NS.pe + 'voteShare', `"${r.vote_share}"^^<${NS.xsd}decimal>`, g, false);
    if (r.vote_change != null)
      addBNode(bn, NS.pe + 'voteChange', `"${r.vote_change}"^^<${NS.xsd}decimal>`, g, false);

    // Person bridge — when the candidacy is a current/former MP,
    // surface the MNIS / Members API id via parl:memberId on a
    // reified pe:Person blank node, with an owl:sameAs to the
    // canonical Members API URL.
    if (r.mnis_id) {
      const personBn = `_:person_mnis_${r.mnis_id}`;
      addBNode(personBn, NS.rdf + 'type', NS.pe + 'Person', g);
      addBNode(personBn, NS.parl + 'memberId',
               `"${r.mnis_id}"^^<${NS.xsd}integer>`, g, false);
      addBNode(personBn, NS.owl + 'sameAs',
               `https://members-api.parliament.uk/api/Members/${r.mnis_id}`, g);
      addBNodeObj(s, NS.pe + 'isOfPerson', personBn, g);
    }
  }
  process.stderr.write(`  candidacies:                 ${rows.length}\n`);
}

// === 15. certifications → pe:Certification ===
{
  const g = `${GRAPH_BASE}/certifications`;
  const rows = await sql(`SELECT id, candidacy_id, political_party_id, adjunct_to_certification_id
                          FROM certifications${LIMIT}`);
  for (const r of rows) {
    const s = iri('Certification', r.id);
    addIri(s, NS.rdf + 'type', NS.pe + 'Certification', g);
    if (r.candidacy_id)
      addIri(s, NS.pe + 'certificationOf', iri('Candidacy', r.candidacy_id), g);
    if (r.political_party_id)
      addIri(s, NS.pe + 'issuedBy', iri('PoliticalParty', r.political_party_id), g);
    if (r.adjunct_to_certification_id)
      addIri(s, NS.pe + 'adjunctTo', iri('Certification', r.adjunct_to_certification_id), g);
  }
  process.stderr.write(`  certifications:              ${rows.length}\n`);
}

// === 16. members bridge (named) ===
// Same person info as the blank nodes attached in §14, but with
// a canonical IRI keyed on mnis_id. Useful when a consumer wants
// the bridge as a standalone graph without unpacking candidacies.
// Skips rows that have no mnis_id (rare; data-quality entries).
{
  const g = `${GRAPH_BASE}/members-bridge`;
  const rows = await sql(`SELECT id, mnis_id, given_name, family_name
                          FROM   members
                          WHERE  mnis_id IS NOT NULL${LIMIT}`);
  for (const r of rows) {
    const s = `${BASE_IRI}/Person/mnis-${r.mnis_id}`;
    addIri(s, NS.rdf + 'type', NS.pe + 'Person', g);
    addLit(s, NS.parl + 'memberId', String(r.mnis_id), g, NS.xsd + 'integer');
    addIri(s, NS.owl + 'sameAs',
           `https://members-api.parliament.uk/api/Members/${r.mnis_id}`, g);
    if (r.given_name)  addLit(s, NS.pe + 'candidateGivenName',  r.given_name,  g);
    if (r.family_name) addLit(s, NS.pe + 'candidateFamilyName', r.family_name, g);
  }
  process.stderr.write(`  members (bridge):            ${rows.length}\n`);
}

// === Provenance graph ===
{
  const g = `${GRAPH_BASE}/provenance`;
  const now = new Date().toISOString();
  const build = `https://forgetmenot.local/psephology/build/${now.replace(/[:.]/g, '-')}`;
  addIri(build, NS.rdf + 'type', NS.prov + 'Activity', g);
  addLit(build, NS.prov + 'startedAtTime', now, g, NS.xsd + 'dateTime');
  addLit(build, NS.prov + 'endedAtTime',   now, g, NS.xsd + 'dateTime');
  addLit(build, NS.rdfs + 'label', 'forgetmenot psephology-to-rdf build', g);
  addLit(build, NS.dcterms + 'source',
         `https://github.com/ukparliament/psephology/blob/main/db/dumps/${dumpDate}.sql`, g);

  // Try to capture git HEAD.
  try {
    const { stdout } = await exec('git', ['rev-parse', '--short=12', 'HEAD'], { timeoutMs: 5000 });
    addLit(build, NS.fm + 'gitRevision', stdout.trim(), g);
  } catch { /* no git */ }

  // Describe each source graph we just wrote.
  for (const [graph, count] of quadsPerGraph) {
    if (graph === g) continue; // describing self comes last
    addIri(graph, NS.rdf + 'type', NS.void + 'Dataset', g);
    addLit(graph, NS.void + 'triples', String(count), g, NS.xsd + 'integer');
    addIri(graph, NS.prov + 'wasGeneratedBy', build, g);
  }
}

// Close the stream and gzip.
stream.end();
await new Promise(r => stream.once('close', r));
const sz = statSync(outPath).size;
process.stderr.write(`\nWrote ${outPath}\n  ${nQuads.toLocaleString()} quads, ${(sz / 1024 / 1024).toFixed(2)} MB.\n`);

// Gzip.
const gzPath = outPath + '.gz';
await pipeline(createReadStream(outPath), createGzip({ level: 9 }), createWriteStream(gzPath));
const gzSz = statSync(gzPath).size;
process.stderr.write(`Wrote ${gzPath}\n  ${(gzSz / 1024 / 1024).toFixed(2)} MB (${(gzSz * 100 / sz).toFixed(1)}% of uncompressed).\n`);

// If --keep-uncompressed not set, leave the uncompressed file iff
// it's small enough that committing it makes sense (< 10 MB).
const KEEP_PLAIN_LIMIT = 10 * 1024 * 1024;
if (!opt.keepUncompressed && sz > KEEP_PLAIN_LIMIT) {
  unlinkSync(outPath);
  process.stderr.write(`Uncompressed file removed (> 10 MB, see *.gz).\n`);
}
