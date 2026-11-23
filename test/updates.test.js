const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { compareVersions, findUpdate, download, activate } = require('../updates');

test('numeric versions and verified download', async () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.2.1', '0.2.1'), 0);
  assert.throws(() => compareVersions('0.2.2-beta', '0.2.1'));
  const original = global.fetch;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peace-test-'));
  const bytes = Buffer.from('test archive');
  const asset = { name: 'push-for-peace-0.2.2.vsix', size: bytes.length,
    digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    browser_download_url: 'https://github.com/KingBain/push-for-peace/releases/download/v0.2.2/push-for-peace-0.2.2.vsix' };
  try {
    global.fetch = async () => Response.json({ tag_name: 'v0.2.2', assets: [asset] });
    assert.equal((await findUpdate('0.2.1')).version, '0.2.2');
    assert.equal(await findUpdate('0.2.2'), null);
    asset.browser_download_url = 'https://example.org/update.vsix';
    await assert.rejects(findUpdate('0.2.1'), /verifiable/);
    global.fetch = async () => new Response(bytes);
    await download(asset, path.join(directory, 'valid.vsix'));
    assert.deepEqual(await fs.readFile(path.join(directory, 'valid.vsix')), bytes);
    asset.digest = 'sha256:' + '0'.repeat(64);
    await assert.rejects(download(asset, path.join(directory, 'bad.vsix')), /checksum/);
  } finally {
    global.fetch = original;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('manual update installs verified VSIX and cleans up', async () => {
  const original = global.fetch;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peace-install-'));
  const bytes = Buffer.from('vsix');
  let command;
  const calls = [];
  const context = { subscriptions: [], extension: { packageJSON: {version:'0.2.1'} },
    globalStorageUri: {fsPath:directory}, globalState:{get:()=>0,update:async()=>{}} };
  const vscode = {
    workspace:{getConfiguration:()=>({get:()=>false})}, env:{},
    Uri:{file:p=>({fsPath:p})}, ProgressLocation:{Notification:1},
    commands:{registerCommand:(id,fn)=>{command=fn;return {dispose(){}};},
      executeCommand:async(id,uri)=>{calls.push(id);if(uri)assert.deepEqual(await fs.readFile(uri.fsPath),bytes);}},
    window:{showInformationMessage:async(message)=>message.includes('available')?'Install Update':undefined,
      showErrorMessage:async(message)=>assert.fail(message),withProgress:async(_,fn)=>fn()}
  };
  global.fetch=async(url)=>url.includes('api.github.com')?Response.json({
    tag_name:'v0.2.2',assets:[{name:'push-for-peace-0.2.2.vsix',size:bytes.length,
    digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),
    browser_download_url:'https://github.com/KingBain/push-for-peace/releases/download/v0.2.2/push-for-peace-0.2.2.vsix'}]
  }):new Response(bytes);
  try {
    activate(context,vscode);
    await command();
    assert.deepEqual(calls,['workbench.extensions.installExtension']);
    assert.deepEqual(await fs.readdir(directory),[]);
  } finally {
    context.subscriptions.forEach(x=>x.dispose());
    global.fetch=original;
    await fs.rm(directory,{recursive:true,force:true});
  }
});
