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
  assert.match(source, /tapToScan:\s*true/);
  assert.match(source, /allowFire:\s*false/);
  assert.match(source, /scanPulseRadius:/);
  assert.match(source, /captureRadius:/);
  assert.match(source, /scanDecayRate:/);
  assert.match(source, /onScanLost/);
  assert.match(source, /playScanPulse/);
  assert.match(source, /signalWaypointIndex/);
  assert.match(source, /evasionPush/);
  assert.match(source, /captureRatio/);
  assert.match(source, /r:\s*11/);
  assert.match(source, /captureRadius:\s*76/);
  assert.match(source, /onTractorAttach/);
  assert.match(source, /type:\s*'salvage'/);
  assert.match(source, /onPlayerDamage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /JourneyState/);
});

test('Scrap Belt succeeds through route progress and signal acquisition, not a timer', () => {
  assert.match(source, /ROUTE_DISTANCE/);
  assert.match(source, /snapshot\.scrollDistance >= ROUTE_DISTANCE && signalLocked/);
  assert.match(source, /objectiveComplete:\s*outcome === 'success' && signalLocked/);
  assert.doesNotMatch(source, /surviveSeconds/);
  assert.doesNotMatch(source, /setTimeout/);
  assert.doesNotMatch(source, /30 SEC/);
});

test('Scrap Belt teaches controls before hazards and celebrates success before results', () => {
  assert.match(controller, /journey-mission-start-overlay/);
  assert.match(controller, /TAP TO SCAN THE AREA/);
  assert.match(controller, /FIND THE RING/);
  assert.match(controller, /STAY INSIDE/);
  assert.match(controller, /CAPTURE THE SIGNAL/);
  assert.doesNotMatch(controller, /journey-mission-start-steps/);
  assert.doesNotMatch(controller, /DRAG OR WASD · Q SCAN PULSE/);
  assert.match(controller, /window\.journeyAdvanceScrapBeltTutorial/);
  assert.match(controller, /function renderScrapBeltTutorialStep/);
  assert.match(controller, /tutorial-scan/);
  assert.match(controller, /tutorial-lock/);
  assert.match(controller, /function beginScrapBeltMission/);
  assert.match(controller, /startScrapBeltRuntime\(node, null, true\)/);
  assert.match(controller, /JourneyScrapBelt\.begin\(attempt\.attemptId\)/);
  assert.match(source, /JourneyMissionRuntime\.setPaused\(false\)/);
  assert.match(controller, /onSuccessReady/);
  assert.match(controller, /function renderScrapBeltVictory/);
  assert.match(controller, /MISSION COMPLETE/);
  assert.match(controller, /SIGNAL ACQUIRED/);
  assert.match(controller, /window\.journeyConfirmScrapBeltSuccess/);
  assert.match(source, /playMissionComplete/);
  assert.match(source, /completedConfig\.onSuccessReady\(result\)/);
  assert.match(source, /completedConfig\.onFailureReady\(result\)/);
  assert.match(controller, /function renderScrapBeltFailure/);
  assert.match(controller, /window\.journeyRetryScrapBelt/);
  assert.match(controller, /RETRY MISSION/);
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
  assert.match(controller, /if \(node\.id === 'scrap-belt'\) \{\s*renderScrapBelt\(node\)/);
  assert.match(controller, /CROSS THE BELT/);
  assert.match(controller, /LOCK THE CRYSTAL TRAIL/);
  assert.match(controller, /TAP THE PLAYFIELD TO SCAN/);
  assert.doesNotMatch(controller, /journeyMissionControl\('fire', true\)/);
  assert.match(controller, /journeyMissionTractor/);
  assert.match(controller, /function renderScrapBeltExit/);
  assert.match(controller, /ROUTE ACQUIRED/);
  assert.match(controller, /journeyContinueScrapBeltExit/);
});

test('Scrap Belt HUD shows only health and the current action', () => {
  assert.match(controller, /journey-combat-hull-readout/);
  assert.match(controller, /journey-scrap-objective/);
  assert.match(controller, /id="journey-scrap-status"/);
  assert.doesNotMatch(controller, /id="journey-scrap-distance"/);
  assert.doesNotMatch(controller, /id="journey-scrap-signal"/);
  assert.doesNotMatch(controller, /id="journey-scrap-salvage"/);
});
