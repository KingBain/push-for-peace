const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const {check, payload, updateMessage} = require('../hooks');
const {templates, installRuntime, migrate} = require('../hook-install');

test('verdict validation and health expiry', () => {
  const now = Date.now();
  for (const state of [null, {}, {allowed: true, expires: now}, {allowed: true, expires: now + 3600001}, {allowed: 1, expires: now + 1000}]) assert.equal(check(state, now)[0], 1);
  assert.equal(check({allowed: true, expires: now + 1000}, now)[0], 0);
  assert.match(check({allowed: false, expires: now + 1000}, now)[1], /choose peace/);
  const health = {hr: 72, bb: 68, hrAt: now - 2700000, bbAt: now};
  assert.deepEqual(payload({health}, now), {v: 1, hr: 72, bb: 68});
  for (const h of [{...health, hrAt: now - 3600000}, {...health, bb: null}, {...health, hr: true}, {...health, bbAt: now + 1}]) assert.equal(payload({health: h}, now), null);
  assert.equal(payload(null), null);
});

test('real Git commits, migration, missing readings and runtime without PATH node', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "peace 'hooks-"));
  const home = path.join(root, 'storage'), repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8'});
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    const context = {globalStorageUri: {fsPath: home}, asAbsolutePath: name => path.join(__dirname, '..', name)};
    await installRuntime(context);
    const t = templates(home), hooks = path.join(repo, '.git/hooks');
    await fs.writeFile(path.join(hooks, 'pre-push'), t.oldHooks[0], {mode: 0o755});
    await fs.writeFile(path.join(hooks, 'commit-msg'), t.oldEmbed, {mode: 0o755});
    await migrate(repo, home);
    assert.equal(await fs.readFile(path.join(hooks, 'pre-push'), 'utf8'), t.hook);
    assert.equal(await fs.readFile(path.join(hooks, 'commit-msg'), 'utf8'), t.embedHook);
    const save = async hr => { const now = Date.now(); await fs.writeFile(path.join(home, 'verdict.json'), JSON.stringify({allowed: true, expires: now + 10000, health: {hr, bb: 68, hrAt: now, bbAt: now}})); };
    await save(72);
    // check needs no Git: a nonexistent PATH proves no system node/python dependency.
    const result = spawnSync(path.join(hooks, 'pre-push'), [], {env: {...process.env, PATH: '/nonexistent'}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    git('commit', '--allow-empty', '-qm', 'Fix login redirect\n\nReviewed-by: Tester');
    let message = git('log', '-1', '--format=%B');
    assert.match(message, /Reviewed-by: Tester/); assert.match(message, /"hr":72/);
    await save(80); git('commit', '--amend', '--allow-empty', '--no-edit', '-q');
    message = git('log', '-1', '--format=%B');
    assert.match(message, /"hr":80/); assert.equal(message.split('Push-For-Peace:').length, 2);
    await fs.unlink(path.join(home, 'verdict.json'));
    git('commit', '--amend', '--allow-empty', '--no-edit', '-q');
    message = git('log', '-1', '--format=%B');
    assert.doesNotMatch(message, /Push-For-Peace:/); assert.match(message, /Reviewed-by: Tester/);
    assert.equal(spawnSync(path.join(hooks, 'pre-push')).status, 1);
    await save(72);
    assert.notEqual(spawnSync('git', ['commit', '--allow-empty', '-m', ''], {cwd: repo}).status, 0);
    await fs.unlink(path.join(hooks, 'pre-push'));
    git('commit', '--allow-empty', '-qm', 'Guard disabled');
    assert.doesNotMatch(git('log', '-1', '--format=%B'), /Push-For-Peace:/);
    await fs.writeFile(path.join(hooks, 'pre-push'), '#!/bin/sh\n# another tool\n');
    await migrate(repo, home);
    assert.equal(await fs.readFile(path.join(hooks, 'pre-push'), 'utf8'), '#!/bin/sh\n# another tool\n');
    const bytes = Buffer.from([0x66, 0x80, 0x0a]);
    assert.deepEqual(updateMessage(bytes, null), bytes);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});
