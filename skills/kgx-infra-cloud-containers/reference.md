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

