#!/usr/bin/env node
// scripts/build-parl-current.mjs
//
// Fetch every current MP + peer from the UK Parliament Members API and
// emit DDP-shaped N-Quads to
//   third_party/data/parl-current/parl-current.nq.gz
//
// Rationale: the canonical UK Parliament SPARQL endpoint
// (api.parliament.uk/sparql, the "DDP store") is currently a full
// Parliament behind — it still treats the 2019 cohort as sitting with
// no end-dates written. The Members API is the live source of truth.
// This script projects the Members API's current-state JSON into the
// same `schema:` (https://id.parliament.uk/schema/) vocabulary DDP
// uses, so existing SPARQL patterns over Person / Member / SeatIncumbency
// / ConstituencyGroup / PartyMembership / Party keep working — they
// just resolve against fresh data when pointed at our bundled Oxigraph.
//
// Output IRI strategy:
//   - Persons, incumbencies, seats, constituency groups, party
//     memberships, parties:  https://forgetmenot.local/parl-current/…
//     (forge namespace — clear that we minted these, not DDP).
//   - The two House IRIs:    https://id.parliament.uk/1AFu55Hs (Commons),
//                            https://id.parliament.uk/WkUWUBMx (Lords)
//     (real DDP IRIs — so cross-store queries that key on these
//     match).
//   - owl:sameAs from each Person to its Members API canonical URI
//     (members-api.parliament.uk/api/Members/<id>).
//
// Single data graph + provenance graph:
//   <https://forgetmenot.local/graph/parl-current/<isoDate>>
//   <https://forgetmenot.local/graph/parl-current/provenance>
//
// Usage:
//   node scripts/build-parl-current.mjs
//
// Network policy: this script talks to members-api.parliament.uk
// directly (no proxy). It's a build-time crawler, not the web app.

import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here    = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir  = resolve(repoRoot, 'third_party/data/parl-current');
const outFile = resolve(outDir, 'parl-current.nq.gz');

const NS = {
  schema:  'https://id.parliament.uk/schema/',
  rdf:     'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:    'http://www.w3.org/2000/01/rdf-schema#',
  owl:     'http://www.w3.org/2002/07/owl#',
  xsd:     'http://www.w3.org/2001/XMLSchema#',
  prov:    'http://www.w3.org/ns/prov#',
  void:    'http://rdfs.org/ns/void#',
  dcterms: 'http://purl.org/dc/terms/',
  fmn:     'https://forgetmenot.local/vocab/parl-current/',
};

const HOUSE = {
  // Real DDP IRIs — re-used so cross-store joins on the House IRI work.
  commons: 'https://id.parliament.uk/1AFu55Hs',
  lords:   'https://id.parliament.uk/WkUWUBMx',
};

const TODAY    = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
const DATA_NG  = `https://forgetmenot.local/graph/parl-current/${TODAY}`;
const PROV_NG  = 'https://forgetmenot.local/graph/parl-current/provenance';
const BUILD_IRI = `https://forgetmenot.local/parl-current/build/${TODAY}T${
  new Date().toISOString().slice(11, 19).replace(/:/g, '-')
}Z`;

// ---- forge URI minters ----------------------------------------------------
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}
const URI = {
  person:      (mnis) => `https://forgetmenot.local/parl-current/person/mnis-${mnis}`,
  commonsInc:  (mnis) => `https://forgetmenot.local/parl-current/seat-incumbency/mnis-${mnis}`,
  lordsInc:    (mnis) => `https://forgetmenot.local/parl-current/peerage-incumbency/mnis-${mnis}`,
  houseSeat:   (cg)   => `https://forgetmenot.local/parl-current/house-seat/${slugify(cg)}`,
  cg:          (cg)   => `https://forgetmenot.local/parl-current/constituency-group/${slugify(cg)}`,
  party:       (p)    => `https://forgetmenot.local/parl-current/party/${slugify(p)}`,
  partyMem:    (mnis) => `https://forgetmenot.local/parl-current/party-membership/mnis-${mnis}`,
  membersApi:  (mnis) => `https://members-api.parliament.uk/api/Members/${mnis}`,
};

// ---- N-Quads writer (string-builder, not streaming — file is small) -------
const quads = [];
function escLit(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g,  '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
function I(u)  { return `<${u}>`; }
function L(v)  { return `"${escLit(v)}"`; }
function LD(v, dt) { return `"${escLit(v)}"^^${I(dt)}`; }
function emit(s, p, o, g = DATA_NG) {
  quads.push(`${I(s)} ${I(p)} ${o} ${I(g)} .`);
}
function emitI(s, p, o, g = DATA_NG)        { emit(s, p, I(o), g); }
function emitL(s, p, v, g = DATA_NG)         { emit(s, p, L(v), g); }
function emitInt(s, p, v, g = DATA_NG)       { emit(s, p, LD(v, NS.xsd + 'integer'), g); }
function emitDate(s, p, isoDate, g = DATA_NG){ emit(s, p, LD(isoDate, NS.xsd + 'date'), g); }

// ---- Members API paged fetch ----------------------------------------------
async function fetchAll(house) {
  const out = [];
  let skip = 0;
  while (true) {
    const url = `https://members-api.parliament.uk/api/Members/Search?House=${house}&IsCurrentMember=true&skip=${skip}&take=20`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Members API ${house} skip=${skip}: HTTP ${r.status}`);
    const j = await r.json();
    const items = j.items || [];
    if (!items.length) break;
    for (const it of items) out.push(it.value);
    skip += 20;
    if (skip >= (j.totalResults || 0)) break;
  }
  return out;
}

// ---- Person + common emission --------------------------------------------
function emitPersonCore(mp) {
  const p = URI.person(mp.id);
  for (const t of [
    NS.schema + 'Person',
    NS.schema + 'Member',
    NS.schema + 'MnisMember',
    NS.schema + 'PartyMember',
    NS.schema + 'NamedThing',
    NS.schema + 'ContactableThing',
  ]) emitI(p, NS.rdf + 'type', t);
  emitInt(p, NS.schema + 'mnisId',     String(mp.id));
  emitInt(p, NS.schema + 'memberId',   String(mp.id));
  emitL  (p, NS.schema + 'name',       mp.nameDisplayAs || '');
  if (mp.nameFullTitle) emitL(p, NS.schema + 'memberFullTitle', mp.nameFullTitle);
  if (mp.nameListAs)    emitL(p, NS.schema + 'memberListAs',    mp.nameListAs);
  if (mp.gender)        emitL(p, NS.schema + 'gender',          mp.gender);
  // Name split — best-effort: split nameDisplayAs into given + family.
  const nm = String(mp.nameDisplayAs || '').replace(/\b(?:Sir|Dame|Rt Hon|Hon|Dr|The|Lord|Baroness|Baron|Lady)\b\.?\s*/gi, '').trim();
  const bits = nm.split(/\s+/);
  if (bits.length >= 2) {
    emitL(p, NS.schema + 'personGivenName',  bits[0]);
    emitL(p, NS.schema + 'personFamilyName', bits.slice(1).join(' '));
  }
  emitI(p, NS.owl + 'sameAs', URI.membersApi(mp.id));
  return p;
}

function emitParty(party) {
  if (!party?.name) return null;
  const pUri = URI.party(party.name);
  emitI(pUri, NS.rdf + 'type', NS.schema + 'Party');
  emitL(pUri, NS.schema + 'partyName', party.name);
  if (party.abbreviation) emitL(pUri, NS.schema + 'partyAbbreviation', party.abbreviation);
  if (party.backgroundColour) emitL(pUri, NS.fmn + 'partyColour', party.backgroundColour);
  if (party.id) emitInt(pUri, NS.fmn + 'mnisPartyId', String(party.id));
  return pUri;
}

function emitPartyMembership(personUri, mnis, partyUri, startDateIso) {
  if (!partyUri) return;
  const pm = URI.partyMem(mnis);
  emitI(pm, NS.rdf + 'type', NS.schema + 'PartyMembership');
  emitI(pm, NS.schema + 'partyMembershipHasParty',       partyUri);
  emitI(pm, NS.schema + 'partyMembershipHasPartyMember', personUri);
  if (startDateIso) emitDate(pm, NS.schema + 'partyMembershipStartDate', startDateIso);
  emitI(personUri, NS.schema + 'partyMemberHasPartyMembership', pm);
}

function emitCommonsIncumbency(mp) {
  const personUri = URI.person(mp.id);
  const inc       = URI.commonsInc(mp.id);
  const lhm       = mp.latestHouseMembership || {};
  const constName = lhm.membershipFrom;
  const startIso  = lhm.membershipStartDate ? lhm.membershipStartDate.slice(0, 10) : null;
  const cgUri     = URI.cg(constName);
  const hsUri     = URI.houseSeat(constName);

  for (const t of [
    NS.schema + 'SeatIncumbency',
    NS.schema + 'ParliamentaryIncumbency',
    NS.schema + 'Incumbency',
    NS.schema + 'TemporalThing',
  ]) emitI(inc, NS.rdf + 'type', t);
  emitI(inc, NS.schema + 'parliamentaryIncumbencyHasMember', personUri);
  emitI(inc, NS.schema + 'incumbencyHasPerson',              personUri);
  emitI(inc, NS.schema + 'seatIncumbencyHasHouseSeat',       hsUri);
  emitInt(inc, NS.schema + 'commonsSeatIncumbencyMnisId',    String(mp.id));
  if (startIso) {
    emitDate(inc, NS.schema + 'parliamentaryIncumbencyStartDate', startIso);
    emitDate(inc, NS.schema + 'startDate',                        startIso);
  }
  emitI(personUri, NS.schema + 'memberHasParliamentaryIncumbency', inc);

  emitI(hsUri, NS.rdf + 'type',                       NS.schema + 'HouseSeat');
  emitI(hsUri, NS.schema + 'houseSeatHasHouse',       HOUSE.commons);
  emitI(hsUri, NS.schema + 'houseSeatHasConstituencyGroup', cgUri);

  emitI(cgUri, NS.rdf + 'type',                       NS.schema + 'ConstituencyGroup');
  if (constName) emitL(cgUri, NS.schema + 'constituencyGroupName', constName);
}

function emitLordsIncumbency(mp) {
  const personUri = URI.person(mp.id);
  const inc       = URI.lordsInc(mp.id);
  const lhm       = mp.latestHouseMembership || {};
  const peerageTitle = lhm.membershipFrom;    // e.g. "Life peer", "Hereditary peer", "Bishop"
  const startIso  = lhm.membershipStartDate ? lhm.membershipStartDate.slice(0, 10) : null;

  for (const t of [
    NS.schema + 'LordsSeatIncumbency',
    NS.schema + 'SeatIncumbency',
    NS.schema + 'ParliamentaryIncumbency',
    NS.schema + 'Incumbency',
    NS.schema + 'TemporalThing',
  ]) emitI(inc, NS.rdf + 'type', t);
  emitI(inc, NS.schema + 'parliamentaryIncumbencyHasMember', personUri);
  emitI(inc, NS.schema + 'incumbencyHasPerson',              personUri);
  emitInt(inc, NS.schema + 'lordsSeatIncumbencyMnisId',      String(mp.id));
  if (peerageTitle) emitL(inc, NS.fmn + 'peerageTitle',       peerageTitle);
  if (startIso) {
    emitDate(inc, NS.schema + 'parliamentaryIncumbencyStartDate', startIso);
    emitDate(inc, NS.schema + 'startDate',                        startIso);
  }
  emitI(personUri, NS.schema + 'memberHasParliamentaryIncumbency', inc);
}

// ---- Provenance graph ------------------------------------------------------
function emitProvenance(stats) {
  const buildIri = BUILD_IRI;
  emitI(buildIri, NS.rdf + 'type', NS.prov + 'Activity', PROV_NG);
  emitL(buildIri, NS.dcterms + 'title',
        'forgetmenot parl-current build', PROV_NG);
  emitL(buildIri, NS.dcterms + 'description',
        'Synthesis of UK Parliament Members API current-state data into DDP-shaped N-Quads. ' +
        'Compensates for the api.parliament.uk/sparql endpoint being one Parliament behind ' +
        'as of mid-2026.', PROV_NG);
  emit(buildIri, NS.prov + 'startedAtTime',
       LD(new Date().toISOString(), NS.xsd + 'dateTime'), PROV_NG);
  emitI(buildIri, NS.prov + 'used',
        'https://members-api.parliament.uk/api/Members/Search', PROV_NG);

  // Describe the data graph
  emitI(DATA_NG, NS.rdf + 'type', NS.void + 'Dataset',  PROV_NG);
  emitI(DATA_NG, NS.rdf + 'type', NS.prov + 'Entity',   PROV_NG);
  emitL(DATA_NG, NS.dcterms + 'title',
        `UK Parliament current members (built ${TODAY})`, PROV_NG);
  emitL(DATA_NG, NS.dcterms + 'description',
        'Current Commons MPs + Lords peers in DDP schema, derived from ' +
        'members-api.parliament.uk. NOT canonical DDP — minted in the ' +
        'forgetmenot.local namespace; owl:sameAs links to Members API ' +
        'canonical URIs preserved on each Person.', PROV_NG);
  emitI(DATA_NG, NS.prov + 'wasGeneratedBy', buildIri, PROV_NG);
  emitI(DATA_NG, NS.dcterms + 'source',
        'https://members-api.parliament.uk/api/Members/Search', PROV_NG);
  emit(DATA_NG, NS.void + 'triples',
       LD(String(stats.quadsData), NS.xsd + 'integer'), PROV_NG);
  emit(DATA_NG, NS.fmn + 'commonsCount',
       LD(String(stats.commons), NS.xsd + 'integer'), PROV_NG);
  emit(DATA_NG, NS.fmn + 'lordsCount',
       LD(String(stats.lords), NS.xsd + 'integer'), PROV_NG);
}

// ---- main -----------------------------------------------------------------
console.error('[parl-current] fetching Commons …');
const commons = await fetchAll(1);
console.error(`[parl-current]   ${commons.length} current Commons`);

console.error('[parl-current] fetching Lords …');
const lords = await fetchAll(2);
console.error(`[parl-current]   ${lords.length} current Lords`);

// Dedupe by MNIS id (Cameron-style cases where a person is in both lists
// — Members API shouldn't double-list a current member, but defend).
const seen = new Set();
const all = [];
for (const mp of [...commons, ...lords]) {
  if (seen.has(mp.id)) continue;
  seen.add(mp.id);
  all.push(mp);
}

// Cache party IRIs so we don't re-emit Party triples per MP. Key on the
// minted URI (name-derived) not on party.id — Members API gives "Labour"
// and "Labour (Co-op)" the *same* id (15) but different display names.
const partyEmitted = new Set();
function partyFor(party) {
  if (!party?.name) return null;
  const pUri = URI.party(party.name);
  if (partyEmitted.has(pUri)) return pUri;
  partyEmitted.add(pUri);
  emitParty(party);
  return pUri;
}

let nCommons = 0, nLords = 0;
for (const mp of all) {
  const personUri = emitPersonCore(mp);
  const partyUri  = partyFor(mp.latestParty);
  const lhm = mp.latestHouseMembership || {};
  const startIso = lhm.membershipStartDate ? lhm.membershipStartDate.slice(0, 10) : null;
  if (partyUri) emitPartyMembership(personUri, mp.id, partyUri, startIso);
  if (lhm.house === 1) { emitCommonsIncumbency(mp); nCommons++; }
  else if (lhm.house === 2) { emitLordsIncumbency(mp); nLords++; }
}

emitProvenance({ commons: nCommons, lords: nLords, quadsData: quads.length });

const nq   = quads.join('\n') + '\n';
const gz   = gzipSync(nq);
writeFileSync(outFile, gz);
console.error(`[parl-current] wrote ${outFile}`);
console.error(`[parl-current]   ${quads.length.toLocaleString()} quads ` +
              `(${nq.length.toLocaleString()} bytes uncompressed, ` +
              `${gz.length.toLocaleString()} gzipped)`);
