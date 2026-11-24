# Push for Peace

**Better commits. Calmer developers.**

Push for Peace is a VS Code extension that integrates Garmin health metrics into your Git workflow, encouraging healthier and more mindful software development.

Not every push needs to be made under stress.



## Features

- **Push Guard** — Pauses Git pushes based on your heart rate and Body Battery.
- **Live status bar** — Displays your latest Garmin health metrics and push eligibility.
- **Background synchronization** — Refreshes health metrics without slowing down Git operations.
- **Health-aware commits** — Optionally embeds health metrics into your Git commit history.
- **Update notifications** — Notifies you when a new release is available.

> **Screenshot placeholder — Push Guard in action**

## Getting Started

1. Download the latest VSIX from [GitHub Releases](https://github.com/KingBain/push-for-peace/releases/latest).
2. Install it using **Extensions: Install from VSIX** in VS Code.
3. Run **Push for Peace: Connect Garmin**.
4. Run **Push for Peace: Enable Guard**.

Requires VS Code, Git, Python 3.8+, and a Garmin Connect account with a Personal API key. Supports macOS, Linux and WSL.

> **Screenshot placeholder — Garmin connection and configuration**

## Health-Aware Commits

Optionally capture a snapshot of your well-being alongside your code changes.

Enable this feature using **Push for Peace: Enable Health Embedding**.

<img width="869" height="120" alt="image" src="https://github.com/user-attachments/assets/2f5bcdef-12df-4a41-b428-a8c57339e13b" />
<img width="868" height="141" alt="image" src="https://github.com/user-attachments/assets/de106a3b-cd4e-408c-a296-2dfd232be44f" />


## Privacy

Garmin credentials are securely stored using VS Code SecretStorage. Health readings are cached locally, and embedding health data into Git history is strictly opt-in. Embedded data is visible to anyone with repository access.

## Disclaimer

Push for Peace is an experiment in developer well-being, not a medical device or security control. Git hooks can be bypassed.

**Write code. Stay healthy. Push for peace.**
