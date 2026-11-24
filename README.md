# Push for Peace

**Take a breath before you push.**

Push for Peace is a VS Code extension that uses Garmin health data to encourage calmer Git pushes. It checks your heart rate and Body Battery before allowing a push and can optionally embed those readings in your commit messages.

> Screenshot placeholder: VS Code status bar showing heart rate and Body Battery.

## Features

- **Push guard:** pauses Git pushes when heart rate is outside 50–110 bpm, Body Battery is below 25, or readings are unavailable or stale.
- **Status bar:** displays cached Garmin readings and push eligibility.
- **Background refresh:** checks Garmin every five minutes without calling the API during Git commits or pushes. Readings expire after 60 minutes.
- **Optional commit trailers:** adds health readings to Git history when explicitly enabled.
- **Update notifications:** checks GitHub for new stable releases.

> Screenshot placeholder: blocked Git push notification.

## Getting started

Requires VS Code 1.85+, Git, Python 3.8+ with its standard library, and a Garmin Connect account. Supported on macOS, Linux and WSL.

1. Download the latest VSIX from [GitHub Releases](https://github.com/KingBain/push-for-peace/releases/latest).
2. In VS Code, run **Extensions: Install from VSIX...** and select the downloaded file.
3. Open a trusted workspace and run **Push for Peace: Connect Garmin** from the Command Palette. Enter an expiring Personal API key created in Garmin Connect Web.
4. Run **Push for Peace: Enable Guard** in each Git clone you want to protect.

Click the status bar to refresh readings manually, or hover to see sample timestamps. Run **Push for Peace: Disable Guard** before uninstalling.

> Screenshot placeholder: Garmin connection and guard setup.

## Optional health embedding

Run **Push for Peace: Enable Health Embedding** in a repository with the guard enabled to add cached readings to your commits:

```text
Push-For-Peace: {"v":1,"hr":72,"bb":68}
```

> Screenshot placeholder: Git commit showing its health trailer.

Health embedding is opt-in per clone. Anyone with access to the repository can read committed health data. Disabling embedding does not remove existing data from Git history.

## Privacy and limitations

Your Garmin key is stored in VS Code SecretStorage. Readings and push decisions are cached locally. Run **Push for Peace: Disconnect Garmin** to clear the local key and cache; revoke the key in Garmin Connect separately.

Readings depend on watch synchronization with Garmin Connect. This is a playful productivity tool, not a medical assessment or a security control. Git hooks can be bypassed.

## Development

Use the Node version in `.nvmrc` and Python 3.

```sh
npm test
npm run package
```

The VSIX is generated in `dist/`. Releases are published through the **Release VSIX** GitHub Actions workflow. To check for updates manually, run **Push for Peace: Check for Updates**. Remote VS Code windows require manual update installation.
