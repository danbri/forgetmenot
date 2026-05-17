#!/usr/bin/env python3
"""Fetch one or more legislation.gov.uk URIs as RDF/XML and convert to
Turtle on disk. No SPARQL endpoint required -- uses per-URI content
negotiation, which is public.

Two modes:

    # Single URI by slug
    python3 fetch_rdf.py ukpga/2024/22 [more/slugs ...]

    # Crawl an Atom feed (default: new UK Public General Acts) and
    # fetch the first N entries
    python3 fetch_rdf.py --feed https://www.legislation.gov.uk/new/ukpga/data.feed --max 20

Output goes to --out <dir> (default: third_party/data/tna_legislation/).
Each Act becomes <type>__<year>__<number>.ttl plus a sibling .rdf
holding the original RDF/XML, plus fetch.json with HTTP metadata.

Polite: User-Agent identifies the project, 1 req/sec by default,
retries 5xx once.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "https://www.legislation.gov.uk"
UA = ("forgetmenot-tna-legislation/0.1 "
      "(+https://github.com/danbri/forgetmenot; research)")


def canonical_url(slug_or_url: str) -> str:
    if slug_or_url.startswith("http"):
        return slug_or_url
    return f"{BASE}/{slug_or_url.lstrip('/')}"


def slug_for(url: str) -> str:
    path = urllib.parse.urlsplit(url).path.strip("/")
    return re.sub(r"[^A-Za-z0-9._-]", "__", path)


def fetch(url: str, accept: str, retries: int = 1) -> tuple[bytes, dict]:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": accept},
    )
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
                meta = {
                    "url": url,
                    "final_url": r.url,
                    "status": r.status,
                    "content_type": r.headers.get("Content-Type", ""),
                    "etag": r.headers.get("ETag"),
                    "last_modified": r.headers.get("Last-Modified"),
                    "bytes": len(body),
                    "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                                time.gmtime()),
                }
                return body, meta
        except urllib.error.HTTPError as exc:
            if exc.code >= 500 and attempt < retries:
                time.sleep(2)
                continue
            raise


def to_ttl(rdf_xml: bytes, base: str) -> str:
    """RDF/XML → Turtle via rdflib if available, else the raw RDF/XML."""
    try:
        import rdflib
    except ImportError:
        sys.stderr.write("rdflib not installed; saving RDF/XML only\n")
        return ""
    g = rdflib.Graph()
    g.parse(data=rdf_xml, format="xml", publicID=base)
    return g.serialize(format="turtle")


def feed_entries(feed_url: str) -> list[str]:
    body, _ = fetch(feed_url, "application/atom+xml")
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(body)
    out = []
    for entry in root.findall("atom:entry", ns):
        eid = entry.find("atom:id", ns)
        if eid is not None and eid.text:
            out.append(eid.text.strip())
    return out


def fetch_one(url: str, out_dir: Path, delay: float) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = slug_for(url)
    rdf_path = out_dir / f"{slug}.rdf"
    ttl_path = out_dir / f"{slug}.ttl"
    meta_path = out_dir / f"{slug}.fetch.json"

    time.sleep(delay)
    rdf_xml, meta = fetch(url, "application/rdf+xml")
    rdf_path.write_bytes(rdf_xml)
    ttl = to_ttl(rdf_xml, url)
    if ttl:
        ttl_path.write_text(ttl)
        meta["ttl_bytes"] = len(ttl)
    meta_path.write_text(json.dumps(meta, indent=2))
    return meta


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("slugs", nargs="*",
                        help="URI slugs (e.g. ukpga/2024/22) or full URLs")
    parser.add_argument(
        "--feed",
        help="Atom feed URL to crawl in place of explicit slugs "
             "(e.g. https://www.legislation.gov.uk/new/ukpga/data.feed)",
    )
    parser.add_argument("--max", type=int, default=20,
                        help="cap when --feed is used (default 20)")
    parser.add_argument("--out", default="third_party/data/tna_legislation",
                        help="output directory")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="per-fetch sleep, seconds (default 1.0)")
    args = parser.parse_args(argv)

    targets: list[str] = []
    if args.feed:
        targets.extend(feed_entries(args.feed)[: args.max])
    targets.extend(canonical_url(s) for s in args.slugs)
    if not targets:
        parser.error("provide URI slugs or --feed")

    out_dir = Path(args.out)
    ok = err = 0
    for i, url in enumerate(targets, 1):
        try:
            fetch_one(url, out_dir, args.delay)
            ok += 1
            print(f"  [{i:3d}/{len(targets)}] ok  {url}",
                  file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            err += 1
            print(f"  [{i:3d}/{len(targets)}] ERR {url} -- {exc!r}",
                  file=sys.stderr)
    print(f"\nfetched {ok}, errored {err} -> {out_dir}")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
