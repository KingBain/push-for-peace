const {MAX_AGE, MAX_ESTIMATE_AGE, evaluateReadings} = require('./hooks');
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
    now - row[0] >= 3600000 ? 'stale' : 'fresh'};
}

function formatTimestamp(timestamp, {locale, timeZone} = {}) {
  const options = {year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'};
  if (timeZone?.trim()) options.timeZone = timeZone.trim();
  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(timestamp);
  } catch {
    delete options.timeZone;
    return new Intl.DateTimeFormat(undefined, options).format(timestamp) +
      ' (system timezone; check Push for Peace display timezone setting)';
  }
}

function describe(label, reading, now = Date.now(), display = {}) {
  if (!reading) return label + ': unavailable';
  if (reading.status === 'estimated') {
    const source = reading.learned ? 'learned drain' : 'default drain';
    return label + ': estimated ' + reading.value + '% (last measured ' + reading.measuredValue + '% at ' +
      formatTimestamp(reading.at, display) + ', ' + source + ' ' + reading.drainRate.toFixed(1) + ' points/hour)';
  }
  const status = reading.status === 'fresh' && now - reading.at >= 3600000 ? 'stale' : reading.status;
  return label + ': ' + status + (reading.at ? ' (last sample ' + formatTimestamp(reading.at, display) + ')' : '');
}

// Keep only the latest observation, an unfinished learning window, and aggregate totals.
function learnBattery(previous, rows, now) {
  const model = {...previous};
  const samples = rows.filter(row => Array.isArray(row) && Number.isFinite(row[0]) &&
    row[0] > 0 && row[0] <= now && Number.isFinite(row[1]) && row[1] >= 0 && row[1] <= 100)
    .sort((a, b) => a[0] - b[0]);
  for (const [at, value] of samples) {
    const last = model.last;
    if (last && at <= last.at) continue;
    model.last = {at, value};
    if (!model.start || !last || at - last.at > MAX_AGE || value > last.value) {
      model.start = model.last;
      continue;
    }
    const hours = (at - model.start.at) / MAX_AGE;
    if (hours < 0.5) continue;
    const points = model.start.value - value;
    if (points > 0) {
      // Weight recent observed drain more heavily; never fit across recharge or dropout.
      model.points = (model.points || 0) * 0.95 + points;
      model.hours = (model.hours || 0) * 0.95 + hours;
      model.windows = Math.min(3, (model.windows || 0) + 1);
    }
    model.start = model.last;
  }
  return model;
}

async function decision(key, previous = {}) {
  const token = await request('Garmin key exchange', '/personalapitoken-service/personal-api/personal-api-key/token', 'ApiKey ' + key, 'POST');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error('Garmin key exchange returned an unexpected token format.');
  const now = Date.now();
  const dateAt = t => new Date(t).toLocaleDateString('en-CA');
  const hrDates = new Set([dateAt(now), dateAt(now - MAX_AGE)]);
  const bbDates = new Set(hrDates);
  if (!previous.last) bbDates.add(dateAt(now - MAX_ESTIMATE_AGE));
  const get = (stage, endpoint) => request(stage, '/wellness-service/wellness/' + endpoint, 'Bearer ' + token);
  const hrs = [], batteries = [];
  let bbFailed = false;
  const fetchHeart = async date => {
    const hr = await get('Garmin heart-rate request', 'dailyHeartRate?date=' + date);
    if (!hr || typeof hr !== 'object' || Array.isArray(hr) ||
        (hr.heartRateValues != null && !Array.isArray(hr.heartRateValues))) {
      throw Error('Garmin heart-rate request returned an unexpected readings format.');
    }
    hrs.push(...(hr.heartRateValues || []));
  };
  const fetchBattery = async date => {
    try {
      const bb = await get('Garmin Body Battery request', 'bodyBattery/reports/daily?startDate=' + date + '&endDate=' + date);
      if (!Array.isArray(bb)) throw Error('Invalid battery response');
      for (const record of bb) {
        if (!record || (record.bodyBatteryValuesArray != null && !Array.isArray(record.bodyBatteryValuesArray))) {
          throw Error('Invalid battery rows');
        }
        batteries.push(...(record.bodyBatteryValuesArray || []));
      }
    } catch {
      bbFailed = true;
    }
  };
  await Promise.all([...Array.from(hrDates, fetchHeart), ...Array.from(bbDates, fetchBattery)]);
  const batteryModel = learnBattery(previous, batteries, now);
  const learned = batteryModel.windows >= 3 && batteryModel.hours > 0;
  const battery = batteryModel.last || reading(batteries, 0, 100, now);
  if (!batteryModel.last && bbFailed && !batteries.length) battery.status = 'unavailable';
  const readings = {heart: reading(hrs, 1, 300, now), battery, learned,
    drainRate: learned ? batteryModel.points / batteryModel.hours : 10 / 3};
  return {...evaluateReadings(readings, now), readings, batteryModel};
}
module.exports = { decision, reading, describe, formatTimestamp, learnBattery };
