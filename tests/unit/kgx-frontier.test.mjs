// frontierOf — the data-driven "what can I slice here?" computation that
// backs `kgx chain frontier`. Pure, no network: pin its classification of
// facets / presence / uniform on hand-built bundles so the CLI's frontier
// can't silently start offering a slice the data won't support.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Bundle }     from '../../demos/parliament-live/web/kgx/lib/node-flow.mjs';
import { frontierOf } from '../../demos/parliament-live/web/kgx/lib/frontier.mjs';

// A human bundle shaped like the daisychain's MP starter output.
function mpBundle() {
  return new Bundle([
    { uri: 'wd:Q1', label: 'A', parties: ['Labour'],       sitting: true,  gender: 'female', decade: '2010s' },
    { uri: 'wd:Q2', label: 'B', parties: ['Labour'],       sitting: true,  gender: 'male',   decade: '2010s' },
    { uri: 'wd:Q3', label: 'C', parties: ['Conservative'], sitting: false, gender: 'male',   decade: '1990s' },
    { uri: 'wd:Q4', label: 'D', parties: ['Conservative', 'Labour'],       gender: 'female', decade: '2010s' },
    { uri: 'wd:Q5', label: 'E', parties: ['Green'] },
  ], 'human', 'Test MPs');
}

test('facets: party splits into named buckets, sorted by count', () => {
  const f = frontierOf(mpBundle());
  const party = f.facets.find((x) => x.field === 'parties');
  assert.ok(party, 'expected a parties facet');
  assert.equal(party.multi, true, 'parties is array-valued');
  assert.deepEqual(party.values, [
    { value: 'Labour', count: 3 },
    { value: 'Conservative', count: 2 },
    { value: 'Green', count: 1 },
  ]);
});

test('facets: gender / decade are detected as low-cardinality slices', () => {
  const f = frontierOf(mpBundle());
  assert.ok(f.facets.some((x) => x.field === 'gender'));
  assert.ok(f.facets.some((x) => x.field === 'decade'));
});

test('facet coversAll=false when some items lack the field', () => {
  const f = frontierOf(mpBundle());
  // gender: items Q1-Q4 have it, Q5 doesn't → not everyone.
  const gender = f.facets.find((x) => x.field === 'gender');
  assert.equal(gender.coversAll, false);
});

test('presence: sitting is a subset boolean flag, not a facet', () => {
  const f = frontierOf(mpBundle());
  // sitting=true on Q1,Q2; false (dropped) on Q3; absent on Q4,Q5.
  // distinct stored value is just `true` ⇒ presence, not facet.
  assert.ok(!f.facets.some((x) => x.field === 'sitting'), 'sitting must not be a facet');
  const s = f.presence.find((x) => x.field === 'sitting');
  assert.ok(s, 'expected sitting in presence');
  assert.equal(s.present, 2);
  assert.equal(s.absent, 3);
});

test('identity fields (uri/label) are never offered as slices', () => {
  const f = frontierOf(mpBundle());
  for (const bad of ['uri', 'label']) {
    assert.ok(!f.facets.some((x) => x.field === bad), `${bad} must not be a facet`);
    assert.ok(!f.presence.some((x) => x.field === bad), `${bad} must not be presence`);
  }
});

test('high-cardinality optional field (coords) → presence, not 80-way facet', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({
    uri: `wd:Q${i}`, label: `P${i}`,
    coords: i < 30 ? `Point(${i} ${i})` : undefined,   // 30 located, 20 not
    country: i % 2 ? 'United Kingdom' : 'United States',
  }));
  const f = frontierOf(new Bundle(items, 'org', 'places'));
  // coords: 30 distinct values but only 30/50 present ⇒ presence filter.
  assert.ok(f.presence.some((x) => x.field === 'coords' && x.present === 30),
    'coords should be a presence filter, not a facet');
  // country: 2 buckets ⇒ facet.
  assert.ok(f.facets.some((x) => x.field === 'country' && x.distinct === 2));
});

test('uniform field (every item identical) reported as a dead end', () => {
  const items = [
    { uri: 'a', label: 'A', type: 'university' },
    { uri: 'b', label: 'B', type: 'university' },
    { uri: 'c', label: 'C', type: 'university' },
  ];
  const f = frontierOf(new Bundle(items, 'org', 'unis'));
  assert.ok(f.uniform.some((x) => x.field === 'type' && x.value === 'university'));
  assert.ok(!f.facets.some((x) => x.field === 'type'), 'uniform field is not sliceable');
});

test('reports bundle type, size and label', () => {
  const f = frontierOf(mpBundle());
  assert.equal(f.type, 'human');
  assert.equal(f.size, 5);
  assert.equal(f.label, 'Test MPs');
});

test('empty bundle yields empty frontier, no throw', () => {
  const f = frontierOf(new Bundle([], 'human', 'none'));
  assert.equal(f.size, 0);
  assert.deepEqual(f.facets, []);
  assert.deepEqual(f.presence, []);
});
