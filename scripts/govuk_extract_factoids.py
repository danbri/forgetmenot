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


# Map GOV.UK's `<meta name="govuk:schema-name">` values to our templated
# kinds. schema-name is the canonical document-type marker gov.uk emits
# on every public page and is far more stable than URL-prefix matching
# (which silently breaks when gov.uk reorganises a URL space).
_SCHEMA_TO_KIND = {
    "person":              "person",
    "role":                "role",          # ministerial role
    "ministerial_role":    "role",
    "organisation":        "organisation",
    "ministers_index":     "pms-index",     # only matches the past-PM index
    "historic_appointment": "past-pm",
    "historic_appointments": "pms-index",
}


def page_kind(url: str, soup: BeautifulSoup | None = None) -> str | None:
    """Return our internal templated-kind label for a GOV.UK page.

    Prefers the page's own `<meta name="govuk:schema-name">` when soup
    is supplied -- a publishing-app-emitted identifier we can rely on.
    Falls back to URL-prefix matching only for legacy callers that
    don't have a parsed DOM."""
    if soup is not None:
        meta = soup.find("meta", attrs={"name": "govuk:schema-name"})
        if meta and meta.get("content"):
            kind = _SCHEMA_TO_KIND.get(meta["content"].strip())
            if kind:
                # historic_appointment is only "past-pm" when the URL is
                # actually under past-prime-ministers/ -- other historic
                # appointment pages exist.
                path = urllib.parse.urlsplit(url).path
                if kind == "past-pm" and "/past-prime-ministers/" not in path:
                    return None
                return kind
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


def add_govuk_meta_identifiers(soup: BeautifulSoup, subj: URIRef,
                                g: rdflib.Graph) -> None:
    """Lift GOV.UK's stable structural identifiers off the page.

    `govuk:content-id` is a UUID that survives URL renames -- a much
    safer join key than the URL itself, since gov.uk reshuffles slugs
    over time. `govuk:schema-name` is the document-type marker.
    These are emitted by the publishing-app, not part of govuk-frontend
    presentational classes that drift between releases.
    """
    for meta_name, predicate in [
        ("govuk:content-id",       GOVUK.contentId),
        ("govuk:schema-name",      GOVUK.schemaName),
        ("govuk:publishing-app",   GOVUK.publishingApp),
        ("govuk:public-updated-at", DCTERMS.modified),
    ]:
        m = soup.find("meta", attrs={"name": meta_name})
        if m and m.get("content"):
            g.add((subj, predicate, Literal(m["content"].strip())))


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

# Biography-prose extraction. GOV.UK's structured /api/content/<path>
# JSON (used in extract_from_api below) is the primary, canonical
# source -- it has day-level dates and explicit `current` flags. We
# keep this prose-mining path as a *second independent extractor* so
# QA can cross-check the two: if API tenure dates and prose-extracted
# years disagree, that's a corner-case bug worth surfacing rather
# than silently trusting one source.
#
# Triples produced this way are tagged govuk:proseExtracted true; the
# API ones carry govuk:apiSourced true. A consumer can join on (holder,
# role) to compare the two views.

# Match a date as either "D Month YYYY" or "Month YYYY" or "YYYY".
_DATE = r"(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|"\
        r"August|September|October|November|December)?\s*\d{4}"

# Roles we attempt to recognise in biography prose. Restrict the set so we
# don't accidentally promote a passing mention ("met the Foreign Secretary")
# into a held-the-role claim. Each entry is (regex, role-page slug).
_PROSE_ROLES = [
    (re.compile(r"\bPrime Minister\b", re.IGNORECASE),
        "prime-minister"),
    (re.compile(r"\bChancellor of the Exchequer\b", re.IGNORECASE),
        "chancellor-of-the-exchequer"),
    (re.compile(r"\bForeign Secretary\b|"
                r"\bSecretary of State for Foreign(?:,| and)?\s*"
                r"Commonwealth(?: and Development)?\s*Affairs\b",
                re.IGNORECASE),
        "foreign-secretary"),
    (re.compile(r"\bHome Secretary\b|"
                r"\bSecretary of State for the Home Department\b",
                re.IGNORECASE),
        "home-secretary"),
    (re.compile(r"\bLord Chancellor\b|"
                r"\bSecretary of State for Justice\b",
                re.IGNORECASE),
        "lord-chancellor"),
    (re.compile(r"\bSecretary of State for Defence\b|"
                r"\bDefence Secretary\b",
                re.IGNORECASE),
        "defence-secretary"),
    (re.compile(r"\bDeputy Prime Minister\b", re.IGNORECASE),
        "deputy-prime-minister"),
]

# "X was <role> from <date> to <date>" or "between <date> and <date>".
_TENURE_SPAN = re.compile(
    rf"(?:from|between)\s+({_DATE})\s+(?:to|and)\s+({_DATE})",
    re.IGNORECASE,
)


def _year_of(date_text: str) -> str | None:
    m = re.search(r"\b(\d{4})\b", date_text)
    return m.group(1) if m else None


# Pronouns / lead words that introduce a held-the-role claim. GOV.UK
# biographies use "X was Foreign Secretary...", "He was previously
# Foreign Secretary...", "She was previously...", and (for non-binary
# subjects or when avoiding gendered language) "They were previously...".
# Anchoring on the subject prefix prevents passing mentions ("X met
# the Foreign Secretary") from being read as held-the-role claims.
_SUBJECT_PREFIX = re.compile(
    r"\b(?:[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3}|He|She|They)\s+"
    r"(?:was|were|has\s+been|had\s+been|previously\s+was)\s+"
    r"(?:appointed\s+|previously\s+)?",
)


def mine_biography_prose(biography: str, person: rdflib.URIRef,
                         g: rdflib.Graph) -> int:
    """Extract '<subject> was <role> from Y to Z' tenure claims from
    biography prose. <subject> is the person's surname, "He", "She", or
    "They" -- matched as a prefix so a passing mention ("X met the
    Foreign Secretary") cannot be read as a held-the-role claim.

    Returns the number of tenure triples added. Each tenure is a reified
    govuk:RoleTenure blank node carrying govuk:proseExtracted true.
    """
    n = 0
    if not biography or len(biography) < 30:
        return 0
    for role_re, role_slug in _PROSE_ROLES:
        for m in role_re.finditer(biography):
            lead = biography[max(0, m.start() - 80): m.start()]
            if not _SUBJECT_PREFIX.search(lead):
                continue
            tail = biography[m.end(): m.end() + 240]
            span = _TENURE_SPAN.search(tail)
            if not span:
                continue
            start_yr = _year_of(span.group(1))
            end_yr = _year_of(span.group(2))
            if not start_yr:
                continue
            role_uri = URIRef(f"https://www.gov.uk/government/ministers/{role_slug}")
            tenure = rdflib.BNode()
            g.add((tenure, RDF.type, GOVUK.RoleTenure))
            g.add((tenure, GOVUK.role, role_uri))
            g.add((tenure, GOVUK.holder, person))
            g.add((tenure, GOVUK.proseExtracted, Literal(True)))
            g.add((tenure, GOVUK.tenureStart,
                   Literal(start_yr, datatype=XSD.gYear)))
            if end_yr:
                g.add((tenure, GOVUK.tenureEnd,
                       Literal(end_yr, datatype=XSD.gYear)))
            g.add((person, GOVUK.previouslyHeldRole, role_uri))
            g.add((role_uri, GOVUK.previouslyHeldBy, person))
            n += 1
    return n


def extract_person(soup: BeautifulSoup, page: str, g: rdflib.Graph) -> dict:
    counts: dict[str, int] = {
        "person": 0, "role_link": 0, "org_link": 0,
        "former_office_marker": 0, "prose_tenures": 0,
    }
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
    # Current vs former office-holder status is set by extract_from_api()
    # below using the structured `current` flag on each role appointment.
    # The previous HTML heuristic (empty caption-xl = former) was brittle:
    # the class name is a govuk-publishing-components artefact that drifts
    # between page revisions, and an empty caption can mean either
    # "former" or "non-political appointee" with no way to tell apart.

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

    # Biography: collect every <p> after the "Biography" h2 until the next
    # h2, so the prose miner sees the whole career narrative, not just the
    # opening sentence.
    bio_h = next(
        (h for h in soup.find_all("h2") if clean(h.get_text()) == "Biography"),
        None,
    )
    bio_text_parts: list[str] = []
    if bio_h:
        for el in bio_h.find_all_next():
            if el.name == "h2" and el is not bio_h:
                break
            if el.name == "p":
                t = text_of(el)
                if t:
                    bio_text_parts.append(t)
    full_bio = " ".join(bio_text_parts)
    if full_bio:
        # Keep the opening paragraph as the canonical schema:description.
        g.add((subj, SCHEMA.description, Literal(bio_text_parts[0], lang="en")))
        counts["prose_tenures"] = mine_biography_prose(full_bio, subj, g)

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


# --- API-driven extraction (preferred over HTML scraping) -------------

def extract_from_api(api_path: Path, page: str, kind: str,
                     g: rdflib.Graph) -> dict:
    """Add triples derived from gov.uk's structured /api/content/ JSON.

    For person pages we emit a govuk:RoleTenure node per role appointment,
    with the API's start/end dates and a CurrentOfficeHolder /
    FormerOfficeHolder marker driven by the API's `current` boolean
    rather than the HTML's brittle caption-xl class. Triples are tagged
    govuk:apiSourced true so they can be told apart from HTML-scraped
    ones.
    """
    counts: dict[str, int] = {"api_tenures": 0, "api_status_marker": 0}
    try:
        data = json.loads(api_path.read_text())
    except (OSError, json.JSONDecodeError):
        return counts
    if data.get("_forgetmenot_status") == 404:
        return counts
    if kind != "person":
        # Org/role pages also have rich API data but we already template
        # those well from HTML; keep this targeted for the moment.
        return counts

    subj = URIRef(page)
    appointments = data.get("links", {}).get("role_appointments", []) or []
    any_current = False
    for ra in appointments:
        det = ra.get("details", {}) or {}
        current = bool(det.get("current"))
        if current:
            any_current = True
        role_link = (ra.get("links", {}) or {}).get("role", [])
        role_base = role_link[0].get("base_path") if role_link else None
        if not role_base:
            continue
        role_uri = URIRef(f"https://www.gov.uk{role_base}")
        started = det.get("started_on")
        ended = det.get("ended_on")
        tenure = rdflib.BNode()
        g.add((tenure, RDF.type, GOVUK.RoleTenure))
        g.add((tenure, GOVUK.role, role_uri))
        g.add((tenure, GOVUK.holder, subj))
        g.add((tenure, GOVUK.apiSourced, Literal(True)))
        if started:
            # Day-level precision: store as xsd:date.
            g.add((tenure, GOVUK.tenureStart,
                   Literal(started[:10], datatype=XSD.date)))
        if ended:
            g.add((tenure, GOVUK.tenureEnd,
                   Literal(ended[:10], datatype=XSD.date)))
        if current:
            g.add((subj, GOVUK.holdsRole, role_uri))
            g.add((role_uri, GOVUK.roleHolder, subj))
        else:
            g.add((subj, GOVUK.previouslyHeldRole, role_uri))
            g.add((role_uri, GOVUK.previouslyHeldBy, subj))
        counts["api_tenures"] += 1

    # Replace the HTML-driven empty-caption guess with the API's truth:
    # the person is a current office-holder iff some role_appointment has
    # current=true. Strip any FormerOfficeHolder we may have added from
    # the HTML pass if the API says otherwise.
    if appointments:
        if any_current:
            g.remove((subj, RDF.type, GOVUK.FormerOfficeHolder))
            g.add((subj, RDF.type, GOVUK.CurrentOfficeHolder))
        else:
            g.add((subj, RDF.type, GOVUK.FormerOfficeHolder))
        counts["api_status_marker"] = 1
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
    # Re-resolve kind from the page itself in case URL-based detection
    # disagrees with the publishing-app's own govuk:schema-name marker.
    refined = page_kind(page, soup) or kind
    if refined != kind:
        kind = refined
    g = rdflib.Graph()
    bind_prefixes(g)
    g.add((URIRef(page), DCTERMS.isPartOf, URIRef("https://www.gov.uk/government")))
    add_govuk_meta_identifiers(soup, URIRef(page), g)
    counts = EXTRACTORS[kind](soup, page, g)

    # Augment with the structured GOV.UK Content API JSON if present.
    # The API exposes role_appointments with explicit `current` + day-level
    # start/end dates -- a far stronger signal than any HTML scrape.
    api_path = page_dir / "api.json"
    if api_path.exists():
        api_counts = extract_from_api(api_path, page, kind, g)
        for k, n in api_counts.items():
            counts[k] = counts.get(k, 0) + n

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
