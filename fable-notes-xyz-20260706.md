# Fable notes — handover, 2026-07-06

Written by Claude Fable 5 at danbri's request, on news that Fable
access will lapse for an unknown period. This is for whichever model
picks up the collaboration next: what this project actually is, what
state it's in, what I learned the hard way, and where I believe it
should go. Read `CLAUDE.md` first (it's binding); read this second
(it's advisory); read `docs/worklog.md` when you need the archaeology.

---

## 1. What this project actually is

Three layers, built outward from one idea — *UK civic data as a
navigable graph* — but no longer limited to it:

1. **The wrapper layer** (`skills/`, `lib/facilities/`, `bin/parl.mjs`).
   Sixty-odd skills, one per public API or dataset: every UK Parliament
   API, plus ONS, Electoral Commission, DemocracyClub, mySociety,
   legislation.gov.uk, EUR-Lex, devolved legislatures, and more. Each
   skill is SKILL.md + reference.md; each facility is a JS module the
   `parl` CLI dispatches to. This layer is mature and mostly in
   maintenance mode — the discipline is in `docs/data-quality-*.md`
   and skills/data-quality.

2. **FPKG** (`demos/parliament-live/`, live at fpkg.fly.dev). A
   graph-navigator demo estate: the daisychain chain-building UI,
   pivcab, studio, the legislation/SI/PSPO maps, sparqling, procb's
   ontology graph, and the python-interop page. Served by a zero-dep
   Node proxy+static server with a strict TTL/attribution policy
   (see `demos/parliament-live/CLAUDE.md` — probe-then-render, OPL
   attribution, fail-loud renderers).

3. **kgx / Daisychain** (`docs/kgx/`, `demos/python-interop/`,
   `demos/parliament-live/web/kgx/`). The conceptual core and the
   part danbri cares most about strategically: a **chain algebra**
   over knowledge graphs — six primitives (Source / Filter / Pivot /
   Augment / Union / Intersect / Difference), serialized as TriG
   manifests, endpoint-agnostic via `sd:Service`, executable by an
   optimising interpreter that fuses same-endpoint runs into single
   SPARQL queries. **The manifest IS the API** — any RDF-aware tool
   in any language can read, plan, and run a chain.

## 2. State of play (as of this commit)

**Daisychain 1.0 shipped yesterday** (`4d4510d2`, contract in
`docs/kgx/daisychain-1.0.md`). The right framing (danbri's, corrected
2026-07-06): Daisychain is a **DSL** — a small custom language for
set-based dataflow over knowledge graphs, whose vocabulary IS the
language — and `plan` is its **compiler**, lowering a chain plus the
circumstances (bead in focus, endpoint, cumulative upstream context,
active variant) to SPARQL on demand. (An earlier draft of these notes
and the spec doc mislabelled it a "DAL / data-access layer" — that was
my typo-inheritance of a slip; it's a DSL toolchain, not a storage
abstraction.) Python (`kgx_chain.py`) and JS (`kgx_core.mjs`) now
converge on a five-verb toolchain — load (parse) / validate
(typecheck) / plan (compile) / run (execute) / emit (serialize) — with
**byte-identical planners**, enforced by
`tests/test_kgx_conformance.sh` over all 51 example chains (51/51
green, plus live row-count parity). The spec JSON is the interchange
boundary: Python/rdflib owns TriG→spec / parse (same Python runs under
Pyodide in the browser), both sides implement compile/execute over the
spec.

Other live workstreams (some driven in sessions parallel to mine):

- **pythonchain example library**: 51 domain-broad chains
  (`demos/python-interop/examples/`), each decomposed into atomic
  beads, most pivoting through 3–5 entity types, all using positive
  (negation-free) SPARQL. Lazy-loaded, category-grouped UI with a
  dev-mode toggle hiding nerd detail.
- **procb** (`third_party/procb/`): 130 procedure-browser SPARQL
  queries mirrored, cleaned to house style, alpha-equivalence
  verified; ontology + SHACL shapes mined from the corpus; an
  interactive ontology-graph page. This is the richest source of
  *real* Parliament procedural SPARQL we have.
- **sparqling** (`skills/sparqling-cleanup`, `web/sparqling/`): a
  SPARQL cleanup methodology with an equivalence checker and an
  in-browser runner.
- **daisychain UI** (`web/kgx/daisychain/`): ~960 lines already
  lifted into `web/kgx/lib/*.mjs` (engines, starters, restrict,
  rel-templates, augment, runner, library of 20 saved chains).
  See `docs/kgx/progress.md` for the honest checklist.

## 3. Insights worth carrying forward

These are the load-bearing ideas. Some took real debugging pain to
earn.

### 3.1 Daisychain is a DSL; the manifest is the program; plan is the compiler

The most useful mental model (danbri's): the chain vocabulary is a
small **domain-specific language** for set-based dataflow over graphs,
a chain manifest is a *program* in it, and `plan` is a *compiler* that
lowers that program — plus the runtime circumstances (which bead is in
focus, its endpoint, the cumulative upstream context, the active
variant) — to a concrete SPARQL query on demand. This is why we
resisted building a "daisychain service": you don't need a service for
a language, you need a compiler, and TriG in a well-known vocabulary
(`urn:kgx:vocab:`) is readable by rdflib/Jena/Oxigraph/anything.

The spec JSON is the **compiler's IR boundary**. The 1.0 convergence
picked ONE front-end (Python/rdflib parses TriG→spec — it runs in
browsers via Pyodide, so this costs nothing) and made the spec JSON the
IR that every back-end compiles from. When you want a third
implementation (Rust? inside an LLM tool-call loop?), implement
compile/execute (plan/run) over the spec JSON and add yourself to the
conformance suite. Do NOT write another TriG parser first. (Note: an
earlier draft called this a "DAL / data-access layer." Wrong frame —
it's a DSL toolchain. Corrected across the docs 2026-07-06.)

### 3.2 Closed-world negation is the trap in federated KG work

danbri's most important design correction of the whole collaboration
(2026-06-12): "negatives... closed world assumptions in multi dataset
setting with missing data is v tricky to do well." SPARQL `NOT
EXISTS` / `MINUS` / our Difference primitive conflate *not asserted
here* with *false everywhere*. An MP without an end-date triple ≠ a
sitting MP. The example library therefore uses only positive
substitutes: temporal anchors on start dates ("seat began ≥
2024-07-04" instead of "no end date"), positive property-path
membership, positive intersections. Difference stays in the algebra
but ships no demo. Full rationale in
`docs/kgx/shared-components.md` §"Closed-world hazards". **Keep this
discipline.** It also makes chains monotonic, which is what makes
them safe for agents to fuse and reorder.

### 3.3 The ?p → ?pN identity-rebinding convention

Each Source binds `?p` and projects `?label` / `?image`. Each Pivot at
depth N walks to a fresh entity, BINDs it to `?pN`, projects
`?labelN` / `?imageN`. Consumers take the highest-numbered suffix as
"the chain's current entity". This one convention is what lets:
fragments concatenate into a single `SELECT DISTINCT *` body; the tile
renderer auto-switch displayed type per bead; and the set-based and
node-based views stay one artifact. If you redesign it, redesign it
everywhere at once (generator, renderer pickVar, both planners).

### 3.4 Upstream data is wrong in specific, discoverable ways

Live-verify everything. Concrete scars, all found by running queries
rather than trusting memory:

- qlever.dev's Wikidata snapshot contains `wd:P169 wdt:P31 wd:Q5` —
  the *CEO property* asserting it's a human. Every "all humans"
  source now carries `FILTER(STRSTARTS(STR(?p), ".../entity/Q"))`.
- QIDs move: Cambridge Footlights was Q1027879 in my training
  memory; it's Q857679 now (Q1027879 is "graphics"). Booker Prize,
  Pixar, Northern line, brewery, cocktail — all differed from
  memory in qlever's snapshot. **Never emit a QID without probing
  it**; this is the KG version of CLAUDE.md's probe-then-render rule.
- qlever's snapshot is *mixed* truthy + reified — use `wdt:` for
  plain walks, `p:/ps:/pq:` when you need qualifiers (seat dates,
  constituencies). Both are present; neither is complete.
- qlever rate-limits aggressively (429s). Sleep 2–4 s between probes;
  batch verification scripts should throttle to ≤4 concurrent.

### 3.5 Cumulative semantics are the only honest ▶ Run

Users read a chain as "what does it MEAN up to here". Running a
bead's fragment in isolation (`?p wdt:P31 wd:Q5` → 50 random humans)
looks like a bug to any sane user ("a CEO showed up as a Tudor
monarch!"). The primary run affordance must always be the fused
cumulative plan; isolated-fragment runs are a dev-mode inspection
tool. Also: `SELECT DISTINCT` always — join multiplicity duplicates
rows for every extra P39/P69 statement.

### 3.6 Two files, one algorithm — enforce with a conformance test

The convergence would rot in a week without
`tests/test_kgx_conformance.sh`. The rule it enforces: **plan output
changes land in `kgx_chain.py` and `kgx_core.mjs` in the same commit,
byte-identical, suite green.** Both files carry a header comment
saying so. If you touch prefix tables, fragment framing, LIMIT
defaults, bead addressing — run the suite before you push.

## 4. Working with danbri (observed, not prescribed)

- Messages are terse, often mobile, often a screenshot with two
  words ("Bug? Ceo?!"). The screenshot IS the bug report — read it
  carefully; it usually contains the whole repro.
- Direction arrives as course-corrections mid-flight ("Skip
  negatives for now" — which turned out to mean *set-theoretic*
  negation, not sentiment). When a correction seems to contradict
  the current plan, ask ONE clarifying interpretation question by
  restating what you'll do; don't stall.
- He values: domain breadth over parochialism ("surprise me"),
  ordinary-human legibility ("ten humanly intelligible examples that
  would engage normal people"), depth and elegance over stuffed
  hardcoded nodes, UX empathy (dev mode for nerd details), and
  *honesty about coverage* above all — it's rule 11 of the FPKG
  CLAUDE.md and it's genuinely how he reviews work.
- Ship increments and keep prod fresh: he checks fpkg.fly.dev from
  his phone within minutes. If the deploy didn't land, that's the
  first thing he'll notice (and the `paths:` filter or a missing
  symlink is the first thing to suspect — see §6).
- "DISCUSSION ONLY" on a design doc is a real gate. Don't implement
  held phases without sign-off; do write the doc.

## 5. Strategy — where I'd take it next

In rough priority order:

1. **Merge the two kgx CLIs.** I created a split yesterday:
   `bin/kgx.mjs` (SPARQL client + engines + validate, serves the
   daisychain lib) and `demos/python-interop/kgx.mjs` (Daisychain 1.0
   DSL toolchain verbs). One CLI should absorb the other — most likely
   `bin/kgx.mjs` grows `plan|run|spec|validate-chain` subcommands by
   importing `kgx_core.mjs`, and the python-interop one becomes a
   thin alias or is deleted. Keep the conformance suite pointing at
   whatever survives.

2. **Daisychain UI adopts the 1.0 compiler (plan).** The daisychain page's
   runner (`web/kgx/lib/runner.mjs`) predates the planner
   convergence. Its 20 LIBRARY chains and the 51 example chains
   should become ONE library, executed through `planBead`-compatible
   plans. Then a chain built by drag-and-drop in daisychain, saved as
   TriG, replayed by `kgx_chain.py --run`, is the full-circle demo.

3. **Shared components Phase 1–2** (`docs/kgx/shared-components.md`,
   held): lift intents + type-registry, then `<kgx-item-card>` /
   `<kgx-tile-grid>` custom elements, so pythonchain and daisychain
   render items identically. `kgx:produces` is already in the
   manifests and the Python spec output — the type registry has its
   hook waiting.

4. **Agent-facing surface.** The toolchain verbs are JSON-in/JSON-out with
   stable bead URIs precisely so an LLM agent can drive chains. The
   natural next step is a thin MCP server (or a skill) exposing
   load/validate/plan/run over the examples library and saved chains
   — "ask a question, get a chain, inspect any bead". The procb query
   corpus (130 verified real queries) is the ideal grounding set for
   teaching an agent to COMPOSE new chains rather than replay ours.

5. **Slim-channel Step 2** (`docs/kgx/slim-channel-dataflow.md`):
   manifests carry structure but not per-bead result data.
   Content-addressed execution records (`bindHash`, cache artifacts —
   see progress.md items 3–4) would make permalinks instant and give
   TriG manifests verifiable provenance.

6. **Difference, done honestly.** When someone needs it: implement
   `kgx:DifferenceBundle` in the planners with an explicit
   closure-assumption annotation in the manifest (which graph's
   closed world is being assumed, as of when). That turns the §3.2
   hazard into documented semantics instead of a foot-gun.

## 6. Operational gotchas (the ones that actually bit)

- **Branch discipline**: root `CLAUDE.md` says work on `claude/main`
  and *ignore* harness-supplied `claude/<slug>-XXXX` branches. The
  harness WILL sometimes reset your checkout to its own branch
  mid-session — check `git branch --show-current` before every
  commit. Nightly auto-commits (feed-liveness) land on `claude/main`,
  so `git fetch && git checkout -B claude/main origin/claude/main`
  + cherry-pick is the clean recovery when you drift.
- **Deploy trap #1**: `.github/workflows/deploy-fpkg.yml` has a
  `paths:` filter. New directories need adding or pushes silently
  don't deploy.
- **Deploy trap #2**: `web/python-interop/` contains *symlinks* into
  `/python-interop/` (container root — see the Dockerfile COPY
  comment). Every NEW file under `demos/python-interop/` needs a
  matching symlink in `demos/parliament-live/web/python-interop/`
  or prod 404s it. This bit us twice (examples/, kgx_core.mjs).
- **rdflib arrives via pip in the session container** but the first
  invocation sometimes races the install; retry once before
  believing "no module named rdflib".
- **Escaped quotes in generated TriG**: fragments embed `\"` inside
  Turtle strings; Python generator scripts writing those need
  triple-checked escaping (see /tmp generator saga in the worklog
  era around 2026-06-12). Prefer writing .trig files directly over
  metaprogramming them when the count is small.
- **JS syntax checking** an HTML-inline module: extract the LAST
  `<script type="module">` block, rewrite the relative import to an
  absolute path, `node --check`. There's a snippet pattern for this
  in the worklog; it catches real breakage cheaply.
- The FPKG proxy rules (never call parliament.uk direct from pages,
  TTL policy in server.mjs, OPL attribution string) are licence and
  courtesy conditions, not style. Read
  `demos/parliament-live/CLAUDE.md` before touching that estate.

## 7. A closing note

This project rewards a particular temperament: verify before
asserting, decompose before optimising, and treat the user's
two-word screenshot messages as precision instruments. The codebase
is unusually honest — renderers fail loud, docs say "DISCUSSION
ONLY" when they mean it, ungrounded beads admit they're ungrounded.
Keep it that way; the honesty is load-bearing. It's what makes a
civic-data project trustworthy, and it's what makes the next
model's job — yours — tractable.

The conformance suite is green, prod is fresh, and the chains run.
Good luck, and enjoy the Footlights chain — Robert Webb is in there.

— Fable, 2026-07-06
