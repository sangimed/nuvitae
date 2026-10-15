#!/usr/bin/env python3
"""Validate checkout targets referenced by Nuvitae's GitHub Markdown links.

The public site deliberately links to authoritative Markdown outside docs/site.
MkDocs does not validate those GitHub URLs because their targets are not in its
docs directory. This check maps only this repository's immutable main-branch
blob/tree URLs back to the checked-out paths; it makes no network requests.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


REPOSITORY_PATH = re.compile(
    r"^/sangimed/nuvitae/(?:blob|tree)/main/(?P<path>[^#?]+)$"
)
MARKDOWN_LINK = re.compile(r"\]\((?P<target>[^\s)]+)(?:\s+[^)]*)?\)")


def referenced_repository_paths(markdown: str) -> list[str]:
    """Return local paths for GitHub blob/tree links owned by this repository."""
    paths: list[str] = []
    for match in MARKDOWN_LINK.finditer(markdown):
        parsed = urlsplit(match.group("target"))
        if parsed.scheme != "https" or parsed.netloc != "github.com":
            continue

        repository_match = REPOSITORY_PATH.fullmatch(parsed.path)
        if repository_match:
            paths.append(unquote(repository_match.group("path")))
    return paths


def markdown_files(root: Path, requested_paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for requested_path in requested_paths:
        path = root / requested_path
        if path.is_dir():
            files.extend(sorted(path.rglob("*.md")))
        elif path.is_file():
            files.append(path)
        else:
            raise ValueError(f"documentation input does not exist: {requested_path}")
    return files


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate checkout paths referenced by Nuvitae GitHub Markdown links."
    )
    parser.add_argument("--root", type=Path, required=True, help="checkout root")
    parser.add_argument("paths", nargs="+", help="Markdown files or directories to scan")
    arguments = parser.parse_args()

    root = arguments.root.resolve()
    failures: list[str] = []
    for markdown_file in markdown_files(root, arguments.paths):
        relative_source = markdown_file.relative_to(root)
        for referenced_path in referenced_repository_paths(markdown_file.read_text(encoding="utf-8")):
            target = (root / referenced_path).resolve()
            try:
                target.relative_to(root)
            except ValueError:
                failures.append(f"{relative_source}: repository link escapes checkout: {referenced_path}")
                continue

            if not target.exists():
                failures.append(f"{relative_source}: missing repository link target: {referenced_path}")

    if failures:
        print("Repository documentation link validation failed:", file=sys.stderr)
        print("\n".join(f"- {failure}" for failure in failures), file=sys.stderr)
        return 1

    print("Repository documentation link validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
