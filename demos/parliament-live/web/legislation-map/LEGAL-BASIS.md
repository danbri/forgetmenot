# Legal-basis register — `data/legal-basis.json`

The single source of truth for the **authored legal characterisation** of each
geography on the map. It exists to make the *interpretive* layer of this demo
small, non-duplicated, and reviewable — separate from the *sourced* geography
(names, GSS codes, ONS relationship lookups), which is fetched from official
APIs and is not in here.

## Why it exists

The legal-chain prose ("drawn by an Order under Act X", the
primary/secondary/notification taxonomy, reserved-vs-devolved) is **a reading of
the law, not a fetched fact**. Previously it was hand-written and *restated* in
several places (popup builders, the inspector cite table, the Sources cards), so
the same claim could drift — and a wrong statute citation (`asc/2024/2`, an
air-quality Act, instead of `asc/2024/4`, the Senedd Members & Elections Act)
hid in that scatter. Consolidating into one register means: **one claim, one
place, one review.**

## Shape

```jsonc
{
  "instruments": {                 // legislation grounded as DATA
    "ukpga/1986/56": { "title": "...", "kind": "ukpga", "primary": true },
    "uksi/2023/1230": { "title": "...", "kind": "uksi", "primary": false,
                        "madeUnder": ["ukpga/1986/56"], "madeUnder_source": "authored" }
  },
  "geographies": {                 // one entry per geography type (× nation where it differs)
    "constituencies": {
      "label": "...", "level": "...", "lawType": "secondary", "devolved": "reserved",
      "namedInstrument": "uksi/2023/1230",   // a single SI made the whole layer (≈ sourceable)
      "instrumentClass": "...",              // OR a per-feature order class (not a single SI)
      "madeUnder": ["ukpga/1986/56"],        // the enabling primary Act(s)
      "claim": "the prose shown to users",
      "epistemic": "interpreted",
      "review": { "status": "unreviewed" }
    }
  }
}
```

- **`instruments`** keys are stable `legislation.gov.uk` IDs (`<kind>/<year>/<number>`).
  `madeUnder` is the **SI/Order → enabling Act** relationship expressed as data.
- **`epistemic`**: `interpreted` (our reading) vs `sourced` (official dataset).
  Everything here is `interpreted`; the geography it annotates is `sourced`.
- **`review`**: per-entry `status` (`unreviewed` / `reviewed-by-...`) — the
  human-review checklist. `_meta.review` tracks the register as a whole.

## The dataset-driven path (how the `authored` links become sourced)

Every `madeUnder` is `source: "authored"` today. `legislation.gov.uk` publishes
each instrument's **enabling power** in its metadata, and the repo's
[`tna-legislation`](../../../skills/tna-legislation/SKILL.md) skill can fetch the
RDF/XML per URI. So a future job can:

1. for each `instruments` entry, fetch its enabling-power metadata;
2. compare/populate `madeUnder` and flip `madeUnder_source` to
   `"legislation.gov.uk"` (flagging mismatches for review).

This turns the SI→Act grounding from authored to sourced **without touching the
geography pipeline**. The per-*feature* link (which specific Order made *this*
polygon) is not in the boundary data and remains a type-level claim.

## Maintaining

- The UI reads from this file — change a claim **here**, not in `index.html`.
- Adding a layer = add its geography entry (+ any new instruments). Keep
  referential integrity (every `madeUnder` / `namedInstrument` ID must exist in
  `instruments`). A quick check:
  `node -e 'const r=require("./data/legal-basis.json");const ids=new Set(Object.keys(r.instruments));for(const[k,g]of Object.entries(r.geographies))for(const m of(g.madeUnder||[]).concat(g.namedInstrument||[]))if(!ids.has(m))console.log("missing",k,m)'`
- The whole thing is ~35 entries — small enough for one expert pass. The map's
  "unreviewed demo" badge stands until `_meta.review.status` says otherwise.
