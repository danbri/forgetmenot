// =============================================================================
// kgx/lib/bead-store.mjs — per-bead quad cache for slim-channel Step 1
//
// A `BeadStore` is the in-memory home of the RDF facts a chain has
// accumulated up to and including this bead. It's the concrete backing
// for `propertyOf(bead, item, p)` — the equal-status-arc accessor the
// slim-channel design proposes
// (see ../docs/kgx/slim-channel-dataflow.md §"Property access").
//
// Shape:
//
//   BeadStore = (parent: BeadStore | null,
//                bySubject: Map<URI, Map<Predicate, Array<{ o, g }>>>)
//
// Each store carries the DELTA contributed by its own bead — the
// triples the bead's op produced — plus a reference to its predecessor
// store. Property lookups walk the parent chain, so the bead's full
// `graphScope` (in the design doc's vocabulary) is recovered without
// copying triples between stores.
//
// IRI conventions for the `g` field (named-graph IRI):
//
//   - Today (slim-channel Step 1): the page's runAugment will mint
//     opaque per-op IRIs of the form `urn:kgx:bead:<uuid>:<op-id>`
//     when it constructs the store. Stable for the lifetime of the
//     chain run; not globally meaningful.
//
//   - After Phase 2 of trig-manifest-review.md: the IRIs will align
//     with the chain-scoped manifest IRIs
//     (`urn:kgx:chain:<chain-uuid>:bead:<step>:graph`), so a TriG
//     download materialises the store directly via CONSTRUCT.
//
// The `g` field is stable across the migration — callers read it as
// "which source contributed this fact"; the IRI's structure is an
// implementation detail.
//
// This module is intentionally tiny and dependency-free. It does NOT
// know SPARQL, does NOT know how to materialise to TriG, does NOT
// touch the writable Oxigraph. Those concerns live higher up and can
// land later without disturbing this contract.
// =============================================================================

export class BeadStore {
  // `parent` is the predecessor bead's store, if any. A starter bead
  // has no parent; every other bead inherits its predecessor's
  // accumulated quads via the chain.
  constructor(parent = null) {
    if (parent !== null && !(parent instanceof BeadStore)) {
      throw new TypeError('BeadStore: parent must be a BeadStore or null');
    }
    this.parent = parent;
    // bySubject: Map<URI, Map<Predicate, Array<{ o, g }>>>. Property
    // values are kept as { o, g } objects rather than bare strings
    // because the same predicate can be asserted by multiple graphs
    // (e.g. both Wikidata and DDP have a person's dateOfBirth), and
    // the renderer wants to show the provenance.
    this._bySubject = new Map();
  }

  // Add a single quad to *this* bead's delta (not the parent's).
  // Subject IRIs are canonical strings; predicates are full IRIs (not
  // CURIEs); objects can be literal values or IRI strings — opaque to
  // this layer.
  addQuad(s, p, o, g) {
    if (typeof s !== 'string' || !s) throw new TypeError('BeadStore.addQuad: subject must be a non-empty string');
    if (typeof p !== 'string' || !p) throw new TypeError('BeadStore.addQuad: predicate must be a non-empty string');
    if (typeof g !== 'string' || !g) throw new TypeError('BeadStore.addQuad: graph must be a non-empty string');
    if (!this._bySubject.has(s)) this._bySubject.set(s, new Map());
    const props = this._bySubject.get(s);
    if (!props.has(p)) props.set(p, []);
    props.get(p).push({ o, g });
  }

  // All values for (subject, predicate) across this bead's delta AND
  // every ancestor store's delta. Own quads come first; parent quads
  // follow. Each entry is `{ o, g }` so the renderer can surface
  // provenance.
  propertyOf(s, p) {
    const own    = this._bySubject.get(s)?.get(p) || [];
    const parent = this.parent ? this.parent.propertyOf(s, p) : [];
    return own.concat(parent);
  }

  // All `{ p, o, g }` triples about a subject, this bead and all
  // ancestors. Order is delta-first, then parent's properties. Useful
  // for "view source" panels that show every fact about an entity.
  propertiesOf(s) {
    const out = [];
    const props = this._bySubject.get(s);
    if (props) {
      for (const [p, vals] of props.entries()) {
        for (const v of vals) out.push({ p, o: v.o, g: v.g });
      }
    }
    if (this.parent) for (const t of this.parent.propertiesOf(s)) out.push(t);
    return out;
  }

  // Set of graph IRIs that contribute to this bead's full scope.
  // Useful for SHACL / SPARQL planning and for surfacing "data
  // sources used" in the bead-info ⓘ dialog. Order is undefined.
  graphScope() {
    const set = new Set();
    const collect = (store) => {
      for (const props of store._bySubject.values()) {
        for (const vals of props.values()) {
          for (const v of vals) set.add(v.g);
        }
      }
      if (store.parent) collect(store.parent);
    };
    collect(this);
    return [...set];
  }

  // Total quad count across this bead AND ancestors. O(N) — for
  // sanity checks and debug panels, not hot paths.
  size() {
    let n = 0;
    for (const props of this._bySubject.values()) {
      for (const vals of props.values()) n += vals.length;
    }
    return n + (this.parent?.size() || 0);
  }
}
