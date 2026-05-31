#!/usr/bin/env node
// =============================================================================
// `kgx` — SPARQL-web-protocol client + ops dispatcher for the kgx demos
// (daisychain, pivcab, beads).  Sibling binary to `parl` — see ../bin/parl.mjs.
//
// Why a separate CLI?
//   The kgx demos issue SPARQL across several real engines (qlever-wikidata,
//   query.wikidata.org, fpkg's bundled Oxigraph, the Parliament SPARQL endpoint
//   via the fpkg proxy). Surfacing a CLI for those calls — and for the bits of
//   SPARQL hygiene that protect against silent breakage (AS-target collisions
//   per SPARQL 1.1 §18.2.4.4, soon shex / shacl / parser checks) — lets us
//   exercise the daisychain pipeline headlessly, record fixtures, and run
//   unit tests that pin "HK skyscrapers → architects gives these 18 QIDs".
//
//   This is a deliberately thin starting point. The next ops layer will read
//   REL_TEMPLATES + STARTERS extracted from the browser daisychain and let
//   you say `kgx chain hk-skyscrapers architects works_by`.
//
// Usage:
//   node bin/kgx.mjs --help
//   node bin/kgx.mjs engines
//   node bin/kgx.mjs validate -q '<sparql>'
//   node bin/kgx.mjs validate -f path/to/query.rq
//   node bin/kgx.mjs sparql --engine <id> -q '<sparql>' [--out json|hash|raw]
//   node bin/kgx.mjs sparql --engine <id> -f path/to/query.rq [--out json|hash|raw]
//
// Engines (resolved by id; pass --endpoint to override or use an unlisted host):
//   qlever-wikidata  https://qlever.dev/api/wikidata           strict
//   wikidata         https://query.wikidata.org/sparql         permissive
//   fpkg             https://fpkg.fly.dev/kgx/query            permissive (Oxigraph)
//   parl             https://fpkg.fly.dev/api/sparql           permissive (proxied to Parliament)
//   parl-direct      https://api.parliament.uk/sparql          permissive (no proxy / no caching)
//
// Exit codes: 0 ok, 1 user error (bad args / bad query), 2 upstream error.
// =============================================================================

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  assertNoAliasCollisions,
} from '../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';

const ENGINES = {
  'qlever-wikidata': { endpoint: 'https://qlever.dev/api/wikidata',  label: 'QLever ⇒ Wikidata',         strict: true  },
  'wikidata':        { endpoint: 'https://query.wikidata.org/sparql', label: 'Wikidata Query Service',    strict: false },
  'fpkg':            { endpoint: 'https://fpkg.fly.dev/kgx/query',    label: 'FPKG (Oxigraph, bundled)',  strict: false },
  'parl':            { endpoint: 'https://fpkg.fly.dev/api/sparql',   label: 'Parliament SPARQL (proxy)', strict: false },
  'parl-direct':     { endpoint: 'https://api.parliament.uk/sparql',  label: 'Parliament SPARQL (direct)', strict: false },
};

// -----------------------------------------------------------------------------
// arg parsing — tiny on purpose; one positional verb, then flags.
// -----------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--' || a === '--help' || a === '-h') { out.flags.help = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) { out.flags[key] = true; }
      else { out.flags[key] = next; i++; }
    } else if (a.startsWith('-') && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) { out.flags[key] = true; }
      else { out.flags[key] = next; i++; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function loadQuery(flags) {
  if (flags.q) return String(flags.q);
  if (flags.f) return readFileSync(String(flags.f), 'utf8');
  die('need a query: pass `-q "<sparql>"` or `-f path/to/query.rq`');
}

function die(msg, code = 1) {
  process.stderr.write(`kgx: ${msg}\n`);
  process.exit(code);
}

function printHelp() {
  process.stdout.write(`\
kgx — SPARQL web-protocol client + ops dispatcher

  kgx engines                          list known engine ids
  kgx validate -q '<sparql>'           run SPARQL hygiene checks; exit nonzero on violation
  kgx validate -f path/to/query.rq     same, from a file
  kgx sparql --engine <id> -q '...'    POST query to the engine and print results
  kgx sparql --engine <id> -f path     same, from a file
       [--out json|hash|raw]           json = pretty results.bindings (default),
                                       hash = sha256 of canonical bindings (for snapshot tests),
                                       raw  = full JSON response untouched
       [--endpoint <url>]              override the engine's endpoint
       [--method get|post]             default post for >2 KB queries, else get

engines:
`);
  for (const [id, e] of Object.entries(ENGINES)) {
    process.stdout.write(`  ${id.padEnd(18)} ${e.endpoint}${e.strict ? '  (strict)' : ''}\n`);
  }
}

// -----------------------------------------------------------------------------
// `kgx engines`
// -----------------------------------------------------------------------------
function cmdEngines() {
  const rows = Object.entries(ENGINES).map(([id, e]) => ({ id, ...e }));
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
}

// -----------------------------------------------------------------------------
// `kgx validate`
// -----------------------------------------------------------------------------
function cmdValidate(flags) {
  const q = loadQuery(flags);
  try {
    assertNoAliasCollisions(q, String(flags.label || 'sparql'));
    process.stdout.write(JSON.stringify({ ok: true, checks: ['assertNoAliasCollisions'] }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// `kgx sparql`
// -----------------------------------------------------------------------------
async function cmdSparql(flags) {
  const engineId = String(flags.engine || '');
  if (!engineId) die('--engine is required (try `kgx engines` for the list)');
  const engine = ENGINES[engineId];
  if (!engine && !flags.endpoint) die(`unknown engine "${engineId}" — pass --endpoint to use an ad-hoc URL`);

  const endpoint = String(flags.endpoint || engine.endpoint);
  const query = loadQuery(flags);

  // Hygiene gate: every query that leaves the CLI goes through the validator.
  // This is the point of the exercise — guarantee, not reviewer attention.
  try { assertNoAliasCollisions(query, engineId); }
  catch (e) { die(e.message, 1); }

  const out = String(flags.out || 'json');
  const method = String(flags.method || (query.length > 2048 ? 'post' : 'get')).toLowerCase();

  const t0 = performance.now();
  let res;
  if (method === 'post') {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/sparql-query',
        'Accept':        'application/sparql-results+json',
      },
      body: query,
    });
  } else {
    const u = new URL(endpoint);
    u.searchParams.set('query', query);
    res = await fetch(u.toString(), {
      headers: { 'Accept': 'application/sparql-results+json' },
    });
  }
  const ms = Math.round(performance.now() - t0);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    process.stdout.write(JSON.stringify({
      ok: false, engineId, endpoint, method, status: res.status, ms,
      error: text.slice(0, 4000),
    }, null, 2) + '\n');
    process.exit(2);
  }

  const json = await res.json();

  if (out === 'raw') {
    process.stdout.write(JSON.stringify(json, null, 2) + '\n');
    return;
  }
  if (out === 'hash') {
    const canonical = canonicalBindings(json);
    const hash = 'sha256:' + createHash('sha256').update(canonical).digest('hex');
    process.stdout.write(JSON.stringify({
      ok: true, engineId, endpoint, method, ms,
      rows: json?.results?.bindings?.length ?? 0,
      vars: json?.head?.vars ?? [],
      hash,
    }, null, 2) + '\n');
    return;
  }
  // out === 'json' (default)
  process.stdout.write(JSON.stringify({
    ok: true, engineId, endpoint, method, ms,
    vars: json?.head?.vars ?? [],
    rows: json?.results?.bindings ?? [],
  }, null, 2) + '\n');
}

// Canonical-JSON serialisation of result bindings, for stable content hashes.
// Sorts result rows by the JSON-stringified binding map, and within each row
// sorts variable keys. This makes the hash invariant under row-order or
// key-order shuffling, which both SPARQL engines and JSON serialisers can
// reorder freely. The vars array order is preserved separately in the output.
function canonicalBindings(json) {
  const bindings = json?.results?.bindings ?? [];
  const rows = bindings.map((b) => {
    const sortedKeys = Object.keys(b).sort();
    const sorted = {};
    for (const k of sortedKeys) sorted[k] = b[k];
    return JSON.stringify(sorted);
  });
  rows.sort();
  return '[' + rows.join(',') + ']';
}

// -----------------------------------------------------------------------------
// dispatch
// -----------------------------------------------------------------------------
async function main(argv) {
  const args = parseArgs(argv);
  const verb = args._[0];
  if (!verb || args.flags.help) { printHelp(); return; }
  if (verb === 'engines')  return cmdEngines();
  if (verb === 'validate') return cmdValidate(args.flags);
  if (verb === 'sparql')   return cmdSparql(args.flags);
  die(`unknown verb "${verb}" — try \`kgx --help\``);
}

main(process.argv.slice(2)).catch((e) => die(e?.message || String(e), 2));
