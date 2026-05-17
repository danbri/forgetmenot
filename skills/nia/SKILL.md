---
name: nia
description: "Query the Northern Ireland Assembly Open Data API at data.niassembly.gov.uk — Members of the Legislative Assembly (MLAs, ~90 current), parties, constituencies, Hansard, written questions, departments, organisations, plenary divisions, motions and business diary. Wraps 35+ JSON operations across six ASMX services (members, hansard, committees, questions, organisations, plenary). Free, no auth. First-party to the NI Assembly; tier-3 from a Westminster perspective. Use when the question is about an MLA, an NI Assembly committee, a Stormont division, a question to an NI department, or NI electoral geography."
license: Open Government Licence v3.0 (Crown copyright; Northern Ireland Assembly)
metadata:
  facility: nia
  cli-alias: nia
  base-url: http://data.niassembly.gov.uk
  provenance:
    tier: 3
    operator: Northern Ireland Assembly
    service: data.niassembly.gov.uk (six ASMX services)
    upstream-data: "Stormont Assembly procedural data: MLAs, Hansard, written questions, plenary motions and divisions, committees, organisations"
    citation-short: "via NI Assembly Open Data"
    citation-formal: "Northern Ireland Assembly Open Data API, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for Stormont procedural records. Each ASMX operation has _JSON, _JSONP and plain XML variants; the library uses _JSON. The data.niassembly.gov.uk site is HTTP-only (no HTTPS as of May 2026)."
---

# NI Assembly Open Data

Base URL: `http://data.niassembly.gov.uk` (HTTP only).

Six ASMX services, each with JSON operations. The library wraps the
`_JSON` variants — returns native JSON, no XML envelope.

## Services + headline ops

| Service | Headline operations |
|---|---|
| `members.asmx` | GetAllCurrentMembers, GetAllMembers, GetAllMembersByGivenDate, GetAllCurrentMembersByGivenConstituencyId, GetAllCurrentMembersByGivenPartyId, GetAllCurrentMembersBySurnameSearch, GetAllMemberContactDetails, GetMemberContactDetailsByPersonId, GetAllMemberRoles, GetMemberRolesByPersonId, GetAllConstituencies |
| `hansard.asmx` | GetAllHansardReports, GetHansardComponentsByPlenaryDate, GetHansardComponentsByReportId, GetHansardComponentsByReportIdAndPersonId |
| `questions.asmx` | GetQuestionDetails, GetQuestionsByDepartment, GetQuestionsByMember, GetQuestionsBySearchText |
| `organisations.asmx` | GetAllPartyGroupsListCurrent, GetDepartmentListCurrent, GetOrganisationListCurrent, GetPartiesListCurrent |
| `plenary.asmx` | GetBusinessDiary, GetDivisionResult, GetDivisionMemberVoting, GetMotionAmendments, GetMotionPetitionOfConcern, GetNoDayNamedMotions, GetPlenaryAddressees |
| `committees.asmx` | (no _JSON ops yet; SOAP-only) |

## CLI

```sh
parl nia current-members             # 90 MLAs
parl nia parties                     # registered parties
parl nia members-by-surname Aiken    # by name
parl nia questions-search "education"
parl nia diary 2026-05-01 2026-05-31
```

## Joins to Westminster

- Stormont MLAs occasionally hold dual-mandates / move between
  Stormont and Westminster — use Wikidata QIDs as the bridge
  (`wd search "<name>"`).
- NI Assembly debates often reference Westminster legislation (e.g.
  on the Northern Ireland Protocol, Windsor Framework); pair with
  `bills` / `hansard`.

## Provenance to cite

**Tier 3 — third-party (NI Assembly), authoritative for Stormont.**

- Inline cite: **"(via NI Assembly Open Data)"** — once per paragraph.
- For specific facts, name the operation + key (PersonId,
  ConstituencyId, QuestionId).
- See [`../../docs/provenance.md`](../../docs/provenance.md).
