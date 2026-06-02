// =============================================================================
// kgx/lib/quality.mjs — quality-policy gate
//
// Each chain runs under one of four modes (design note § Quality and
// Evidence Policy):
//
//   strict        curated/official primary sources only;
//                 default-kind variants only.
//   exploratory   default + tighten + broaden;
//                 all roles including adapter-derived / weak.
//   recall        default + broaden — wider nets, more candidates.
//   precision     default + tighten — narrower nets, higher confidence.
//
// `isAllowedByPolicy(mode, target)` answers "would the picker surface
// this op / variant under the chosen policy?". Pure function on plain
// objects — no engine call, no DOM. Used by the studio Ops tab to dim
// disallowed rows, and (later) by daisychain's chip picker to hide
// disallowed chips.
//
// Replay is unaffected: a chain saved with one mode runs the same ops
// regardless of the reader's mode. The policy gate is an AUTHORING
// concern, not a runtime concern.
// =============================================================================

export const VALID_MODES = new Set(['strict', 'exploratory', 'recall', 'precision']);

const VARIANT_KIND_GATES = {
  strict:      new Set(['default']),
  exploratory: new Set(['default', 'tighten', 'broaden']),
  recall:      new Set(['default', 'broaden']),
  precision:   new Set(['default', 'tighten']),
};

const ROLE_GATES = {
  strict:      new Set(['primary']),
  exploratory: new Set(['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']),
  recall:      new Set(['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']),
  precision:   new Set(['primary', 'crossCheck']),
};

function assertValidMode(mode) {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`quality mode "${mode}" not in {${[...VALID_MODES].join(', ')}}`);
  }
}

// Test a variant inside a REL_TEMPLATE against the active mode.
// A variant is identified by its `kind` field: 'default' | 'tighten' | 'broaden'.
export function isVariantAllowedByPolicy(mode, variant) {
  assertValidMode(mode);
  if (!variant?.kind) return false;
  return VARIANT_KIND_GATES[mode].has(variant.kind);
}

// Test an op (STARTER, REL_TEMPLATE, AUGMENT_OP) against the active mode.
// Gated by the op's `role`. Ops with no role declared are treated as
// 'primary' (most ops; strictest reading).
export function isOpAllowedByPolicy(mode, op) {
  assertValidMode(mode);
  const role = op?.role || 'primary';
  return ROLE_GATES[mode].has(role);
}

// Convenience: filter a REL_TEMPLATE's variants[] to those allowed by
// the active mode. Returns a NEW array (doesn't mutate the template).
export function variantsAllowedByPolicy(mode, template) {
  return (template?.variants || []).filter((v) => isVariantAllowedByPolicy(mode, v));
}
