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

function latest(rows, low, high, now) {
  return rows.filter(row => Array.isArray(row) && Number.isFinite(row[0]) &&
    Number.isFinite(row[1]) && row[1] >= low && row[1] <= high &&
    row[0] <= now && now - row[0] < 1800000).sort((a, b) => b[0] - a[0])[0];
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
  const hr = latest(hrs, 1, 300, now), bb = latest(batteries, 0, 100, now);
  if (!hr || !bb) return {};
  return { allowed: hr[1] >= 50 && hr[1] <= 110 && bb[1] >= 25,
    expires: Math.min(hr[0], bb[0]) + 1800000,
    health: { hr: hr[1], bb: bb[1], hrAt: hr[0], bbAt: bb[0] } };
}
module.exports = { decision };
