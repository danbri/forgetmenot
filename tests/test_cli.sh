#!/usr/bin/env bash
# Smoke test for the bin/parl CLI. Runs one command per facility,
# checks the exit code and that stdout is non-empty JSON.
#
#   bash tests/test_cli.sh
#
# Exit code is the number of failed assertions.

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CLI="node $REPO/bin/parl.mjs"

PASS=0
FAIL=0
FAILED=()

run() {
  local label="$1"; shift
  local out
  out=$(eval "$CLI $* 2>/tmp/parl_err.$$") || {
    rc=$?
    printf "  FAIL  %-44s rc=%d\n" "$label" "$rc"
    head -3 /tmp/parl_err.$$ | sed 's/^/        /'
    FAIL=$((FAIL+1))
    FAILED+=("$label")
    return
  }
  if [ -z "$out" ]; then
    printf "  FAIL  %-44s (empty output)\n" "$label"
    FAIL=$((FAIL+1))
    FAILED+=("$label")
    return
  fi
  size=$(printf '%s' "$out" | wc -c | tr -d ' ')
  printf "  ok    %-44s (%d bytes)\n" "$label" "$size"
  PASS=$((PASS+1))
}

echo "Modern REST APIs"
run "members search take=1"          members search --take 1
run "members get 172"                members get 172
run "bills search take=1"            bills search --take 1
run "bills types"                    bills types
run "committees search take=1"       committees search --take 1
run "hansard last-sitting"           hansard last-sitting --house Commons
run "hansard search climate"         hansard search --term climate --take 1
run "commons-votes search take=1"    commons-votes search --take 1
run "lords-votes search take=1"      lords-votes search --take 1
run "oral-questions edms"            oral-questions edms --take 1
run "wq search take=1"               wq search --take 1
run "si search take=1"               si search --take 1
run "treaties search take=1"         treaties search --take 1
run "interests categories"           interests categories
run "em parts"                       em parts
run "now CommonsMain"                now current CommonsMain

echo
echo "Linked-data / RDF"
run "sparql query SELECT 1"          "sparql query 'SELECT * WHERE { ?s ?p ?o } LIMIT 1'"
run "odata sets"                     odata sets
run "pq postcode SW1P 3JA"           pq postcode '"SW1P 3JA"'
run "lda commonsdivisions"           "lda get commonsdivisions --page-size 1"

echo
echo "Other Parliament-operated"
run "petitions search count=1"       petitions search --state open --count 1
run "ddpd list"                      ddpd list

echo
echo "Help and version"
run "--version"                      --version
run "members --help"                 members --help
run "bills search --help"            bills search --help

echo
echo "Summary: $PASS passing, $FAIL failing"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:"
  for x in "${FAILED[@]}"; do echo "  $x"; done
  exit "$FAIL"
fi
