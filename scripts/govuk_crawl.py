#!/usr/bin/env python3
"""Gently parallel crawler for GOV.UK org-chart pages.

Starts from the Prime Minister role and walks outward over /government/
pages that describe people, roles, organisations, history, and related
announcements. Each fetched page is written to its own folder under
`third_party/govuk/html/orgcharts/pages/<slug>/` containing the raw
HTML, the response headers, and a small fetch record.

Discovered machine-readable feeds (atom/rss/sitemap/json) are recorded
in `feeds.md` next to the pages directory.

Usage:

    python3 scripts/govuk_crawl.py                       # default seed, 500 pages
    python3 scripts/govuk_crawl.py --max 2000 --workers 6
    python3 scripts/govuk_crawl.py --seed URL [--seed URL ...]
    python3 scripts/govuk_crawl.py --resume               # reuse prior visited set

State (`state.json`) lets the crawl resume between runs; pages already
present on disk are not re-fetched unless --refresh is passed.
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import hashlib
import heapq
import itertools
import json
import re
import sys
import threading
import time
import urllib.parse
import urllib.robotparser
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup


HOST = "www.gov.uk"
ROOT = "https://www.gov.uk"
DEFAULT_SEEDS = [
    "https://www.gov.uk/government/ministers/prime-minister#responsibilities",
]

# Path prefixes we are willing to walk into. Anything outside /government/
# is dropped at link-discovery time.
ALLOWED_PREFIXES = (
    "/government/ministers/",
    "/government/people/",
    "/government/organisations/",
    "/government/ministerial-roles/",
    "/government/role-appointments/",
    "/government/history/",
    "/government/history",
    "/government/how-government-works",
    "/government/announcements",
    "/government/news/",
    "/government/speeches/",
    "/government/statistics/",
    "/government/publications/",
    "/government/consultations/",
)

# Hard-skip path patterns: print views, search, formats we don't want
# to store as if they were narrative pages.
SKIP_PATTERNS = (
    re.compile(r"/print$"),
    re.compile(r"\.(?:json|atom|rss|xml|jpg|jpeg|png|gif|pdf|svg|webp|ico|css|js)(?:$|\?)", re.I),
    re.compile(r"/search(?:/|$)"),
)

# Priority bands: lower number = fetched first. Within a band we still
# go FIFO so each band is breadth-first. The point is to drain the
# org-chart spine (roles → people → history) before the frontier fills
# up with announcements, publications, and the full organisation A-Z.
PRIORITY_RULES = (
    (0, re.compile(r"^/government/(ministers|ministerial-roles|role-appointments)(/|$)")),
    (1, re.compile(r"^/government/people(/|$)")),
    (2, re.compile(r"^/government/history(/|$)")),
    (2, re.compile(r"^/government/how-government-works")),
    (3, re.compile(r"^/government/organisations(/|$)")),
    (4, re.compile(r"^/government/(news|speeches|announcements)(/|$)")),
    (5, re.compile(r"^/government/(publications|consultations|statistics)(/|$)")),
)


def priority_for(path: str) -> int:
    for prio, pat in PRIORITY_RULES:
        if pat.match(path):
            return prio
    return 9  # in-scope but unranked; fetch last

USER_AGENT = (
    "forgetmenot-govuk-orgchart/0.1 "
    "(+https://github.com/danbri/forgetmenot; research crawler)"
)


# --- url helpers ---------------------------------------------------------

def canonicalize(url: str) -> str | None:
    """Normalise a candidate URL, returning None if out of scope."""
    try:
        p = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    if not p.scheme:
        return None
    if p.scheme not in ("http", "https"):
        return None
    if p.netloc and p.netloc != HOST:
        return None
    path = p.path or "/"
    # Drop trailing slash except for root.
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    if not path.startswith("/government"):
        return None
    if any(pat.search(path) for pat in SKIP_PATTERNS):
        return None
    # Keep query but drop fragment; queries on listings (?page=, ?keywords=)
    # are part of the resource identity.
    query = p.query
    return urllib.parse.urlunsplit(("https", HOST, path, query, ""))


def in_scope(url: str) -> bool:
    p = urllib.parse.urlsplit(url)
    return any(p.path == pre.rstrip("/") or p.path.startswith(pre) for pre in ALLOWED_PREFIXES)


def slug_for(url: str) -> str:
    """A stable on-disk folder name for a URL.

    /government/people/rachel-reeves   -> government__people__rachel-reeves
    /government/announcements?page=2   -> government__announcements__q-3f9b7c
    """
    p = urllib.parse.urlsplit(url)
    path = p.path.strip("/")
    body = path.replace("/", "__") or "root"
    body = re.sub(r"[^A-Za-z0-9._-]+", "-", body)
    if p.query:
        h = hashlib.sha1(p.query.encode()).hexdigest()[:6]
        body = f"{body}__q-{h}"
    # Cap length to keep filesystems happy.
    if len(body) > 180:
        body = body[:160] + "-" + hashlib.sha1(body.encode()).hexdigest()[:8]
    return body


# --- crawler -------------------------------------------------------------

class Crawler:
    def __init__(
        self,
        *,
        out_dir: Path,
        seeds: list[str],
        max_pages: int,
        workers: int,
        delay: float,
        refresh: bool,
        resume: bool,
    ) -> None:
        self.out_dir = out_dir
        self.pages_dir = out_dir / "pages"
        self.pages_dir.mkdir(parents=True, exist_ok=True)
        self.state_path = out_dir / "state.json"
        self.feeds_path = out_dir / "feeds.md"
        self.log_path = out_dir / "crawl.log"
        self.max_pages = max_pages
        self.workers = workers
        self.delay = delay
        self.refresh = refresh

        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.session.headers["Accept"] = "text/html,application/xhtml+xml"
        self.session.headers["Accept-Language"] = "en-GB,en;q=0.9"

        self.lock = threading.Lock()
        # Min-heap of (priority, insertion_order, url, depth). insertion_order
        # makes the heap stable so each priority band stays FIFO.
        self.frontier: list[tuple[int, int, str, int]] = []
        self._counter = itertools.count()
        self.queued: set[str] = set()
        self.visited: set[str] = set()
        self.failed: dict[str, str] = {}
        self.feeds: dict[str, dict] = {}  # url -> {type, source}
        self.fetched_count = 0
        self.log_fp = self.log_path.open("a", encoding="utf-8")

        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.set_url(f"{ROOT}/robots.txt")
        try:
            self.robots.read()
        except Exception:  # noqa: BLE001
            pass

        prior_seeds: list[str] = []
        if resume and self.state_path.exists():
            state = json.loads(self.state_path.read_text())
            self.visited = set(state.get("visited", []))
            self.failed = dict(state.get("failed", {}))
            self.feeds = dict(state.get("feeds", {}))
            prior_seeds = list(state.get("frontier", []))
            self.log(f"resumed: visited={len(self.visited)} frontier={len(prior_seeds)}")

        # Pages on disk are ground truth for "already visited" -- state.json
        # can get truncated by an earlier non-resume run, but the HTML cache
        # doesn't lie. Walk pages/<slug>/fetch.json and union the URLs in.
        recovered = 0
        for fetch in self.pages_dir.glob("*/fetch.json"):
            try:
                data = json.loads(fetch.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            for key in ("final_url", "url"):
                u = data.get(key)
                if not u:
                    continue
                c = canonicalize(u)
                if c and c not in self.visited:
                    self.visited.add(c)
                    recovered += 1
        if recovered:
            self.log(f"recovered {recovered} visited URLs from page cache")

        for url in prior_seeds + seeds:
            c = canonicalize(url)
            if c and c not in self.visited:
                self.enqueue(c, depth=0)

    def log(self, msg: str) -> None:
        line = f"{time.strftime('%H:%M:%S')} {msg}"
        print(line, file=sys.stderr, flush=True)
        self.log_fp.write(line + "\n")
        self.log_fp.flush()

    def enqueue(self, url: str, depth: int) -> None:
        with self.lock:
            if url in self.queued or url in self.visited:
                return
            if not in_scope(url):
                return
            self.queued.add(url)
            path = urllib.parse.urlsplit(url).path
            heapq.heappush(
                self.frontier,
                (priority_for(path), next(self._counter), url, depth),
            )

    def pop(self) -> tuple[str, int] | None:
        with self.lock:
            if not self.frontier:
                return None
            _, _, url, depth = heapq.heappop(self.frontier)
            return url, depth

    def record_feed(self, url: str, kind: str, source: str) -> None:
        with self.lock:
            if url in self.feeds:
                return
            self.feeds[url] = {"type": kind, "source": source}

    def page_dir(self, url: str) -> Path:
        return self.pages_dir / slug_for(url)

    def already_have(self, url: str) -> bool:
        if self.refresh:
            return False
        d = self.page_dir(url)
        return (d / "page.html").exists() and (d / "fetch.json").exists()

    def fetch(self, url: str, depth: int) -> list[str]:
        """Fetch a URL, persist it, and return discovered links."""
        if not self.robots.can_fetch(USER_AGENT, url):
            self.log(f"robots-deny {url}")
            return []

        d = self.page_dir(url)
        d.mkdir(parents=True, exist_ok=True)

        if self.already_have(url):
            html = (d / "page.html").read_text(encoding="utf-8", errors="replace")
            return self.extract_links(url, html, depth, from_cache=True)

        try:
            time.sleep(self.delay)
            resp = self.session.get(url, timeout=30, allow_redirects=True)
        except requests.RequestException as exc:
            self.failed[url] = str(exc)
            self.log(f"FAIL {url} {exc}")
            return []

        final = canonicalize(resp.url) or url
        meta = {
            "url": url,
            "final_url": resp.url,
            "status": resp.status_code,
            "content_type": resp.headers.get("Content-Type", ""),
            "etag": resp.headers.get("ETag"),
            "last_modified": resp.headers.get("Last-Modified"),
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "depth": depth,
            "bytes": len(resp.content),
        }
        if resp.status_code >= 400:
            self.failed[url] = f"HTTP {resp.status_code}"
            (d / "fetch.json").write_text(json.dumps(meta, indent=2))
            self.log(f"HTTP{resp.status_code} {url}")
            return []
        ct = (resp.headers.get("Content-Type") or "").lower()
        if "html" not in ct:
            self.failed[url] = f"non-html {ct}"
            (d / "fetch.json").write_text(json.dumps(meta, indent=2))
            return []

        (d / "page.html").write_text(resp.text, encoding="utf-8")
        (d / "fetch.json").write_text(json.dumps(meta, indent=2))
        (d / "headers.json").write_text(
            json.dumps(dict(resp.headers), indent=2)
        )

        self.log(f"OK   d={depth} {url}")
        with self.lock:
            self.fetched_count += 1

        # If redirected to a different canonical URL within scope, also
        # symlink-style mark the canonical URL as visited (no second fetch).
        if final != url:
            with self.lock:
                self.visited.add(final)

        return self.extract_links(url, resp.text, depth, from_cache=False)

    def extract_links(
        self, base_url: str, html: str, depth: int, *, from_cache: bool
    ) -> list[str]:
        soup = BeautifulSoup(html, "lxml")

        # GOV.UK keeps PM biographies in two parallel URL spaces:
        # /government/history/past-prime-ministers/<slug> (the historical
        # write-up) and /government/people/<slug> (their current "person"
        # page). They are not always cross-linked, so a politician known
        # to one space may not be reachable to the other. Force the
        # reciprocal enqueue whenever we land in either space, so the
        # crawler can't lose one half of the pair.
        path = urllib.parse.urlsplit(base_url).path
        m = re.match(r"^/government/history/past-prime-ministers/([^/]+)$", path)
        if m:
            self.enqueue(f"{ROOT}/government/people/{m.group(1)}", depth + 1)
        m = re.match(r"^/government/people/([^/]+)$", path)
        if m:
            self.enqueue(
                f"{ROOT}/government/history/past-prime-ministers/{m.group(1)}",
                depth + 1,
            )

        # Feeds (atom/rss/sitemap) -- record but don't crawl as pages.
        for link in soup.find_all("link", rel=True):
            rels = [r.lower() for r in link.get("rel", [])]
            href = link.get("href")
            typ = (link.get("type") or "").lower()
            if not href:
                continue
            full = urllib.parse.urljoin(base_url, href)
            if "alternate" in rels and ("atom" in typ or "rss" in typ or "json" in typ):
                self.record_feed(full, typ or "alternate", base_url)
            if "sitemap" in rels:
                self.record_feed(full, "sitemap", base_url)
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.endswith(".atom") or href.endswith(".rss") or href.endswith(
                "/sitemap.xml"
            ):
                self.record_feed(
                    urllib.parse.urljoin(base_url, href),
                    "atom" if href.endswith(".atom") else
                    "rss" if href.endswith(".rss") else "sitemap",
                    base_url,
                )

        # Anchor links into the same organisation network.
        out: list[str] = []
        for a in soup.find_all("a", href=True):
            full = urllib.parse.urljoin(base_url, a["href"])
            c = canonicalize(full)
            if c and c not in self.visited and c not in self.queued and in_scope(c):
                out.append(c)
        for c in out:
            self.enqueue(c, depth + 1)
        return out

    def save_state(self) -> None:
        with self.lock:
            state = {
                "visited": sorted(self.visited),
                "frontier": [u for _, _, u, _ in self.frontier],
                "failed": self.failed,
                "feeds": self.feeds,
                "fetched_count": self.fetched_count,
                "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            self.state_path.write_text(json.dumps(state, indent=2))

    def write_feeds_md(self) -> None:
        with self.lock:
            feeds = sorted(self.feeds.items())
        by_kind: dict[str, list[tuple[str, str]]] = {}
        for url, info in feeds:
            by_kind.setdefault(info["type"], []).append((url, info["source"]))
        lines = [
            "# Machine-readable feeds discovered while crawling GOV.UK org-chart pages",
            "",
            "Generated by `scripts/govuk_crawl.py`. Each entry lists the feed URL",
            "and the page that first advertised it. Sitemaps and the site-wide",
            "`robots.txt` are also listed below.",
            "",
            f"- site robots: {ROOT}/robots.txt",
            f"- site sitemap: {ROOT}/sitemap.xml",
            "",
        ]
        for kind in sorted(by_kind):
            lines.append(f"## {kind} ({len(by_kind[kind])})")
            lines.append("")
            for url, src in by_kind[kind]:
                lines.append(f"- {url}  \\\n  _from_ {src}")
            lines.append("")
        self.feeds_path.write_text("\n".join(lines))

    def run(self) -> None:
        next_flush = time.time() + 15
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            pending: dict[futures.Future, str] = {}
            while True:
                with self.lock:
                    done = self.fetched_count >= self.max_pages
                if done and not pending:
                    break

                # Top up the pool.
                while not done and len(pending) < self.workers:
                    item = self.pop()
                    if item is None:
                        break
                    url, depth = item
                    with self.lock:
                        if url in self.visited:
                            continue
                        self.visited.add(url)
                    fut = pool.submit(self._safe_fetch, url, depth)
                    pending[fut] = url

                if not pending:
                    break

                wait_done, _ = futures.wait(
                    pending, timeout=2.0, return_when=futures.FIRST_COMPLETED
                )
                for fut in wait_done:
                    pending.pop(fut, None)
                    exc = fut.exception()
                    if exc:
                        self.log(f"worker-error {exc!r}")

                if time.time() >= next_flush:
                    self.save_state()
                    self.write_feeds_md()
                    next_flush = time.time() + 15
                    with self.lock:
                        self.log(
                            f"... fetched={self.fetched_count} "
                            f"queue={len(self.frontier)} feeds={len(self.feeds)}"
                        )

        self.save_state()
        self.write_feeds_md()
        with self.lock:
            self.log(
                f"done fetched={self.fetched_count} visited={len(self.visited)} "
                f"feeds={len(self.feeds)} failed={len(self.failed)}"
            )
        self.log_fp.close()

    def _safe_fetch(self, url: str, depth: int) -> None:
        try:
            self.fetch(url, depth)
        except Exception as exc:  # noqa: BLE001 - last-ditch guard
            self.failed[url] = f"exc:{exc!r}"
            self.log(f"EXC  {url} {exc!r}")


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out",
        default="third_party/govuk/html/orgcharts",
        help="output root (default: %(default)s)",
    )
    parser.add_argument(
        "--seed", action="append", default=None, help="seed URL (repeatable)"
    )
    parser.add_argument("--max", type=int, default=500, help="max pages to fetch")
    parser.add_argument("--workers", type=int, default=4, help="concurrent fetchers")
    parser.add_argument(
        "--delay", type=float, default=0.4,
        help="per-request sleep (seconds, per worker) for politeness",
    )
    parser.add_argument(
        "--refresh", action="store_true", help="re-fetch even if HTML is cached"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="resume from prior state.json (frontier + visited)",
    )
    parser.add_argument(
        "--wikidata-seeds",
        default=None,
        help="Optional path to a JSONL with 'govukSlug' field (e.g. "
             "third_party/data/wikidata/data/people-bridge.jsonl). Each "
             "slug becomes a seed at /government/people/<slug>. Use this "
             "to close known gaps the natural link-graph doesn't reach.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    out_dir = Path(args.out)
    seeds = list(args.seed) if args.seed else list(DEFAULT_SEEDS)
    if args.wikidata_seeds:
        wd_path = Path(args.wikidata_seeds)
        if not wd_path.exists():
            parser.error(f"--wikidata-seeds: {wd_path} not found")
        added = 0
        for line in wd_path.open():
            try:
                slug = json.loads(line).get("govukSlug")
            except json.JSONDecodeError:
                continue
            if slug:
                seeds.append(f"{ROOT}/government/people/{slug}")
                added += 1
        print(f"loaded {added} extra seeds from {wd_path}", file=sys.stderr)
    crawler = Crawler(
        out_dir=out_dir,
        seeds=seeds,
        max_pages=args.max,
        workers=args.workers,
        delay=args.delay,
        refresh=args.refresh,
        resume=args.resume,
    )
    crawler.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
