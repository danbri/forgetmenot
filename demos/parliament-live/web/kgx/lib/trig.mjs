// =============================================================================
// kgx/lib/trig.mjs — workflow-level TriG manifest
//
// `chainToTrig(spec)` serialises a chain spec into a TriG document that
// names every bundle, its derivation, the source / pivot / augment op,
// the engine, and the role. The output is a real interchange artefact
// — loadable into any RDF system, diffable in PRs, copy-pasteable as
// a shareable description of "what this chain does".
//
// Vocabulary lives under <urn:kgx:vocab:> (kgx:) — opaque, non-
// resolving URN that won't get confused with anything else. Aligns
// with the `gog:` ontology sketched in node-flow-design.md.
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

// Phase 2A IRI rationalization (see trig-manifest-review.md):
// - kgx: vocab is a proper URN (urn:kgx:vocab:), not a fake HTTP
//   authority. The chain graph and every bundle / run IRI underneath
//   it are chain-scoped URNs derived from one UUID — no global
//   ambiguity when two chains both name a "bead 0".
// - Bundle / run IRIs are emitted in long form; one URN per subject
//   reads no worse than a CURIE and the scoping is self-documenting.
const PREFIXES = [
  ['kgx',   'urn:kgx:vocab:'],
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

function xsdLiteral(value, type) { return `"${value}"^^xsd:${type}`; }

// One-off RFC4122-ish id so two chains with identical specs serialise to
// distinct chain-graph names. Browser + Node both have crypto.randomUUID.
function mintUuid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'noncrypto-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Extract the chain UUID from a chain graph IRI of the form
// `<urn:kgx:chain:UUID>`. Used to build chain-scoped bundle / run IRIs
// that line up with the graph name.
function chainUuidOf(graphIri) {
  const m = String(graphIri || '').match(/^<urn:kgx:chain:([^>]+)>$/);
  return m ? m[1] : null;
}

// Phase 2A bundle / run IRIs are chain-scoped URNs:
//   urn:kgx:chain:<chain-uuid>:bead:<i>
//   urn:kgx:chain:<chain-uuid>:bead:<branch>:<i>     (forked branches)
//   urn:kgx:chain:<chain-uuid>:bead:<i>:run:<run-uuid>
function bundleIdScoped(chainUuid, beadIdx) {
  return `<urn:kgx:chain:${chainUuid}:bead:${beadIdx}>`;
}
function bundleIdScopedBranch(chainUuid, branchId, beadIdx) {
  return `<urn:kgx:chain:${chainUuid}:bead:${branchId}:${beadIdx}>`;
}
function runIdScoped(chainUuid, beadIdx) {
  return `<urn:kgx:chain:${chainUuid}:bead:${beadIdx}:run>`;
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

// Per-step description; emits triples in the chain's named graph. The
// `me` IRI is provided by the caller (which knows whether this step
// belongs to a single-branch chain or a branch-scoped multi-branch
// one). When `branchTag` is non-null, the bundle is tagged with
// `kgx:branch "<id>"` — emitted only for multi-branch manifests.
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
// run-record index alone. `runIri` is the chain-scoped run IRI.
function beadRunTriples(bead, runIri, ranAt, targetBundle) {
  const t   = [];
  t.push(`  ${runIri} a prov:Activity, kgx:Run ;`);
  t.push(`    prov:generated ${targetBundle} ;`);
  if (bead.engineId) t.push(`    kgx:engineId    ${ttlString(bead.engineId)} ;`);
  if (typeof bead.ms === 'number')   t.push(`    kgx:durationMs  ${xsdLiteral(bead.ms, 'integer')} ;`);
  if (typeof bead.size === 'number') t.push(`    kgx:resultSize  ${xsdLiteral(bead.size, 'integer')} ;`);
  if (bead.bindHash) t.push(`    kgx:bindHash    ${ttlString(bead.bindHash)} ;`);
  if (ranAt)         t.push(`    prov:startedAtTime ${xsdLiteral(ranAt, 'dateTime')} ;`);
  t[t.length - 1] = t[t.length - 1].replace(/ ;$/, ' .');
  return t.join('\n');
}

// Bundle IRI strategy:
//   - Single-branch chains:  urn:kgx:chain:<chainUuid>:bead:<i>
//   - Multi-branch chains:   the root branch (per topo order) keeps the
//                            flat form above; sibling branches get
//                            urn:kgx:chain:<chainUuid>:bead:<branch>:<i>.
//   All bundles are chain-scoped — no global collisions across saves.
function bundleIriFor(branchId, beadIdx, flatBranchId, chainUuid) {
  if (!chainUuid) throw new Error('bundleIriFor: chainUuid required');
  if (branchId === flatBranchId) return bundleIdScoped(chainUuid, beadIdx);
  return bundleIdScopedBranch(chainUuid, branchId, beadIdx);
}

export function chainToTrig(spec, opts = {}) {
  // Accept either {steps} or {branches}. Single-branch chains emit a
  // flat linear walk; multi-branch chains emit every branch, with
  // cross-branch derivedFrom links at the fork points and `kgx:branch`
  // tags on every bundle.
  const normalised = normaliseChainSpec(spec);
  // The chain UUID lives in the chain graph IRI AND in every bundle /
  // run IRI underneath it. Mint once; reuse everywhere so queries
  // against the graph can navigate without indirection.
  let chainG;
  let chainUuid;
  if (opts.graphIri) {
    chainG = opts.graphIri;
    chainUuid = chainUuidOf(chainG) || mintUuid();
  } else {
    chainUuid = mintUuid();
    chainG = `<urn:kgx:chain:${chainUuid}>`;
  }
  const beads = opts.beads || null;
  const ranAt = opts.ranAt || (beads ? new Date().toISOString() : null);
  const isMultiBranch = normalised.branches.length > 1;
  const flatBranchId  = isMultiBranch ? normalised.branchesInTopoOrder[0].id : null;

  const lines = [];
  for (const [p, ns] of PREFIXES) lines.push(`@prefix ${p}: <${ns}> .`);
  lines.push('');
  lines.push(`${chainG} {`);
  if (normalised.title) lines.push(`  ${chainG} dct:title ${ttlString(normalised.title)} .`);
  if (normalised.sub)   lines.push(`  ${chainG} dct:description ${ttlString(normalised.sub)} .`);
  if (normalised.id)    lines.push(`  ${chainG} dct:identifier ${ttlString(normalised.id)} .`);
  // dct:created carries the save timestamp when the page stamps `_ts`
  // before serialising. Used by the chain-store nav pane to sort
  // recently-saved chains first.
  if (normalised._ts) lines.push(`  ${chainG} dct:created "${normalised._ts}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`);
  if (isMultiBranch)
    lines.push(`  ${chainG} kgx:activeBranch ${ttlString(normalised.activeBranch)} .`);
  lines.push('');

  // Track every bundle IRI we emit so beadRunTriples can refer to the
  // right one if `beads` is supplied. For single-branch chains this is
  // the historical flat sequence; for multi-branch the run records are
  // emitted in the same topo-walk order.
  const emittedBundleIris = [];

  if (!isMultiBranch) {
    // Single-branch walk.
    const stepsToRun = activeChainSteps(normalised);
    let prev = null;
    for (let i = 0; i < stepsToRun.length; i++) {
      // Canonicalise legacy aliases (pivot-bp / pivot-am → rel-pivot) so the
      // manifest tags the bead a PivotBundle with its relTemplate — matching
      // what the runner actually executes — rather than a bare FilterBundle.
      const me = bundleIdScoped(chainUuid, i);
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
        ? bundleIriFor(branch.forkedFrom.branch, branch.forkedFrom.beadIdx, flatBranchId, chainUuid)
        : null;
      for (let i = 0; i < branch.steps.length; i++) {
        const me = bundleIriFor(branch.id, i, flatBranchId, chainUuid);
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
      const runIri       = runIdScoped(chainUuid, i);
      lines.push(beadRunTriples(beads[i], runIri, ranAt, targetBundle));
    }
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
