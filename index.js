const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

exports.activate = async context => {
  require('./updates').activate(context, vscode);
  const home = context.globalStorageUri.fsPath;
  const guard = path.join(home, 'guard.py');
  const python = 'python3';
  const embed = path.join(home, 'embed.py');
  const embedHook = '#!/bin/sh\n# Push for Peace health embedding\nexec ' + quote(python) + ' -I ' + quote(embed) + ' "$1"\n';
  const hook = '#!/bin/sh\n# Push for Peace\nexec ' + quote(python) + ' -I ' + quote(guard) + ' check\n';

  const secret = 'garmin.personalApiKey';
  const verdict = path.join(home, 'verdict.json');
  let pending = Promise.resolve();
  function queue(work) {
    const result = pending.then(work);
    pending = result.catch(() => {});
    return result;
  }
  async function refresh() {
    const key = await context.secrets.get(secret);
    if (!key) throw Error('Run Connect Garmin first.');
    try {
      const result = await require('./garmin').decision(key);
      const temporary = verdict + '.' + require('node:crypto').randomUUID();
      await fs.writeFile(temporary, JSON.stringify(result), {mode: 0o600, flag: 'wx'});
      await fs.rename(temporary, verdict);
      return result;
    } catch (error) {
      await fs.rm(verdict, {force: true});
      throw error;
    }
  }
  if (process.platform === 'win32') return;
  await fs.mkdir(home, {recursive: true, mode: 0o700});
  const temp = guard + '.' + require('node:crypto').randomUUID();
  await fs.copyFile(context.asAbsolutePath('guard.py'), temp);
  await fs.rename(temp, guard);
  const embedTemp = embed + '.' + require('node:crypto').randomUUID();
  await fs.copyFile(context.asAbsolutePath('embed.py'), embedTemp);
  await fs.rename(embedTemp, embed);
  await fs.rm(path.join(home, 'session'), {recursive: true, force: true});
  const background = () => queue(refresh).catch(() => {});
  background();
  const timer = setInterval(background, 5 * 60 * 1000);
  context.subscriptions.push({dispose: () => clearInterval(timer)});

  async function command(action) {
    if (action === 'connect') {
      const key = await vscode.window.showInputBox({password: true, ignoreFocusOut: true,
        prompt: 'Paste your expiring Garmin Connect Personal API key'});
      if (!key?.trim()) return;
      await fs.rm(verdict, {force: true});
      await context.secrets.store(secret, key.trim());
      action = 'refresh';
    }
    if (action === 'refresh') {
      const result = await refresh();
      vscode.window.showInformationMessage(result.expires ? 'Garmin readings refreshed.' :
        'Connected. Sync your watch to get recent readings.');
      return;
    }
    if (action === 'disconnect') {
      await context.secrets.delete(secret);
      await fs.rm(verdict, {force: true});
      vscode.window.showInformationMessage('Local key removed. You can also revoke it in Garmin Connect.');
      return;
    }
    if (action === 'demo') {
      vscode.window.showInformationMessage((await run(python, ['-I', guard, 'demo'])).stdout.trim());
      return;
    }
    const folders = vscode.workspace.workspaceFolders || [];
    const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
    if (!folder) return;
    const git = async args => (await run('git', args, { cwd: folder.uri.fsPath })).stdout.trim();
    try {
      await git(['config', '--get', 'core.hooksPath']);
      throw Error('This repository uses a custom hooks directory. Its hooks are managed separately.');
    } catch (error) { if (error.code !== 1) throw error; }
    const target = await git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-push']);
    const messageHook = await git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/commit-msg']);
    if (action === 'enableEmbedding') {
      const legacy = hook.replace(quote(python), quote(path.join(home, 'venv/bin/python')));
      const installed = await fs.readFile(target, 'utf8').catch(() => '');
      if (![hook, legacy].includes(installed)) throw Error('Enable the Push for Peace guard in this repository first.');
      const consent = await vscode.window.showWarningMessage(
        'Embed heart rate and Body Battery in commits for this repository? Anyone with repository access can read these health stats. They become part of Git history and may become public if the repository becomes public. Disabling embedding does not remove data from existing commits.',
        {modal: true}, 'Enable Health Embedding');
      if (consent !== 'Enable Health Embedding') return;
      await fs.writeFile(messageHook, embedHook, {flag: 'wx', mode: 0o755}).catch(error => {
        if (error.code === 'EEXIST') throw Error('A commit-msg hook already exists. Health embedding was not enabled.');
        throw error;
      });
      await refresh().catch(() => {});
      vscode.window.showInformationMessage('Health embedding enabled for this repository. Missing or stale readings are omitted.');
      return;
    }
    if (action === 'disableEmbedding') {
      const installed = await fs.readFile(messageHook, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (installed !== null && installed !== embedHook) throw Error('The commit-msg hook belongs to another tool or was edited.');
      if (installed !== null) await fs.unlink(messageHook);
      vscode.window.showInformationMessage('Health embedding disabled for this repository.');
      return;
    }
    if (action === 'enable') {
      if (!await context.secrets.get(secret)) throw Error('Run Connect Garmin first.');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, hook, { flag: 'wx', mode: 0o755 }).catch(error => {
        if (error.code === 'EEXIST') throw Error('A pre-push hook already exists. Kept the existing hook.');
        throw error;
      });
    } else {
      const legacy = hook.replace(quote(python), quote(path.join(home, 'venv/bin/python')));
      if (![hook, legacy].includes(await fs.readFile(target, 'utf8'))) throw Error('This hook belongs to another tool or was edited. Kept it in place.');
      await fs.unlink(target);
      const installed = await fs.readFile(messageHook, 'utf8').catch(() => null);
      if (installed === embedHook) await fs.unlink(messageHook);
    }
    vscode.window.showInformationMessage('Push for Peace guard ' + (action === 'enable' ? 'enabled.' : 'removed.'));
  }
  for (const action of ['connect', 'enable', 'disable', 'demo', 'disconnect', 'refresh', 'enableEmbedding', 'disableEmbedding']) {
    context.subscriptions.push(vscode.commands.registerCommand('pushForPeace.' + action,
      () => queue(() => command(action)).catch(error => vscode.window.showErrorMessage(error.message))));
  }
};
