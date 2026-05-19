#!/usr/bin/env python3
"""Reconcile FCDO UKTO treaty records to the Parliament Treaties API.

Parliament's `/api/Treaty` endpoint takes a SearchText filter but no
direct Command-Paper-number filter, so the reconciliation works by
fetching the whole Parliament treaty set (~323 records, paged 20 at
a time) and matching against UKTO records by (CP prefix, CP number)
and signed-date proximity.

Output:
    third_party/data/fcdo_treaties/extractors/factoids/parliament-bridge.ttl
        Turtle: owl:sameAs + parl:treatyId for matched UKTO records.
    third_party/data/fcdo_treaties/extractors/factoids/parliament-bridge.json
        Cache of the full Parliament treaty list so re-runs don't
        re-paginate the API.

    python3 scripts/fcdo_treaties_reconcile_parliament.py
    python3 scripts/fcdo_treaties_reconcile_parliament.py --refresh
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

UA = ("forgetmenot-treaty-bridge/0.1 "
      "(+https://github.com/danbri/forgetmenot)")
RECORDS_DIR = Path("third_party/data/fcdo_treaties/records")
OUT_DIR     = Path("third_party/data/fcdo_treaties/extractors/factoids")
PARL_BASE   = "https://treaties-api.parliament.uk/api"

CP_RE = re.compile(r"\b(C[Pm])\s*(\d{3,5})\b", re.IGNORECASE)


def fetch_all_parliament_treaties(delay: float) -> list[dict]:
    """Page through the Parliament Treaties API and collect every
    treaty (Take=20 hard cap per request)."""
    out: list[dict] = []
    skip = 0
    take = 20
    while True:
        qs = urllib.parse.urlencode({"Skip": skip, "Take": take})
        url = f"{PARL_BASE}/Treaty?{qs}"
        req = urllib.request.Request(
            url, headers={"User-Agent": UA, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
        items = [it["value"] for it in (data.get("items") or [])]
        if not items:
            break
        out.extend(items)
        if len(items) < take:
            break
        skip += take
        time.sleep(delay)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true",
                        help="re-page the Parliament API even if cached")
    parser.add_argument("--delay", type=float, default=0.4)
    args = parser.parse_args(argv)

    records = sorted(RECORDS_DIR.glob("*.json"))
    if not records:
        sys.exit("no records; run scripts/fcdo_treaties_crawl.py first")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_ttl   = OUT_DIR / "parliament-bridge.ttl"
    out_cache = OUT_DIR / "parliament-bridge.json"

    if not args.refresh and out_cache.exists():
        parl = json.loads(out_cache.read_text())
        print(f"  using cached Parliament treaty list ({len(parl)} records)",
              file=sys.stderr)
    else:
        print("  fetching Parliament Treaties API ...", file=sys.stderr)
        parl = fetch_all_parliament_treaties(args.delay)
        out_cache.write_text(json.dumps(parl, indent=2, ensure_ascii=False))
        print(f"  cached {len(parl)} Parliament treaties", file=sys.stderr)

    # Build an index on (CP prefix, CP number).
    parl_by_cp: dict[tuple[str, int], dict] = {}
    for p in parl:
        pre = (p.get("commandPaperPrefix") or "").upper().strip()
        num = p.get("commandPaperNumber")
        if pre and num is not None:
            parl_by_cp[(pre, int(num))] = p

    bridge: list[dict] = []
    matched_ids: set[str] = set()
    for path in records:
        try:
            rec = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        ukto_id = rec.get("id")
        if not ukto_id:
            continue
        cps = []
        for ref in (rec.get("references") or []):
            for m in CP_RE.finditer(ref or ""):
                cps.append((m.group(1).upper(), int(m.group(2))))
        # Some UKTO refs use "Cm" and Parliament records "CM"; the
        # tuple key already uppercases. Normalise Cm→CM, CP→CP.
        for cp in cps:
            p = parl_by_cp.get(cp)
            if not p:
                continue
            bridge.append({
                "ukto_id": ukto_id,
                "ukto_title": rec.get("title"),
                "ukto_signed_date": rec.get("signed_date"),
                "command_paper": f"{cp[0]} {cp[1]}",
                "parl_id": p.get("id"),
                "parl_uri": p.get("uri"),
                "parl_name": p.get("name"),
                "parl_signed_date": p.get("signedDate"),
                "parl_weblink": p.get("webLink"),
            })
            matched_ids.add(ukto_id)
            break

    # Emit Turtle.
    lines = [
        "# Reconciliation of FCDO UKTO treaty records to Parliament",
        "# Treaty IDs, joined on Command Paper number.",
        f"# generated_at: {date.today().isoformat()}",
        f"# reconciled: {len(matched_ids)} UKTO records "
        f"against {len(parl)} Parliament treaty records",
        "",
        "@prefix owl:    <http://www.w3.org/2002/07/owl#> .",
        "@prefix parl:   <https://id.parliament.uk/schema/> .",
        "@prefix fm:     <https://forgetmenot.local/vocab#> .",
        "",
    ]
    for b in sorted(bridge, key=lambda x: x["ukto_id"]):
        ukto_uri = (f"<https://treaties.fcdo.gov.uk/awweb/awfp/recno/"
                    f"{b['ukto_id']}>")
        lines.append(ukto_uri)
        if b.get("parl_uri"):
            lines.append(f"  owl:sameAs <{b['parl_uri']}> ;")
        if b.get("parl_id"):
            lines.append(f'  parl:treatyId "{b["parl_id"]}" ;')
        lines.append(f'  fm:commandPaper "{b["command_paper"]}" .')
        lines.append("")
    out_ttl.write_text("\n".join(lines))

    summary = {
        "ukto_records":         len(records),
        "parliament_records":   len(parl),
        "ukto_records_with_cp": sum(1 for r in records
                                     if CP_RE.search(
                                         " ".join(json.loads(r.read_text())
                                                  .get("references", []) or []))),
        "reconciled_pairs":     len(bridge),
        "unique_ukto_matched":  len(matched_ids),
    }
    print(f"reconciled {len(matched_ids)} UKTO records "
          f"to {len(parl)} Parliament treaties -> {out_ttl}")
    print(f"  ({summary['ukto_records_with_cp']} UKTO records had "
          f"a CP/Cm reference at all)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
