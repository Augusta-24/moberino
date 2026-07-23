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

test('the first Pilot’s Call has authored intel and two playable leads', () => {
  const data = loadJourneyData();
  const intel = data.getTransmission('scrap-belt-signals');

  assert.ok(intel);
  assert.deepEqual(Array.from(intel.leads, lead => lead.nodeId), ['distress-signal', 'abandoned-cache']);
  intel.leads.forEach(lead => assert.equal(data.getNode(lead.nodeId).implemented, true));
  assert.equal(Object.isFrozen(intel), true);
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

test('navigation offers only new stops and Lantern arrival stays on the ship screen', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'games', 'journey.js'),
    'utf8'
  );

  assert.match(controller, /!state\.route\.visitedNodes\.includes\(node\.id\)/);
  assert.match(controller, /location\.id !== 'home-orbit' \? onward : connected/);
  assert.match(controller, /DOCKED AT LANTERN STATION/);
  assert.match(controller, /renderLanternRefuel/);
  assert.match(controller, /MAGNETIC COUPLER INBOUND/);
  assert.match(controller, /COUPLER LOCKED · FUEL FLOWING/);
  assert.match(controller, /journey-refuel-fill/);
  assert.equal(controller.includes('function renderFuelStop'), false);
});

test('the cockpit centers the route and moves detail into ship and log views', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'games', 'journey.js'),
    'utf8'
  );

  assert.match(controller, /journey-cockpit-map/);
  assert.match(controller, /journey-message-bar/);
  assert.match(controller, /journey-target-panel/);
  assert.match(controller, /JourneyState\.getDepartureReadiness/);
  assert.match(controller, /is-ready/);
  assert.match(controller, /is-blocked/);
  assert.match(controller, /journeyOpenEngineering/);
  assert.match(controller, /journeyOpenLog/);
  assert.match(controller, /renderJourneyIntro/);
  assert.match(controller, /selectedHero/);
  assert.match(controller, /STAR CRYSTAL RECOVERED/);
  assert.ok(
    controller.indexOf('<section class="journey-map-panel">') <
      controller.indexOf('<section class="journey-cockpit-ship">')
  );
  assert.ok(
    controller.indexOf('<section class="journey-cockpit-ship">') <
      controller.indexOf('<section class="journey-target-panel')
  );
});

test('the opening story uses the patient Space Mobe cinematic cadence', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'games', 'journey.js'),
    'utf8'
  );

  assert.match(controller, /duration:\s*4500/);
  assert.match(controller, /duration:\s*5200/);
  assert.match(controller, /setTimeout\(showBeat,\s*beat\.duration\)/);
  assert.doesNotMatch(controller, /setTimeout\(showBeat,\s*index === beats\.length \? 3000 : 2600\)/);
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
    declaredSizes.filter(size => size < 12).length,
    0,
    `Found Journey font sizes below 12px: ${declaredSizes.filter(size => size < 12).join(', ')}`
  );
  assert.doesNotMatch(css, /\.journey-target-panel p\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.journey-target-panel\.is-ready/);
  assert.match(css, /\.journey-target-panel\.is-blocked/);
});
