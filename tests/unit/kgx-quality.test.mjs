// Unit tests for the quality-policy gate —
// demos/parliament-live/web/kgx/lib/quality.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isVariantAllowedByPolicy, isOpAllowedByPolicy,
  variantsAllowedByPolicy, VALID_MODES,
} from '../../demos/parliament-live/web/kgx/lib/quality.mjs';
import { REL_TEMPLATES } from
  '../../demos/parliament-live/web/kgx/lib/rel-templates.mjs';
import { AUGMENT_OPS } from
  '../../demos/parliament-live/web/kgx/lib/augment.mjs';

// ---------------------------------------------------------------------------
// VARIANT gates: kind ∈ { default, tighten, broaden } → mode
// ---------------------------------------------------------------------------

test('strict allows only default-kind variants', () => {
  assert.equal(isVariantAllowedByPolicy('strict', { kind: 'default'  }), true);
  assert.equal(isVariantAllowedByPolicy('strict', { kind: 'tighten'  }), false);
  assert.equal(isVariantAllowedByPolicy('strict', { kind: 'broaden'  }), false);
});

test('exploratory allows every variant kind', () => {
  for (const kind of ['default', 'tighten', 'broaden']) {
    assert.equal(isVariantAllowedByPolicy('exploratory', { kind }), true, `should allow ${kind}`);
  }
});

test('recall allows default + broaden but not tighten', () => {
  assert.equal(isVariantAllowedByPolicy('recall', { kind: 'default' }), true);
  assert.equal(isVariantAllowedByPolicy('recall', { kind: 'broaden' }), true);
  assert.equal(isVariantAllowedByPolicy('recall', { kind: 'tighten' }), false);
});

test('precision allows default + tighten but not broaden', () => {
  assert.equal(isVariantAllowedByPolicy('precision', { kind: 'default' }), true);
  assert.equal(isVariantAllowedByPolicy('precision', { kind: 'tighten' }), true);
  assert.equal(isVariantAllowedByPolicy('precision', { kind: 'broaden' }), false);
});

// ---------------------------------------------------------------------------
// OP gates: role ∈ { primary, crossCheck, adapterEvidence, weakEnrichment } → mode
// ---------------------------------------------------------------------------

test('strict allows only primary-role ops', () => {
  assert.equal(isOpAllowedByPolicy('strict', { role: 'primary'         }), true);
  assert.equal(isOpAllowedByPolicy('strict', { role: 'crossCheck'      }), false);
  assert.equal(isOpAllowedByPolicy('strict', { role: 'adapterEvidence' }), false);
  assert.equal(isOpAllowedByPolicy('strict', { role: 'weakEnrichment'  }), false);
});

test('exploratory allows every op role', () => {
  for (const role of ['primary', 'crossCheck', 'adapterEvidence', 'weakEnrichment']) {
    assert.equal(isOpAllowedByPolicy('exploratory', { role }), true);
  }
});

test('precision excludes adapterEvidence + weakEnrichment but keeps primary + crossCheck', () => {
  assert.equal(isOpAllowedByPolicy('precision', { role: 'primary'         }), true);
  assert.equal(isOpAllowedByPolicy('precision', { role: 'crossCheck'      }), true);
  assert.equal(isOpAllowedByPolicy('precision', { role: 'adapterEvidence' }), false);
  assert.equal(isOpAllowedByPolicy('precision', { role: 'weakEnrichment'  }), false);
});

test('ops without a declared role default to "primary" — most ops pass in strict', () => {
  assert.equal(isOpAllowedByPolicy('strict', {}), true);
});

// ---------------------------------------------------------------------------
// variantsAllowedByPolicy on a real REL_TEMPLATE
// ---------------------------------------------------------------------------

test('children template: strict yields the default variant only', () => {
  const tpl = REL_TEMPLATES.find((t) => t.id === 'children');
  assert.ok(tpl);
  const allowed = variantsAllowedByPolicy('strict', tpl);
  assert.deepEqual(allowed.map((v) => v.id), ['default']);
});

test('children template: exploratory yields default + tighten + broaden', () => {
  const tpl = REL_TEMPLATES.find((t) => t.id === 'children');
  const allowed = variantsAllowedByPolicy('exploratory', tpl);
  assert.deepEqual(allowed.map((v) => `${v.kind}:${v.id}`), [
    'default:default',
    'tighten:sons',
    'tighten:daughters',
    'broaden:family',
  ]);
});

test('children template: precision drops the broaden:family variant', () => {
  const tpl = REL_TEMPLATES.find((t) => t.id === 'children');
  const allowed = variantsAllowedByPolicy('precision', tpl);
  assert.deepEqual(allowed.map((v) => v.id), ['default', 'sons', 'daughters']);
});

test('children template: recall drops the two tighten variants', () => {
  const tpl = REL_TEMPLATES.find((t) => t.id === 'children');
  const allowed = variantsAllowedByPolicy('recall', tpl);
  assert.deepEqual(allowed.map((v) => v.id), ['default', 'family']);
});

// ---------------------------------------------------------------------------
// Validation + policy cross-checks
// ---------------------------------------------------------------------------

test('invalid mode throws', () => {
  assert.throws(() => isVariantAllowedByPolicy('insane', { kind: 'default' }), /not in/);
  assert.throws(() => isOpAllowedByPolicy('mighty',   { role: 'primary'  }), /not in/);
});

test('VALID_MODES enumerates the four policy modes', () => {
  assert.deepEqual([...VALID_MODES].sort(),
    ['exploratory', 'precision', 'recall', 'strict']);
});

test('parl-enrich (crossCheck) is blocked in strict mode but allowed in exploratory', () => {
  const op = AUGMENT_OPS['parl-enrich'];
  assert.equal(isOpAllowedByPolicy('strict',       op), false);
  assert.equal(isOpAllowedByPolicy('exploratory',  op), true);
  assert.equal(isOpAllowedByPolicy('precision',    op), true);
});
