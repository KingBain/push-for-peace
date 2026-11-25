const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const {installRuntime, templates} = require('../hook-install');
const {registerPushErrors} = require('../push-errors');

test('VS Code handles guard rejections from git push and leaves other failures alone', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peace-push-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const home = path.join(root, 'storage');
  const context = {subscriptions: [], globalStorageUri: {fsPath: home},
    asAbsolutePath: name => path.join(__dirname, '..', name)};
  let handler, onEnablement, chooseAction;
  const notices = [], commands = [];
  const gitApi = {
    enabled: false,
    onDidChangeEnablement(fn) { onEnablement = fn; return {dispose() {}}; },
    getAPI(version) {
      assert.equal(version, 1);
      return {registerPushErrorHandler(value) {
        handler = value;
        return {dispose() { handler = undefined; }};
      }};
    }
  };
  const vscode = {
    extensions: {getExtension(id) { assert.equal(id, 'vscode.git'); return {activate: async () => gitApi}; }},
    window: {showWarningMessage(...args) {
      notices.push(args);
      return new Promise(resolve => { chooseAction = resolve; });
    }},
    commands: {executeCommand(command) { commands.push(command); }}
  };
  await registerPushErrors(context, vscode);
  assert.equal(handler, undefined);
  gitApi.enabled = true;
  onEnablement(true);
  const handle = (stderr, gitErrorCode = 'PushRejected') =>
    handler.handlePushError({}, {}, 'main:main', {gitErrorCode, stderr});

  const git = (...args) => execFileSync('git', args, {cwd: root});
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=Tester', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false',
    'commit', '-qm', 'Initial commit', '--allow-empty');
  git('init', '--bare', '-q', 'remote.git');
  git('remote', 'add', 'origin', path.join(root, 'remote.git'));
  await installRuntime(context);
  await fs.writeFile(path.join(root, '.git/hooks/pre-push'), templates(home).hook, {mode: 0o755});
  const push = () => spawnSync('git', ['push', 'origin', 'main:main'], {cwd: root, encoding: 'utf8'});

  const unavailable = push();
  assert.notEqual(unavailable.status, 0);
  assert.equal(await handle(unavailable.stderr), true);
  assert.deepEqual(notices.pop(), ['Push paused. Push for Peace needs fresh readings.', 'Refresh Readings']);
  chooseAction(undefined);
  await Promise.resolve();
  assert.deepEqual(commands, []);
  assert.equal(await handle(unavailable.stderr), true);
  chooseAction('Refresh Readings');
  await Promise.resolve();
  assert.deepEqual(commands, ['pushForPeace.refresh']);
  notices.pop();

  const save = allowed => fs.writeFile(path.join(home, 'verdict.json'),
    JSON.stringify({expires: Date.now() + 30000, allowed}));
  await save(false);
  const outside = push();
  assert.notEqual(outside.status, 0);
  assert.equal(await handle(outside.stderr), true);
  const [notice] = notices.pop();
  assert.match(notice, /choose peace\. The branch can wait\. .+/);
  assert.ok(outside.stderr.includes(notice));
  for (const stderr of ['! [rejected] main -> main (non-fast-forward)', 'remote: ' + outside.stderr, undefined]) {
    assert.equal(await handle(stderr), false);
  }
  assert.equal(await handle(outside.stderr, 'PermissionDenied'), false);
  assert.deepEqual(notices, []);
  await save(true);
  const approved = push();
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(await handle(approved.stderr), false);
  context.subscriptions.forEach(item => item.dispose());
  assert.equal(handler, undefined);
});
