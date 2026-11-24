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
    timestamp -= 3600000;
    assert.equal((await decision('test-key')).diagnostics.hr.status, 'stale');
    global.fetch = async () => new Response('private response', { status: 401 });
    await assert.rejects(decision('test-key'), /key exchange failed \(HTTP 401\)/);
  } finally {
    global.fetch = original;
  }
});

const {reading, describe} = require('../garmin');
test('reading diagnostics distinguish missing, invalid, stale and future samples', () => {
  const now = 2000000;
  assert.equal(reading([], 0, 100, now).status, 'missing');
  assert.equal(reading([[now, 'bad']], 0, 100, now).status, 'unreadable');
  assert.equal(reading([[now + 1, 50]], 0, 100, now).status, 'future timestamp');
  assert.equal(reading([[now - 3600000, 50]], 0, 100, now).status, 'stale');
  const fresh = reading([[now, 50]], 0, 100, now);
  assert.equal(fresh.status, 'fresh');
  assert.match(describe('HR', fresh, now + 3600000), /stale/);
});

test('45-minute readings remain fresh and expire at 60 minutes', () => {
  const now = Date.now();
  assert.equal(reading([[now - 45 * 60000, 72]], 1, 300, now).status, 'fresh');
  assert.equal(reading([[now - 60 * 60000, 72]], 1, 300, now).status, 'stale');
});

const {formatTimestamp} = require('../garmin');
test('display timestamps use the selected timezone and daylight saving time', () => {
  const options = {locale: 'en-US', timeZone: 'America/Toronto'};
  assert.match(formatTimestamp(Date.parse('2026-11-24T18:58:00Z'), options), /1:58 PM EST/);
  assert.match(formatTimestamp(Date.parse('2026-07-24T18:58:00Z'), options), /2:58 PM EDT/);
  assert.match(formatTimestamp(Date.parse('2026-11-24T02:00:00Z'), options), /Nov 23, 2026/);
  assert.doesNotThrow(() => formatTimestamp(Date.now(), {timeZone: 'invalid-zone'}));
  const at = Date.parse('2026-11-24T18:58:00Z');
  assert.match(describe('HR', {status: 'fresh', at}, at, options), /1:58 PM EST/);
  assert.equal(formatTimestamp(at), new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric',
    minute: '2-digit', timeZoneName: 'short'
  }).format(at));
});
