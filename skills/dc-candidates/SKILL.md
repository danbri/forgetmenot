---
name: dc-candidates
description: "Query DemocracyClub Candidates — the canonical list of UK electoral candidates (past, present, declared) with stable IDs, party affiliations, and sources. Use when the question is who stood (or is standing) for a seat at a given election, what the candidate's history is across seats, or to enumerate every candidate at a given general election. Joins to Parliament via Westminster constituency name + general-election date. Free JSON API; no auth."
license: Creative Commons Attribution-ShareAlike 4.0 (DemocracyClub)
metadata:
  facility: dc-candidates
  cli-alias: candidates
  base-url: https://candidates.democracyclub.org.uk/api/next
  provenance:
    tier: 3
    operator: DemocracyClub
    service: candidates.democracyclub.org.uk
    upstream-data: "Crowd-sourced and party-supplied candidate data, fact-checked by DC volunteers"
    citation-short: "via DemocracyClub Candidates"
    citation-formal: "DemocracyClub Candidates database, retrieved {date}, CC BY-SA 4.0"
    confidence: derived
    confidence-notes: "Crowd-sourced with strong sourcing discipline. Each statement on a person record carries a `source_url`. Recent / declared candidates are well-covered; pre-2015 has gaps."
---

# DemocracyClub Candidates

Base URL: `https://candidates.democracyclub.org.uk/api/next/`

## Core resources

| Resource | What it is |
|---|---|
| **ballot** | One election × one electoral area — e.g. "Holborn and St Pancras, 2024 general election". Has a `ballot_paper_id` like `parl.holborn-and-st-pancras.2024-07-04`. |
| **person** | One candidate identity, persistent across the elections they've contested. DC person id is the canonical key. |
| **election** | The umbrella event (e.g. `parl.2024-07-04` general election). |
| **post** | The electoral area (e.g. "Holborn and St Pancras"). |
| **party** | A registered party as DC records it. |

## CLI

```sh
parl candidates ballots --election-date 2024-07-04 --take 5
parl candidates ballot parl.holborn-and-st-pancras.2024-07-04
parl candidates persons --name "Cooper"
parl candidates person 1196                       # one candidate's full history
parl candidates elections --election-date 2024-07-04
parl candidates parties
```

## Joins to Parliament

- DC ballot `post.label` ≈ Westminster constituency name
- The winner's `person.id` doesn't directly equal a Parliament
  member id, but you can name-match via
  `parl members search --name "<full name>"` (same chain as APPG).
- For canonical cross-IDs, prefer the [`wikidata`](../wikidata/SKILL.md)
  bridge (Wikidata has P3640 = DemocracyClub person id, P5388 =
  Parliament MP id).

## Provenance to cite

**Tier 3 — third-party (DemocracyClub).**

- Inline cite: **"(via DemocracyClub Candidates)"** — once per
  paragraph.
- Each DC `person` record has `versions[]` showing the edit history
  and `source_url` for each change. For a high-stakes statement,
  cite the underlying source URL on the version that established it,
  not just DC.
- Pre-2015 coverage is patchy.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
