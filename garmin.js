const origin = 'https://personal.connectapi.garmin.com';
async function request(stage, endpoint, authorization, method = 'GET') {
  let response;
  try {
    response = await fetch(origin + endpoint, {
      method, headers: { Authorization: authorization }, redirect: 'error',
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw Error(stage + ' could not reach Garmin. Check the network or proxy.');
  }
  if (!response.ok) throw Error(stage + ' failed (HTTP ' + response.status + ').');
  try {
    return method === 'POST' ? (await response.text()).trim() : await response.json();
  } catch {
    throw Error(stage + ' returned an unreadable response.');
  }
}

function reading(rows, low, high, now) {
  const valid = rows.filter(row => Array.isArray(row) && Number.isFinite(row[0]) &&
    Number.isFinite(row[1]) && row[1] >= low && row[1] <= high)
    .sort((a, b) => b[0] - a[0]);
  const row = valid.find(row => row[0] <= now) || valid[0];
  if (!row) return {status: rows.length ? 'unreadable' : 'missing'};
  return {value: row[1], at: row[0], status: row[0] > now ? 'future timestamp' :
    now - row[0] >= 1800000 ? 'stale' : 'fresh'};
}

function describe(label, reading, now = Date.now()) {
  if (!reading) return label + ': unavailable';
  const status = reading.status === 'fresh' && now - reading.at >= 1800000 ? 'stale' : reading.status;
  return label + ': ' + status + (reading.at ? ' (last sample ' + new Date(reading.at).toISOString() + ')' : '');
}

async function decision(key) {
  const token = await request('Garmin key exchange', '/personalapitoken-service/personal-api/personal-api-key/token', 'ApiKey ' + key, 'POST');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error('Garmin key exchange returned an unexpected token format.');
  const now = Date.now();
  const days = [...new Set([now, now - 1800000].map(t => new Date(t).toLocaleDateString('en-CA')))];
  const hrs = [], batteries = [];
  for (const date of days) {
    const get = (stage, endpoint) => request(stage, '/wellness-service/wellness/' + endpoint, 'Bearer ' + token);
    const [hr, bb] = await Promise.all([get('Garmin heart-rate request', 'dailyHeartRate?date=' + date),
      get('Garmin Body Battery request', 'bodyBattery/reports/daily?startDate=' + date + '&endDate=' + date)]);
    if (!hr || typeof hr !== 'object' || Array.isArray(hr) ||
        (hr.heartRateValues != null && !Array.isArray(hr.heartRateValues))) {
      throw Error('Garmin heart-rate request returned an unexpected readings format.');
    }
    if (!Array.isArray(bb) || bb.some(record => !record ||
        (record.bodyBatteryValuesArray != null && !Array.isArray(record.bodyBatteryValuesArray)))) {
      throw Error('Garmin Body Battery request returned an unexpected readings format.');
    }
    hrs.push(...(hr.heartRateValues || []));
    for (const record of bb) batteries.push(...(record.bodyBatteryValuesArray || []));
  }
  const hr = reading(hrs, 1, 300, now), bb = reading(batteries, 0, 100, now);
  const diagnostics = {hr, bb};
  if (hr.status !== "fresh" || bb.status !== "fresh") return {diagnostics};
  return { diagnostics, allowed: hr.value >= 50 && hr.value <= 110 && bb.value >= 25,
    expires: Math.min(hr.at, bb.at) + 1800000,
    health: { hr: hr.value, bb: bb.value, hrAt: hr.at, bbAt: bb.at } };
}
module.exports = { decision, reading, describe };
