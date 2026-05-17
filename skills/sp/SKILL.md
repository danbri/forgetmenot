---
name: sp
description: "Query the Scottish Parliament Open Data API at data.parliament.scot/api — Members of the Scottish Parliament (MSPs, current and historical), constituencies, regions, parties, committees, and committee membership. JSON endpoints with PascalCase resource names; the API REQUIRES an Accept: application/json header (default content negotiation returns 405). First-party to the Scottish Parliament; tier-3 from a Westminster perspective. Use when the question is about an MSP, a Holyrood committee, or Scottish electoral geography (constituencies / regions for the Additional Member System)."
license: Open Government Licence v3.0 (Crown copyright, Scottish Parliamentary Corporate Body)
metadata:
  facility: sp
  cli-alias: sp
  base-url: https://data.parliament.scot/api
  provenance:
    tier: 3
    operator: The Scottish Parliament
    service: data.parliament.scot/api
    upstream-data: "Scottish Parliament's own administrative database — Members, Parties, Committees, Constituencies, Regions"
    citation-short: "via data.parliament.scot"
    citation-formal: "Scottish Parliament Open Data API, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for the Scottish Parliament's own data. Tier 3 here because forgetmenot's centre of gravity is Westminster — from Holyrood's perspective this would be tier 1."
---

# Scottish Parliament Open Data

Base URL: `https://data.parliament.scot/api`

The Scottish Parliament's open-data service. Resource names are
**PascalCase** (`Members`, `Committees`, `MemberParties`) and the
service **requires** an `Accept: application/json` header — the
default text/html content negotiation returns 405. The library
sets the header automatically.

Devolved parliaments are first-party to *their own* legislature
and third-party to Westminster; per
[`docs/provenance.md`](../../docs/provenance.md) we use the
`sp-` producer slug. The folder is named `sp` for short.

## Endpoints wrapped

| Resource | Wrap | What |
|---|---|---|
| `Members` | `members` | MSPs (current + historical) |
| `MemberParties` | `memberParties` | MSP party-membership records (with dates) |
| `MemberElectionConstituencyStatuses` | `memberElectionConstituencyStatuses` | Per-election constituency results |
| `MemberElectionRegionStatuses` | `memberElectionRegionStatuses` | Per-election regional list results |
| `Constituencies` | `constituencies` | Holyrood constituencies |
| `Regions` | `regions` | Holyrood electoral regions (AMS top-up) |
| `Parties` | `parties` | Parties represented in Holyrood |
| `Committees` | `committees` | Committees (current + historical) |
| `CommitteeMembers` | `committeeMembers` | Committee membership records |
| (helper) | `probeResources` | Probe a list of resource names for 200 / 404 |

## CLI

```sh
parl sp members                          # all MSPs
parl sp parties                          # all parties
parl sp committees                       # all committees
parl sp committee-members                # membership records
parl sp constituencies                   # Scottish constituencies
parl sp regions                          # Scottish electoral regions (AMS top-up)
parl sp member-parties                   # MSP party-membership records
parl sp probe Foo,Bar,Baz                # probe undocumented resources
```

## Holyrood electoral system primer

The Scottish Parliament uses the **Additional Member System**:

- **73 constituency seats** (`Constituencies` resource) elected
  by first-past-the-post — comparable to Westminster
  constituencies but on Scottish-only boundaries.
- **56 regional list seats** (`Regions` resource) — 8 regions,
  each electing 7 members from party lists using a d'Hondt
  top-up to deliver proportional party totals.
- Each MSP has either a constituency status OR a regional status
  per election (some have both across multiple elections); the
  `MemberElectionConstituencyStatuses` and
  `MemberElectionRegionStatuses` resources record those.

## Joins to Parliament (Westminster)

- **Cross-membership**: a handful of people have held both
  Westminster and Holyrood seats (notably Alex Salmond). Match
  by name; there is no cross-system ID. Use
  [`wikidata`](../wikidata/SKILL.md) for a stable cross-ID via
  a Wikidata QID where one exists.
- **Constituency boundaries**: Scottish *Westminster*
  constituencies are not the same as Scottish *Holyrood*
  constituencies — different boundaries, different review
  cycles. For Westminster boundaries use
  [`ons-geo`](../ons-geo/SKILL.md) `WMC`; for Holyrood,
  `sp constituencies` or [`mysoc-mapit`](../mysoc-mapit/SKILL.md)
  `SPC` / `SPE` area types.
- **Reserved vs devolved matter**: when a topic is reserved to
  Westminster, scrutiny lives in
  [`hansard`](../hansard/SKILL.md) /
  [`committees`](../committees/SKILL.md); when devolved, the
  Holyrood committees own it. Many topics straddle both —
  expect duplication and check Sewel-convention status.

## Caveats

- **Accept header is mandatory.** Without
  `Accept: application/json`, the server returns 405 Method Not
  Allowed. The library sets the header automatically; if you
  hit the URL by hand, include it.
- **No pagination metadata in some resources.** Several
  resources return the full collection in one response; large
  ones (e.g. `Members` across all sessions) can be hundreds of
  KB.
- **Documentation drifts.** Scottish Parliament documentation
  at `data.parliament.scot/Documentation` lists more resources
  than always work; `probe-resources` lets you sanity-check.
- **No Hansard / business data here.** This API covers
  membership / committee / parties / geography metadata, not
  the Official Report (Holyrood's equivalent of Hansard) or
  Bill stages — those live on other Scottish Parliament
  surfaces not yet wrapped.

## Provenance to cite

**Tier 3 — third-party (The Scottish Parliament). Authoritative
to its own legislature; third-party from a Westminster
perspective.**

- Inline cite: **"(via data.parliament.scot)"** — once per
  paragraph.
- When mixing with Westminster data, attribute each fact to its
  source: *"per Members API: X; per data.parliament.scot: Y"*.
  Don't merge.
- Match MSPs to MPs by name only with caution — no shared
  identifier; use Wikidata QID as the cross-ID bridge where one
  exists.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
