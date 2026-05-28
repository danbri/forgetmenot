# Infra gotchas — full catalogue

Each entry: error message verbatim, fix in two lines, commit hash. New
entries go at the top of their section so the most recent surprises
are easiest to find.

---

## fly.io

### `dockerfile` path resolution is config-relative, not cwd-relative

**Seen 2026-05-27.**

```
Error: failed to fetch an image or build from source: dockerfile
'/home/runner/work/forgetmenot/forgetmenot/demos/parliament-live/
 demos/parliament-live/Dockerfile' not found
                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ doubled
```

flyctl resolves both `[build].dockerfile` (in fly.toml) and
`--dockerfile` (on the CLI) **relative to the directory containing
fly.toml**. Not relative to cwd, not relative to the build context.
When fly.toml itself lives in `demos/parliament-live/` and you write:

```toml
[build]
  dockerfile = 'demos/parliament-live/Dockerfile'
```

flyctl prepends fly.toml's dir, getting `demos/parliament-live/demos/parliament-live/Dockerfile` —
which doesn't exist.

**Fix** (commit `c44ea369`):

```toml
[build]
  dockerfile = 'Dockerfile'        # relative to fly.toml's dir
```

If you also need the build *context* to be somewhere else (e.g. the
repo root, so `COPY ../third_party/...` works), pass that as the
positional argument:

```sh
flyctl deploy . --config demos/parliament-live/fly.toml
              ^ build context = cwd; the dockerfile path above is
                still resolved relative to fly.toml's directory
```

### Build context is fly.toml's directory by default

**Seen 2026-05-27.** Without an explicit positional argument, `flyctl
deploy --config demos/x/fly.toml` uses `demos/x/` as the Docker build
context. Any `COPY` directive that needs files above that directory
(in our case, `third_party/data/*.nq.gz`) fails with:

```
Error: failed to fetch an image or build from source: …
```

**Fix** (commit `ad8c2b8f`): pass `.` (or whatever your real context
is) as the positional `WORKING_DIRECTORY` argument:

```sh
flyctl deploy . --config demos/x/fly.toml --remote-only
```

### `shared-cpu-1x` with 256 MB is too small for an in-memory RDF store

**Seen 2026-05-27** (preemptive — observed Oxigraph mem profile
locally, ~200-250 MB at 700k quads). The default fly machine swaps
and slows to a crawl when an in-memory store is loaded. Bump
`memory = '512mb'` in fly.toml's `[[vm]]` block, or back the store
with a persistent fly volume (`flyctl volumes create … --size 1`)
and pass `--location /data` to `oxigraph serve` so it uses on-disk
RocksDB indexes that need a few hundred MB regardless of dataset
size.

### Auto-stop cold starts add 10-20 s per first hit

`auto_stop_machines = 'stop'` + `min_machines_running = 0` is fly's
free-tier sweet spot but pays for it at first-hit latency. For a
container that has to gunzip + reload N-Quads into Oxigraph, that's
10-20 s. Either:

- Set `min_machines_running = 1` (a few £/mo) to keep one warm
- Persist Oxigraph's RocksDB store on a fly volume so the data is
  pre-indexed
- Move the SPARQL surface to a separate fly app with its own scale
  policy (uses a deploy token; needs `flyctl apps create`)

---

## GitHub Actions

### `superfly/flyctl-actions/setup-flyctl@v1.5` doesn't exist

**Seen 2026-05-27.**

```
Error: Unable to resolve action `superfly/flyctl-actions/setup-flyctl@v1.5`,
unable to find version `v1.5`
```

Their published tags are `@master` (current) and fully-qualified
semver like `@v1.5.0`. Truncated `@v1.5` resolves to nothing.

**Fix** (commit `8dd749c7`): use `@master` per their docs, or pin to
a full semver triplet `@v1.5.0`.

```yaml
- uses: superfly/flyctl-actions/setup-flyctl@master
```

### `workflow_dispatch` button hides until the workflow file lives on the default branch

**Seen 2026-05-27** in the context of an unusual default-branch name.
The repo's default branch is `claude/main` (not `main`). I pushed all
my workflow files to `main` and to a feature branch. The Actions UI
showed those workflows' past runs perfectly happily — but the
"Run workflow ▾" button never appeared, because GitHub only sources
its `workflow_dispatch` UI from the *default* branch's copy of the
workflow file.

**Fix** (commit `8fb0d96c`): merge / push the workflow files onto
the default branch (`claude/main`) explicitly. Confirm with the
"Branch:" dropdown that appears in the dispatch form.

### `on.push.paths` is filtered per branch

**Seen 2026-05-27.** A workflow with:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'demos/parliament-live/**'
```

does **not** trigger on pushes to `claude/main` (or any branch other
than `main`) even if the path filter matches. The branch filter is
ANDed, not ORed.

**Fix** (commit `(this-skill)`): list every branch you want to fire
from:

```yaml
branches: [claude/main, main]
```

### `actions/checkout@v4` won't push back to the repo unless given a token + permission

For workflows that need to commit refreshed data back to the repo
(like the weekly `rebuild-graphs.yml`):

```yaml
- uses: actions/checkout@v4
  with:
    token: ${{ secrets.GITHUB_TOKEN }}     # explicit
    fetch-depth: 1

permissions:
  contents: write     # at the workflow level
```

Without either the explicit `token:` or the workflow-level
`permissions.contents: write`, the `git push` step at the end of the
job errors with `Permission denied to github-actions[bot]`. See
`rebuild-graphs.yml`.

---

## GitHub mobile UX

### iOS GitHub app shows only past runs, never the dispatch UI

There is no "Run workflow" button anywhere in the iOS app's Actions
view. You see the list of past runs and that's it.

**Workarounds, in order of effort:**

1. **Safari + Request Desktop Site**: tap the URL bar at the
   bottom, then the `aA` button on the left of the URL → Request
   Desktop Website. The desktop layout exposes the "Run workflow ▾"
   button at the top-right of the workflow's runs list.
2. **Push a trivial change that matches the workflow's `paths`
   filter.** Usually fastest if the filter is broad. We watch
   `demos/parliament-live/**`, `third_party/**/*.nq.gz`,
   `lib/facilities/appg.mjs`, and the workflow file itself —
   touching any of those fires the deploy.
3. **Use the GitHub API directly with a PAT**:
   ```sh
   curl -X POST \
     -H "Authorization: Bearer $GITHUB_PAT" \
     -H "Accept: application/vnd.github+json" \
     https://api.github.com/repos/danbri/forgetmenot/actions/workflows/deploy-fpkg.yml/dispatches \
     -d '{"ref":"claude/main"}'
   ```

---

## Docker / multi-stage

### Bundling Oxigraph into a Node image

The Rust-binary approach beats a Python `rdflib-endpoint` wrapper on
startup latency and RAM. Multi-stage pattern:

```dockerfile
FROM alpine:3.20 AS oxigraph-stage
RUN apk add --no-cache curl ca-certificates tar
ARG OXIGRAPH_VERSION=0.4.5
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  asset=oxigraph_${OXIGRAPH_VERSION}_x86_64-unknown-linux-musl ;; \
      aarch64) asset=oxigraph_${OXIGRAPH_VERSION}_aarch64-unknown-linux-musl ;; \
    esac; \
    curl -sSL -o /tmp/o.tar.gz \
      "https://github.com/oxigraph/oxigraph/releases/download/v${OXIGRAPH_VERSION}/${asset}.tar.gz"; \
    mkdir -p /opt/oxigraph; \
    tar -xzf /tmp/o.tar.gz -C /opt/oxigraph --strip-components=1

FROM node:22-alpine AS runtime
COPY --from=oxigraph-stage /opt/oxigraph/oxigraph /usr/local/bin/oxigraph
RUN apk add --no-cache tini gzip
# ... your app
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/your-entrypoint.sh"]
```

`tini` is mandatory when one entrypoint script supervises another
process (e.g. oxigraph in background, node in foreground). Without
it, SIGTERM from fly's lifecycle doesn't propagate and shutdown
takes forever.

### `--read-only --cors --bind 127.0.0.1:7878` for the bundled SPARQL endpoint

```sh
oxigraph serve \
  --bind 127.0.0.1:7878 \
  --read-only \
  --cors \
  /path/to/data/*.nq
```

Bind to `127.0.0.1` only — the public surface is the Node server's
proxy, not Oxigraph directly. The proxy:
- Adds OPL attribution headers
- Applies the same CORS policy as the rest of the proxied APIs
- Caches at the project's TTL policy
- Optionally adds auth via the existing `PROXY_PASSWORD`

---

## Cloudflare / upstream blocks

### `publications.parliament.uk` requires a browser-style UA

```
HTTP/2 403  cf-mitigated: challenge
```

The Cloudflare interstitial fires on bare curl, our forgetmenot UA,
and anything that looks vaguely automated. A Chrome-style UA
sometimes passes:

```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...
```

See `lib/facilities/appg.mjs` for the canonical UA we use. **In CI
runners (GHA, fly builders, this Claude Code sandbox) even the UA
spoof often gets blocked** because the IP ranges are flagged. The
workaround is to cache the result locally and ship it as a
committed `.nq.gz`.

### Wayback Machine is blocked from some sandboxes

```
HTTP/2 403  x-block-reason: hostname_blocked
```

No general workaround. If you need a historical snapshot, fetch it
from a non-blocked environment and check in the file.

---

## Local repo conventions

### N-Quads in-tree are gzipped

`.nq.gz` is the committed form; `.nq` is a transient working file
(see `third_party/data/.gitignore`). Scripts read via `gzip.open()`:

```python
import gzip, io
from rdflib import Dataset
ds = Dataset()
with gzip.open(path, "rt", encoding="utf-8") as f:
    ds.parse(f, format="nquads")
```

### Builder scripts emit one named graph per source

`tmp/*-graph/build.py` writes N-Quads where the named graph component
identifies the source (e.g.
`<https://forgetmenot.example/scrutiny#graph/lords-votes>`). This is
deliberate so the bundled SPARQL store can query a single source or
join across sources with explicit `GRAPH { ... }` patterns.

### Claude Code on Web sandbox blocks `git push --delete`

```
error: RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
send-pack: unexpected disconnect while reading sideband packet
fatal: the remote end hung up unexpectedly
```

The sandbox's local git proxy (e.g. `http://127.0.0.1:<port>/git/<owner>/<repo>`)
silently swallows delete pushes — they exit 0 with "Everything up-to-date"
but the branch survives. Verbose mode (`git push -v origin --delete`)
reveals the 403.

**Fix**: there is no fix from inside the sandbox. Delete from the
GitHub web UI at `https://github.com/<owner>/<repo>/branches`. The
GitHub MCP tools available to the sandbox include `create_branch` but
not `delete_branch`, and `flyctl-actions` / `gh` CLI aren't installed
on the Web image.

### Oxigraph release artefact naming + glibc-only

**Seen 2026-05-27.**

```
gzip: invalid magic
tar: Child returned status 1
Error: failed to fetch an image or build from source
```

I guessed the asset filename as
`oxigraph_X.Y.Z_x86_64-unknown-linux-musl.tar.gz` (Cargo-style). Wrong
on two counts for current Oxigraph (0.5.x):

1. **No tarball** — release artefacts are bare ELF binaries (chmod +x
   and run). Asset naming is
   `oxigraph_<TAG>_<ARCH>` with no extension.
2. **No musl static build** — only `_linux_gnu` (glibc) is published,
   so the binary needs a glibc base image (e.g. `debian:bookworm-slim`,
   `node:22-slim`). Alpine won't run it.

The 404 from the bad URL was silently saved as `oxigraph.tar.gz`,
which `tar -xz` then rejected with "gzip: invalid magic".

**Fix** (commit pending): rewrite the Dockerfile stage to:

```dockerfile
FROM debian:bookworm-slim AS oxigraph-stage
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates
ARG OXIGRAPH_VERSION=v0.5.8       # NB literal 'v' in the tag
RUN curl -fsSL -o /usr/local/bin/oxigraph \
        "https://github.com/oxigraph/oxigraph/releases/download/${OXIGRAPH_VERSION}/oxigraph_${OXIGRAPH_VERSION}_x86_64_linux_gnu" && \
    chmod +x /usr/local/bin/oxigraph && \
    /usr/local/bin/oxigraph --version

FROM node:22-slim AS runtime
COPY --from=oxigraph-stage /usr/local/bin/oxigraph /usr/local/bin/oxigraph
```

**Discovery method**: GitHub's `expanded_assets` endpoint is the
quickest way to enumerate real release artifacts without hitting the
JSON-API rate limit:

```sh
curl -s "https://github.com/<owner>/<repo>/releases/expanded_assets/<TAG>" \
  | grep -oE 'href="[^"]*"' | head -30
```


### Oxigraph 0.5.x CLI is split into `serve` and `serve-read-only`

**Seen 2026-05-27.** Live endpoint hung with `ERR_CONNECTION_TIMED_OUT`
even though the fly deploy reported healthy and the GHA smoke test
passed (warning: smoke test masked the failure — see CI gotcha).

Inside the container Oxigraph was crashing on startup because the
0.4-era CLI I wrote in `entrypoint.sh` is no longer valid:

```sh
# WRONG (0.4 syntax)
oxigraph serve --bind ... --read-only --cors "$LOAD_DIR"/*.nq
```

Three breakages in 0.5.x:

1. `--read-only` is no longer a flag; it's the separate subcommand
   `serve-read-only`.
2. Neither `serve` nor `serve-read-only` accepts positional N-Quads
   files — you must `oxigraph load --location DIR --file F …` first
   to populate a RocksDB store, then point the server at that DIR.
3. `serve-read-only` *requires* `--location` (no in-memory mode for
   read-only). `serve` does support in-memory if you omit `--location`,
   but there's no way to bulk-load data into an in-memory `serve`
   so it's useless for our case.

**Fix** (commit pending): two-step boot in `entrypoint.sh`:

```sh
oxigraph load --location "$DB_DIR" --file file1.nq --file file2.nq …
oxigraph serve-read-only \
    --location "$DB_DIR" \
    --bind 127.0.0.1:7878 \
    --cors \
    --union-default-graph
```

**Subtle extra**: `--union-default-graph` matters when all your data
sits in NAMED graphs (ours does). Without it, a `SELECT ?s ?p ?o WHERE
{ ?s ?p ?o }` query returns zero — it's only searching the unnamed
default graph, which is empty. The flag tells Oxigraph to treat every
named graph as part of the default graph for query evaluation. Could
alternatively force callers to write `GRAPH ?g { ?s ?p ?o }`, but the
union default is friendlier for a public endpoint.


### Oxigraph 0.5.8 `load` is too strict on `#` in IRIs

**Seen 2026-05-28.** identity-graph data was missing from fpkg.fly.dev
for weeks despite the file being on disk, in the Dockerfile, and in
the deploy path-trigger. Probed the live store, saw:

```sh
$ curl '…/kgx/query?query=SELECT (COUNT(*) AS ?n) WHERE { GRAPH <https://forgetmenot.local/graph/identity/members-api> { ?s ?p ?o } }'
{"results":{"bindings":[{"n":{"value":"0"}}]}}
```

Reproduced the build's load step locally with `oxigraph_v0.5.8`:

```
Error while loading file identity.nq:
Parser error at line 15508 between columns 81 and 368:
Invalid IRI code point '#'
Some files like Wikidata dumps contain invalid IRIs or language tags.
If you want to load them anyway use the `--lenient` option.
```

The reported line is **misleading** — line 15508 is a perfectly ordinary
`<…/Members/3805> <http://schema.org/familyName> "Boyd" <…/identity/ddp-sparql> .`
quad with no `#` in it. The parser actually trips on standard W3C
namespace IRIs (`<http://www.w3.org/2002/07/owl#sameAs>`,
`<http://www.w3.org/2001/XMLSchema#integer>`, etc.) — `#` IS a valid IRI
code point per RFC 3987 (it's the fragment delimiter), so 0.5.8's
parser is overstrict.

**Fix**: add `--lenient` to the load command.

```sh
oxigraph load --lenient --location /data-db --file foo.nq --file …
```

Verified: with `--lenient`, identity.nq loads cleanly — all 7 named
graphs, 58,157 quads. Of the eight files we currently bundle into the
fpkg image (`scrutiny`, `transparency`, `accountability`, `identity`,
`psephology`, `parliament-lda-terms`, `fcdo-treaties`,
`govuk-orgchart`), `identity` is the only one rejected by strict mode.

(Landed in: commit pending.)


### Oxigraph 0.5.8 `load` exits 0 even when it rejects a file

**Seen 2026-05-28** — the *reason* the bug above could hide for weeks.
The "Error while loading file identity.nq" message goes to **stderr
only**; the process exit code stays **0**. So:

```Dockerfile
RUN set -eux; \
    …; \
    oxigraph load --location /data-db $files; \   # silently drops identity.nq
    …                                              # build continues, success
```

`set -e` doesn't catch it. The build succeeds. fly accepts the image.
The smoke test (which checks `COUNT(*) > 0` against the whole store)
passes. Only when something queries the missing named graph by name
does the gap surface — and only if you remember to.

**Fix**: don't trust Oxigraph's exit code. Pipe stderr+stdout to a log
and grep:

```Dockerfile
oxigraph load --lenient --location /data-db $files 2>&1 \
    | tee /tmp/oxi-load.log; \
if grep -q "^Error while loading" /tmp/oxi-load.log; then \
    echo "::error::oxigraph load reported a file-level error" >&2; \
    exit 1; \
fi
```

This is a defence-in-depth measure — even after `--lenient` is in
place, the next file that hits a different strict-mode rule (or a
genuine encoding bug) won't ship silently.

Upstream: should be filed against oxigraph (load command should set
a non-zero exit code when any file errors). Until then, the grep is
load-bearing.

(Landed in: commit pending.)


---

## RDF storage — vocabulary (don't conflate these)

When the conversation turns to "where could we cache the on-disk
RocksDB?", several names come up. They're distinct things and have
been merged together in my head before — recording the distinction
once, here, so future-me stops doing it.

### Cottas

An on-disk **binary format** for RDF quads, structured as a pattern
over Parquet. Columnar layout, designed to be cheap to ship as a file
and cheap to range-scan. Comparable in role to **HDT** (header /
dictionary / triples), not to a triple store. It's a serialization,
not a query engine. Nothing in this repo currently reads or writes
Cottas; it's the user's work, lives elsewhere.

### Factoidal

An **experimental SPARQL / RDFS / OWL system written in F***. The
engine — query evaluator, reasoner, the bit that answers queries.
Has a few experimental on-disk storage components of its own. Also
the user's work, not used in this repo.

### How they relate to each other and to what we *do* use

| Layer | Cottas | Factoidal | Ours today |
|---|---|---|---|
| Storage format | columnar quads over Parquet | several experimental | Oxigraph's RocksDB indexes |
| Query engine | — (format only) | SPARQL/RDFS/OWL in F* | Oxigraph (Rust) |
| Used in this repo | no | no | yes |

The reason both names recurred in the May 2026 thread is that the
user was thinking about ways to **avoid the 3-5 s gunzip + RocksDB
load on every cold start** — Cottas as a faster on-disk format,
Factoidal as a swap-out engine. Neither is wired in; we still load
`.nq.gz` into Oxigraph's RocksDB at boot.

The shorter realistic options for that same problem stay on the
table:

1. Bake the populated RocksDB directory into the Docker image at
   build time (no gunzip + load at boot — adds image size but
   removes cold-start cost). Likely the cheapest win.
2. Persist it on a fly volume (already noted under fly.io →
   auto-stop cold starts).
3. Keep `min_machines_running = 1` to avoid cold starts entirely.

If we ever do experiment with Cottas or Factoidal in this repo,
record the integration in this file with the commit hash, and
update the table above so this distinction stays current.

