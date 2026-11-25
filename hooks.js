// Local-cache-only Git helpers. No credentials or network access.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {randomInt} = require('node:crypto');
const MAX_AGE = 3600000;
const affirmations = [
  'You are allowed to call it a day with a green build.',
  'Your worth is independent of your contribution graph.',
  'You have already done enough to earn a break.',
  "Tomorrow's you is a perfectly qualified reviewer."
];
// Evaluate the same cached measurements at refresh, display, and push time.
const MAX_ESTIMATE_AGE = 12 * MAX_AGE;
function evaluateReadings(cache, now = Date.now()) {
  const {heart, battery, drainRate, learned} = cache;
  let hr = heart;
  let bb = battery;
  if (heart?.status === 'fresh' && now - heart.at >= MAX_AGE) hr = {...heart, status: 'stale'};
  const age = now - battery?.at;
  const hasAnchor = Number.isFinite(battery?.value) && battery.value >= 0 && battery.value <= 100 &&
    Number.isFinite(battery.at) && age >= 0;
  if (hasAnchor) {
    if (age < MAX_AGE) bb = {...battery, status: 'fresh'};
    else if (age < MAX_ESTIMATE_AGE && Number.isFinite(drainRate) && drainRate > 0) {
      const value = Math.max(0, Math.round(battery.value - drainRate * age / MAX_AGE));
      bb = {...battery, value, status: 'estimated', measuredValue: battery.value, drainRate, learned};
    } else bb = {...battery, status: 'stale'};
  }
  const diagnostics = {hr, bb};
  if (hr?.status !== 'fresh' || !Number.isFinite(hr.value) || hr.value < 1 || hr.value > 300 ||
      !Number.isFinite(hr.at) || hr.at > now || !hasAnchor ||
      (bb.status !== 'fresh' && bb.status !== 'estimated')) return {diagnostics};
  const result = {diagnostics, allowed: hr.value >= 50 && hr.value <= 110 && bb.value >= 25,
    expires: Math.min(hr.at + MAX_AGE, battery.at + (bb.status === 'fresh' ? MAX_AGE : MAX_ESTIMATE_AGE))};
  if (bb.status === 'fresh') result.health = {hr: hr.value, hrAt: hr.at, bb: bb.value, bbAt: bb.at};
  return result;
}
function check(state, now = Date.now()) {
  if (state?.readings) state = evaluateReadings(state.readings, now);
  if (!state || !Number.isFinite(state.expires) || state.expires <= now ||
      state.expires > now + MAX_AGE || typeof state.allowed !== 'boolean') {
    return [1, 'Push paused: health readings are missing, invalid, or expired. Click the Push for Peace status-bar item in VS Code to refresh and see details.'];
  }
  return state.allowed ? [0, 'Push approved. May your diff be small.'] :
    [1, 'Push paused. Please, choose peace. The branch can wait. ' + affirmations[randomInt(affirmations.length)]];
}
function payload(state, now = Date.now()) {
  const h = state?.health;
  if (!h) return null;
  for (const [name, low, high] of [['hr', 1, 300], ['bb', 0, 100]]) {
    if (!Number.isFinite(h[name]) || h[name] < low || h[name] > high ||
        !Number.isFinite(h[name + 'At']) || now - h[name + 'At'] < 0 || now - h[name + 'At'] >= MAX_AGE) return null;
  }
  return {v: 1, hr: h.hr, bb: h.bb};
}
const git = (args, input) => execFileSync('git', args, {input, maxBuffer: 16 * 1024 * 1024});
function updateMessage(original, health) {
  // Latin-1 is a reversible byte mapping: preserve even non-UTF-8 commit text.
  const message = original.toString('latin1');
  let cleaned = message.replace(/^Push-For-Peace: (\{[^\r\n]*\})\r?\n?$/gm, (line, json) => {
    try {
      const old = JSON.parse(json);
      if (old && old.v === 1 && Object.hasOwn(old, 'hr') && Object.hasOwn(old, 'bb')) return '';
    } catch {}
    return line;
  });
  if (cleaned !== message) cleaned = cleaned.replace(/[\r\n]+$/, '') + '\n';
  const bytes = Buffer.from(cleaned, 'latin1');
  if (!health || !git(['stripspace', '--strip-comments'], bytes).toString().trim()) return bytes;
  return git(['interpret-trailers', '--if-exists', 'replace', '--trailer',
    'Push-For-Peace: ' + JSON.stringify(health)], bytes);
}
function readState(home) {
  try { return JSON.parse(fs.readFileSync(path.join(home, 'verdict.json'), 'utf8')); }
  catch { return {}; }
}
function embed(messagePath, home = __dirname) {
  const target = git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-push']).toString().trim();
  let enabled = false;
  try {
    const hook = fs.readFileSync(target, 'utf8');
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    enabled = hook === '#!/bin/sh\n# Push for Peace\nexec ' + quote(path.join(home, 'run-hook.sh')) + ' check\n';
  } catch {}
  const original = fs.readFileSync(messagePath);
  const updated = updateMessage(original, enabled ? payload(readState(home)) : null);
  if (!original.equals(updated)) fs.writeFileSync(messagePath, updated);
}
if (require.main === module) {
  try {
    if (process.argv[2] === 'demo') {
      for (const allowed of [true, false, null]) console.log(check({allowed, expires: Date.now() + 5000})[1]);
    } else if (process.argv[2] === 'embed') {
      if (!process.argv[3]) throw Error('Missing message file');
      embed(process.argv[3]);
    } else if (process.argv[2] === 'check') {
      const [code, message] = check(readState(__dirname));
      console.error(message); process.exitCode = code;
    } else throw Error('Unknown hook command');
  } catch {
    console.error('Push for Peace could not run its local Git hook. Reload VS Code to repair the runtime, then retry.');
    process.exitCode = 1;
  }
}
module.exports = {MAX_AGE, MAX_ESTIMATE_AGE, evaluateReadings, check, payload, updateMessage, embed};
