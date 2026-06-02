// Unit tests for the pure-client restrict primitives —
// demos/parliament-live/web/kgx/lib/restrict.mjs.
//
// These are the chip-palette filters daisychain exposes under OPS[bundle.type],
// and they're what the upcoming runChainSpec() interpreter will dispatch to
// when it walks a `{ kind: 'op', op: 'party', value: '…' }` step. Pure
// functions on plain Bundles — no network, no DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Bundle } from
  '../../demos/parliament-live/web/kgx/lib/node-flow.mjs';
import {
  opFilters, nameGender,
  GENDER_NAMES_FEMALE, GENDER_NAMES_MALE,
  countBy, sortByKey, topCounts,
} from '../../demos/parliament-live/web/kgx/lib/restrict.mjs';

// ---------------------------------------------------------------------------
// Sample bundle: a small set of mixed MPs covering each opFilters dimension.
// ---------------------------------------------------------------------------
const HUMANS = new Bundle([
  { uri: 'wd:Q1', label: 'Alice Adams',  parties: ['Labour Party'],       sitting: true,  mpid: '4001', decade: '2020s', gender: 'female' },
  { uri: 'wd:Q2', label: 'Bob Brown',    parties: ['Conservative Party'], sitting: true,  mpid: '4002', decade: '2020s', gender: 'male'   },
  { uri: 'wd:Q3', label: 'Carol Clark',  parties: ['Labour Party'],       sitting: false, mpid: null,   decade: '2010s', gender: 'female' },
  { uri: 'wd:Q4', label: 'Dave Davies',  parties: ['Liberal Democrats'],  sitting: true,  mpid: '4004', decade: '2020s', gender: 'male'   },
  { uri: 'wd:Q5', label: 'Eve Edwards',  parties: ['Labour Party','Co-operative Party'], sitting: false, mpid: '4005', decade: '2010s', gender: 'female' },
  { uri: 'wd:Q6', label: 'Frank Fisher', parties: [],                     sitting: false, mpid: null,   decade: null,    gender: null     },
], 'human', 'sample MPs');

// ---------------------------------------------------------------------------
// opFilters
// ---------------------------------------------------------------------------

test('opFilters.party keeps items whose .parties[] contains the value', () => {
  const out = opFilters.party(HUMANS, 'Labour Party');
  assert.equal(out.size, 3, 'expect 3 Labour entries (Alice, Carol, Eve via coalition)');
  assert.deepEqual(out.items.map((x) => x.uri).sort(), ['wd:Q1', 'wd:Q3', 'wd:Q5']);
  assert.equal(out.type, 'human', 'restrict preserves bundle type');
  assert.equal(out.label, 'Labour Party');
});

test('opFilters.party with an unknown party returns an empty bundle of the same type', () => {
  const out = opFilters.party(HUMANS, 'Reform UK');
  assert.equal(out.size, 0);
  assert.equal(out.type, 'human');
});

test('opFilters.decade is exact-match on the decade string', () => {
  const d2020 = opFilters.decade(HUMANS, '2020s');
  assert.deepEqual(d2020.items.map((x) => x.uri).sort(), ['wd:Q1', 'wd:Q2', 'wd:Q4']);
  const d2010 = opFilters.decade(HUMANS, '2010s');
  assert.deepEqual(d2010.items.map((x) => x.uri).sort(), ['wd:Q3', 'wd:Q5']);
});

test('opFilters.sitting keeps items whose .sitting is truthy', () => {
  // The seed always sets sitting to boolean true/false; the helper uses a
  // truthy check rather than === true, which is faithful to the chip's
  // current behaviour. If we ever want exact-true, that's a contract
  // change worth a separate decision.
  const out = opFilters.sitting(HUMANS);
  assert.deepEqual(out.items.map((x) => x.uri).sort(), ['wd:Q1', 'wd:Q2', 'wd:Q4']);
  assert.equal(out.type, 'human');
});

test('opFilters.bridged keeps only items with a truthy .mpid', () => {
  const out = opFilters.bridged(HUMANS);
  assert.deepEqual(out.items.map((x) => x.uri).sort(), ['wd:Q1', 'wd:Q2', 'wd:Q4', 'wd:Q5']);
});

test('every opFilters entry preserves bundle type and refuses to mutate input', () => {
  for (const [id, fn] of Object.entries(opFilters)) {
    const before = HUMANS.items.length;
    const arity = fn.length;
    const out = arity === 1 ? fn(HUMANS) : fn(HUMANS, 'Labour Party');
    assert.equal(out.type, HUMANS.type, `${id}: changed bundle type`);
    assert.equal(HUMANS.items.length, before, `${id}: mutated input bundle`);
    assert.ok(out !== HUMANS, `${id}: returned same Bundle reference (must be fresh)`);
  }
});

// ---------------------------------------------------------------------------
// nameGender — first-name heuristic, conservative on ambiguous names
// ---------------------------------------------------------------------------

test('nameGender resolves clearly-female / clearly-male first names', () => {
  assert.equal(nameGender('Margaret Thatcher'), 'female');
  assert.equal(nameGender('Tony Benn'),         'male');    // 'tony' is in MALE
  assert.equal(nameGender('Hilary Benn'),       'female');  // 'hilary' is in FEMALE
  assert.equal(nameGender('David Cameron'),     'male');
  assert.equal(nameGender('Theresa May'),       'female');
});

test('nameGender returns null on the documented ambiguous-in-UK-politics names', () => {
  // The dictionary's doc lists these as deliberately absent from both sets.
  // The "share no entries" test below pins that promise in code.
  for (const ambiguous of ['Alex Smith', 'Sam Jones', 'Chris Brown', 'Pat Doe',
                           'Jamie Roe', 'Lee Pat', 'Kim Black', 'Jo Public',
                           'Kit Yates', 'Leigh Day', 'Robin Walker',
                           'Bobby Pat', 'Jordan Stone', 'Morgan Lee',
                           'Taylor Green', 'Leslie King']) {
    assert.equal(nameGender(ambiguous), null, `${ambiguous}: expected null`);
  }
  assert.equal(nameGender(''),         null);
  assert.equal(nameGender(undefined),  null);
  assert.equal(nameGender('Xqzfgh Y'), null);
});

test('nameGender is case-insensitive on the first name', () => {
  assert.equal(nameGender('MARGARET'), 'female');
  assert.equal(nameGender('tony'),     'male');
});

test('GENDER_NAMES_FEMALE and GENDER_NAMES_MALE share no entries', () => {
  for (const n of GENDER_NAMES_FEMALE) {
    assert.ok(!GENDER_NAMES_MALE.has(n), `"${n}" appears in BOTH gender sets`);
  }
});

// ---------------------------------------------------------------------------
// countBy / sortByKey / topCounts
// ---------------------------------------------------------------------------

test('countBy returns [value, count] pairs sorted by count desc', () => {
  const out = countBy(HUMANS.items, 'gender');
  assert.deepEqual(out, [['female', 3], ['male', 2]]);
});

test('countBy skips items where the field is falsy (matches chip-palette behaviour)', () => {
  const out = countBy(HUMANS.items, 'mpid');
  // 4 MPs have an mpid; counts should sum to 4.
  const total = out.reduce((s, [, n]) => s + n, 0);
  assert.equal(total, 4);
});

test('sortByKey re-sorts by the first column alphabetically', () => {
  const pairs = [['z', 1], ['a', 5], ['m', 3]];
  assert.deepEqual(sortByKey(pairs), [['a', 5], ['m', 3], ['z', 1]]);
});

test('topCounts: flat string array → top-30 [value, count] descending', () => {
  const strs = ['x', 'y', 'x', 'z', 'x', 'y'];
  assert.deepEqual(topCounts(strs), [['x', 3], ['y', 2], ['z', 1]]);
});

test('topCounts caps at 30 entries', () => {
  const strs = [];
  for (let i = 0; i < 60; i++) strs.push('v' + i);   // 60 distinct values
  assert.equal(topCounts(strs).length, 30);
});
