const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'space.js'), 'utf8');

test('Space Tutorial teaches the five campaign-critical skill families', () => {
  for (const title of [
    'MOVE \\+ AIM',
    'DODGE \\+ SWARM',
    'USE SOCKETS',
    'RESCUE',
    'BLACKOUT',
  ]) {
    assert.match(source, new RegExp(title));
  }
  assert.match(source, /AUTO-FIRE BREAKS ROCKS/);
  assert.match(source, /STOP RED RUSHERS/);
  assert.match(source, /CATCH 3 BATTERIES/);
});

test('tutorial mastery requires movement, every socket, rescue, and blackout success', () => {
  assert.match(source, /academyMoveDistance >= W \* 0\.38/);
  assert.match(source, /academyRocksDestroyed >= 2/);
  assert.match(source, /SOCKET_TYPES\.every\(type => academyDeployedSockets\.has\(type\)\)/);
  assert.match(source, /academyGoal === 'rescueLock'/);
  assert.match(source, /academyGoalComplete = !!encounter\.passed/);
});

test('the attack target survives until it demonstrates an incoming shot', () => {
  assert.match(source, /academyAwaitingShot = true/);
  assert.match(source, /shooter\.academyAwaitingShot = false/);
  assert.match(source, /WATCH ITS SHOT/);
});

test('tutorial timeouts are honest instead of awarding mastery', () => {
  assert.match(source, /academySkippedLessons\+\+/);
  assert.match(source, /LESSON SKIPPED — KEEP PRACTICING/);
  assert.match(source, /ALL SYSTEMS MASTERED — CAMPAIGN READY/);
});

test('the tutorial blackout is a shortened version of the campaign battery run', () => {
  assert.match(source, /batteryGoal: tutorialBlackout \? 3 : 5/);
  assert.match(source, /batteryTotal: tutorialBlackout \? 6 : 10/);
  assert.match(source, /rockTotal: tutorialBlackout \? 5 : 11/);
  assert.match(source, /startBlackoutBatteryTestEncounter\(\{ tutorial: true \}\)/);
});
