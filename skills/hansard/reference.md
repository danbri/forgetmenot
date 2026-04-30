# Hansard API — full endpoint reference

Cached spec: [`_specs/hansard.json`](../../_specs/hansard.json)
Endpoint table: [`_specs/endpoint-tables/hansard.txt`](../../_specs/endpoint-tables/hansard.txt)

Base URL: `https://hansard-api.parliament.uk`

Coverage: 1988-onwards. Pre-1988 lives at
[`api.parliament.uk/historic-hansard`](../historic-hansard/SKILL.md).

## URL convention

Every path ends with a `.{format}` segment — replace with `json` or
`xml`. Search endpoints carry their parameters under a
`queryParameters.<name>` query-string prefix.

## Overview / calendar
- `GET /overview/firstyear.{format}` — earliest year held.
- `GET /overview/lastsittingdate.{format}?house=Commons|Lords` — most
  recent sitting.
- `GET /overview/calendar.{format}?queryParameters.house=&queryParameters.year=&queryParameters.month=`
- `GET /overview/linkedsittingdates.{format}?queryParameters.house=&queryParameters.sittingDate=`
- `GET /overview/sectionsforday.{format}?queryParameters.house=&queryParameters.date=`
- `GET /overview/sectiontrees.{format}?queryParameters.house=&queryParameters.date=&queryParameters.section=`
- `GET /overview/speakerslist/{date}/{house}.{format}`
- `GET /overview/pdfsforday.{format}?queryParameters.house=&queryParameters.date=`
- `GET /overview/currentlyprocessing.{format}` — diagnostic.

## Debate detail
- `GET /debates/debate/{debateSectionExtId}.{format}` — full text.
- `GET /debates/divisions/{debateSectionExtId}.{format}` — divisions
  taken in this section.
- `GET /debates/division/{divisionExtId}.{format}` — one division.
- `GET /debates/speakerslist/{debateSectionExtId}.{format}`
- `GET /debates/memberdebatecontributions/{memberId}.{format}`
- `GET /debates/topleveldebatebytitle.{format}`
- `GET /debates/topleveldebateid/{debateSectionExtId}.{format}`

## Search
All accept `queryParameters.searchTerm`, `house`, `startDate`,
`endDate`, `partyId`, `memberId`, `take`, `skip`, plus type-specific
extras.

- `GET /search.{format}` — combined.
- `GET /search/debates.{format}` — debates only.
- `GET /search/contributions/{contributionType}.{format}` — one type
  (`Spoken`, `Written`, etc.); `outputType=List|Group`.
- `GET /search/divisions.{format}`
- `GET /search/members.{format}`
- `GET /search/committees.{format}`
- `GET /search/committeedebates.{format}`
- `GET /search/petitions.{format}`
- `GET /search/membercontributionsummary/{memberId}.{format}`
- `GET /search/debatebycolumn.{format}?queryParameters.house=&queryParameters.volume=&queryParameters.column=`
- `GET /search/debatebyexternalid.{format}?queryParameters.contributionExtId=...`
- `GET /search/parlisearchredirect.{format}` — turns an ID into a
  Parliament website URL.

## PDFs
- `GET /pdfs/pdf.{format}` — daily-part PDF metadata; pass
  `queryParameters.house`, `queryParameters.sittingDate` and optionally
  `queryParameters.debateSectionExtId`.

## Stats
- `GET /timeline-stats.{format}` — counts of contributions per period.

## Historic sitting days
- `GET /historicsittingdays?house=&fromDate=&toDate=`
- `GET /historicsittingdays/{house}/{sittingDate}`

## Patterns and gotchas

- All times are `Europe/London`.
- `debateSectionExtId` is a 36-char GUID. The same GUID resolves on
  the Parliament website at
  `https://hansard.parliament.uk/Commons/<date>/debates/<extId>/<slug>`.
- `contributionExtId` is per-paragraph and likewise a GUID.
- `memberId` is **the same** integer as Members API; you can join
  freely.
- Search default page size is 20; max appears to be 100.
- The XML format is the legacy DTD — JSON is recommended for new work.
