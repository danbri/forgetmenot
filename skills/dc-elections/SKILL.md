---
name: dc-elections
description: "Query DemocracyClub EveryElection — the canonical list of every UK election (Westminster, devolved, mayoral, local, PCCs, parishes) with stable election IDs and the organisations / divisions they're held in. Use when the question is about which elections are scheduled or have happened on a date, or to look up the canonical id (e.g. `parl.2024-07-04`) for joining to other DC datasets. Pairs with dc-candidates."
license: Creative Commons Attribution-ShareAlike 4.0 (DemocracyClub)
metadata:
  facility: dc-elections
  cli-alias: elections
  base-url: https://elections.democracyclub.org.uk/api
  provenance:
    tier: 3
    operator: DemocracyClub
    service: elections.democracyclub.org.uk
    upstream-data: "Election notices published by returning officers + DC's own additions for declared / scheduled future elections"
    citation-short: "via DemocracyClub EveryElection"
    citation-formal: "DemocracyClub EveryElection, retrieved {date}, CC BY-SA 4.0"
    confidence: derived
    confidence-notes: "Canonical for ID generation. Each election has provenance back to a returning-officer notice (PDF/HTML) where one exists."
---

# DemocracyClub EveryElection

Base URL: `https://elections.democracyclub.org.uk/api/`

## Group codes

| Group | What |
|---|---|
| `parl` | UK Parliament Westminster |
| `local` | Local council |
| `mayor` | Directly-elected mayor |
| `pcc` | Police and Crime Commissioner |
| `sp` | Scottish Parliament |
| `naw` | Welsh Senedd (legacy slug) |
| `nia` | NI Assembly |
| `gla` | London Assembly |
| `parish` | Parish / community council |
| `ref` | Referendum |

## CLI

```sh
parl elections list --group parl --date 2024-07-04
parl elections list --election-id parl.2024-07-04
parl elections get parl.holborn-and-st-pancras.2024-07-04
parl elections organisations --organisation-type local-authority
parl elections types
```

## Join to dc-candidates

DC EveryElection ids are the keys used in dc-candidates ballots —
`parl candidates ballots --election-id parl.2024-07-04` enumerates
the candidates of that election.

## Provenance to cite

**Tier 3 — third-party (DemocracyClub).**

- Inline cite: **"(via DemocracyClub EveryElection)"** — once per
  paragraph.
- For high-stakes statements about candidates / poll dates, prefer
  the returning officer's notice (linked in each election's
  `notice_of_election` field) over DC itself.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
