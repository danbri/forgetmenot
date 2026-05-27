---
name: uk-parliament-committees
description: Query UK Parliament Select and Joint Committees — membership, inquiries, evidence (oral and written), publications (reports, government responses), meetings, broadcasts, and Bill petitions. Use whenever the question is about a committee inquiry, a witness who gave evidence, a published committee report, or a meeting that has been or will be held.
---

# UK Parliament Committees API

Base URL: `https://committees-api.parliament.uk/api`

OpenAPI 3 spec: `https://committees-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/committees.json`).

## What it covers

Select, Joint and General committees of both Houses; their inquiries
(called "Committee Business"); the publications produced by each
inquiry (reports, special reports, government responses, evidence
volumes); oral and written evidence with downloadable documents;
meeting events with broadcast metadata and attendance; Bill petitions
(the Public Bill Committee petitions process); and the staff supporting
committees.

## Common entry points

| Use case | Endpoint |
|---|---|
| Find a committee | `GET /Committees?SearchTerm=...&House=Commons|Lords|Joint` |
| Committee detail | `GET /Committees/{id}` |
| Committee membership (current and historical) | `GET /Committees/{id}/Members` |
| Committee staff | `GET /Committees/{id}/Staff` |
| Committee events | `GET /Committees/{id}/Events` |
| Committee publications | `GET /Committees/{id}/Publications/Summary` |
| All inquiries (committee businesses) | `GET /CommitteeBusiness?SearchTerm=...&CommitteeId=...` |
| One inquiry | `GET /CommitteeBusiness/{id}` |
| Inquiry publications | `GET /CommitteeBusiness/{id}/Publications/Summary` |
| Oral evidence sessions | `GET /OralEvidence?CommitteeBusinessId=...` |
| Witness oral evidence transcript | `GET /OralEvidence/{id}/Document/{fileDataFormat}` |
| Written evidence submissions | `GET /WrittenEvidence?CommitteeBusinessId=...` |
| Download written evidence | `GET /WrittenEvidence/{id}/Document/{fileDataFormat}` |
| Committee meetings between dates | `GET /Broadcast/Meetings?StartDate=...&EndDate=...` |
| Bill petitions | `GET /BillPetitions` |

`fileDataFormat` is one of `Pdf`, `Docx`, `Html`.

## Worked example

```sh
# Find the Treasury Committee, then list its current members
curl -s 'https://committees-api.parliament.uk/api/Committees?SearchTerm=Treasury' \
  | jq '.items[] | select(.name == "Treasury Committee") | .id'
# -> 158
curl -s 'https://committees-api.parliament.uk/api/Committees/158/Members' \
  | jq '.items[] | select(.endDate == null) | {name, role}'
```

## Notes

- Committee membership records carry `startDate` and (sometimes)
  `endDate`. Filter for `endDate == null` to see current members.
- Inquiries are called *Committee Business* in this API; the field
  `committeeBusinessId` joins evidence and publications back to the
  parent inquiry.
- See `reference.md` for the complete endpoint listing and pagination
  caveats.

<!-- parl-cli-start -->

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs committees --help
```

Or after `npm link` (one-time install):

```sh
parl committees --help
```

Wraps the Committees API. Inquiries are called "Committee Business" in this surface.

### Examples

```sh
parl committees search --term Treasury --take 5
```
Find a committee.

```sh
parl committees get 158
```
Treasury Committee detail.

```sh
parl committees members 158 --current
```
Current members.

```sh
parl committees publications 158
```
Publication groups.

```sh
parl committees business-search --committee-id 158 --take 5
```
Inquiries.

```sh
parl committees oral-evidence-search --committee-business-id 12345 --take 5
```
Oral evidence sessions.

```sh
parl committees meetings --from 2026-04-01 --to 2026-04-30
```
Meetings in a date range.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/committees.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
