---
name: kgx-infra-cloud-containers
description: Notes, gotchas and utility recipes for the cloud-platform / container infrastructure this repo uses — fly.io (the fpkg demo app), Docker multi-stage builds bundling RDF / Oxigraph stores, GitHub Actions workflow patterns (dispatch + path triggers + flyctl), and the tiny mobile-only operational reality the repo runs in. Use when you're touching a Dockerfile, a fly.toml, a GHA workflow, or hitting an "it should be easy but…" cloud-tooling surprise.
license: Open Parliament Licence v3.0 + MIT (the repo's mix); this skill itself is documentation, no licence terms beyond the repo's.
metadata:
  provenance:
    tier: 1
    operator: "kgx (internal — this repo)"
    citation-short: "via kgx-infra-cloud-containers SKILL"
    confidence: empirical
    confidence-notes: "Every gotcha listed is anchored to a commit hash or a captured error message. Update with the commit when you add a new one."
---

# Cloud, containers, CI — notes and gotchas

Catalogue of the infrastructure-side surprises we've actually hit, with
the fix that worked and the commit it landed in. Reach for this file
**before** debugging a Dockerfile / fly.toml / GHA workflow surprise
from scratch — chances are the same surprise is recorded here with the
two-line fix.

The detail lives in [`reference.md`](reference.md); SKILL.md is the
index.

## What's in the catalogue

### fly.io

- **Path resolution for `dockerfile`** — fly.toml's `[build].dockerfile`
  and the `--dockerfile` CLI flag are both resolved **relative to
  fly.toml's directory**, not the cwd. Putting `dockerfile = 'demos/x/Dockerfile'`
  in a fly.toml that lives in `demos/x/` yields `demos/x/demos/x/Dockerfile`.
  Fix: write `dockerfile = 'Dockerfile'` and use the positional
  `WORKING_DIRECTORY` arg to set the build *context*. (commit `c44ea369`)
- **Build context vs working directory** — `flyctl deploy .` makes `.`
  the Docker build context. Without it, the context defaults to
  fly.toml's directory, which means `COPY ../third_party/...` can't
  reach into the repo root. (commit `ad8c2b8f`)
- **Memory for in-memory RDF stores** — Oxigraph in-memory at ~700k
  quads needs ~200-250 MB at steady state. The default `shared-cpu-1x`
  with 256 MB starts swapping; bump to 512 MB. (commit `621a8b91`)
- **Cold starts** with `auto_stop_machines = 'stop'` +
  `min_machines_running = 0` add ~10-20 s of first-hit latency when
  the container has to re-gunzip + reload N-Quads into Oxigraph. Bump
  `min_machines_running = 1` (a few £/mo) or back the store with a
  persistent fly volume to avoid.

### GitHub Actions

- **`@v1.5` ≠ a real tag** for `superfly/flyctl-actions/setup-flyctl`.
  The action publishes only `@master` and `@v1.5.0` (full triplet) —
  truncated `@v1.5` resolves to nothing. Use `@master` per their docs
  unless you have a specific reason to pin. (commit `8dd749c7`)
- **`workflow_dispatch` only surfaces on the default branch.** A
  workflow file living on a feature branch — even if pushed to the
  remote — won't show the "Run workflow ▾" button until that file
  also exists on the default branch. (commit `8fb0d96c` — merge to
  `claude/main`)
- **`push` paths trigger is per-branch.** Setting `branches: [main]`
  means pushes to *any other branch* (incl. the actual default
  `claude/main`) don't fire. Always list every branch you want to
  trigger from. (commit `ad8c2b8f`)

### GitHub mobile

- **The iOS app shows only past runs, never the dispatch UI.** Mobile
  Safari with **Request Desktop Site** (`aA` button → Request Desktop
  Website) does show "Run workflow ▾". Or trigger by pushing a small
  change that matches the workflow's path filter — fastest if the
  filter is already broad.

### Docker / multi-stage

- **Static Oxigraph binary**: `superfly/oxigraph` isn't on Alpine
  packages. Pull the static musl release from
  `github.com/oxigraph/oxigraph/releases/download/v{X.Y.Z}/oxigraph_{X.Y.Z}_x86_64-unknown-linux-musl.tar.gz`
  in a separate build stage. Pin the version in a `ARG`. The binary
  works on `node:22-alpine` because both are musl.
- **PID 1 + supervisor**: when one entrypoint script needs to start
  two daemons (Oxigraph + Node here), wrap with `tini` so the parent
  reaps zombies + forwards signals. Otherwise SIGTERM from fly
  doesn't reach the children and shutdown takes forever.

### Cloudflare / upstream blockers

- **`publications.parliament.uk` returns 200 to browser-style UAs
  but 403 to bare curl** — Cloudflare's JS-challenge interstitial.
  See `lib/facilities/appg.mjs` which hardcodes a Chrome-style UA.
  The egress sandbox in CI gets blocked even with a UA spoof; cache
  the result locally and ship it as a `.nq.gz`.
- **The Wayback Machine is also blocked** from some sandboxes (HTTP
  403 with `x-block-reason: hostname_blocked`). No clean workaround
  beyond using the upstream's own cache headers if it has any.

## How to add a gotcha

When something surprises you in a Dockerfile / fly.toml / GHA / cloud
context, add a one-paragraph note to the relevant section in
[`reference.md`](reference.md) with:

1. **The error message** you actually saw (verbatim — future-you will
   web-search for those exact bytes).
2. **The fix** in one or two lines.
3. **The commit hash** that landed the fix.

Don't trim the error to a generic description; the verbatim string is
the most valuable thing to record.
