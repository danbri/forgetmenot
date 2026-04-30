# Parameterised query browser — full template list

Endpoint: `https://api.parliament.uk/query/`

The complete list of templates is captured at
[`_specs/discovered/query-templates.txt`](../../_specs/discovered/query-templates.txt).
Below is a topic-grouped digest as of 2026-04-30.

## People (`person_*`)

- `person_index`, `person_a_to_z`
- `person_by_id?person_id=…`, `person_by_initial?initial=…`,
  `person_by_substring?substring=…`
- `person_lookup?property=mnisId&value=…` — also `pimsId`, `dodsId`,
  `wikidataId`, etc.
- `person_constituencies?person_id=…`,
  `person_current_constituency?person_id=…`
- `person_parties?person_id=…`,
  `person_current_party?person_id=…`
- `person_houses?person_id=…`,
  `person_current_house?person_id=…`
- `person_contact_points?person_id=…`
- `person_committees_index?person_id=…`,
  `person_committees_memberships_index?person_id=…`,
  `person_current_committees_memberships?person_id=…`
- `person_mps`

## Members (`member_*`)

- `member_index`, `member_a_to_z`
- `member_current`, `member_current_a_to_z`
- `member_by_initial?initial=…`,
  `member_current_by_initial?initial=…`

## Constituencies (`constituency_*`)

- `constituency_index`, `constituency_a_to_z`
- `constituency_by_id?constituency_id=…`,
  `constituency_by_initial?initial=…`,
  `constituency_by_substring?substring=…`,
  `constituency_lookup?property=onsCode&value=…`,
  `constituency_lookup_by_postcode?postcode=…`
- `constituency_current`, `constituency_current_a_to_z`,
  `constituency_current_by_initial?initial=…`
- `constituency_map?constituency_id=…` — geometry.
- `constituency_members?constituency_id=…`,
  `constituency_current_member?constituency_id=…`
- `constituency_contact_point?constituency_id=…`
- `find_your_constituency`

## Parties

- `party_index`, plus per-party templates exposed by the same naming
  convention (see the discovered list).

## Other (committees, governments, sittings, etc.)

The discovered list includes templates around committees, government
posts, sittings, divisions, and treaties. For a complete enumeration
re-run

```sh
curl -sL 'https://api.parliament.uk/query/' \
  | grep -oE "href='[^']*'" | sed "s/href='//;s/'//" | sort -u
```

(or commit a refreshed copy to `_specs/discovered/query-templates.txt`).

## Notes

- Templates that take no parameters are safe to call directly; ones
  that require parameters return a 400 if the parameter is missing.
- The returned JSON is unwrapped — top-level is an array, not a
  SPARQL results binding object.
- These are stable resource endpoints; the same template names have
  been served for several years.
