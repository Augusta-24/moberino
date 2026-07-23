const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dataSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey-data.js'),
  'utf8'
);

function loadJourneyData() {
  const window = {};
  vm.runInNewContext(dataSource, { window, Object });
  return window.JourneyData;
}

test('Chapter One route IDs are unique and every connection resolves', () => {
  const data = loadJourneyData();
  const ids = data.routeNodes.map(node => node.id);

  assert.equal(new Set(ids).size, ids.length);
  data.routeNodes.forEach(node => {
    node.connections.forEach(connectionId => {
      assert.ok(data.getNode(connectionId), `${node.id} points to missing node ${connectionId}`);
    });
  });
});

test('Chapter One route connections are reversible and configuration is frozen', () => {
  const data = loadJourneyData();

  data.routeNodes.forEach(node => {
    node.connections.forEach(connectionId => {
      assert.ok(
        data.getNode(connectionId).connections.includes(node.id),
        `${node.id} -> ${connectionId} is not reversible`
      );
    });
  });
  assert.equal(Object.isFrozen(data), true);
  assert.equal(Object.isFrozen(data.routeNodes), true);
  assert.equal(Object.isFrozen(data.getNode('home-orbit')), true);
});

test('Journey controller does not own storage or load the live Space Mobe runtime', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'games', 'journey.js'),
    'utf8'
  );

  assert.equal(controller.includes('localStorage'), false);
  assert.equal(controller.includes('space.js'), false);
  assert.equal(controller.includes('initSpace'), false);
});

test('route choice returns to the ship and departure happens from the destination section', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'games', 'journey.js'),
    'utf8'
  );

  assert.match(controller, /onclick="journeyChooseDestination\('/);
  assert.match(controller, /window\.journeyChooseDestination/);
  assert.match(controller, /window\.journeyDepart/);
  assert.match(controller, /PILOT'S CALL/);
  assert.equal(controller.includes('window.journeyTravelTo'), false);
});

test('Journey combat is isolated from storage and exposes lifecycle methods', () => {
  const combat = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'games', 'journey-combat.js'),
    'utf8'
  );

  assert.equal(combat.includes('localStorage'), false);
  assert.equal(combat.includes('space.js'), false);
  assert.match(combat, /window\.JourneyCombat/);
  assert.match(combat, /\bstart\b/);
  assert.match(combat, /\bdestroy\b/);
});

test('Journey typography does not use unreadably small literal pixel sizes', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'css', 'games', 'journey.css'),
    'utf8'
  );
  const declaredSizes = [...css.matchAll(/(?:font-size|font):\s*(\d+)px/g)]
    .map(match => Number(match[1]));

  assert.ok(declaredSizes.length > 0);
  assert.equal(
    declaredSizes.filter(size => size < 10).length,
    0,
    `Found Journey font sizes below 10px: ${declaredSizes.filter(size => size < 10).join(', ')}`
  );
});
