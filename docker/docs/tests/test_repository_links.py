"""Regression tests for the offline repository-link checker."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


CHECKER = Path("/usr/local/bin/check-repository-links.py")


class RepositoryLinkCheckerTests(unittest.TestCase):
    def run_checker(self, root: Path, source: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CHECKER), "--root", str(root), str(source)],
            check=False,
            capture_output=True,
            text=True,
        )

    def write_source(self, root: Path, link: str) -> Path:
        source = root / "source.md"
        source.write_text(f"[target]({link})\n", encoding="utf-8")
        return source

    def test_blob_files_and_tree_directories_are_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "guide.md").write_text("Guide", encoding="utf-8")
            (root / "guides").mkdir()
            source = root / "source.md"
            source.write_text(
                "[file](https://github.com/sangimed/nuvitae/blob/main/guide.md)\n"
                "[directory](https://github.com/sangimed/nuvitae/tree/main/guides)\n",
                encoding="utf-8",
            )

            result = self.run_checker(root, source)

            self.assertEqual(result.returncode, 0, result.stderr)

    def test_blob_link_to_directory_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "guides").mkdir()
            source = self.write_source(
                root,
                "https://github.com/sangimed/nuvitae/blob/main/guides",
            )

            result = self.run_checker(root, source)

            self.assertEqual(result.returncode, 1)
            self.assertIn("blob repository link target is not a file", result.stderr)

    def test_tree_link_to_file_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "guide.md").write_text("Guide", encoding="utf-8")
            source = self.write_source(
                root,
                "https://github.com/sangimed/nuvitae/tree/main/guide.md",
            )

            result = self.run_checker(root, source)

            self.assertEqual(result.returncode, 1)
            self.assertIn("tree repository link target is not a directory", result.stderr)

    def test_symlink_target_escaping_checkout_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            root = temporary_root / "checkout"
            root.mkdir()
            outside_target = temporary_root / "outside.md"
            outside_target.write_text("Outside", encoding="utf-8")
            (root / "outside.md").symlink_to(outside_target)
            source = self.write_source(
                root,
                "https://github.com/sangimed/nuvitae/blob/main/outside.md",
            )

            result = self.run_checker(root, source)

            self.assertEqual(result.returncode, 1)
            self.assertIn("repository link escapes checkout", result.stderr)


if __name__ == "__main__":
    unittest.main()
