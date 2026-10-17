"""Regression-test the slim CI inventory."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class WorkflowBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="devops-ci-policy-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / ".github"
        shutil.copytree(Path(__file__).resolve().parent, self.root, ignore=shutil.ignore_patterns("__pycache__"))

    def check(self):
        return subprocess.run(
            [sys.executable, str(self.root / "check-devops-config.py")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )

    def test_current_workflows_pass(self):
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_missing_verify_job_is_rejected(self):
        path = self.root / "workflows/ci.yml"
        data = __import__("yaml").safe_load(path.read_text(encoding="utf-8"))
        del data["jobs"]["verify"]
        path.write_text(__import__("yaml").safe_dump(data), encoding="utf-8")
        self.assertNotEqual(self.check().returncode, 0)


if __name__ == "__main__":
    unittest.main()
