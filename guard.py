"""Read the local verdict without loading credentials or calling Garmin."""
import json
import os
import sys
import time
from pathlib import Path

HOME = Path(__file__).resolve().parent
AFFIRMATIONS = (
    "You are allowed to call it a day with a green build.",
    "Your worth is independent of your contribution graph.",
    "You have already done enough to earn a break.",
    "Tomorrow's you is a perfectly qualified reviewer.",
)


def check(state):
    now = time.time() * 1000
    if not (type(state.get("expires")) in (int, float)
            and now < state["expires"] <= now + 3600000
            and type(state.get("allowed")) is bool):
        return 1, "Push paused: health readings are missing, invalid, or expired. Click the Push for Peace status-bar item in VS Code to refresh and see details."
    if state["allowed"]:
        return 0, "Push approved. May your diff be small."
    return 1, "Push paused. Please, choose peace. The branch can wait. " + AFFIRMATIONS[int.from_bytes(os.urandom(2), "big") % len(AFFIRMATIONS)]


if __name__ == "__main__":
    if sys.argv[1:] == ["demo"]:
        for flag in (True, False, None):
            print(check({"allowed": flag, "expires": time.time() * 1000 + 5000})[1])
    else:
        try:
            state = json.loads((HOME / "verdict.json").read_text())
            code, message = check(state)
        except (ValueError, OSError, AttributeError):
            code, message = check({})
        print(message, file=sys.stderr)
        sys.exit(code)
