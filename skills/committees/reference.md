# Committees API — full endpoint reference

Cached spec: [`_specs/committees.json`](../../_specs/committees.json)
Endpoint table: [`_specs/endpoint-tables/committees.txt`](../../_specs/endpoint-tables/committees.txt)

Base URL: `https://committees-api.parliament.uk/api`

## Committees
- `GET /Committees` — query params include `SearchTerm`, `House`,
  `IsLeadCommittee`, `IncludeBanners`, `Source`, `Skip`, `Take`.
- `GET /Committees/{id}` — full committee record.
- `GET /Committees/NextEvent` — next scheduled meeting per committee.
- `GET /Committees/{id}/Members` — past and present membership.
- `GET /Committees/{id}/Members/{personId}` — lay member portrait
  (image bytes, used for non-Member experts).
- `GET /Committees/{id}/Staff` — clerks, specialists, secretariat.
- `GET /Committees/{id}/Events` — meeting events.
- `GET /Committees/{id}/Publications/Summary` — publication groups.
- `GET /Committees/{id}/ArchivedPublicationLinks` — older publications.

## Committee Business (inquiries)
- `GET /CommitteeBusiness` — `SearchTerm`, `CommitteeId`, `Type`,
  `IncludeArchived`, `Skip`, `Take`.
- `GET /CommitteeBusiness/{id}`
- `GET /CommitteeBusiness/{id}/Publications/Summary`

## Evidence
- `GET /OralEvidence` — `CommitteeBusinessId`, `Witness`, `Skip`, `Take`.
- `GET /OralEvidence/{id}`
- `GET /OralEvidence/{id}/Document/{fileDataFormat}` — `Pdf|Docx|Html`.
- `GET /WrittenEvidence`
- `GET /WrittenEvidence/{id}`
- `GET /WrittenEvidence/{id}/Document/{fileDataFormat}`

## Events and meetings
- `GET /Events`
- `GET /Events/Activities`
- `GET /Events/{id}`
- `GET /Events/{id}/Activities`
- `GET /Events/{id}/Attendance`
- `GET /Broadcast/Meetings?StartDate=...&EndDate=...` — used by the
  Parliament TV scheduling.

## Publications
- `GET /Publications`
- `GET /Publications/{id}`
- `GET /Publications/{id}/Document/{documentId}/{fileDataFormat}`
- `GET /PublicationType`

## Bill petitions (Public Bill Committee petitions)
- `GET /BillPetitions`
- `GET /BillPetitions/{id}`
- `GET /BillPetitions/{id}/Document/{fileDataFormat}`

## Submission periods (call-for-evidence windows)
- `GET /SubmissionPeriod/{id}`
- `GET /SubmissionPeriodTemplate/{id}/Document/{documentId}`

## Reference data
- `GET /CommitteeBusinessType`
- `GET /CommitteeType`
- `GET /Countries`
- `GET /Members` — bulk membership lookup, `MembershipStatus=Current|All`.
- `GET /Messaging/Banners/{location}` — UI banners; ignore for data work.

## Notes

- Pagination is `Skip` / `Take`; `Take` caps at 30 on most list calls.
- All evidence document downloads serve the file with the right
  `Content-Disposition`; the `fileDataFormat` path segment must match
  what was published — `Pdf` is universally available; `Docx` and
  `Html` are sometimes missing.
- The same committee can have many records over time when its name or
  scope changes; `Source` filters by data origin (legacy vs current
  CMS).
