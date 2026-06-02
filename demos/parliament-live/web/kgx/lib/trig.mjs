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

const PREFIXES = [
  ['kgx',   'https://forgetmenot.local/vocab/kgx/'],
  ['kgxb',  'https://forgetmenot.local/bundle/'],
  ['kgxs',  'https://forgetmenot.local/source/'],
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

// Per-step description; emits triples in the flow's named graph.
function stepTriples(step, idx, prevId) {
  const me = bundleId(idx);
  const t  = [];
  t.push(`  ${me} a ${bundleKindFor(step)} ;`);
  if (prevId) t.push(`    kgx:derivedFrom ${prevId} ;`);
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

export function chainToTrig(spec, opts = {}) {
  if (!spec?.steps?.length) throw new Error('chainToTrig: spec has no steps');
  const flowG = opts.graphIri || flowGraphId();
  const lines = [];
  for (const [p, ns] of PREFIXES) lines.push(`@prefix ${p}: <${ns}> .`);
  lines.push('');
  lines.push(`${flowG} {`);
  if (spec.title) lines.push(`  ${flowG} dct:title ${ttlString(spec.title)} .`);
  if (spec.sub)   lines.push(`  ${flowG} dct:description ${ttlString(spec.sub)} .`);
  if (spec.id)    lines.push(`  ${flowG} dct:identifier ${ttlString(spec.id)} .`);
  lines.push('');
  let prev = null;
  for (let i = 0; i < spec.steps.length; i++) {
    lines.push(stepTriples(spec.steps[i], i, prev));
    prev = bundleId(i);
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
