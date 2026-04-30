#!/usr/bin/env bash
# Refetch the artefacts that aren't OpenAPI specs but are still useful to
# have under version control: the explore.data.parliament.uk dataset list,
# the parameterised-query template list, the OData entity-set list.
#
# Idempotent. Run from anywhere.
#
#   bash scripts/refetch-discovered.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/_specs/discovered"
mkdir -p "$OUT"

# 1) explore.data.parliament.uk dataset names
curl -s 'https://explore.data.parliament.uk/Scripts/modules/releaseddatasets.json' \
  | python3 -c "
import json, sys
raw = sys.stdin.buffer.read()
if raw.startswith(b'\xef\xbb\xbf'):
    raw = raw[3:]
for x in json.loads(raw):
    print(x)
" > "$OUT/releaseddatasets.txt"

echo "ok   releaseddatasets    $(wc -l < "$OUT/releaseddatasets.txt" | tr -d ' ') lines"

# 2) Parameterised query template names
curl -sL 'https://api.parliament.uk/query/' \
  | grep -oE "href='[^']*'" | sed "s/href='//;s/'//" \
  | grep -v '^https\?://' \
  | sort -u \
  > "$OUT/query-templates.txt"
echo "ok   query-templates     $(wc -l < "$OUT/query-templates.txt" | tr -d ' ') lines"

# 3) OData entity-set names
curl -s 'https://api.parliament.uk/odata/' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d.get('value', []):
    print(e['name'])
" > "$OUT/odata-entities.txt"
echo "ok   odata-entities      $(wc -l < "$OUT/odata-entities.txt" | tr -d ' ') lines"
