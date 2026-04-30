# UK Parliament OData — entity-set reference

Service: `https://api.parliament.uk/odata/`
$metadata: `https://api.parliament.uk/odata/$metadata`

The full enumerated list of entity sets is at
[`_specs/discovered/odata-entities.txt`](../../_specs/discovered/odata-entities.txt)
(183 sets as of 2026-04-30).

## OData v4 query options used by this service

| Option | Meaning |
|---|---|
| `$select=A,B` | Return only the named properties. |
| `$filter=…` | Filter expression. |
| `$expand=Nav` | Pull a navigation property's records inline. |
| `$orderby=Field desc` | Sort. |
| `$top=N` | Limit. |
| `$skip=N` | Offset. |
| `$count=true` | Include total count alongside results. |
| `Id eq '…'` | Equality on the ID. |
| `startswith(field,'…')`, `contains(field,'…')` | String predicates. |

Filter expressions are case-sensitive on field names (which use
PascalCase here: `PersonGivenName`, not `personGivenName`).

## Discovering navigation properties

```http
GET https://api.parliament.uk/odata/$metadata
```

Returns CSDL XML; parse it (or grep) to see the relationships
between sets. Almost every "X" entity has a navigation property
back to `Person` or to another lifecycle entity.

## Useful sets

- `Person` — every person known to Parliament's data graph.
- `Member` — `Person` who is or was a Member of either House.
- `MnisMember` — MNIS-flavoured projection (preserves MNIS IDs).
- `SeatIncumbency` — membership of a Commons seat in time.
- `PartyMembership` — party affiliation in time.
- `Constituency` (alias `ConstituencyGroup`) — Westminster constituencies.
- `Party` — political parties.
- `Government` — successive UK governments with start/end dates.
- `FormalBody` — committees and other formal bodies.
- `FormalBodyMembership` — membership of a formal body in time.

## Notes

- Some entity sets are scaffolding for the linked-data store and
  have very few or zero rows (`MnisGender`, `PimsPerson`); inspect
  `$count` before designing a UI around them.
- The OData endpoint **does not** expose the procedural data
  (debates, divisions, contributions). For those, drop down to
  [SPARQL](../sparql/SKILL.md) or use the dedicated
  [Hansard](../hansard/SKILL.md) and
  [Commons Votes](../commons-votes/SKILL.md) /
  [Lords Votes](../lords-votes/SKILL.md) APIs.
