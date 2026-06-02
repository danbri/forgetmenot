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

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  assertNoAliasCollisions,
} from '../demos/parliament-live/web/kgx/lib/sparql-validate.mjs';
import { chainToTrig } from '../demos/parliament-live/web/kgx/lib/trig.mjs';
import { LIBRARY }     from '../demos/parliament-live/web/kgx/lib/library.mjs';
import { runChainSpec, UnsupportedOpError } from
  '../demos/parliament-live/web/kgx/lib/runner.mjs';
import { STARTERS }      from '../demos/parliament-live/web/kgx/lib/starters.mjs';
import { REL_TEMPLATES } from '../demos/parliament-live/web/kgx/lib/rel-templates.mjs';
import { opFilters }     from '../demos/parliament-live/web/kgx/lib/restrict.mjs';
import { AUGMENT_OPS }   from '../demos/parliament-live/web/kgx/lib/augment.mjs';
import { normaliseChainSpec, activeChainSteps } from
  '../demos/parliament-live/web/kgx/lib/branches.mjs';

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
  kgx chain trig --id <lib-id>         emit a TriG manifest for a LIBRARY entry
  kgx chain trig -f path/to/spec.json   same, from a LIBRARY-shape JSON file
  kgx chain run --library <lib-id>     run a LIBRARY entry through the lib's
                                       runChainSpec; one JSONL bead per step
  kgx chain run -f chain.json          run a declarative chain spec, emit JSONL beads
                                       (inline-SPARQL shape; predates LIBRARY)
  kgx chain explain --library <lib-id> describe what each step does, without running
       [-f chain.json]                 same, from a LIBRARY-shape JSON file
  kgx chain candidates --type <t>      list ops that apply to a bundle of type <t>
  kgx chain validate --library <id>    run every lib hygiene gate (§18.2.4.4 + prefix
       [-f chain.json]                  declarations + bundle-type contract + variant
                                        membership). Exit 0 = clean; 1 = issues found.
  kgx ops                              dump every registry (STARTERS, REL_TEMPLATES,
                                       opFilters, AUGMENT_OPS) as JSON
  kgx library                          list every saved chain (id, title, op trace)
       [--record path]                 also write a recording (chain + per-bead hashes)
  kgx chain replay -f recording.json   re-run the embedded chain, assert each bead's
                                       content hash matches; exit 1 on mismatch.

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

function hashBindings(json) {
  return 'sha256:' + createHash('sha256').update(canonicalBindings(json)).digest('hex');
}

// -----------------------------------------------------------------------------
// `kgx chain run` / `kgx chain replay`
//
// A chain spec is a small JSON document:
//
//   {
//     "title":  "HK skyscrapers → architects → other works",
//     "engine": "qlever-wikidata",          // default for steps that don't override
//     "steps": [
//       { "id": "hk-skyscrapers", "query": "...", "bindVar": "b" },
//       { "id": "architects",     "query": "... VALUES ?b { {{prev_qids}} } ...", "bindVar": "a" },
//       { "id": "works_by",       "query": "... VALUES ?a { {{prev_qids}} } ...", "bindVar": "b" }
//     ]
//   }
//
// Substitution placeholders in each step's `query`:
//   {{prev_qids}}   → `wd:Q123 wd:Q456 ...`         from previous step's bindVar
//   {{prev_iris}}   → `<http://…/X> <http://…/Y> …` same, full IRI form
//
// A recording is the same chain plus a `beads` array with engine, endpoint,
// ms, rows, vars, and content hash per step. `kgx chain replay` runs the
// embedded chain and asserts each new bead's hash matches the recorded one
// — that's the snapshot test (live fetch + content hash, per CLAUDE.md
// rule on guessing vs. probing: we re-probe each time, and pin the answer).
// -----------------------------------------------------------------------------
async function execStep(engineId, query, label, validate = true) {
  const engine = ENGINES[engineId];
  if (!engine) throw new Error(`unknown engine "${engineId}" in chain step "${label}"`);
  if (validate) assertNoAliasCollisions(query, `${engineId}:${label}`);

  const method = query.length > 2048 ? 'post' : 'get';
  const t0 = performance.now();
  const res = method === 'post'
    ? await fetch(engine.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sparql-query', 'Accept': 'application/sparql-results+json' },
        body: query,
      })
    : await fetch(engine.endpoint + '?query=' + encodeURIComponent(query), {
        headers: { 'Accept': 'application/sparql-results+json' },
      });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`step "${label}" via ${engineId}: HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    engineId,
    endpoint: engine.endpoint,
    method,
    ms,
    rows: json?.results?.bindings?.length ?? 0,
    vars: json?.head?.vars ?? [],
    hash: hashBindings(json),
    json,
  };
}

// Pull the previous step's bound URI for `bindVar` from each result row,
// returning the unique set. Used to substitute the {{prev_*}} placeholders.
function collectBindings(prevJson, bindVar) {
  if (!bindVar) throw new Error('previous step has no bindVar; cannot substitute {{prev_*}}');
  const out = new Set();
  for (const b of (prevJson?.results?.bindings ?? [])) {
    const v = b?.[bindVar]?.value;
    if (v) out.add(v);
  }
  return [...out];
}

function substitute(query, prevUris) {
  if (!query.includes('{{prev_')) return query;
  const qids = prevUris
    .map((u) => (u.match(/Q\d+$/) || [])[0])
    .filter(Boolean)
    .map((q) => `wd:${q}`)
    .join(' ');
  const iris = prevUris.map((u) => `<${u}>`).join(' ');
  return query.replace(/\{\{prev_qids\}\}/g, qids)
              .replace(/\{\{prev_iris\}\}/g, iris);
}

// sha256 over the sorted-unique URIs of a given bindVar. This is the
// CHAIN-MEANINGFUL hash — it's the set that gets substituted into the next
// step's `{{prev_*}}` placeholders, so two runs with the same bindHash will
// drive the rest of the chain identically. Stable across SAMPLE() jitter
// (SPARQL §17.2: "SAMPLE returns an arbitrary value from the multiset"),
// unlike a full-content hash, which would flake on every run.
function hashBindVar(json, bindVar) {
  const uris = [...new Set(
    (json?.results?.bindings ?? [])
      .map((b) => b?.[bindVar]?.value)
      .filter((v) => typeof v === 'string'),
  )].sort();
  return 'sha256:' + createHash('sha256').update(uris.join('\n')).digest('hex');
}

async function runChain(chain) {
  if (!chain?.steps?.length) throw new Error('chain has no steps');
  const beads = [];
  let prevJson = null;
  let prevBindVar = null;
  for (const step of chain.steps) {
    const engineId = step.engine || chain.engine;
    if (!engineId) throw new Error(`step "${step.id}" has no engine and chain has no default`);
    const prevUris = prevJson ? collectBindings(prevJson, prevBindVar) : [];
    const query = substitute(step.query, prevUris);
    const bead = await execStep(engineId, query, step.id);
    bead.bindHash = hashBindVar(bead.json, step.bindVar);
    beads.push({ id: step.id, bindVar: step.bindVar, ...bead });
    prevJson = bead.json;
    prevBindVar = step.bindVar;
  }
  return beads;
}

// -----------------------------------------------------------------------------
// `kgx ops` — dump every op registry. Mirrors the studio Ops tab in JSON.
// -----------------------------------------------------------------------------
function cmdOps() {
  const out = {
    starters: STARTERS.map((s) => ({
      id: s.id, type: s.type, engineId: s.engineId, pqTemplate: s.pqTemplate || null,
      role: s.role, label: s.label,
    })),
    restrict: Object.keys(opFilters).map((id) => ({ id, arity: opFilters[id].length })),
    relTemplates: REL_TEMPLATES.map((t) => ({
      id: t.id, inputType: t.inputType, outputType: t.outputType,
      engineId: t.engineId, role: t.role,
      variants: t.variants.map((v) => ({ id: v.id, kind: v.kind, label: v.label })),
    })),
    augmentOps: Object.values(AUGMENT_OPS).map((aug) => ({
      id: aug.id, kind: aug.kind, engineId: aug.engineId, role: aug.role,
      joinKey: aug.joinKey || null, cap: aug.cap || null,
    })),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

// -----------------------------------------------------------------------------
// `kgx library` — list every saved chain with a one-line op-trace.
// -----------------------------------------------------------------------------
function cmdLibrary() {
  const rows = LIBRARY.map((c) => {
    const steps = activeChainSteps(normaliseChainSpec(c));
    const trace = steps.map((s) =>
      s.kind === 'starter' ? `starter:${s.id}` :
      s.op === 'rel-pivot' ? `pivot:${s.template}/${s.variant}` :
      s.op + (s.value !== undefined ? `:${s.value}` : '')
    ).join(' → ');
    return { id: c.id, title: c.title, sub: c.sub, trace };
  });
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
}

// -----------------------------------------------------------------------------
// `kgx chain explain` — describe each step in a chain in plain English,
// without executing it. Demonstrates the spec is fully introspectable from
// outside the page.
// -----------------------------------------------------------------------------
function cmdChainExplain(flags) {
  let spec;
  if (flags.library) {
    spec = LIBRARY.find((c) => c.id === String(flags.library));
    if (!spec) die(`chain explain: no LIBRARY entry with id "${flags.library}"`);
  } else if (flags.f) {
    spec = JSON.parse(readFileSync(String(flags.f), 'utf8'));
  } else {
    die('chain explain: pass `--library <id>` or `-f path/to/spec.json`');
  }
  const normalised = normaliseChainSpec(spec);
  const stepsToRun = activeChainSteps(normalised);
  const head = [
    spec.title ? `# ${spec.title}` : `# chain (${normalised.activeBranch})`,
    spec.sub ? `# ${spec.sub}` : null,
    `# ${stepsToRun.length} step${stepsToRun.length === 1 ? '' : 's'}; active branch: ${normalised.activeBranch}`,
  ].filter(Boolean).join('\n');
  process.stdout.write(head + '\n\n');

  let bundleType = '(none)';
  for (let i = 0; i < stepsToRun.length; i++) {
    const step = stepsToRun[i];
    let line;
    if (step.kind === 'starter') {
      const s = STARTERS.find((x) => x.id === step.id);
      if (!s) { line = `${i + 1}. starter ${step.id} — UNKNOWN (not in lib)`; bundleType = '?'; }
      else {
        const eng = s.engineId || (s.pqTemplate ? 'parl-pq' : '?');
        line = `${i + 1}. SOURCE ${s.id} → ${s.type}   ` +
               `(engine=${eng}, role=${s.role || 'primary'})\n   ${s.label} — ${s.sub || ''}`;
        bundleType = s.type;
      }
    } else if (step.op === 'rel-pivot') {
      const t = REL_TEMPLATES.find((x) => x.id === step.template);
      if (!t) line = `${i + 1}. PIVOT ${step.template}/${step.variant} — UNKNOWN`;
      else {
        const v = t.variants.find((x) => x.id === step.variant);
        line = `${i + 1}. PIVOT  ${t.id}/${step.variant} : ${t.inputType} → ${t.outputType}   ` +
               `(engine=${t.engineId}, role=${t.role || 'primary'}, kind=${v?.kind || '?'})\n   ${t.gloss}`;
        bundleType = t.outputType;
      }
    } else if (opFilters[step.op]) {
      const valuePart = step.value !== undefined ? ` = ${JSON.stringify(step.value)}` : '';
      line = `${i + 1}. RESTRICT ${step.op}${valuePart}   (pure-client filter on ${bundleType})`;
    } else if (AUGMENT_OPS[step.op]) {
      const a = AUGMENT_OPS[step.op];
      line = `${i + 1}. ${a.kind.toUpperCase()} ${a.id}   ` +
             `(engine=${a.engineId}, role=${a.role || 'primary'}, cap=${a.cap || '∞'}` +
             `${a.joinKey ? `, joinKey=${a.joinKey}` : ''})\n   ${a.note}`;
    } else {
      line = `${i + 1}. UNKNOWN op "${step.op}" (not in any lib registry)`;
    }
    process.stdout.write(line + '\n');
  }
  process.stdout.write(`\n# final bundle type: ${bundleType}\n`);
}

// -----------------------------------------------------------------------------
// `kgx chain candidates --type <bundle-type>` — list every op (restrict /
// rel-template / augment) that can apply to a bundle of the given type.
// -----------------------------------------------------------------------------
function cmdChainCandidates(flags) {
  const type = String(flags.type || '');
  if (!type) die('chain candidates: pass `--type <bundle-type>` (e.g. human / building / constituency / appg / party / si / formal_body / concept / wd_thing / wd_class)');
  // restrict ops are pure-client; they apply to any type (the chain author
  // decides what makes sense). Pivots are typed by inputType.
  const restrict = Object.keys(opFilters);
  const pivots = REL_TEMPLATES.filter((t) =>
    t.inputType === type || (t.inputType === 'wd_thing' && /Q\d+$/.test(type)));
  const augments = Object.values(AUGMENT_OPS);
  const out = {
    type,
    restrict,
    relTemplates: pivots.map((t) => ({
      id: t.id, outputType: t.outputType, role: t.role || 'primary',
      variants: t.variants.map((v) => `${v.kind}:${v.id}`),
    })),
    augmentOps: augments.map((a) => ({
      id: a.id, kind: a.kind, role: a.role || 'primary',
    })),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

// -----------------------------------------------------------------------------
// `kgx chain validate` — run every lib hygiene gate on a chain spec without
// executing. Useful for pre-flighting an LLM-composed chain before paying
// network cost.
//
// Checks per step:
//   - starter / rel-template / restrict / augment is in the lib registry
//   - rel-template variant is in the template's variants[]
//   - emitted SPARQL passes assertNoAliasCollisions
//   - PNAME prefix declarations match the prefixes used
//   - bundle-type contract holds (e.g. rel-pivot's inputType matches the
//     upstream output)
//
// Exit 0 = clean; 1 = any failure (JSON report on stdout names which
// step + which check tripped).
// -----------------------------------------------------------------------------
function declaredPrefixes(sparql) {
  return new Set([...sparql.matchAll(/\bPREFIX\s+([A-Za-z_][\w-]*)\s*:/gi)].map((m) => m[1]));
}
function usedPrefixes(sparql) {
  const stripped = sparql.replace(/<[^>]*>/g, '').replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  const out = new Set();
  for (const m of stripped.matchAll(/\b([A-Za-z_][\w-]*):[A-Za-z_][\w-]*/g)) out.add(m[1]);
  return out;
}

function cmdChainValidate(flags) {
  let spec;
  if (flags.library) {
    spec = LIBRARY.find((c) => c.id === String(flags.library));
    if (!spec) die(`chain validate: no LIBRARY entry with id "${flags.library}"`);
  } else if (flags.f) {
    spec = JSON.parse(readFileSync(String(flags.f), 'utf8'));
  } else {
    die('chain validate: pass `--library <id>` or `-f path/to/spec.json`');
  }
  const issues = [];
  let stepsToRun;
  try {
    const normalised = normaliseChainSpec(spec);
    stepsToRun = activeChainSteps(normalised);
  } catch (e) {
    issues.push({ step: -1, where: 'normaliser', error: e.message });
    process.stdout.write(JSON.stringify({ ok: false, issues }, null, 2) + '\n');
    process.exit(1);
  }

  let bundleType = '(none)';
  // Rich-enough dummy to satisfy every template's requires(): Wikidata QID
  // (Q\d+ regex) + an MNIS id (used by appg_officer and identity-bridge) +
  // a DDP URI (used by si_laying_body).
  const dummyItems = [{
    uri:  'http://www.wikidata.org/entity/Q1',
    mpid: '1',
  }, {
    uri:  'https://id.parliament.uk/AbCdEf12',
  }];

  // Legacy aliases the runner remaps before dispatching. Mirror that here
  // so chains using the old chip names (pivot-bp / pivot-am) validate
  // against the actual rel-template they end up running.
  const PIVOT_ALIASES = {
    'pivot-bp': { template: 'birthplaces', variant: 'default' },
    'pivot-am': { template: 'alma_maters', variant: 'default' },
  };

  for (let i = 0; i < stepsToRun.length; i++) {
    let step = stepsToRun[i];
    if (step.kind === 'op' && PIVOT_ALIASES[step.op]) {
      step = { kind: 'op', op: 'rel-pivot', ...PIVOT_ALIASES[step.op] };
    }
    const where = `step ${i + 1}`;
    const checkSparql = (sparql, id) => {
      try { assertNoAliasCollisions(sparql, id); }
      catch (e) { issues.push({ step: i + 1, where: `${where}:${id}`, check: '§18.2.4.4', error: e.message }); }
      const declared = declaredPrefixes(sparql);
      const used = usedPrefixes(sparql);
      for (const pfx of used) {
        if (!declared.has(pfx)) issues.push({
          step: i + 1, where: `${where}:${id}`, check: 'prefix-declared',
          error: `uses "${pfx}:" but never declares it`,
        });
      }
    };

    if (step.kind === 'starter') {
      const s = STARTERS.find((x) => x.id === step.id);
      if (!s) { issues.push({ step: i + 1, where, error: `unknown starter "${step.id}"` }); continue; }
      if (s.query) checkSparql(s.query, `starter:${s.id}`);
      bundleType = s.type;
    } else if (step.op === 'rel-pivot') {
      const t = REL_TEMPLATES.find((x) => x.id === step.template);
      if (!t) { issues.push({ step: i + 1, where, error: `unknown rel-pivot template "${step.template}"` }); continue; }
      if (bundleType !== '(none)' && t.inputType !== bundleType && !(t.inputType === 'wd_thing')) {
        issues.push({ step: i + 1, where, check: 'inputType',
          error: `template ${t.id} expects ${t.inputType}; upstream is ${bundleType}` });
      }
      const v = t.variants.find((x) => x.id === step.variant);
      if (!v) { issues.push({ step: i + 1, where, error: `template ${t.id} has no variant "${step.variant}"` }); continue; }
      try { checkSparql(v.build(dummyItems), `${t.id}:${v.id}`); }
      catch (e) { issues.push({ step: i + 1, where, error: `build() threw: ${e.message}` }); }
      bundleType = t.outputType;
    } else if (opFilters[step.op]) {
      // pure-client; nothing to validate at SPARQL level
    } else if (AUGMENT_OPS[step.op]) {
      const a = AUGMENT_OPS[step.op];
      try { checkSparql(a.query(dummyItems), `augment:${a.id}`); }
      catch (e) { issues.push({ step: i + 1, where, error: `augment.query() threw: ${e.message}` }); }
    } else {
      issues.push({ step: i + 1, where, error: `unknown op "${step.op}" (not in any lib registry)` });
    }
  }

  const ok = issues.length === 0;
  process.stdout.write(JSON.stringify({
    ok, checked: stepsToRun.length, issues,
  }, null, 2) + '\n');
  if (!ok) process.exit(1);
}

function cmdChainTrig(flags) {
  let spec;
  if (flags.id) {
    spec = LIBRARY.find((c) => c.id === String(flags.id));
    if (!spec) die(`chain trig: no LIBRARY entry with id "${flags.id}"`);
  } else if (flags.f) {
    spec = JSON.parse(readFileSync(String(flags.f), 'utf8'));
  } else {
    die('chain trig: pass `--id <library-id>` (from lib/library.mjs) or `-f path/to/spec.json`');
  }
  // LIBRARY shape uses { kind: 'starter' | 'op', ... } steps, or the
  // tree shape `branches: [...]`. The older bin/kgx.mjs chain-run format
  // (id + query + bindVar) doesn't fit chainToTrig — fail loud rather
  // than emit nonsense.
  const flatLib  = Array.isArray(spec?.steps) && spec.steps[0] && typeof spec.steps[0].kind === 'string';
  const treeLib  = Array.isArray(spec?.branches) && spec.branches.length;
  if (!flatLib && !treeLib) {
    die('chain trig: spec must use LIBRARY shape (steps[].kind = "starter" | "op", ' +
        'OR branches[].steps[].kind). The older bin/kgx.mjs chain-run ' +
        'inline-SPARQL format is not supported here.');
  }
  process.stdout.write(chainToTrig(spec));
}

// LIBRARY-shape engine resolver + PQ host for the CLI. Uses live fetch
// (no http-cache in the CLI today — that's a tests-side concern).
function libEngineResolver(id) {
  const map = {
    'qlever-wikidata': 'https://qlever.dev/api/wikidata',
    'fpkg':            'https://fpkg.fly.dev/kgx/query',
    'parl-sparql':     'https://api.parliament.uk/sparql',
  };
  const endpoint = map[id];
  if (!endpoint) throw new Error(`no CLI endpoint mapping for engineId "${id}"`);
  return {
    id, endpoint,
    async query(sparql, label) {
      const t0 = performance.now();
      const method = sparql.length > 2048 ? 'POST' : 'GET';
      const res = method === 'POST'
        ? await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sparql-query', 'Accept': 'application/sparql-results+json' },
            body: sparql,
          })
        : await fetch(endpoint + '?query=' + encodeURIComponent(sparql), {
            headers: { 'Accept': 'application/sparql-results+json' },
          });
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      return {
        json: await res.json(), query: sparql, endpoint, engineId: id,
        ms: Math.round(performance.now() - t0), label,
      };
    },
  };
}
async function libPqHost(template) {
  const url = 'https://api.parliament.uk/query/' + template;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`pq:${template}: HTTP ${res.status}`);
  const json = await res.json();
  return {
    json, rows: Array.isArray(json['@graph']) ? json['@graph'] : [],
    ms: Math.round(performance.now() - t0), endpoint: url, engineId: 'parl-pq',
  };
}

async function cmdChainRun(flags) {
  // --library <id> path: run a LIBRARY-shape chain through the lib's
  // runChainSpec. JSONL out — one bead per step.
  if (flags.library) {
    const chain = LIBRARY.find((c) => c.id === String(flags.library));
    if (!chain) die(`chain run: no LIBRARY entry with id "${flags.library}"`);
    try {
      const { beads, bundle } = await runChainSpec(chain, { engine: libEngineResolver, pq: libPqHost });
      for (const b of beads) process.stdout.write(JSON.stringify(b) + '\n');
      process.stderr.write(`# final bundle: ${bundle.size} ${bundle.type}\n`);
      return;
    } catch (e) {
      if (e instanceof UnsupportedOpError) die(e.message, 1);
      throw e;
    }
  }
  // Legacy -f path (inline-SPARQL shape; predates LIBRARY).
  if (!flags.f) die('chain run: pass `--library <id>` or `-f path/to/chain.json`');
  const chain = JSON.parse(readFileSync(String(flags.f), 'utf8'));
  const beads = await runChain(chain);
  for (const b of beads) {
    // JSONL — one bead per line, json field stripped (live in `--out raw` later if needed).
    const { json, ...summary } = b;
    process.stdout.write(JSON.stringify(summary) + '\n');
  }
  if (flags.record) {
    const recording = {
      chain,
      ranAt: new Date().toISOString(),
      beads: beads.map(({ json, ...b }) => b),
    };
    writeFileSync(String(flags.record), JSON.stringify(recording, null, 2) + '\n');
  }
}

async function cmdChainReplay(flags) {
  if (!flags.f) die('chain replay: pass `-f path/to/recording.json`');
  const recording = JSON.parse(readFileSync(String(flags.f), 'utf8'));
  if (!recording.chain || !recording.beads) die('not a recording: missing { chain, beads }');
  const beads = await runChain(recording.chain);
  let failed = 0;
  // Assertion is on bindHash (the bindVar URI-set hash) plus row count.
  // Full-content `hash` shifts under SAMPLE() jitter; bindHash does not.
  const report = beads.map((b, i) => {
    const want = recording.beads[i];
    const ok = !!want && b.bindHash === want.bindHash && b.rows === want.rows;
    if (!ok) failed++;
    return {
      id: b.id, ok,
      engine: b.engineId,
      now:  { rows: b.rows, bindHash: b.bindHash, hash: b.hash, ms: b.ms },
      want: want ? { rows: want.rows, bindHash: want.bindHash } : null,
    };
  });
  process.stdout.write(JSON.stringify({
    ok: failed === 0,
    recordedAt: recording.ranAt,
    beads: report,
  }, null, 2) + '\n');
  if (failed > 0) process.exit(1);
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
  if (verb === 'ops')      return cmdOps();
  if (verb === 'library')  return cmdLibrary();
  if (verb === 'chain') {
    const sub = args._[1];
    if (sub === 'run')        return cmdChainRun(args.flags);
    if (sub === 'replay')     return cmdChainReplay(args.flags);
    if (sub === 'trig')       return cmdChainTrig(args.flags);
    if (sub === 'explain')    return cmdChainExplain(args.flags);
    if (sub === 'candidates') return cmdChainCandidates(args.flags);
    if (sub === 'validate')   return cmdChainValidate(args.flags);
    die(`unknown 'chain' subcommand "${sub || ''}" — try 'run' | 'replay' | 'trig' | 'explain' | 'candidates' | 'validate'`);
  }
  die(`unknown verb "${verb}" — try \`kgx --help\``);
}

main(process.argv.slice(2)).catch((e) => die(e?.message || String(e), 2));
