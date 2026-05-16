---
name: guide-to-procedure
description: Search and read pages from the UK Parliament MPs' Guide to Procedure — short, plain-English procedural explainers written for Members and their staff. Distinct content authority from Erskine May; use this when the question wants a one-screen answer about how a parliamentary procedure works in practice (how to table an amendment, what an Urgent Question is, what happens at Report stage) rather than the formal treatise treatment.
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: guide-to-procedure
  cli-alias: gtp
  base-url: https://guidetoprocedure-api.parliament.uk
  spec: _specs/guide-to-procedure.json
---

# UK Parliament MPs' Guide to Procedure API

Base URL: `https://guidetoprocedure-api.parliament.uk/api`
OpenAPI 3 spec: `https://guidetoprocedure-api.parliament.uk/swagger/v1/swagger.json` (cached at `_specs/guide-to-procedure.json`).

A small content service exposing five endpoints. The corpus is plain-English explainers maintained by Parliament's Procedural Hub, distinct from the [Erskine May](../erskine-may/SKILL.md) treatise.

## Endpoints

| Endpoint | Use |
|---|---|
| `GET /Content/landingPage` | Home / index page content. |
| `GET /Content/howToPage` | Top-level "how to do procedural things" page. |
| `GET /Content/globalMessage` | Site-wide banner / global notice. |
| `GET /Content/contentPage?uri=...` | Single content page by its URI. |
| `GET /Content/search?searchTerms=...&pageNumber=...` | Full-text search. |

## Using the CLI

This skill ships with the `parl` CLI. See [`../parl/SKILL.md`](../parl/SKILL.md) for global usage.

```sh
parl gtp landing
parl gtp search --search-terms "royal assent"
parl gtp page <uri>
```

## Library use

```js
import * as gtp from '../../lib/facilities/guide-to-procedure.mjs';

await gtp.search({ term: 'urgent question' });
await gtp.contentPage('https://guidetoprocedure.parliament.uk/...');
```

## Relationship to other facilities

- For the **canonical, citable** procedural rules → [Erskine May](../erskine-may/SKILL.md). The treatise is exhaustive but dense.
- For **what's happening today** → [whatson](../whatson/SKILL.md).
- For the underlying **rules of the House** → [standing-orders](../standing-orders/SKILL.md) (HTML-only).
