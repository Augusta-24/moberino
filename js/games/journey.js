/* Journey controller. Persistent route and combat modules plug into this shell
   without depending on Space Mobe's live runtime. */
(function () {
  'use strict';

  const hostId = 'journey-wrap';
  let active = false;
  let shipNotice = '';

  function host() {
    return document.getElementById(hostId);
  }

  function playMenuSound() {
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') {
      SFX.menuSelect();
    }
  }

  function shipIllustration(className) {
    return `
      <svg class="${className} journey-ship-svg" viewBox="0 0 240 220" aria-hidden="true">
        <g class="journey-engine-plume">
          <path d="M91 157 L106 207 L119 165 Z" fill="#69d7ff" opacity=".28"/>
          <path d="M121 165 L136 207 L149 157 Z" fill="#69d7ff" opacity=".28"/>
          <path d="M105 158 L120 214 L135 158 Z" fill="#fff1a6" opacity=".8"/>
        </g>
        <path d="M93 77 L27 154 L92 137 L106 105 Z" fill="#3d5872" stroke="#69d7ff" stroke-width="3" stroke-linejoin="round"/>
        <path d="M147 77 L213 154 L148 137 L134 105 Z" fill="#3d5872" stroke="#69d7ff" stroke-width="3" stroke-linejoin="round"/>
        <path d="M120 14 C146 40 157 91 150 145 L136 174 L120 165 L104 174 L90 145 C83 91 94 40 120 14 Z" fill="#dcecf1" stroke="#69d7ff" stroke-width="4" stroke-linejoin="round"/>
        <path d="M120 25 L120 160 L104 169 L91 142 C87 99 96 52 120 25 Z" fill="#a9c6d2" opacity=".72"/>
        <path d="M120 42 C134 54 139 72 137 91 C132 98 108 98 103 91 C101 72 106 54 120 42 Z" fill="#102c4b" stroke="#fff1a6" stroke-width="3"/>
        <path d="M107 113 L132 104 L137 123 L112 132 Z" fill="#fff1a6" opacity=".72" stroke="#5f6d79" stroke-width="2"/>
        <path d="M106 115 L132 107 M110 124 L136 115" stroke="#5f6d79" stroke-width="2" opacity=".8"/>
        <rect x="55" y="132" width="23" height="9" rx="3" fill="#ff7c8f" transform="rotate(-14 55 132)"/>
        <rect x="161" y="132" width="23" height="9" rx="3" fill="#b79cff" transform="rotate(14 161 132)"/>
        <circle cx="120" cy="148" r="6" fill="#69d7ff" stroke="#0b213b" stroke-width="2"/>
      </svg>`;
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
            ${shipIllustration('journey-menu-ship')}
          </div>
          <p>Keep the ship running. Choose a stop. Push farther out.</p>
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

  function availableDestinations(state, location) {
    return JourneyData.getConnectedNodes(location.id).filter(node =>
      state.route.unlockedNodes.includes(node.id) &&
      node.implemented &&
      !state.route.visitedNodes.includes(node.id)
    );
  }

  function destinationState(state, location) {
    const available = availableDestinations(state, location);
    let selected = available.find(node => node.id === state.selectedDestinationId) || null;

    // A single route is not a decision. Queue it automatically so the player
    // can leave from the ship without opening navigation.
    if (available.length === 1 && !selected) {
      JourneyState.selectDestination(available[0].id);
      selected = available[0];
    }

    return {
      available,
      selected,
      needsPilotCall: available.length > 1 && !selected
    };
  }

  function renderCurrentLocation() {
    const state = JourneyState.getState();
    const node = state && currentNode(state);
    if (node && node.id === 'fuel-stop-1' && !state.route.completedNodes.includes(node.id)) {
      serviceFuelStop();
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
    const notices = JourneyState.getReturnSummary();
    if (shipNotice) notices.unshift(shipNotice);
    shipNotice = '';
    const canRepair = r.hull < r.maxHull && state.currency.salvage >= 5;
    const canRefuel = location.id === 'fuel-stop-1' && r.fuel < r.maxFuel;
    const canRest = r.pilot < 100;
    const route = destinationState(state, location);
    const destination = route.selected;
    const canDepart = destination && r.fuel >= destination.fuelCost;
    root.innerHTML = `
      <main class="journey-ship-screen" aria-labelledby="journey-ship-title">
        <header class="journey-topbar">
          <button class="journey-arcade-back" type="button" onclick="journeyMenu()">◀ MENU</button>
          <div>
            <span>CURRENT · ${location.name.toUpperCase()}</span>
            <strong id="journey-ship-title">THE WAYFARER</strong>
          </div>
          <span class="journey-save-status">SAVED</span>
        </header>
        <section class="journey-destination-section">
          <div class="journey-destination-copy">
            <span>NEXT DESTINATION</span>
            <strong>${destination ? destination.name : route.needsPilotCall ? "PILOT'S CALL" : 'NO ROUTE'}</strong>
            <small>${destination
              ? `${destination.fuelCost} FUEL · ${destination.distance} DISTANCE`
              : route.needsPilotCall ? 'CHOOSE YOUR COURSE' : 'NO CONNECTED STOPS'}</small>
          </div>
          ${route.available.length > 1 ? `
            <button class="journey-nav-button ${route.needsPilotCall ? 'is-required' : ''}" type="button" onclick="journeyRoute()" aria-label="Choose destination">
              <span aria-hidden="true">⌖</span><small>NAV</small>
            </button>` : ''}
          <button class="journey-depart-button" type="button" onclick="journeyDepart()" ${canDepart ? '' : 'disabled'}>
            DEPART <small>${destination ? destination.shortName : route.needsPilotCall ? 'CHOOSE ROUTE' : 'UNAVAILABLE'}</small>
          </button>
        </section>
        ${notices.length ? `<div class="journey-return-note">${notices.join(' ')}</div>` : ''}
        <section class="journey-ship-bay">
          <div class="journey-ship-visual" aria-label="Your patched-up ship">
            <div class="journey-orbit-line"></div>
            <div class="journey-large-ship">${shipIllustration('journey-home-ship')}</div>
            <span>PATCHED · READY</span>
          </div>
          <div class="journey-status-panel">
            <div class="journey-section-label">SHIP STATUS</div>
            ${resourceCard('HULL', r.hull, r.maxHull, 'is-hull')}
            ${resourceCard('FUEL', r.fuel, r.maxFuel, 'is-fuel')}
            ${resourceCard('POWER', r.power, r.maxPower, 'is-power')}
            ${resourceCard('PILOT', r.pilot, 100, 'is-pilot')}
          </div>
        </section>
        <nav class="journey-ship-actions" aria-label="Ship actions">
          <button type="button" onclick="journeyRepair()" ${canRepair ? '' : 'disabled'}>REPAIR <small>${r.hull >= r.maxHull ? 'FULL' : state.currency.salvage < 5 ? '5 SCRAP' : 'FIX 20'}</small></button>
          <button type="button" onclick="journeyRefuel()" ${canRefuel ? '' : 'disabled'}>REFUEL <small>${r.fuel >= r.maxFuel ? 'FULL' : location.id !== 'fuel-stop-1' ? 'AT STATION' : 'FILL'}</small></button>
          <button type="button" onclick="journeyRest()" ${canRest ? '' : 'disabled'}>REST <small>${canRest ? '+25' : 'READY'}</small></button>
        </nav>
      </main>`;
  }

  function nodeStatus(state, node) {
    if (state.currentNodeId === node.id) return 'YOU ARE HERE';
    if (state.route.completedNodes.includes(node.id)) return 'CLEARED';
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
    const destinations = availableDestinations(state, location);
    const selectedDestinationId = destinations.some(node => node.id === state.selectedDestinationId)
      ? state.selectedDestinationId
      : null;
    root.innerHTML = `
      <main class="journey-route-screen" aria-labelledby="journey-route-title">
        <header class="journey-route-header">
          <button class="journey-arcade-back" type="button" onclick="journeyShip()">◀ SHIP</button>
          <div>
            <span>CURRENT LOCATION · ${location.name.toUpperCase()}</span>
            <h1 id="journey-route-title">NAVIGATION</h1>
          </div>
          <strong>${Math.round(state.resources.fuel)} FUEL</strong>
        </header>
        <section class="journey-route-map" aria-label="Chapter One route">
          ${JourneyData.routeNodes.map((node, index) => {
            const status = nodeStatus(state, node);
            const connected = connectedIds.has(node.id);
            const unlocked = state.route.unlockedNodes.includes(node.id);
            const selectable = connected &&
              unlocked &&
              node.implemented &&
              !state.route.visitedNodes.includes(node.id);
            return `
              <article class="journey-route-node is-${node.type} ${selectable ? 'is-selectable' : ''} ${selectedDestinationId === node.id ? 'is-selected' : ''}" data-status="${status}">
                <div class="journey-route-index">${String(index + 1).padStart(2, '0')}</div>
                <div class="journey-route-node-copy">
                  <span>${status}</span>
                  <h2>${node.name}</h2>
                  <p>${node.description}</p>
                </div>
                <div class="journey-route-cost">
                  <strong>${node.id === 'home-orbit' ? '—' : node.fuelCost}</strong>
                  <span>${node.id === 'home-orbit' ? 'START' : 'FUEL'}</span>
                </div>
                ${selectable ? `<button type="button" onclick="journeyChooseDestination('${node.id}')">${selectedDestinationId === node.id ? 'SELECTED' : 'CHOOSE'} →</button>` : ''}
              </article>`;
          }).join('')}
        </section>
        <div class="journey-route-footer">
          <span>${destinations.length
            ? 'Choose an available stop. You will return to the ship to depart.'
            : 'No onward route is open yet.'}</span>
          <button class="journey-primary-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
        </div>
      </main>`;
  }

  function serviceFuelStop() {
    const state = JourneyState.getState();
    if (!state) return;
    const firstVisit = !state.route.completedNodes.includes('fuel-stop-1');
    const refuel = JourneyState.refuelToMax('lantern-station-service');
    if (firstVisit) JourneyState.completeNode('fuel-stop-1', ['scrap-belt']);
    shipNotice = `DOCKED AT LANTERN STATION · +${Math.round(refuel.gained)} FUEL${firstVisit ? ' · SCRAP BELT UNLOCKED' : ''}`;
    renderShip();
  }

  function renderEncounterBriefing(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    root.innerHTML = `
      <main class="journey-briefing-screen" aria-labelledby="journey-briefing-title">
        <section class="journey-briefing-art" aria-hidden="true">
          <div class="journey-briefing-ship">${shipIllustration('journey-encounter-ship')}</div>
          <i></i><i></i><i></i><i></i><i></i>
        </section>
        <section class="journey-briefing-copy">
          <div class="journey-kicker">ROUTE ENCOUNTER · ASTEROID SALVAGE</div>
          <h1 id="journey-briefing-title">${node.name}</h1>
          <p>Survive 30 seconds. Break rocks. Grab salvage.</p>
          <div class="journey-objective-list">
            <span><strong>SURVIVE</strong> 30 SEC</span>
            <span><strong>BONUS</strong> 5 SALVAGE</span>
            <span><strong>HULL</strong> ${Math.round(state.resources.hull)}</span>
          </div>
          <div class="journey-briefing-controls">
            <span>DRAG OR A/D · AUTO-FIRE</span>
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
            ? 'Route open. New stops added.'
            : 'Ship recovered. Repair and try again.'}</p>
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
          <p>Keep moving. Maintain the ship between encounters.</p>
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

  window.journeyChooseDestination = function (destinationId) {
    const state = JourneyState.getState();
    const location = state && currentNode(state);
    const destination = JourneyData.getNode(destinationId);
    if (!state || !location || !destination || !availableDestinations(state, location).some(node => node.id === destinationId)) return;
    playMenuSound();
    const selected = JourneyState.selectDestination(destinationId);
    if (!selected.ok) return;
    renderShip();
  };

  window.journeyDepart = function () {
    const state = JourneyState.getState();
    const location = state && currentNode(state);
    const destination = state && JourneyData.getNode(state.selectedDestinationId);
    if (!state || !location || !destination || !availableDestinations(state, location).some(node => node.id === destination.id)) return;
    playMenuSound();
    const result = JourneyState.travel({
      originId: location.id,
      destinationId: destination.id,
      fuelCost: destination.fuelCost,
      distance: destination.distance
    });
    if (!result.ok) {
      renderShip();
      return;
    }
    if (destination.id === 'fuel-stop-1') serviceFuelStop();
    else renderCurrentLocation();
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
