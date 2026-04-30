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
