---
name: identity-graph
description: Cross-source identity reconciliation for every UK MP and peer in this repository, as a single RDF N-Quads file. Bridges Members API id ↔ MNIS id ↔ DDP person LocalId ↔ scraped per-MP website ↔ APPG officer roles ↔ GOV.UK people factoids ↔ Wikidata QIDs, each in its own named graph. Use whenever a question needs to join data across more than one of those sources by person — most commonly to confirm that "the gov.uk page for X", "the psephology winning candidacy for X" and "the X currently sitting in the Lords as Lord Y" are the same human. The `parl:memberId` literal is the stable join key; it stays the same across MP-then-peer career transitions (e.g. Hague MNIS 379 = MP for Richmond + Lord Hague of Richmond; Cameron MNIS 1467 = MP for Witney + Lord Cameron of Chipping Norton 2023; Darling MNIS 596 = MP for Edinburgh SW + Lord Darling of Roulanish 2015-20).
license: Open Parliament Licence v3.0 (upstream Parliament IDs); CC0 (Wikidata); see per-source notes in the README
metadata:
  provenance:
    tier: 2                          # derived — Tier-1 sources rolled up with our own resolution
    operator: "forgetmenot (cross-source resolver)"
    citation-short: "via forgetmenot identity-graph"
    citation-formal: "forgetmenot identity-graph, build {git-rev}"
    confidence: derived
---

# identity-graph — cross-source identity for UK MPs and peers

A single N-Quads file —
[`third_party/identity-graph/identity.nq`](../../third_party/identity-graph/identity.nq)
— that reconciles every UK MP and peer captured in this repository
across the identifier systems they actually appear under. **58,189
quads, ~9.9 MB uncompressed (~470 KB gzipped), 7 named graphs.**

The full schema, build details, current totals and a worked example
live in
[`third_party/identity-graph/README.md`](../../third_party/identity-graph/README.md)
— this skill is the discovery surface for skill-matching against
questions like *"is this the same person as that"*, *"what's the
Wikidata QID for the MP for X"*, *"does this MP have a peerage too"*,
*"give me everyone who's an APPG officer and bridged to GOV.UK"*.

## Named graphs

| Graph | Source | What it carries |
|---|---|---|
| `…/identity/members-api` | per-MP dumps | name, party, house, constituency, MNIS id |
| `…/identity/ddp-sparql` | live DDP SPARQL | DDP LocalId, `owl:sameAs` Members→DDP bridge, given/family names |
| `…/identity/scraped` | per-MP polite crawl | site platform, homepage, RSS feeds, social profiles |
| `…/identity/appg` | APPG resolver | APPG officerships per person, reified with role + group |
| `…/identity/govuk` | GOV.UK factoid corpus | `owl:sameAs` Members → GOV.UK people-page |
| `…/identity/wikidata` | Wikidata bridge corpus | `owl:sameAs` Members → Wikidata entity + `fm:wikidataQid` literal (673 members) |
| `…/identity/provenance` | self-describing | PROV-O / VoID metadata for each of the six source graphs |

## The bridge predicates

- **`parl:memberId`** (string literal) — Parliament's stable id.
  Same value across MP and peer careers. **The canonical join
  key.** All seven graphs use it or are addressed by an IRI
  derived from it.
- **`owl:sameAs`** to:
  - `https://id.parliament.uk/<LocalId>` (DDP)
  - `https://www.gov.uk/government/people/<slug>` (when GOV.UK
    publishes a page for that person)
  - `https://www.wikidata.org/entity/Q<n>` (when Wikidata has a
    QID; 673 today)
- **`schema:givenName` / `schema:familyName`** for name-based
  filtering when the id isn't to hand.
- **`fm:scrapedSiteDir`, `fm:scrapedFeed`, `fm:memberDump`**
  filesystem paths into the per-MP corpora.

## Build

```sh
npm run identity-graph
```

Reads from local corpora + makes **one** SPARQL request to DDP
(5,425 bindings in a single fetch). Writes `identity.nq` and
`_index.json` under `third_party/identity-graph/`.

## Query it

The corpus is N-Quads and queryable via the
[`local-sparql`](../local-sparql/SKILL.md) skill:

```sh
scripts/local-sparql-serve.sh third_party/identity-graph/identity.nq
#   → http://127.0.0.1:8765/
```

Or merged with other corpora — psephology, govuk-orgchart
factoids, FCDO treaties — for cross-source joins:

```sh
scripts/local-sparql-serve.sh \
  third_party/data/psephology/all.nq.gz \
  third_party/identity-graph/identity.nq \
  third_party/govuk/html/orgcharts/extractors/factoids/all.nq
```

Working examples in `scripts/test-cabinet-won.mjs` and
`scripts/test-peers-in-cabinet.mjs`.

## Caveats (read the data-quality skill)

The [`data-quality`](../data-quality/SKILL.md) skill carries the
"peerage and the cabinet" worked example which documents the
edge cases this corpus DOES and DOES NOT cover — particularly:

- `parl:memberId` reconciles MP and peer careers (Hague, Cameron,
  Darling all verified end-to-end).
- The corpus does NOT carry peerage-creation dates — for "was X
  a peer on date Y?" you need the Lords Library register or DDP.
- The 273 GOV.UK bridges and 673 Wikidata bridges have residual
  matcher misses; specific cases (e.g. Nick Thomas-Symonds) are
  logged in `docs/upstream-bugs.md`.
