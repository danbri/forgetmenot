#!/usr/bin/env python3
"""Extract RDFa, JSON-LD, and microdata triples from crawled GOV.UK pages.

For each page under

    third_party/govuk/html/orgcharts/pages/<slug>/page.html

this writes

    third_party/govuk/html/orgcharts/extractors/triples/<slug>/
        jsonld.nt        N-Triples emitted by every <script type="application/ld+json">
        rdfa.nt          N-Triples emitted by pyRdfa, with Open Graph prefixes injected
        microdata.nt     N-Triples emitted from itemscope / itemprop / itemtype
        triples.nq       all of the above, as N-Quads, named by format graph
        extract.json     small summary (counts per format, errors)

A combined summary lands at

    third_party/govuk/html/orgcharts/extractors/triples/_index.json

Usage:

    python3 scripts/govuk_extract_triples.py
    python3 scripts/govuk_extract_triples.py --workers 8
    python3 scripts/govuk_extract_triples.py --only government__people__rachel-reeves
    python3 scripts/govuk_extract_triples.py --refresh         # redo everything
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import io
import json
import logging
import re
import sys
import warnings
from pathlib import Path
from typing import Iterable

import rdflib
from bs4 import BeautifulSoup, Tag

# pyRdfa is chatty about HTML5 features; rdflib warns about each URI it
# doesn't like (we drop those triples below anyway). We don't need that
# noise on stderr while extracting hundreds of pages.
warnings.filterwarnings("ignore")
logging.getLogger("pyRdfa").setLevel(logging.ERROR)
logging.getLogger("html5lib").setLevel(logging.ERROR)
logging.getLogger("rdflib").setLevel(logging.ERROR)
logging.getLogger("rdflib.term").setLevel(logging.ERROR)

from pyRdfa import Options, pyRdfa  # noqa: E402


# Open Graph / Twitter Cards are widely used via bare `property="og:..."`
# attributes with no RDFa prefix declaration. The OGP spec defines the
# expected prefix bindings, so we inject them so pyRdfa can resolve them.
OG_PREFIX = " ".join([
    "og: http://ogp.me/ns#",
    "article: http://ogp.me/ns/article#",
    "book: http://ogp.me/ns/book#",
    "profile: http://ogp.me/ns/profile#",
    "video: http://ogp.me/ns/video#",
    "music: http://ogp.me/ns/music#",
    "fb: http://ogp.me/ns/fb#",
    "twitter: https://dev.twitter.com/cards#",
])

NS_FORMAT = {
    "jsonld":    rdflib.URIRef("https://forgetmenot.local/extractor/jsonld"),
    "rdfa":      rdflib.URIRef("https://forgetmenot.local/extractor/rdfa"),
    "microdata": rdflib.URIRef("https://forgetmenot.local/extractor/microdata"),
}


_BAD_URI_CHARS = re.compile(r"[\s<>\"{}|\\^`]")


def _clean_graph(g: rdflib.Graph) -> tuple[rdflib.Graph, int]:
    """Drop triples whose URIs would break N-Triples serialization.

    GOV.UK ships OpenSearch URL templates with literal `{query}`
    placeholders in <link href=...>; rdflib refuses to serialize those.
    Easier to drop the offending triples than escape them.
    """
    out = rdflib.Graph()
    dropped = 0
    for t in g:
        bad = False
        for term in t:
            if isinstance(term, rdflib.URIRef) and _BAD_URI_CHARS.search(str(term)):
                bad = True
                break
        if bad:
            dropped += 1
            continue
        out.add(t)
    return out, dropped


# --- JSON-LD ------------------------------------------------------------

def extract_jsonld(soup: BeautifulSoup, base: str) -> tuple[rdflib.Graph, list[str]]:
    g = rdflib.Graph()
    errors: list[str] = []
    for i, script in enumerate(soup.find_all("script", type=re.compile(r"ld\+json"))):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        # Some sites embed multiple JSON-LD objects in a JSON array; some
        # do invalid JSON with HTML comments. Be tolerant.
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            errors.append(f"jsonld[{i}] json: {exc}")
            continue
        try:
            g.parse(
                data=json.dumps(parsed),
                format="json-ld",
                base=base,
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"jsonld[{i}] rdf: {exc}")
    return g, errors


# --- RDFa (incl. Open Graph) --------------------------------------------

_PREFIX_INJECT_RE = re.compile(r"<html\b([^>]*)>", re.IGNORECASE)


def _inject_og_prefix(html: str) -> str:
    """Add prefix="og: ..." to <html> so pyRdfa resolves Open Graph CURIEs."""
    def repl(m: re.Match[str]) -> str:
        attrs = m.group(1)
        if re.search(r"\bprefix\s*=", attrs, re.IGNORECASE):
            # Already has a prefix; append ours so existing bindings win.
            attrs = re.sub(
                r'(prefix\s*=\s*")([^"]*)"',
                lambda mm: f'{mm.group(1)}{mm.group(2)} {OG_PREFIX}"',
                attrs,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            attrs += f' prefix="{OG_PREFIX}"'
        return f"<html{attrs}>"

    new, n = _PREFIX_INJECT_RE.subn(repl, html, count=1)
    return new if n else html


def extract_rdfa(html: str, base: str) -> tuple[rdflib.Graph, list[str]]:
    errors: list[str] = []
    try:
        opts = Options(output_default_graph=True, output_processor_graph=False)
        # media_type='text/html' is required so pyRdfa uses the HTML5 host
        # language and processes <meta property="..."> in <head>.
        proc = pyRdfa(options=opts, base=base, media_type="text/html")
        g = proc.graph_from_source(io.StringIO(_inject_og_prefix(html)))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"rdfa: {exc}")
        g = rdflib.Graph()
    return g, errors


# --- Microdata ---------------------------------------------------------
# Simplified implementation of the W3C microdata-to-RDF algorithm
# (https://www.w3.org/TR/microdata-rdf/). Good enough for the small
# amount of microdata GOV.UK pages emit; not a conformance implementation.

XSD = rdflib.namespace.XSD


def _resolve_property(prop: str, types: list[str]) -> rdflib.URIRef:
    if re.match(r"^[a-z][a-z0-9+.-]*:", prop, re.IGNORECASE):
        return rdflib.URIRef(prop)
    if types:
        t = types[0]
        sep = "" if t.endswith(("#", "/")) else (
            "" if re.search(r"[#/]$", t) else
            "#" if "#" in t else "/"
        )
        return rdflib.URIRef(f"{t.rstrip('#/')}/{prop}")
    return rdflib.URIRef(
        f"http://www.w3.org/1999/xhtml/microdata#{prop}"
    )


def _itemprop_value(el: Tag, base: str) -> tuple[rdflib.term.Identifier, str | None]:
    tag = el.name.lower()
    if el.has_attr("itemscope"):
        return rdflib.BNode(), None  # caller swaps in real subject
    if tag in ("a", "area", "link"):
        href = el.get("href") or ""
        return rdflib.URIRef(rdflib.URIRef(href if "://" in href else
                                            rdflib.URIRef(href))), None
    if tag in ("audio", "embed", "iframe", "img", "source", "track", "video"):
        src = el.get("src") or ""
        return rdflib.URIRef(src), None
    if tag == "object":
        data = el.get("data") or ""
        return rdflib.URIRef(data), None
    if tag == "data":
        return rdflib.Literal(el.get("value") or ""), None
    if tag == "meter":
        try:
            return rdflib.Literal(float(el.get("value") or "")), None
        except ValueError:
            return rdflib.Literal(el.get("value") or ""), None
    if tag == "time":
        v = el.get("datetime") or el.get_text(strip=True)
        return rdflib.Literal(v), None
    if el.has_attr("content"):
        return rdflib.Literal(el["content"]), None
    return rdflib.Literal(el.get_text(strip=True)), None


def _microdata_items(soup: BeautifulSoup) -> list[Tag]:
    """Top-level itemscope elements (no enclosing itemscope ancestor)."""
    out: list[Tag] = []
    for el in soup.find_all(attrs={"itemscope": True}):
        parent = el.parent
        while parent is not None:
            if isinstance(parent, Tag) and parent.has_attr("itemscope"):
                break
            parent = parent.parent
        else:
            out.append(el)
    return out


def _process_item(item: Tag, g: rdflib.Graph, base: str) -> rdflib.term.Identifier:
    itemid = item.get("itemid")
    subject: rdflib.term.Identifier
    if itemid:
        subject = rdflib.URIRef(itemid)
    else:
        subject = rdflib.BNode()
    types = [t for t in (item.get("itemtype") or "").split() if t]
    for t in types:
        g.add((subject, rdflib.RDF.type, rdflib.URIRef(t)))

    # Properties: descendants whose itemprop is within this item's
    # property scope (i.e. not inside a nested itemscope first).
    for prop_el in _props_of(item):
        props = (prop_el.get("itemprop") or "").split()
        if prop_el.has_attr("itemscope"):
            value = _process_item(prop_el, g, base)
        else:
            value, _ = _itemprop_value(prop_el, base)
            if isinstance(value, rdflib.URIRef):
                # Resolve relative href/src against base.
                try:
                    import urllib.parse
                    value = rdflib.URIRef(urllib.parse.urljoin(base, str(value)))
                except Exception:  # noqa: BLE001
                    pass
        for name in props:
            pred = _resolve_property(name, types)
            g.add((subject, pred, value))
    return subject


def _props_of(item: Tag) -> list[Tag]:
    """Direct itemprop descendants, stopping at nested itemscope boundaries."""
    found: list[Tag] = []
    stack: list[Tag] = list(item.children)  # type: ignore[arg-type]
    while stack:
        node = stack.pop(0)
        if not isinstance(node, Tag):
            continue
        if node.has_attr("itemprop"):
            found.append(node)
            if node.has_attr("itemscope"):
                continue  # don't descend into the nested item
        # Descend
        stack[:0] = list(node.children)  # type: ignore[arg-type]
    return found


def extract_microdata(soup: BeautifulSoup, base: str) -> tuple[rdflib.Graph, list[str]]:
    g = rdflib.Graph()
    errors: list[str] = []
    try:
        for item in _microdata_items(soup):
            _process_item(item, g, base)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"microdata: {exc}")
    return g, errors


# --- driver ------------------------------------------------------------

def page_url(page_dir: Path) -> str:
    fetch = page_dir / "fetch.json"
    if fetch.exists():
        try:
            data = json.loads(fetch.read_text())
            return data.get("final_url") or data.get("url") or ""
        except json.JSONDecodeError:
            pass
    return ""


def extract_one(page_dir: Path, out_dir: Path, refresh: bool) -> dict:
    slug = page_dir.name
    html_path = page_dir / "page.html"
    if not html_path.exists():
        return {"slug": slug, "skipped": "no html"}

    target = out_dir / slug
    summary_path = target / "extract.json"
    if not refresh and summary_path.exists():
        try:
            return json.loads(summary_path.read_text())
        except json.JSONDecodeError:
            pass

    base = page_url(page_dir) or f"https://www.gov.uk/{slug.replace('__', '/')}"
    html = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "lxml")

    jsonld_g, jsonld_err = extract_jsonld(soup, base)
    rdfa_g, rdfa_err = extract_rdfa(html, base)
    micro_g, micro_err = extract_microdata(soup, base)

    jsonld_g, j_drop = _clean_graph(jsonld_g)
    rdfa_g, r_drop = _clean_graph(rdfa_g)
    micro_g, m_drop = _clean_graph(micro_g)
    dropped = {"jsonld": j_drop, "rdfa": r_drop, "microdata": m_drop}

    target.mkdir(parents=True, exist_ok=True)
    jsonld_g.serialize(destination=str(target / "jsonld.nt"), format="nt")
    rdfa_g.serialize(destination=str(target / "rdfa.nt"), format="nt")
    micro_g.serialize(destination=str(target / "microdata.nt"), format="nt")

    # Combined N-Quads with one named graph per format.
    ds = rdflib.Dataset()
    for fmt, graph in (("jsonld", jsonld_g), ("rdfa", rdfa_g), ("microdata", micro_g)):
        ng = ds.graph(NS_FORMAT[fmt])
        for t in graph:
            ng.add(t)
    ds.serialize(destination=str(target / "triples.nq"), format="nquads")

    summary = {
        "slug": slug,
        "url": base,
        "counts": {
            "jsonld": len(jsonld_g),
            "rdfa": len(rdfa_g),
            "microdata": len(micro_g),
        },
        "dropped_invalid_uris": dropped,
        "errors": jsonld_err + rdfa_err + micro_err,
    }
    summary_path.write_text(json.dumps(summary, indent=2))
    return summary


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--in", dest="in_dir",
        default="third_party/govuk/html/orgcharts/pages",
        help="input directory of <slug>/page.html (default: %(default)s)",
    )
    parser.add_argument(
        "--out", dest="out_dir",
        default="third_party/govuk/html/orgcharts/extractors/triples",
        help="output directory (default: %(default)s)",
    )
    parser.add_argument(
        "--workers", type=int, default=4,
        help="parallel extractors (default: %(default)s)",
    )
    parser.add_argument(
        "--only", action="append", default=None,
        help="restrict to one or more slugs",
    )
    parser.add_argument(
        "--refresh", action="store_true",
        help="re-extract pages even if extract.json already exists",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    page_dirs = sorted(p for p in in_dir.iterdir() if p.is_dir())
    if args.only:
        wanted = set(args.only)
        page_dirs = [p for p in page_dirs if p.name in wanted]
    if not page_dirs:
        print("no pages to extract", file=sys.stderr)
        return 1

    results: list[dict] = []
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {
            pool.submit(extract_one, p, out_dir, args.refresh): p.name
            for p in page_dirs
        }
        for fut in futures.as_completed(futs):
            slug = futs[fut]
            try:
                results.append(fut.result())
            except Exception as exc:  # noqa: BLE001
                results.append({"slug": slug, "error": repr(exc)})
                print(f"ERR {slug}: {exc}", file=sys.stderr)

    results.sort(key=lambda r: r.get("slug", ""))
    totals = {"jsonld": 0, "rdfa": 0, "microdata": 0}
    errors = 0
    for r in results:
        c = r.get("counts") or {}
        for k, v in c.items():
            totals[k] = totals.get(k, 0) + int(v)
        errors += len(r.get("errors") or [])
    index = {
        "pages": len(results),
        "totals": totals,
        "errors": errors,
        "items": results,
    }
    (out_dir / "_index.json").write_text(json.dumps(index, indent=2))
    print(
        f"extracted {len(results)} pages; "
        f"jsonld={totals['jsonld']} rdfa={totals['rdfa']} "
        f"microdata={totals['microdata']} errors={errors}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
