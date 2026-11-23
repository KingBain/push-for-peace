import time
import unittest
from guard import check


class GuardTests(unittest.TestCase):
    def test_gate(self):
        fresh = time.time() * 1000 + 10000
        self.assertEqual(check({"allowed": True, "expires": fresh})[0], 0)
        self.assertEqual(check({"allowed": False, "expires": fresh})[0], 1)
        self.assertEqual(check({"allowed": True, "expires": 0})[0], 1)
        self.assertEqual(check({})[0], 1)
