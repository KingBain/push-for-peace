const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decision } = require('../garmin');

test('plain-text token and push decisions', async () => {
  const original = global.fetch;
  let battery = 80;
  let timestamp = Date.now() - 10000;
  global.fetch = async (url, options) => {
    if (options.method === 'POST') return new Response(' abc.xyz.sig\n');
    assert.equal(options.headers.Authorization, 'Bearer abc.xyz.sig');
    return Response.json(url.includes('dailyHeartRate')
      ? { heartRateValues: [[timestamp, 72]] }
      : [{ bodyBatteryValuesArray: [[timestamp, battery]] }]);
  };
  try {
    assert.equal((await decision('test-key')).allowed, true);
    battery = 10;
    assert.equal((await decision('test-key')).allowed, false);
    timestamp -= 1800000;
    assert.deepEqual(await decision('test-key'), {});
    global.fetch = async () => new Response('private response', { status: 401 });
    await assert.rejects(decision('test-key'), /key exchange failed \(HTTP 401\)/);
  } finally {
    global.fetch = original;
  }
});
