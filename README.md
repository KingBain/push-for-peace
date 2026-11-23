# Push for Peace

In a trusted VS Code window on macOS, Linux or WSL, run Connect Garmin and paste an expiring Personal API key created on Garmin Connect Web. Requires Git and python3. Run Enable Guard in each clone. Existing pre-push hooks are respected. Run Disable Guard before uninstalling.

Only the extension retrieves the key from VS Code SecretStorage. It exchanges it at Garmin for an in-memory bearer token. Every five minutes while VS Code is running, it reads synced heart rate and Body Battery and saves a local allow/block verdict and expiry. The hook reads that verdict even outside VS Code. Once it expires, pushes pause until the extension refreshes. Refresh Readings forces a check. The inclusive joke thresholds are 50–110 bpm and Body Battery of at least 25. Each sample must be less than 30 minutes old.

Disconnect Garmin forgets the local key and verdict. Delete the key in Garmin Connect to revoke it. During upgrade the extension deletes its own v0.1 session folder and replaces its old helper, including for previously installed hooks. Local deletion does not revoke a remote session. Source is under extension/ inside the VSIX archive.

## Development and releases

Use Node from .nvmrc and Python 3. Run npm test, then npm run package.
The archive is written to dist/. This project has no npm package dependencies.
The publisher identifier remains local-prototypes so existing installations
retain their stored key and hook paths.

Push source to KingBain/push-for-peace on main. Pull requests and main pushes
run the checks. To publish version 0.2.1, push tag v0.2.1.
The tag must match package.json. Subsequent releases require incrementing
package.json and pushing its corresponding tag. GitHub Releases hosts the VSIX.
Live Garmin authentication and full VS Code integration still require local testing.
