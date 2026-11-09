"""Exercise the ordinary boundary entrypoint against isolated tracked trees."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPOSITORY = Path(__file__).resolve().parents[1]
BOUNDARY = REPOSITORY / "scripts/check-public-boundary.sh"
ENVIRONMENT = {"PATH": os.defpath, "LC_ALL": "C.UTF-8", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}


class PersonalSettingsBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.git("init", "--quiet")
        self.git("config", "user.name", "Boundary fixture")
        self.git("config", "user.email", "boundary@example.test")
        self.write(".gitignore", (REPOSITORY / ".gitignore").read_text())
        self.git("add", ".gitignore")
        self.git("commit", "--quiet", "-m", "Initialize fixture")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=ENVIRONMENT, check=True, capture_output=True, text=True)

    def write(self, name, content="canary-value-must-not-be-read\n"):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def scan(self):
        return subprocess.run(["bash", str(BOUNDARY), str(self.root)], env=ENVIRONMENT, capture_output=True, text=True)

    def test_tracked_paths_refuse_before_content_scans(self):
        for name in [".claude/settings.local.json", "component/.claude/settings.local.json", "line\nbreak/.claude/settings.local.json", "node_modules/dependency/.claude/settings.local.json"]:
            with self.subTest(name=name):
                path = self.write(name)
                self.git("add", "-f", "--", name)
                path.chmod(0)
                try:
                    result = self.scan()
                finally:
                    path.chmod(0o600)
                    self.git("rm", "--cached", "--quiet", "--", name)
                    path.unlink()
                self.assertEqual(1, result.returncode, result.stderr)
                self.assertIn("forbidden project-local settings path:", result.stderr)
                self.assertNotIn("canary-value-must-not-be-read", result.stdout + result.stderr)
                self.assertNotIn("line\nbreak", result.stderr)

    def test_root_and_nested_untracked_settings_are_ignored(self):
        for name in [".claude/settings.local.json", "component/.claude/settings.local.json"]:
            self.write(name)
            self.git("check-ignore", "--quiet", "--", name)
        self.git("add", ".")
        self.assertEqual("", self.git("ls-files", "--", "*.local.json").stdout)
        result = self.scan()
        self.assertEqual(0, result.returncode, result.stderr)

    def test_near_names_remain_allowed(self):
        for name in [".claude/settings.json", ".claude/settings.local.json.example", "component/settings.local.json"]:
            self.write(name, "{}\n")
            self.git("add", "--", name)
        result = self.scan()
        self.assertEqual(0, result.returncode, result.stderr)

    def test_preexisting_tracked_file_refuses_after_unrelated_commit(self):
        self.write("legacy/.claude/settings.local.json")
        self.git("add", "-f", ".")
        self.git("commit", "--quiet", "-m", "Historical tracked fixture")
        self.write("README.md", "Unrelated documentation\n")
        self.git("add", "README.md")
        self.git("commit", "--quiet", "-m", "Unrelated update")
        result = self.scan()
        self.assertEqual(1, result.returncode)
        self.assertIn("legacy/.claude/settings.local.json", result.stderr)
        self.assertNotIn("canary-value-must-not-be-read", result.stdout + result.stderr)

    def test_existing_content_rule_still_refuses(self):
        self.write("README.md", "zor" + "poration/fixture\n")
        self.git("add", "README.md")
        result = self.scan()
        self.assertEqual(1, result.returncode)
        self.assertIn("forbidden file content", result.stderr)


if __name__ == "__main__":
    unittest.main()
