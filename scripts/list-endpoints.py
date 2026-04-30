#!/usr/bin/env python3
"""List endpoints from a cached OpenAPI / Swagger spec.

  python3 scripts/list-endpoints.py _specs/members.json
  python3 scripts/list-endpoints.py _specs/*.json --table

For each spec, prints the path, the HTTP methods, and the operationId /
summary. Used during skill authoring to keep the reference docs honest.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load(path: Path) -> dict:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    return json.loads(raw)


def list_one(path: Path, table: bool) -> None:
    spec = load(path)
    title = spec.get("info", {}).get("title", path.stem)
    base = ""
    if "host" in spec:
        scheme = (spec.get("schemes") or ["https"])[0]
        base = f"{scheme}://{spec['host']}{spec.get('basePath', '')}"
    elif "servers" in spec and spec["servers"]:
        base = spec["servers"][0].get("url", "")
    print(f"\n# {title}")
    if base:
        print(f"  base: {base}")
    paths = spec.get("paths", {})
    for p in sorted(paths):
        methods = paths[p]
        for m in sorted(methods):
            if m.startswith("x-") or m == "parameters":
                continue
            op = methods[m]
            summary = op.get("summary") or op.get("operationId") or ""
            if table:
                print(f"  {m.upper():6s} {p:60s} {summary}")
            else:
                print(f"  {m.upper()} {p}")
                if summary:
                    print(f"    {summary}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("specs", nargs="+", type=Path)
    ap.add_argument("--table", action="store_true", help="Compact one-line-per-op format")
    args = ap.parse_args()
    for spec in args.specs:
        if not spec.exists():
            print(f"missing: {spec}", file=sys.stderr)
            return 2
        list_one(spec, args.table)
    return 0


if __name__ == "__main__":
    sys.exit(main())
