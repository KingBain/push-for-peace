const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

test('model identifiers survive refresh and isolate credentials across upgrades and reconnects', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'peace-model-'));
  const state = new Map([['bodyBatteryModel.v1', {account: 'legacy', model: {last: {value: 81}}}]]);
  const commands = new Map();
  const subscriptions = [];
  const model = {last: {value: 70, at: Date.now()}};
  const observations = [];
  let key = 'fixture-a', input;
  const disposable = {dispose() {}};
  const vscode = {
    env: {language: 'en'}, StatusBarAlignment: {Left: 1},
    window: {
      createStatusBarItem: () => ({show() {}, dispose() {}}),
      showInputBox: async () => input, showInformationMessage() {}, showWarningMessage() {},
      showErrorMessage(message) { throw Error(message); }
    },
    commands: {registerCommand(name, fn) {commands.set(name, fn); return disposable;}},
    workspace: {getConfiguration: () => ({get: () => ''}),
      onDidChangeConfiguration: () => disposable, onDidChangeWorkspaceFolders: () => disposable}
  };
  const original = Module._load;
  Module._load = function(id, ...rest) {
    if (id === 'vscode') return vscode;
    if (id === './updates') return {activate() {}};
    if (id === './garmin') return {
      describe: () => '',
      async decision(_key, previous) {
        observations.push(previous);
        return {batteryModel: model, diagnostics: {}, expires: Date.now() + 1000};
      }
    };
    return original.call(this, id, ...rest);
  };
  const command = name => commands.get('pushForPeace.' + name)();
  try {
    await require('../index').activate({
      subscriptions, globalStorageUri: {fsPath: home}, asAbsolutePath: name => path.join(__dirname, '..', name),
      globalState: {get: name => state.get(name), async update(name, value) {
        if (value === undefined) state.delete(name); else state.set(name, value);
      }},
      secrets: {get: async () => key, store: async (_, value) => {key = value;}, delete: async () => {key = undefined;}}
    });
    await command('refresh'); // Queued behind the startup refresh.
    assert.equal(state.has('bodyBatteryModel.v1'), false);
    assert.deepEqual(observations, [undefined, model]);
    const first = state.get('bodyBatteryModel.v2');
    assert.match(first.salt, /^[a-f0-9]{32}$/);
    assert.match(first.account, /^[a-f0-9]{64}$/);
    key = 'fixture-b'; // Also isolate a key changed by a different extension window.
    await command('refresh');
    assert.equal(observations.at(-1), undefined);
    assert.notEqual(state.get('bodyBatteryModel.v2').account, first.account);
    await command('disconnect');
    assert.equal(state.has('bodyBatteryModel.v2'), false);
    input = 'fixture-a';
    await command('connect');
    const reconnected = state.get('bodyBatteryModel.v2');
    assert.notEqual(reconnected.salt, first.salt);
    assert.notEqual(reconnected.account, first.account);
    assert.equal(observations.at(-1), undefined);
  } finally {
    Module._load = original;
    for (const sub of subscriptions) sub.dispose();
    await fs.rm(home, {recursive: true, force: true});
  }
});
