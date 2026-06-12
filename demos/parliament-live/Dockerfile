# fpkg — Forgetmeknot Palace.
#
# Two services in one image:
#   1. Node static-server + proxy on $PORT (default 8080)
#   2. Oxigraph SPARQL store on 127.0.0.1:7878, loaded from bundled
#      N-Quads dumps. The Node server proxies /sparql/* to it.
#
# Build context: repo root (so the Dockerfile can COPY third_party/...).
# See demos/parliament-live/fly.toml for deploy invocation.

# --- Stage 1: download the Oxigraph binary -----------------------------------
#
# Oxigraph 0.5.x releases ship as BARE ELF BINARIES (no tarball), and only
# in linux_gnu (glibc) flavour — no musl static build is published. So we:
#   - download the bare binary, chmod +x, copy it across
#   - run on a glibc-based runtime image (node:22-slim, Debian-derived)
#
# Asset URL pattern, verified 2026-05-27:
#   github.com/oxigraph/oxigraph/releases/download/<TAG>/oxigraph_<TAG>_<ARCH>
# where TAG is the literal "v0.5.8" (including the 'v') and ARCH is one of:
#   x86_64_linux_gnu | aarch64_linux_gnu | x86_64_apple | ...
#
# The earlier `oxigraph_X.Y.Z_<arch>-unknown-linux-musl.tar.gz` naming was a
# guess at a static-musl release that doesn't exist; the download silently
# returned an HTML 404 which `tar -xz` rejected with "gzip: invalid magic".
# Recorded in skills/kgx-infra-cloud-containers/.

FROM debian:bookworm-slim AS oxigraph-stage
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG OXIGRAPH_VERSION=v0.5.8
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
        x86_64)  asset_arch=x86_64_linux_gnu  ;; \
        aarch64) asset_arch=aarch64_linux_gnu ;; \
        *) echo "unsupported arch: $arch"; exit 1 ;; \
    esac; \
    asset="oxigraph_${OXIGRAPH_VERSION}_${asset_arch}"; \
    url="https://github.com/oxigraph/oxigraph/releases/download/${OXIGRAPH_VERSION}/${asset}"; \
    echo "fetching $url"; \
    curl -fsSL -o /usr/local/bin/oxigraph "$url"; \
    chmod +x /usr/local/bin/oxigraph; \
    /usr/local/bin/oxigraph --version

# --- Stage 2: pre-bake the RocksDB store -------------------------------------
#
# Run `oxigraph load` once at CI time so the runtime image ships with a
# pre-populated RocksDB directory. The runtime entrypoint then goes
# straight to `serve-read-only`, skipping the ~25-30s gunzip + load that
# previously ran on every cold start.

FROM debian:bookworm-slim AS load-stage
RUN apt-get update && apt-get install -y --no-install-recommends \
        gzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=oxigraph-stage /usr/local/bin/oxigraph /usr/local/bin/oxigraph

WORKDIR /load
# All bundled .nq.gz copied flat into /load (filenames are arbitrary
# once data lands in RocksDB).
COPY third_party/data/scrutiny-graph/scrutiny.nq.gz                                 ./
COPY third_party/data/transparency-graph/transparency.nq.gz                         ./
COPY third_party/data/accountability-graph/accountability.nq.gz                     ./
COPY third_party/identity-graph/identity.nq.gz                                      ./
COPY third_party/data/parl-current/parl-current.nq.gz                               ./
COPY third_party/data/psephology/all.nq.gz                                          ./psephology.nq.gz
COPY third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz               ./
COPY third_party/data/fcdo_treaties/extractors/factoids/all.nq.gz                   ./fcdo-treaties.nq.gz
COPY third_party/govuk/html/orgcharts/extractors/factoids/all.nq.gz                 ./govuk-orgchart.nq.gz

RUN set -eux; \
    mkdir -p /data-db; \
    for f in *.nq.gz; do gunzip -k "$f"; done; \
    files=""; for nq in *.nq; do files="$files --file $nq"; done; \
    # Two bugs in `oxigraph load` 0.5.8 make this step subtle:
    #   1. Strict mode rejects identity.nq with
    #        "Parser error ... Invalid IRI code point '#'"
    #      on standard W3C namespace IRIs (xsd#integer, rdf#type, owl#sameAs,
    #      …). `#` is a valid IRI code point per RFC 3987 — the parser is
    #      overstrict. `--lenient` accepts them.
    #   2. EVEN WHEN A FILE IS REJECTED, `oxigraph load` exits 0. The error
    #      is on stderr only. So `set -e` does NOT catch it. Without the
    #      defensive grep below, the build silently ships a RocksDB that's
    #      missing whichever file failed (we noticed identity-graph absent
    #      from fpkg.fly.dev for weeks before chasing this down).
    # See skills/kgx-infra-cloud-containers/reference.md → Oxigraph.
    # shellcheck disable=SC2086
    oxigraph load --lenient --location /data-db $files 2>&1 | tee /tmp/oxi-load.log; \
    if grep -q "^Error while loading" /tmp/oxi-load.log; then \
        echo "::error::oxigraph load reported a file-level error; build halted" >&2; \
        exit 1; \
    fi; \
    rm -f *.nq *.nq.gz /tmp/oxi-load.log; \
    du -sh /data-db

# --- Stage 3: runtime --------------------------------------------------------
FROM node:22-slim AS runtime

COPY --from=oxigraph-stage /usr/local/bin/oxigraph /usr/local/bin/oxigraph
RUN apt-get update && apt-get install -y --no-install-recommends \
        tini ca-certificates wget bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node static server + web assets.
COPY --chown=node:node demos/parliament-live/server.mjs ./
COPY --chown=node:node demos/parliament-live/web/ ./web/
# Canonical home of the Python-interop demo. The web/python-interop/
# directory contains symlinks back here (relative `../../../python-interop/`)
# so the same kgx_chain.py serves the CLI demo and the in-browser
# Pyodide demo. The symlinks resolve correctly only if /app/python-interop
# exists with the real files — hence this COPY.
COPY --chown=node:node demos/python-interop/ ./python-interop/
COPY --chown=node:node demos/parliament-live/CLAUDE.md ./
COPY --chown=node:node demos/parliament-live/entrypoint.sh /usr/local/bin/fpkg-entrypoint
RUN chmod +x /usr/local/bin/fpkg-entrypoint

# Pre-baked RocksDB from the load-stage. No .nq.gz lives in the runtime
# image — the data is already in the indexed store.
COPY --from=load-stage --chown=node:node /data-db /app/data-db

ENV HOST=0.0.0.0
ENV PORT=8080
ENV OXIGRAPH_BIND=127.0.0.1:7878
ENV OXIGRAPH_DB=/app/data-db

EXPOSE 8080

# tini = PID 1, reaps zombies and forwards signals. Required when one
# process supervises another (Oxigraph here is launched by entrypoint).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/fpkg-entrypoint"]
