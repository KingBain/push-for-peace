# Push for Peace

In a trusted VS Code window on macOS, Linux or WSL, run Connect Garmin and paste an expiring Personal API key created on Garmin Connect Web. Requires Git and python3. Run Enable Guard in each clone. Existing pre-push hooks are respected. Run Disable Guard before uninstalling.

Only the extension retrieves the key from VS Code SecretStorage. It exchanges it at Garmin for an in-memory bearer token. Every five minutes while VS Code is running, it reads synced heart rate and Body Battery and saves a local allow/block verdict, expiry, and latest health readings. The hook reads that verdict even outside VS Code. Once it expires, pushes pause until the extension refreshes. Refresh Readings forces a check. The inclusive joke thresholds are 50–110 bpm and Body Battery of at least 25. Each sample must be less than 60 minutes old.

Disconnect Garmin forgets the local key and verdict. Delete the key in Garmin Connect to revoke it. During upgrade the extension deletes its own v0.1 session folder and replaces its old helper, including for previously installed hooks. Local deletion does not revoke a remote session. Source is under extension/ inside the VSIX archive.

## Development and releases

Use Node from .nvmrc and Python 3. Run npm test, then npm run package.
The archive is written to dist/. This project has no npm package dependencies.
The publisher identifier remains local-prototypes so existing installations
retain their stored key and hook paths.

Push source to KingBain/push-for-peace on main. Pull requests and main pushes
run the checks.

To publish through GitHub, open Actions, select Release VSIX, and click Run
workflow on main. Choose patch (default), minor, or major. For version 0.2.1,
these produce 0.2.2, 0.3.0, or 1.0.0 respectively. The workflow updates
package.json, runs tests, packages the VSIX, creates the matching tag, and
publishes a GitHub Release. An optional exact version overrides the increment.

Re-running the same workflow run resumes its tagged version. To resume from
a new workflow run, enter that version in the optional override field.

## Updates

The extension checks the latest stable GitHub release once per day and offers
Install Update. You can also run Push for Peace: Check for Updates. Downloads
are checked against GitHub's SHA-256 asset digest before VS Code installs them.
Reload when prompted. Automatic checks can be disabled in the
pushForPeace.checkForUpdates setting.

Install the first release containing this updater manually. Later releases can
be installed from its notification. In remote windows (SSH, containers, WSL),
the notification opens the release download page for manual installation into
that window.

Live Garmin authentication and full VS Code installation still require local testing.


## Optional health trailers

Run Push for Peace: Enable Health Embedding in a repository with its guard enabled.
The confirmation explains that health data enters Git history, can be read by
anyone with repository access, and may become public if the repository becomes
public. Consent is local to that clone (shared by linked worktrees). Existing
commit-msg hooks must be handled before enabling.

Commits get a trailer such as `Push-For-Peace: {"v":1,"hr":72,"bb":68}`.
Heart rate is in bpm and Body Battery is its 0–100 score. On amend, the managed
trailer is replaced with the latest cached readings. If either reading is missing,
invalid, or 60 minutes old, the managed trailer is removed and nothing is appended.
Older caches without health readings are treated as unavailable. The extension
refreshes its cache every five minutes; Refresh Readings forces an immediate fetch.

The hook runs for terminal and VS Code commits. Disable Health Embedding removes
it, and Disable Guard removes both owned hooks. Existing committed health data
remains in history. Disabling embedding leaves existing commit messages under
normal Git behavior, including when amending them. Git --no-verify bypasses
commit-msg and therefore also bypasses trailer refresh/removal.

### Reading status and Python dependencies

The status bar shows heart rate (bpm) and Body Battery (%) from the most recent
Garmin API refresh. Click it to refresh; hover for sample timestamps and push
eligibility. Missing or expired values display a dash. These are cached readings,
not a live connection to the watch. Values expire after 60 minutes, even when a
background refresh fails. Refresh messages distinguish missing, unreadable,
stale, and future-dated samples rather than assuming the watch has not synced.
Health details stay in the local status UI and verdict cache; credentials and raw
API responses are not logged.

Hooks require Python 3.8+ and its standard library in the environment running Git
(including the dev container). Enabling either hook now checks those dependencies
first. The guard no longer imports `secrets` to select affirmations. On
Ubuntu/Debian, install `python3` and `libpython3-stdlib` in the container image to
make the dependencies survive rebuilds.
