# e-Petitions API — full endpoint reference

Base URL: `https://petition.parliament.uk`

This is a JSON:API-style service; each resource has an HTML and a
`.json` form. There is no Swagger / OpenAPI document published, so
the endpoints below are documented from observation and from the
service's source repository
(`https://github.com/alphagov/e-petitions`).

## Endpoints

### Petitions
- `GET /petitions.json` — query params: `state` (single), `topic`,
  `q` (search), `count` (max 50), `page`, `sort`
  (`signatures` | `most_recent` | `most_recent_response`).
- `GET /petitions/{id}.json` — one petition.

### Archive
- `GET /archive/petitions.json` — archived petitions.
- `GET /archive/petitions/{id}.json` — one archived petition.

### Topic / category lookups
- `GET /topics.json` — list of valid topic slugs (returns HTML on
  most paths; `topics.json` has historically returned an array).

## Response shape (one petition)

```jsonc
{
  "data": {
    "type": "petition",
    "id": "700000",
    "attributes": {
      "action": "...",
      "background": "...",
      "additional_details": "...",
      "state": "open",
      "signature_count": 12345,
      "signatures_by_constituency": [
        {"name": "...", "ons_code": "E14000647", "mp": "...", "signature_count": 42}
      ],
      "signatures_by_country": [
        {"name": "United Kingdom", "code": "GB", "signature_count": 12200}
      ],
      "topics": ["environment"],
      "government_response": { "summary": "...", "details": "...", "responded_on": "..." },
      "debate": { "debated_on": "...", "transcript_url": "...", "video_url": "..." },
      "scheduled_debate_date": null,
      "moderation_threshold_reached_at": "...",
      "response_threshold_reached_at": "...",
      "debate_threshold_reached_at": "...",
      "opened_at": "...", "closed_at": "...", "rejected_at": null,
      "creator_name": "..."
    }
  }
}
```

## Notes

- The petitions API does **not** require authentication and is
  deliberately public.
- Joining to a constituency's current MP is via the Members API
  `Location/Constituency/Search` endpoint; the petitions API itself
  carries the MP **name at the time** in `signatures_by_constituency`,
  which can drift if a by-election has happened.
- For the SQL-like cross-cut (signatures × topic × constituency)
  consider downloading the JSON for each open petition and joining
  yourself; there is no bulk export.
