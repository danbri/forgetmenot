# Secondary legislation, mapped — Calder Valley

An interactive Leaflet map that shows **UK secondary legislation as geography**,
combined with the "usual" open-data/open-source tooling (OpenStreetMap,
OpenTopoMap, Wikidata, open elevation). Focused on the **Calder Valley**
constituency (Hebden Bridge / Todmorden / Sowerby Bridge — Pennine flood country).

**Live:** <https://fpkg.fly.dev/si-map/> (served by the parliament-live / fpkg
Fly app from this `web/si-map/` directory; deployed by `.github/workflows/deploy-fpkg.yml`
on pushes to `claude/main` that touch `demos/parliament-live/**`).

Run locally via the fpkg server, or open the file directly:

```sh
# through the real server (proxied tiles, like prod):
cd demos/parliament-live && PORT=8788 node server.mjs   # → http://localhost:8788/si-map/
# or standalone — opens straight from file:// (data is inlined in data.js):
open demos/parliament-live/web/si-map/index.html
```

On an http origin the basemap tiles route through the app's `/api/osm-tile/`
and `/api/topo-tile/` proxy (caching + attribution + politeness, per the
fpkg CLAUDE.md rule 3); opened from `file://` it falls back to the public
tile hosts. The page uses **no** UK Parliament API data, so it carries the
relevant source attributions (OSM / EA / ONS / Wikidata / Open-Meteo) rather
than the Open Parliament Licence string.

## What's on the map

| Layer | Source | Why it's *secondary legislation* |
|---|---|---|
| **Constituency boundary** | ONS Open Geography (`PCON24` BUC) | Westminster boundaries are made by an Order in Council — a statutory instrument: the **Parliamentary Constituencies Order 2023** (SI 2023/1230), under the Parliamentary Constituencies Act 1986. |
| **Flood Warning Areas** (blue) | Environment Agency flood-monitoring API | Statutory flood-warning footprints designated by the EA under the Flood and Water Management Act 2010 + Flood Risk Regulations 2009 (SI 2009/3042). |
| **Flood Alert Areas** (orange) | same | Broader river-catchment designations (the `…WAF…` codes). |
| **Settlements** (yellow) | Wikidata (WDQS) | Population, elevation, image, OSM relation, QID per town. |
| Basemaps | OpenStreetMap + OpenTopoMap | OSM streets; OpenTopoMap adds SRTM relief + contour lines. |
| Click-to-elevate | Open-Meteo elevation API (SRTM) | Click anywhere for ground elevation — the flood/elevation pairing is the point: the low valley floors are exactly the flood-warning footprints. |

The legislation data (legislation.gov.uk) carries the **text** and the
jurisdictional **extent** (England / Wales / Scotland / NI) of an SI, but not
polygons. The polygons here come from the geo datasets (EA / ONS) and are joined
to the legislation by name / GSS code — which is the honest state of UK
"geospatial legislation".

## Data provenance

Raw fetched data is kept under `data/` and bundled into `data.js`:

- `data/calder_valley.geojson` — ONS ArcGIS FeatureServer (`Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC`), `PCON24NM='Calder Valley'` (E14001147).
- `data/flood_areas.geojson` — EA `/flood-monitoring/id/floodAreas` clipped to the constituency, each area's `/polygon` GeoJSON merged in (33 areas).
- `data/wikidata_places.json` — WDQS box query for settlements, top 18 by population, enriched with Open-Meteo elevation.

To regenerate, re-run the fetch steps documented in the repo history for this
folder. All upstream data is Open Government Licence v3.0 or CC-BY-SA;
`vendor/leaflet.*` is BSD-2-Clause (Leaflet 1.9.4).

## Licence

Map code MIT. Data under the upstream licences above — attribute OpenStreetMap,
the Environment Agency, ONS, Wikidata and Open-Meteo as shown in the map's
attribution control and intro panel.
