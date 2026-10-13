#!/usr/bin/env python3
"""Offline inventory of tracked upstream references. Never prints source contents.

This is a static migration aid, not proof of API routing or runtime isolation.
Exit codes: 0 inventory/clean check, 1 runtime references, 2 incomplete scan.
"""

import argparse
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys


RULES = {
    "geeknow": re.compile(r"geeknow", re.I),
    "sudashui": re.compile(r"sudashui", re.I),
    "sub2api": re.compile(r"sub2api|qs\.szscp\.com", re.I),
    "agnes": re.compile(r"agnes", re.I),
    "legacy_video_gateway": re.compile(r"newapi|zizi", re.I),
    "legacy_model": re.compile(
        r"gemini[-_]|gpt[-_](?:image|4o)|grok[-_]|"
        r"seedance[-_]2[.-]0|doubao-seedance-1[-_]5|"
        r"\bsd-(?:api-)?2-|doubao-seedream-5", re.I
    ),
}
SUFFIXES = {".java", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".sql",
            ".properties", ".yml", ".yaml", ".conf", ".xml", ".sh"}


def category(name):
    path = PurePosixPath(name)
    # Local credentials are excluded even if accidentally added to the index.
    if any(part in {"node_modules", "target", "dist", ".git", "credentials", "secrets"}
           for part in path.parts):
        return None
    if path.name.startswith(".env") and not path.name.endswith(".example"):
        return None
    if path.name.startswith("application") and path.suffix in {".properties", ".yml", ".yaml"}:
        return None
    if path.name.endswith(".example") and (
        path.name.startswith(".env")
        or path.name.startswith("application")
    ):
        return "runtime"
    if name.startswith("backend/src/main/resources/db/migration/") and path.suffix == ".sql":
        return "historical_migration"
    if name.startswith("backend/src/test/") or (
        name.startswith(("frontend/src/", "frontend-admin/src/"))
        and re.search(r"\.(test|spec)\.[^.]+$", name)
    ):
        return "test"
    if name.startswith(("backend/src/main/", "frontend/src/", "frontend-admin/src/")):
        return "runtime" if path.suffix in SUFFIXES else None
    if name == ".env.example" or name.startswith("Dockerfile"):
        return "runtime"
    if len(path.parts) == 2 and path.parts[0] in {"frontend", "frontend-admin"}:
        return "runtime" if path.suffix in {".ts", ".js", ".mjs", ".cjs", ".json"} else None
    if path.suffix in SUFFIXES and (len(path.parts) == 1 or name.startswith("infra/")):
        return "runtime"
    return None


def git(root, *args):
    return subprocess.run(["git", "-C", str(root), *args], check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout


def scan(root):
    if Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() != root:
        raise ValueError("--root must be the repository root")
    findings, errors = [], []
    counts = {"runtime": 0, "historical_migration": 0, "test": 0}
    for raw in sorted(git(root, "ls-files", "-z").split(b"\0")):
        if not raw:
            continue
        name = raw.decode("utf-8")
        kind = category(name)
        if kind is None:
            continue
        target = root / name
        if target.is_symlink() or any(p.is_symlink() for p in target.parents if p != root):
            errors.append({"path": name, "reason": "symlink_not_scanned"})
            continue
        try:
            lines = target.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError):
            errors.append({"path": name, "reason": "unreadable_source"})
            continue
        for number, line in enumerate(lines, 1):
            matches = sorted(rule for rule, pattern in RULES.items() if pattern.search(line))
            if matches:
                findings.append({"path": name, "line": number,
                                 "category": kind, "rules": matches})
                counts[kind] += 1
    return {"schema_version": 1, "counts": counts, "findings": findings, "errors": errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", action="store_true", help="machine-readable inventory; no source excerpts")
    parser.add_argument("--check", action="store_true", help="fail when runtime references remain")
    args = parser.parse_args()
    try:
        report = scan(args.root.resolve())
    except (OSError, ValueError, subprocess.CalledProcessError):
        print("Audit failed: repository root or tracked paths cannot be inspected.", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("Tracked-source inventory (excludes local configuration and live services)")
        print(json.dumps(report["counts"], ensure_ascii=False))
        for item in report["findings"]:
            print(f'{item["category"]}: {item["path"]}:{item["line"]} [{", ".join(item["rules"])}]')
        for item in report["errors"]:
            print(f'ERROR: {item["path"]} [{item["reason"]}]')
    if report["errors"]:
        return 2
    return 1 if args.check and report["counts"]["runtime"] else 0


if __name__ == "__main__":
    sys.exit(main())
