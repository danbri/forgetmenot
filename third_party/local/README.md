# `third_party/local/` — UK local-government & local-order data

Source-of-record for data about **sub-national / local legal instruments** —
the geo-fenced orders that are made by councils, agencies or companies (not
Ministers), are **not** on the legislation.gov.uk SI register, and are
aggregated nowhere centrally: Public Spaces Protection Orders, Traffic
Regulation Orders, byelaws, Tree Preservation Orders, conservation areas,
rights of way, and the like.

This sits alongside `third_party/data/` (Parliament/national corpora). It is a
**separate tree on purpose**: the material here is fetched from hundreds of
individual councils / FOI threads, is patchy by nature, and carries a heavier
*interpreted* layer (outcome labels, legal characterisation) than the national
datasets do.

## Layout

| Path | What |
|---|---|
| `pspo/` | Source-of-record for the PSPO illustrative map: the aggregated boundary GeoJSON (`pspo_sample.geojson`) + per-source manifest (`pspo_sources.json`). The map at `demos/parliament-live/web/pspo-map/` serves an **inlined bundle** (`data/data.js`) generated from these — the canonical data lives here. |
| `foi-campaigns/` | Surveys of FOI activity that reconstructs local-order datasets council-by-council (e.g. `tpo-prow-campaigns.json`). |

## Convention

- **Sourced vs interpreted.** Every file separates what was *read from an
  authority* (names, GSS codes, request URLs, geometry) from what was
  *inferred/authored* (outcome labels, legal characterisation). Each carries an
  `_meta.epistemic_key` and an `_meta.review.status` (`unreviewed` until an
  expert pass).
- **Served copies live under `web/`, source-of-record lives here.** The static
  server / Docker build only ships what `web/` contains; treat anything under
  `third_party/local/` as the upstream the served bundle is derived from.
- Large artifacts (`*.geojson`, `*.nq.gz`, etc.) are Git LFS-tracked via the
  repo-root `.gitattributes` patterns.
