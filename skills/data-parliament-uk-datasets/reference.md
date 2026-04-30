# data.parliament.uk dataset family — full reference

The portal at `https://explore.data.parliament.uk/` is a static SPA.
All actual data is served by [the Linked Data
API](../linked-data-api/SKILL.md) at `lda.data.parliament.uk` and its
Azure mirror.

This file collects in one place:

- A captured copy of the portal's dataset name list.
- The mapping to LDA slug and to the modern REST API equivalent.
- Notes on dataset-specific quirks.

## Portal dataset list (captured)

See [`_specs/discovered/releaseddatasets.txt`](../../_specs/discovered/releaseddatasets.txt).
Refresh with:

```sh
curl -s 'https://explore.data.parliament.uk/Scripts/modules/releaseddatasets.json' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(x) for x in d]" \
  > _specs/discovered/releaseddatasets.txt
```

(`scripts/refetch-discovered.sh` does this; see that script for the
complete dataset-discovery automation.)

## Dataset-specific notes

### Briefing Papers (`/briefingpapers.json`)
Commons Library briefing papers. Each item has `title`, `created`,
`subject` (SKOS concept), `topic`, `category`, `link` (to the PDF on
parliament.uk), `subjects[]`. Filter by topic with `topic.url=...` or
by date with `min-created=YYYY-MM-DD`.

### Research Briefings (`/researchbriefings.json`)
Lords Library briefings + POST notes. Same shape as briefing papers.

### Thesaurus (`/thesaurus.json`)
The Parliament Thesaurus — a SKOS concept scheme used to index
debates, papers, written questions and other content. Each concept
has `prefLabel`, `altLabel[]`, `broader[]`, `narrower[]`, `related[]`.
Pulling the whole thing requires walking pages of `_pageSize=500`.

### Publication Logs (`/publicationlogs.json`)
Audit trail of when items were published / republished. Useful for
real-time pipelines tracking new content.

### AV Live Logging (`/avliveloggings.json`)
Per-meeting / per-debate audio-visual log entries used by the
Parliament TV operation. The modern Committees API
`/Broadcast/Meetings` covers committee meetings; the LDA dataset
covers the wider AV operation.

### Hansard datasets
The four Hansard datasets (`commonsproceedings`, `commonsdocuments`,
`lordsproceedings`, `lordsdocuments`) on the LDA cover 2010ish
onwards. The modern [Hansard API](../hansard/SKILL.md) covers from
1988; for new work prefer the modern API.

### Commons Divisions (`/commonsdivisions.json`)
Commons divisions; same data as the modern
[Commons Votes API](../commons-votes/SKILL.md) but with linked-data
URIs.

### Bill Amendments (`/lordsbillamendments.json`)
Lords amendment papers. The modern [Bills API](../bills/SKILL.md)
returns amendment papers per stage (`/Bills/{id}/Stages/{stageId}/Amendments`)
with structured amendment text.

## Cross-walk to SPARQL

Every record in the LDA has an `_about` URI under
`https://id.parliament.uk/...` — that same URI is the resource in the
[SPARQL endpoint](../sparql/SKILL.md). When a dataset is exposed via
LDA but you need to join it to other resources, the easiest path is
often to take the URI from the LDA and continue in SPARQL.
