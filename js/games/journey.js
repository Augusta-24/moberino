/* Journey controller. Persistent route and combat modules plug into this shell
   without depending on Space Mobe's live runtime. */
(function () {
  'use strict';

  const hostId = 'journey-wrap';
  let active = false;
  let shipNotice = '';
  let maintenanceNotice = '';

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
    const connected = JourneyData.getConnectedNodes(location.id).filter(node =>
      state.route.unlockedNodes.includes(node.id) &&
      node.implemented
    );
    const onward = connected.filter(node => !state.route.visitedNodes.includes(node.id));

    // Existing saves may be parked at the starting orbit after backtracking.
    // Lantern is the only path from Home toward the frontier, so keep it usable
    // even after it has been visited. Completed frontier stops do not auto-loop.
    return onward.length || location.id !== 'home-orbit' ? onward : connected;
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

  function missionBrief(state, location, route, unreadIntel) {
    if (unreadIntel) {
      return {
        title: 'READ THE NEW INTEL',
        why: 'The signal array found two leads beyond the Scrap Belt.',
        action: 'Open the transmission, then choose which lead to follow.'
      };
    }
    if (route.needsPilotCall) {
      return {
        title: "MAKE THE PILOT'S CALL",
        why: 'Two viable leads are open. Your choice changes what happens next.',
        action: 'Open NAV and choose one destination.'
      };
    }
    if (route.selected) {
      return {
        title: `REACH ${route.selected.name.toUpperCase()}`,
        why: route.selected.description,
        action: `Depart when the ship is ready. Cost: ${route.selected.fuelCost} fuel.`
      };
    }
    if (location.id === 'repair-moon') {
      return {
        title: 'PREPARE FOR OGRE GATE',
        why: 'A route guardian blocks the road to the first settlement.',
        action: 'Repair damage and install a ship upgrade.'
      };
    }
    return {
      title: 'HOLD AT THE FRONTIER',
      why: 'No onward mission is open yet.',
      action: 'Maintain the ship while new intel develops.'
    };
  }

  function renderCurrentLocation() {
    const state = JourneyState.getState();
    const node = state && currentNode(state);
    if (node && node.id === 'fuel-stop-1' && !state.route.completedNodes.includes(node.id)) {
      serviceFuelStop();
      return;
    }
    if (node && (node.type === 'encounter' || node.type === 'rescue') && !state.route.completedNodes.includes(node.id)) {
      renderEncounterBriefing(node);
      return;
    }
    if (node && node.id === 'abandoned-cache' && !state.route.completedNodes.includes(node.id)) {
      renderCache(node);
      return;
    }
    if (
      node &&
      node.id === 'repair-moon' &&
      (!state.route.completedNodes.includes(node.id) || state.upgrades.blasterLevel < 1)
    ) {
      renderRepairMoon(node);
      return;
    }
    renderShip();
  }

  function renderShip() {
    const root = host();
    const repairCheck = JourneyState.completeReadyRepair();
    const state = JourneyState.getState();
    if (!root || !state || !active) {
      renderMenu();
      return;
    }
    const r = state.resources;
    const location = currentNode(state);
    const notices = JourneyState.getReturnSummary();
    if (repairCheck.ok) notices.unshift('Hull repairs are complete.');
    if (shipNotice) notices.unshift(shipNotice);
    shipNotice = '';
    const repairUnderway = !!state.timers.repairCompleteAt;
    const repairSeconds = repairUnderway
      ? Math.max(1, Math.ceil((state.timers.repairCompleteAt - Date.now()) / 1000))
      : 0;
    const canRepair = repairUnderway || (r.hull < r.maxHull && state.currency.salvage >= 5);
    const canRefuel = location.id === 'fuel-stop-1' && r.fuel < r.maxFuel;
    const canRest = r.pilot < 100;
    const route = destinationState(state, location);
    const destination = route.selected;
    const canDepart = destination && r.fuel >= destination.fuelCost;
    const unreadIntelId = JourneyState.getUnreadTransmissionIds()[0] || null;
    const unreadIntel = unreadIntelId && JourneyData.getTransmission(unreadIntelId);
    const mission = missionBrief(state, location, route, unreadIntel);
    const chapterProgress = state.route.completedNodes.filter(id =>
      ['fuel-stop-1', 'scrap-belt', 'distress-signal', 'abandoned-cache', 'repair-moon'].includes(id)
    ).length;
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
        <section class="journey-mission-brief">
          <div class="journey-mission-heading">
            <span>MISSION · CHAPTER ONE · ${chapterProgress} CLEARED</span>
            <strong>${mission.title}</strong>
          </div>
          <p>${mission.why}</p>
          <small>${mission.action}</small>
        </section>
        <section class="journey-inventory-strip" aria-label="Current supplies">
          <span>SCRAP<strong>${Math.round(state.currency.salvage)}</strong></span>
          <span>FUEL<strong>${Math.round(r.fuel)} / ${Math.round(r.maxFuel)}</strong></span>
          <span>HULL<strong>${Math.round(r.hull)} / ${Math.round(r.maxHull)}</strong></span>
        </section>
        ${unreadIntel ? `
          <section class="journey-intel-alert">
            <div><span>INCOMING INTEL</span><strong>${unreadIntel.title}</strong></div>
            <button type="button" onclick="journeyReadIntel('${unreadIntel.id}')">READ →</button>
          </section>` : ''}
        <section class="journey-destination-section">
          <div class="journey-destination-copy">
            <span>NEXT DESTINATION</span>
            <strong>${destination ? destination.name : route.needsPilotCall ? "PILOT'S CALL" : 'ROUTE CLOSED'}</strong>
            <small>${destination
              ? `${destination.fuelCost} FUEL · ${destination.distance} DISTANCE`
              : route.needsPilotCall ? 'CHOOSE YOUR COURSE' : 'NO ONWARD STOP IS OPEN'}</small>
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
        ${state.passengers.active.includes('pip') ? `
          <div class="journey-passenger-note"><strong>PASSENGER ABOARD · PIP</strong><span>“I thought nobody heard the beacon.”</span></div>` : ''}
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
          <button type="button" onclick="journeyRepair()" ${canRepair ? '' : 'disabled'}>REPAIR <small>${repairUnderway ? `${repairSeconds} SEC · CHECK` : r.hull >= r.maxHull ? 'FULL' : state.currency.salvage < 5 ? 'NEEDS 5 SCRAP' : '5 SCRAP · 45 SEC'}</small></button>
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
          ${JourneyData.routeNodes.filter(node =>
            node.id === state.currentNodeId ||
            state.route.visitedNodes.includes(node.id) ||
            state.route.unlockedNodes.includes(node.id)
          ).map(node => {
            const index = JourneyData.routeNodes.findIndex(routeNode => routeNode.id === node.id);
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

  function renderIntel(transmissionId) {
    const root = host();
    const state = JourneyState.getState();
    const transmission = JourneyData.getTransmission(transmissionId);
    if (!root || !state || !transmission || !state.log.transmissions.includes(transmissionId) || !active) return;
    JourneyState.markTransmissionRead(transmissionId);
    root.innerHTML = `
      <main class="journey-intel-screen" aria-labelledby="journey-intel-title">
        <section>
          <div class="journey-kicker">INCOMING INTEL · ${transmission.source}</div>
          <h1 id="journey-intel-title">${transmission.title}</h1>
          <p>${transmission.body}</p>
          <div class="journey-intel-call">${transmission.prompt}</div>
          <div class="journey-intel-leads">
            ${transmission.leads.map(lead => {
              const node = JourneyData.getNode(lead.nodeId);
              return `
                <article>
                  <span>${node ? `${node.fuelCost} FUEL · ${node.distance} DISTANCE` : 'NEW LEAD'}</span>
                  <strong>${lead.label}</strong>
                  <p>${lead.detail}</p>
                  <button type="button" onclick="journeyChooseIntelDestination('${lead.nodeId}')">CHOOSE →</button>
                </article>`;
            }).join('')}
          </div>
          <button class="journey-text-btn" type="button" onclick="journeyShip()">DECIDE LATER</button>
        </section>
      </main>`;
  }

  function renderCache(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    root.innerHTML = `
      <main class="journey-intel-screen journey-cache-screen" aria-labelledby="journey-cache-title">
        <section>
          <div class="journey-kicker">DISCOVERY · ${node.name.toUpperCase()}</div>
          <h1 id="journey-cache-title">COLD STORAGE</h1>
          <p>The cache is old but intact. Its beacon was meant for a ship that never returned.</p>
          <div class="journey-cache-reward">
            <span>RECOVERABLE</span>
            <strong>18 SALVAGE · 6 POWER</strong>
          </div>
          <button class="journey-primary-btn" type="button" onclick="journeyCollectCache()">RECOVER SUPPLIES</button>
          <button class="journey-text-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
        </section>
      </main>`;
  }

  function renderRepairMoon(node) {
    const root = host();
    JourneyState.completeReadyRepair();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    const repairUnderway = !!state.timers.repairCompleteAt;
    const repairSeconds = repairUnderway
      ? Math.max(1, Math.ceil((state.timers.repairCompleteAt - Date.now()) / 1000))
      : 0;
    const hullFull = state.resources.hull >= state.resources.maxHull;
    const canStartRepair = !repairUnderway && !hullFull && state.currency.salvage >= 5;
    const upgradeCost = state.upgrades.blasterLevel === 0 ? 0 : 15;
    const readyForGate = state.upgrades.blasterLevel >= 1;
    const notice = maintenanceNotice;
    maintenanceNotice = '';
    root.innerHTML = `
      <main class="journey-intel-screen journey-repair-screen" aria-labelledby="journey-repair-title">
        <section>
          <div class="journey-kicker">SAFE HARBOR · ${node.name.toUpperCase()}</div>
          <h1 id="journey-repair-title">DRY DOCK</h1>
          <p><strong>MISSION:</strong> Prepare the Wayfarer for the guardian at Ogre Gate. Repair damage and install one permanent upgrade.</p>
          <div class="journey-scrap-balance">AVAILABLE SCRAP <strong>${state.currency.salvage}</strong></div>
          ${notice ? `<div class="journey-maintenance-notice">${notice}</div>` : ''}
          <div class="journey-maintenance-grid">
            <article>
              <span>HULL · ${Math.round(state.resources.hull)} / ${Math.round(state.resources.maxHull)}</span>
              <strong>${repairUnderway ? 'REPAIR UNDERWAY' : hullFull ? 'HULL READY' : 'FULL REPAIR'}</strong>
              <p>${repairUnderway ? `${repairSeconds} seconds remaining. You may leave and return later.` : hullFull ? 'No repair needed.' : 'Restore the hull to full condition.'}</p>
              <button type="button" onclick="journeyStartTimedRepair()" ${canStartRepair || repairUnderway ? '' : 'disabled'}>
                ${repairUnderway ? 'CHECK REPAIRS' : hullFull ? 'HULL FULL' : state.currency.salvage < 5 ? 'NEEDS 5 SCRAP' : 'START · 5 SCRAP'}
              </button>
            </article>
            <article>
              <span>WORKSHOP · ${state.currency.salvage} SALVAGE</span>
              <strong>BLASTER TUNING ${state.upgrades.blasterLevel}</strong>
              <p>Shorter delay between automatic shots. Permanent upgrade.</p>
              <button type="button" onclick="journeyBuyBlasterUpgrade()" ${state.currency.salvage >= upgradeCost ? '' : 'disabled'}>
                ${readyForGate ? `UPGRADE AGAIN · ${upgradeCost} SCRAP` : 'INSTALL FIRST UPGRADE · FREE'}
              </button>
            </article>
          </div>
          <div class="journey-next-mission">
            <span>NEXT MISSION</span>
            <strong>OGRE GATE</strong>
            <p>A route guardian blocks the road to the first settlement. This encounter is the next build slice.</p>
          </div>
          <button class="journey-primary-btn" type="button" onclick="journeyFinishRepairMoon()" ${readyForGate ? '' : 'disabled'}>
            ${readyForGate ? 'SHIP READY · SAVE PROGRESS' : 'INSTALL 1 UPGRADE FIRST'}
          </button>
          <button class="journey-text-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
        </section>
      </main>`;
  }

  function renderEncounterBriefing(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    const rescue = node.type === 'rescue';
    root.innerHTML = `
      <main class="journey-briefing-screen" aria-labelledby="journey-briefing-title">
        <section class="journey-briefing-art" aria-hidden="true">
          <div class="journey-briefing-ship">${shipIllustration('journey-encounter-ship')}</div>
          <i></i><i></i><i></i><i></i><i></i>
        </section>
        <section class="journey-briefing-copy">
          <div class="journey-kicker">${rescue ? 'INCOMING INTEL · LIVE BEACON' : 'ROUTE ENCOUNTER · ASTEROID SALVAGE'}</div>
          <h1 id="journey-briefing-title">${node.name}</h1>
          <p>${rescue
            ? 'An escape pod is trapped in the debris. Clear an approach and reach the beacon.'
            : 'Survive 30 seconds. Break rocks. Grab salvage.'}</p>
          <div class="journey-objective-list">
            <span><strong>${rescue ? 'REACH' : 'SURVIVE'}</strong> ${rescue ? '24' : '30'} SEC</span>
            <span><strong>${rescue ? 'RESCUE' : 'BONUS'}</strong> ${rescue ? '1 PASSENGER' : '5 SALVAGE'}</span>
            <span><strong>HULL</strong> ${Math.round(state.resources.hull)}</span>
          </div>
          <div class="journey-briefing-controls">
            <span>DRAG OR A/D · AUTO-FIRE</span>
          </div>
          <div class="journey-briefing-actions">
            <button class="journey-primary-btn" type="button" onclick="journeyStartEncounter()">${rescue ? 'ANSWER THE BEACON' : 'ENTER SCRAP BELT'}</button>
            <button class="journey-text-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
          </div>
        </section>
      </main>`;
  }

  function renderCombat(node, attemptId) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const rescue = node.type === 'rescue';
    const seconds = rescue ? 24 : 30;
    root.innerHTML = `
      <main class="journey-combat-screen">
        <header class="journey-combat-hud">
          <div><span>HULL</span><strong id="journey-combat-hull">${Math.round(state.resources.hull)}</strong></div>
          <div class="journey-combat-title"><span>${node.name.toUpperCase()}</span><strong>${rescue ? 'RESCUE RUN' : 'ASTEROID SALVAGE'}</strong></div>
          <div><span>TIME</span><strong id="journey-combat-time">${seconds}</strong></div>
          <div><span>${rescue ? 'CLEARANCE' : 'SALVAGE'}</span><strong id="journey-combat-salvage">0 / ${rescue ? '3' : '5'}</strong></div>
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
      encounterType: rescue ? 'rescue' : 'asteroids',
      difficulty: rescue ? 1.2 : 1,
      startingHull: state.resources.hull,
      rescuedPassengerId: rescue ? node.passengerId : null,
      shipStats: {
        blasterLevel: state.upgrades.blasterLevel,
        hullLevel: state.upgrades.hullLevel,
        salvageMagnetLevel: state.upgrades.salvageMagnetLevel
      },
      objectives: {
        surviveSeconds: seconds,
        salvageTarget: rescue ? 3 : 5
      },
      onComplete(result) {
        handleEncounterComplete(node, result);
      }
    });
  }

  function handleEncounterComplete(node, result) {
    if (!active) return;
    const rescue = node.type === 'rescue';
    const applied = JourneyState.applyEncounterResult(result, rescue ? {
      successSalvage: 18,
      completeNodeId: node.id,
      unlockNodeIds: ['repair-moon'],
      passengerId: node.passengerId
    } : {
      successSalvage: 20,
      completeNodeId: 'scrap-belt',
      unlockNodeIds: ['distress-signal', 'abandoned-cache'],
      transmissionId: 'scrap-belt-signals'
    });
    if (!applied.ok) {
      renderShip();
      return;
    }
    renderEncounterResults(node, result, applied);
  }

  function renderEncounterResults(node, result, applied) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const success = result.outcome === 'success';
    const rescue = node.type === 'rescue';
    root.innerHTML = `
      <main class="journey-results-screen ${success ? 'is-success' : 'is-failure'}" aria-labelledby="journey-results-title">
        <section>
          <div class="journey-kicker">${success ? 'ROUTE CLEARED' : 'EMERGENCY RETREAT'}</div>
          <h1 id="journey-results-title">${success ? (rescue ? 'PIP IS ABOARD' : 'BELT CROSSED') : 'SHIP RECOVERED'}</h1>
          <p>${success
            ? (rescue ? 'The escape pod is secure. Pip is recovering aboard the Wayfarer.' : 'The signal array found two possible routes beyond the debris.')
            : 'Ship recovered. Repair and try again.'}</p>
          <div class="journey-results-grid">
            <span>HULL REMAINING<strong>${Math.round(state.resources.hull)}</strong></span>
            <span>DAMAGE TAKEN<strong>${Math.round(result.damageTaken)}</strong></span>
            <span>SALVAGE AWARDED<strong>+${Math.round(applied.salvageAwarded)}</strong></span>
            <span>FUEL RECOVERED<strong>+${Math.round(applied.fuelAwarded)}</strong></span>
            <span>ASTEROIDS BROKEN<strong>${Math.round(result.stats.asteroidsDestroyed)}</strong></span>
            <span>${rescue ? 'PASSENGER' : 'OPTIONAL TARGET'}<strong>${rescue && success ? 'PIP' : result.objectiveComplete ? 'COMPLETE' : 'MISSED'}</strong></span>
          </div>
          <div class="journey-results-actions">
            <button class="journey-primary-btn" type="button" onclick="journeyReturnFromEncounter()">RETURN TO SHIP</button>
            ${success && !rescue ? '<button class="journey-secondary-btn" type="button" onclick="journeyReadIntel(\'scrap-belt-signals\')">READ INCOMING INTEL</button>' : ''}
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

  window.journeyReadIntel = function (transmissionId) {
    playMenuSound();
    renderIntel(transmissionId);
  };

  window.journeyChooseIntelDestination = function (destinationId) {
    const state = JourneyState.getState();
    const location = state && currentNode(state);
    if (!state || !location || !availableDestinations(state, location).some(node => node.id === destinationId)) return;
    playMenuSound();
    const selected = JourneyState.selectDestination(destinationId);
    if (selected.ok) renderShip();
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
    if (!state || !node || !['encounter', 'rescue'].includes(node.type) || !node.encounterId) return;
    playMenuSound();
    const attempt = JourneyState.beginEncounter(node.encounterId);
    if (!attempt.ok) return;
    renderCombat(node, attempt.attemptId);
  };

  window.journeyCollectCache = function () {
    playMenuSound();
    const result = JourneyState.resolvePeacefulNode({
      nodeId: 'abandoned-cache',
      salvage: 18,
      power: 6,
      unlockNodeIds: ['repair-moon'],
      discoveryId: 'cache-log-1'
    });
    if (result.ok) {
      shipNotice = 'CACHE RECOVERED · +18 SALVAGE · +6 POWER · REPAIR MOON FOUND';
    }
    renderShip();
  };

  window.journeyStartTimedRepair = function () {
    playMenuSound();
    const check = JourneyState.completeReadyRepair();
    if (!check.ok && check.code !== 'repair-underway') {
      JourneyState.startRepair(45000, 5);
    }
    const state = JourneyState.getState();
    const node = state && currentNode(state);
    if (node && node.id === 'repair-moon' && !state.route.completedNodes.includes(node.id)) renderRepairMoon(node);
    else renderShip();
  };

  window.journeyBuyBlasterUpgrade = function () {
    playMenuSound();
    const stateBefore = JourneyState.getState();
    const upgradeCost = stateBefore && stateBefore.upgrades.blasterLevel === 0 ? 0 : 15;
    const result = JourneyState.purchaseUpgrade('blasterLevel', upgradeCost);
    maintenanceNotice = result.ok
      ? `BLASTER TUNED · LEVEL ${result.level} · ${upgradeCost ? `${upgradeCost} SCRAP SPENT` : 'FIRST TUNE COMPLIMENTARY'}`
      : 'NOT ENOUGH SCRAP FOR THIS UPGRADE';
    const state = JourneyState.getState();
    renderRepairMoon(currentNode(state));
  };

  window.journeyFinishRepairMoon = function () {
    playMenuSound();
    const state = JourneyState.getState();
    if (!state || state.upgrades.blasterLevel < 1) {
      maintenanceNotice = 'INSTALL ONE SHIP UPGRADE BEFORE DEPARTURE';
      renderRepairMoon(currentNode(state));
      return;
    }
    JourneyState.completeNode('repair-moon', ['ogre-gate']);
    shipNotice = 'SHIP PREPARED · NEXT MISSION: OGRE GATE';
    renderShip();
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
    const check = JourneyState.completeReadyRepair();
    if (!check.ok && check.code !== 'repair-underway') JourneyState.startRepair(45000, 5);
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
