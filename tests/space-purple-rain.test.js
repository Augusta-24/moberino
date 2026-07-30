const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'space.js'), 'utf8');
const rainUpdate = source.slice(
  source.indexOf('const RAIN_WARNING_MS'),
  source.indexOf('function finishRainCloud')
);
const rainDraw = source.slice(
  source.indexOf('function drawPurpleStormWeather()'),
  source.indexOf('// RAVE wave:')
);

test('Purple Rain alternates a warning, damaging band, and real dry attack window', () => {
  assert.match(rainUpdate, /RAIN_WARNING_MS = 420/);
  assert.match(rainUpdate, /RAIN_FALL_MS = 980/);
  assert.match(rainUpdate, /RAIN_DRY_MS = 1120/);
  assert.match(rainUpdate, /phase === 'falling' && !covered/);
  assert.match(rainUpdate, /DRY GAP — FLY OUT & FIRE!/);
});

test('the rain orb is hard cover for the whole ship', () => {
  assert.match(source, /radius: Math\.max\(56, Math\.min\(64, W \* 0\.17\)\)/);
  assert.match(rainUpdate, /Math\.abs\(player\.x - encounter\.eye\.x\) \+ shipRadius <= encounter\.eye\.radius/);
  assert.match(rainUpdate, /covered \|\| phase !== 'falling'/);
  assert.match(source, /_rainCoverBlocksFire = playerCoveredByRainEye\(activeRainEncounter\(\)\)/);
  assert.match(source, /!_rainCoverBlocksFire && ts-lastAutoFire>curFireMs/);
});

test('visible rain uses the same band and orb-cover rules as damage', () => {
  assert.match(rainDraw, /phase === 'falling'/);
  assert.match(rainDraw, /Math\.hypot\(x - encounter\.eye\.x, y - eyeY\) < encounter\.eye\.radius \+ 8/);
  assert.match(rainDraw, /RAIN BAND INCOMING/);
});
