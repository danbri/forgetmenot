#!/usr/bin/env node
// fold-thesaurus-altlabels.mjs — enrich the republished Parliament Thesaurus
// SKOS so it embeds well, without losing any IRIs.
//
// THE PROBLEM (see skills/parliament-thesaurus/reference.md → "Synonym model"):
// The source LDA `terms` dataset models non-preferred / "used-for" lead-in terms
// as SEPARATE term resources (parl:isPreferred=false), each linked to its
// preferred term by a bidirectional skos:exactMatch in the `mappings` graph.
// Passed through verbatim, that leaves every preferred concept with a BARE
// prefLabel and no synonyms, and dilutes any embedding corpus with ~49k
// single-label "concept" stubs. (skosdex embeds one vector per skos:Concept.)
//
// THE FIX (idempotent, quad-preserving):
//   1. For each non-preferred term N with skos:exactMatch -> preferred term P,
//      add  `P skos:altLabel <N's prefLabel>`  in the core graph.
//   2. Retype each non-preferred term from skos:Concept to parl:NonPreferredTerm
//      so consumers that dereference its IRI still get all its data, but
//      skosdex's "index skos:Concept only" pass skips it (no more stub vectors).
//   Everything else (hierarchy, notation, exactMatch, isPreferred, attributes)
//   is left untouched. Genuine preferred<->preferred exactMatches are NOT folded.
//
// Usage:
//   node scripts/fold-thesaurus-altlabels.mjs <in.nq[.gz]> [--out <out.nq[.gz]>] [--summary <f.json>]
// Default --out is the input path (rewrite in place). Reads/writes gzip when the
// path ends in .gz.

import fs from 'node:fs';
import zlib from 'node:zlib';

const SKOS    = 'http://www.w3.org/2004/02/skos/core#';
const RDF     = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const PARL    = 'http://data.parliament.uk/schema/parl#';
const CORE_G  = '<https://lda.data.parliament.uk/graph/legacy-terms/core>';

const P_PREF      = `<${SKOS}prefLabel>`;
const P_TYPE      = `<${RDF}type>`;
const O_CONCEPT   = `<${SKOS}Concept>`;
const O_NONPREF   = `<${PARL}NonPreferredTerm>`;
const P_ISPREF    = `<${PARL}isPreferred>`;
const P_EXACT     = `<${SKOS}exactMatch>`;
const P_ALT       = `<${SKOS}altLabel>`;

function readLines(path) {
  let buf = fs.readFileSync(path);
  if (path.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  return buf.toString('utf8').split('\n');
}
function writeLines(path, lines) {
  let out = Buffer.from(lines.join('\n'), 'utf8');
  if (path.endsWith('.gz')) out = zlib.gzipSync(out, { level: 9 });
  fs.writeFileSync(path, out);
}

// Split an N-Quads line into [subject, predicate, objectAndGraph...]. Subjects
// and predicates here are always IRIs (no blank nodes in this dataset), so a
// simple whitespace split on the first two tokens is exact and literal-safe.
function parts(line) {
  const s = line.indexOf(' ');
  const p = line.indexOf(' ', s + 1);
  if (s < 0 || p < 0) return null;
  return [line.slice(0, s), line.slice(s + 1, p), line.slice(p + 1)];
}

const args = process.argv.slice(2);
const inPath = args[0];
if (!inPath) { console.error('usage: fold-thesaurus-altlabels.mjs <in.nq[.gz]> [--out f] [--summary f]'); process.exit(2); }
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : inPath;
const sumPath = args.includes('--summary') ? args[args.indexOf('--summary') + 1] : null;

const lines = readLines(inPath);

// ---- Pass 1: index isPreferred, prefLabel literal, exactMatch edges ----
const isPref   = new Map();   // subjIRI -> true|false
const prefLit  = new Map();   // subjIRI -> object literal (e.g. "Foo"@en)
const exact    = [];          // [subjIRI, objIRI]
const existingAlt = new Set();// `${subj}\t${literal}` already present (idempotency)
for (const line of lines) {
  if (!line) continue;
  const t = parts(line);
  if (!t) continue;
  const [s, p, rest] = t;
  if (p === P_ISPREF) {
    isPref.set(s, rest.startsWith('"true"'));
  } else if (p === P_PREF) {
    // rest = `"label"@en <graph> .` — take everything up to the graph token
    const lt = rest.lastIndexOf(' <');
    prefLit.set(s, rest.slice(0, lt).trim());
  } else if (p === P_EXACT) {
    const m = rest.match(/^(<[^>]+>)/);
    if (m) exact.push([s, m[1]]);
  } else if (p === P_ALT) {
    const lt = rest.lastIndexOf(' <');
    existingAlt.add(`${s}\t${rest.slice(0, lt).trim()}`);
  }
}

// ---- Compute folds: non-preferred -> altLabel on its preferred target ----
const altByPref = new Map();  // prefIRI -> Set(literal)
let folded = 0;
for (const [s, o] of exact) {
  if (isPref.get(s) === false && isPref.get(o) === true) {
    const lit = prefLit.get(s);
    if (!lit) continue;
    if (existingAlt.has(`${o}\t${lit}`)) continue;   // already folded — idempotent
    if (!altByPref.has(o)) altByPref.set(o, new Set());
    altByPref.get(o).add(lit);
    folded++;
  }
}
const nonPref = new Set([...isPref].filter(([, v]) => v === false).map(([k]) => k));

// ---- Pass 2: rewrite type triples for non-preferred terms ----
let retyped = 0;
const out = new Array(lines.length);
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) { out[i] = line; continue; }
  const t = parts(line);
  if (t && t[1] === P_TYPE && t[2].startsWith(O_CONCEPT) && nonPref.has(t[0])) {
    out[i] = `${t[0]} ${P_TYPE} ${O_NONPREF} ${CORE_G} .`;
    retyped++;
  } else {
    out[i] = line;
  }
}

// ---- Append the new altLabel quads (core graph) ----
let added = 0;
for (const [pref, lits] of altByPref) {
  for (const lit of lits) {
    out.push(`${pref} ${P_ALT} ${lit} ${CORE_G} .`);
    added++;
  }
}

writeLines(outPath, out);

const summary = {
  input: inPath,
  output: outPath,
  nonPreferredTerms: nonPref.size,
  nonPreferredRetyped: retyped,
  exactMatchFolds: folded,
  altLabelsAdded: added,
  preferredConceptsEnriched: altByPref.size,
};
if (sumPath) fs.writeFileSync(sumPath, JSON.stringify(summary, null, 2));
console.error('fold-thesaurus-altlabels:', JSON.stringify(summary));
