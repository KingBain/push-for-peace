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

const {evaluateReadings, check, payload} = require('../hooks');
const {learnBattery} = require('../garmin');
const hour = 3600000;
test('a stale battery is projected from its real anchor and never embedded', () => {
  const at = Date.UTC(2026, 10, 25, 6);
  const now = at + 3 * hour;
  const readings = {heart: {status: 'fresh', at: now, value: 72},
    battery: {at, value: 60}, drainRate: 10/3, learned: false};
  const result = evaluateReadings(readings, now);
  assert.equal(result.diagnostics.bb.value, 50);
  assert.equal(result.diagnostics.bb.status, 'estimated');
  assert.equal(result.allowed, true);
  assert.match(describe('Body Battery', result.diagnostics.bb, now), /estimated 50%/);
  assert.equal(check({readings}, now)[0], 0);
  assert.equal(payload(result, now), null);
  assert.equal(check({readings}, now + hour)[0], 1);
  assert.equal(check({readings: {...readings, battery: {at, value: 30}}}, now)[0], 1);
  assert.equal(check({readings: {...readings, battery: {at: now - 12 * hour, value: 99}}}, now)[0], 1);
});

test('learns drain from measured intervals and skips duplicates, recharge and gaps', () => {
  const at = Date.UTC(2026, 10, 25, 6);
  const rows = [60, 58, 56, 54].map((v, i) => [at + i * hour / 2, v]);
  const now = at + 8 * hour;
  const model = learnBattery({}, rows, now);
  assert.equal(model.windows, 3);
  assert.equal(model.points / model.hours, 4);
  assert.deepEqual(learnBattery(model, rows, now), model);
  const later = learnBattery(model, [[at + 2 * hour, 64], [now, 40]], now);
  assert.equal(later.points, model.points);
  assert.deepEqual(later.last, {value: 40, at: now});
});

test('battery endpoint dropout uses persisted learning, then resumes measured values', async t => {
  const at = Date.now(), last = at - 3 * hour;
  const model = learnBattery({}, [66, 64, 62, 60].map((v, i) => [last - (3-i)*hour/2, v]), at);
  let restore = false;
  t.mock.method(global, 'fetch', async (url, options) => {
    if (options.method === 'POST') return new Response('abc.xyz.sig');
    if (url.includes('dailyHeartRate')) return Response.json({heartRateValues: [[at, 75]]});
    if (!restore) return new Response('', {status: 503});
    return Response.json([{bodyBatteryValuesArray: [[at, 70]]}]);
  });
  const missing = await decision('test-key');
  assert.equal(missing.allowed, undefined);
  const estimate = await decision('test-key', model);
  assert.equal(estimate.diagnostics.bb.value, 48);
  assert.equal(estimate.diagnostics.bb.learned, true);
  assert.equal(estimate.allowed, true);
  assert.equal(payload(estimate), null);
  restore = true;
  const measured = await decision('test-key', estimate.batteryModel);
  assert.equal(measured.diagnostics.bb.status, 'fresh');
  assert.equal(payload(measured).bb, 70);
});
