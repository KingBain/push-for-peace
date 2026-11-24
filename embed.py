"""Append opt-in health metadata using the latest fresh local readings."""
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

HOME = Path(__file__).resolve().parent
PREFIX = "Push-For-Peace: "


def payload(state, now):
    health = state.get("health", {})
    fields = (("hr", 1, 300), ("bb", 0, 100))
    for name, low, high in fields:
        value = health.get(name)
        stamp = health.get(name + "At")
        if (type(value) not in (int, float) or not low <= value <= high
                or type(stamp) not in (int, float) or not math.isfinite(stamp)
                or not 0 <= now - stamp < 3600000):
            return None
    return {"v": 1, "hr": health["hr"], "bb": health["bb"]}


def update_message(message, health):
    # Only our standalone JSON trailer is managed. Other message text is retained.
    pattern = re.compile(r"^Push-For-Peace: (\{[^\r\n]*\})\r?\n?$")
    lines = message.splitlines(keepends=True)
    for index in range(len(lines) - 1, -1, -1):
        match = pattern.match(lines[index])
        if match:
            try:
                old = json.loads(match[1])
            except ValueError:
                continue
            if isinstance(old, dict) and old.get("v") == 1 and "hr" in old and "bb" in old:
                del lines[index]
    cleaned = "".join(lines)
    if cleaned != message:
        cleaned = cleaned.rstrip("\r\n") + "\n"
    meaningful = subprocess.run(
        ["git", "stripspace", "--strip-comments"], input=cleaned,
        text=True, capture_output=True, check=True).stdout.strip()
    if health is None or not meaningful:
        return cleaned
    # Git places the trailer correctly alongside other trailers and editor comments.
    return subprocess.run(
        ["git", "interpret-trailers", "--if-exists", "replace",
         "--trailer", PREFIX + json.dumps(health, separators=(",", ":"))],
        input=cleaned, text=True, capture_output=True, check=True).stdout


def main():
    message_path = Path(sys.argv[1])
    target = subprocess.check_output(
        ["git", "rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"],
        text=True).strip()
    try:
        push_hook = Path(target).read_text()
        enabled = "# Push for Peace\n" in push_hook and str(HOME / "guard.py") in push_hook
    except OSError:
        enabled = False
    try:
        state = json.loads((HOME / "verdict.json").read_text())
        health = payload(state, time.time() * 1000) if enabled else None
    except (OSError, ValueError, AttributeError, TypeError):
        health = None
    original = message_path.read_bytes().decode("utf-8", errors="surrogateescape")
    updated = update_message(original, health)
    if updated != original:
        message_path.write_bytes(updated.encode("utf-8", errors="surrogateescape"))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError):
        print("Push for Peace could not embed health stats.", file=sys.stderr)
        sys.exit(1)
