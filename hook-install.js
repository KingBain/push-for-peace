const fs = require('node:fs/promises');
const path = require('node:path');
const {promisify} = require('node:util');
const run = promisify(require('node:child_process').execFile);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
function templates(home) {
  const launcher = path.join(home, 'run-hook.sh');
  const hook = '#!/bin/sh\n# Push for Peace\nexec ' + quote(launcher) + ' check\n';
  const embedHook = '#!/bin/sh\n# Push for Peace health embedding\nexec ' + quote(launcher) + ' embed "$1"\n';
  const old = python => '#!/bin/sh\n# Push for Peace\nexec ' + quote(python) + ' -I ' + quote(path.join(home, 'guard.py')) + ' check\n';
  return {hook, embedHook, oldHooks: [old('python3'), old(path.join(home, 'venv/bin/python'))],
    oldEmbed: '#!/bin/sh\n# Push for Peace health embedding\nexec ' + quote('python3') + ' -I ' + quote(path.join(home, 'embed.py')) + ' "$1"\n'};
}
async function installRuntime(context, executable = process.execPath) {
  // Electron desktop and the remote VS Code server both support this launch mode.
  const env = {...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', NODE_PATH: ''};
  const probe = await run(executable, ['-e', 'process.stdout.write(String(Number(process.versions.node.split(".")[0]) >= 18))'], {env, timeout: 10000});
  if (probe.stdout !== 'true') throw Error('Push for Peace requires a Node 18+ runtime. Update VS Code and reload.');
  const home = context.globalStorageUri.fsPath;
  await fs.mkdir(home, {recursive: true, mode: 0o700});
  const write = async (name, content, mode) => {
    const target = path.join(home, name), temp = target + '.' + require('node:crypto').randomUUID();
    await fs.writeFile(temp, content, {mode, flag: 'wx'});
    await fs.rename(temp, target);
  };
  await write('hooks.js', await fs.readFile(context.asAbsolutePath('hooks.js')), 0o600);
  await write('run-hook.sh', '#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nunset NODE_OPTIONS NODE_PATH\nexec ' + quote(executable) + ' ' + quote(path.join(home, 'hooks.js')) + ' "$@"\n', 0o700);
}
async function migrate(cwd, home) {
  const t = templates(home);
  // Resolve the effective hook location, including an explicitly configured hooksPath.
  for (const [name, old, next] of [['pre-push', t.oldHooks, t.hook], ['commit-msg', [t.oldEmbed], t.embedHook]]) {
    const target = (await run('git', ['rev-parse', '--path-format=absolute', '--git-path', 'hooks/' + name], {cwd})).stdout.trim();
    let current;
    try {
      if (!(await fs.lstat(target)).isFile()) continue;
      current = await fs.readFile(target, 'utf8');
    }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!old.includes(current)) continue; // Never overwrite another tool's hook or edited scripts.
    await fs.writeFile(target, next, {mode: 0o755});
    await fs.chmod(target, 0o755);
  }
}
module.exports = {templates, installRuntime, migrate};
