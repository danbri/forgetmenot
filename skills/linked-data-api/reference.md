# Linked Data API (Elda) — dataset reference

Hosts:
- `https://lda.data.parliament.uk` (canonical)
- `https://eldaddp.azurewebsites.net` (Azure-hosted fallback)

Both serve identical content. The canonical host has historically
been intermittently unreachable while the Azure host stays up — when
the canonical 404s on a known dataset, retry against the Azure host
before assuming the dataset has been retired.

## Known dataset paths (confirmed live or historic)

| Dataset | Path |
|---|---|
| Commons divisions | `/commonsdivisions.json` |
| Lords divisions | `/lordsdivisions.json` |
| Commons oral questions | `/commonsoralquestions.json` |
| Commons written questions | `/commonswrittenquestions.json` |
| Lords written questions | `/lordswrittenquestions.json` |
| Early Day Motions | `/edms.json` |
| Briefing papers | `/briefingpapers.json` |
| Research briefings | `/researchbriefings.json` |
| Election results | `/electionresults.json` |
| Elections | `/elections.json` |
| Proceedings (sittings) | `/proceedings.json` |
| Bill amendments | `/billamendments.json` |
| Members | `/members.json` |
| Thesaurus | `/thesaurus.json` |
| Publication logs | `/publicationlogs.json` |

The canonical inventory is the JS bundle at
`https://explore.data.parliament.uk/Scripts/modules/releaseddatasets.json`.
We capture it at
[`_specs/discovered/releaseddatasets.txt`](../../_specs/discovered/releaseddatasets.txt)
on each refresh.

## Query parameters

The Elda installation supports the standard Linked Data API set:

| Parameter | Meaning |
|---|---|
| `_page` | 0-indexed page number. |
| `_pageSize` | rows per page; default 10, max 500. |
| `_sort` | sort key; prefix with `-` for descending. |
| `_select` | comma-separated property list. |
| `_metadata=all` | include rich metadata (definitions, totals). |
| `_view=name` | named view if defined for the dataset. |
| `_lang=en` | language preference. |
| `<property>=value` | filter on any property in the dataset. |
| `min-<property>=`, `max-<property>=` | range filters. |
| `exists-<property>=true|false` | nullity filter. |

## Output shape

```jsonc
{
  "format": "linked-data-api",
  "version": "0.2",
  "result": {
    "_about": "...",          // self URL
    "definition": "...",      // metadata definition URL
    "extendedMetadataVersion": "...",
    "first": "...",
    "next": "...",
    "prev": "...",
    "last": "...",
    "items": [ /* the actual records */ ],
    "itemsPerPage": 10,
    "page": 0,
    "totalResults": 12345,
    "type": ["http://purl.org/linked-data/api/vocab#Page"],
    "isPartOf": { "_about": "...", "definition": "...", "hasPart": "...", "type": [...] }
  }
}
```

## Notes

- Items returned by the LDA carry the same canonical
  `https://id.parliament.uk/<short-id>` URIs as the SPARQL endpoint —
  you can cross-reference freely.
- Many of the modern REST APIs (Bills, Committees, …) have replaced
  the corresponding LDA dataset; reach for the modern API when
  available and only fall through to LDA for legacy datasets without
  an alternative (Briefing Papers, Research Briefings, Thesaurus,
  Election Results).
