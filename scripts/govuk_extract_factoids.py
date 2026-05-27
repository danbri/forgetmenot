#!/usr/bin/env python3
"""Hand-templated factoid extractor for the cached GOV.UK org-chart pages.

Where ``govuk_extract_triples.py`` lifts whatever generic structured data
the page advertises (RDFa, JSON-LD, microdata), this script reads the
visible HTML using BeautifulSoup templates that target the specific
GOV.UK markup conventions for role / person / organisation / past-PM
pages -- the four shapes our crawl covers.

For each cached page

    third_party/govuk/html/orgcharts/pages/<slug>/page.html

we write

    third_party/govuk/html/orgcharts/extractors/factoids/<slug>/
        factoids.ttl        Turtle, one named subject per page
        extract.json        per-page counts and which templates fired

and roll the whole corpus into

    third_party/govuk/html/orgcharts/extractors/factoids/all.nq

where every triple's named graph is the page URL it came from, so the
nquad file itself answers "which gov.uk page is this factoid from?".

Vocabulary used:
    schema:                http://schema.org/
    dcterms:               http://purl.org/dc/terms/
    govuk: (this project)  https://forgetmenot.local/govuk#
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import json
import re
import sys
import urllib.parse
from datetime import date
from pathlib import Path
from typing import Iterable

import rdflib
from bs4 import BeautifulSoup, Tag
from rdflib import RDF, XSD, Literal, Namespace, URIRef


SCHEMA = Namespace("http://schema.org/")
DCTERMS = Namespace("http://purl.org/dc/terms/")
GOVUK = Namespace("https://forgetmenot.local/govuk#")


# --- helpers ------------------------------------------------------------

def page_url_for(page_dir: Path) -> str:
    fetch = page_dir / "fetch.json"
    if fetch.exists():
        try:
            data = json.loads(fetch.read_text())
            return data.get("final_url") or data.get("url") or ""
        except json.JSONDecodeError:
            pass
    return ""


def abs_url(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, href)


def clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def text_of(el: Tag | None) -> str:
    if el is None:
        return ""
    return clean(el.get_text(" ", strip=True))


def first_h1_text(soup: BeautifulSoup) -> str:
    h1 = soup.find("h1")
    return text_of(h1)


def caption_above_h1(soup: BeautifulSoup) -> str:
    """The italic caption GOV.UK puts above an h1 ('Ministerial role', a
    person's current role title, etc.)."""
    cap = soup.find(class_="govuk-caption-xl")
    return text_of(cap)


def page_kind(url: str) -> str | None:
    path = urllib.parse.urlsplit(url).path
    if re.match(r"^/government/ministers/[^/]+/?$", path):
        return "role"
    if re.match(r"^/government/people/[^/]+/?$", path):
        return "person"
    if re.match(r"^/government/organisations/[^/]+/?$", path):
        return "organisation"
    if path == "/government/history/past-prime-ministers":
        return "pms-index"
    if re.match(r"^/government/history/past-prime-ministers/[^/]+/?$", path):
        return "past-pm"
    return None


_YEAR_RANGE_RE = re.compile(r"(\d{4})\s+to\s+(\d{4}|present)", re.IGNORECASE)
_PARTY_RE = re.compile(
    r"^(Conservative(?: and Unionist)?|Labour(?: Co-operative)?|"
    r"Liberal(?: Democrat)?|Liberal Democrats|Whig|Tory|"
    r"Independent|National|National Labour|Coalition|Peelite|"
    r"Crossbench)\b",
    re.IGNORECASE,
)


def parse_tenure(text: str) -> tuple[str | None, str | None]:
    m = _YEAR_RANGE_RE.search(text)
    if not m:
        return (None, None)
    end = m.group(2).lower()
    return (m.group(1), None if end == "present" else m.group(2))


# --- role page ---------------------------------------------------------

def extract_role(soup: BeautifulSoup, page: str, g: rdflib.Graph) -> dict:
    counts: dict[str, int] = {"role": 0, "responsibility": 0, "previous_holder": 0}
    subj = URIRef(page)
    g.add((subj, RDF.type, GOVUK.MinisterialRole))
    g.add((subj, SCHEMA.url, subj))
    name = first_h1_text(soup)
    if name:
        g.add((subj, SCHEMA.name, Literal(name, lang="en")))
        counts["role"] = 1

    # "Organisations: <a>HM Treasury</a>" line
    org_list = soup.find("div", class_=lambda c: c and "organisations-list" in c)
    if org_list:
        for a in org_list.find_all("a", href=True):
            org = abs_url(page, a["href"])
            g.add((subj, GOVUK.partOf, URIRef(org)))
            g.add((URIRef(org), GOVUK.hasRole, subj))

    # "Current role holder: <a>...</a>"
    for div in soup.find_all("div"):
        sp = div.find("span", recursive=False)
        if sp and clean(sp.get_text()) == "Current role holder":
            for a in div.find_all("a", href=True):
                if "/government/people/" in a["href"]:
                    person = URIRef(abs_url(page, a["href"]))
                    g.add((subj, GOVUK.roleHolder, person))
                    g.add((person, GOVUK.holdsRole, subj))
                    g.add((person, SCHEMA.name, Literal(text_of(a), lang="en")))
            break

    # Responsibilities: every <li> between the 'Responsibilities' h2 and the
    # next h2.
    resp_h = next(
        (h for h in soup.find_all("h2") if clean(h.get_text()) == "Responsibilities"),
        None,
    )
    if resp_h:
        for el in resp_h.find_all_next():
            if el.name == "h2" and el is not resp_h:
                break
            if el.name == "li":
                t = text_of(el)
                if t:
                    g.add((subj, GOVUK.responsibility, Literal(t, lang="en")))
                    counts["responsibility"] += 1

    # Previous holders: each <li> after the "Previous holders of this role" h2
    prev_h = next(
        (h for h in soup.find_all("h2")
         if "Previous holders" in clean(h.get_text())),
        None,
    )
    if prev_h:
        for el in prev_h.find_all_next():
            if el.name == "h2" and el is not prev_h:
                break
            if el.name == "li":
                a = el.find("a", href=lambda h: h and "/government/people/" in h)
                if not a:
                    continue
                person = URIRef(abs_url(page, a["href"]))
                # Each li contains <h3><a/></h3><p>YYYY to YYYY</p>
                tenure_text = ""
                p = el.find("p")
                if p:
                    tenure_text = text_of(p)
                start, end = parse_tenure(tenure_text)
                tenure = rdflib.BNode()
                g.add((tenure, RDF.type, GOVUK.RoleTenure))
                g.add((tenure, GOVUK.role, subj))
                g.add((tenure, GOVUK.holder, person))
                g.add((subj, GOVUK.previouslyHeldBy, person))
                g.add((person, SCHEMA.name, Literal(text_of(a), lang="en")))
                if start:
                    g.add((tenure, GOVUK.tenureStart, Literal(start, datatype=XSD.gYear)))
                if end:
                    g.add((tenure, GOVUK.tenureEnd, Literal(end, datatype=XSD.gYear)))
                counts["previous_holder"] += 1
    return counts


# --- person page -------------------------------------------------------

_PERSON_ROLE_HINTS = (
    "Chancellor", "Minister", "Secretary", "Prime Minister",
    "Attorney", "Solicitor", "Lord", "Whip",
    "Leader of the House", "Paymaster", "Comptroller",
)


def extract_person(soup: BeautifulSoup, page: str, g: rdflib.Graph) -> dict:
    counts: dict[str, int] = {"person": 0, "role_link": 0, "org_link": 0}
    subj = URIRef(page)
    g.add((subj, RDF.type, SCHEMA.Person))
    g.add((subj, SCHEMA.url, subj))
    name = first_h1_text(soup)
    if name:
        g.add((subj, SCHEMA.name, Literal(name, lang="en")))
        counts["person"] = 1
    caption = caption_above_h1(soup)
    if caption:
        g.add((subj, GOVUK.currentRoleTitle, Literal(caption, lang="en")))

    # "More about this role" -> /government/ministers/<slug>
    for a in soup.find_all("a", href=True):
        href = a["href"]
        txt = clean(a.get_text())
        if href.startswith("/government/ministers/") and (
            txt == "More about this role" or txt in caption
        ):
            role = URIRef(abs_url(page, href))
            g.add((subj, GOVUK.holdsRole, role))
            g.add((role, GOVUK.roleHolder, subj))
            counts["role_link"] += 1

    # Organisation anchor in the person's role section
    for a in soup.find_all("a", href=True):
        if a["href"].startswith("/government/organisations/"):
            org = URIRef(abs_url(page, a["href"]))
            g.add((subj, GOVUK.affiliatedWith, org))
            g.add((org, GOVUK.hasMinister, subj))
            counts["org_link"] += 1
            break  # first one is typically the primary affiliation

    # Biography: first <p> after the "Biography" h2.
    bio_h = next(
        (h for h in soup.find_all("h2") if clean(h.get_text()) == "Biography"),
        None,
    )
    if bio_h:
        p = bio_h.find_next("p")
        if p:
            t = text_of(p)
            if t:
                g.add((subj, SCHEMA.description, Literal(t, lang="en")))

    # OG image (the headshot) -- structured-data extractor sees the URL too
    # but it's worth pinning it to the person directly here.
    og = soup.find("meta", attrs={"property": "og:image"})
    if og and og.get("content"):
        # GOV.UK puts a default fallback for pages without portraits; skip it.
        if "govuk-opengraph-image" not in og["content"]:
            g.add((subj, SCHEMA.image, URIRef(og["content"])))

    return counts


# --- organisation page -------------------------------------------------

def _find_minister_cards(h2: Tag) -> list[Tag]:
    """All gem-c-image-card divs between this h2 and the next h2."""
    cards: list[Tag] = []
    for el in h2.find_all_next():
        if el.name == "h2" and el is not h2:
            break
        if isinstance(el, Tag) and "gem-c-image-card" in (el.get("class") or []):
            cards.append(el)
    return cards


def extract_organisation(soup: BeautifulSoup, page: str, g: rdflib.Graph) -> dict:
    counts: dict[str, int] = {"organisation": 0, "minister": 0, "manager": 0}
    subj = URIRef(page)
    g.add((subj, RDF.type, GOVUK.Organisation))
    g.add((subj, RDF.type, SCHEMA.GovernmentOrganization))
    g.add((subj, SCHEMA.url, subj))
    name = first_h1_text(soup)
    if name:
        g.add((subj, SCHEMA.name, Literal(name, lang="en")))
        counts["organisation"] = 1

    for h2 in soup.find_all("h2"):
        t = clean(h2.get_text())
        if t == "Our ministers":
            relation = GOVUK.hasMinister
            kind = "minister"
        elif t == "Our management":
            relation = GOVUK.hasManager
            kind = "manager"
        else:
            continue
        for card in _find_minister_cards(h2):
            title_a = card.find(
                "a",
                class_=lambda c: c and "gem-c-image-card__title-link" in c,
                href=True,
            )
            role_a = card.find(
                "a",
                class_=lambda c: c and "gem-c-image-card__list-item-link" in c,
                href=True,
            )
            if not title_a or "/government/people/" not in title_a["href"]:
                continue
            person = URIRef(abs_url(page, title_a["href"]))
            g.add((subj, relation, person))
            g.add((person, RDF.type, SCHEMA.Person))
            g.add((person, SCHEMA.name, Literal(text_of(title_a), lang="en")))
            counts[kind] += 1
            if role_a and role_a["href"].startswith("/government/ministers/"):
                role = URIRef(abs_url(page, role_a["href"]))
                g.add((role, RDF.type, GOVUK.MinisterialRole))
                g.add((role, SCHEMA.name, Literal(text_of(role_a), lang="en")))
                g.add((subj, GOVUK.hasRole, role))
                g.add((person, GOVUK.holdsRole, role))
                g.add((role, GOVUK.roleHolder, person))
                g.add((role, GOVUK.partOf, subj))
            img = card.find("img")
            if img and img.get("src") and "s465_" in img["src"]:
                g.add((person, SCHEMA.image, URIRef(img["src"])))

    return counts


# --- past PM index + individual ---------------------------------------

def extract_pms_index(soup: BeautifulSoup, page: str, g: rdflib.Graph) -> dict:
    counts = {"past_pm": 0}
    for a in soup.find_all("a", href=lambda h: h and "/government/history/past-prime-ministers/" in h):
        href = a["href"]
        # Skip the index page itself
        if href.rstrip("/").endswith("/past-prime-ministers"):
            continue
        pm = URIRef(abs_url(page, href))
        g.add((pm, RDF.type, SCHEMA.Person))
        g.add((pm, RDF.type, GOVUK.PastPrimeMinister))
        name = text_of(a)
        if name:
            g.add((pm, SCHEMA.name, Literal(name, lang="en")))
        # The list item with the party + year-range sits inside the same
        # text-wrapper as the anchor. (`class_=lambda` doesn't work with
        # `find_parent` in our BS4 version, so use a tag-level predicate.)
        def _is_image_card(tag: Tag) -> bool:
            c = tag.get("class") or []
            return tag.name == "div" and any("gem-c-image-card" in cc for cc in c)
        card = a.find_parent(_is_image_card)
        if card:
            li_text = ""
            li = card.find(
                lambda t: t.name == "li" and any(
                    "list-item--text" in cc for cc in (t.get("class") or [])
                )
            )
            if li:
                li_text = text_of(li)
            # "Conservative 2016 to 2019" or two ranges for Wilson
            for m in _YEAR_RANGE_RE.finditer(li_text):
                tenure = rdflib.BNode()
                g.add((tenure, RDF.type, GOVUK.RoleTenure))
                g.add((tenure, GOVUK.holder, pm))
                g.add((tenure, GOVUK.role,
                       URIRef("https://www.gov.uk/government/ministers/prime-minister")))
                g.add((tenure, GOVUK.tenureStart,
                       Literal(m.group(1), datatype=XSD.gYear)))
                end = m.group(2).lower()
                if end != "present":
                    g.add((tenure, GOVUK.tenureEnd,
                           Literal(m.group(2), datatype=XSD.gYear)))
            pm_party = _PARTY_RE.match(li_text)
            if pm_party:
                g.add((pm, GOVUK.party, Literal(pm_party.group(1), lang="en")))
            counts["past_pm"] += 1
    return counts


def extract_past_pm(soup: BeautifulSoup, page: str, g: rdflib.Graph) -> dict:
    subj = URIRef(page)
    g.add((subj, RDF.type, SCHEMA.Person))
    g.add((subj, RDF.type, GOVUK.PastPrimeMinister))
    g.add((subj, SCHEMA.url, subj))
    name = first_h1_text(soup)
    if name:
        g.add((subj, SCHEMA.name, Literal(name, lang="en")))
    # Many past-PM pages don't expose machine-friendly facts beyond name +
    # narrative biography; just lift the lead paragraph as description.
    bio_h = next(
        (h for h in soup.find_all("h2") if clean(h.get_text()) == "Biography"),
        None,
    )
    if bio_h:
        p = bio_h.find_next("p")
        if p:
            g.add((subj, SCHEMA.description, Literal(text_of(p), lang="en")))
    return {"past_pm_page": 1}


# --- driver ------------------------------------------------------------

EXTRACTORS = {
    "role": extract_role,
    "person": extract_person,
    "organisation": extract_organisation,
    "pms-index": extract_pms_index,
    "past-pm": extract_past_pm,
}


def bind_prefixes(g: rdflib.Graph) -> None:
    g.bind("schema", SCHEMA)
    g.bind("dcterms", DCTERMS)
    g.bind("govuk", GOVUK)
    g.bind("xsd", XSD)


def extract_one(page_dir: Path, out_dir: Path, refresh: bool) -> dict:
    slug = page_dir.name
    html_path = page_dir / "page.html"
    if not html_path.exists():
        return {"slug": slug, "skipped": "no html"}
    page = page_url_for(page_dir)
    if not page:
        return {"slug": slug, "skipped": "no url in fetch.json"}
    kind = page_kind(page)
    if not kind:
        return {"slug": slug, "url": page, "skipped": "kind not templated"}

    target = out_dir / slug
    target.mkdir(parents=True, exist_ok=True)
    summary_path = target / "extract.json"
    if not refresh and summary_path.exists():
        try:
            return json.loads(summary_path.read_text())
        except json.JSONDecodeError:
            pass

    html = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "lxml")
    g = rdflib.Graph()
    bind_prefixes(g)
    g.add((URIRef(page), DCTERMS.isPartOf, URIRef("https://www.gov.uk/government")))
    counts = EXTRACTORS[kind](soup, page, g)

    g.serialize(destination=str(target / "factoids.ttl"), format="turtle")
    summary = {
        "slug": slug,
        "url": page,
        "kind": kind,
        "triples": len(g),
        "counts": counts,
    }
    summary_path.write_text(json.dumps(summary, indent=2))
    return summary


def roll_up_nquads(out_dir: Path, items: list[dict]) -> int:
    """Combine every per-page Turtle into one N-Quads file, using the page
    URL as the named graph for each triple. This is the single artefact
    the user asked for: every line tells you which page it's from.
    """
    ds = rdflib.Dataset()
    bind_prefixes(ds)
    total = 0
    for item in items:
        if "url" not in item or item.get("kind") not in EXTRACTORS:
            continue
        ttl = out_dir / item["slug"] / "factoids.ttl"
        if not ttl.exists():
            continue
        g = rdflib.Graph()
        g.parse(ttl, format="turtle")
        gname = URIRef(item["url"])
        named = ds.graph(gname)
        for t in g:
            named.add(t)
            total += 1
    out_path = out_dir / "all.nq"
    ds.serialize(destination=str(out_path), format="nquads")
    return total


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--in", dest="in_dir",
        default="third_party/govuk/html/orgcharts/pages",
        help="input directory of <slug>/page.html",
    )
    parser.add_argument(
        "--out", dest="out_dir",
        default="third_party/govuk/html/orgcharts/extractors/factoids",
        help="output directory",
    )
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--only", action="append", default=None,
                        help="restrict to one or more slugs")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument(
        "--no-rollup", action="store_true",
        help="skip the all.nq combined file",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    page_dirs = sorted(p for p in in_dir.iterdir() if p.is_dir())
    if args.only:
        wanted = set(args.only)
        page_dirs = [p for p in page_dirs if p.name in wanted]

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
    by_kind: dict[str, int] = {}
    skipped: dict[str, int] = {}
    triples = 0
    for r in results:
        if "skipped" in r:
            skipped[r["skipped"]] = skipped.get(r["skipped"], 0) + 1
            continue
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
        triples += r.get("triples", 0)
    index = {
        "generated_at": date.today().isoformat(),
        "pages": len(results),
        "templated": sum(by_kind.values()),
        "by_kind": by_kind,
        "skipped": skipped,
        "triples": triples,
        "items": results,
    }
    (out_dir / "_index.json").write_text(json.dumps(index, indent=2))

    if not args.no_rollup:
        rolled = roll_up_nquads(out_dir, results)
        print(
            f"templated {sum(by_kind.values())} pages "
            f"({', '.join(f'{k}={v}' for k,v in sorted(by_kind.items()))}); "
            f"triples={triples}; nquads={rolled}"
        )
    else:
        print(
            f"templated {sum(by_kind.values())} pages; triples={triples}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
