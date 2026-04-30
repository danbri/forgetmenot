#!/usr/bin/env bash
# Refetch all OpenAPI / Swagger specs that the repo depends on, into _specs/.
#
# Run from anywhere; resolves paths relative to the repo root.
#
#   bash scripts/refetch-specs.sh
#
# Exits non-zero if any download fails (any HTTP status other than 200).
# Specs are committed to git so the repo works offline; this script is the
# canonical way to refresh them.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/_specs"
mkdir -p "$OUT"

# pairs of: <slug> <url>
SPECS=(
  "members            https://members-api.parliament.uk/swagger/v1/swagger.json"
  "bills              https://bills-api.parliament.uk/swagger/v1/swagger.json"
  "committees         https://committees-api.parliament.uk/swagger/v1/swagger.json"
  "treaties           https://treaties-api.parliament.uk/swagger/v1/swagger.json"
  "erskinemay         https://erskinemay-api.parliament.uk/swagger/v1/swagger.json"
  "now                https://now-api.parliament.uk/swagger/v1/swagger.json"
  "interests          https://interests-api.parliament.uk/swagger/v1/swagger.json"
  "lordsvotes         https://lordsvotes-api.parliament.uk/swagger/v1/swagger.json"
  "commonsvotes       https://commonsvotes-api.parliament.uk/swagger/docs/v1"
  "hansard            https://hansard-api.parliament.uk/swagger/docs/v1"
  "oralquestions      https://oralquestionsandmotions-api.parliament.uk/swagger/docs/v1"
  "questions-statements https://questions-statements-api.parliament.uk/swagger/v1/swagger.json"
  "si                 https://statutoryinstruments-api.parliament.uk/swagger/v2/swagger.json"
)

fail=0
for entry in "${SPECS[@]}"; do
  slug=$(echo "$entry" | awk '{print $1}')
  url=$(echo "$entry" | awk '{print $2}')
  out="$OUT/${slug}.json"
  code=$(curl -s -o "$out" -w "%{http_code}" "$url")
  if [ "$code" = "200" ]; then
    size=$(wc -c < "$out" | tr -d ' ')
    printf "ok   %-22s %6s bytes  %s\n" "$slug" "$size" "$url"
  else
    printf "FAIL %-22s   HTTP %s     %s\n" "$slug" "$code" "$url"
    fail=$((fail + 1))
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "$fail spec(s) failed to download" >&2
  exit 1
fi
