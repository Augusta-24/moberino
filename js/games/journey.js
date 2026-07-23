/* Journey controller. Persistent route and combat modules plug into this shell
   without depending on Space Mobe's live runtime. */
(function () {
  'use strict';

  const hostId = 'journey-wrap';
  let active = false;

  function host() {
    return document.getElementById(hostId);
  }

  function playMenuSound() {
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') {
      SFX.menuSelect();
    }
  }

  function renderMenu() {
    const root = host();
    if (!root || !active) return;
    const canContinue = JourneyState.hasSave();
    root.innerHTML = `
      <main class="journey-menu" aria-labelledby="journey-title">
        <div class="journey-starfield" aria-hidden="true"></div>
        <button class="journey-arcade-back" type="button" onclick="nav('lobby')">◀ ARCADE</button>
        <section class="journey-menu-panel">
          <div class="journey-kicker">A PERSISTENT SPACE EXPEDITION</div>
          <h1 id="journey-title">JOURNEY</h1>
          <div class="journey-ship-mark" aria-hidden="true">
            <span class="journey-ship-body">▲</span>
            <span class="journey-ship-trail"></span>
          </div>
          <p>Keep a patched-up ship moving toward the far edge of the map.</p>
          <div class="journey-menu-actions">
            <button class="journey-primary-btn" type="button" onclick="journeyContinue()" ${canContinue ? '' : 'disabled'}>
              ${canContinue ? 'CONTINUE JOURNEY' : 'NO JOURNEY SAVED'}
            </button>
            <button class="journey-secondary-btn" type="button" onclick="journeyNew()">NEW JOURNEY</button>
            <button class="journey-text-btn" type="button" onclick="journeyHowToPlay()">HOW TO PLAY</button>
          </div>
          <div class="journey-build-note">CHAPTER ONE SYSTEMS ONLINE</div>
        </section>
      </main>`;
  }

  function resourceCard(label, value, max, className) {
    const percent = Math.round((value / max) * 100);
    return `
      <div class="journey-resource ${className}">
        <div class="journey-resource-label"><span>${label}</span><strong>${Math.round(value)} / ${Math.round(max)}</strong></div>
        <div class="journey-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${Math.round(max)}" aria-valuenow="${Math.round(value)}">
          <span style="width:${percent}%"></span>
        </div>
      </div>`;
  }

  function currentNode(state) {
    return JourneyData.getNode(state.currentNodeId) || JourneyData.getNode('home-orbit');
  }

  function renderCurrentLocation() {
    const state = JourneyState.getState();
    const node = state && currentNode(state);
    if (node && node.id === 'fuel-stop-1' && !state.route.completedNodes.includes(node.id)) {
      renderFuelStop();
      return;
    }
    if (node && node.type === 'encounter' && !state.route.completedNodes.includes(node.id)) {
      renderEncounterBriefing(node);
      return;
    }
    renderShip();
  }

  function renderShip() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) {
      renderMenu();
      return;
    }
    const r = state.resources;
    const location = currentNode(state);
    const destination = JourneyData.getNode(state.selectedDestinationId);
    const notices = JourneyState.getReturnSummary();
    const canRepair = r.hull < r.maxHull && state.currency.salvage >= 5;
    const canRefuel = location.id === 'fuel-stop-1' && r.fuel < r.maxFuel;
    const canRest = r.pilot < 100;
    const canDepart = !!destination && destination.implemented && r.fuel >= destination.fuelCost;
    root.innerHTML = `
      <main class="journey-ship-screen" aria-labelledby="journey-ship-title">
        <header class="journey-topbar">
          <button class="journey-arcade-back" type="button" onclick="journeyMenu()">◀ MENU</button>
          <div>
            <span>${location.name.toUpperCase()}</span>
            <strong id="journey-ship-title">THE WAYFARER</strong>
          </div>
          <span class="journey-save-status">SAVED</span>
        </header>
        <section class="journey-return-panel" ${notices.length ? '' : 'hidden'}>
          <strong>SHIP LOG</strong>
          <span>${notices.join(' ')}</span>
        </section>
        <section class="journey-ship-bay">
          <div class="journey-ship-visual" aria-label="Your patched-up ship">
            <div class="journey-orbit-line"></div>
            <div class="journey-large-ship">▲</div>
            <span>PATCHED · PRESSURIZED · READY</span>
          </div>
          <div class="journey-status-panel">
            <div class="journey-section-label">SHIP STATUS</div>
            ${resourceCard('HULL', r.hull, r.maxHull, 'is-hull')}
            ${resourceCard('FUEL', r.fuel, r.maxFuel, 'is-fuel')}
            ${resourceCard('POWER', r.power, r.maxPower, 'is-power')}
            ${resourceCard('PILOT', r.pilot, 100, 'is-pilot')}
            <div class="journey-next-stop">
              <span>NEXT DESTINATION</span>
              <strong>${destination ? destination.name.toUpperCase() : 'NOT SELECTED'}</strong>
              <small>${destination ? `${destination.fuelCost} FUEL · ${destination.distance} DISTANCE` : 'Open the route and choose a connected stop.'}</small>
            </div>
          </div>
        </section>
        <nav class="journey-ship-actions" aria-label="Ship actions">
          <button type="button" onclick="journeyRoute()">ROUTE <small>CHOOSE A STOP</small></button>
          <button type="button" onclick="journeyRepair()" ${canRepair ? '' : 'disabled'}>REPAIR <small>${r.hull >= r.maxHull ? 'HULL FULL' : state.currency.salvage < 5 ? 'NEEDS 5 SALVAGE' : '5 SALVAGE'}</small></button>
          <button type="button" onclick="journeyRefuel()" ${canRefuel ? '' : 'disabled'}>REFUEL <small>${r.fuel >= r.maxFuel ? 'TANK FULL' : location.id !== 'fuel-stop-1' ? 'FIND A FUEL STOP' : 'STATION SERVICE'}</small></button>
          <button type="button" onclick="journeyRest()" ${canRest ? '' : 'disabled'}>REST <small>${canRest ? 'RESTORE 25' : 'PILOT READY'}</small></button>
          <button class="journey-depart-btn" type="button" onclick="journeyDepart()" ${canDepart ? '' : 'disabled'}>DEPART <small>${!destination ? 'SELECT ROUTE' : !destination.implemented ? 'ROUTE NOT READY' : r.fuel < destination.fuelCost ? `NEEDS ${destination.fuelCost} FUEL` : destination.shortName}</small></button>
        </nav>
      </main>`;
  }

  function nodeStatus(state, node) {
    if (state.currentNodeId === node.id) return 'CURRENT';
    if (state.route.completedNodes.includes(node.id)) return 'COMPLETE';
    if (state.route.visitedNodes.includes(node.id)) return 'VISITED';
    if (state.route.unlockedNodes.includes(node.id)) return node.implemented ? 'AVAILABLE' : 'COMING NEXT';
    return 'LOCKED';
  }

  function renderRoute() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const location = currentNode(state);
    const connectedIds = new Set(location.connections);
    root.innerHTML = `
      <main class="journey-route-screen" aria-labelledby="journey-route-title">
        <header class="journey-route-header">
          <button class="journey-arcade-back" type="button" onclick="journeyShip()">◀ SHIP</button>
          <div>
            <span>CHAPTER ONE · GET OUT OF TOWN</span>
            <h1 id="journey-route-title">ROUTE</h1>
          </div>
          <strong>${Math.round(state.resources.fuel)} FUEL</strong>
        </header>
        <section class="journey-route-map" aria-label="Chapter One route">
          ${JourneyData.routeNodes.map((node, index) => {
            const status = nodeStatus(state, node);
            const connected = connectedIds.has(node.id);
            const unlocked = state.route.unlockedNodes.includes(node.id);
            const selectable = connected && unlocked && node.implemented && node.id !== state.currentNodeId;
            const selected = state.selectedDestinationId === node.id;
            return `
              <article class="journey-route-node is-${node.type} ${selected ? 'is-selected' : ''} ${selectable ? 'is-selectable' : ''}" data-status="${status}">
                <div class="journey-route-index">${String(index + 1).padStart(2, '0')}</div>
                <div class="journey-route-node-copy">
                  <span>${node.type.toUpperCase()} · ${status}</span>
                  <h2>${node.name}</h2>
                  <p>${node.description}</p>
                </div>
                <div class="journey-route-cost">
                  <strong>${node.id === 'home-orbit' ? '—' : node.fuelCost}</strong>
                  <span>${node.id === 'home-orbit' ? 'ORIGIN' : 'FUEL'}</span>
                </div>
                ${selectable ? `<button type="button" onclick="journeySelectDestination('${node.id}')">${selected ? 'SELECTED' : 'SELECT'}</button>` : ''}
              </article>`;
          }).join('')}
        </section>
        <div class="journey-route-footer">
          <span>Only connected, prepared stops can be selected.</span>
          <button class="journey-primary-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
        </div>
      </main>`;
  }

  function renderFuelStop() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    root.innerHTML = `
      <main class="journey-destination-screen" aria-labelledby="journey-fuel-title">
        <div class="journey-fuel-beacon" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <section>
          <div class="journey-kicker">DESTINATION REACHED · 18 DISTANCE</div>
          <h1 id="journey-fuel-title">LANTERN<br>FUEL STOP</h1>
          <p>The beacon keeper waves your patched-up ship toward an open pump.</p>
          <blockquote>“First tank is on the house. The Scrap Belt starts just past our lights.”</blockquote>
          <div class="journey-arrival-stats">
            <span>CURRENT FUEL <strong>${Math.round(state.resources.fuel)} / ${Math.round(state.resources.maxFuel)}</strong></span>
            <span>NEXT ROUTE <strong>SCRAP BELT</strong></span>
          </div>
          <button class="journey-primary-btn" type="button" onclick="journeyCompleteFuelStop()">REFUEL AND CONTINUE</button>
        </section>
      </main>`;
  }

  function renderEncounterBriefing(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    root.innerHTML = `
      <main class="journey-briefing-screen" aria-labelledby="journey-briefing-title">
        <section class="journey-briefing-art" aria-hidden="true">
          <div class="journey-briefing-ship">▲</div>
          <i></i><i></i><i></i><i></i><i></i>
        </section>
        <section class="journey-briefing-copy">
          <div class="journey-kicker">ROUTE ENCOUNTER · ASTEROID SALVAGE</div>
          <h1 id="journey-briefing-title">${node.name}</h1>
          <p>Cross the drifting wreckage, break apart incoming asteroids, and collect what you can without losing the ship.</p>
          <div class="journey-objective-list">
            <span><strong>30 SEC</strong> SURVIVE THE BELT</span>
            <span><strong>5 SALVAGE</strong> OPTIONAL TARGET</span>
            <span><strong>${Math.round(state.resources.hull)} HULL</strong> CURRENT CONDITION</span>
          </div>
          <div class="journey-briefing-controls">
            <span>DESKTOP · A/D OR ARROWS</span>
            <span>TOUCH · DRAG TO STEER</span>
            <span>BLASTER · AUTO-FIRE</span>
          </div>
          <div class="journey-briefing-actions">
            <button class="journey-primary-btn" type="button" onclick="journeyStartEncounter()">ENTER SCRAP BELT</button>
            <button class="journey-text-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
          </div>
        </section>
      </main>`;
  }

  function renderCombat(node, attemptId) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    root.innerHTML = `
      <main class="journey-combat-screen">
        <header class="journey-combat-hud">
          <div><span>HULL</span><strong id="journey-combat-hull">${Math.round(state.resources.hull)}</strong></div>
          <div class="journey-combat-title"><span>SCRAP BELT</span><strong>ASTEROID SALVAGE</strong></div>
          <div><span>TIME</span><strong id="journey-combat-time">30</strong></div>
          <div><span>SALVAGE</span><strong id="journey-combat-salvage">0 / 5</strong></div>
        </header>
        <div class="journey-combat-frame">
          <canvas id="journey-combat-canvas" aria-label="Scrap Belt asteroid encounter"></canvas>
          <button class="journey-combat-retreat" type="button" onclick="journeyRetreatEncounter()">RETREAT</button>
        </div>
        <div class="journey-combat-hint">DRAG OR USE A/D · BLASTER AUTO-FIRES</div>
      </main>`;
    JourneyCombat.start({
      canvasId: 'journey-combat-canvas',
      attemptId,
      encounterId: node.encounterId,
      encounterType: 'asteroids',
      difficulty: 1,
      startingHull: state.resources.hull,
      shipStats: {
        blasterLevel: state.upgrades.blasterLevel,
        hullLevel: state.upgrades.hullLevel,
        salvageMagnetLevel: state.upgrades.salvageMagnetLevel
      },
      objectives: {
        surviveSeconds: 30,
        salvageTarget: 5
      },
      onComplete: handleEncounterComplete
    });
  }

  function handleEncounterComplete(result) {
    if (!active) return;
    const applied = JourneyState.applyEncounterResult(result, {
      successSalvage: 20,
      completeNodeId: 'scrap-belt',
      unlockNodeIds: ['distress-signal', 'abandoned-cache']
    });
    if (!applied.ok) {
      renderShip();
      return;
    }
    renderEncounterResults(result, applied);
  }

  function renderEncounterResults(result, applied) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const success = result.outcome === 'success';
    root.innerHTML = `
      <main class="journey-results-screen ${success ? 'is-success' : 'is-failure'}" aria-labelledby="journey-results-title">
        <section>
          <div class="journey-kicker">${success ? 'ROUTE CLEARED' : 'EMERGENCY RETREAT'}</div>
          <h1 id="journey-results-title">${success ? 'BELT CROSSED' : 'SHIP RECOVERED'}</h1>
          <p>${success
            ? 'The Wayfarer emerges from the wreckage with a new route blinking on the navigation board.'
            : 'The ship made it back in one piece. Repair, refuel, and try the crossing again when ready.'}</p>
          <div class="journey-results-grid">
            <span>HULL REMAINING<strong>${Math.round(state.resources.hull)}</strong></span>
            <span>DAMAGE TAKEN<strong>${Math.round(result.damageTaken)}</strong></span>
            <span>SALVAGE AWARDED<strong>+${Math.round(applied.salvageAwarded)}</strong></span>
            <span>FUEL RECOVERED<strong>+${Math.round(applied.fuelAwarded)}</strong></span>
            <span>ASTEROIDS BROKEN<strong>${Math.round(result.stats.asteroidsDestroyed)}</strong></span>
            <span>OPTIONAL TARGET<strong>${result.objectiveComplete ? 'COMPLETE' : 'MISSED'}</strong></span>
          </div>
          <div class="journey-results-actions">
            <button class="journey-primary-btn" type="button" onclick="journeyReturnFromEncounter()">RETURN TO SHIP</button>
            ${success ? '<button class="journey-secondary-btn" type="button" onclick="journeyRoute()">VIEW NEW ROUTE</button>' : ''}
          </div>
        </section>
      </main>`;
  }

  function renderHowToPlay() {
    const root = host();
    if (!root || !active) return;
    root.innerHTML = `
      <main class="journey-info-screen" aria-labelledby="journey-help-title">
        <section>
          <div class="journey-kicker">FLIGHT MANUAL · PAGE 1</div>
          <h1 id="journey-help-title">HOW TO PLAY</h1>
          <p>Return to your ship over time, keep its systems ready, and choose the next stop on a long route through space.</p>
          <ul>
            <li>Fuel lets the ship travel between route nodes.</li>
            <li>Hull damage remains until you repair it.</li>
            <li>Power and pilot readiness recover while you are away.</li>
            <li>Encounters earn salvage, discoveries, upgrades, and passengers.</li>
          </ul>
          <p class="journey-help-note">Nothing dangerous happens while you are away.</p>
          <button class="journey-primary-btn" type="button" onclick="journeyMenu()">BACK</button>
        </section>
      </main>`;
  }

  window.journeyMenu = function () {
    playMenuSound();
    renderMenu();
  };

  window.journeyContinue = function () {
    playMenuSound();
    JourneyState.load();
    renderCurrentLocation();
  };

  window.journeyNew = function () {
    playMenuSound();
    if (JourneyState.hasSave() && !window.confirm('START A NEW JOURNEY?\\nYour current Journey save will be replaced.')) return;
    JourneyState.createNew();
    renderCurrentLocation();
  };

  window.journeyHowToPlay = function () {
    playMenuSound();
    renderHowToPlay();
  };

  window.journeyShip = function () {
    playMenuSound();
    renderShip();
  };

  window.journeyRoute = function () {
    playMenuSound();
    renderRoute();
  };

  window.journeySelectDestination = function (destinationId) {
    const state = JourneyState.getState();
    const location = state && currentNode(state);
    const destination = JourneyData.getNode(destinationId);
    if (!state || !location || !destination || !location.connections.includes(destinationId) || !destination.implemented) return;
    playMenuSound();
    JourneyState.selectDestination(destinationId);
    renderRoute();
  };

  window.journeyDepart = function () {
    const state = JourneyState.getState();
    const origin = state && currentNode(state);
    const destination = state && JourneyData.getNode(state.selectedDestinationId);
    if (!state || !origin || !destination || !origin.connections.includes(destination.id) || !destination.implemented) return;
    playMenuSound();
    const result = JourneyState.travel({
      originId: origin.id,
      destinationId: destination.id,
      fuelCost: destination.fuelCost,
      distance: destination.distance
    });
    if (result.ok) renderCurrentLocation();
    else renderShip();
  };

  window.journeyCompleteFuelStop = function () {
    playMenuSound();
    JourneyState.refuelToMax('fuel-stop-service');
    JourneyState.completeNode('fuel-stop-1', ['scrap-belt']);
    renderShip();
  };

  window.journeyStartEncounter = function () {
    const state = JourneyState.getState();
    const node = state && currentNode(state);
    if (!state || !node || node.type !== 'encounter' || !node.encounterId) return;
    playMenuSound();
    const attempt = JourneyState.beginEncounter(node.encounterId);
    if (!attempt.ok) return;
    renderCombat(node, attempt.attemptId);
  };

  window.journeyRetreatEncounter = function () {
    playMenuSound();
    JourneyCombat.destroy();
    renderShip();
  };

  window.journeyReturnFromEncounter = function () {
    playMenuSound();
    renderShip();
  };

  window.journeyRefuel = function () {
    playMenuSound();
    const state = JourneyState.getState();
    if (state && state.currentNodeId === 'fuel-stop-1') JourneyState.refuelToMax('fuel-stop-service');
    renderShip();
  };

  window.journeyRest = function () {
    playMenuSound();
    JourneyState.restPilot(25);
    renderShip();
  };

  window.journeyRepair = function () {
    playMenuSound();
    JourneyState.repairHull(20, 5);
    renderShip();
  };

  window.initJourney = function () {
    active = true;
    if (typeof setArcadeExitVisible === 'function') setArcadeExitVisible(false);
    if (typeof setArcadeModeSelect === 'function') setArcadeModeSelect(false);
    renderMenu();
  };

  window.journeyBack = function () {
    if (!active) return;
    active = false;
    JourneyCombat.destroy();
    JourneyState.saveJourneyState('exit');
    JourneyState.clearInMemory();
    const root = host();
    if (root) root.innerHTML = '';
  };

  window.Journey = Object.freeze({
    gameId: 'journey',
    init: window.initJourney,
    destroy: window.journeyBack
  });
})();
