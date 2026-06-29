#!/usr/bin/env bash
# sparql-equiv.sh — check that two SPARQL queries are equivalent after a cleanup.
#
#   sparql-equiv.sh A.rq B.rq [--endpoint URL] [--jena-version X.Y.Z]
#
# Two complementary checks (SPARQL equivalence is undecidable in general, so
# neither alone is a complete oracle — read the verdicts together):
#
#   1. ALGEBRA (static, no network).  Compiles both queries with Apache Jena
#      ARQ `qparse --print=op` and diffs the resulting SPARQL algebra (SSE).
#      Comments, whitespace, keyword case and *unused* PREFIX declarations all
#      vanish at this layer, so a pure formatting cleanup yields byte-identical
#      algebra.  IDENTICAL ALGEBRA ⇒ the two queries are provably equivalent.
#      Different algebra is NOT proof of inequivalence (the algebra is not fully
#      canonicalised — e.g. reordered independent triple patterns, or renamed
#      variables, differ here) — fall through to the results check.
#
#   2. RESULTS (dynamic, needs --endpoint).  Runs both against a live endpoint,
#      canonicalises the JSON result sets (column set + row multiset) and diffs.
#      IDENTICAL RESULTS is strong evidence of equivalence on that data, but not
#      a proof (another dataset could still separate them).
#
# Note on variable renaming: lower-casing a SELECT-projected variable (a common
# style rule) RENAMES an output column, so it is *not* meaning-preserving — both
# checks will (correctly) flag it. That edit must be coordinated with whatever
# consumes the results, not applied silently.
#
# Deps: bash, java (for Jena), curl, python3. Jena is downloaded + cached once
# under ~/.cache/forgetmenot/.
set -euo pipefail

JENA_VERSION="5.4.0"
ENDPOINT=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --endpoint) ENDPOINT="$2"; shift 2 ;;
    --jena-version) JENA_VERSION="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
if [[ ${#ARGS[@]} -ne 2 ]]; then
  echo "usage: sparql-equiv.sh A.rq B.rq [--endpoint URL] [--jena-version X.Y.Z]" >&2
  exit 2
fi
A="${ARGS[0]}"; B="${ARGS[1]}"
for f in "$A" "$B"; do [[ -r "$f" ]] || { echo "cannot read $f" >&2; exit 2; }; done

# --- ensure Jena qparse (cached) -------------------------------------------
JENA_DIR="$HOME/.cache/forgetmenot/jena-$JENA_VERSION"
QPARSE="$JENA_DIR/apache-jena-$JENA_VERSION/bin/qparse"
if [[ ! -x "$QPARSE" ]]; then
  echo "→ downloading Apache Jena $JENA_VERSION (one-time)…" >&2
  mkdir -p "$JENA_DIR"
  tarball="$JENA_DIR/jena.tar.gz"
  # dlcdn keeps only the current release; archive.apache.org keeps them all.
  for base in "https://dlcdn.apache.org/jena/binaries" "https://archive.apache.org/dist/jena/binaries"; do
    if curl -fsSL --max-time 300 -o "$tarball" "$base/apache-jena-$JENA_VERSION.tar.gz"; then break; fi
  done
  [[ -s "$tarball" ]] || { echo "download failed for Jena $JENA_VERSION" >&2; exit 3; }
  tar -xzf "$tarball" -C "$JENA_DIR" && rm -f "$tarball"
fi
[[ -x "$QPARSE" ]] || { echo "qparse not found at $QPARSE" >&2; exit 3; }

# --- 1. syntax + algebra ----------------------------------------------------
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Canonicalise the SSE: drop the prefix prologue + expand prefixed names, so a
# pure formatting / unused-prefix / prefix-relabel cleanup compares equal.
algebra() { "$QPARSE" --query "$1" --print=op 2>/dev/null | python3 "$SELF_DIR/sse-canon.py"; }

echo "== syntax =="
err="$(mktemp)"; trap 'rm -f "$err"' EXIT
for f in "$A" "$B"; do
  if "$QPARSE" --query "$f" --print=query >/dev/null 2>"$err"; then
    echo "  ok   $f"
  else
    echo "  FAIL $f"; grep -v 'JAVA_TOOL_OPTIONS' "$err" | sed 's/^/       /'; exit 1
  fi
done

algA="$(algebra "$A")"; algB="$(algebra "$B")"
echo "== algebra (Jena ARQ SSE) =="
algebra_equal=0
if [[ "$algA" == "$algB" ]]; then
  echo "  ✓ IDENTICAL ALGEBRA — the queries are provably equivalent."
  algebra_equal=1
else
  echo "  ✗ algebra differs (not proof of inequivalence; see diff + results)."
  diff <(printf '%s\n' "$algA") <(printf '%s\n' "$algB") | sed 's/^/    /' || true
fi

# --- 2. endpoint result comparison -----------------------------------------
results_verdict="skipped (no --endpoint)"
if [[ -n "$ENDPOINT" ]]; then
  echo "== results @ $ENDPOINT =="
  run() {  # POST a query, emit canonicalised "vars\trow-multiset" via python
    curl -fsS --max-time 120 "$ENDPOINT" \
      --data-urlencode "query@$1" \
      -H 'Accept: application/sparql-results+json' \
    | python3 -c '
import sys,json
d=json.load(sys.stdin)
vars=d.get("head",{}).get("vars",[])
rows=[]
for b in d.get("results",{}).get("bindings",[]):
    cell={k:(v.get("type"),v.get("value"),v.get("datatype"),v.get("xml:lang")) for k,v in b.items()}
    rows.append(json.dumps(cell,sort_keys=True))
rows.sort()
print(json.dumps({"vars":vars,"n":len(rows)}))
sys.stdout.write("\n".join(rows))
'
  }
  outA="$(run "$A")" || { echo "  endpoint query A failed"; exit 4; }
  outB="$(run "$B")" || { echo "  endpoint query B failed"; exit 4; }
  hdrA="$(printf '%s' "$outA" | head -1)"; hdrB="$(printf '%s' "$outB" | head -1)"
  echo "  A: $hdrA"
  echo "  B: $hdrB"
  if [[ "$outA" == "$outB" ]]; then
    echo "  ✓ IDENTICAL RESULTS (same columns + same row multiset)."
    results_verdict="identical"
  else
    echo "  ✗ results differ:"
    [[ "$hdrA" != "$hdrB" ]] && echo "    header/column or row-count mismatch (see above)."
    diff <(printf '%s' "$outA" | tail -n +2) <(printf '%s' "$outB" | tail -n +2) \
      | head -40 | sed 's/^/    /' || true
    results_verdict="DIFFER"
  fi
fi

# --- verdict ----------------------------------------------------------------
echo "== verdict =="
echo "  algebra: $([[ $algebra_equal == 1 ]] && echo identical || echo differs)"
echo "  results: $results_verdict"
if [[ $algebra_equal == 1 || "$results_verdict" == "identical" ]]; then
  echo "  ⇒ EQUIVALENT (algebra identical = proof; results identical = strong evidence)."
  exit 0
fi
echo "  ⇒ NOT CONFIRMED equivalent — review the diffs above."
exit 1
