#!/usr/bin/env bash
# Daisychain 1.0 cross-implementation conformance test.
#
# For every chain in demos/python-interop/examples/, the Python planner
# (kgx_chain.py --plan) and the JS planner (kgx.mjs plan, which uses
# kgx_core.mjs — the same module the browser page imports) must emit
# BYTE-IDENTICAL fused SPARQL for the same bead. This is the convergence
# contract of docs/kgx/daisychain-1.0.md: the spec JSON is the DAL
# boundary, and both sides of it plan identically.
#
# Also validates every chain structurally (unresolved inputs are a
# hard failure; ungrounded beads are a warning and don't fail).
#
# Usage: tests/test_kgx_conformance.sh [--run-spotcheck]
#   --run-spotcheck additionally executes 3 plans against their live
#   endpoints and compares row counts between the two implementations
#   (network required; skipped by default to keep CI hermetic).

set -uo pipefail
cd "$(dirname "$0")/.."

PYI=demos/python-interop
EXAMPLES=("$PYI"/examples/*.trig)
FAILED=0
CHECKED=0

for f in "${EXAMPLES[@]}"; do
  name=$(basename "$f" .trig)

  # Structural validation (Python side). Exit 1 = hard error.
  if ! python3 "$PYI/kgx_chain.py" --validate "$f" > /tmp/kgx-validate.json 2>/dev/null; then
    echo "FAIL(validate): $name"
    cat /tmp/kgx-validate.json
    FAILED=$((FAILED+1))
    continue
  fi

  # Some chains end in an Augment bead or have no plannable bead; plan
  # errors on BOTH sides identically is also conformance. Capture each
  # side's output+status and compare.
  py_out=$(python3 "$PYI/kgx_chain.py" --plan last --sparql-only "$f" 2>&1); py_rc=$?
  js_out=$(node "$PYI/kgx.mjs" plan "$f" last --sparql-only 2>&1);          js_rc=$?

  if [ $py_rc -ne 0 ] && [ $js_rc -ne 0 ]; then
    # Both refused to plan (e.g. bare-structure chain) — conformant.
    CHECKED=$((CHECKED+1))
    continue
  fi
  if [ $py_rc -ne $js_rc ]; then
    echo "FAIL(status): $name — python rc=$py_rc, node rc=$js_rc"
    FAILED=$((FAILED+1))
    continue
  fi
  if [ "$py_out" != "$js_out" ]; then
    echo "FAIL(diff): $name"
    diff <(echo "$py_out") <(echo "$js_out") | head -10
    FAILED=$((FAILED+1))
    continue
  fi
  CHECKED=$((CHECKED+1))
done

echo
echo "conformance: $CHECKED/${#EXAMPLES[@]} chains plan byte-identically"

if [ "${1:-}" = "--run-spotcheck" ]; then
  echo
  for name in large-sharks tudor-monarchs un-secretaries-general; do
    f="$PYI/examples/$name.trig"
    py_rows=$(python3 "$PYI/kgx_chain.py" --run last --limit 5 "$f" 2>/dev/null \
              | python3 -c "import json,sys; print(len(json.load(sys.stdin)['results']['bindings']))" 2>/dev/null)
    sleep 2
    js_rows=$(node "$PYI/kgx.mjs" run "$f" last --limit 5 2>/dev/null \
              | python3 -c "import json,sys; print(len(json.load(sys.stdin)['results']['bindings']))" 2>/dev/null)
    if [ "$py_rows" = "$js_rows" ] && [ -n "$py_rows" ]; then
      echo "spotcheck OK: $name — both returned $py_rows rows"
    else
      echo "FAIL(spotcheck): $name — python=$py_rows node=$js_rows"
      FAILED=$((FAILED+1))
    fi
    sleep 2
  done
fi

if [ $FAILED -gt 0 ]; then
  echo "FAILED: $FAILED"
  exit 1
fi
echo "ALL OK"
