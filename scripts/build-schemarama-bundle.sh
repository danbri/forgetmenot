#!/usr/bin/env bash
# Rebuild the vendored schemarama browser bundle, adding the parseTurtle export
# that upstream core/index.js omits. Output: browser/third_party/schemarama.bundle.min.js
#
# Why: the public SHACL checker (browser/shacl-check.html) validates RDF that
# SPARQL CONSTRUCT/DESCRIBE returns as Turtle, but upstream's prebuilt bundle
# only exposes parseNQuads (strict N-Quads, rejects @prefix). We re-bundle the
# same submodule sources with parseTurtle exposed. Source stays pristine in the
# third_party/schemarama submodule; only the build entry/config live in our tree.
#
# Run after `git submodule update --init` and whenever the submodule is bumped.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$ROOT/third_party/schemarama/core"
CFG="$ROOT/scripts/schemarama-bundle/webpack.config.cjs"

if [ ! -f "$CORE/index.js" ]; then
  echo "submodule missing — run: git submodule update --init third_party/schemarama" >&2
  exit 1
fi

echo "==> installing schemarama core build deps"
( cd "$CORE" && npm install --no-audit --no-fund )

echo "==> webpacking Turtle-capable bundle -> browser/third_party/"
( cd "$CORE" && npx webpack --config "$CFG" )

# The fpkg deploy image only ships demos/parliament-live/web/, so the kgx SHACL
# client needs its own copy of the bundle inside that tree.
KGX_TP="$ROOT/demos/parliament-live/web/kgx/third_party"
echo "==> copying bundle -> demos/parliament-live/web/kgx/third_party/"
mkdir -p "$KGX_TP"
cp "$ROOT/browser/third_party/schemarama.bundle.min.js" "$KGX_TP/"
cp "$ROOT/browser/third_party/schemarama.bundle.min.js.LICENSE.txt" "$KGX_TP/" 2>/dev/null || true

echo "==> done:"
echo "    $ROOT/browser/third_party/schemarama.bundle.min.js"
echo "    $KGX_TP/schemarama.bundle.min.js"
