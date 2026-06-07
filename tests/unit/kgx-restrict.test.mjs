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
  opFilters, OP_FIELDS, opsRelevantTo, nameGender,
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
  { uri: 'wd:Q6', label: 'George Fisher', parties: [],                    sitting: false, mpid: null,   decade: null,    gender: null     },
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
// gender — legacy plain-string + picker rows + heuristic
// ---------------------------------------------------------------------------

test('opFilters.gender — legacy "female" / "male" matches exact P21 only', () => {
  const out = opFilters.gender(HUMANS, 'female');
  assert.deepEqual(out.items.map((x) => x.uri).sort(), ['wd:Q1', 'wd:Q3', 'wd:Q5']);
});

test('opFilters.gender — picker "female (exact P21)" matches exact P21 only', () => {
  const out = opFilters.gender(HUMANS, 'female (exact P21)');
  assert.deepEqual(out.items.map((x) => x.uri).sort(), ['wd:Q1', 'wd:Q3', 'wd:Q5']);
});

test('opFilters.gender — picker "+ first-name heuristic" extends matching only to items with no gender', () => {
  // George Fisher has no .gender; nameGender('George Fisher') = 'male'.
  // Heuristic match adds him to the male set.
  const out = opFilters.gender(HUMANS, 'male (+ first-name heuristic)');
  const uris = out.items.map((x) => x.uri).sort();
  assert.deepEqual(uris, ['wd:Q2', 'wd:Q4', 'wd:Q6']);   // Bob, Dave (exact) + George (heuristic)
});

test('opFilters.gender — unknown value returns empty bundle of same type', () => {
  const out = opFilters.gender(HUMANS, 'unknown');
  assert.equal(out.size, 0);
  assert.equal(out.type, 'human');
});

// ---------------------------------------------------------------------------
// citizenship / has-origin / by-mp-party / in-commons / in-lords /
// top-by-size / top-by-officer-count / name-contains
// ---------------------------------------------------------------------------

test('opFilters.citizenship — Array.includes on .citizenships', () => {
  const HUMANS_W_CITZ = new Bundle([
    { uri: 'a', citizenships: ['United Kingdom'] },
    { uri: 'b', citizenships: ['United Kingdom', 'Ireland'] },
    { uri: 'c', citizenships: [] },
    { uri: 'd' },  // no field at all
  ], 'human', 'x');
  const uk = opFilters.citizenship(HUMANS_W_CITZ, 'United Kingdom');
  assert.deepEqual(uk.items.map((x) => x.uri).sort(), ['a', 'b']);
  const ie = opFilters.citizenship(HUMANS_W_CITZ, 'Ireland');
  assert.deepEqual(ie.items.map((x) => x.uri), ['b']);
});

test('opFilters.by-mp-party — filter constituencies by their currentMpParty field', () => {
  const SEATS = new Bundle([
    { uri: 'c1', currentMpParty: 'Labour' },
    { uri: 'c2', currentMpParty: 'Conservative' },
    { uri: 'c3', currentMpParty: 'Labour' },
    { uri: 'c4' },                          // no field
  ], 'constituency', 'seats');
  const lab = opFilters['by-mp-party'](SEATS, 'Labour');
  assert.deepEqual(lab.items.map((x) => x.uri).sort(), ['c1', 'c3']);
  assert.equal(lab.type, 'constituency');
});

test('opFilters.in-commons / in-lords — keep items with positive count fields', () => {
  const PARTIES = new Bundle([
    { uri: 'p1', commonsCount: 5,  lordsCount: 0 },
    { uri: 'p2', commonsCount: 0,  lordsCount: 3 },
    { uri: 'p3', commonsCount: 10, lordsCount: 10 },
    { uri: 'p4', commonsCount: 0,  lordsCount: 0 },
  ], 'party', 'parties');
  const c = opFilters['in-commons'](PARTIES);
  assert.deepEqual(c.items.map((x) => x.uri).sort(), ['p1', 'p3']);
  const l = opFilters['in-lords'](PARTIES);
  assert.deepEqual(l.items.map((x) => x.uri).sort(), ['p2', 'p3']);
});

test('opFilters.has-origin / top-by-size / top-by-officer-count — sort + slice', () => {
  const ITEMS = new Bundle(
    Array.from({ length: 60 }, (_, i) => ({ uri: `i${i}`, originCount: i })),
    'appg', 'x');
  const t50 = opFilters['has-origin'](ITEMS);
  assert.equal(t50.size, 50);
  // descending by originCount → first item has originCount 59
  assert.equal(t50.items[0].uri, 'i59');
  // top-by-officer-count is the same sort+slice (50)
  const officer = opFilters['top-by-officer-count'](ITEMS);
  assert.equal(officer.size, 50);
  // top-by-size caps at 25
  const sz = opFilters['top-by-size'](ITEMS);
  assert.equal(sz.size, 25);
  assert.equal(sz.items[0].uri, 'i59');
});

test('opFilters.name-contains — case-insensitive regex on .label', () => {
  const BODIES = new Bundle([
    { uri: 'b1', label: 'Foreign Affairs Committee' },
    { uri: 'b2', label: 'Joint Committee on Human Rights' },
    { uri: 'b3', label: 'Public Accounts Commission' },
    { uri: 'b4', label: 'Sub-Committee on Whatever' },
    { uri: 'b5', label: 'Select Committee on Health' },
    { uri: 'b6', label: 'Foreign Affairs Sub-Committee' },
  ], 'formal_body', 'x');
  assert.equal(opFilters['name-contains'](BODIES, 'Committee').size, 5);
  assert.equal(opFilters['name-contains'](BODIES, 'Sub-Committee').size, 2);
  assert.equal(opFilters['name-contains'](BODIES, 'Select').size, 1);
  assert.equal(opFilters['name-contains'](BODIES, 'committee').size, 5);  // case-insensitive
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

// ---------------------------------------------------------------------------
// OP_FIELDS + opsRelevantTo — the data-shape relevance map used by
// `kgx chain candidates` so the LLM/chat-UI loop sees a typed subset rather
// than the full registry.
// ---------------------------------------------------------------------------

test('OP_FIELDS has an entry for every opFilters key (no silent omission)', () => {
  for (const id of Object.keys(opFilters)) {
    assert.ok(OP_FIELDS[id], `op "${id}" missing from OP_FIELDS`);
    assert.ok(typeof OP_FIELDS[id].field === 'string', `op "${id}" missing field name`);
    assert.ok(Array.isArray(OP_FIELDS[id].types) && OP_FIELDS[id].types.length > 0,
      `op "${id}" must declare at least one applicable bundle type`);
  }
});

test('opsRelevantTo("human") returns the human-bundle palette only', () => {
  const ops = opsRelevantTo('human');
  // Must include the human-only ops.
  for (const id of ['party', 'decade', 'sitting', 'bridged', 'gender', 'citizenship']) {
    assert.ok(ops.includes(id), `${id} should be relevant to human`);
  }
  // Must EXCLUDE SI-only and constituency-only ops — that was the bug.
  for (const id of ['year', 'has-cif', 'has-origin', 'by-mp-party', 'in-commons']) {
    assert.ok(!ops.includes(id), `${id} should NOT be relevant to human`);
  }
});

test('opsRelevantTo("si") returns year + has-cif + decade only', () => {
  assert.deepEqual(opsRelevantTo('si').sort(), ['decade', 'has-cif', 'year']);
});

test('opsRelevantTo("party") returns the party-bundle palette only', () => {
  assert.deepEqual(opsRelevantTo('party').sort(), ['in-commons', 'in-lords', 'top-by-size']);
});

test('opsRelevantTo on an unknown type yields an empty list (no spurious ops)', () => {
  assert.deepEqual(opsRelevantTo('unknown'), []);
});

test('every OP_FIELDS type is one the daisychain actually produces', () => {
  // Allowlist mirrors the page's per-type OPS palette plus the generic
  // Wikidata bundle types pivots emit. If a typo sneaks in here ('humn'
  // instead of 'human'), the LLM would silently get an empty palette for
  // that op — catch it now.
  const KNOWN = new Set([
    'human', 'constituency', 'party', 'appg', 'formal_body', 'concept', 'si',
    'wd_thing', 'wd_class', 'building', 'place', 'org',
  ]);
  for (const [id, { types }] of Object.entries(OP_FIELDS)) {
    for (const t of types) {
      assert.ok(KNOWN.has(t), `op "${id}" declares unknown bundle type "${t}"`);
    }
  }
});
