const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);

exports.activate = async context => {
  require('./updates').activate(context, vscode);
  const home = context.globalStorageUri.fsPath;
  const {templates, installRuntime, migrate} = require('./hook-install');
  const {hook, embedHook} = templates(home);

  const secret = 'garmin.personalApiKey';
  const verdict = path.join(home, 'verdict.json');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  status.name = 'Push for Peace';
  status.command = 'pushForPeace.refresh';
  context.subscriptions.push(status);
  let current, problem = 'Connect Garmin to load readings.';
  const displayOptions = () => ({
    locale: vscode.env.language,
    timeZone: vscode.workspace.getConfiguration('pushForPeace').get('displayTimeZone', '')
  });
  function renderStatus() {
    const {describe} = require('./garmin');
    const now = Date.now();
    const fresh = reading => reading?.status === 'fresh' && now - reading.at < 3600000;
    const hr = current?.diagnostics?.hr, bb = current?.diagnostics?.bb;
    status.text = '$(heart) ' + (fresh(hr) ? hr.value + ' bpm' : 'HR —') +
      '  $(person) ' + (fresh(bb) ? bb.value + '%' : 'BB —');
    status.tooltip = 'Push for Peace\n' + (problem ||
      describe('Heart rate', hr, now, displayOptions()) + '\n' + describe('Body Battery', bb, now, displayOptions()) + '\n' +
      (current.expires > now ? (current.allowed ? 'Within configured push limits.' : 'Outside configured push limits.') : 'Push paused: fresh readings required.')) +
      '\nClick to refresh. Readings are from Garmin, not a live watch connection.';
    status.show();
  }
  renderStatus();
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('pushForPeace.displayTimeZone')) renderStatus();
  }));
  const statusTimer = setInterval(renderStatus, 30000);
  context.subscriptions.push({dispose: () => clearInterval(statusTimer)});
  let pending = Promise.resolve();
  function queue(work) {
    const result = pending.then(work);
    pending = result.catch(() => {});
    return result;
  }
  async function refresh() {
    const key = await context.secrets.get(secret);
    if (!key) { current = undefined; problem = 'Run Connect Garmin in this VS Code environment first.'; renderStatus(); throw Error(problem); }
    try {
      const result = await require('./garmin').decision(key);
      const temporary = verdict + '.' + require('node:crypto').randomUUID();
      await fs.writeFile(temporary, JSON.stringify(result), {mode: 0o600, flag: 'wx'});
      await fs.rename(temporary, verdict);
      current = result; problem = undefined; renderStatus();
      return result;
    } catch (error) {
      current = undefined; problem = error.message; renderStatus();
      await fs.rm(verdict, {force: true});
      throw error;
    }
  }
  if (process.platform === 'win32') return;
  await fs.mkdir(home, {recursive: true, mode: 0o700});
  await installRuntime(context);
  async function migrateFolders(folders) {
    for (const folder of folders) {
      try { await migrate(folder.uri.fsPath, home); }
      catch (error) {
        if (error.code !== 128) vscode.window.showWarningMessage('Push for Peace could not migrate hooks in ' + folder.name + '. Run Enable Guard in that repository to retry.');
      }
    }
  }
  await migrateFolders(vscode.workspace.workspaceFolders || []);
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
    queue(() => migrateFolders(event.added)).catch(() => {});
  }));
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
      const details = require('./garmin');
      const message = details.describe('Heart rate', result.diagnostics.hr, Date.now(), displayOptions()) + '; ' + details.describe('Body Battery', result.diagnostics.bb, Date.now(), displayOptions());
      if (result.expires) vscode.window.showInformationMessage('Garmin readings refreshed. ' + message);
      else vscode.window.showWarningMessage('Garmin responded, but push protection needs both readings less than 60 minutes old. ' + message);
      return;
    }
    if (action === 'disconnect') {
      await context.secrets.delete(secret);
      await fs.rm(verdict, {force: true});
      current = undefined; problem = 'Garmin disconnected.'; renderStatus();
      vscode.window.showInformationMessage('Local key removed. You can also revoke it in Garmin Connect.');
      return;
    }
    if (['enable', 'enableEmbedding'].includes(action)) await installRuntime(context);
    const folders = vscode.workspace.workspaceFolders || [];
    const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
    if (!folder) return;
    await migrate(folder.uri.fsPath, home);
    const git = async args => (await run('git', args, { cwd: folder.uri.fsPath })).stdout.trim();
    try {
      await git(['config', '--get', 'core.hooksPath']);
      throw Error('This repository uses a custom hooks directory. Its hooks are managed separately.');
    } catch (error) { if (error.code !== 1) throw error; }
    const target = await git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-push']);
    const messageHook = await git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/commit-msg']);
    if (action === 'enableEmbedding') {
      const installed = await fs.readFile(target, 'utf8').catch(() => '');
      if (installed !== hook) throw Error('Enable the Push for Peace guard in this repository first.');
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
      if (await fs.readFile(target, 'utf8').catch(() => null) === hook) {
        vscode.window.showInformationMessage('Push for Peace guard is enabled.');
        return;
      }
      await fs.writeFile(target, hook, { flag: 'wx', mode: 0o755 }).catch(error => {
        if (error.code === 'EEXIST') throw Error('A pre-push hook already exists. Kept the existing hook.');
        throw error;
      });
    } else {
      if (await fs.readFile(target, 'utf8') !== hook) throw Error('This hook belongs to another tool or was edited. Kept it in place.');
      await fs.unlink(target);
      const installed = await fs.readFile(messageHook, 'utf8').catch(() => null);
      if (installed === embedHook) await fs.unlink(messageHook);
    }
    vscode.window.showInformationMessage('Push for Peace guard ' + (action === 'enable' ? 'enabled.' : 'removed.'));
  }
  context.subscriptions.push(vscode.commands.registerCommand('pushForPeace.demo', async () => {
    const scenario = await vscode.window.showQuickPick([
      {label: 'Readings within push limits', allowed: true},
      {label: 'Readings outside push limits', allowed: false},
      {label: 'Missing or expired readings', allowed: null}
    ], {title: 'Push for Peace Demo', placeHolder: 'Choose a simulated push to preview'});
    if (!scenario) return;

    const now = Date.now();
    const [code, message] = require('./hooks').check({allowed: scenario.allowed, expires: now + 5000}, now);
    const preview = 'Demo — ' + message;
    if (code === 0) vscode.window.showInformationMessage(preview);
    else vscode.window.showWarningMessage(preview);
  }));
  for (const action of ['connect', 'enable', 'disable', 'disconnect', 'refresh', 'enableEmbedding', 'disableEmbedding']) {
    context.subscriptions.push(vscode.commands.registerCommand('pushForPeace.' + action,
      () => queue(() => command(action)).catch(error => vscode.window.showErrorMessage(error.message))));
  }
};
