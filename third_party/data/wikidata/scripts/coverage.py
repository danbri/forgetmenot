#!/usr/bin/env python3
"""Report how well the Wikidata bridge covers our GOV.UK org-chart crawl.

For every gov.uk person slug we have an HTML page for, check whether
Wikidata's person-bridge has an entry. Conversely, list the bridge
entries pointing to people we DON'T have a page for. Prints a small
text summary; writes the joined data to
../data/coverage.json so other tools can consume it.

    python3 third_party/data/wikidata/scripts/coverage.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WD_DATA = HERE.parent / "data"
PAGES = Path("third_party/govuk/html/orgcharts/pages")


def crawled_slugs() -> set[str]:
    if not PAGES.exists():
        return set()
    out = set()
    for d in PAGES.iterdir():
        if d.is_dir() and d.name.startswith("government__people__"):
            slug = d.name[len("government__people__"):]
            # exclude .cy Welsh-language variants -- not a real person page
            if slug.endswith(".cy"):
                continue
            out.add(slug)
    return out


def bridge_slugs() -> dict[str, dict]:
    path = WD_DATA / "people-bridge.jsonl"
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    for line in path.open():
        r = json.loads(line)
        out[r["govukSlug"]] = r
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=str(WD_DATA / "coverage.json"))
    args = parser.parse_args(argv)

    crawled = crawled_slugs()
    bridge = bridge_slugs()

    in_both = crawled & set(bridge)
    only_crawled = crawled - set(bridge)
    only_bridge = set(bridge) - crawled

    summary = {
        "crawled_gov_uk_person_slugs": len(crawled),
        "wikidata_bridge_entries": len(bridge),
        "intersection": len(in_both),
        "crawled_without_wikidata_bridge": len(only_crawled),
        "wikidata_without_crawled_page": len(only_bridge),
        "intersection_sample": sorted(in_both)[:10],
        "crawled_without_bridge_sample": sorted(only_crawled)[:30],
        "wikidata_without_page_sample": sorted(only_bridge)[:10],
    }

    Path(args.out).write_text(json.dumps(summary, indent=2))

    print("GOV.UK org-chart crawl vs Wikidata bridge")
    print("-" * 50)
    print(f"  pages we crawled       : {len(crawled):5d}")
    print(f"  bridge entries on WD   : {len(bridge):5d}")
    print(f"  intersection           : {len(in_both):5d}  "
          f"({100*len(in_both)/max(len(crawled),1):4.1f}% of crawl)")
    print(f"  crawled, no WD bridge  : {len(only_crawled):5d}  "
          "(civil servants, NDPB chairs, advisers...)")
    print(f"  WD bridge, no page     : {len(only_bridge):5d}  "
          "(past MPs whose gov.uk pages aren't reachable from the current org chart)")
    print()
    print(f"sample of crawled-without-bridge (likely non-political appointees):")
    for s in summary["crawled_without_bridge_sample"][:10]:
        print(f"  {s}")
    print(f"\nfull summary written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
