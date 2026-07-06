#!/usr/bin/env node
// kgx.mjs — the Daisychain 1.0 CLI, JavaScript side.
//
// Verb-for-verb parity with `python3 kgx_chain.py`:
//
//   node kgx.mjs spec     <file.trig>            # spec JSON (delegates TriG→spec to Python)
//   node kgx.mjs validate <file.trig>            # {ok, issues}
//   node kgx.mjs plan     <file.trig> [BEAD]     # {endpoint, sparql, beads}
//   node kgx.mjs run      <file.trig> [BEAD]     # SPARQL results JSON
//
// BEAD is a full URI, a ':suffix' / 'suffix' tail match, or 'last'
// (default). Options: --limit N (default 50), --sparql-only (plan),
// --spec FILE (skip Python; read a pre-made spec JSON — '-' for stdin).
//
// The DAL boundary: Python owns TriG→spec (rdflib); this CLI consumes
// the spec and implements plan/run via kgx_core.mjs — the same module
// the browser page uses. tests/test_kgx_conformance.sh checks that the
// two planners emit byte-identical SPARQL for every example chain.
// Spec: docs/kgx/daisychain-1.0.md

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planBead, runPlan, validateSpec, DAISYCHAIN_VERSION } from './kgx_core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_TOOL = join(HERE, 'kgx_chain.py');

function usage(code = 1) {
  console.error(
    'usage: kgx.mjs <spec|validate|plan|run> <file.trig> [BEAD] ' +
    '[--limit N] [--sparql-only] [--spec FILE]');
  process.exit(code);
}

function loadSpec(trigFile, specFile) {
  if (specFile) {
    const text = specFile === '-'
      ? readFileSync(0, 'utf8')
      : readFileSync(specFile, 'utf8');
    return JSON.parse(text);
  }
  // Delegate TriG→spec to the Python reference implementation.
  const out = execFileSync('python3', [PY_TOOL, '--json', trigFile],
                           { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help') || argv.includes('-h')) usage(argv.length ? 0 : 1);
if (argv[0] === '--version') { console.log(`daisychain ${DAISYCHAIN_VERSION}`); process.exit(0); }

const verb = argv.shift();
const flags = { limit: 50, sparqlOnly: false, spec: null };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--limit')       flags.limit = parseInt(argv[++i], 10);
  else if (a === '--sparql-only') flags.sparqlOnly = true;
  else if (a === '--spec')   flags.spec = argv[++i];
  else positional.push(a);
}
const [file, beadRef = 'last'] = positional;
if (!file && !flags.spec) usage();

const spec = loadSpec(file, flags.spec);

try {
  if (verb === 'spec') {
    console.log(JSON.stringify(spec, null, 2));
  } else if (verb === 'validate') {
    const result = validateSpec(spec);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else if (verb === 'plan') {
    const plan = planBead(spec, beadRef, { limit: flags.limit });
    if (flags.sparqlOnly) console.log(plan.sparql);
    else console.log(JSON.stringify(plan, null, 2));
  } else if (verb === 'run') {
    const plan = planBead(spec, beadRef, { limit: flags.limit });
    const results = await runPlan(plan);
    console.log(JSON.stringify(results, null, 2));
  } else {
    usage();
  }
} catch (e) {
  console.error(`kgx: ${e.message}${e.body ? '\n' + e.body : ''}`);
  process.exit(1);
}
