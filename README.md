# Push for Peace

<img width="551" height="138" alt="image" src="https://github.com/user-attachments/assets/45e660ac-a6d3-4429-9206-850b1a842f58" />

**Better commits. Calmer developers.**

Push for Peace is a VS Code extension that integrates Garmin health metrics into your Git workflow, encouraging healthier and more mindful software development.

Not every push needs to be made under stress.

## Features

- **Push Guard** — Pauses Git pushes based on your heart rate and Body Battery.
- **Live status bar** — Displays your latest Garmin health metrics and push eligibility.
- **Background synchronization** — Refreshes health metrics without slowing down Git operations.
- **Health-aware commits** — Optionally embeds health metrics into your Git commit history.
- **Update notifications** — Notifies you when a new release is available.

### Push Guard
<img width="550" height="189" alt="image" src="https://github.com/user-attachments/assets/f11c8f97-5811-4ec7-8869-4cad93cd48fc" />

### Health Data Synced
<img width="585" height="137" alt="image" src="https://github.com/user-attachments/assets/d17d05ae-5809-4423-8d38-9234b792ae4d" />

### No Data Available
<img width="572" height="84" alt="image" src="https://github.com/user-attachments/assets/d7b4c77f-304c-49c3-9995-36cfd5898ec6" />

### Health Data Stale
<img width="547" height="209" alt="image" src="https://github.com/user-attachments/assets/f8e5d70c-f9b6-42ef-86ae-60cbb82b1f85" />




## Getting Started

1. Download the latest VSIX from [GitHub Releases](https://github.com/KingBain/push-for-peace/releases/latest).
2. Install it using **Extensions: Install from VSIX** in VS Code.
3. Run **Push for Peace: Connect Garmin**.
4. Run **Push for Peace: Enable Guard**.

Requires VS Code, Git, and a Garmin Connect account with a Personal API key. Supports macOS, Linux and WSL.

### Garmin API 
Request an API key https://connect.garmin.com/app/settings/personalApiToken
<img width="679" height="315" alt="image" src="https://github.com/user-attachments/assets/3e173f0e-7cb1-418e-afd1-9e71ccbee9b9" />


## Health-Aware Commits

Optionally capture a snapshot of your well-being alongside your code changes.

Enable this feature using **Push for Peace: Enable Health Embedding**. This will embed your health stats in the git commit message trailer/footer.

<img width="869" height="120" alt="image" src="https://github.com/user-attachments/assets/2f5bcdef-12df-4a41-b428-a8c57339e13b" />
<img width="868" height="141" alt="image" src="https://github.com/user-attachments/assets/de106a3b-cd4e-408c-a296-2dfd232be44f" />


## Privacy

Garmin credentials are securely stored using VS Code SecretStorage. Health readings are cached locally, and embedding health data into Git history is strictly opt-in. Embedded data is visible to anyone with repository access.

## Disclaimer

Push for Peace is an experiment in developer well-being, not a medical device or security control. Git hooks can be bypassed.

**Write code. Stay healthy. Push for peace.**

## Git hook runtime

Git hooks now use JavaScript and the verified Node runtime supplied by VS Code.
No Python or separate Node installation is needed to run the extension. Hooks
read only the local cache; Garmin polling stays in VS Code every five minutes.
Readings expire after 60 minutes, and missing readings are omitted from commits.

On activation, existing unmodified Push for Peace hooks in open workspace
repositories migrate automatically. Open other repositories in VS Code to migrate
them too. Other tools' hooks and edited hooks are left alone. After a VS Code or
server update removes its old runtime, reload the extension to refresh the launcher.
Hooks can run with VS Code closed while that runtime and fresh cache remain available.

Development tests use `npm test`. The release and check workflows build the VSIX
with inline Bash and `zip`, using the version from `package.json`. Python is no
longer required for packaging. Run the Release VSIX workflow to publish a build.
