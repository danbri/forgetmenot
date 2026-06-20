# DDP change time-series — design

Goal: an **append-only time-series of DDP's *shape*** — counts by `rdf:type`
and by predicate — so we can detect, quantify and locate changes over time
(what grew, when, in which domain) **without burdening the rate-limit-prone
endpoint**. Design only; not yet built.

## Governing constraint
`api.parliament.uk/sparql` throttles aggressively and times out on unbounded
full-store scans (observed repeatedly 2026-06-17/18). So: **one cheap
aggregation query per snapshot, infrequently, at unusual times, fail-soft.**

## What each snapshot captures — **both**, predicate-first
| metric | query | cost | role |
|---|---|---|---|
| **predicate counts** | `SELECT ?p (COUNT(*) AS ?n) WHERE { ?s ?p ?o } GROUP BY ?p` | heavy (full scan) | **primary signal** |
| **class counts** | `SELECT ?t (COUNT(*) AS ?n) WHERE { ?s a ?t } GROUP BY ?t` | light (type-indexed) | reliable backbone |
| **total triples** | `SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }` | heaviest | sanity check (= Σ predicate counts) |
| meta | — | — | every run: ISO ts, query wall-ms, HTTP status, ok flag |

**Why predicate counts are the better signal:** every triple has exactly one
predicate, so `GROUP BY ?p` **partitions 100% of the store** (Σ = total) and
**catches property-level edits** — a corrected date, an added label or relation
on an *existing* entity — that leave every class count unchanged. Class counts
only move when whole entities appear/vanish. So predicate counts are the
complete, sensitive detector; class counts are the cheap, always-gettable
backbone. **Capture both.**

**The catch, and its resolution:** `GROUP BY ?p` is a full scan — exactly the
query the rate-limited giants refuse (observed: skosdex 500, DDP throttle). But
that heaviness is **only a live-public-endpoint problem**. On a **local mirror**
(fpkg-style Oxigraph) the predicate scan is trivial — measured at **2.4s on
fpkg's 3.5M**. So:
- **Against live DDP:** class counts every run (reliable); predicate counts
  *attempted* every run but **tolerate gaps** when throttled.
- **Against a local DDP mirror (preferred):** **both, every run**, cheaply —
  another concrete reason to mirror rather than poll the live endpoint.

## Gentleness measures
- **~3 light + ~1 heavy request/day**, total. Negligible.
- **Generous timeout (90s)** + **bounded exponential backoff** (≤3 tries) per query.
- **Abort-guard:** on failure write **nothing** — leave a *gap*, never a partial
  or fabricated row (same discipline as the thesaurus crawler's min-coverage guard).
- **Honest User-Agent:** `forgetmenot/ddp-stats (+github.com/danbri/forgetmenot)`.
- Tier the heavy queries (predicate/total) to weekly so a daily timeout never
  blocks the useful class series.

## Timing — offset from obvious cron clashes
Avoid the slots everything else uses (`:00`, `:15`, `:30`, `:45`, midnight,
noon, top-of-hour) — that's where cron jobs *and* GitHub-Actions schedules
backlog and get delayed/dropped. Use **odd minute past odd hours**:

- **Class snapshots:** `37 1,9,17 * * *` → **01:37, 09:37, 17:37 UTC** (≈8h
  apart; brackets the daily rhythm).
- **Weekly deep snapshot:** `23 3 * * 0` → **Sun 03:23 UTC**.

Rationale: (1) odd offsets are polite to Parliament's own jobs and are *more
reliably dispatched* by GitHub (which skews worst at popular times); (2) three
spread samples will, within a week or two, **reveal Parliament's actual daily
update window** from where the deltas land — then we can re-centre the schedule
to bracket it (a pre- and post-update sample isolates exactly what the daily
load changes). Until we know it, don't assume an overnight window.

## Storage — git *is* the archive
```
third_party/data/ddp-stats/
  class-counts.jsonl       # append: {"ts","ok","ms","classes":{<type>:<n>}}
  predicate-counts.jsonl   # weekly
  latest.json              # convenience: most-recent good snapshot
```
JSONL append, ~5–10 KB/snapshot; committed by the job. **Git history = the
immutable time-series; the JSONL = easy analysis.** Snapshot commits touch no
deploy path, so they never trigger an fpkg redeploy.

## Change detection
On each run, diff the new snapshot against the **previous good** one → per-type
delta, and emit a one-line run summary (`ActOfParliament +3 · WorkPackage +8 ·
Person +1`). Flag **large or negative** jumps (a negative count usually means a
reload/outage, not a deletion — worth a `::warning::`). Optionally append
notable deltas to a generated `CHANGELOG.md`.

## Where it runs
A scheduled GitHub Actions workflow (`.github/workflows/ddp-stats.yml`),
modelled on `thesaurus-crawl.yml`: checkout → query (Node/Python) → append JSONL
→ commit + push (`permissions: contents: write`, `concurrency` guard). No
secrets needed (the endpoint is public).

## Honesty / robustness
- **Gaps, not guesses:** a missed run leaves a hole in the series, which is the
  truthful record. Record endpoint latency so we can *see* degradation.
- `COUNT(*)` and predicate `GROUP BY` **will** sometimes time out — expected;
  that's why they're weekly + best-effort, decoupled from the class series.

## Natural extension
The same harness can also log each **REST API's `totalResults`** per domain
(members/bills/SI/treaties/petitions — all cheap) on the same schedule, giving a
**DDP-vs-REST drift** time-series — the empirical answer to "how stale is DDP,
and which domains lag" rather than the one-off snapshot we have now.
