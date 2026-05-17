---
name: os
description: Catalogue and download Ordnance Survey OpenData — Boundary-Line (every UK administrative boundary including Westminster constituencies, wards, councils, civil parishes), Code-Point Open (postcode unit centroids), OS Open Names (gazetteer), OS Open UPRN, OS OpenRoads / OpenRivers / OpenGreenspace / OpenMap Local / Zoomstack, OS Terrain 50, plus several BGS geology overlays. Use when you need a bulk download of authoritative UK geographic data, or to look up which OS Open products exist and their current version and file sizes. No API key needed for the OpenData downloads. The keyed OS Data Hub APIs (OS Names, Features, Maps, Vector Tile) are NOT wrapped here.
license: Open Government Licence v3.0 (Crown copyright; Ordnance Survey OpenData)
metadata:
  facility: os
  cli-alias: os
  base-url: https://api.os.uk/downloads/v1
  provenance:
    tier: 3
    operator: Ordnance Survey (OS)
    service: api.os.uk/downloads/v1 (OS Data Hub OpenData downloads)
    upstream-data: "Ordnance Survey OpenData under OGL v3.0; some products bundle BGS / EA / Met Office source data"
    citation-short: "via Ordnance Survey OpenData"
    citation-formal: "Ordnance Survey OpenData (Crown copyright, OGL v3.0), product {id} version {versionDate}, retrieved {date}"
    confidence: authoritative
    confidence-notes: "Boundary-Line is the OS authoritative source for UK administrative boundaries. For lighter use cases (just the polygon JSON for one constituency) prefer ons-geo — it serves the same boundaries via REST without a 700 MB download."
---

# Ordnance Survey OpenData

Base URL: `https://api.os.uk/downloads/v1`

OS's no-auth-required downloads catalogue. ~30 OS Open products,
all under OGL v3.0, all bulk ZIP downloads. Updated quarterly to
twice-yearly depending on product.

## Headline products for UK Parliament joins

| Product id | What it is | Typical use |
|---|---|---|
| `BoundaryLine` | Every UK administrative boundary — Westminster constituencies, council wards, civil parishes, electoral divisions. ESRI Shapefile / GeoPackage / GML / MapInfo TAB / Vector Tiles. ~700 MB. | Authoritative constituency polygons for offline use. |
| `CodePointOpen` | Every postcode unit centroid in GB with grid easting/northing. CSV. ~50 MB. | Postcode-to-coordinate lookup. |
| `OpenNames` | Gazetteer of named features — places, roads, hills, water features. CSV / GML. | Placename → location. |
| `OpenUPRN` | Every Unique Property Reference Number with coordinate. | Address-level matching. |
| `OpenZoomstack` | Vector basemap tiles. | Web maps. |

`parl os products` lists every product. `parl os products --filter Boundary`
narrows.

## CLI

```sh
parl os products                       # catalogue (32 products as of 2026-05)
parl os products --filter Boundary
parl os product BoundaryLine           # version, formats, description
parl os downloads BoundaryLine         # list available files (format / area / size)
parl os download-url BoundaryLine bdline_essh_gb.zip  # direct URL only
parl os download BoundaryLine bdline_essh_gb.zip --out boundaryline.zip
```

`download` follows the OS Data Hub's 302 redirect to the actual file
URL. Large files (Boundary-Line GeoPackage is ~800 MB); for those,
prefer streaming via the `--out` flag.

## When to use this vs `ons-geo`

| You want… | Use |
|---|---|
| One constituency's polygon, fast, over REST | [`ons-geo`](../ons-geo/SKILL.md) |
| The boundary of every constituency in one file, offline | `os download BoundaryLine bdline_essh_gb.zip` |
| Council ward boundaries | Either; `os` for bulk |
| Postcode → coordinate | `os download CodePointOpen …` (~50 MB CSV) |
| Postcode → constituency | [`mysoc-mapit`](../mysoc-mapit/SKILL.md) (single REST call) |
| Place name → coordinate | `os download OpenNames …` |

The `ons-geo` REST FeatureServer is preferable for ad-hoc queries
because boundary polygons are large; `os` matters when you need
the full bulk dataset (geo-analysis pipelines, offline rendering,
unusual filtering not supported by ArcGIS query).

## NOT wrapped (keyed APIs)

The OS Data Hub also publishes APIs that require a free API key:

| API | What it does | Where |
|---|---|---|
| **OS Names** | Search the gazetteer interactively. | `api.os.uk/search/names/v1` |
| **OS Features** | Query OS MasterMap features by attribute / spatial filter. | `api.os.uk/features/v1` |
| **OS Maps** | Pre-rendered raster basemap tiles. | `api.os.uk/maps/raster/v1` |
| **OS Vector Tile** | Vector tiles for client-side styling. | `api.os.uk/maps/vector/v1` |

Out of scope for this facility. Add as a separate `os-data-hub`
facility if a key becomes available.

## Provenance to cite

**Tier 3 — third-party (Ordnance Survey), authoritative.**
Crown copyright under OGL v3.0.

- Inline cite: **"(via Ordnance Survey OpenData)"** — once per
  paragraph.
- For boundary polygons, name the product and version:
  *"Ordnance Survey Boundary-Line, version {versionDate}, OGL
  v3.0"*. The `parl os product <id>` command shows the version.
- For bulk-derived analysis, note that Boundary-Line refreshes
  twice yearly; the boundaries you analysed may not be current.
- See [`../../docs/provenance.md`](../../docs/provenance.md) for
  cross-skill rules.
