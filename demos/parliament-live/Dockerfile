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

# --- Stage 2: runtime --------------------------------------------------------
FROM node:22-slim AS runtime

# Bring the binary across. tini + gzip from apt.
COPY --from=oxigraph-stage /usr/local/bin/oxigraph /usr/local/bin/oxigraph
RUN apt-get update && apt-get install -y --no-install-recommends \
        tini gzip ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node static server + web assets.
COPY --chown=node:node demos/parliament-live/server.mjs ./
COPY --chown=node:node demos/parliament-live/web/ ./web/
COPY --chown=node:node demos/parliament-live/CLAUDE.md ./
COPY --chown=node:node demos/parliament-live/entrypoint.sh /usr/local/bin/fpkg-entrypoint
RUN chmod +x /usr/local/bin/fpkg-entrypoint

# Bundle the N-Quads. They stay gzipped on disk; the entrypoint
# gunzips into a tmpfs at startup and loads Oxigraph from that.
RUN mkdir -p /app/data
COPY --chown=node:node third_party/data/scrutiny-graph/scrutiny.nq.gz             /app/data/
COPY --chown=node:node third_party/data/transparency-graph/transparency.nq.gz     /app/data/
COPY --chown=node:node third_party/data/accountability-graph/accountability.nq.gz /app/data/
COPY --chown=node:node third_party/identity-graph/identity.nq.gz                  /app/data/
COPY --chown=node:node third_party/data/psephology/all.nq.gz                      /app/data/psephology.nq.gz
COPY --chown=node:node third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz /app/data/
# Treaties laid before Parliament under CRaG, lifted to RDF from the
# FCDO Treaty Series via the fcdo-treaties skill. ~15 MB compressed —
# by far the largest single dataset in the bundle.
COPY --chown=node:node third_party/data/fcdo_treaties/extractors/factoids/all.nq.gz /app/data/fcdo-treaties.nq.gz
# GOV.UK org chart — ministerial / people / organisation pages extracted
# as factoids, one named graph per gov.uk page. Built by govuk-orgchart.
COPY --chown=node:node third_party/govuk/html/orgcharts/extractors/factoids/all.nq.gz /app/data/govuk-orgchart.nq.gz

ENV HOST=0.0.0.0
ENV PORT=8080
ENV OXIGRAPH_BIND=127.0.0.1:7878
ENV NQUADS_DIR=/app/data

EXPOSE 8080

# tini = PID 1, reaps zombies and forwards signals. Required when one
# process supervises another (Oxigraph here is launched by entrypoint).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/fpkg-entrypoint"]
