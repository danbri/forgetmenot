#!/usr/bin/env python3
"""Stage-0 endpoint discovery for FCDO UK Treaties Online.

Drives the Backbone SPA at /responsive/app/consolidatedSearch/ with
a headless Chromium, records every XHR / fetch request, and dumps
the URL list plus a sample of each endpoint's response to
endpoints.json. The crawler in crawl.py then hits those endpoints
directly.

    python3 stage0_discover.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

OUT = Path("third_party/data/fcdo_treaties/endpoints.json")
SPA = "https://treaties.fcdo.gov.uk/responsive/app/consolidatedSearch/"
UA = ("forgetmenot-treaty-crawler/0.1 "
      "(+https://github.com/danbri/forgetmenot)")


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("install: pip install playwright && playwright install chromium")

    requests: list[dict] = []
    responses: dict[str, dict] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=UA,
            # Sandbox lacks fresh root CAs; accept any cert. The real
            # crawl runs against the same site, so anything we discover
            # via Playwright matches what urllib will see (with cert
            # verification re-enabled if the cert chain is OK there).
            ignore_https_errors=True,
        )
        page = context.new_page()

        def on_request(req):
            if req.resource_type in ("xhr", "fetch"):
                requests.append({
                    "url": req.url,
                    "method": req.method,
                    "resource_type": req.resource_type,
                    "headers": dict(req.headers),
                    "post_data": req.post_data,
                })

        def on_response(resp):
            if resp.request.resource_type in ("xhr", "fetch"):
                url = resp.url
                if url not in responses:
                    try:
                        body = resp.text()
                    except Exception:  # noqa: BLE001
                        body = ""
                    responses[url] = {
                        "status": resp.status,
                        "content_type": resp.headers.get("content-type", ""),
                        "body_preview": body[:1500],
                    }

        page.on("request", on_request)
        page.on("response", on_response)

        print(f"loading {SPA}", file=sys.stderr)
        page.goto(SPA, timeout=60000, wait_until="networkidle")

        print(f"  waiting for SPA to settle (5s)...", file=sys.stderr)
        page.wait_for_timeout(5000)

        # If a search input is present, type * and submit -- a common
        # way to list everything in Knowvation.
        try:
            for sel in ['input[type="search"]',
                        'input[name="search"]',
                        'input.search-box']:
                el = page.query_selector(sel)
                if el:
                    el.fill("*")
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(4000)
                    print(f"  triggered search via {sel}", file=sys.stderr)
                    break
        except Exception as exc:  # noqa: BLE001
            print(f"  search trigger failed: {exc!r}", file=sys.stderr)

        # Try clicking the first result if any
        try:
            page.wait_for_timeout(2000)
        except Exception:  # noqa: BLE001
            pass

        browser.close()

    # Group requests by hostname + path-prefix to give a clean endpoint map
    by_path: dict[str, list[dict]] = {}
    for r in requests:
        from urllib.parse import urlsplit
        path = urlsplit(r["url"]).path
        # collapse query params for grouping
        by_path.setdefault(path, []).append(r)

    summary = {
        "discovered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "spa_url": SPA,
        "total_requests": len(requests),
        "distinct_paths": len(by_path),
        "endpoints": [
            {
                "path": path,
                "method": calls[0]["method"],
                "n_calls": len(calls),
                "example_url": calls[0]["url"],
                "post_data": calls[0]["post_data"],
                "response_status": responses.get(
                    calls[0]["url"], {}).get("status"),
                "response_content_type": responses.get(
                    calls[0]["url"], {}).get("content_type"),
                "response_preview": responses.get(
                    calls[0]["url"], {}).get("body_preview", "")[:400],
            }
            for path, calls in sorted(by_path.items())
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, indent=2))
    print(f"wrote {OUT}: {len(requests)} requests across "
          f"{len(by_path)} distinct paths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
