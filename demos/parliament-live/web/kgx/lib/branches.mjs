// =============================================================================
// kgx/lib/branches.mjs — chain-spec branch normaliser
//
// The original chain spec is a flat sequence: { steps: [...] }. Forks
// require a tree of named branches that share a common prefix. This file
// normalises both shapes into a uniform tree so the runner + UI don't
// have to special-case the single-branch path.
//
// Two accepted input shapes:
//
//   FLAT (legacy, single branch):
//     { title?, sub?, id?, steps: [...] }
//
//   TREE (forks):
//     {
//       title?, sub?, id?,
//       activeBranch?: 'main',                    // optional UI hint
//       branches: [
//         { id: 'main',     label?, steps: [...] },
//         { id: 'alt-A',    label?, steps: [...], forkedFrom: { branch: 'main',  beadIdx: 2 } },
//         { id: 'alt-A-B',  label?, steps: [...], forkedFrom: { branch: 'alt-A', beadIdx: 1 } },
//       ],
//     }
//
// `normaliseChainSpec(spec)` returns a normalised TREE-shape object
// regardless of input; flat inputs become a single 'main' branch with no
// fork point. Cycles and unknown fork parents throw.
//
// The runner can then iterate `out.branchesInTopoOrder` and execute each
// branch starting from the snapshotted bundle at the parent's
// `forkedFrom.beadIdx`. Today the runner consumes the legacy single-
// branch flat case only; this module is the foundation for the tree
// walker.
// =============================================================================

export function normaliseChainSpec(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('normaliseChainSpec: spec must be an object');
  }
  // FLAT → single-branch TREE.
  if (Array.isArray(input.steps)) {
    if (!input.steps.length) throw new Error('normaliseChainSpec: spec has no steps');
    const branch = { id: 'main', label: 'main', steps: input.steps };
    return {
      title: input.title || null,
      sub:   input.sub   || null,
      id:    input.id    || null,
      // `_ts` carries a save timestamp set by the chain-store save intent.
      // Pass through so chainToTrig can emit dct:created. Underscored to
      // signal it's metadata about the spec, not part of the chain shape.
      _ts:   input._ts   || null,
      activeBranch: 'main',
      branches: [branch],
      branchesInTopoOrder: [branch],
    };
  }
  if (!Array.isArray(input.branches) || !input.branches.length) {
    throw new Error('normaliseChainSpec: spec must declare either `steps` or `branches`');
  }

  // Validate every branch + its fork-from reference.
  const byId = new Map();
  for (const b of input.branches) {
    if (!b?.id) throw new Error('normaliseChainSpec: every branch needs an id');
    if (byId.has(b.id)) throw new Error(`normaliseChainSpec: duplicate branch id "${b.id}"`);
    if (!Array.isArray(b.steps) || !b.steps.length) {
      throw new Error(`normaliseChainSpec: branch "${b.id}" has no steps`);
    }
    byId.set(b.id, b);
  }
  // Root branches have no forkedFrom; every other branch must reference
  // a known parent.
  for (const b of input.branches) {
    if (!b.forkedFrom) continue;
    const { branch: parent, beadIdx } = b.forkedFrom;
    if (!byId.has(parent)) {
      throw new Error(`normaliseChainSpec: branch "${b.id}" forks from unknown branch "${parent}"`);
    }
    if (!Number.isInteger(beadIdx) || beadIdx < 0) {
      throw new Error(`normaliseChainSpec: branch "${b.id}" forkedFrom.beadIdx must be a non-negative integer`);
    }
    const parentBranch = byId.get(parent);
    if (beadIdx >= parentBranch.steps.length) {
      throw new Error(`normaliseChainSpec: branch "${b.id}" forks from "${parent}" beadIdx=${beadIdx}, but that branch has only ${parentBranch.steps.length} steps`);
    }
  }
  // Topo-sort: parents before children. Trip on cycles.
  const ordered = [];
  const seen    = new Set();
  const visit = (b, stack = new Set()) => {
    if (seen.has(b.id)) return;
    if (stack.has(b.id)) {
      throw new Error(`normaliseChainSpec: cycle detected involving branch "${b.id}"`);
    }
    if (b.forkedFrom) {
      stack.add(b.id);
      visit(byId.get(b.forkedFrom.branch), stack);
      stack.delete(b.id);
    }
    seen.add(b.id);
    ordered.push(b);
  };
  for (const b of input.branches) visit(b);

  const activeBranch = input.activeBranch || ordered[0].id;
  if (!byId.has(activeBranch)) {
    throw new Error(`normaliseChainSpec: activeBranch "${activeBranch}" not in branches`);
  }
  return {
    title: input.title || null,
    sub:   input.sub   || null,
    id:    input.id    || null,
    _ts:   input._ts   || null,
    activeBranch,
    branches: input.branches,
    branchesInTopoOrder: ordered,
  };
}

// Convenience: extract the (linear) sequence of steps that runs from the
// root to the active branch, including the fork-prefix from each parent.
// Each ancestor contributes steps [0 .. child.forkedFrom.beadIdx + 1)
// — i.e. up to and including the fork point. The active branch
// contributes all its own steps. Returns null if active-branch is
// unknown.
export function activeChainSteps(normalised) {
  const id = normalised.activeBranch;
  const byId = new Map(normalised.branches.map((b) => [b.id, b]));
  if (!byId.has(id)) return null;
  // Stack walked from active branch up to its root, then reversed so
  // ancestors precede descendants.
  const stack = [];
  for (let cur = byId.get(id); cur; cur = cur.forkedFrom ? byId.get(cur.forkedFrom.branch) : null) {
    stack.push(cur);
  }
  stack.reverse();
  const out = [];
  for (let i = 0; i < stack.length; i++) {
    const b = stack[i];
    const upTo = (i === stack.length - 1)
      ? b.steps.length                         // active branch: all its steps
      : stack[i + 1].forkedFrom.beadIdx + 1;   // ancestor: up to the fork point
    for (const step of b.steps.slice(0, upTo)) out.push(step);
  }
  return out;
}
