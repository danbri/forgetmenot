#!/usr/bin/env node
// scripts/psephology-to-rdf-sketch.mjs
//
// First-pass RDFification of the psephology Postgres database.
// Walks TWO tables end-to-end as a proof-of-mapping against the
// Parliament election ontology
// (https://ukparliament.github.io/ontologies/election/) so we
// know the schema in skills/psephology/reference.md is wirable:
//
//   - public.general_elections   → pe:GeneralElection
//   - public.political_parties   → pe:PoliticalParty
//
// The full RDFification (all 17 mapped tables, MNIS bridge,
// SKOS-ified reference tables, identity-graph integration) is
// deferred — see skills/psephology/reference.md for the full
// mapping plan.
//
// Output: third_party/data/psephology/sketch.nq
//
// Run:  npm run psephology:rdf:sketch
// Pre:  the database must be up (npm run psephology:up).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'third_party/data/psephology');
mkdirSync(outDir, { recursive: true });

// Namespaces — `pe:` is Parliament's election ontology (external).
// `fm:` is our own vocab. `parl:` carries Parliament's stable IDs
// per docs/vocab.md. `prov:` / `void:` for provenance.
const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
  xsd:    'http://www.w3.org/2001/XMLSchema#',
  prov:   'http://www.w3.org/ns/prov#',
  void:   'http://rdfs.org/ns/void#',
  dcterms:'http://purl.org/dc/terms/',
  pe:     'http://parliament.uk/ontologies/election/',
  fm:     'https://forgetmenot.local/vocab#',
  parl:   'https://id.parliament.uk/schema/',
};

const G = {
  ge:    'https://forgetmenot.local/graph/psephology/general-elections',
  party: 'https://forgetmenot.local/graph/psephology/political-parties',
  prov:  'https://forgetmenot.local/graph/psephology/provenance',
};

// IRI minting strategy from skills/psephology/reference.md.
const iri = (cls, id) => `https://forgetmenot.local/election/${cls}/${id}`;

// --- N-Quads helpers (same pattern as scripts/build-identity-graph.mjs) ---
const quads = [];
function nqStr(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    + '"';
}
const wrapIri = u => `<${u}>`;
function add(s, p, o, g) { quads.push(`${s} ${p} ${o} ${wrapIri(g)} .`); }
function addIri(s, p, o, g) { add(wrapIri(s), wrapIri(p), wrapIri(o), g); }
function addLit(s, p, lit, g, datatype) {
  const o = datatype ? `${nqStr(lit)}^^${wrapIri(datatype)}` : nqStr(lit);
  add(wrapIri(s), wrapIri(p), o, g);
}

// Run a SQL query and return JSON rows. Reuses the same auth
// path as lib/facilities/psephology.mjs: prefers sudo + local
// socket, falls back to TCP.
async function sql(query) {
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
                   FROM (${query.trim().replace(/;\s*$/, '')}) t;`;
  let cmd = 'sudo', args = ['-n', '-u', 'postgres', 'psql', '-d', 'psephology', '-tAc', wrapped];
  try { await exec('sudo', ['-n', 'true'], { timeout: 2000 }); }
  catch { cmd = 'psql'; args = ['-h', 'localhost', '-U', 'postgres', '-d', 'psephology', '-tAc', wrapped]; }
  const { stdout } = await exec(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout.trim() || '[]');
}

// --- 1. general_elections → pe:GeneralElection ---
const ges = await sql('SELECT id, polling_on, COALESCE(is_notional, false) AS is_notional FROM general_elections');
for (const r of ges) {
  const s = iri('GeneralElection', r.id);
  addIri(s, NS.rdf + 'type', NS.pe + 'GeneralElection', G.ge);
  addLit(s, NS.pe + 'generalElectionPollingOn', r.polling_on,
         G.ge, NS.xsd + 'date');
  if (r.is_notional) {
    addLit(s, NS.pe + 'isNotional', 'true', G.ge, NS.xsd + 'boolean');
  }
}
process.stderr.write(`Emitted ${ges.length} pe:GeneralElection instances.\n`);

// --- 2. political_parties → pe:PoliticalParty ---
const parties = await sql('SELECT id, name, abbreviation FROM political_parties ORDER BY id');
for (const r of parties) {
  const s = iri('PoliticalParty', r.id);
  addIri(s, NS.rdf + 'type', NS.pe + 'PoliticalParty', G.party);
  if (r.name)         addLit(s, NS.rdfs + 'label',  r.name,         G.party);
  if (r.abbreviation) addLit(s, NS.fm + 'abbreviation', r.abbreviation, G.party);
}
process.stderr.write(`Emitted ${parties.length} pe:PoliticalParty instances.\n`);

// --- 3. Provenance (sketch) ---
const now = new Date().toISOString();
const buildIri = `https://forgetmenot.local/psephology/build/${now.replace(/[:.]/g, '-')}`;
const dumpDate = '2026-05-23';
add(wrapIri(buildIri), wrapIri(NS.rdf + 'type'), wrapIri(NS.prov + 'Activity'), G.prov);
addLit(buildIri, NS.prov + 'generatedAtTime', now, G.prov, NS.xsd + 'dateTime');
addLit(buildIri, NS.rdfs + 'label',
       'forgetmenot psephology-to-rdf sketch (partial: general_elections + political_parties only)',
       G.prov);
addLit(buildIri, NS.dcterms + 'source',
       `https://github.com/ukparliament/psephology/blob/main/db/dumps/${dumpDate}.sql`,
       G.prov);

for (const [name, g, n] of [
  ['general-elections', G.ge,    ges.length],
  ['political-parties', G.party, parties.length],
]) {
  addIri(g, NS.rdf + 'type', NS.void + 'Dataset', G.prov);
  addLit(g, NS.dcterms + 'title', `Psephology — ${name}`, G.prov);
  addLit(g, NS.void + 'triples', String(quadsInGraph(g)), G.prov,
         NS.xsd + 'integer');
  addIri(g, NS.prov + 'wasGeneratedBy', buildIri, G.prov);
}

function quadsInGraph(g) {
  const tag = ` ${wrapIri(g)} .`;
  return quads.filter(q => q.endsWith(tag)).length;
}

// --- Emit ---
const outPath = resolve(outDir, 'sketch.nq');
writeFileSync(outPath, quads.join('\n') + '\n');
process.stderr.write(`Wrote ${outPath} (${quads.length} quads).\n`);
process.stderr.write(`Sample (first 5 quads):\n${quads.slice(0, 5).map(q => '  ' + q).join('\n')}\n`);
