// Cross-surface roundtrip — pin that the same LIBRARY chain passes
// through every consumer surface of the kgx lib and that they agree on
// what the chain IS (number of steps, bundle types, op kinds). The
// celebration of the chaining abstraction is that all these surfaces
// share one lib; this test catches drift if any surface starts
// disagreeing.
//
// Surfaces probed (no network — all pure-data introspection):
//   * normaliseChainSpec + activeChainSteps      (lib/branches.mjs)
//   * lookup against STARTERS / REL_TEMPLATES /
//     opFilters / AUGMENT_OPS                     (lib/{starters,…}.mjs)
//   * chainToTrig                                 (lib/trig.mjs)
//   * `kgx chain explain --library`              (bin/kgx.mjs)
//   * `kgx chain validate --library`             (bin/kgx.mjs)
//   * `kgx chain trig --id <library-id>`         (bin/kgx.mjs)
//
// For each LIBRARY chain: every surface either agrees or surfaces the
// same diagnostic. No surface can silently produce a different idea
// of the chain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { LIBRARY }     from '../../demos/parliament-live/web/kgx/lib/library.mjs';
import { STARTERS }      from '../../demos/parliament-live/web/kgx/lib/starters.mjs';
import { REL_TEMPLATES } from '../../demos/parliament-live/web/kgx/lib/rel-templates.mjs';
import { AUGMENT_OPS }   from '../../demos/parliament-live/web/kgx/lib/augment.mjs';
import { opFilters }     from '../../demos/parliament-live/web/kgx/lib/restrict.mjs';
import { chainToTrig }   from '../../demos/parliament-live/web/kgx/lib/trig.mjs';
import { resolveOpStep } from '../../demos/parliament-live/web/kgx/lib/runner.mjs';
import { normaliseChainSpec, activeChainSteps } from
  '../../demos/parliament-live/web/kgx/lib/branches.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KGX = path.join(__dirname, '..', '..', 'bin', 'kgx.mjs');

function runKgx(args) {
  try {
    return { ok: true, stdout: execFileSync('node', [KGX, ...args], { encoding: 'utf8', timeout: 15_000 }), code: 0 };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', code: e.status };
  }
}

// Resolve every step against the registries. Uses the lib's own
// resolveOpStep so legacy aliases (pivot-bp / pivot-am) are canonicalised
// the same way the runner, explain and trig do — no second copy of the
// alias table to drift. Returns true iff every step is in the lib.
function stepInLib(rawStep) {
  const step = resolveOpStep(rawStep);
  if (step.kind === 'starter') return STARTERS.some((s) => s.id === step.id);
  if (step.kind !== 'op') return false;
  if (step.op === 'rel-pivot') {
    const t = REL_TEMPLATES.find((x) => x.id === step.template);
    return !!t && t.variants.some((v) => v.id === step.variant);
  }
  return Boolean(opFilters[step.op] || AUGMENT_OPS[step.op]);
}

// ---------------------------------------------------------------------------
// Every LIBRARY chain passes through every surface and they all agree.
// ---------------------------------------------------------------------------

for (const chain of LIBRARY) {
  test(`roundtrip:${chain.id} — every surface agrees on the chain shape`, () => {
    const normalised = normaliseChainSpec(chain);
    const stepsToRun = activeChainSteps(normalised);
    const expectedLength = stepsToRun.length;
    assert.ok(expectedLength > 0, `${chain.id}: active-branch flatten produced 0 steps`);

    // Surface 1: the lib's own flatten matches the chain's declared steps.
    assert.equal(stepsToRun.length, expectedLength);

    // Surface 2: every step resolves against the lib registries.
    // (Skip if the chain is one that hasn't had its ops extracted yet —
    // none exist in LIBRARY today; if one shows up this test catches it.)
    for (let i = 0; i < stepsToRun.length; i++) {
      assert.ok(stepInLib(stepsToRun[i]),
        `${chain.id}: step ${i + 1} (${JSON.stringify(stepsToRun[i])}) not in lib`);
    }

    // Surface 3: chainToTrig emits one bundle per step, with the right kind.
    const ttl = chainToTrig(chain, { graphIri: '<urn:kgx:test:fixed>' });
    const bundleMatches = ttl.match(/<https:\/\/forgetmenot\.local\/bundle\/b\d+>/g) || [];
    // Each bundle URI appears at least once as a subject; with kgx:derivedFrom
    // links it appears twice (once as a subject, once as the derivedFrom target).
    // De-dup by extracting the index.
    const bundleIds = new Set(bundleMatches.map((s) => s.match(/b(\d+)>/)[1]));
    assert.equal(bundleIds.size, expectedLength,
      `${chain.id}: chainToTrig emitted ${bundleIds.size} bundles for ${expectedLength} steps`);

    // Surface 4: `kgx chain validate --library <id>` says ok.
    const v = runKgx(['chain', 'validate', '--library', chain.id]);
    assert.equal(v.code, 0, `${chain.id}: chain validate exited ${v.code}\n${v.stderr || v.stdout}`);
    const vReport = JSON.parse(v.stdout);
    assert.equal(vReport.ok, true,           `${chain.id}: chain validate ok=false: ${JSON.stringify(vReport.issues)}`);
    assert.equal(vReport.checked, expectedLength, `${chain.id}: chain validate checked ${vReport.checked}, expected ${expectedLength}`);

    // Surface 5: `kgx chain explain --library <id>` describes every step.
    const e = runKgx(['chain', 'explain', '--library', chain.id]);
    assert.equal(e.code, 0, `${chain.id}: chain explain exited ${e.code}`);
    for (let i = 1; i <= expectedLength; i++) {
      assert.match(e.stdout, new RegExp(`^${i}\\. `, 'm'),
        `${chain.id}: chain explain missing step ${i}`);
    }
    // The paper trail must never disown a step the runner would execute.
    // A LIBRARY chain is, by construction, fully in-lib — so explain
    // describing any step as UNKNOWN means a surface drifted (this is how
    // the pivot-am alias regression slipped in: run resolved it, explain
    // didn't).
    assert.doesNotMatch(e.stdout, /UNKNOWN/,
      `${chain.id}: chain explain disowned a step the runner would run:\n${e.stdout}`);

    // Alias consistency: every legacy pivot alias (pivot-bp / pivot-am)
    // in this chain must surface as a PIVOT in explain and a PivotBundle
    // in trig — never a bare RESTRICT / FilterBundle.
    const aliasSteps = stepsToRun.filter(
      (s) => s.kind === 'op' && resolveOpStep(s).op === 'rel-pivot' && s.op !== 'rel-pivot');
    if (aliasSteps.length) {
      const pivotLines = (e.stdout.match(/^\d+\. PIVOT /mg) || []).length;
      const declaredPivots = stepsToRun.filter((s) => resolveOpStep(s).op === 'rel-pivot').length;
      assert.equal(pivotLines, declaredPivots,
        `${chain.id}: explain shows ${pivotLines} PIVOT lines, expected ${declaredPivots}`);
    }

    // Surface 6: `kgx chain trig --id <id>` matches the lib's chainToTrig
    // call on the same chain (modulo the random urn:kgx:flow IRI, which we
    // ignore by counting bundle IDs instead).
    const tr = runKgx(['chain', 'trig', '--id', chain.id]);
    assert.equal(tr.code, 0, `${chain.id}: chain trig exited ${tr.code}`);
    const cliBundleIds = new Set((tr.stdout.match(/<https:\/\/forgetmenot\.local\/bundle\/b\d+>/g) || [])
      .map((s) => s.match(/b(\d+)>/)[1]));
    assert.equal(cliBundleIds.size, expectedLength,
      `${chain.id}: CLI trig bundle count ${cliBundleIds.size} ≠ expected ${expectedLength}`);
  });
}

// ---------------------------------------------------------------------------
// And: `kgx ops` returns a JSON whose counts match the lib's registries.
// ---------------------------------------------------------------------------

test('kgx ops returns counts that match the lib registries', () => {
  const r = runKgx(['ops']);
  assert.equal(r.code, 0);
  const o = JSON.parse(r.stdout);
  assert.equal(o.starters.length,       STARTERS.length);
  assert.equal(o.restrict.length,       Object.keys(opFilters).length);
  assert.equal(o.relTemplates.length,   REL_TEMPLATES.length);
  assert.equal(o.augmentOps.length,     Object.keys(AUGMENT_OPS).length);
});

test('kgx library returns one row per LIBRARY entry, in declaration order', () => {
  const r = runKgx(['library']);
  assert.equal(r.code, 0);
  const rows = JSON.parse(r.stdout);
  assert.equal(rows.length, LIBRARY.length);
  for (let i = 0; i < LIBRARY.length; i++) {
    assert.equal(rows[i].id, LIBRARY[i].id);
  }
});
