---
name: members-data-platform
description: Query the legacy MNIS (Members' Names Information Service / Members Data Platform) at data.parliament.uk/membersdataplatform. Older than the modern Members API, with a different filter syntax (pipe-separated key=value pairs in the URL path) and richer historical detail in some places. Default response is XML; JSON is available via ?format=json on supported routes. Use when a question needs MNIS-flavoured data the modern Members API does not surface, or when an existing MNIS-using script must be kept working.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: data.parliament.uk/membersdataplatform
    citation-short: "via data.parliament.uk MNIS"
    citation-formal: "UK Parliament Members Data Platform (MNIS), retrieved {date}"
    confidence: authoritative
---

# UK Parliament Members Data Platform (MNIS)

Base URL: `https://data.parliament.uk/membersdataplatform`

This is the long-running service informally known as **MNIS** (Members'
Names Information Service). The modern
[Members API](../members/SKILL.md) supersedes most use cases; MNIS is
retained for legacy clients and for a few queries it does better
(historical compositions, certain status flags, some staff records).

## URL convention

The service composes URLs as `/<api>/<path>/<filter>/<format>`. The
filter is a **pipe-separated** list of `key=value` predicates; pipes
must be URL-encoded as `%7C`.

Sample:

```
https://data.parliament.uk/membersdataplatform/services/mnis/members/query/House%3DCommons%7CIsEligible%3Dtrue/?format=json
```

means "members where House=Commons AND IsEligible=true, formatted as
JSON". Without `?format=json` the same URL returns XML.

## Common entry points

| Use case | URL |
|---|---|
| All current Commons members | `/services/mnis/members/query/House%3DCommons%7CIsEligible%3Dtrue/?format=json` |
| All current Lords | `/services/mnis/members/query/House%3DLords%7CIsEligible%3Dtrue/?format=json` |
| Active parties in the Commons | `/services/mnis/parties/active/Commons/` (XML only) |
| Active parties in the Lords | `/services/mnis/parties/active/Lords/` |
| State of the parties on a date | `/services/mnis/parties/state/Commons/2024-07-04/` |
| Member details by ID | `/services/mnis/members/query/Id%3D172/Constituencies%7CParties/?format=json` (combine sub-resource paths with another pipe) |

## Filter keys

`Id`, `MnisId`, `PimsId`, `DodsId`, `House` (`Commons`/`Lords`),
`Constituency`, `Party`, `Gender` (`M`/`F`), `IsEligible`,
`HouseStartDate`, `HouseEndDate`, `MembershipStartDate`,
`MembershipEndDate`. Membership/eligibility predicates accept
operators in the Linked Data API style (`gt`, `lt`, `eq`).

## Sub-resources

After the filter you can append a pipe-separated list of expansions:
`Constituencies`, `Parties`, `HouseMemberships`, `Committees`,
`PreferredNames`, `BiographyEntries`, `Addresses`, `Statuses`,
`AnsweringBodies`, `GovernmentPosts`, `OppositionPosts`, `OtherPosts`,
`Experiences`, `KeyDates`, `Interests`, `Staff`, `MaidenSpeeches`,
`Elections`, `OtherParliaments`.

Example: `…/query/House%3DCommons/Parties|Constituencies|Committees`.

## Worked example

```sh
# Current Commons MPs as JSON
curl -s 'https://data.parliament.uk/membersdataplatform/services/mnis/members/query/House%3DCommons%7CIsEligible%3Dtrue/?format=json' \
  | jq '.Members.Member[0]'
```

## Notes

- Default response is XML; pass `?format=json` if you need JSON.
  Some sub-paths (e.g. `parties/active/`) ignore the `format` param
  and only return XML — parse accordingly.
- The `Member_Id` integer in MNIS responses is the same value as the
  `Id` returned by the modern Members API (`/Members/{id}`).
- The modern Members API and the MNIS API can return slightly
  different snapshots — the modern API is updated more frequently.
- This service has been "due to be retired" for some time but
  continues to run. Treat it as **legacy but supported**; new work
  should target the modern Members API where possible.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs mnis --help
```

Or after `npm link` (one-time install):

```sh
parl mnis --help
```

Wraps the legacy MNIS Members Data Platform.

### Examples

```sh
parl mnis members --house Commons --eligible --format json
```
Current Commons MPs as JSON.

```sh
parl mnis member 172
```
Member 172 (Diane Abbott).

```sh
parl mnis parties-active Commons
```
Active parties (returns XML).

```sh
parl mnis postcode "SW1P 3JA"
```
Postcode → MP.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/members-data-platform.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via data.parliament.uk MNIS)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
