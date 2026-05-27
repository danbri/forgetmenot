# Bundled SPARQL endpoint

`fpkg` ships an in-process Oxigraph SPARQL store as a second daemon
inside the same fly.io app. The Node server proxies `/sparql` to it,
which means the page (or any third-party caller) can query the bundled
graphs from the browser through the same origin, with CORS, no extra
infra.

## What's loaded

Every `.nq.gz` under `third_party/` that we ship gets loaded on
container startup:

| Source | Quads (approx) | Subject area |
|---|---:|---|
| `scrutiny.nq.gz` | 120 k | Act → SI → laying department → Lords division → peers → interests |
| `transparency.nq.gz` | 46 k | Lords RMFI × APPG officers / secretariats / funders |
| `accountability.nq.gz` | 70 k | Lords questions → answer → arm's-length body |
| `identity.nq.gz` | 58 k | Cross-source identity for ~1,400 MPs and peers |
| `psephology/all.nq.gz` | 420 k | Commons election results since 2010 |
| `parliament-lda-terms/parliament-lda-terms.nq.gz` | ~6 k (partial, see below) | Parliament Thesaurus — SKOS concept scheme used to subject-tag debates, papers, written questions, briefing papers. Pulled from the legacy LDA at `lda.data.parliament.uk/terms`; not in the modern DDP SPARQL surface. |

Total in-memory store: ~700 k quads, well under the 512 MB RAM
allocation in `fly.toml`.

**Note on the Thesaurus dump.** The first crawl on 2026-05-27 hit a
sustained LDA outage past page 20 (every page from 20 onward timed
out for ~10 minutes; verified with direct curl). The script's
skip-on-exhaustion logic landed 19 pages = 6,361 quads / 1,724
distinct terms before its 10-failure backstop fired. Subsequent
weekly rebuilds will pick up the rest as the LDA recovers — the
partial bundle is committed for now so the endpoint has at least the
top of the hierarchy.

## URL

- Public: `https://fpkg.fly.dev/sparql?query=<urlencoded SPARQL>`
- Local dev: `http://localhost:8787/sparql?query=...` (run `node server.mjs`)

Method: **GET only** (POST not implemented in the proxy). For queries
longer than ~8 kB, switch to POST against `https://fpkg.fly.dev/api/sparql`
which goes directly to `api.parliament.uk/sparql` (no bundled data, but
no length limit).

Content negotiation via `Accept`:

| `Accept` | Format |
|---|---|
| `application/sparql-results+json` | JSON (recommended) |
| `application/sparql-results+xml` | SRX |
| `text/csv` | CSV |
| `text/tab-separated-values` | TSV |
| `text/turtle` | for `CONSTRUCT` / `DESCRIBE` |

CORS: `Access-Control-Allow-Origin: *` (configurable via the existing
`ALLOW_ORIGIN` env var).

## Example queries

```sparql
# Lords currently on a scrutiny committee + their declared sectoral tags
PREFIX scr:  <https://forgetmenot.example/scrutiny#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?name (GROUP_CONCAT(DISTINCT ?cname; separator=" / ") AS ?committees)
       (GROUP_CONCAT(DISTINCT ?sector; separator=", ") AS ?sectors)
WHERE {
  GRAPH <https://forgetmenot.example/scrutiny#graph/committees>
    { ?m scr:memberOfCommittee ?c . ?c scr:name ?cname . }
  GRAPH <https://forgetmenot.example/scrutiny#graph/members>
    { ?m foaf:name ?name . }
  OPTIONAL {
    GRAPH <https://forgetmenot.example/scrutiny#graph/lords-rmfi>
      { ?m scr:sectorTag ?sector . }
  }
} GROUP BY ?name ORDER BY ?name
```

```sparql
# APPGs where the secretariat is also named in a peer's RMFI
PREFIX trn: <https://forgetmenot.example/transparency#>
SELECT ?appgTitle ?peerName ?entityName WHERE {
  GRAPH <https://forgetmenot.example/transparency#graph/overlaps>
    { ?m trn:isOfficerOfOverlappedAPPG ?appg .
      ?e trn:connectsAPPG ?appg ; trn:connectsMember ?m ;
         trn:appgRelationType "secretariatOf" . }
  GRAPH <https://forgetmenot.example/transparency#graph/appg-register>
    { ?appg trn:title ?appgTitle . }
  GRAPH <https://forgetmenot.example/transparency#graph/entities-resolved>
    { ?e trn:canonicalName ?entityName . }
  GRAPH <https://forgetmenot.example/transparency#graph/members>
    { ?m <http://xmlns.com/foaf/0.1/name> ?peerName . }
}
```

## How it works inside the container

- `demos/parliament-live/Dockerfile` downloads a static Oxigraph binary
  (Rust, ~30 MB, statically linked musl) into `/usr/local/bin/oxigraph`.
- It also COPYs every `.nq.gz` into `/app/data/`.
- `entrypoint.sh` runs as PID 1's child:
  1. Gunzips every `/app/data/*.nq.gz` into a tmpfs directory.
  2. Starts `oxigraph serve --bind 127.0.0.1:7878 --read-only --cors`
     against that directory's `.nq` files.
  3. Waits up to 60 s for Oxigraph's `/query` endpoint to respond.
  4. Execs `node /app/server.mjs` in the foreground.
- The Node `server.mjs` has a new route `/sparql` whose `local`
  property routes the proxy to `http://127.0.0.1:7878/query`. Same
  cache + CORS treatment as every other proxied endpoint.

## Deploy

The demo previously deployed from `demos/parliament-live/`. The SPARQL
bundle needs the `third_party/` N-Quads, so deploy now happens from
the **repo root** with the config flag:

```sh
flyctl deploy --config demos/parliament-live/fly.toml
```

### From your phone — manual workflow trigger

Both relevant workflows have `workflow_dispatch` triggers and use the
`FLY_API_TOKEN` repo secret. Open in **Safari** (request Desktop Site
for the "Run workflow ▾" button — the iOS GitHub app shows only past
runs, no dispatch control):

- **Deploy only** (~3 min, ships whatever's on `claude/main`):
  <https://github.com/danbri/forgetmenot/actions/workflows/deploy-fpkg.yml>
- **Full data rebuild + deploy** (~20 min, also runs Mondays via cron):
  <https://github.com/danbri/forgetmenot/actions/workflows/rebuild-graphs.yml>

The deploy workflow also fires automatically on any push to
`claude/main` that touches `demos/parliament-live/**`,
`third_party/**/*.nq.gz`, or `lib/facilities/appg.mjs`.

## Refresh cadence

The N-Quads are baked into the image. To refresh, either:

1. Wait for the weekly `rebuild-graphs.yml` cron to run, which commits
   regenerated `.nq.gz` files; then redeploy.
2. Run the relevant `tmp/*-graph/build.py` locally, gzip the output,
   commit, and redeploy.

Container restarts always reload the bundled `.nq.gz` files into a
fresh in-memory store — no persistence layer to manage.

## Memory cost

`oxigraph serve` without `--location` uses an in-memory store with
RocksDB-style indexes. 700 k quads occupies roughly 180–220 MB at
steady state. Combined with the Node server's ~50 MB and the OS
overhead, the 512 MB VM allocation in `fly.toml` has ~150 MB headroom.

If we add more N-Quads and start to bump against the limit, switch
Oxigraph to a persistent on-disk store backed by a fly volume:

```sh
flyctl volumes create fpkg_data --region lhr --size 1
```

and pass `--location /data` to `oxigraph serve` in `entrypoint.sh`.
On-disk stores are ~5× larger than the raw N-Quads but use much less
RAM (a few hundred MB regardless of data size).
