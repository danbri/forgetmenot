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
// Op kinds NOT yet supported (raise UnsupportedOpError):
//
//   * op:enrich            — Wikidata facet fetch into item.extra
//   * op:parl-enrich       — Parliament DDP facet fetch via rdfs:seeAlso
//   * op:identity-bridge   — FPKG identity-graph cross-source resolve
//   * op:pivot-bp          — birthplaces (now subsumed by rel-pivot 'birthplaces')
//   * op:pivot-am          — alma maters (no rel-template yet)
//   * op:gender | citizenship | name-contains | by-mp-party   — picker ops
//     whose run: closures still live in daisychain/index.html's OPS table
//
// As each extraction lands, add a case here.  Test harness skips
// chains that hit an unsupported op so coverage grows incrementally
// rather than failing whole.
// =============================================================================

import { Bundle } from './node-flow.mjs';
import { opFilters } from './restrict.mjs';
import { STARTERS } from './starters.mjs';
import { REL_TEMPLATES } from './rel-templates.mjs';

export class UnsupportedOpError extends Error {
  constructor(stepDescription) {
    super(`runChainSpec: unsupported op "${stepDescription}"`);
    this.name = 'UnsupportedOpError';
    this.step = stepDescription;
  }
}

const RESTRICT_OPS = new Set(Object.keys(opFilters));

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
  if (!spec?.steps?.length) throw new Error('runChainSpec: spec has no steps');

  const beads = [];
  let bundle = null;

  for (const step of spec.steps) {
    // ── starter ────────────────────────────────────────────────────────────
    if (step.kind === 'starter') {
      const s = STARTERS.find((x) => x.id === step.id);
      if (!s) throw new UnsupportedOpError(`starter:${step.id} (not in lib)`);
      const res = await ctx.engine(s.engineId).query(s.query, `seed:${s.id}`);
      const items = s.parse(res.json.results.bindings);
      bundle = new Bundle(items, s.type, s.label);
      beads.push({
        kind: 'starter', id: s.id, type: s.type, size: bundle.size,
        engineId: s.engineId, ms: res.ms, query: s.query,
      });
      continue;
    }

    // ── restrict (pure client-side) ────────────────────────────────────────
    if (step.kind === 'op' && RESTRICT_OPS.has(step.op)) {
      if (!bundle) throw new Error(`step ${describe(step)}: no upstream bundle`);
      const fn = opFilters[step.op];
      bundle = (step.value === undefined) ? fn(bundle) : fn(bundle, step.value);
      beads.push({ kind: 'op', op: step.op, value: step.value, size: bundle.size });
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
      });
      continue;
    }

    // ── anything else: not yet lifted ──────────────────────────────────────
    throw new UnsupportedOpError(describe(step));
  }

  return { beads, bundle };
}
