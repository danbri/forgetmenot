// Squarified treemap layout — pure unit tests. The algorithm itself lives
// in demos/parliament-live/web/kgx/daisychain/index.html (squarifyTreemap)
// inside the module script, so we re-implement the same logic here and
// pin the invariants. Once the page's module is extractable as an ES
// module, these can import the live code; for now the tests act as a
// contract sketch.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of the page's implementation. Keep in sync with the daisychain
// module's squarifyTreemap / placeRow / remainAfter functions — any
// divergence is a bug.
function squarifyTreemap(items, rect) {
  if (!items.length) return [];
  const total = items.reduce((s, it) => s + it.weight, 0) || 1;
  const area = rect.w * rect.h;
  const queue = items.map((it) => ({ ...it, _area: (it.weight / total) * area }));
  const out = [];
  const worst = (row, side) => {
    let mn = Infinity, mx = -Infinity;
    for (const r of row) { if (r._area < mn) mn = r._area; if (r._area > mx) mx = r._area; }
    const sum = row.reduce((s, r) => s + r._area, 0);
    const side2 = side * side;
    const sum2 = sum * sum;
    return Math.max((side2 * mx) / sum2, sum2 / (side2 * mn));
  };
  let R = { ...rect };
  let row = [];
  while (queue.length) {
    const head = queue[0];
    const side = Math.min(R.w, R.h);
    const w1 = row.length ? worst(row, side) : Infinity;
    const w2 = worst([...row, head], side);
    if (row.length && w2 > w1) {
      out.push(...placeRow(row, R));
      R = remainAfter(row, R);
      row = [];
    } else {
      row.push(head);
      queue.shift();
    }
  }
  if (row.length) out.push(...placeRow(row, R));
  return out;
}
function placeRow(row, R) {
  const sum = row.reduce((s, r) => s + r._area, 0);
  const side = Math.min(R.w, R.h);
  const thickness = sum / side;
  const horiz = R.w <= R.h;
  let cursor = horiz ? R.x : R.y;
  const placed = [];
  for (const r of row) {
    const len = r._area / thickness;
    placed.push(horiz
      ? { ...r, x: cursor, y: R.y, w: len, h: thickness }
      : { ...r, x: R.x, y: cursor, w: thickness, h: len });
    cursor += len;
  }
  return placed;
}
function remainAfter(row, R) {
  const sum = row.reduce((s, r) => s + r._area, 0);
  const side = Math.min(R.w, R.h);
  const thickness = sum / side;
  return R.w <= R.h
    ? { x: R.x, y: R.y + thickness, w: R.w, h: R.h - thickness }
    : { x: R.x + thickness, y: R.y, w: R.w - thickness, h: R.h };
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

test('empty input → empty output', () => {
  assert.deepEqual(squarifyTreemap([], { x: 0, y: 0, w: 1, h: 1 }), []);
});

test('single item fills the whole rectangle', () => {
  const out = squarifyTreemap([{ weight: 1 }], { x: 0, y: 0, w: 10, h: 6 });
  assert.equal(out.length, 1);
  assert.equal(out[0].x, 0);
  assert.equal(out[0].y, 0);
  assert.equal(out[0].w, 10);
  assert.equal(out[0].h, 6);
});

test('total area sums to the bounding rect area (within rounding)', () => {
  const items = [50, 30, 20, 10, 8, 6].map((w) => ({ weight: w }));
  const out = squarifyTreemap(items, { x: 0, y: 0, w: 100, h: 80 });
  const totalArea = out.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(totalArea - 100 * 80) < 1e-6,
    `area drift: ${Math.abs(totalArea - 8000)} > 1e-6`);
});

test('cell areas are proportional to weights', () => {
  const items = [10, 5, 2, 1].map((w) => ({ weight: w }));
  const total = 18;
  const rectArea = 100 * 100;
  const out = squarifyTreemap(items, { x: 0, y: 0, w: 100, h: 100 });
  for (let i = 0; i < items.length; i++) {
    const expectedArea = (items[i].weight / total) * rectArea;
    const actualArea   = out[i].w * out[i].h;
    assert.ok(Math.abs(actualArea - expectedArea) < 1e-6,
      `item ${i}: area ${actualArea} ≠ expected ${expectedArea}`);
  }
});

test('cells are inside the bounding rect — no overflow', () => {
  const items = [40, 30, 20, 10, 5, 3, 2, 1].map((w) => ({ weight: w }));
  const out = squarifyTreemap(items, { x: 0, y: 0, w: 200, h: 120 });
  for (const r of out) {
    assert.ok(r.x >= -1e-6,                       `x ${r.x} negative`);
    assert.ok(r.y >= -1e-6,                       `y ${r.y} negative`);
    assert.ok(r.x + r.w <= 200 + 1e-6,            `right ${r.x + r.w} overflows`);
    assert.ok(r.y + r.h <= 120 + 1e-6,            `bottom ${r.y + r.h} overflows`);
    assert.ok(r.w > 0 && r.h > 0,                 `degenerate rect`);
  }
});

test('cells do not overlap each other (small case)', () => {
  const items = [60, 40, 30, 20, 10].map((w) => ({ weight: w }));
  const out = squarifyTreemap(items, { x: 0, y: 0, w: 100, h: 100 });
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const overlap = !(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6
                     || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6);
      assert.ok(!overlap, `cells ${i} and ${j} overlap`);
    }
  }
});

test('weights are sorted descending — biggest cell is first', () => {
  const items = [3, 7, 1, 5].map((w) => ({ weight: w, id: w }));
  // Caller is responsible for sorting; squarify assumes it. The page's
  // _renderPivotTreemap sorts before calling. Pin that behaviour: when
  // sorted, the largest cell's area is >= every other cell's area.
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const out = squarifyTreemap(sorted, { x: 0, y: 0, w: 100, h: 100 });
  const areas = out.map((r) => r.w * r.h);
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[0] >= areas[i] - 1e-6,
      `first cell area ${areas[0]} not biggest (item ${i}: ${areas[i]})`);
  }
});
