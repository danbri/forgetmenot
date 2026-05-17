#!/usr/bin/env python3
"""Refresh cached Wikidata bridge data for the GOV.UK / Parliament joins.

Reads every `*.rq` file under ../queries/, runs it against the public
Wikidata Query Service (WDQS), and writes a JSONL row-dump to
../data/<query-name>.jsonl. Also emits a Turtle file
../data/people-bridge.ttl whose only triples are owl:sameAs links
between the gov.uk person URI and the Wikidata QID -- ready to merge
into the org-chart corpus to make person-level joins cheap.

WDQS is shared infrastructure; this script throttles to ~1 request per
second and identifies itself with a contact User-Agent per Wikimedia's
robot policy: https://meta.wikimedia.org/wiki/User-Agent_policy

    python3 third_party/data/wikidata/scripts/refresh.py
    python3 third_party/data/wikidata/scripts/refresh.py --query people-bridge
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = (
    "forgetmenot-wikidata-bridge/0.1 "
    "(https://github.com/danbri/forgetmenot; research)"
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
Q_DIR = ROOT / "queries"
D_DIR = ROOT / "data"


def wdqs(query: str, timeout: int = 90) -> dict:
    """One SPARQL request, with a single retry on 429 / 5xx."""
    body = urllib.parse.urlencode({"query": query}).encode()
    headers = {
        "Accept": "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
    }
    for attempt in range(2):
        req = urllib.request.Request(ENDPOINT, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt == 0:
                retry = int(exc.headers.get("Retry-After", "30"))
                # cap so a hostile-looking 1000s retry-after doesn't stall us
                wait = min(retry, 60)
                print(f"  wdqs {exc.code}; waiting {wait}s then retrying",
                      file=sys.stderr)
                time.sleep(wait)
                continue
            raise


def flatten_row(b: dict) -> dict:
    """Convert SPARQL JSON bindings to flat scalars."""
    return {k: v.get("value") for k, v in b.items()}


def write_jsonl(rows: list[dict], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")


# --- bridge -> Turtle ----------------------------------------------------

def _ttl_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def write_bridge_ttl(rows: list[dict], out_path: Path) -> int:
    """Per row in people-bridge, emit:
        <govuk-person-uri> owl:sameAs wd:Qxxxx ;
                           parl:memberId "1234"^^xsd:integer .
    """
    QID_PREFIX = "http://www.wikidata.org/entity/"
    lines = [
        "# Bridge triples produced by",
        "# third_party/data/wikidata/scripts/refresh.py",
        "# generated_at: " + datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "",
        "@prefix owl:   <http://www.w3.org/2002/07/owl#> .",
        "@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .",
        "@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix parl:  <https://id.parliament.uk/schema/> .",
        "@prefix wd:    <http://www.wikidata.org/entity/> .",
        "",
    ]
    n = 0
    for row in rows:
        qid = (row.get("person") or "").replace(QID_PREFIX, "wd:")
        slug = row.get("govukSlug")
        mid = row.get("parliamentId")
        label = row.get("personLabel") or ""
        if not (qid.startswith("wd:") and slug):
            continue
        govuk_uri = f"<https://www.gov.uk/government/people/{slug}>"
        lines.append(f"{govuk_uri}")
        lines.append(f'  owl:sameAs {qid} ;')
        if label:
            lines.append(f'  rdfs:label "{_ttl_escape(label)}"@en ;')
        if mid:
            lines.append(
                f'  parl:memberId "{mid}"^^xsd:integer .'
            )
        else:
            # close the BNode-free block cleanly
            lines[-1] = lines[-1].rstrip(" ;") + " ."
        lines.append("")
        n += 1
    out_path.write_text("\n".join(lines))
    return n


# --- driver --------------------------------------------------------------

def run_query(name: str, throttle: float) -> tuple[int, list[dict]]:
    qpath = Q_DIR / f"{name}.rq"
    if not qpath.exists():
        print(f"!! no query file: {qpath}", file=sys.stderr)
        return (0, [])
    query = qpath.read_text()
    print(f"-> {name}")
    t0 = time.time()
    result = wdqs(query)
    elapsed = time.time() - t0
    rows = [flatten_row(b) for b in result["results"]["bindings"]]
    out = D_DIR / f"{name}.jsonl"
    write_jsonl(rows, out)
    print(f"   {len(rows):6d} rows in {elapsed:5.1f}s -> {out.relative_to(ROOT.parent.parent.parent)}")
    time.sleep(throttle)
    return (len(rows), rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--query", action="append", default=None,
        help="run only the named query (stem of .rq filename); repeatable",
    )
    parser.add_argument(
        "--throttle", type=float, default=1.5,
        help="seconds to sleep between queries (default %(default)s)",
    )
    args = parser.parse_args(argv)

    # Queries beginning with `example-` document the merged-corpus workflow
    # and aren't meant to be run at WDQS (they reference URIs only present
    # after merging the bridge into the local gov.uk dataset).
    queries = sorted(
        p.stem for p in Q_DIR.glob("*.rq") if not p.stem.startswith("example-")
    )
    if args.query:
        wanted = set(args.query)
        queries = [q for q in queries if q in wanted]
    if not queries:
        print("no queries to run", file=sys.stderr); return 1

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "endpoint": ENDPOINT,
        "queries": {},
    }
    bridge_rows: list[dict] = []
    for q in queries:
        n, rows = run_query(q, args.throttle)
        summary["queries"][q] = n
        if q == "people-bridge":
            bridge_rows = rows

    if bridge_rows:
        ttl_path = D_DIR / "people-bridge.ttl"
        n_ttl = write_bridge_ttl(bridge_rows, ttl_path)
        print(f"-> wrote {n_ttl} owl:sameAs blocks -> {ttl_path.relative_to(ROOT.parent.parent.parent)}")
        summary["bridge_triples_emitted"] = n_ttl

    (D_DIR / "refreshed.json").write_text(json.dumps(summary, indent=2))
    print(f"\nrefresh complete: {sum(summary['queries'].values())} rows total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
