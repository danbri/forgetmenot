# Commons written questions — volume & concentration analysis

Investigates whether there are effective constraints on the number/frequency of
written parliamentary questions (PQs) MPs may table. Data retrieved 2026-05-29
from the Questions & Answers API (`questions-statements-api.parliament.uk`),
House = Commons, counted by **date tabled**.

## Method
- **Yearly totals**: a single search per year reading `totalResults` (cheap).
- **Per-MP distribution**: full enumeration of every question, tallied by
  `askingMemberId` (the API has no server-side aggregation by member).
  `wqfast.mjs` pages with `take=100` and 40-way concurrency (the API is
  latency-bound ~8s/request but not rate-limited).
- Member names resolved via the Members API; rule text via Erskine May
  (Ch. 22, *Questions for written answer*).

## Reproduce
```sh
node wqfast.mjs 2025-01-01 2025-12-31 wq2025.json
node wqfast.mjs 2023-01-01 2023-12-31 wq2023.json
python3 charts.py   # needs matplotlib; reads /tmp/lg/names.json for labels
```

## Key findings
| Year | Qs tabled (Commons) |
|---|---|
| 2021 | 50,755 |
| 2022 | 53,777 |
| 2023 | 48,734 |
| 2024 | 41,844 (GE dissolution May–Jul) |
| 2025 | **80,725** |
| 2026 (to 29 May) | 33,963 |

- **No rule cap** on *ordinary* written questions (Erskine May: "There is no
  limit to the number of questions for ordinary written answer which a Member
  may ask on the same day").
- **2025**: 552 MPs tabled; median 66; **top asker Ben Obese-Jecty (Con,
  Huntingdon) = 3,009** (~12/sitting day, ~45× median).
- **Concentration** (2025): top 10 MPs = 21.7% of all PQs, top 20 = 33.7%,
  top 50 = 51.1%. Lorenz shape nearly identical in 2023; what changed in 2025
  is absolute volume (median 37→66) and the individual ceiling (2,119→3,009).
- Heavy askers are overwhelmingly **opposition** MPs (PQs as scrutiny tool).

## Files
- `01_yearly_volume.png`, `02_top20_2025.png`, `03_concentration_lorenz.png`
- `wq2025.json`, `wq2023.json` — per-member tallies (`entries: [{id, n}]`).
- `wqfast.mjs`, `charts.py` — generators.

Provenance: UK Parliament Questions & Answers API and Members API
(Open Parliament Licence v3.0); Erskine May.
