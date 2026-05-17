---
name: ons-geo
description: Query the ONS Open Geography Portal — the authoritative UK source for administrative-geography boundaries. Use whenever you need a Westminster constituency boundary polygon (current 2024 review or any prior set since 1995), or want to enumerate every constituency / local authority / ward / region for a given epoch, or join an MP's constituency `PCON24CD` (ONS GSS code) to its full geometry, name, easting/northing, and lat/lon centroid. Each layer is a typed boundary set (constituencies, LADs, wards, regions, counties, parishes) for one snapshot date, with field names that include the year suffix. ArcGIS REST FeatureServer; no auth required.
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: ons-geo
  cli-alias: ons-geo
  base-url: https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services
  provenance:
    tier: 3
    operator: Office for National Statistics (ONS)
    service: services1.arcgis.com/ESMARspQHYMw9BZ9 (ONS Open Geography Portal — ArcGIS REST)
    upstream-data: "ONS Open Geography Portal (Crown copyright, OGL v3.0). Underlying geometry typically derived from Ordnance Survey Boundary-Line."
    citation-short: "via ONS Open Geography Portal"
    citation-formal: "ONS Open Geography Portal, Crown copyright (OGL v3.0), retrieved {date}"
    confidence: authoritative
    confidence-notes: "Boundary polygons are the canonical UK statistical-geography source. ONS publishes BUC (clipped), BFE (full extent), BGC (generalised clipped), BFC (full clipped), and BSC (super-generalised) variants per epoch — pick the resolution that matches your use."
---

# ONS Open Geography Portal

Base URL:
`https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services`

ONS's public ArcGIS REST FeatureServer for every UK administrative-
geography boundary set. ~3,900 services in total, one per
boundary-type-per-epoch. The headline service for Parliament joins:

```
Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC
```

Each feature in that layer has the fields:

| Field | Meaning |
|---|---|
| `PCON24CD` | GSS code (e.g. `E14001063`). The same code Parliament uses. |
| `PCON24NM` | Constituency name in English |
| `PCON24NMW` | Constituency name in Welsh (empty for non-Welsh) |
| `BNG_E`, `BNG_N` | British National Grid easting / northing of the centroid |
| `LONG`, `LAT` | WGS84 lon / lat of the centroid |
| `Shape__Area`, `Shape__Length` | Geometry stats |

## Boundary-set naming convention

ONS layers follow `<TYPE>_<MONTH>_<YEAR>_<COUNTRY>_<RESOLUTION>` where:

| Suffix | Meaning |
|---|---|
| `BUC` | Boundaries — Ultra-Clipped (the lightest; best for web maps) |
| `BGC` | Boundaries — Generalised Clipped |
| `BFC` | Boundaries — Full extent Clipped |
| `BFE` | Boundaries — Full Extent (includes maritime to the 12-mile limit) |
| `BSC` | Boundaries — Super-generalised Clipped |
| `NC` | Names + Codes (no geometry — lookup table only) |

For Westminster constituencies the modern review is `July_2024`; the
previous one was `Dec_2022` (the pre-review 533/59/40/18 split going
back to 2010); intermediate ones (`Dec_2023`, `Dec_2025`) cover
boundary-change snapshots.

## What's at the portal

| Boundary type | Field prefix | Typical service name |
|---|---|---|
| Westminster constituencies | `PCON<yr>` | `Westminster_Parliamentary_Constituencies_*` |
| Local Authority Districts | `LAD<yr>` | `Local_Authority_Districts_*` |
| Wards | `WD<yr>` | `Wards_*` |
| Counties | `CTY<yr>` | `Counties_*` |
| Regions | `RGN<yr>` | `Regions_*` |
| Ceremonial counties | `CTYUA<yr>` | `Ceremonial_Counties_*` |
| Built-Up Areas | `BUA<yr>` | `Built_Up_Areas_*` |
| Output Areas (Census 2021) | `OA21` | `Output_Areas_*` |
| LSOA / MSOA | `LSOA21`, `MSOA21` | `LSOA_*` / `MSOA_*` |

`parl ons-geo list-services --filter Westminster_Parliamentary` gives
you the per-epoch options.

## Common chains

- **Aldershot's boundary polygon (lightweight)**:
  ```sh
  parl ons-geo find-by-code \
      Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC \
      PCON24CD E14001063 --return-geometry --geometry-precision 5
  ```
- **All London constituencies (current review)**:
  ```sh
  parl ons-geo query \
      --service Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC \
      --where "PCON24NM LIKE '%London%' OR PCON24NM LIKE '%Westminster%'" \
      --out-fields PCON24CD,PCON24NM --take 50
  ```
- **A constituency's name without geometry, fastest**:
  ```sh
  parl ons-geo query \
      --service Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC \
      --where "PCON24CD='E14001063'" \
      --out-fields PCON24NM
  ```

## CLI

```sh
parl ons-geo list-services --filter PCON         # find boundary sets
parl ons-geo service-info <service>              # layer metadata + fields
parl ons-geo query --service <s> --where "..." --out-fields "..."
parl ons-geo find-by-code <service> PCON24CD E14001063
parl ons-geo layer-count <service>
```

## Library use

```js
import * as ons from '../../lib/facilities/ons-geo.mjs';

// One constituency record (no geometry — fast).
const aldershot = await ons.findByCode(
  'Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC',
  'PCON24CD', 'E14001063',
);
// → { attributes: { PCON24CD, PCON24NM, BNG_E, BNG_N, LONG, LAT, ... } }

// Same record with boundary polygon.
const withGeom = await ons.findByCode(
  'Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC',
  'PCON24CD', 'E14001063',
  { returnGeometry: true, geometryPrecision: 5, outSR: 4326 },
);
```

## Relationship to other facilities

- For **postcode → constituency** look up by GSS code, use
  [`mysoc-mapit`](../mysoc-mapit/SKILL.md) (`parl mapit postcode`).
  MapIt's areas carry the same GSS codes ONS uses.
- For **Parliament-side data** about a constituency, use
  [`members`](../members/SKILL.md) `constituency-search` and
  `constituency <id>`.
- For **historical-review context** (why the boundary changed
  between 2010 and 2024), the Boundary Commission Final Reports
  are PDF-only and not yet wrapped.

## Provenance to cite

**Tier 3 — third-party (ONS), authoritative.** Crown copyright
under Open Government Licence v3.0.

- Inline cite: **"(via ONS Open Geography Portal)"** — once per
  paragraph.
- For boundary polygons in formal output, prefer the layer name:
  "ONS July 2024 constituency boundaries (BUC), retrieved
  {date}". The resolution suffix (`BUC` / `BGC` / `BFE`) materially
  affects map appearance; cite which one you used.
- See [`../../docs/provenance.md`](../../docs/provenance.md) for
  the cross-skill rules.
