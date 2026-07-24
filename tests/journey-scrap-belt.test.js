const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey-scrap-belt.js'),
  'utf8'
);
const controller = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey.js'),
  'utf8'
);

test('Scrap Belt is authored on the reusable mission runtime', () => {
  assert.match(source, /JourneyMissionRuntime\.start/);
  assert.match(source, /forwardScroll:\s*true/);
  assert.match(source, /worldSpeed:/);
  assert.match(source, /getWorldSpeed/);
  assert.match(source, /runtime\.player\.y/);
  assert.match(source, /scanRange:/);
  assert.match(source, /onScanLock/);
  assert.match(source, /onScanReveal/);
  assert.match(source, /scanMode:\s*'pulse'/);
  assert.match(source, /scanPulseRadius:/);
  assert.match(source, /captureRadius:/);
  assert.match(source, /scanDecayRate:/);
  assert.match(source, /onScanLost/);
  assert.match(source, /playScanPulse/);
  assert.match(source, /Math\.sin\(snapshot\.missionTime/);
  assert.match(source, /onTractorAttach/);
  assert.match(source, /onTargetDestroyed/);
  assert.match(source, /onPlayerDamage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /JourneyState/);
});

test('Scrap Belt succeeds through route progress and signal acquisition, not a timer', () => {
  assert.match(source, /ROUTE_DISTANCE/);
  assert.match(source, /snapshot\.scrollDistance >= ROUTE_DISTANCE && signalLocked/);
  assert.match(source, /objectiveComplete:\s*signalLocked/);
  assert.doesNotMatch(source, /surviveSeconds/);
  assert.doesNotMatch(source, /setTimeout/);
  assert.doesNotMatch(source, /30 SEC/);
});

test('rock interactions use the Space Mobe piano language', () => {
  assert.match(source, /function playRockImpact/);
  assert.match(source, /function playRockBreak/);
  assert.match(source, /function playRockPlayerHit/);
  assert.match(source, /\[110,\s*130\.81,\s*146\.83,\s*164\.81,\s*196,\s*220\]/);
  assert.match(source, /playTone\(frequency, 'triangle'/);
});

test('Journey routes Scrap Belt into its traversal screen and tactile controls', () => {
  assert.match(controller, /function renderScrapBelt/);
  assert.match(controller, /if \(node\.id === 'scrap-belt'\) renderScrapBelt/);
  assert.match(controller, /CROSS THE BELT/);
  assert.match(controller, /LOCK THE CRYSTAL TRAIL/);
  assert.match(controller, /journeyMissionScan/);
  assert.match(controller, /journeyMissionControl\('fire', true\)/);
  assert.match(controller, /journeyMissionTractor/);
  assert.match(controller, /function renderScrapBeltExit/);
  assert.match(controller, /ROUTE ACQUIRED/);
  assert.match(controller, /journeyContinueScrapBeltExit/);
});
