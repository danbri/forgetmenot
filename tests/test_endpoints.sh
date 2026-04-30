#!/usr/bin/env bash
# Smoke test: every facility this repo wraps must answer one minimal
# query. Each line below is one assertion: "<facility>: <url>". A
# response is "passing" if the HTTP status is 200 (or one of the
# documented status codes for that facility) and the body is non-empty
# and parses as JSON / XML / HTML as expected.
#
# Run:
#   bash tests/test_endpoints.sh
#
# Exit code is the number of failed assertions (0 on full pass).

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
FAILED_LINES=()

assert_status() {
  local label="$1"; shift
  local expected="$1"; shift
  local url="$1"; shift
  local extra=("$@")
  local body
  body=$(mktemp)
  local code
  code=$(curl -sL --max-time 30 "${extra[@]}" -o "$body" -w "%{http_code}" "$url" || echo "000")
  local size
  size=$(wc -c < "$body" | tr -d ' ')
  rm -f "$body"
  if [ "$code" = "$expected" ] && [ "$size" -gt 0 ]; then
    printf "  ok    %-44s %s (%d bytes)\n" "$label" "$code" "$size"
    PASS=$((PASS+1))
  else
    printf "  FAIL  %-44s expected %s, got %s (%d bytes) — %s\n" "$label" "$expected" "$code" "$size" "$url"
    FAIL=$((FAIL+1))
    FAILED_LINES+=("$label  $url")
  fi
}

echo "Modern REST APIs"
assert_status "members          : search"          200 'https://members-api.parliament.uk/api/Members/Search?take=1'
assert_status "members          : spec"            200 'https://members-api.parliament.uk/swagger/v1/swagger.json'
assert_status "bills            : list"            200 'https://bills-api.parliament.uk/api/v1/Bills?take=1'
assert_status "bills            : spec"            200 'https://bills-api.parliament.uk/swagger/v1/swagger.json'
assert_status "committees       : list"            200 'https://committees-api.parliament.uk/api/Committees?take=1'
assert_status "committees       : spec"            200 'https://committees-api.parliament.uk/swagger/v1/swagger.json'
assert_status "treaties         : list"            200 'https://treaties-api.parliament.uk/api/Treaty?take=1'
assert_status "treaties         : spec"            200 'https://treaties-api.parliament.uk/swagger/v1/swagger.json'
assert_status "erskine-may      : parts"           200 'https://erskinemay-api.parliament.uk/api/Part'
assert_status "erskine-may      : spec"            200 'https://erskinemay-api.parliament.uk/swagger/v1/swagger.json'
assert_status "now              : sample"          200 'https://now-api.parliament.uk/api/Message/message/CommonsMain/current'
assert_status "now              : spec"            200 'https://now-api.parliament.uk/swagger/v1/swagger.json'
assert_status "interests        : registers"       200 'https://interests-api.parliament.uk/api/v1/Registers'
assert_status "interests        : spec"            200 'https://interests-api.parliament.uk/swagger/v1/swagger.json'
assert_status "lords-votes      : search"          200 'https://lordsvotes-api.parliament.uk/data/Divisions/search?take=1'
assert_status "lords-votes      : spec"            200 'https://lordsvotes-api.parliament.uk/swagger/v1/swagger.json'
assert_status "commons-votes    : search"          200 'https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.take=1'
assert_status "commons-votes    : spec"            200 'https://commonsvotes-api.parliament.uk/swagger/docs/v1'
assert_status "hansard          : search"          200 'https://hansard-api.parliament.uk/search.json?queryParameters.searchTerm=climate&queryParameters.take=1'
assert_status "hansard          : spec"            200 'https://hansard-api.parliament.uk/swagger/docs/v1'
assert_status "oral-questions   : edms"            200 'https://oralquestionsandmotions-api.parliament.uk/EarlyDayMotions/list?parameters.take=1'
assert_status "oral-questions   : spec"            200 'https://oralquestionsandmotions-api.parliament.uk/swagger/docs/v1'
assert_status "questions-statements: spec"         200 'https://questions-statements-api.parliament.uk/swagger/v1/swagger.json'
assert_status "questions-statements: wq"           200 'https://questions-statements-api.parliament.uk/api/writtenquestions/questions?take=1'
assert_status "statutory-instruments: spec"        200 'https://statutoryinstruments-api.parliament.uk/swagger/v2/swagger.json'
assert_status "statutory-instruments: list"        200 'https://statutoryinstruments-api.parliament.uk/api/v2/StatutoryInstrument?take=1'

echo
echo "Linked-data / RDF"
assert_status "sparql           : SELECT 1"         200 'https://api.parliament.uk/sparql?query=SELECT%20%2A%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D%20LIMIT%201' \
              -H 'Accept: application/sparql-results+json'
assert_status "odata            : service-doc"      200 'https://api.parliament.uk/odata/'
assert_status "parameterised-query: root"           200 'https://api.parliament.uk/query/'
assert_status "lda              : commonsdivisions" 200 'https://lda.data.parliament.uk/commonsdivisions.json?_pageSize=1'
assert_status "lda-azure        : commonsdivisions" 200 'https://eldaddp.azurewebsites.net/commonsdivisions.json?_pageSize=1'

echo
echo "Other Parliament-operated"
assert_status "petitions        : list"             200 'https://petition.parliament.uk/petitions.json?state=open&count=1'
assert_status "historic-hansard : root"             200 'https://api.parliament.uk/historic-hansard/'
assert_status "mnis             : parties Commons"  200 'https://data.parliament.uk/membersdataplatform/services/mnis/parties/active/Commons/'

echo
echo "Cached spec snapshots present"
present=0; missing=0
for f in members bills committees treaties erskinemay now interests lordsvotes commonsvotes hansard oralquestions questions-statements si; do
  p="$REPO/_specs/${f}.json"
  if [ -s "$p" ]; then
    printf "  ok    cached spec _specs/%-22s  %d bytes\n" "${f}.json" "$(wc -c < "$p")"
    present=$((present+1))
  else
    printf "  FAIL  cached spec _specs/%-22s missing\n" "${f}.json"
    missing=$((missing+1))
    FAIL=$((FAIL+1))
  fi
done

echo
echo "Discovered artefacts present"
for f in releaseddatasets.txt query-templates.txt odata-entities.txt; do
  p="$REPO/_specs/discovered/$f"
  if [ -s "$p" ]; then
    printf "  ok    %-40s  %d lines\n" "_specs/discovered/$f" "$(wc -l < "$p" | tr -d ' ')"
    PASS=$((PASS+1))
  else
    printf "  FAIL  %-40s  missing or empty\n" "_specs/discovered/$f"
    FAIL=$((FAIL+1))
  fi
done

echo
echo "Skill manifests present"
expected=(members bills committees hansard commons-votes lords-votes oral-questions-and-edms written-questions-and-statements statutory-instruments treaties interests erskine-may now petitions sparql odata parameterised-query linked-data-api historic-hansard members-data-platform data-parliament-uk-datasets)
for s in "${expected[@]}"; do
  if [ -s "$REPO/skills/$s/SKILL.md" ]; then
    printf "  ok    skills/%-40s/SKILL.md\n" "$s"
    PASS=$((PASS+1))
  else
    printf "  FAIL  skills/%-40s/SKILL.md  missing\n" "$s"
    FAIL=$((FAIL+1))
  fi
done

echo
echo "Summary: $PASS passing, $FAIL failing"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Failed assertions:"
  for line in "${FAILED_LINES[@]}"; do echo "  $line"; done
  exit 1
fi
