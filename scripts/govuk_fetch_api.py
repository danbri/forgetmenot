#!/usr/bin/env python3
"""Fetch the structured /api/content/<path> JSON alongside each HTML page.

GOV.UK renders every public page from a stable JSON document served at
`https://www.gov.uk/api/content/<same path>`. Person pages carry a
`links.role_appointments` array with day-level start/end dates and an
explicit `current` boolean for each post -- a far stronger signal than
the HTML's brittle `caption-xl` class. Org pages carry analogous
`links.ministers`, `links.organisation_govuk_status`, etc.

This script walks `third_party/govuk/html/orgcharts/pages/<slug>/` and
fetches the matching api.json next to each page.html. It is idempotent
(skips slugs that already have an api.json unless --refresh).

    python3 scripts/govuk_fetch_api.py                # all crawled pages
    python3 scripts/govuk_fetch_api.py --workers 8
    python3 scripts/govuk_fetch_api.py --only government__people__boris-johnson
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

PAGES_DIR = Path("third_party/govuk/html/orgcharts/pages")
USER_AGENT = (
    "forgetmenot-govuk-api/0.1 "
    "(+https://github.com/danbri/forgetmenot; research)"
)


def page_url(page_dir: Path) -> str | None:
    fetch = page_dir / "fetch.json"
    if not fetch.exists():
        return None
    try:
        d = json.loads(fetch.read_text())
        return d.get("final_url") or d.get("url")
    except json.JSONDecodeError:
        return None


def api_url_for(page: str) -> str:
    path = urllib.parse.urlsplit(page).path
    return f"https://www.gov.uk/api/content{path}"


def fetch_one(page_dir: Path, refresh: bool, delay: float) -> str:
    api_path = page_dir / "api.json"
    if api_path.exists() and not refresh:
        return "cached"
    page = page_url(page_dir)
    if not page:
        return "no-fetch-json"
    url = api_url_for(page)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                                "Accept": "application/json"})
    try:
        time.sleep(delay)
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except urllib.request.HTTPError as exc:
        # 404 means the page has no Content-API equivalent; record it so we
        # don't keep retrying on the next run.
        if exc.code == 404:
            api_path.write_text(json.dumps(
                {"_forgetmenot_status": 404, "_url": url}
            ))
            return "404"
        return f"http-{exc.code}"
    except Exception as exc:  # noqa: BLE001
        return f"error:{exc!r}"
    # Validate it's JSON before writing.
    try:
        json.loads(body)
    except json.JSONDecodeError:
        return "not-json"
    api_path.write_bytes(body)
    return "fetched"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--delay", type=float, default=0.3)
    parser.add_argument("--only", action="append", default=None)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument(
        "--kinds", nargs="*",
        default=["government__people__", "government__organisations__",
                 "government__ministers__",
                 "government__history__past-prime-ministers__"],
        help="page-dir prefixes to fetch (default: people/orgs/ministers/history)",
    )
    args = parser.parse_args(argv)

    page_dirs = [p for p in PAGES_DIR.iterdir()
                 if p.is_dir() and any(p.name.startswith(k) for k in args.kinds)
                 and not p.name.endswith(".cy")]
    if args.only:
        wanted = set(args.only)
        page_dirs = [p for p in page_dirs if p.name in wanted]
    page_dirs.sort()

    counts: dict[str, int] = {}
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(fetch_one, p, args.refresh, args.delay): p.name
                for p in page_dirs}
        for i, fut in enumerate(futures.as_completed(futs), 1):
            name = futs[fut]
            status = fut.result()
            counts[status] = counts.get(status, 0) + 1
            if i % 50 == 0 or status not in ("cached", "fetched"):
                print(f"  [{i:4d}/{len(page_dirs)}] {status:14s} {name}",
                      file=sys.stderr)

    print(f"\nfetched API JSON for {len(page_dirs)} page dirs:")
    for s, n in sorted(counts.items()): print(f"  {s:14s} {n:5d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
