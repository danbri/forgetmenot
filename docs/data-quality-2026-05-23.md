# Data-quality notes — cross-source SPARQL on the current cabinet

What we learned from two end-to-end tests (`scripts/test-cabinet-won.mjs`,
`scripts/test-peers-in-cabinet.mjs`) running over the local merged
endpoint (psephology + identity-graph + govuk-orgchart factoids,
~499 k triples) plus the live `api.parliament.uk/sparql`.

## What works

- **The three-corpus cross-source join works.** The bridge is
  `parl:memberId` as a literal: GOV.UK slug → identity-graph
  `owl:sameAs` → Members API URL → `parl:memberId` → psephology
  `pe:Person` blank node → `pe:Candidacy` → `pe:WinningCandidacyResult`.
  All in plain SPARQL, no joins outside the query engine.
- **Coverage is high in the headline case.** 21 of 24 cabinet-grade
  current office holders verified as winning Commons MPs at GE
  2024-07-04. The remaining three are 2 peers (correct absence) +
  1 broken bridge (logged).
- **Constituency names are post-2024 in psephology.** Reeves →
  "Leeds West and Pudsey" not "Leeds West"; Reed → "Streatham and
  Croydon North" not "Croydon North". Boundary review is applied.
- **Vocabulary is consistent.** `pe:`, `parl:`, `fm:` predicates
  used identically across the corpora; per-corpus `fm-vocab.ttl`
  files declared per `docs/vocab.md`.

## Data-quality issues found, by severity

### 1. DDP currency lag (live endpoint)
Four current Commons cabinet members have **no current
`parl:memberHasParliamentaryIncumbency` row in DDP**, despite
having clearly won in 2024 (verified locally + via Members API):
Douglas Alexander (Scotland), Heidi Alexander (Transport), Emma
Reynolds (Defra), Lucy Rigby (CST). All four either re-entered
Parliament in 2024 or are new entrants. Mechanism: DDP's
post-2024 incumbency rows haven't propagated. Already noted in
`docs/sparql-endpoints.md`; now also in `docs/upstream-bugs.md`.

### 2. DDP constituency-name lag (live endpoint)
Even where DDP *has* a current incumbency, the linked
`parl:constituencyGroupName` is the **pre-2024-boundary name**
(e.g. Reeves' seat shown as "Leeds West"). Boundary review is
not reflected. Cross-checking against psephology, MNIS, or the
Members API gets the correct post-2024 names.

### 3. identity-graph extractor miss (local)
One MP (Nick Thomas-Symonds, MNIS 4479, Torfaen) is not bridged
from his GOV.UK people-page slug to his Members API URL because
his GOV.UK page didn't yield a `schema:name@en` literal at
factoid-extraction time. The matcher requires that name to match
against the DDP given+family pair. **Should fall back to slug
matching for cases where the literal is missing.** Logged.

### 4. GOV.UK extractor — peer-name vs tenure-date join (local)
`fm:RoleTenure` blank nodes link a person URI to a role URI with
start/end dates. The person URI carries the person's *current*
`schema:name`, including any current peerage. So Baroness Nicky
Morgan's row in the factoids correctly shows her current peerage
title against her 2014-16 tenure as Education Secretary — but she
wasn't a peer at the time. **The data flattens "name now" against
"role then" without the peerage-creation date.** To rule out
these joinable-after-the-fact peerages a user has to consult an
external register (Lords Library / DDP) for peerage creation
dates. The test script now flags Morgan explicitly as a known
false positive.

### 5. GOV.UK extractor — historical coverage (local)
The govuk-orgchart factoids only cover people GOV.UK has live
pages for. Past peer Secretaries-of-State like Mandelson
(2008-10), Falconer (2003-07), Amos, Adonis are *not* in the
local corpus — direct probes returned empty. For history
queries you need DDP's `parl:memberHasParliamentaryIncumbency`
joined against `parl:formalBodyMembership` (Cabinet body), which
runs on the live endpoint but is slower and rate-limited.

### 6. rdflib blank-node coalescing (loader)
The psephology `all.nq.gz` ships 420,158 quads but rdflib loads
them as 412,007 statements, because the emitter intentionally
gives blank nodes deterministic names like `_:person_mnis_5334`.
N-Quads spec says same-named blanks across a file are the same
node — our emitter relies on that to dedupe MPs across their
multiple candidacies. **Not a bug — by-design — but loaders that
mint per-file fresh blank nodes will deviate.** Worth noting in
the local-sparql skill (now there).

### 7. CLI — already-logged earlier findings
- `pq/constituency_lookup_by_postcode` returns HTTP 500 upstream;
  sibling templates work. Workaround: `members search --postcode`.
- `si search --term` works (was suspected broken; verified fine).

## Linkage scorecard

| Bridge | Tested over | Success | Failure mode |
|---|---:|---:|---|
| `parl:memberId` (literal) — psephology ↔ identity-graph | 24 cabinet | 22/24 | 1 broken extractor bridge, 1 peer (correctly absent) |
| `owl:sameAs` — identity-graph members-API URL ↔ GOV.UK slug | 24 cabinet | 22/24 | same |
| `pe:isOfPerson` → `parl:memberId` — psephology candidacies | all 26 372 candidacies | 100% schema-valid | 0 violations |
| GOV.UK people-page → DDP via MNIS | 23 cabinet | 23/23 resolve | 5 have no current incumbency (DDP lag) |
| psephology constituency name ↔ DDP constituency name | 18 with both | matches in shape; DDP version is pre-2024 |

## What you can / cannot answer with this stack

| Question | Local merged endpoint | Live DDP | Both needed? |
|---|---|---|---|
| Did current cabinet MPs win their seats? | ✓ (1-shot SPARQL) | partial (incumbency gaps) | local sufficient |
| Who currently holds X cabinet role? | ✓ | indirectly via incumbencies | local sufficient |
| Who were past holders of X role? | partial (only those with GOV.UK pages) | ✓ (full history) | DDP for completeness |
| Vote counts / shares / majorities | ✓ (psephology) | ✗ (DDP has none) | local only |
| Current Lords / Commons membership | partial | ✓ | DDP for currency |
| Was X person a peer when Y date? | ✗ (no peerage-creation dates) | partial | external register needed |

## Concrete actions logged

- `docs/upstream-bugs.md` — DDP post-2024 currency gap + identity-graph
  Thomas-Symonds bridge miss.
- `scripts/test-cabinet-won.mjs` — reproducible cross-source assertion.
- `scripts/test-peers-in-cabinet.mjs` — reproducible
  current-and-historical peer-in-cabinet probe with the Morgan
  false positive flagged.
- `docs/sparql-endpoints.md` (existing) — explains DDP vs DD vs REST
  precedence when the SPARQL surface lags.
