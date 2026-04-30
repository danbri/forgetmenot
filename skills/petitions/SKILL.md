---
name: uk-parliament-petitions
description: Query e-petitions submitted to the UK Parliament petitions service — petition text, signatures (total, by constituency, by country), state (open, closed, awaiting moderation, rejected, debated), government and committee responses, scheduled debates, and signature counts over time. Use when the question is about a specific petition, petitions on a topic, signatures by constituency, or which petitions have crossed the 10,000 / 100,000 thresholds.
---

# UK Parliament e-Petitions API

Base URL: `https://petition.parliament.uk`

JSON:API-style; not on the developer.parliament.uk hub. Each
resource has both an HTML and a JSON form by appending `.json`.

## What it covers

Public petitions submitted to the UK Parliament Petitions service.
Each petition has:

- Action (the ask), background, additional details.
- State (`open`, `closed`, `pending`, `validated`, `sponsored`,
  `in_moderation`, `rejected`, `debated` etc.).
- Total signature count and per-constituency / per-country breakdowns.
- Government response (when ≥10,000 signatures).
- Petitions Committee response and any scheduled debate (when
  ≥100,000 signatures).
- Topics, dates, deadline.

## Common entry points

| Use case | Endpoint |
|---|---|
| List petitions | `GET /petitions.json?state=open&topic=health&count=50&page=1` |
| One petition | `GET /petitions/{id}.json` |
| Archived (older) petitions | `GET /archive/petitions.json` and `/archive/petitions/{id}.json` |
| Signature counts over time | Embedded in `/petitions/{id}.json` under `attributes.signature_count_*` (and `data` page snapshots are not exposed; use the JSON itself). |

States accepted by the `state=` filter:
`open`, `closed`, `awaiting_response`, `with_response`, `debated`,
`awaiting_debate`, `rejected`, `all`.

Topics are slugs returned by the petition records (e.g.
`environment`, `health-services-and-medical-care`).

## Worked example

```sh
# Open petitions about transport
curl -s 'https://petition.parliament.uk/petitions.json?state=open&topic=transport-policy&count=5' \
  | jq '.data[] | {id: .id, action: .attributes.action, signatures: .attributes.signature_count}'
```

## Notes

- The HTML and JSON URLs are identical except for the `.json` suffix —
  e.g. `https://petition.parliament.uk/petitions/700000.json`.
- Closed petitions are kept; archived (previous Parliaments) live
  under `/archive/`.
- This API is **separate** from `developer.parliament.uk` — it is run
  by the Petitions service and isn't part of the swagger-driven set.
- `signatures_by_constituency` is keyed by ONS constituency code
  (`E14000…`); join to the [Members
  API](../members/SKILL.md) `Location/Constituency/Search` to get
  current MP for that seat.
- Pagination: `count` (default 50, max 50) + `page` (1-based). The
  `links` block carries `first`/`last`/`next`/`prev` URIs.
