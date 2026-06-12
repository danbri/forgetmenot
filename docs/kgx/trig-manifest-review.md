# KGX TriG manifest — review and rationalization

> Companion to [`node-flow-design.md`](./node-flow-design.md) (which
> introduces TriG as the manifest/control plane) and
> [`slim-channel-dataflow.md`](./slim-channel-dataflow.md) (which proposes
> per-chain-per-op named graphs).
>
> Status: review of what's there today, plus a proposed canonical shape.
> No code changes in this commit. Migration path at the bottom.
> Audience: anyone touching `lib/trig.mjs`, `lib/chain-store.mjs`, or
> wiring a new consumer of saved chains.

## What we have today

Two files own the TriG story:

- **`lib/trig.mjs`** — `chainToTrig(spec, { graphIri?, beads?, ranAt? })`.
  Serialises a chain spec into a single named graph containing one
  bundle node per step plus optional per-bead run records.
- **`lib/chain-store.mjs`** — pure helpers around a writable side
  Oxigraph at `/kgx/chains-query` + `/kgx/chains-update`. Saves a chain
  as a TriG named graph; `SELECT`s a list of saved chains; `CONSTRUCT`s
  a single chain back out by graph IRI.

### IRIs in use

| Role | Form | Example |
|---|---|---|
| Chain graph | `urn:kgx:flow:<uuid>` | `urn:kgx:flow:0c1f-…` |
| Bundle node | `https://forgetmenot.local/bundle/b<step>` | `kgxb:b0`, `kgxb:b1` |
| Run record | `https://forgetmenot.local/run/r<step>` | `kgxr:r0`, `kgxr:r1` |
| Source (declared) | `https://forgetmenot.local/source/...` | *unused* |
| Vocab | `https://forgetmenot.local/vocab/kgx/` | `kgx:SourceBundle`, … |

### Vocabulary in use

- Bundle kinds: `kgx:SourceBundle`, `kgx:FilterBundle`,
  `kgx:PivotBundle`, `kgx:AugmentBundle`.
- Lineage: `kgx:derivedFrom`.
- Source bundle: `kgx:starterId` (library starter id, e.g. `"uk-mps-1900"`).
- Pivot bundle: `kgx:relTemplate`, `kgx:relVariant`.
- Filter / augment bundle: `kgx:op`, `kgx:opValue` (both string literals).
- Run records: `prov:Activity`, `kgx:Run`, `prov:generated`,
  `prov:startedAtTime`, `kgx:engineId`, `kgx:durationMs`,
  `kgx:resultSize`, `kgx:bindHash`.
- Chain metadata: `dct:title`, `dct:description`, `dct:identifier`,
  `dct:created`.

### What the manifest is and isn't

It IS: a static description of a chain's spec — what the steps do, in
what order, with what derivation links — plus an optional record of
when it ran and how long each step took.

It ISN'T: the actual data the chain produced. The bundle nodes are
descriptions of the *operations*, not of the resulting RDF facts.
Today the result data lives in JS `Bundle.items` objects in the page
and is rematerialised by replaying cached SPARQL bindings on demand;
see `slim-channel-dataflow.md` for the proposed move toward per-op
named graphs.

## Findings

### F1 — Bundle and Run IRIs collide across chains

`<https://forgetmenot.local/bundle/b0>` is identical in every chain.
Two saved chains both assert `kgxb:b0 a kgx:SourceBundle`. In the
writable Oxigraph they live in different named graphs so `?g`
distinguishes them at query time, but the TriG file *as a standalone
artefact* has the same IRI re-used for an unrelated thing. Concat two
chain TriGs into one document and you've quietly merged unrelated
bundles.

The same applies to run records (`kgxr:r0`, …).

### F2 — Namespace authority is `forgetmenot.local`

The mDNS pseudo-TLD. No DNS will ever resolve it, by design of mDNS.
That's not *wrong* for an opaque IRI, but it mixes badly with our
graph IRIs, which use `urn:kgx:flow:`. Two URI schemes for the same
project's identifiers, with no documented reason.

Two clean options:
- All-`urn:` (`urn:kgx:vocab:`, `urn:kgx:chain:<uuid>`, …). Maximally
  consistent. Never dereferenceable.
- All-HTTP under a domain we own (e.g. `https://fpkg.fly.dev/vocab/`).
  Allows future dereferenceable vocab pages. Requires us to actually
  serve the docs at that URL — we don't today, but the door stays open.

### F3 — `kgxs:` (source) prefix declared but never used

Dead code in `PREFIXES`. Should be removed or actually used (e.g. for
upstream endpoint IRIs — `kgxs:qlever-wikidata`, `kgxs:ddp-sparql`).

### F4 — `kgx:op` is a string literal, not an IRI

```
kgxb:b1 kgx:op "party" ;
        kgx:opValue "Conservative" .
```

A TriG reader with no knowledge of the JS op registry sees `"party"`
as opaque. Compare:

```
kgxb:b1 kgx:op kgx:PartyFilter ;
        kgx:partyName "Conservative" .
```

The second form lets the IRI `kgx:PartyFilter` carry its own
documentation, lets SHACL constrain "PartyFilter bundles have exactly
one `kgx:partyName`", and lets cross-chain queries ask "every filter
whose op is a `kgx:PartyFilter`" without doing string comparison.

### F5 — `kgx:opValue` conflates value types per op

Today every filter value comes through `kgx:opValue` as a string:

| Op | `opValue` actually means | Lossy? |
|---|---|---|
| `party` | party name | no |
| `decade` | decade label like `"1910s"` | no, but conflates `"1910"` and `"1910s"` if anyone ever swaps |
| `gender` | enum value `"female"` etc | no |
| `desc-contains` | free-text substring | no |
| `latestStart` | a year integer rendered as string | yes — loses xsd:integer typing |
| `*-min` / `*-max` | numeric thresholds | yes — same |

Suggested: emit op-specific predicates with proper datatypes
(`kgx:partyName "Conservative"`, `kgx:decade "1910s"`,
`kgx:latestStartYear "1992"^^xsd:integer`, etc.).

### F6 — Bundle IRIs disagree with the slim-channel doc's bead-graph IRIs

The slim-channel doc proposes per-op result graphs at
`urn:fmn:chain/<id>/bead/<step>/<op>`. The TriG manifest names the
same bead `<https://forgetmenot.local/bundle/b<step>>`. If we want one
model — bundle node IRI == named graph IRI holding that bundle's RDF
results — we should pick one. The natural pick is the URN form,
chain-scoped.

### F7 — Multi-branch chains lose information through TriG

The page supports fork chains (the "Fork demo" library card; see
`branches.mjs`). The TriG manifest emits only the active branch's
linear walk. Sibling branches aren't represented. The
`node-flow-design.md` parent already names the desired vocab — a
`gog:forkedFrom` / `gog:variantOf` predicate between bundles — but
nothing emits it yet. The lossy serialisation is documented inline in
`chainToTrig`: *"Future commits will add multi-branch serialisation"*.

### F8 — TriG → spec rehydrate is a stub

`_loadChainFromStore` in `daisychain/index.html:3320` tries to short-
circuit by looking up the saved chain's `dct:identifier` in the library
and replaying as a library pick. If there's no match, it prints a
status saying "full TriG → spec rehydrate is a follow-up" and gives up.

So today: write-side TriG is real (you can save a chain to Oxigraph),
read-side is half-built (you can only re-open saved chains that
correspond to a library template). The persistent form is asymmetric.

### F9 — Two parallel chain representations

JSON spec lives in the URL hash and in `lib/library.mjs`. TriG lives
in the writable Oxigraph. Neither is canonical de jure. De facto JSON
is canonical and TriG is a derived-but-not-quite-faithful manifest.
Worth declaring explicitly:
- which one is the source of truth;
- which one is materialised from the other;
- what the round-trip contract is (lossless? lossy on forks? lossy on
  per-bead provenance like ranAt?).

### F10 — `dct:identifier` is the LIBRARY id, not a per-chain id

If you save the "Sitting Conservatives" library card to your store,
you get `flowGraph dct:identifier "sitting-conservatives"`. Now save
it again tomorrow with one extra step and you get another graph
asserting the same `dct:identifier`. They're different chains; the
identifier is being used to mean "this is which library template this
came from". The intended `dct:identifier` semantics are "a unique
identifier for this resource" — so today's use is technically incorrect.

Suggested:
- `dct:identifier <urn:kgx:chain:<uuid>>` — the chain's own id.
- `kgx:libraryTemplate "sitting-conservatives"` — separate predicate
  for "which library card was this saved from", optional.

### F11 — Three meanings of "kgx" floating around

- `kgx:` — vocab namespace prefix.
- `kgxb:` — bundle instance IRI prefix.
- `kgxr:` — run instance IRI prefix.
- `kgxs:` — source instance IRI prefix (declared, unused).

Easy to confuse when reading the code. Worth either flattening
(everything under one `kgx:` prefix with structured local names) or
documenting why the split exists. The split exists today purely to
shorten output, not for any semantic reason.

### F12 — Per-bead op-graphs aren't named in the manifest

The slim-channel design wants each augment op to materialise its
result quads into a named graph
(`urn:fmn:chain/<id>/bead/<step>/<op>`). The manifest today doesn't
mention these graphs at all — it describes the operation, not its
output. When we move to slim channels, the manifest should also assert
"this bundle's result data lives in graph X", so a downstream consumer
can `CONSTRUCT { GRAPH ?g { ?s ?p ?o } } WHERE { GRAPH <X> { ?s ?p ?o } }`
without guessing the IRI.

## Proposed canonical shape

### IRI conventions (all URN, chain-scoped)

| Role | Form |
|---|---|
| Chain graph | `urn:kgx:chain:<uuid>` |
| Bundle node ID | `urn:kgx:chain:<uuid>:bead:<step>` |
| Result-data named graph | `urn:kgx:chain:<uuid>:bead:<step>:graph` |
| Run record | `urn:kgx:chain:<uuid>:bead:<step>:run:<run-uuid>` |
| Vocab | `urn:kgx:vocab:` |

The shift from `flow` → `chain` is cosmetic but the rest matter:
- Bundle IRIs are chain-scoped, so cross-chain queries are
  unambiguous.
- Bundle node ID and result-data graph share a stem, so the manifest
  can assert `bead0 kgx:resultGraph <bead0:graph> .` and consumers
  know exactly where to look.
- Run records are chain-and-bead-scoped, so re-running a single bead
  can produce a fresh run record without colliding with the previous
  one. Re-running the whole chain (rare) gets a fresh chain UUID.

### Op terms as IRIs

Replace string-literal op IDs with vocab terms:

```
kgx:SourceOp        kgx:FilterOp        kgx:PivotOp         kgx:AugmentOp
  ↓ sub-typed:
kgx:PartyFilter   ⊂ kgx:FilterOp
kgx:SittingFilter ⊂ kgx:FilterOp
kgx:DecadeFilter  ⊂ kgx:FilterOp
kgx:GenderFilter  ⊂ kgx:FilterOp
kgx:DescContains  ⊂ kgx:FilterOp
kgx:LatestStart   ⊂ kgx:FilterOp
…
kgx:RelPivot      ⊂ kgx:PivotOp           with kgx:relTemplate / kgx:relVariant
kgx:Enrich        ⊂ kgx:AugmentOp
kgx:ParlEnrich    ⊂ kgx:AugmentOp
kgx:IdentityBridge ⊂ kgx:AugmentOp
```

And replace `kgx:opValue` with typed, op-specific predicates:

```
kgx:partyName       "Conservative"
kgx:decade          "1910s"
kgx:gender          kgx:Female              # an IRI, not a literal
kgx:descContains    "royal"
kgx:latestStartYear "1992"^^xsd:integer
kgx:sitelinksMin    "5"^^xsd:integer
```

Bundle nodes carry only the predicates that apply to their op kind.
That gives SHACL something concrete to constrain — one shape per op
kind — and makes manifest queries direct.

### Branch representation

Add `kgx:forkedFrom` (or rename `kgx:derivedFrom` to mean linear
derivation and use `kgx:variantOf` for siblings — borrow `gog:`
vocab from `node-flow-design.md`). Each fork bead asserts:

```
bead<i>  kgx:derivedFrom bead<i-1> ;
         kgx:branch       "branch-name" .
```

And the chain graph asserts the active branch:

```
chain    kgx:activeBranch "branch-name" .
```

So a multi-branch chain serialises losslessly: all branches present,
one marked active.

### Round-trip contract

State explicitly:
- TriG manifest is **the canonical persistent form** of a chain.
- URL-hash JSON is a UI shorthand projected from the manifest.
- `chainToTrig(spec)` and `trigToChain(graph)` are inverses, modulo
  the run records (which are run-time only).

This makes `_loadChainFromStore` no longer a stub: the loader runs
`CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <chain> { ?s ?p ?o } }`, parses
back into a spec, and dispatches `library-pick` exactly as if it had
been built from the library card.

## Migration

Two phases. Phase 1 is safe-now refactoring; Phase 2 is the format
change and needs care because saved chains in the writable Oxigraph
will be in the old shape.

### Phase 1 — safe-now (no IRI changes, no migration)

| Step | Change | Risk |
|---|---|---|
| 1a | Remove unused `kgxs:` PREFIX entry | none |
| 1b | Add `trigToChain(graph)` parser to round-trip the existing shape | none (new code; doesn't change writes) |
| 1c | Wire `_loadChainFromStore` to use `trigToChain` and stop printing "follow-up" | none (only enables what was previously rejected) |
| 1d | Add multi-branch emission with `kgx:variantOf` predicates between sibling bundles, keep linear-derivation tests green | low (additive triples; readers ignore unknown predicates) |
| 1e | Add unit tests for round-trip identity (`chainToTrig` ∘ `trigToChain` = id) | none |

Phase 1 leaves the IRI shape exactly as it is today. Existing saved
chains in Oxigraph keep working. Tests keep their regex shape.

### Phase 2 — IRI rationalization (breaking; needs migration)

| Step | Change | Risk |
|---|---|---|
| 2a | Vocab moves to `urn:kgx:vocab:` (or `https://fpkg.fly.dev/vocab/`) | breaking — every saved chain has old `forgetmenot.local` IRIs |
| 2b | Bundle IRIs become `urn:kgx:chain:<uuid>:bead:<i>` | breaking |
| 2c | Run IRIs follow the same pattern | breaking |
| 2d | Op terms become IRIs; typed op-value predicates replace `kgx:opValue` | breaking |
| 2e | Migrator: read old saved chains, normalise to new shape, re-INSERT | one-time job |

Phase 2 should land all-or-nothing in one commit (or a small series
with a feature flag), so we don't have half-old half-new saved chains
floating around. The migrator is a small script: read each
`<urn:kgx:flow:...>` graph, run a SPARQL CONSTRUCT with renaming, DROP
+ INSERT the result under the new IRI. CLI-runnable.

## Open questions for Phase 2

1. **Authority for vocab IRIs.** All-URN (`urn:kgx:vocab:`) is the
   minimal-commitment choice. HTTP-under-a-domain-we-own
   (`https://fpkg.fly.dev/vocab/kgx/`) costs nothing extra today and
   leaves the door open to serve dereferenceable term docs later.
   Either works; pick one and stick to it.

2. **Should `kgx:gender` value be an IRI or a literal?** Currently
   `"female"`. The proposal above uses `kgx:Female` as an IRI; that
   buys SHACL constraints and avoids spelling drift but adds a tiny
   vocab list to maintain. Worth doing if and only if there are other
   places we want closed-enum semantics.

3. **Do we lift the `LIBRARY` entries to TriG too?** The library is
   currently JS. Treating each library card as a starter TriG file
   (loaded into the read-only `/kgx/query` Oxigraph) would unify the
   "library entry" and "saved chain" representations completely. Out
   of scope for this review; flag as a sequel.

4. **Where do op result graphs (slim-channel) live in the manifest?**
   The bundle node could carry `kgx:resultGraph <chain:bead:i:graph>`
   so a consumer of the manifest can find the data without a side
   channel. That predicate is cheap and self-describing; recommend
   adding it as part of Phase 2.

## Non-goals

- Not changing the chain JSON spec shape (`{ steps: [...] }` stays
  exactly as it is — it's the URL-hash format and changing it
  invalidates every shared link).
- Not adopting a new RDF vocabulary alignment with external
  ontologies (PROV-O, VOID, …). The existing `prov:Activity` use is
  fine; deeper alignment is a separate exercise.
- Not changing how chains are saved or loaded transport-wise. The
  /kgx/chains-update and /kgx/chains-query SPARQL Update/Query
  endpoints stay.

## Decision

Phase 1 is small, safe, and strictly improves the system (TriG
becomes round-trippable; the "follow-up" status message goes away;
unused prefix removed). **Phase 1 is done** (1a + 1b + 1c + 1d + 1e
shipped 2026-06-11).

Phase 2 is the more interesting rationalization and the right answer
to F1, F2, F4, F5, F6, F10.

### Phase 2A — landed 2026-06-11

The IRI scheme migration:

- **F1 fixed**: bundle IRIs are now chain-scoped URNs —
  `urn:kgx:chain:<chain-uuid>:bead:<i>` (single-branch) or
  `urn:kgx:chain:<chain-uuid>:bead:<branch>:<i>` (forked branches). No
  cross-chain collisions. Two saved chains' "bead 0" are now
  unambiguously different bundles.
- **F2 fixed**: `forgetmenot.local` is gone from the emit. Vocab moves
  to `urn:kgx:vocab:`. Chain graph IRI minted as
  `urn:kgx:chain:<uuid>` (rename from `urn:kgx:flow:<uuid>`).
- **F11 fixed**: `kgxb:` and `kgxr:` PREFIXES dropped. Chain-scoped
  IRIs are clear in long form.

There are no saved chains in the OLD shape — Phase 2A landed before
the writable Oxigraph saw real use. The reader and writer both target
`urn:kgx:chain:<uuid>` + `urn:kgx:vocab:` only; no back-compat
plumbing. If we ever need to round-trip pre-Phase-2A artefacts they
can be normalised offline with a one-shot SPARQL Update — not in the
hot path.

### Phase 2B — deferred

The typed-op-terms (`kgx:PartyFilter ⊂ kgx:FilterOp`) and typed op
predicates (`kgx:partyName "Conservative"` in place of `kgx:op "party"`
+ `kgx:opValue "Conservative"`) replace F4 and F5. These require the
runtime op palette to map op-id → vocab-term and emit per-op
predicates. Tractable but not in this round.

### Phase 2C — `kgx:resultGraph`

Once slim-channel Step 1 wires bead-store graph IRIs through the
runner, the manifest emits
`<bead> kgx:resultGraph <urn:kgx:chain:<chain-uuid>:bead:<i>:graph>`
so an external consumer can find the bead's data via SPARQL CONSTRUCT
without guessing the IRI. Addresses F12.
