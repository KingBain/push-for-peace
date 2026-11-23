import builtins
import runpy
import time
import unittest
from pathlib import Path
from unittest.mock import patch


class MinimalPythonTest(unittest.TestCase):
    def test_guard_does_not_need_secrets(self):
        original = builtins.__import__

        def restricted(name, *args, **kwargs):
            if name == 'secrets':
                raise ModuleNotFoundError("No module named 'secrets'")
            return original(name, *args, **kwargs)

        with patch('builtins.__import__', side_effect=restricted):
            guard = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'guard.py'))
            expiry = time.time() * 1000 + 10000
            self.assertEqual(guard['check']({'allowed': True, 'expires': expiry})[0], 0)
            code, message = guard['check']({'allowed': False, 'expires': expiry})
            self.assertEqual(code, 1)
            self.assertTrue(any(text in message for text in guard['AFFIRMATIONS']))
            self.assertEqual(guard['check']({})[0], 1)
