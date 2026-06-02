// Unit tests for the chain-spec branch normaliser —
// demos/parliament-live/web/kgx/lib/branches.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseChainSpec, activeChainSteps,
} from '../../demos/parliament-live/web/kgx/lib/branches.mjs';

// ---------------------------------------------------------------------------
// Flat (legacy) input → single 'main' branch
// ---------------------------------------------------------------------------

const FLAT = {
  title: 'Sitting Labour',
  steps: [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'party', value: 'Labour Party' },
    { kind: 'op', op: 'sitting' },
  ],
};

test('flat spec normalises to a single-branch tree with id "main"', () => {
  const n = normaliseChainSpec(FLAT);
  assert.equal(n.activeBranch, 'main');
  assert.equal(n.branches.length, 1);
  assert.equal(n.branches[0].id, 'main');
  assert.deepEqual(n.branches[0].steps, FLAT.steps);
});

test('flat spec preserves title / sub / id when present', () => {
  const n = normaliseChainSpec({ ...FLAT, sub: 'sub', id: 'an-id' });
  assert.equal(n.title, FLAT.title);
  assert.equal(n.sub,   'sub');
  assert.equal(n.id,    'an-id');
});

test('flat spec with no steps throws', () => {
  assert.throws(() => normaliseChainSpec({}),               /declare either `steps` or `branches`/);
  assert.throws(() => normaliseChainSpec({ steps: [] }),    /no steps/);
});

// ---------------------------------------------------------------------------
// Tree input — validation
// ---------------------------------------------------------------------------

const TREE = {
  title: 'Two branches',
  activeBranch: 'with-bp',
  branches: [
    { id: 'main', steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
    ] },
    { id: 'with-bp', forkedFrom: { branch: 'main', beadIdx: 2 }, steps: [
      { kind: 'op', op: 'rel-pivot', template: 'birthplaces', variant: 'default' },
    ] },
  ],
};

test('tree spec validates: every branch has id + steps; parent branches exist', () => {
  const n = normaliseChainSpec(TREE);
  assert.equal(n.activeBranch, 'with-bp');
  assert.deepEqual(n.branches.map((b) => b.id), ['main', 'with-bp']);
});

test('tree spec throws on duplicate branch id', () => {
  assert.throws(() => normaliseChainSpec({
    branches: [
      { id: 'a', steps: [{ kind: 'starter', id: 'x' }] },
      { id: 'a', steps: [{ kind: 'starter', id: 'y' }] },
    ],
  }), /duplicate branch id/);
});

test('tree spec throws when a branch has no steps', () => {
  assert.throws(() => normaliseChainSpec({
    branches: [{ id: 'a', steps: [] }],
  }), /has no steps/);
});

test('tree spec throws when forkedFrom references an unknown branch', () => {
  assert.throws(() => normaliseChainSpec({
    branches: [
      { id: 'a', steps: [{ kind: 'starter', id: 'x' }] },
      { id: 'b', forkedFrom: { branch: 'nope', beadIdx: 0 }, steps: [{ kind: 'op', op: 'sitting' }] },
    ],
  }), /forks from unknown branch "nope"/);
});

test('tree spec throws when forkedFrom.beadIdx is out of range', () => {
  assert.throws(() => normaliseChainSpec({
    branches: [
      { id: 'a', steps: [{ kind: 'starter', id: 'x' }] },
      { id: 'b', forkedFrom: { branch: 'a', beadIdx: 5 }, steps: [{ kind: 'op', op: 'sitting' }] },
    ],
  }), /beadIdx=5, but that branch has only 1 steps/);
});

test('tree spec throws on cyclic fork dependencies', () => {
  // a forks from b, b forks from a → cycle
  assert.throws(() => normaliseChainSpec({
    branches: [
      { id: 'a', forkedFrom: { branch: 'b', beadIdx: 0 }, steps: [{ kind: 'op', op: 'sitting' }] },
      { id: 'b', forkedFrom: { branch: 'a', beadIdx: 0 }, steps: [{ kind: 'op', op: 'sitting' }] },
    ],
  }), /cycle detected/);
});

test('tree spec topo-sorts so parents land before children', () => {
  const n = normaliseChainSpec({
    branches: [
      // declared out of order — child first
      { id: 'leaf',   forkedFrom: { branch: 'mid',  beadIdx: 0 }, steps: [{ kind: 'op', op: 'sitting' }] },
      { id: 'mid',    forkedFrom: { branch: 'root', beadIdx: 1 }, steps: [{ kind: 'op', op: 'sitting' }] },
      { id: 'root',   steps: [
        { kind: 'starter', id: 'x' },
        { kind: 'op', op: 'sitting' },
      ] },
    ],
    activeBranch: 'leaf',
  });
  assert.deepEqual(n.branchesInTopoOrder.map((b) => b.id), ['root', 'mid', 'leaf']);
});

// ---------------------------------------------------------------------------
// activeChainSteps — concatenated linear walk from root to active branch.
// ---------------------------------------------------------------------------

test('activeChainSteps on a flat tree returns the spine verbatim', () => {
  const n = normaliseChainSpec(FLAT);
  const steps = activeChainSteps(n);
  assert.deepEqual(steps, FLAT.steps);
});

test('activeChainSteps stitches parent prefix + child steps at the fork point', () => {
  const n = normaliseChainSpec(TREE);
  const steps = activeChainSteps(n);
  // main's 3 steps (the fork was AFTER bead 2, so include all of main),
  // then with-bp's 1 step. 4 total.
  assert.equal(steps.length, 4);
  assert.equal(steps[0].kind, 'starter');
  assert.equal(steps[1].op,   'party');
  assert.equal(steps[2].op,   'sitting');
  assert.equal(steps[3].op,   'rel-pivot');
  assert.equal(steps[3].template, 'birthplaces');
});

test('activeChainSteps when activeBranch points at an ancestor returns just its steps', () => {
  const n = normaliseChainSpec({ ...TREE, activeBranch: 'main' });
  const steps = activeChainSteps(n);
  assert.equal(steps.length, 3);
  // No rel-pivot from with-bp — we're on `main`.
  assert.equal(steps.some((s) => s.op === 'rel-pivot'), false);
});

test('activeChainSteps handles three-deep fork chains', () => {
  // root: starter + sitting
  // mid: forks from root.beadIdx=0 (after starter), adds party
  // leaf: forks from mid.beadIdx=0 (after party), adds rel-pivot
  // active=leaf → starter + party + rel-pivot   (NOT root's sitting)
  const n = normaliseChainSpec({
    activeBranch: 'leaf',
    branches: [
      { id: 'root', steps: [
        { kind: 'starter', id: 'uk-mps-1900' },
        { kind: 'op', op: 'sitting' },
      ] },
      { id: 'mid', forkedFrom: { branch: 'root', beadIdx: 0 }, steps: [
        { kind: 'op', op: 'party', value: 'Labour Party' },
      ] },
      { id: 'leaf', forkedFrom: { branch: 'mid', beadIdx: 0 }, steps: [
        { kind: 'op', op: 'rel-pivot', template: 'birthplaces', variant: 'default' },
      ] },
    ],
  });
  const steps = activeChainSteps(n);
  assert.deepEqual(steps.map((s) => s.kind === 'starter' ? `starter:${s.id}` : `op:${s.op}`),
    ['starter:uk-mps-1900', 'op:party', 'op:rel-pivot']);
});
