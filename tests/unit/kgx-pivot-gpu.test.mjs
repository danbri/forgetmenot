// Pure tests for the GPU pivot renderer's testable parts: capability
// detection (returns the shape callers depend on), atlas layout math,
// and the multi-atlas capacity ceiling. The WebGL pipeline itself is
// browser-only — exercised manually + via a follow-up Playwright pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gpuPivotCapabilities, gridAtlasLayout, maxItemsPerAtlas,
} from '../../demos/parliament-live/web/kgx/lib/pivot-gpu.mjs';

test('gpuPivotCapabilities — returns the {webgl2, webgpu, recommended} shape', () => {
  const c = gpuPivotCapabilities();
  assert.equal(typeof c.webgl2, 'boolean');
  assert.equal(typeof c.webgpu, 'boolean');
  assert.ok(['webgpu', 'webgl2', 'none'].includes(c.recommended),
    `recommended="${c.recommended}" must be one of webgpu / webgl2 / none`);
});

test('gpuPivotCapabilities — recommended degrades gracefully in node (no document, no navigator.gpu)', () => {
  const c = gpuPivotCapabilities();
  // node has no document, navigator.gpu — both should be false here, and
  // recommended must be "none". This is the contract the page falls back on.
  assert.equal(c.webgl2, false);
  assert.equal(c.webgpu, false);
  assert.equal(c.recommended, 'none');
});

test('gridAtlasLayout — empty input → all-zero layout', () => {
  const L = gridAtlasLayout(0);
  assert.equal(L.atlasW, 0);
  assert.equal(L.atlasH, 0);
  assert.equal(L.cols, 0);
  assert.equal(L.rows, 0);
  assert.equal(L.capacity, 0);
});

test('gridAtlasLayout — single item fits in one cell', () => {
  const L = gridAtlasLayout(1, { cellW: 48, cellH: 48 });
  assert.equal(L.cols, 1);
  assert.equal(L.rows, 1);
  assert.ok(L.atlasW >= 48);
  assert.ok(L.atlasH >= 48);
});

test('gridAtlasLayout — atlas dimensions are power-of-two', () => {
  for (const n of [16, 100, 500, 4000]) {
    const L = gridAtlasLayout(n, { cellW: 48, cellH: 48 });
    assert.ok(L, `n=${n} should fit in a single atlas`);
    const isPow2 = (x) => x > 0 && (x & (x - 1)) === 0;
    assert.ok(isPow2(L.atlasW), `atlasW ${L.atlasW} not pow2`);
    assert.ok(isPow2(L.atlasH), `atlasH ${L.atlasH} not pow2`);
  }
});

test('gridAtlasLayout — capacity is rows × cols (room for placement)', () => {
  const L = gridAtlasLayout(100, { cellW: 48, cellH: 48 });
  assert.ok(L.capacity >= 100, `capacity ${L.capacity} should hold the n=100 input`);
  assert.equal(L.capacity, L.cols * L.rows);
});

test('gridAtlasLayout — overflowing single-atlas capacity returns null', () => {
  // At 48px cells in a 4096px atlas: max = 85×85 = 7225 items.
  const L = gridAtlasLayout(10000, { cellW: 48, cellH: 48, maxSide: 4096 });
  assert.equal(L, null,
    '10k items at 48px cells / 4096 atlas should overflow — caller splits');
});

test('gridAtlasLayout — smaller cells raise the ceiling', () => {
  // 32px cells: 128×128 = 16,384 items per atlas. 10k now fits.
  const L = gridAtlasLayout(10000, { cellW: 32, cellH: 32, maxSide: 4096 });
  assert.ok(L, '10k items at 32px cells should fit in one atlas');
  assert.ok(L.capacity >= 10000);
});

test('maxItemsPerAtlas — 48px / 4096 = 7225 (the documented 5k headroom)', () => {
  const cap = maxItemsPerAtlas({ cellW: 48, cellH: 48, maxSide: 4096 });
  assert.equal(cap, 85 * 85, `expected 7225, got ${cap} — adjust the SKILL.md headroom note`);
});

test('maxItemsPerAtlas — at 24px / 4096 we hit ~28k per atlas', () => {
  const cap = maxItemsPerAtlas({ cellW: 24, cellH: 24, maxSide: 4096 });
  assert.equal(cap, 170 * 170, `expected 28900, got ${cap}`);
});
