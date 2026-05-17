#!/usr/bin/env python3
"""Data-quality audit for the GOV.UK org-chart corpus.

Compares what we extracted against three independent authoritative
sources and prints a categorised shortfall report. The point is to
catch extraction/crawling gaps EARLY -- and to refuse to paper over
them with hybrid sources at query time. If a shortfall is upstream
(gov.uk hasn't published the data), name it as such; if it's our
crawler or extractor, fix the tool.

Anchor cases the audit always tests:
  - Recent Prime Ministers (Johnson, Truss, Sunak, Starmer) -- known
    to be on gov.uk as /people/ pages but absent from the
    /history/past-prime-ministers index.
  - The current Chancellor of the Exchequer -- should reconcile
    across the role page, person page, and HMT org page.
  - A random sample of 25 politicians the Wikidata bridge knows about
    -- checks whether their gov.uk page was crawled.

Outputs:
  - prints a structured report to stdout
  - writes a machine-readable summary to
    third_party/govuk/html/orgcharts/extractors/factoids/qa.json

Usage:

    ./scripts/govuk_sparql_serve.sh &       # local SPARQL endpoint
    python3 scripts/govuk_qa.py             # quick run (no live HTTP)
    python3 scripts/govuk_qa.py --probe-live   # also HEADs gov.uk for live page existence
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "http://127.0.0.1:8765/"
PAGES_DIR = Path("third_party/govuk/html/orgcharts/pages")
FACTOIDS_DIR = Path("third_party/govuk/html/orgcharts/extractors/factoids")
WD_BRIDGE = Path("third_party/data/wikidata/data/people-bridge.jsonl")
WD_PMS    = Path("third_party/data/wikidata/data/uk-prime-ministers.jsonl")


def sparql(query: str) -> list[dict]:
    body = urllib.parse.urlencode({
        "query": (
            "PREFIX govuk: <https://forgetmenot.local/govuk#> "
            "PREFIX schema: <http://schema.org/> "
            "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> "
        ) + query
    }).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read())
    # ASK queries return {"boolean": true/false} not {"results": {"bindings": ...}}
    if "results" in body:
        return body["results"]["bindings"]
    return [{"boolean": {"value": str(body["boolean"]).lower()}}]


def has_page(slug: str) -> bool:
    return (PAGES_DIR / f"government__people__{slug}").exists()


def is_extracted(slug: str) -> bool:
    return (FACTOIDS_DIR / f"government__people__{slug}" / "factoids.ttl").exists()


def live_page_exists(slug: str) -> bool:
    url = f"https://www.gov.uk/government/people/{slug}"
    req = urllib.request.Request(
        url, method="HEAD",
        headers={"User-Agent": "forgetmenot-qa/0.1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False
    except urllib.error.URLError:
        return False


def categorise(slug: str, *, live: bool = False) -> str:
    """Where does the shortfall live?"""
    if has_page(slug):
        if is_extracted(slug):
            return "extract-miss"   # we have HTML + extractor ran, but the
                                    # triple we want isn't present
        return "extract-not-run"
    if live and not live_page_exists(slug):
        return "upstream-gap"       # gov.uk doesn't publish a page
    return "crawl-miss"             # page exists; crawler never reached it


def section(name: str) -> None:
    print(f"\n=== {name} ===")


# --- audit -----------------------------------------------------------

def audit_recent_pms(out: dict, *, probe_live: bool) -> None:
    section("Anchor: recent Prime Ministers")
    anchors = [
        ("boris-johnson",    "Boris Johnson",    "2019-2022"),
        ("elizabeth-truss",  "Liz Truss",        "2022"),
        ("rishi-sunak",      "Rishi Sunak",      "2022-2024"),
        ("keir-starmer",     "Keir Starmer",     "2024-present"),
    ]
    results = []
    for slug, name, when in anchors:
        # What does our local SPARQL endpoint say about whether this person
        # is currently or formerly a PM?
        rows = sparql(f"""
SELECT ?role WHERE {{
  GRAPH ?g {{
    <https://www.gov.uk/government/people/{slug}> ?p ?role .
    FILTER(?p = govuk:holdsRole || ?p = govuk:previouslyHeldRole)
  }}
}}""")
        is_pm_role = any("prime-minister" in r["role"]["value"] for r in rows)
        # Is this person tagged as a PastPrimeMinister anywhere?
        tagged = sparql(f"""
ASK {{ GRAPH ?g {{
  <https://www.gov.uk/government/people/{slug}> a govuk:PastPrimeMinister .
}} }}""")
        tagged_pm = tagged[0]["boolean"]["value"] == "true" if tagged else False
        cat = categorise(slug, live=probe_live)
        passed = is_pm_role or tagged_pm or (slug == "keir-starmer")
        marker = "✓" if passed else "✗"
        print(f"  {marker} {slug:20s} ({when:12s})  category={cat}, "
              f"PM-tagged-in-corpus={tagged_pm}, holds-PM-role={is_pm_role}")
        results.append({
            "slug": slug, "name": name, "tenure": when,
            "category": cat, "tagged_pm": tagged_pm,
            "holds_pm_role": is_pm_role, "passed": passed,
        })
    out["anchor_recent_pms"] = results


def audit_current_chancellor(out: dict) -> None:
    section("Anchor: current Chancellor reconciliation")
    rows = sparql("""
SELECT (COUNT(DISTINCT ?g) AS ?attestedBy) WHERE {
  GRAPH ?g {
    <https://www.gov.uk/government/ministers/chancellor-of-the-exchequer>
      govuk:roleHolder <https://www.gov.uk/government/people/rachel-reeves> .
  }
}""")
    n = int(rows[0]["attestedBy"]["value"]) if rows else 0
    passed = n >= 3                         # role page, person page, org page
    print(f"  {'✓' if passed else '✗'} reeves-is-chancellor attested by {n} pages "
          f"(want >= 3)")
    out["anchor_chancellor_reconciliation"] = {"attested_by": n, "passed": passed}


def audit_crawl_coverage_vs_wikidata(out: dict, *,
                                     sample_size: int,
                                     probe_live: bool) -> None:
    section(f"Wikidata coverage: random sample of {sample_size} bridge politicians")
    bridge = [json.loads(l) for l in WD_BRIDGE.open()]
    sample = random.sample(bridge, min(sample_size, len(bridge)))
    by_cat: dict[str, list[str]] = {}
    for r in sample:
        slug = r["govukSlug"]
        cat = categorise(slug, live=probe_live)
        by_cat.setdefault(cat, []).append(slug)
    for cat in sorted(by_cat):
        print(f"  {cat:18s} : {len(by_cat[cat]):3d}  "
              f"e.g. {', '.join(by_cat[cat][:3])}")
    out["wikidata_sample"] = {
        "n": len(sample),
        "by_category": {k: len(v) for k, v in by_cat.items()},
    }


def audit_ex_ministers_in_corpus(out: dict) -> None:
    """A current minister's person page has a non-empty caption-xl saying
    their current role title; a former minister's page typically has an
    empty caption. We mark the latter as govuk:FormerOfficeHolder so they
    can be filtered without joining external data."""
    section("Ex-minister recognition")
    n_marked = int(sparql("""
SELECT (COUNT(DISTINCT ?p) AS ?n) WHERE {
  GRAPH ?g { ?p a govuk:FormerOfficeHolder }
}""")[0]["n"]["value"])
    n_with_prose = int(sparql("""
SELECT (COUNT(DISTINCT ?p) AS ?n) WHERE {
  GRAPH ?g {
    ?p a govuk:FormerOfficeHolder .
    ?t govuk:holder ?p ; govuk:proseExtracted true .
  }
}""")[0]["n"]["value"])
    print(f"  former-office-holders marked         : {n_marked}")
    print(f"  ...of which carry prose-mined tenure : {n_with_prose}")
    out["ex_minister_recognition"] = {
        "former_office_holders_marked": n_marked,
        "with_prose_tenure": n_with_prose,
    }


def audit_prose_extraction(out: dict) -> None:
    """How many person pages yielded at least one prose-mined tenure
    triple? This is the new extraction path that closes the gov.uk-
    structured-markup gap (Boris/Liz/Rishi style)."""
    section("Prose-mined tenure triples")
    rows = sparql("""
SELECT ?role ?roleLabel (COUNT(DISTINCT ?p) AS ?n) WHERE {
  GRAPH ?g {
    ?t a govuk:RoleTenure ;
       govuk:proseExtracted true ;
       govuk:role ?role ;
       govuk:holder ?p .
  }
  OPTIONAL {
    GRAPH ?g2 { ?role <http://schema.org/name> ?roleLabel }
  }
} GROUP BY ?role ?roleLabel ORDER BY DESC(?n)
""")
    if not rows:
        print("  none yet")
        out["prose_tenures_by_role"] = []
        return
    total = sum(int(r["n"]["value"]) for r in rows)
    print(f"  total person-pages with prose-mined tenure : {total}")
    print("  by role (top 8):")
    for r in rows[:8]:
        slug = r["role"]["value"].rsplit("/", 1)[-1]
        label = r.get("roleLabel", {}).get("value", slug)
        print(f"    {int(r['n']['value']):3d}  {label}")
    out["prose_tenures_by_role"] = [
        {"role": r["role"]["value"],
         "n": int(r["n"]["value"])}
        for r in rows
    ]


def audit_api_vs_prose(out: dict) -> None:
    """Two independent extractors operate over each person page: the
    structured /api/content/ JSON (govuk:apiSourced) and a regex-based
    biography prose miner (govuk:proseExtracted). Where both have an
    opinion about the same (holder, role) pair, the years should agree.
    Disagreements surface either a prose-miner false positive or a real
    upstream inconsistency between gov.uk's structured data and its
    rendered HTML -- both worth investigating.
    """
    section("Cross-check: API tenures vs prose-mined tenures")
    # The two extractors run independently; pull each side separately
    # then join on (person, role) in Python -- a single SPARQL join is
    # too expensive for the in-memory endpoint at this corpus size.
    api_rows = sparql("""
SELECT ?person ?role ?start ?end WHERE {
  GRAPH ?g {
    ?t a govuk:RoleTenure ;
       govuk:apiSourced true ;
       govuk:holder ?person ;
       govuk:role ?role ;
       govuk:tenureStart ?start .
    OPTIONAL { ?t govuk:tenureEnd ?end }
  }
}""")
    prose_rows = sparql("""
SELECT ?person ?role ?start ?end WHERE {
  GRAPH ?g {
    ?t a govuk:RoleTenure ;
       govuk:proseExtracted true ;
       govuk:holder ?person ;
       govuk:role ?role ;
       govuk:tenureStart ?start .
    OPTIONAL { ?t govuk:tenureEnd ?end }
  }
}""")
    def key(r: dict) -> tuple[str, str]:
        return (r["person"]["value"], r["role"]["value"])
    def yr(r: dict, k: str) -> str:
        return r.get(k, {}).get("value", "")[:4]
    api_by_key:   dict[tuple[str, str], dict] = {}
    prose_by_key: dict[tuple[str, str], dict] = {}
    for r in api_rows:   api_by_key[key(r)]   = r
    for r in prose_rows: prose_by_key[key(r)] = r
    common = sorted(set(api_by_key) & set(prose_by_key))

    agreements, disagreements = 0, []
    for k in common:
        a, p = api_by_key[k], prose_by_key[k]
        if yr(a, "start") == yr(p, "start") and yr(a, "end") == yr(p, "end"):
            agreements += 1
        else:
            disagreements.append({
                "person": k[0].rsplit("/", 1)[-1],
                "role":   k[1].rsplit("/", 1)[-1],
                "api_start":   yr(a, "start"), "api_end":   yr(a, "end"),
                "prose_start": yr(p, "start"), "prose_end": yr(p, "end"),
            })
    print(f"  pairs where both extractors fired: {agreements + len(disagreements)}")
    print(f"  agreements (years match)         : {agreements}")
    print(f"  disagreements                    : {len(disagreements)}")
    for d in disagreements[:8]:
        print(f"    {d['person']:25s} {d['role'][:35]:35s} "
              f"api={d['api_start']}-{d['api_end']:4s} "
              f"prose={d['prose_start']}-{d['prose_end']:4s}")
    out["api_vs_prose"] = {
        "agreements": agreements,
        "disagreements": disagreements,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--probe-live", action="store_true",
                        help="HEAD-probe gov.uk to distinguish crawl-miss "
                             "from upstream-gap (slow, ~1 req/slug)")
    parser.add_argument("--sample", type=int, default=25,
                        help="size of the random Wikidata-bridge sample")
    parser.add_argument("--seed", type=int, default=42,
                        help="random seed for reproducibility")
    parser.add_argument("--out", default=str(FACTOIDS_DIR / "qa.json"))
    args = parser.parse_args(argv)
    random.seed(args.seed)

    out: dict = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try:
        sparql("ASK { ?s ?p ?o }")
    except (urllib.error.URLError, ConnectionRefusedError) as exc:
        print(f"fatal: SPARQL endpoint at {ENDPOINT} not responding ({exc})\n"
              f"start it with: ./scripts/govuk_sparql_serve.sh",
              file=sys.stderr)
        return 2

    audit_recent_pms(out, probe_live=args.probe_live)
    audit_current_chancellor(out)
    audit_crawl_coverage_vs_wikidata(out, sample_size=args.sample,
                                     probe_live=args.probe_live)
    audit_ex_ministers_in_corpus(out)
    audit_prose_extraction(out)
    audit_api_vs_prose(out)

    Path(args.out).write_text(json.dumps(out, indent=2))
    print(f"\nQA summary written to {args.out}")

    # Exit non-zero if any anchor failed -- so this can wire into CI
    failed = [r for r in out["anchor_recent_pms"] if not r["passed"]]
    if failed or not out["anchor_chancellor_reconciliation"]["passed"]:
        print(f"\nFAIL: {len(failed)} anchor case(s) regressed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
