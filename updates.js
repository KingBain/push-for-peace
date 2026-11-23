const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const repository = 'KingBain/push-for-peace';
const interval = 24 * 60 * 60 * 1000;
const maxBytes = 25 * 1024 * 1024;

function compareVersions(left, right) {
  const parse = value => {
    if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)) {
      throw Error('Unsupported release version.');
    }
    return value.split('.').map(BigInt);
  };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

async function findUpdate(current) {
  const response = await fetch('https://api.github.com/repos/' + repository + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error('GitHub update check failed (HTTP ' + response.status + ').');
  const release = await response.json();
  if (release.draft || release.prerelease) return null;
  const version = release.tag_name.replace(/^v/, '');
  if (compareVersions(version, current) <= 0) return null;
  const asset = release.assets.find(item => item.name === 'push-for-peace-' + version + '.vsix');
  const expected = 'https://github.com/' + repository + '/releases/download/' +
    release.tag_name + '/' + asset?.name;
  if (!asset || asset.browser_download_url !== expected ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxBytes ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) {
    throw Error('The release is missing a verifiable VSIX asset.');
  }
  return { version, asset };
}

async function download(asset, destination) {
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw Error('Could not download the update.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes || size > asset.size) throw Error('Unexpected update download size.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  if (size !== asset.size || digest !== asset.digest) throw Error('Update checksum verification failed.');
  await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
}

function activate(context, vscode) {
  let busy = false;
  let stopped = false;
  async function check(manual = false) {
    if (busy || stopped) return;
    const config = vscode.workspace.getConfiguration('pushForPeace');
    if (!manual && (!config.get('checkForUpdates', true) ||
        Date.now() - context.globalState.get('lastUpdateCheck', 0) < interval)) return;
    busy = true;
    let installing = false;
    try {
      await context.globalState.update('lastUpdateCheck', Date.now());
      const update = await findUpdate(context.extension.packageJSON.version);
      if (stopped) return;
      if (!update) {
        if (manual) await vscode.window.showInformationMessage('Push for Peace is up to date.');
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'Push for Peace ' + update.version + ' is available.', 'Install Update', 'Later');
      if (choice !== 'Install Update' || stopped) return;
      installing = true;
      // The installer must receive a URI on the same machine as the downloaded file.
      if (vscode.env.remoteName) {
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/' + repository + '/releases/latest'));
        await vscode.window.showInformationMessage('Download the VSIX and use Install from VSIX in this remote window.');
        return;
      }
      const directory = context.globalStorageUri.fsPath;
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const destination = path.join(directory, 'update-' + randomUUID() + '.vsix');
      try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
          title: 'Updating Push for Peace' }, async () => {
          await download(update.asset, destination);
          await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(destination));
        });
      } finally {
        await fs.rm(destination, { force: true });
      }
      if (await vscode.window.showInformationMessage('Push for Peace updated. Reload to activate it.', 'Reload Window') === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      if (manual || installing) await vscode.window.showErrorMessage('Push for Peace update failed. ' + error.message);
    } finally {
      busy = false;
    }
  }
  context.subscriptions.push(vscode.commands.registerCommand('pushForPeace.checkForUpdates', () => check(true)));
  const timer = setInterval(() => check(), 60 * 60 * 1000);
  context.subscriptions.push({ dispose() { stopped = true; clearInterval(timer); } });
  void check();
}
module.exports = { activate, compareVersions, findUpdate, download };
