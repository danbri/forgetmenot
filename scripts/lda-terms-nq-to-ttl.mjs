#!/usr/bin/env node
// Convert the Parliament Thesaurus N-Quads dump (produced by
// skills/parliament-thesaurus/dump_terms.py) into a single merged
// Turtle file for download. The .nq.gz splits triples across four
// named graphs purely by predicate class (core / hierarchy / related /
// mappings); a thesaurus *dump* is more useful as one graph, so we drop
// the graph term and emit prefixed, subject-grouped Turtle.
//
// Dependency-free (no rdflib/raptor in the runtime). The crawler's
// output is well-formed N-Quads, so a line parser is sufficient.
//
// Usage:
//   node scripts/lda-terms-nq-to-ttl.mjs \
//     [--in  third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz] \
//     [--summary third_party/data/parliament-lda-terms/parliament-lda-terms-summary.json] \
//     [--out third_party/data/parliament-lda-terms/parliament-lda-terms.ttl] \
//     [--also demos/parliament-live/web/kgx/parliament-lda-terms.ttl]
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const DEFDIR = `${ROOT}/third_party/data/parliament-lda-terms`;
const IN = resolve(ROOT, arg('in', `${DEFDIR}/parliament-lda-terms.nq.gz`));
const SUMMARY = resolve(ROOT, arg('summary', `${DEFDIR}/parliament-lda-terms-summary.json`));
const OUT = resolve(ROOT, arg('out', `${DEFDIR}/parliament-lda-terms.ttl`));
const ALSO = resolve(ROOT, arg('also', `${ROOT}/demos/parliament-live/web/kgx/parliament-lda-terms.ttl`));

const PREFIXES = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  parl: 'http://data.parliament.uk/schema/parl#',
  term: 'http://data.parliament.uk/terms/',
};
// A Turtle PN_LOCAL may start with a digit; term ids are bare integers,
// which qualify. Only abbreviate when the local part is PN_LOCAL-safe.
const PN_LOCAL = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
function qname(iri) {
  for (const [pfx, ns] of Object.entries(PREFIXES)) {
    if (iri.startsWith(ns)) {
      const local = iri.slice(ns.length);
      if (PN_LOCAL.test(local)) return `${pfx}:${local}`;
    }
  }
  return `<${iri}>`;
}

// Normalisation applied on the way out (the harvested LDA RDF carries
// neither language tags on labels nor rdf:type on the concepts):
//   - SKOS lexical labels (prefLabel/altLabel) are language-tagged. The
//     thesaurus is English except where a label is inherently foreign;
//     LANG_OVERRIDE pins those by term id (default 'en').
//   - notation / parl: attributes are left as-is (not lexical labels).
const LABEL_PREDS = new Set(['skos:prefLabel', 'skos:altLabel']);
const DEFAULT_LANG = 'en';
const LANG_OVERRIDE = {
  // 'Aciéries réunies de Burbach-Eich-Dudelange' is a French proper name.
  'term:436521': 'fr',
};

// Parse one N-Quad line into { s, p, o } where s/p are IRI qnames and o
// is already Turtle-serialized (IRI qname or literal). Returns null for
// blanks/comments.
const IRI = '<([^>]*)>';
const LIT = '"((?:[^"\\\\]|\\\\.)*)"(?:\\^\\^<([^>]*)>|@([A-Za-z-]+))?';
const LINE = new RegExp(`^\\s*${IRI}\\s+${IRI}\\s+(?:${IRI}|${LIT})\\s+<[^>]*>\\s*\\.\\s*$`);
function parse(line) {
  const m = LINE.exec(line);
  if (!m) return null;
  const [, s, p, oIri, lex, dt, lang] = m;
  const sq = qname(s), pq = qname(p);
  let o;
  if (oIri !== undefined) {
    o = qname(oIri);
  } else {
    const lit = `"${lex}"`; // lex keeps its existing N-Triples escaping
    if (lang) o = `${lit}@${lang}`;                            // respect any pre-tagged label
    else if (LABEL_PREDS.has(pq)) o = `${lit}@${LANG_OVERRIDE[sq] || DEFAULT_LANG}`;
    else if (dt && dt !== PREFIXES.xsd + 'string') o = `${lit}^^${qname(dt)}`;
    else o = lit;
  }
  return { s: sq, p: pq, o };
}

const lines = gunzipSync(readFileSync(IN)).toString('utf8').split('\n');
const bySubject = new Map(); // s -> Map(p -> Set(o))  (preserve grouping, dedupe)
let triples = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  const t = parse(line);
  if (!t) { process.stderr.write(`skip unparsed: ${line.slice(0, 80)}\n`); continue; }
  if (!bySubject.has(t.s)) bySubject.set(t.s, new Map());
  const preds = bySubject.get(t.s);
  if (!preds.has(t.p)) preds.set(t.p, new Set());
  preds.get(t.p).add(t.o);
}

// Every harvested subject is a thesaurus term in the term: namespace, but
// the LDA RDF omits rdf:type — assert skos:Concept on each. All SKOS
// relation targets (broader/related/exactMatch/...) are themselves
// subjects here, so this types every referenced concept too.
const TERM_NS = 'term:';
let conceptsTyped = 0;
for (const [s, preds] of bySubject) {
  if (!s.startsWith(TERM_NS)) continue;
  if (!preds.has('rdf:type')) preds.set('rdf:type', new Set());
  if (!preds.get('rdf:type').has('skos:Concept')) { preds.get('rdf:type').add('skos:Concept'); conceptsTyped++; }
}

// Order predicates sensibly: type, labels, notation, hierarchy, related, mappings, rest.
const PRED_ORDER = ['rdf:type', 'skos:prefLabel', 'skos:altLabel', 'skos:notation',
  'skos:broader', 'skos:narrower', 'skos:topConceptOf', 'skos:inScheme',
  'skos:related', 'skos:exactMatch', 'skos:closeMatch'];
const predRank = (p) => { const i = PRED_ORDER.indexOf(p); return i === -1 ? PRED_ORDER.length : i; };

let summary = {};
try { summary = JSON.parse(readFileSync(SUMMARY, 'utf8')); } catch { /* optional */ }
const partial = Array.isArray(summary.pages_failed) && summary.pages_failed.length > 0;

let out = '';
out += `# UK Parliament Thesaurus — Turtle dump\n`;
out += `# Source: ${summary.source || 'https://lda.data.parliament.uk/terms'} (legacy Epimorphics/Elda Linked Data API)\n`;
out += `# Converted from ${IN.replace(ROOT + '/', '')} by scripts/lda-terms-nq-to-ttl.mjs\n`;
out += `# Generated: ${new Date().toISOString()}\n`;
out += `# Licence: Open Parliament Licence v3.0 (Crown copyright)\n`;
out += `# Term subjects: ${summary.term_subject_count ?? bySubject.size}; triples: see below.\n`;
out += `# Normalised by the exporter: every concept typed skos:Concept; prefLabel/altLabel\n`;
out += `#   language-tagged @${DEFAULT_LANG} (overrides: ${Object.entries(LANG_OVERRIDE).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}).\n`;
if (partial) {
  out += `#\n# ⚠ PARTIAL: the source crawl did not complete — Elda deep-paging failed on\n`;
  out += `#   pages [${summary.pages_failed.join(', ')}] (offset >= ~${(Math.min(...summary.pages_failed)) * (summary.page_size || 50)}),\n`;
  out += `#   so terms beyond that offset are MISSING. Re-run dump_terms.py when the\n`;
  out += `#   endpoint is reachable to produce a complete dump.\n`;
}
out += `#\n`;
for (const [pfx, ns] of Object.entries(PREFIXES)) out += `@prefix ${pfx}: <${ns}> .\n`;
out += `\n`;

const subjects = [...bySubject.keys()].sort();
for (const s of subjects) {
  const preds = [...bySubject.get(s).entries()]
    .sort((a, b) => predRank(a[0]) - predRank(b[0]) || a[0].localeCompare(b[0]));
  const parts = preds.map(([p, objs]) => `    ${p} ${[...objs].sort().join(', ')}`);
  out += `${s}\n${parts.join(' ;\n')} .\n\n`;
  triples += preds.reduce((n, [, objs]) => n + objs.size, 0);
}

writeFileSync(OUT, out);
writeFileSync(ALSO, out);
console.log(JSON.stringify({
  in: IN.replace(ROOT + '/', ''),
  out: OUT.replace(ROOT + '/', ''),
  served: ALSO.replace(ROOT + '/', ''),
  subjects: bySubject.size,
  conceptsTyped,
  triples,
  partial,
}, null, 1));
