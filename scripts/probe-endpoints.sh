#!/usr/bin/env bash
# Probe every UK Parliament endpoint we know about and record HTTP status +
# a small response excerpt. Output is appended to _specs/probes/ with a
# date-stamped filename so re-runs accumulate a history that can be diffed.
#
#   bash scripts/probe-endpoints.sh
#
# This script is intentionally read-only: it never writes to skills/ or to
# _specs/*.json (those come from refetch-specs.sh).

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATE=$(date -u +%Y-%m-%d)
OUT="$REPO/_specs/probes/${DATE}-probe.txt"
mkdir -p "$(dirname "$OUT")"

# label  url  [optional curl extra args]
PROBES=(
  "members-api/search       https://members-api.parliament.uk/api/Members/Search?take=1"
  "members-api/spec         https://members-api.parliament.uk/swagger/v1/swagger.json"
  "bills-api/list           https://bills-api.parliament.uk/api/v1/Bills?take=1"
  "bills-api/spec           https://bills-api.parliament.uk/swagger/v1/swagger.json"
  "committees-api/list      https://committees-api.parliament.uk/api/Committees?take=1"
  "committees-api/spec      https://committees-api.parliament.uk/swagger/v1/swagger.json"
  "treaties-api/list        https://treaties-api.parliament.uk/api/Treaty?take=1"
  "treaties-api/spec        https://treaties-api.parliament.uk/swagger/v1/swagger.json"
  "erskinemay-api/parts     https://erskinemay-api.parliament.uk/api/Part"
  "erskinemay-api/spec      https://erskinemay-api.parliament.uk/swagger/v1/swagger.json"
  "now-api/sample           https://now-api.parliament.uk/api/Message/message/CommonsMain/current"
  "now-api/spec             https://now-api.parliament.uk/swagger/v1/swagger.json"
  "interests-api/registers  https://interests-api.parliament.uk/api/v1/Registers"
  "interests-api/spec       https://interests-api.parliament.uk/swagger/v1/swagger.json"
  "lordsvotes-api/search    https://lordsvotes-api.parliament.uk/data/Divisions/search?take=1"
  "lordsvotes-api/spec      https://lordsvotes-api.parliament.uk/swagger/v1/swagger.json"
  "commonsvotes-api/search  https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.take=1"
  "commonsvotes-api/spec    https://commonsvotes-api.parliament.uk/swagger/docs/v1"
  "hansard-api/search       https://hansard-api.parliament.uk/search.json?queryParameters.searchTerm=climate&queryParameters.take=1"
  "hansard-api/spec         https://hansard-api.parliament.uk/swagger/docs/v1"
  "oralquestions-api/edms   https://oralquestionsandmotions-api.parliament.uk/EarlyDayMotions/list?parameters.take=1"
  "oralquestions-api/spec   https://oralquestionsandmotions-api.parliament.uk/swagger/docs/v1"
  "questions-statements/spec https://questions-statements-api.parliament.uk/swagger/v1/swagger.json"
  "questions-statements/wq  https://questions-statements-api.parliament.uk/api/writtenquestions/questions?take=1"
  "si-api/spec              https://statutoryinstruments-api.parliament.uk/swagger/v2/swagger.json"
  "si-api/list              https://statutoryinstruments-api.parliament.uk/api/v2/StatutoryInstrument?take=1"
  "sparql/probe             https://api.parliament.uk/sparql?query=SELECT%20%2A%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D%20LIMIT%201"
  "odata/service-doc        https://api.parliament.uk/odata/"
  "query/root               https://api.parliament.uk/query/"
  "lda/commonsdivisions     https://lda.data.parliament.uk/commonsdivisions.json?_pageSize=1"
  "lda-azure/commonsdivisions https://eldaddp.azurewebsites.net/commonsdivisions.json?_pageSize=1"
  "petitions/list           https://petition.parliament.uk/petitions.json?state=open&count=1"
  "historic-hansard/root    https://api.parliament.uk/historic-hansard/"
  "mnis/parties             https://data.parliament.uk/membersdataplatform/services/mnis/parties/active/Commons/"
  "mnis/members-query       https://data.parliament.uk/membersdataplatform/services/mnis/members/query/House%3DCommons%7CIsEligible%3Dtrue/?format=json"
)

{
  echo "# UK Parliament endpoint probe — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# format: <label>  <http>  <bytes>  <url>"
  echo
  for entry in "${PROBES[@]}"; do
    label=$(echo "$entry" | awk '{print $1}')
    url=$(echo "$entry" | awk '{$1=""; sub(/^ +/,""); print}')
    body=$(mktemp)
    code=$(curl -sL -o "$body" -w "%{http_code}" --max-time 30 "$url" || echo "000")
    bytes=$(wc -c < "$body" | tr -d ' ')
    printf "%-32s %4s %8s  %s\n" "$label" "$code" "$bytes" "$url"
    rm -f "$body"
  done
} | tee "$OUT"

echo
echo "wrote $OUT"
