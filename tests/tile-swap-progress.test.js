const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const arcade = fs.readFileSync(path.join(__dirname, '..', 'js', 'arcade.js'), 'utf8');
const profiles = fs.readFileSync(path.join(__dirname, '..', 'js', 'arcade-profiles.js'), 'utf8');

test('profile snapshots manage current and legacy Tile Swap save keys', () => {
  for (const key of [
    'moberino-consume-v1',
    'moberino-consume-v2',
    'moberino-knot-swap-words-v2',
    'moberino-knot-swap-words-v3',
    'moberino-knot-swap-numbers-v2',
    'moberino-knot-swap-numbers-v3',
  ]) {
    assert.ok(profiles.includes(`'${key}'`), `missing managed key ${key}`);
  }
});

test('leaderboard recovery writes into the current Tile Swap stores', () => {
  assert.match(arcade, /\['consume', 'moberino-consume-v2'\]/);
  assert.match(arcade, /\['consume-words', 'moberino-knot-swap-words-v3'\]/);
  assert.match(arcade, /\['consume-numbers', 'moberino-knot-swap-numbers-v3'\]/);
});

test('existing and newly entered player codes both repair missing progression', () => {
  assert.match(
    arcade,
    /ArcadeProfiles\.activate\(playerTag, \{ create: true \}\)[\s\S]*?const profile = await profilePromise;[\s\S]*?await restorePlayerProgress\(playerTag\);[\s\S]*?await ArcadeProfiles\.syncNow\(playerTag\)/
  );
  assert.match(
    arcade,
    /if \(restore\) \{\s*await restorePlayerProgress\(tag\);[\s\S]*?await ArcadeProfiles\.syncNow\(tag\)/
  );
});

test('the lobby paints before existing-player network restoration', () => {
  const startup = arcade.slice(
    arcade.indexOf("document.addEventListener('DOMContentLoaded'"),
    arcade.indexOf('// ══════════════════════════════════════\n//  SHARED AUDIO CONTEXT')
  );
  assert.ok(startup.indexOf("nav('lobby')") < startup.indexOf('await profilePromise'));
  assert.ok(startup.indexOf("nav('lobby')") < startup.indexOf('await restorePlayerProgress(playerTag)'));
  assert.ok(startup.indexOf("nav('lobby')") < startup.indexOf('await ArcadeProfiles.syncNow(playerTag)'));
});
