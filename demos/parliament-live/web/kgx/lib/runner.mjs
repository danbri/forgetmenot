// =============================================================================
// kgx/lib/runner.mjs — the chain interpreter
//
// Walks a LIBRARY-shape chain spec, dispatches each step against the
// extracted op-node registries, and produces a per-bead trace + final
// Bundle.  This is the SAME shape daisychain/index.html uses when it
// loads a saved chain — pulled into the lib so node tests can run it
// without a browser.
//
//   spec = {
//     title?, sub?, suggestView?,
//     steps: [
//       { kind: 'starter', id: 'uk-mps-1900' },
//       { kind: 'op',      op: 'party',  value: 'Labour Party' },
//       { kind: 'op',      op: 'sitting' },
//       { kind: 'op',      op: 'rel-pivot', template: 'children', variant: 'sons' },
//       …
//     ],
//   }
//
//   beads = [
//     { kind: 'starter', id, type, size, source },
//     { kind: 'op',      op, value?, size, source? },
//     …
//   ]
//
// Op kinds supported today (the ones already lifted to lib):
//
//   * starter ─────────► STARTERS registry (lib/starters.mjs)
//   * op:party | decade | sitting | bridged   (lib/restrict.mjs::opFilters)
//   * op:rel-pivot                            (lib/rel-templates.mjs)
//
//   * op:enrich | parl-enrich | identity-bridge  via AUGMENT_OPS
//                                                (lib/augment.mjs)
//
// Legacy aliases supported via redirect (the lib representation IS the
// rel-template, the old standalone names are kept as user-facing chips):
//
//   * op:pivot-bp  →  rel-pivot template=birthplaces variant=default
//   * op:pivot-am  →  rel-pivot template=alma_maters variant=default
//
// As each extraction lands, add a case here.  Test harness skips
// chains that hit an unsupported op so coverage grows incrementally
// rather than failing whole.
// =============================================================================

import { Bundle } from './node-flow.mjs';
import { opFilters } from './restrict.mjs';
import { STARTERS } from './starters.mjs';
import { REL_TEMPLATES } from './rel-templates.mjs';
import { AUGMENT_OPS } from './augment.mjs';
import { normaliseChainSpec, activeChainSteps } from './branches.mjs';

// Stable per-bead content hash over the sorted-unique uris of the bundle's
// items. Same shape the http-cache assigns to summaries, so two records of
// the "same chain step" produce identical bindHash (within Wikidata drift).
// Returns null if crypto.subtle isn't available (older Node / no Web Crypto).
async function bindHashOf(items) {
  const uris = [...new Set((items || []).map((x) => x.uri).filter(Boolean))].sort().join('\n');
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') return null;
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(uris));
  return 'sha256:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class UnsupportedOpError extends Error {
  constructor(stepDescription) {
    super(`runChainSpec: unsupported op "${stepDescription}"`);
    this.name = 'UnsupportedOpError';
    this.step = stepDescription;
  }
}

const RESTRICT_OPS = new Set(Object.keys(opFilters));

// Legacy op aliases that predate REL_TEMPLATES. The daisychain palette
// surfaces these as one-tap chips (`→ birthplaces`, `→ alma maters`);
// LIBRARY entries authored before the registry still carry the alias id.
// Each is sugar for a specific rel-pivot template+variant.
//
// Exported so every surface that interprets a step — the runner (which
// executes it), `chain explain` (which narrates the paper trail), and
// chainToTrig (which serialises it as RDF) — resolves the alias the SAME
// way. Without this, the paper trail diverges from what actually ran: the
// runner pivots while explain prints "UNKNOWN op" and trig mislabels the
// bead a FilterBundle. A paper trail that doesn't match the run is worse
// than none.
export const OP_ALIASES = {
  'pivot-bp': { op: 'rel-pivot', template: 'birthplaces', variant: 'default' },
  'pivot-am': { op: 'rel-pivot', template: 'alma_maters', variant: 'default' },
};

// Canonicalise one step: expand a known alias to its rel-pivot form,
// otherwise return the step unchanged. Pure; safe to call on any step.
export function resolveOpStep(step) {
  if (step?.kind === 'op' && OP_ALIASES[step.op]) {
    return { kind: 'op', ...OP_ALIASES[step.op] };
  }
  return step;
}

function describe(step) {
  if (step.kind === 'starter') return `starter:${step.id}`;
  if (step.kind === 'op')      return step.op + (step.value !== undefined ? `:${step.value}` : '');
  return step.kind || '<no-kind>';
}

// Default parse: take the first URI column as the subject, the first
// non-URI as the label. Mirrors daisychain/applyRelation's fallback.
function defaultParseRows(rows) {
  return rows.map((b) => {
    const cols = Object.keys(b);
    const sCol = cols.find((c) => b[c]?.type === 'uri');
    return {
      uri: b[sCol]?.value || '',
      label: b.label?.value || (sCol && b[sCol].value.replace(/^.*\//, '')) || '',
      originCount: +(b.n?.value || 0),
      image: null, country: null, coords: null,
    };
  });
}

export async function runChainSpec(spec, ctx) {
  if (!ctx || typeof ctx.engine !== 'function') {
    throw new Error('runChainSpec: ctx.engine(id) resolver required');
  }
  // Accept either the flat {steps: [...]} or the tree {branches: [...]}
  // shape. The flatten walks ancestor prefixes up to each fork point,
  // returning the linear sequence the active branch needs to see.
  const normalised  = normaliseChainSpec(spec);
  const stepsToRun  = activeChainSteps(normalised);

  const beads = [];
  let bundle = null;

  for (let step of stepsToRun) {
    // Canonicalise legacy aliases (pivot-bp / pivot-am → rel-pivot) so the
    // rest of the dispatcher only sees rel-pivot. Shared with explain + trig
    // via the exported resolveOpStep — see OP_ALIASES.
    step = resolveOpStep(step);
    // ── starter ────────────────────────────────────────────────────────────
    if (step.kind === 'starter') {
      const s = STARTERS.find((x) => x.id === step.id);
      if (!s) throw new UnsupportedOpError(`starter:${step.id} (not in lib)`);

      // Three starter shapes: SPARQL (engineId + query), PQ (pqTemplate),
      // or inline (items[] baked into the lib). Inline starters give us a
      // deterministic seed of a few items — useful for "I have a specific
      // external URL, find what wraps it" demos where you'd otherwise need
      // an upstream fetch just to introduce a known constant.
      if (Array.isArray(s.items)) {
        const items = s.parse ? s.parse(s.items) : s.items;
        bundle = new Bundle(items, s.type, s.label);
        beads.push({
          kind: 'starter', id: s.id, type: s.type, size: bundle.size,
          engineId: 'inline', ms: 0, query: null,
          bindHash: await bindHashOf(bundle.items),
        });
        continue;
      }
      // SPARQL-shape (engineId + query) vs PQ-shape (pqTemplate)
      if (s.pqTemplate) {
        if (typeof ctx.pq !== 'function') {
          throw new UnsupportedOpError(`starter:${s.id} needs ctx.pq() (PQ host)`);
        }
        const res = await ctx.pq(s.pqTemplate);
        const items = s.parse(res.rows || res.json?.['@graph'] || []);
        bundle = new Bundle(items, s.type, s.label);
        beads.push({
          kind: 'starter', id: s.id, type: s.type, size: bundle.size,
          engineId: 'parl-pq', ms: res.ms, query: s.pqTemplate,
          bindHash: await bindHashOf(bundle.items),
        });
        continue;
      }
      const res = await ctx.engine(s.engineId).query(s.query, `seed:${s.id}`);
      const items = s.parse(res.json.results.bindings);
      bundle = new Bundle(items, s.type, s.label);
      beads.push({
        kind: 'starter', id: s.id, type: s.type, size: bundle.size,
        engineId: s.engineId, ms: res.ms, query: s.query,
        bindHash: await bindHashOf(bundle.items),
      });
      continue;
    }

    // ── restrict (pure client-side) ────────────────────────────────────────
    if (step.kind === 'op' && RESTRICT_OPS.has(step.op)) {
      if (!bundle) throw new Error(`step ${describe(step)}: no upstream bundle`);
      const fn = opFilters[step.op];
      bundle = (step.value === undefined) ? fn(bundle) : fn(bundle, step.value);
      beads.push({
        kind: 'op', op: step.op, value: step.value, size: bundle.size,
        bindHash: await bindHashOf(bundle.items),
      });
      continue;
    }

    // ── rel-pivot (SPARQL via REL_TEMPLATES) ───────────────────────────────
    if (step.kind === 'op' && step.op === 'rel-pivot') {
      if (!bundle) throw new Error(`step ${describe(step)}: no upstream bundle`);
      const tpl = REL_TEMPLATES.find((t) => t.id === step.template);
      if (!tpl) throw new UnsupportedOpError(`rel-pivot:${step.template} (template not in registry)`);
      const variant = tpl.variants.find((v) => v.id === step.variant);
      if (!variant) throw new UnsupportedOpError(`rel-pivot:${step.template}:${step.variant} (variant not in template)`);
      if (tpl.requires && !tpl.requires(bundle)) {
        throw new Error(`step ${describe(step)}: requires() rejected upstream bundle`);
      }
      const sparql = variant.build(bundle.items);
      const res    = await ctx.engine(tpl.engineId).query(sparql, `rel:${tpl.id}:${variant.id}(${bundle.size})`);
      const rows   = res.json.results.bindings;
      const items  = (variant.parse || defaultParseRows)(rows);
      bundle = new Bundle(items, tpl.outputType, `${tpl.label} (${variant.label}) of ${bundle.label}`);
      beads.push({
        kind: 'op', op: 'rel-pivot', template: tpl.id, variant: variant.id,
        size: bundle.size, engineId: tpl.engineId, ms: res.ms, query: sparql,
        outputType: tpl.outputType,
        bindHash: await bindHashOf(bundle.items),
      });
      continue;
    }

    // ── augment / federate (item.extra updates, same bundle type) ─────────
    if (step.kind === 'op' && AUGMENT_OPS[step.op]) {
      if (!bundle) throw new Error(`step ${describe(step)}: no upstream bundle`);
      const aug = AUGMENT_OPS[step.op];
      if (aug.requires && !aug.requires(bundle)) {
        throw new Error(`step ${describe(step)}: requires() rejected upstream bundle`);
      }
      if (aug.cap && bundle.size > aug.cap) {
        throw new Error(`step ${describe(step)}: bundle ${bundle.size} > cap ${aug.cap}; narrow first.`);
      }
      const sparql = aug.query(bundle.items);
      const res    = await ctx.engine(aug.engineId).query(sparql, `${aug.id}(${bundle.size})`);
      const newItems = aug.parse(res.json.results.bindings, bundle.items);
      bundle = new Bundle(newItems, bundle.type, `${bundle.label} + ${aug.id}`);
      beads.push({
        kind: 'op', op: aug.id, size: bundle.size,
        engineId: aug.engineId, ms: res.ms, query: sparql,
        bindHash: await bindHashOf(bundle.items),
      });
      continue;
    }

    // ── anything else: not yet lifted ──────────────────────────────────────
    throw new UnsupportedOpError(describe(step));
  }

  return { beads, bundle };
}
