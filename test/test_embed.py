import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

from embed import payload


class EmbedTests(unittest.TestCase):
    def test_missing_stale_and_legacy_readings(self):
        now = time.time() * 1000
        good = {"health": {"hr": 72, "bb": 68, "hrAt": now, "bbAt": now}}
        self.assertEqual(payload(good, now), {"v": 1, "hr": 72, "bb": 68})
        self.assertIsNone(payload({}, now))
        for field, value in [("hr", None), ("bb", None), ("hrAt", now-1800000),
                             ("bbAt", now+1), ("hr", True)]:
            changed = {"health": dict(good["health"], **{field: value})}
            self.assertIsNone(payload(changed, now))

    def test_real_commit_and_amend(self):
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder)
            helper = repo / "private"
            helper.mkdir()
            shutil.copyfile(Path(__file__).resolve().parents[1] / "embed.py", helper / "embed.py")
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=repo, text=True,
                                               stderr=subprocess.PIPE)
            git("init", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.com")
            hooks = repo / ".git/hooks"
            (hooks / "pre-push").write_text("#!/bin/sh\n# Push for Peace\n# " + str(helper / "guard.py") + "\n")
            message_hook = hooks / "commit-msg"
            message_hook.write_text('#!/bin/sh\nexec "' + sys.executable + '" -I "' +
                                    str(helper / "embed.py") + '" "$1"\n')
            message_hook.chmod(0o755)
            def readings(hr=72):
                now = time.time()*1000
                (helper / "verdict.json").write_text(json.dumps({"health":
                    {"hr": hr, "bb": 68, "hrAt": now, "bbAt": now}}))
            readings()
            git("commit", "--allow-empty", "-m", "Fix login redirect\n\nKeep this body.\n\nReviewed-by: Test")
            first = git("log", "-1", "--format=%B")
            self.assertIn('Push-For-Peace: {"v":1,"hr":72,"bb":68}', first)
            self.assertIn("Keep this body.", first)
            self.assertIn("Reviewed-by: Test", first)
            readings(80)
            git("commit", "--amend", "--allow-empty", "--no-edit")
            amended = git("log", "-1", "--format=%B")
            self.assertEqual(amended.count("Push-For-Peace:"), 1)
            self.assertIn('"hr":80', amended)
            (helper / "verdict.json").unlink()
            git("commit", "--amend", "--allow-empty", "--no-edit")
            missing = git("log", "-1", "--format=%B")
            self.assertNotIn("Push-For-Peace:", missing)
            self.assertIn("Reviewed-by: Test", missing)
            readings()
            (hooks / "pre-push").unlink()
            git("commit", "--allow-empty", "-m", "Guard disabled")
            self.assertNotIn("Push-For-Peace:", git("log", "-1", "--format=%B"))
            # Empty messages must still be rejected even when readings exist.
            (hooks / "pre-push").write_text("#!/bin/sh\n# Push for Peace\n# " + str(helper / "guard.py") + "\n")
            with self.assertRaises(subprocess.CalledProcessError):
                git("commit", "--allow-empty", "-m", "")
