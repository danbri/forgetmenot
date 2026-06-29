# `third_party/local/pspo/` — PSPO map source-of-record

Aggregated Public Spaces Protection Order boundaries, fetched from the councils
that publish them as open data. This is the **canonical source**; the live map
at `demos/parliament-live/web/pspo-map/` serves an inlined bundle
(`data/data.js`, defining `window.PSPO_SAMPLE` / `window.PSPO_SOURCES`)
generated from these files.

| File | What |
|---|---|
| `pspo_sample.geojson` | 83 PSPO boundary features from 8 councils (Sheffield, Gedling, York, Barking & Dagenham, Maldon, Fareham/Hill Head beach, Stafford, Cannock Chase). Stafford + Cannock reprojected EPSG:27700 → WGS84. WGS84, display-generalised — **not authoritative for legal extent**. |
| `pspo_sources.json` | Per-council source manifest: council → source URL → feature count. |

**Honesty:** illustrative sample only — there is no national PSPO registry, and
absence of a council here does not mean it has no PSPO (most do; they just don't
all publish geodata). North Somerset (the map's subject) publishes only the
order *text*, so it is pinned on the map, not represented here.
