# fpkg — Forgetmeknot Palace.
#
# Two services in one image:
#   1. Node static-server + proxy on $PORT (default 8080)
#   2. Oxigraph SPARQL store on 127.0.0.1:7878, loaded from bundled
#      N-Quads dumps. The Node server proxies /sparql/* to it.
#
# Build context: repo root (so the Dockerfile can COPY ../../third_party/).
# See demos/parliament-live/fly.toml for deploy invocation.

# --- Stage 1: download a static Oxigraph binary ---
FROM alpine:3.20 AS oxigraph-stage
RUN apk add --no-cache curl ca-certificates tar
# Oxigraph publishes static musl binaries on GitHub Releases.
# Pin to v0.4.5 (latest stable at time of build). Update with the
# update-oxigraph step in the rebuild-data workflow.
ARG OXIGRAPH_VERSION=0.4.5
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
        x86_64)  asset=oxigraph_${OXIGRAPH_VERSION}_x86_64-unknown-linux-musl ;; \
        aarch64) asset=oxigraph_${OXIGRAPH_VERSION}_aarch64-unknown-linux-musl ;; \
        *) echo "unknown arch: $arch"; exit 1 ;; \
    esac; \
    curl -sSL -o /tmp/oxigraph.tar.gz \
        "https://github.com/oxigraph/oxigraph/releases/download/v${OXIGRAPH_VERSION}/${asset}.tar.gz"; \
    mkdir -p /opt/oxigraph; \
    tar -xzf /tmp/oxigraph.tar.gz -C /opt/oxigraph --strip-components=1; \
    chmod +x /opt/oxigraph/oxigraph; \
    /opt/oxigraph/oxigraph --version

# --- Stage 2: runtime ---
FROM node:22-alpine AS runtime

# Oxigraph is statically linked but needs musl libc (alpine has that).
COPY --from=oxigraph-stage /opt/oxigraph/oxigraph /usr/local/bin/oxigraph
RUN apk add --no-cache tini gzip

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

ENV HOST=0.0.0.0
ENV PORT=8080
ENV OXIGRAPH_BIND=127.0.0.1:7878
ENV NQUADS_DIR=/app/data

EXPOSE 8080

# tini = PID 1, reaps zombies and forwards signals. Required when one
# process supervises another (Oxigraph here is launched by entrypoint).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/fpkg-entrypoint"]
