---
name: data-parliament-uk-datasets
description: Catalogue and pointer to the 19 datasets surfaced by explore.data.parliament.uk — the older parliamentary "Open Data" portal. Each dataset is served by the Linked Data API at lda.data.parliament.uk; this skill is the index that maps dataset name to LDA path and to the modern API equivalent (where one exists). Use when a question references the data.parliament.uk portal or a dataset by its portal name (e.g. "Briefing Papers", "Research Briefings", "Thesaurus", "Election Results").
---

# data.parliament.uk dataset family

Portal: `https://explore.data.parliament.uk/`

The 19 datasets the portal advertises are not themselves served by
the portal — the portal is a knockout.js SPA over the Linked Data API
hosts (see [`linked-data-api`](../linked-data-api/SKILL.md)).

The portal's dataset list is a static JSON bundle:

```
https://explore.data.parliament.uk/Scripts/modules/releaseddatasets.json
```

Captured at
[`_specs/discovered/releaseddatasets.txt`](../../_specs/discovered/releaseddatasets.txt)
(if missing, run `bash scripts/refetch-discovered.sh` to regenerate).

## The 19 datasets and their modern equivalents

| Portal name | LDA path | Modern API alternative |
|---|---|---|
| Briefing Papers | `/briefingpapers.json` | none — LDA only |
| Parliamentary Questions Answered | `/answeredquestions.json` (or per-house variants below) | [Questions & Statements](../written-questions-and-statements/SKILL.md) |
| Members | `/members.json` | [Members API](../members/SKILL.md) |
| Commons Divisions | `/commonsdivisions.json` | [Commons Votes API](../commons-votes/SKILL.md) |
| Commons Oral Questions | `/commonsoralquestions.json` | [Oral Questions & EDMs](../oral-questions-and-edms/SKILL.md) |
| Commons Oral Question Times | `/commonsoralquestiontimes.json` | [Oral Questions & EDMs](../oral-questions-and-edms/SKILL.md) |
| Commons Written Questions | `/commonswrittenquestions.json` | [Questions & Statements](../written-questions-and-statements/SKILL.md) |
| Lords Written Questions | `/lordswrittenquestions.json` | [Questions & Statements](../written-questions-and-statements/SKILL.md) |
| Thesaurus | `/thesaurus.json` | none — LDA / SPARQL only (the Parliament SKOS Thesaurus) |
| Research Briefings | `/researchbriefings.json` | none — LDA only |
| Elections | `/elections.json` | partial: [Members API](../members/SKILL.md) `/Location/Constituency/{id}/ElectionResults` |
| Election Results | `/electionresults.json` | as above |
| Publication Logs | `/publicationlogs.json` | none — LDA only |
| AV Live Logging | `/avliveloggings.json` | partial: [Committees API](../committees/SKILL.md) Broadcast/Meetings |
| Lords Bill Amendments | `/lordsbillamendments.json` | [Bills API](../bills/SKILL.md) Stages/Amendments |
| Hansard Commons Proceedings | `/commonsproceedings.json` | [Hansard API](../hansard/SKILL.md) |
| Hansard Commons Documents | `/commonsdocuments.json` | [Hansard API](../hansard/SKILL.md) |
| Hansard Lords Proceedings | `/lordsproceedings.json` | [Hansard API](../hansard/SKILL.md) |
| Hansard Lords Documents | `/lordsdocuments.json` | [Hansard API](../hansard/SKILL.md) |

## When to use this skill

This skill is mostly **referential**. It tells the model:

1. The user's reference to a portal-by-name dataset maps to the LDA
   slug above.
2. There is *usually* a modern API equivalent that should be tried
   first.
3. The Parliament Thesaurus, Briefing Papers, Research Briefings,
   Publication Logs and AV Live Logging have **no modern API
   replacement**, so the LDA is still the canonical access route.

## Worked example

```sh
# 5 most recent Commons briefing papers
curl -s 'https://lda.data.parliament.uk/briefingpapers.json?_pageSize=5&_sort=-created' \
  | jq '.result.items[] | {title, created, link: ._about}'
```

## Notes

- The LDA dataset paths are not perfectly canonical; if a slug 404s,
  try the singular/plural variant, the legacy slug, or the SPARQL
  endpoint.
- The Parliament Thesaurus is a SKOS concept scheme. It is the bridge
  between free-text content (Hansard, briefing papers, written
  questions) and the structured data graph — see
  [`docs/todo.md`](../../docs/todo.md) for the planned alignment work.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs ddpd --help
```

Or after `npm link` (one-time install):

```sh
parl ddpd --help
```

Catalogue mapping the explore.data.parliament.uk dataset names to LDA slugs and modern-API equivalents.

### Examples

```sh
parl ddpd list
```
The 19 portal dataset names.

```sh
parl ddpd map "Briefing Papers"
```
Map a name to LDA slug + modern API note.

```sh
parl ddpd map "Thesaurus"
```
Map the Parliament Thesaurus.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/data-parliament-uk-datasets.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
