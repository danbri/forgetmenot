// =============================================================================
// kgx/lib/trig.mjs — workflow-level TriG manifest
//
// `chainToTrig(spec)` serialises a chain spec into a TriG document that
// names every bundle, its derivation, the source / pivot / augment op,
// the engine, and the role. The output is a real interchange artefact
// — loadable into any RDF system, diffable in PRs, copy-pasteable as
// a shareable description of "what this chain does".
//
// Vocabulary lives under <https://forgetmenot.local/vocab/kgx/> (kgx:)
// so it's a real IRI namespace we can pin terms in. Aligns with the
// `gog:` ontology sketched in node-flow-design.md, with a project-
// specific prefix so we're not squatting on a name we don't own.
//
// What this DOESN'T do (yet):
//   - Execution records (prov:Run, gog:Run) — needs a populated `beads`
//     argument carrying ms / endpoint / bindHash per bead.
//   - Cache materialisations (gog:CacheArtifact) — needs the http-cache
//     summary keys.
//   - Resolved op vocabulary (gog:SourceBundle / gog:ExpandBundle /
//     gog:FilterBundle) — today we emit one kgx:bundle term and tag
//     it with the lib-side op category.
//
// Both extensions are obvious once a chain has actually run; the
// static manifest is the foundation.
// =============================================================================

import { normaliseChainSpec, activeChainSteps } from './branches.mjs';
import { resolveOpStep } from './runner.mjs';

const PREFIXES = [
  ['kgx',   'https://forgetmenot.local/vocab/kgx/'],
  ['kgxb',  'https://forgetmenot.local/bundle/'],
  ['kgxr',  'https://forgetmenot.local/run/'],
  ['prov',  'http://www.w3.org/ns/prov#'],
  ['dct',   'http://purl.org/dc/terms/'],
  ['rdfs',  'http://www.w3.org/2000/01/rdf-schema#'],
  ['rdf',   'http://www.w3.org/1999/02/22-rdf-syntax-ns#'],
  ['xsd',   'http://www.w3.org/2001/XMLSchema#'],
];

function ttlString(s) {
  if (s == null) return '""';
  const escaped = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

function ttlId(prefix, local) {
  // Local-name has to be a valid PN_LOCAL — easier to just always emit
  // the long form.
  return `<${PREFIXES.find(([p]) => p === prefix)[1]}${local}>`;
}

function bundleId(i) { return ttlId('kgxb', `b${i}`); }
function runId(i)    { return ttlId('kgxr', `r${i}`); }
function xsdLiteral(value, type) { return `"${value}"^^xsd:${type}`; }

// One-off RFC4122-ish id so two chains with identical specs serialise to
// distinct flow graph names. Browser + Node both have crypto.randomUUID.
function flowGraphId() {
  const u = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'noncrypto-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return `<urn:kgx:flow:${u}>`;
}

// Map a step to a bundle-kind term (one of the kgx: vocab roots).
function bundleKindFor(step) {
  if (step.kind === 'starter')                                 return 'kgx:SourceBundle';
  if (step.kind === 'op' && step.op === 'rel-pivot')           return 'kgx:PivotBundle';
  if (step.kind === 'op' && (step.op === 'enrich' ||
                              step.op === 'parl-enrich' ||
                              step.op === 'identity-bridge'))  return 'kgx:AugmentBundle';
  return 'kgx:FilterBundle';
}

// Per-step description; emits triples in the flow's named graph. The
// `me` IRI is provided by the caller (which knows whether this step
// belongs to a flat single-branch chain or a branch-scoped multi-
// branch one). When `branchTag` is non-null, the bundle is tagged with
// `kgx:branch "<id>"` — emitted only for multi-branch manifests so
// single-branch saves are byte-identical to the legacy shape.
function stepTriples(step, me, prevId, branchTag) {
  const t  = [];
  t.push(`  ${me} a ${bundleKindFor(step)} ;`);
  if (prevId)    t.push(`    kgx:derivedFrom ${prevId} ;`);
  if (branchTag) t.push(`    kgx:branch ${ttlString(branchTag)} ;`);
  if (step.kind === 'starter') {
    t.push(`    kgx:starterId  ${ttlString(step.id)} ;`);
  } else if (step.op === 'rel-pivot') {
    t.push(`    kgx:relTemplate ${ttlString(step.template)} ;`);
    t.push(`    kgx:relVariant  ${ttlString(step.variant)} ;`);
  } else {
    t.push(`    kgx:op    ${ttlString(step.op)} ;`);
    if (step.value !== undefined) t.push(`    kgx:opValue ${ttlString(step.value)} ;`);
  }
  // close with a period.
  t[t.length - 1] = t[t.length - 1].replace(/ ;$/, ' .');
  return t.join('\n');
}

// Per-bead execution record. Emitted only when `beads` is supplied
// (i.e. the chain has actually been run). Each record uses prov: + kgx:
// vocabulary so the TriG is interoperable with any prov-aware tooling
// AND legible in our own kgx vocabulary. `targetBundle` is the IRI of
// the bundle this run produced — supplied by the caller because for
// multi-branch chains the bundle IRI isn't deterministic from the
// run-record index alone.
function beadRunTriples(bead, idx, ranAt, targetBundle) {
  const me  = runId(idx);
  const bun = targetBundle || bundleId(idx);
  const t   = [];
  t.push(`  ${me} a prov:Activity, kgx:Run ;`);
  t.push(`    prov:generated ${bun} ;`);
  if (bead.engineId) t.push(`    kgx:engineId    ${ttlString(bead.engineId)} ;`);
  if (typeof bead.ms === 'number')   t.push(`    kgx:durationMs  ${xsdLiteral(bead.ms, 'integer')} ;`);
  if (typeof bead.size === 'number') t.push(`    kgx:resultSize  ${xsdLiteral(bead.size, 'integer')} ;`);
  if (bead.bindHash) t.push(`    kgx:bindHash    ${ttlString(bead.bindHash)} ;`);
  if (ranAt)         t.push(`    prov:startedAtTime ${xsdLiteral(ranAt, 'dateTime')} ;`);
  t[t.length - 1] = t[t.length - 1].replace(/ ;$/, ' .');
  return t.join('\n');
}

// Bundle IRI strategy:
//   - Single-branch chains: flat `<bundle/b<i>>` IRIs, no branch tags
//     (byte-identical to the pre-1d shape, so existing saved chains
//     stay valid).
//   - Multi-branch chains: the first root branch (per topo order)
//     keeps flat IRIs + a `kgx:branch` tag; sibling branches get
//     `<bundle/<branch-id>/b<i>>` IRIs and their own branch tags.
//     The chain graph self-statement gets `kgx:activeBranch "<id>"`.
function bundleIriFor(branchId, beadIdx, flatBranchId) {
  if (branchId === flatBranchId) return bundleId(beadIdx);
  return ttlId('kgxb', `${branchId}/b${beadIdx}`);
}

export function chainToTrig(spec, opts = {}) {
  // Accept either {steps} or {branches}. Single-branch chains emit a
  // flat linear walk (legacy shape, byte-identical). Multi-branch
  // chains emit every branch, with cross-branch derivedFrom links at
  // the fork points and `kgx:branch` tags on every bundle.
  const normalised = normaliseChainSpec(spec);
  const flowG = opts.graphIri || flowGraphId();
  const beads = opts.beads || null;
  const ranAt = opts.ranAt || (beads ? new Date().toISOString() : null);
  const isMultiBranch = normalised.branches.length > 1;
  const flatBranchId  = isMultiBranch ? normalised.branchesInTopoOrder[0].id : null;

  const lines = [];
  for (const [p, ns] of PREFIXES) lines.push(`@prefix ${p}: <${ns}> .`);
  lines.push('');
  lines.push(`${flowG} {`);
  if (normalised.title) lines.push(`  ${flowG} dct:title ${ttlString(normalised.title)} .`);
  if (normalised.sub)   lines.push(`  ${flowG} dct:description ${ttlString(normalised.sub)} .`);
  if (normalised.id)    lines.push(`  ${flowG} dct:identifier ${ttlString(normalised.id)} .`);
  // dct:created carries the save timestamp when the page stamps `_ts`
  // before serialising. Used by the chain-store nav pane to sort
  // recently-saved chains first.
  if (normalised._ts) lines.push(`  ${flowG} dct:created "${normalised._ts}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`);
  if (isMultiBranch)
    lines.push(`  ${flowG} kgx:activeBranch ${ttlString(normalised.activeBranch)} .`);
  lines.push('');

  // Track every bundle IRI we emit so beadRunTriples can refer to the
  // right one if `beads` is supplied. For single-branch chains this is
  // the historical flat sequence; for multi-branch the run records are
  // emitted in the same topo-walk order.
  const emittedBundleIris = [];

  if (!isMultiBranch) {
    // Legacy single-branch walk — preserved byte-for-byte.
    const stepsToRun = activeChainSteps(normalised);
    let prev = null;
    for (let i = 0; i < stepsToRun.length; i++) {
      // Canonicalise legacy aliases (pivot-bp / pivot-am → rel-pivot) so the
      // manifest tags the bead a PivotBundle with its relTemplate — matching
      // what the runner actually executes — rather than a bare FilterBundle.
      const me = bundleId(i);
      lines.push(stepTriples(resolveOpStep(stepsToRun[i]), me, prev, null));
      prev = me;
      emittedBundleIris.push(me);
    }
  } else {
    // Multi-branch walk: emit every branch in topo order. The first
    // bundle of a forked branch derives from its parent branch's
    // bundle at `forkedFrom.beadIdx`.
    for (const branch of normalised.branchesInTopoOrder) {
      let prev = branch.forkedFrom
        ? bundleIriFor(branch.forkedFrom.branch, branch.forkedFrom.beadIdx, flatBranchId)
        : null;
      for (let i = 0; i < branch.steps.length; i++) {
        const me = bundleIriFor(branch.id, i, flatBranchId);
        lines.push(stepTriples(resolveOpStep(branch.steps[i]), me, prev, branch.id));
        prev = me;
        emittedBundleIris.push(me);
      }
    }
  }

  // If we have beads, emit prov:Activity records alongside the bundle defs.
  if (beads?.length) {
    lines.push('');
    for (let i = 0; i < beads.length; i++) {
      const targetBundle = emittedBundleIris[i];
      lines.push(beadRunTriples(beads[i], i, ranAt, targetBundle));
    }
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
