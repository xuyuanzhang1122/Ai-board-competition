import json
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "audit_legacy_upstreams.py"


class UpstreamAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)

    def write(self, name, content, tracked=True):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        if tracked:
            subprocess.run(["git", "-C", str(self.root), "add", "--", name], check=True)
        return target

    def run_audit(self, *args):
        return subprocess.run(
            ["python3", str(SCRIPT), "--root", str(self.root), "--json", *args],
            text=True, capture_output=True,
        )

    def test_finds_runtime_providers_models_and_fallback_without_source_text(self):
        self.write("backend/src/main/java/Client.java",
                   'GeeknowClient secret="NEVER_PRINT_ME";\nhttps://geeknow.ai\n')
        self.write("frontend/src/model.ts", "defaultModel = 'gpt-image-2-4k'\n")
        self.write(".env.example", "API_URL=https://api.sudashuiapi.com\n")
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["counts"]["runtime"], 4)
        self.assertNotIn("NEVER_PRINT_ME", result.stdout)
        self.assertEqual(report["findings"][0]["line"], 1)

    def test_preserves_history_and_tests_without_blocking_runtime_gate(self):
        self.write("backend/src/main/resources/db/migration/V31__old.sql", "Sudashui\n")
        self.write("backend/src/test/java/ClientTest.java", "GeeknowClient\n")
        self.write("frontend/src/model.test.ts", "gpt-image-2\n")
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["counts"],
                         {"runtime": 0, "historical_migration": 1, "test": 2})

    def test_ignores_untracked_files_local_config_docs_and_dependencies(self):
        self.write("backend/src/main/java/Untracked.java", "GeeknowClient", tracked=False)
        for path in [".env", "backend/.env", "backend/src/main/resources/application.properties",
                     "backend/src/main/resources/application-local.yml", "docs/plan.md",
                     "frontend/node_modules/old.ts", "frontend/pnpm-lock.yaml"]:
            self.write(path, "Geeknow secret=DO_NOT_READ")
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["findings"], [])

    def test_new_provider_names_are_not_old_upstreams(self):
        self.write("backend/src/main/java/Providers.java", "MiMo DeepSeek Volcengine Kling\n")
        self.write("frontend/src/model.ts", "seedream-5-0 seedance-2-5\n")
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_video_aliases_and_legacy_seedream_are_detected_without_provider_name(self):
        self.write("frontend/src/video.ts", "sd-2-720p\nsd-api-2-fast-720p\ndoubao-seedream-5-0\n")
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(json.loads(result.stdout)["counts"]["runtime"], 3)

    def test_does_not_follow_tracked_symlinks(self):
        outside = self.root / "private.txt"
        outside.write_text("Geeknow PRIVATE_CONTENT")
        link = self.root / "backend/src/main/java/Linked.java"
        link.parent.mkdir(parents=True)
        link.symlink_to(outside)
        subprocess.run(["git", "-C", str(self.root), "add", "--", str(link)], check=True)
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["errors"][0]["reason"], "symlink_not_scanned")
        self.assertNotIn("PRIVATE_CONTENT", result.stdout + result.stderr)

    def test_fails_closed_on_missing_tracked_source(self):
        path = self.write("frontend/src/missing.ts", "Geeknow")
        path.unlink()
        result = self.run_audit("--check")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["errors"][0]["reason"], "unreadable_source")

    def test_rejects_non_repository_instead_of_reporting_a_clean_scan(self):
        result = subprocess.run(["python3", str(SCRIPT), "--root", "/", "--check"],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("Audit failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
