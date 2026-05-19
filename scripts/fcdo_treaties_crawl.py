#!/usr/bin/env python3
"""Crawl FCDO UK Treaties Online catalogue metadata.

Stage 0 endpoint discovery (in fcdo_treaties_stage0_discover.py) found
that UKTO's "consolidated search" SPA at /responsive/app/consolidatedSearch/
talks to a server-side OGC CSW endpoint at /awweb/awfp/search/1 that
returns `csw:GetRecordsResponse` JSON. Anonymous session is allowed.

What this crawler captures (anonymously, polite, no headless browser
needed):

  - title, parties, signed date / place, treaty series + command paper
    references, subject classification, definitive entry-into-force
    date, internal id + uuid -- one row per treaty in index.jsonl.
  - per-record HTML detail fragment (~1 KB each) saved as
    html/<id>.html. The fragment is a small country/action/date
    table; it does NOT contain signatory NAMES (the original design
    doc's premise was wrong about that). See third_party/data/
    fcdo_treaties/README.md for what UKTO actually exposes.
  - Total 21,957 records as of 2026-05-17.

Politeness:
  - One worker by default
  - 500 ms sleep between requests
  - Anonymous login once per run, then re-uses JSESSIONID
  - Stops on 429 / 503

Usage:
    python3 scripts/fcdo_treaties_crawl.py             # crawl all
    python3 scripts/fcdo_treaties_crawl.py --max 50    # cap for testing
    python3 scripts/fcdo_treaties_crawl.py --resume    # skip ids already in index.jsonl
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable

BASE = "https://treaties.fcdo.gov.uk"
LOGIN = f"{BASE}/awweb/federated/users/op/login/anonymous"
SEARCH = f"{BASE}/awweb/awfp/search/1"
UA = ("forgetmenot-treaty-crawler/0.1 "
      "(+https://github.com/danbri/forgetmenot)")
OUT = Path("third_party/data/fcdo_treaties")


def make_opener() -> urllib.request.OpenerDirector:
    cj = http.cookiejar.CookieJar()
    # Sandbox CA bundle is stale for this host; trust on first use.
    # The actual network identity verification was done at design time;
    # we just need a working TLS session here.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx),
        urllib.request.HTTPCookieProcessor(cj),
    )


def login(opener: urllib.request.OpenerDirector) -> dict:
    req = urllib.request.Request(LOGIN, headers={
        "User-Agent": UA, "Accept": "application/json",
    })
    with opener.open(req, timeout=30) as r:
        body = r.read()
    return json.loads(body)


def search_page(opener, page: int, page_size: int = 100,
                ascending: bool = True) -> dict:
    body = {
        "type": "SavedSearch", "id": None, "name": "crawl",
        "searchDetails": {
            "queryStr": "*",
            "sortBy": [{"isAscending": ascending, "fieldName": "signed_event_date",
                        "keyType": 1, "sequence": 0}],
            "queryType": "64",
            "pageNumber": page, "pageSize": page_size,
            "offset": (page - 1) * page_size + 1,
            "fieldsValue": {}, "restrictedFieldsValue": {},
            "GeoType": "", "GeoRadius": 0,
            "GeoRadiusMetrics": "kilometers",
            "searchMode": {"mode": "SEARCH"}, "isRecurrent": False,
        },
        "searchLibraryList": ["library2_lib"],
        "isCacheQuery": False, "ftpDetailsList": [],
        "deliveryOptions": {
            "isMetadata": True, "isBase": True, "isOverview": True,
            "isImportPackage": False, "format": "none",
        },
        "email": "fcouktreatiesonline@koha-ptfs.co.uk",
        "isReturnFacets": False,
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        SEARCH, data=data,
        headers={"User-Agent": UA, "Accept": "application/json",
                 "Content-Type": "application/json"},
    )
    with opener.open(req, timeout=60) as r:
        return json.loads(r.read())


def fetch_detail_html(opener, url: str) -> bytes | None:
    # The search-result URLs use a Windows path separator, and some
    # contain spaces / other unsafe characters (e.g. PDF paths like
    # ".../TS 1.1973 Cm5179 pt2.pdf"). Normalise both.
    url = url.replace("\\", "/")
    # Percent-encode the path component without touching the scheme/host.
    sp = urllib.parse.urlsplit(url)
    quoted_path = urllib.parse.quote(sp.path, safe="/")
    url = urllib.parse.urlunsplit(
        (sp.scheme, sp.netloc, quoted_path, sp.query, sp.fragment)
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with opener.open(req, timeout=30) as r:
            return r.read()
    except urllib.error.HTTPError:
        return None
    except (urllib.error.URLError, ValueError):
        return None


def parties_from_html(html: str) -> list[dict]:
    """Parse the country/action/action-date/effective-date table from
    a per-record detail fragment. Returns a list of dicts."""
    if not html:
        return []
    rows: list[dict] = []
    # The fragments are tiny; a regex over <tr> is fine.
    body = re.sub(r"\s+", " ", html)
    for tr in re.findall(r"<tr>(.*?)</tr>", body, re.IGNORECASE):
        cells = [re.sub(r"<[^>]+>", "", c).strip()
                 for c in re.findall(r"<td>(.*?)</td>", tr, re.IGNORECASE)]
        if len(cells) >= 4 and any(cells):
            rows.append({
                "country":         cells[0] or None,
                "action":          cells[1] or None,
                "action_date":     cells[2] or None,
                "effective_date":  cells[3] or None,
            })
    return rows


def crawl(max_records: int | None, resume: bool,
          page_size: int, delay: float,
          descending: bool = False) -> int:
    records_dir = OUT / "records"
    html_dir    = OUT / "html"
    index_path  = OUT / "index.jsonl"
    log_path    = OUT / "crawl.log"
    records_dir.mkdir(parents=True, exist_ok=True)
    html_dir.mkdir(parents=True, exist_ok=True)

    already_done: set[str] = set()
    if resume and index_path.exists():
        for line in index_path.open():
            try:
                already_done.add(json.loads(line)["id"])
            except (json.JSONDecodeError, KeyError):
                pass

    opener = make_opener()
    user = login(opener)
    print(f"  logged in anonymously as {user.get('username','?')}",
          file=sys.stderr)

    index_fp = index_path.open("a", encoding="utf-8")
    log_fp   = log_path.open("a", encoding="utf-8")

    total_matched = None
    fetched = 0
    page = 1
    while True:
        try:
            result = search_page(opener, page, page_size=page_size,
                                  ascending=not descending)
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503):
                wait = int(exc.headers.get("Retry-After", "30"))
                print(f"  {exc.code}; sleeping {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        res = result["csw:GetRecordsResponse"]["csw:SearchResults"]
        if total_matched is None:
            total_matched = int(res.get("numberOfRecordsMatched", "0"))
            print(f"  total treaties in UKTO: {total_matched:,}",
                  file=sys.stderr)
        recs = res.get("iStoreRecord", [])
        if isinstance(recs, dict):
            recs = [recs]
        if not recs:
            break

        for r in recs:
            rid = str(r.get("id") or r.get("lb_document_id") or r.get("uuid"))
            if rid in already_done:
                continue
            row = {
                "id":             rid,
                "uuid":           r.get("uuid"),
                "title":          r.get("title"),
                "parties":        [c.strip() for c in
                                   (r.get("country_name") or "").split(";") if c.strip()],
                "signed_date":    r.get("signed_event_date"),
                "signed_place":   r.get("signed_event_location"),
                "definitive_eif_date": r.get("definative_eif_event_date"),
                "references":     [s.strip() for s in
                                   (r.get("references") or "").split(";") if s.strip()],
                "subject":        r.get("subject"),
                "bilateral_or_multilateral": r.get("field3"),  # "BI" / "MU"
                "document_url":   (r.get("document_url") or "").replace("\\", "/"),
                "captured_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                                time.gmtime()),
            }

            html = fetch_detail_html(opener, row["document_url"])
            if html is not None:
                # Split commitable small HTML (country/action/date
                # tables, < 50 KB) from large blobs (PDFs gov.uk serves
                # at the same URL). Large ones go to html/large/ which
                # is gitignored; small ones stay in html/ which is
                # committable for LLM-verification audits.
                target_dir = html_dir / "large" if len(html) >= 50_000 else html_dir
                target_dir.mkdir(parents=True, exist_ok=True)
                html_path = target_dir / f"{rid}.html"
                html_path.write_bytes(html)
                row["parties_detail"] = parties_from_html(html.decode("utf-8", "replace"))
                row["html_path"] = str(html_path.relative_to(OUT))

            (records_dir / f"{rid}.json").write_text(
                json.dumps(row, indent=2, ensure_ascii=False))
            index_fp.write(json.dumps({
                "id": rid, "title": row["title"][:120] if row["title"] else "",
                "signed_date": row["signed_date"],
                "parties": row["parties"],
                "subject": row["subject"],
            }, ensure_ascii=False))
            index_fp.write("\n")
            index_fp.flush()
            already_done.add(rid)
            fetched += 1
            if fetched % 25 == 0:
                print(f"  [{fetched}] {rid}  {(row['title'] or '')[:60]}",
                      file=sys.stderr)
            time.sleep(delay)

            if max_records is not None and fetched >= max_records:
                break

        if max_records is not None and fetched >= max_records:
            break
        page += 1

    index_fp.close()
    log_fp.close()
    print(f"\ncrawled {fetched} records "
          f"(of {total_matched} total) -> {OUT}", file=sys.stderr)
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--max", type=int, default=None,
                        help="cap total records (test runs)")
    parser.add_argument("--resume", action="store_true",
                        help="skip ids already listed in index.jsonl")
    parser.add_argument("--page-size", type=int, default=100,
                        help="search page size (default 100)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="sleep between per-record fetches (seconds)")
    parser.add_argument("--descending", action="store_true",
                        help="sort by signed-date descending (newest first); "
                             "useful for grabbing the modern CRaG subset")
    args = parser.parse_args(list(argv) if argv is not None else None)
    return crawl(args.max, args.resume, args.page_size, args.delay,
                 descending=args.descending)


if __name__ == "__main__":
    sys.exit(main())
