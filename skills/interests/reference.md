# Register of Members' Financial Interests API — full endpoint reference

Cached spec: [`_specs/interests.json`](../../_specs/interests.json)
Endpoint table: [`_specs/endpoint-tables/interests.txt`](../../_specs/endpoint-tables/interests.txt)

Base URL: `https://interests-api.parliament.uk/api/v1`

## Endpoints

### Interests
- `GET /Interests` — query params:
  `MemberId`, `CategoryId`, `IsCorrection`, `IsPublished`,
  `PublishedFrom`, `PublishedTo`, `CreatedFrom`, `CreatedTo`,
  `AmendedFrom`, `AmendedTo`, `DeletedFrom`, `DeletedTo`,
  `RegistrationDateFrom`, `RegistrationDateTo`, `Take`, `Skip`,
  `OrderByDate`.
- `GET /Interests/{id}` — full interest record including
  `description`, `child[]` payments, `donors`, `category`, `member`,
  `parentInterestId` for rectifications.
- `GET /Interests/csv` — same parameters, returns a zipped bundle of
  CSV files (interests, payments, donors, categories, members).

### Categories
- `GET /Categories` — list of all numbered categories.
- `GET /Categories/{id}` — full record with children/sub-categories.

### Registers
- `GET /Registers` — published snapshots, with `publishedDate`,
  `houseId`.
- `GET /Registers/{id}` — metadata for one snapshot.
- `GET /Registers/{id}/document` — PDF bytes.

## Notes

- A **rectification** means an MP corrected an entry — the new entry
  has `parentInterestId` pointing to the original. To get only
  current values, filter `IsCorrection=false` (or chase the chain).
- Categories are numbered (1 = Employment & earnings, 2 = Donations
  and other support, etc.). The numbering occasionally changes
  between Parliaments; pull `Categories` rather than hard-coding.
- The Lords have their own register, surfaced through the Members API
  endpoint `GET /api/LordsInterests/Register`. The current API is
  Commons-focused.
