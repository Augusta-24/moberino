/* Journey controller. Persistent route and combat modules plug into this shell
   without depending on Space Mobe's live runtime. */
(function () {
  'use strict';

  const hostId = 'journey-wrap';
  // Seven Star Crystals is the whole-game goal. Chapter One recovers only the
  // first; see the guide's "Crystal handling" note. This is the single source of
  // truth for the "/ 7" the cockpit, log, and recovery beat display.
  const CRYSTAL_GOAL = 7;
  let active = false;
  let pendingCacheLaunch = null;
  let pendingCacheSuccess = null;
  let pendingRepairLaunch = null;
  let shipNotice = '';
  let maintenanceNotice = '';
  let storyTimers = [];
  let introAdvance = null;
  let pendingEncounterPresentation = null;
  let pendingScrapBeltLaunch = null;
  let pendingScrapBeltSuccess = null;
  let pendingScrapBeltRetry = null;
  let pendingDistressLaunch = null;
  let pendingDistressSuccess = null;
  let scrapBeltTutorialStep = 0;

  const MAP_POINTS = {
    'home-orbit': [150, 650],
    'fuel-stop-1': [150, 565],
    'scrap-belt': [150, 480],
    'distress-signal': [72, 370],
    'abandoned-cache': [228, 370],
    'repair-moon': [150, 260],
    'ogre-gate': [150, 150],
    'first-settlement': [150, 55]
  };

  const MAP_LABELS = {
    'distress-signal': [-18, 5, 'is-left'],
    'abandoned-cache': [18, 5, 'is-right']
  };

  function host() {
    return document.getElementById(hostId);
  }

  function selectedHero() {
    if (typeof GAME_CHARS === 'undefined' || !GAME_CHARS.length) {
      return { name: 'PILOT', color: '#69d7ff', emoji: '✦' };
    }
    const index = typeof getGlobalChar === 'function' ? getGlobalChar() : 0;
    return GAME_CHARS[index] || GAME_CHARS[0];
  }

  function heroPortrait(expression) {
    const hero = selectedHero();
    const face = typeof charFace === 'function'
      ? charFace(hero, expression || 'normal')
      : `<span>${hero.emoji || '✦'}</span>`;
    return `<div class="journey-story-hero" style="--hero-color:${hero.color}">${face}</div>`;
  }

  function crystalCluster(count) {
    const total = Math.max(1, count || CRYSTAL_GOAL);
    return `<div class="journey-crystal-cluster ${total === 1 ? 'is-single' : 'is-arc'}">${Array.from({ length: total }, (_, index) =>
      `<i style="--crystal-index:${total === 1 ? 3 : index}"></i>`
    ).join('')}</div>`;
  }

  function shipStatusAlert(level, title, detail) {
    return `
      <div class="journey-status-alert is-${level || 'warning'}" role="status">
        <i aria-hidden="true">!</i>
        <div><span>SHIP STATUS</span><strong>${title}</strong><small>${detail}</small></div>
      </div>`;
  }

  function currentShipWarning(state) {
    const resources = state.resources;
    if (state.timers.repairCompleteAt) {
      return { title: 'REPAIRS ACTIVE', detail: 'DEPARTURE LOCKED UNTIL COMPLETE' };
    }
    if (resources.hull < 25) {
      return { title: 'CRITICAL HULL', detail: `${Math.round(resources.hull)} / ${Math.round(resources.maxHull)} · REPAIR REQUIRED` };
    }
    if (resources.fuel <= resources.maxFuel * .35) {
      return { title: 'LOW FUEL', detail: `${Math.round(resources.fuel)} / ${Math.round(resources.maxFuel)} · REFUEL AT LANTERN` };
    }
    if (resources.pilot < 20) {
      return { title: 'PILOT EXHAUSTED', detail: `${Math.round(resources.pilot)} / 100 · REST REQUIRED` };
    }
    return null;
  }

  function clearStoryTimers() {
    storyTimers.forEach(clearTimeout);
    storyTimers = [];
    introAdvance = null;
  }

  function renderJourneyIntro() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    clearStoryTimers();
    const hero = selectedHero();
    const beats = [
      {
        eyebrow: 'A QUIET MORNING · HOME ORBIT',
        title: `${hero.name} FOUND AN EMPTY VAULT`,
        visual: `${heroPortrait('sad')}${crystalCluster(CRYSTAL_GOAL)}`,
        line: 'The seven Star Crystals were gone.'
      },
      {
        eyebrow: 'THE THIEVES LEFT ONE TRAIL',
        title: 'A SIGNAL LEADING OUTWARD',
        visual: `<div class="journey-story-signal"><span></span><span></span><span></span></div>`,
        line: 'Bosses, raiders, and old ruins stand between us and the truth.'
      },
      {
        eyebrow: 'THE WAYFARER · READY TO LAUNCH',
        title: `${hero.name} TAKES THE HUNT`,
        visual: `<div class="journey-story-ship">${shipIllustration('journey-intro-ship')}</div>`,
        line: 'Follow the route. Recover the crystals. Bring our friends home.'
      },
      {
        eyebrow: 'FIRST LEAD',
        title: 'FIRST STOP: LANTERN STATION',
        visual: shipStatusAlert('warning', 'LOW FUEL', '12 / 40 · REFUEL REQUIRED'),
        line: 'Fill the Wayfarer’s tanks. Then follow the crystal signal.'
      }
    ];
    root.innerHTML = `
      <main class="journey-story-screen">
        <div class="journey-starfield" aria-hidden="true"></div>
        <div id="journey-story-stage" class="journey-story-stage" aria-live="polite"></div>
        <button id="journey-story-continue" class="journey-story-continue" type="button" onclick="journeyContinueIntro()" disabled>CONTINUE →</button>
      </main>`;
    const stage = document.getElementById('journey-story-stage');
    const continueButton = document.getElementById('journey-story-continue');
    let index = 0;
    function showBeat() {
      if (!stage || !document.body.contains(stage) || index >= beats.length) {
        window.journeyFinishIntro();
        return;
      }
      const beat = beats[index];
      const lastBeat = index === beats.length - 1;
      introAdvance = null;
      if (continueButton) continueButton.disabled = true;
      stage.classList.remove('is-visible');
      const swapTimer = setTimeout(() => {
        if (!document.body.contains(stage)) return;
        stage.innerHTML = `
          <div class="journey-story-eyebrow">${beat.eyebrow}</div>
          <div class="journey-story-title">${beat.title}</div>
          <div class="journey-story-visual">${beat.visual}</div>
          <div class="journey-story-line">${beat.line}</div>`;
        requestAnimationFrame(() => {
          stage.classList.add('is-visible');
          if (continueButton) {
            continueButton.disabled = false;
            continueButton.textContent = lastBeat ? 'ENTER COCKPIT →' : 'CONTINUE →';
          }
          introAdvance = () => {
            index += 1;
            if (index >= beats.length) window.journeyFinishIntro();
            else showBeat();
          };
        });
      }, 180);
      storyTimers.push(swapTimer);
    }
    showBeat();
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
          <p>Hunt the stolen Star Crystals. Follow the route. Bring your friends home.</p>
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

  function pilotCallStatus(state) {
    const pilotCall = state && state.story && state.story.pilotCall;
    if (!pilotCall || !pilotCall.chosenNodeId) return null;
    if (pilotCall.chosenNodeId === 'distress-signal') {
      return {
        chosenNodeId: 'distress-signal',
        chosenTitle: 'BEACON ANSWERED',
        chosenDetail: 'Pip comes aboard at the Distress Signal.',
        closedNodeId: 'abandoned-cache',
        closedStatus: 'MOVED TO OGRE GATE',
        mapNote: 'CRYSTAL AT GATE',
        consequenceTitle: 'CACHE INTERCEPTED',
        consequenceDetail: 'The thieves moved the cache crystal behind Ogre Gate.',
        repairLine: 'Pip is aboard. The stolen crystal is now behind Ogre Gate.'
      };
    }
    return {
      chosenNodeId: 'abandoned-cache',
      chosenTitle: 'CACHE CHOSEN',
      chosenDetail: 'The Wayfarer secures the first Star Crystal.',
      closedNodeId: 'distress-signal',
      closedStatus: 'INTERCEPTED AT GATE',
      mapNote: 'PIP AT GATE',
      consequenceTitle: 'PIP INTERCEPTED',
      consequenceDetail: 'The distress pod was taken to Ogre Gate. The rescue continues there.',
      repairLine: 'We have the crystal. Pip’s pod was intercepted at Ogre Gate.'
    };
  }

  function availableDestinations(state, location) {
    const connected = JourneyData.getConnectedNodes(location.id).filter(node =>
      state.route.unlockedNodes.includes(node.id) &&
      !JourneyState.isNodeClosed(node.id) &&
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

  function cockpitMap(state, location, route) {
    const branch = pilotCallStatus(state);
    const revealedIds = new Set(JourneyData.routeNodes.filter(node =>
      node.id === state.currentNodeId ||
      state.route.visitedNodes.includes(node.id) ||
      state.route.unlockedNodes.includes(node.id)
    ).map(node => node.id));
    const paths = [];
    JourneyData.routeNodes.forEach(node => {
      node.connections.forEach(connectionId => {
        if (node.id > connectionId) return;
        const from = MAP_POINTS[node.id];
        const to = MAP_POINTS[connectionId];
        const known = revealedIds.has(node.id) && revealedIds.has(connectionId);
        const closed = state.route.closedNodes.includes(node.id) ||
          state.route.closedNodes.includes(connectionId);
        if (from && to) paths.push(`<path class="${closed ? 'is-closed' : known ? 'is-known' : 'is-unknown'}" d="M${from[0]} ${from[1]} L${to[0]} ${to[1]}"></path>`);
      });
    });
    const nodes = JourneyData.routeNodes.map(node => {
      const point = MAP_POINTS[node.id];
      if (!point) return '';
      const revealed = revealedIds.has(node.id);
      const selectable = route.available.some(candidate => candidate.id === node.id);
      const closed = state.route.closedNodes.includes(node.id);
      const classes = [
        !revealed ? 'is-unknown' : '',
        closed ? 'is-closed' : '',
        node.id === location.id ? 'is-current' : '',
        state.route.completedNodes.includes(node.id) ? 'is-cleared' : '',
        route.selected && route.selected.id === node.id ? 'is-selected' : '',
        selectable ? 'is-selectable' : ''
      ].filter(Boolean).join(' ');
      const label = MAP_LABELS[node.id] || [20, 5, 'is-right'];
      return `
        <g class="journey-map-node ${classes}" transform="translate(${point[0]} ${point[1]})"
          ${selectable ? `onclick="journeyChooseDestination('${node.id}')" role="button" tabindex="0"` : ''}>
          <circle r="${node.id === location.id ? 13 : 10}"></circle>
          <text class="${label[2]}" x="${label[0]}" y="${label[1]}">${revealed ? node.shortName : '?'}</text>
          ${closed && branch ? `
            <text class="journey-map-node-note" x="0" y="26">${branch.mapNote}</text>
            <text class="journey-map-node-x" x="0" y="1">×</text>` : ''}
        </g>`;
    }).join('');
    return `
      <svg class="journey-cockpit-map" viewBox="0 0 300 705" role="img" aria-label="Vertical Journey route map from Home Orbit toward the first settlement${branch ? `. ${branch.consequenceDetail}` : ''}">
        <g class="journey-map-paths">${paths.join('')}</g>
        ${nodes}
      </svg>`;
  }

  function targetSummary(destination) {
    if (!destination) return '';
    const summaries = {
      'fuel-stop-1': 'Fuel stop. Opens the route to Scrap Belt.',
      'scrap-belt': 'Clear the debris and follow the crystal signal.',
      'distress-signal': 'Answer the beacon. Someone may be trapped.',
      'abandoned-cache': 'Search the thieves’ cache for supplies and clues.',
      'repair-moon': 'Repair and upgrade before Ogre Gate.',
      'ogre-gate': 'Break through the guardian’s blockade.'
    };
    return summaries[destination.id] || destination.description;
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
    const route = destinationState(state, location);
    const destination = route.selected;
    const departure = destination ? JourneyState.getDepartureReadiness(destination.fuelCost) : null;
    const canDepart = !!(departure && departure.ok);
    const unreadIntelId = JourneyState.getUnreadTransmissionIds()[0] || null;
    const unreadIntel = unreadIntelId && JourneyData.getTransmission(unreadIntelId);
    const pilotCallIntel = route.needsPilotCall
      ? state.log.transmissions
        .map(id => JourneyData.getTransmission(id))
        .find(transmission => transmission && transmission.leads.some(lead =>
          route.available.some(node => node.id === lead.nodeId)
        )) || null
      : null;
    const systemWarning = currentShipWarning(state);
    const hero = selectedHero();
    const notice = shipNotice || (state.passengers.active.includes('pip')
        ? 'PIP IS ABOARD · THE CRYSTAL TRAIL CONTINUES'
        : `CRYSTAL TRAIL · CURRENT POSITION: ${location.name.toUpperCase()}`);
    shipNotice = '';
    const shipCondition = state.timers.repairCompleteAt
      ? 'REPAIRING'
      : r.hull < 25 ? 'CRITICAL' : r.hull < 45 ? 'DAMAGED' : r.hull < r.maxHull ? 'WORN' : 'READY';
    root.innerHTML = `
      <main class="journey-cockpit" aria-labelledby="journey-cockpit-title">
        <header class="journey-cockpit-header">
          <button type="button" onclick="journeyMenu()">◀ MENU</button>
          <div><span>CURRENT · ${location.name.toUpperCase()}</span><strong id="journey-cockpit-title">THE WAYFARER</strong></div>
          <div class="journey-pilot-chip" style="--hero-color:${hero.color}">
            <span>${typeof charFace === 'function' ? charFace(hero, 'normal') : hero.emoji}</span>
            <small>${hero.name}</small>
          </div>
          <button class="journey-debug-gear" type="button" onclick="journeyOpenDebug()" aria-label="Open Journey developer checkpoints" title="Developer checkpoints">⚙</button>
        </header>
        <button class="journey-message-bar ${!unreadIntel && systemWarning ? 'is-status-warning' : ''}" type="button" onclick="${unreadIntel ? `journeyReadIntel('${unreadIntel.id}')` : systemWarning ? 'journeyOpenEngineering()' : 'journeyOpenLog()'}">
          <span>${unreadIntel ? 'INCOMING INTEL' : systemWarning ? '⚠ SHIP STATUS' : 'SHIP MESSAGE'}</span>
          <strong>${unreadIntel ? unreadIntel.title : systemWarning ? `${systemWarning.title} · ${systemWarning.detail}` : notice}</strong>
          <i>${unreadIntel ? 'OPEN →' : systemWarning ? 'WARNING' : 'LOG →'}</i>
        </button>
        <section class="journey-map-panel">
          <div class="journey-map-title"><span>CHAPTER ONE · CRYSTAL TRAIL</span><strong>${state.currency.crystals} / ${CRYSTAL_GOAL} CRYSTALS</strong></div>
          ${cockpitMap(state, location, route)}
        </section>
        <section class="journey-cockpit-ship ${state.passengers.active.includes('pip') ? 'has-pip' : ''}">
          <div class="journey-cockpit-ship-visual">${shipIllustration('journey-cockpit-ship-svg')}</div>
          <div class="journey-cockpit-condition"><span>WAYFARER</span><strong>${shipCondition}</strong></div>
          ${state.passengers.active.includes('pip') ? `
            <div class="journey-cockpit-companion" aria-label="Pip is aboard the Wayfarer">
              <div class="journey-pip-face" aria-hidden="true"><i></i><i></i><b></b></div>
            </div>` : ''}
          <div class="journey-quick-status">
            <span>HULL<strong>${Math.round(r.hull)}</strong></span>
            <span>FUEL<strong>${Math.round(r.fuel)}</strong></span>
            <span>SCRAP<strong>${Math.round(state.currency.salvage)}</strong></span>
          </div>
          <div class="journey-cockpit-actions">
            <button type="button" onclick="journeyOpenEngineering()">OPEN SHIP</button>
            <button type="button" onclick="journeyOpenLog()">LOG</button>
          </div>
        </section>
        <section class="journey-target-panel ${destination ? (canDepart ? 'is-ready' : 'is-blocked') : ''}">
          <div>
            <span>${unreadIntel ? 'NEW LEAD' : route.needsPilotCall ? "PILOT'S CALL" : destination ? 'NEXT DESTINATION' : 'CURRENT FRONTIER'}</span>
            <strong>${unreadIntel ? 'READ THE TRANSMISSION' : route.needsPilotCall ? 'DESTINATION NOT SET' : destination ? destination.name : 'AWAITING A NEW LEAD'}</strong>
            <p>${unreadIntel
              ? 'The signal array found something beyond the Belt.'
              : route.needsPilotCall ? "Choose which signal to follow in the Pilot's Call."
              : destination ? targetSummary(destination)
              : 'The known trail ends here for now.'}</p>
          </div>
          ${unreadIntel
            ? `<button class="is-intel" type="button" onclick="journeyReadIntel('${unreadIntel.id}')">OPEN INTEL <small>CHOOSE THE NEXT LEAD</small></button>`
            : route.needsPilotCall && pilotCallIntel
              ? `<button class="is-pilot-call" type="button" onclick="journeyReadIntel('${pilotCallIntel.id}')">LAUNCH <small>CHOOSE A ROUTE FIRST</small></button>`
            : destination
              ? `<button type="button" onclick="journeyDepart()" ${canDepart ? '' : 'disabled'}>DEPART <small>${canDepart ? `${destination.fuelCost} FUEL · READY` : departure.blockers.map(blocker => blocker.message).join(' · ')}</small></button>`
              : ''}
        </section>
      </main>`;
  }

  function renderDebugMenu() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const location = JourneyData.getNode(state.currentNodeId);
    const checkpoints = [
      ['opening', 'OPENING STORY', 'Replay the crystal theft and first launch.'],
      ['lantern-station', 'LANTERN STATION', 'Launch from Home with the starting low tank.'],
      ['scrap-belt', 'SCRAP BELT', 'Depart Lantern with fuel and enter the first mission.'],
      ['pilot-call', "PILOT'S CALL", 'Open the unread two-signal transmission.'],
      ['distress-signal', 'DISTRESS SIGNAL', 'Depart for the rescue and signal-search mission.'],
      ['abandoned-cache', 'ABANDONED CACHE', 'Depart for the supply cache and first crystal.'],
      ['repair-moon', 'REPAIR MOON · PIP PATH', 'Arrive with Pip aboard and the crystal moved to Ogre Gate.'],
      ['repair-moon-cache', 'REPAIR MOON · CACHE PATH', 'Arrive with the crystal and Pip intercepted at Ogre Gate.']
    ];
    root.innerHTML = `
      <main class="journey-debug-screen" aria-labelledby="journey-debug-title">
        <header>
          <button type="button" onclick="journeyShip()">◀ COCKPIT</button>
          <div><span>DEVELOPMENT ONLY</span><strong id="journey-debug-title">CHECKPOINTS</strong></div>
          <b>⚙ DEV</b>
        </header>
        <section class="journey-debug-intro">
          <strong>RETEST A BEAT</strong>
          <p>Each checkpoint replaces the Journey save with the route, intel, crew, and resources required immediately before that beat.</p>
        </section>
        <section class="journey-debug-grid">
          ${checkpoints.map(([id, title, detail]) => `
            <button type="button" onclick="journeyDebugCheckpoint('${id}')">
              <span>LOAD CHECKPOINT</span>
              <strong>${title}</strong>
              <small>${detail}</small>
            </button>`).join('')}
        </section>
        <section class="journey-debug-utility">
          <div><strong>CURRENT SAVE</strong><span>${location.name.toUpperCase()} · ${Math.round(state.resources.hull)} HULL · ${Math.round(state.resources.fuel)} FUEL</span></div>
          <button type="button" onclick="journeyDebugRestoreShip()">RESTORE SHIP</button>
        </section>
      </main>`;
  }

  function renderEngineering() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const r = state.resources;
    const location = currentNode(state);
    const canRepair = r.hull < r.maxHull && state.currency.salvage >= 5;
    const canRefuel = location.id === 'fuel-stop-1' && r.fuel < r.maxFuel;
    const canRest = r.pilot < 100;
    root.innerHTML = `
      <main class="journey-engineering">
        <header><button type="button" onclick="journeyShip()">◀ COCKPIT</button><div><span>THE WAYFARER</span><strong>SHIP</strong></div><b>${state.currency.salvage} SCRAP</b></header>
        <section class="journey-engineering-body">
          <div class="journey-engineering-ship">${shipIllustration('journey-engineering-ship-svg')}</div>
          <div class="journey-engineering-status">
            ${resourceCard('HULL', r.hull, r.maxHull, 'is-hull')}
            ${resourceCard('FUEL', r.fuel, r.maxFuel, 'is-fuel')}
            ${resourceCard('POWER', r.power, r.maxPower, 'is-power')}
            ${resourceCard('PILOT', r.pilot, 100, 'is-pilot')}
          </div>
        </section>
        <nav class="journey-ship-actions" aria-label="Ship actions">
          <button type="button" onclick="journeyEngineeringRepair()" ${canRepair ? '' : 'disabled'}>REPAIR <small>${r.hull >= r.maxHull ? 'HULL FULL' : state.currency.salvage < 5 ? 'NEEDS 5 SCRAP' : '5 SCRAP · INSTANT'}</small></button>
          <button type="button" onclick="journeyEngineeringRefuel()" ${canRefuel ? '' : 'disabled'}>REFUEL <small>${canRefuel ? 'STATION SERVICE' : 'NOT AVAILABLE'}</small></button>
          <button type="button" onclick="journeyEngineeringRest()" ${canRest ? '' : 'disabled'}>REST <small>${canRest ? '+25 PILOT' : 'PILOT READY'}</small></button>
        </nav>
      </main>`;
  }

  function nodeStatus(state, node) {
    const branch = pilotCallStatus(state);
    if (state.currentNodeId === node.id) return 'YOU ARE HERE';
    if (branch && branch.closedNodeId === node.id) return branch.closedStatus;
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
    const branch = pilotCallStatus(state);
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
            const closed = JourneyState.isNodeClosed(node.id);
            const selectable = connected &&
              unlocked &&
              !closed &&
              node.implemented &&
              !state.route.visitedNodes.includes(node.id);
            return `
              <article class="journey-route-node is-${node.type} ${closed ? 'is-closed' : ''} ${selectable ? 'is-selectable' : ''} ${selectedDestinationId === node.id ? 'is-selected' : ''}" data-status="${status}">
                <div class="journey-route-index">${String(index + 1).padStart(2, '0')}</div>
                <div class="journey-route-node-copy">
                  <span>${status}</span>
                  <h2>${node.name}</h2>
                  <p>${closed && branch ? branch.consequenceDetail : node.description}</p>
                </div>
                <div class="journey-route-cost">
                  <strong>${closed || node.id === 'home-orbit' ? '—' : node.fuelCost}</strong>
                  <span>${closed ? 'CLOSED' : node.id === 'home-orbit' ? 'START' : 'FUEL'}</span>
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

  function arrivalLine(node) {
    const state = JourneyState.getState();
    const branch = pilotCallStatus(state);
    if (node.id === 'fuel-stop-1') return 'Tanks are full. The crystal signal continues through the Scrap Belt.';
    if (node.id === 'scrap-belt') return 'The trail enters that debris field. Clear a path and keep the signal in sight.';
    if (node.id === 'distress-signal') return 'That beacon is alive. Someone is trapped ahead.';
    if (node.id === 'abandoned-cache') return 'The cache ping matches the thieves’ route. Let’s see what they left behind.';
    if (node.id === 'repair-moon' && branch) return branch.repairLine;
    if (node.id === 'repair-moon') return 'Ogre Gate is ahead. The Wayfarer needs to be ready.';
    return `We made it to ${node.name}. The crystal trail continues from here.`;
  }

  function arrivalDebrisField() {
    const debris = [
      [5, 12, 38, -18, 0], [17, 18, 24, 22, .4], [84, 11, 31, 14, .8], [94, 21, 20, -28, .2],
      [8, 31, 18, 34, .9], [23, 28, 42, -9, .1], [76, 30, 36, 26, .6], [91, 38, 27, -16, 1.1],
      [3, 49, 29, 18, .5], [16, 56, 21, -32, 1.3], [31, 43, 30, 11, .7], [69, 45, 22, -23, .3],
      [82, 55, 39, 8, 1], [97, 51, 17, 31, .2], [39, 26, 15, -12, 1.4], [62, 24, 18, 20, .8],
      [36, 58, 20, 29, .4], [64, 60, 26, -18, 1.2], [48, 36, 13, 17, .6], [54, 52, 16, -27, .9]
    ];
    return `<div class="journey-arrival-debris" aria-hidden="true">${debris.map(([x, y, size, rotation, delay]) =>
      `<i style="--x:${x}%;--y:${y}%;--size:${size}px;--rotation:${rotation}deg;--delay:${delay}s"></i>`
    ).join('')}</div>`;
  }

  function arrivalDistressBeacon() {
    return `
      <div class="journey-distant-distress" aria-label="A distress beacon pulses in the distance">
        <svg viewBox="0 0 120 90" aria-hidden="true">
          <g class="journey-distress-ship">
            <path class="journey-distress-wing is-left" d="M46 51 13 66 38 72 53 61Z"></path>
            <path class="journey-distress-wing is-right" d="M76 49 108 57 91 68 70 61Z"></path>
            <path class="journey-distress-hull" d="M59 12C48 25 42 44 44 67L60 81 76 65C77 43 70 24 59 12Z"></path>
            <path class="journey-distress-cockpit" d="M59 24C53 31 51 39 52 47H67C67 38 64 30 59 24Z"></path>
            <path class="journey-distress-crack" d="M48 54 57 50 54 59 63 62 58 70"></path>
            <path class="journey-distress-antenna" d="M72 31 87 18"></path>
            <circle class="journey-distress-beacon" cx="89" cy="16" r="5"></circle>
          </g>
        </svg>
        <b>SOS</b>
      </div>`;
  }

  function renderArrivalScene(node) {
    const root = host();
    if (!root || !node || !active) return;
    const hero = selectedHero();
    root.innerHTML = `
      <main class="journey-arrival-scene ${node.id === 'scrap-belt' ? 'is-scrap-belt' : ''} ${node.id === 'distress-signal' ? 'is-distress-signal' : ''}">
        <div class="journey-starfield" aria-hidden="true"></div>
        ${node.id === 'scrap-belt' ? arrivalDebrisField() : ''}
        ${node.id === 'distress-signal' ? arrivalDistressBeacon() : ''}
        <div class="journey-arrival-location"><span>ARRIVING</span><strong>${node.name}</strong></div>
        <div class="journey-arrival-flight">${shipIllustration('journey-arrival-ship-svg')}</div>
        <section class="journey-arrival-dialogue">
          <div class="journey-arrival-speaker" style="--hero-color:${hero.color}">${typeof charFace === 'function' ? charFace(hero, 'normal') : hero.emoji}</div>
          <div><span>${hero.name}</span><p>“${arrivalLine(node)}”</p></div>
        </section>
        <button type="button" onclick="journeyContinueArrival()">CONTINUE →</button>
      </main>`;
  }

  function renderLanternRefuel(startFuel, gained, firstVisit) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    clearStoryTimers();
    const hero = selectedHero();
    const maxFuel = state.resources.maxFuel;
    const startPercent = Math.max(0, Math.min(100, (startFuel / maxFuel) * 100));
    root.innerHTML = `
      <main class="journey-refuel-scene">
        <div class="journey-starfield" aria-hidden="true"></div>
        <div class="journey-arrival-location">
          <span>DOCKED</span>
          <strong>LANTERN STATION</strong>
        </div>
        <section class="journey-refuel-rig" aria-label="The Wayfarer refueling">
          <div class="journey-refuel-meter">
            <div><i id="journey-refuel-fill" style="width:${startPercent}%"></i></div>
            <span>FUEL</span>
            <strong><b id="journey-refuel-value">${Math.round(startFuel)}</b> / ${Math.round(maxFuel)}</strong>
          </div>
          <div class="journey-refuel-ship">${shipIllustration('journey-refuel-ship-svg')}</div>
          <div class="journey-fuel-hose" aria-hidden="true"><i></i><b></b><b></b><b></b></div>
          <div id="journey-refuel-status" class="journey-refuel-status">MAGNETIC COUPLER INBOUND</div>
        </section>
        <section class="journey-arrival-dialogue">
          <div class="journey-arrival-speaker" style="--hero-color:${hero.color}">${typeof charFace === 'function' ? charFace(hero, 'normal') : hero.emoji}</div>
          <div>
            <span>${hero.name}</span>
            <p>“Lantern has us. Fill the tanks—then we follow that crystal signal.”</p>
          </div>
        </section>
        <button id="journey-refuel-continue" type="button" onclick="journeyFinishFuelService()" disabled>
          FUELING… <small>+${Math.round(gained)} FUEL</small>
        </button>
      </main>`;

    const steps = 16;
    for (let step = 1; step <= steps; step += 1) {
      const timer = setTimeout(() => {
        const fill = document.getElementById('journey-refuel-fill');
        const value = document.getElementById('journey-refuel-value');
        const status = document.getElementById('journey-refuel-status');
        const progress = step / steps;
        const displayedFuel = Math.round(startFuel + gained * progress);
        if (fill) fill.style.width = `${startPercent + (100 - startPercent) * progress}%`;
        if (value) value.textContent = displayedFuel;
        if (status && step === 2) status.textContent = 'COUPLER LOCKED · FUEL FLOWING';
      }, 2700 + step * 220);
      storyTimers.push(timer);
    }
    const finishTimer = setTimeout(() => {
      const status = document.getElementById('journey-refuel-status');
      const button = document.getElementById('journey-refuel-continue');
      if (status) status.textContent = firstVisit ? 'TANK FULL · SCRAP BELT ROUTE OPEN' : 'TANK FULL · READY TO DEPART';
      if (button) {
        button.disabled = false;
        button.innerHTML = `CONTINUE → <small>${Math.round(maxFuel)} / ${Math.round(maxFuel)} FUEL</small>`;
      }
    }, 6600);
    storyTimers.push(finishTimer);
  }

  function serviceFuelStop() {
    const state = JourneyState.getState();
    if (!state) return;
    const firstVisit = !state.route.completedNodes.includes('fuel-stop-1');
    const startFuel = state.resources.fuel;
    const refuel = JourneyState.refuelToMax('lantern-station-service');
    if (firstVisit) JourneyState.completeNode('fuel-stop-1', ['scrap-belt']);
    shipNotice = `DOCKED AT LANTERN STATION · +${Math.round(refuel.gained)} FUEL${firstVisit ? ' · SCRAP BELT UNLOCKED' : ''}`;
    renderLanternRefuel(startFuel, refuel.gained, firstVisit);
  }

  function renderIntelCinematic(transmission) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !transmission || !active) return;
    const hero = selectedHero();
    root.innerHTML = `
      <main class="journey-intel-cinematic">
        <div class="journey-starfield" aria-hidden="true"></div>
        <div class="journey-intel-cinematic-heading">
          <span>WAYFARER SIGNAL ARRAY</span>
          <strong>TWO SIGNALS FOUND</strong>
        </div>
        <div class="journey-signal-reveal" aria-label="A distress beacon and cache signal branch beyond the Scrap Belt">
          <div class="journey-signal-origin"><i></i><span>WAYFARER</span></div>
          <div class="journey-signal-branch is-distress"><i></i><strong>DISTRESS</strong><small>LIVE BEACON</small></div>
          <div class="journey-signal-branch is-cache"><i></i><strong>CACHE</strong><small>OLD ROUTE PING</small></div>
        </div>
        <section class="journey-arrival-dialogue">
          <div class="journey-arrival-speaker" style="--hero-color:${hero.color}">${typeof charFace === 'function' ? charFace(hero, 'normal') : hero.emoji}</div>
          <div><span>${hero.name}</span><p>“Two signals. One could be a survivor. The other may lead to the crystals.”</p></div>
        </section>
        <button type="button" onclick="journeyContinueIntel('${transmission.id}')">CONTINUE →</button>
      </main>`;
  }

  function renderIntelChoice(transmission) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !transmission || !active) return;
    const branch = pilotCallStatus(state);
    if (branch) {
      root.innerHTML = `
        <main class="journey-choice-screen" aria-labelledby="journey-choice-title">
          <section>
            <div class="journey-kicker">PILOT'S CALL · COMMITTED</div>
            <h1 id="journey-choice-title">${branch.chosenTitle}</h1>
            <p>${branch.chosenDetail}</p>
            <div class="journey-choice-consequence">
              <span>${branch.consequenceTitle}</span>
              <strong>THE OTHER THREAD MOVED FORWARD</strong>
              <p>${branch.consequenceDetail}</p>
            </div>
            <button class="journey-primary-btn" type="button" onclick="journeyShip()">RETURN TO COCKPIT →</button>
          </section>
        </main>`;
      return;
    }
    root.innerHTML = `
      <main class="journey-choice-screen" aria-labelledby="journey-choice-title">
        <section>
          <div class="journey-kicker">TWO ROUTES OPEN</div>
          <h1 id="journey-choice-title">PILOT'S CALL</h1>
          <p>What matters first?</p>
          <div class="journey-choice-grid">
            ${transmission.leads.map((lead, index) => {
              const node = JourneyData.getNode(lead.nodeId);
              return `
                <button class="journey-choice-card ${index === 0 ? 'is-rescue' : 'is-cache'}" type="button" onclick="journeyChooseIntelDestination('${lead.nodeId}')">
                  <span>${node ? `${node.fuelCost} FUEL` : 'NEW LEAD'}</span>
                  <strong>${lead.label}</strong>
                  <small>${index === 0 ? 'Someone is alive.' : 'Safer. Supplies and a clue.'}</small>
                  <b>CHOOSE →</b>
                </button>`;
            }).join('')}
          </div>
          <button class="journey-text-btn" type="button" onclick="journeyShip()">BACK TO COCKPIT</button>
        </section>
      </main>`;
  }

  function renderIntel(transmissionId) {
    const state = JourneyState.getState();
    const transmission = JourneyData.getTransmission(transmissionId);
    if (!state || !transmission || !state.log.transmissions.includes(transmissionId) || !active) return;
    const unread = !state.log.readTransmissions.includes(transmissionId);
    if (unread) renderIntelCinematic(transmission);
    else renderIntelChoice(transmission);
  }

  function renderLog() {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const transmissions = state.log.transmissions.map(id => JourneyData.getTransmission(id)).filter(Boolean);
    const branch = pilotCallStatus(state);
    root.innerHTML = `
      <main class="journey-log-screen">
        <header><button type="button" onclick="journeyShip()">◀ COCKPIT</button><div><span>WAYFARER ARCHIVE</span><strong>JOURNEY LOG</strong></div><b>${state.currency.crystals} / ${CRYSTAL_GOAL} ✦</b></header>
        <section>
          <div class="journey-log-summary">
            <span>DISTANCE<strong>${Math.round(state.totalDistance)}</strong></span>
            <span>CRYSTALS<strong>${state.currency.crystals} / ${CRYSTAL_GOAL}</strong></span>
            <span>FRIENDS<strong>${state.passengers.rescued.length}</strong></span>
          </div>
          ${branch ? `
            <div class="journey-log-branch">
              <span>PILOT'S CALL · COMMITTED</span>
              <strong>${branch.chosenTitle}</strong>
              <p>${branch.consequenceDetail}</p>
            </div>` : ''}
          <h2>MESSAGES</h2>
          <div class="journey-log-list">
            ${transmissions.length ? transmissions.map(transmission => `
              <button type="button" onclick="journeyReadIntel('${transmission.id}')">
                <span>${transmission.source}</span><strong>${transmission.title}</strong><i>OPEN →</i>
              </button>`).join('') : '<p>No messages yet.</p>'}
          </div>
          <h2>DISCOVERIES</h2>
          <p>${state.log.discoveries.length
            ? state.log.discoveries.map(id => id.replace(/^crystal:/, 'CRYSTAL · ').replaceAll('-', ' ').toUpperCase()).join(' · ')
            : 'The hunt has only just begun.'}</p>
        </section>
      </main>`;
  }

  function renderCache(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    pendingCacheLaunch = { node };
    pendingCacheSuccess = null;
    root.innerHTML = `
      <main class="journey-cache-mission-screen">
        <header>
          <span>ABANDONED CACHE · COLD STORAGE</span>
          <strong id="journey-cache-objective">SEAL THE VAULT</strong>
        </header>
        <div id="journey-cache-stage" class="journey-cache-stage is-paused" aria-label="Route power through the frozen conduit grid to open the vault">
          <svg class="journey-cache-svg" viewBox="0 92 560 728" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="jcMetalTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#28323f"/><stop offset="18%" stop-color="#1a222d"/><stop offset="100%" stop-color="#0c1119"/>
              </linearGradient>
              <radialGradient id="jcCore" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#e6a24d"/><stop offset="45%" stop-color="#a5641f"/><stop offset="100%" stop-color="#4a2a08" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="jcCrys" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#dff4ff"/><stop offset="45%" stop-color="#7fbfe6"/><stop offset="100%" stop-color="#4b53c9"/>
              </radialGradient>
              <radialGradient id="jcHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#8ea6d8" stop-opacity=".55"/><stop offset="100%" stop-color="#8ea6d8" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="jcIce" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#cfe6f2" stop-opacity=".9"/><stop offset="100%" stop-color="#7fa2b8" stop-opacity=".2"/>
              </linearGradient>
              <filter id="jcGlowBig" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="18"/></filter>
              <filter id="jcSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter>
              <filter id="jcFrost" x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="0.14 0.2" numOctaves="3" seed="4" result="n"/>
                <feDisplacementMap in="SourceGraphic" in2="n" scale="10"/></filter>
              <clipPath id="jcPort"><circle cx="280" cy="150" r="46"/></clipPath>
            </defs>

            <!-- vault bulkhead + crystal (goal) -->
            <path d="M-20,215 Q280,120 580,215 L580,90 L-20,90 Z" fill="url(#jcMetalTop)"/>
            <path d="M-20,215 Q280,120 580,215" fill="none" stroke="#05090f" stroke-width="6"/>
            <rect x="264" y="150" width="32" height="86" fill="#0a1019" stroke="#1d2a38" stroke-width="2"/>
            <circle cx="280" cy="150" r="70" fill="url(#jcHalo)" filter="url(#jcGlowBig)" opacity=".5"/>
            <circle class="jc-vault-ring" cx="280" cy="150" r="52" fill="#060c15" stroke="#26384a" stroke-width="6"/>
            <g clip-path="url(#jcPort)">
              <circle cx="280" cy="150" r="46" fill="#0a121d"/>
              <path d="M280,120 L296,142 L290,182 L270,182 L264,142 Z" fill="url(#jcCrys)" filter="url(#jcSoft)" opacity=".85"/>
              <path d="M234,150 h92 M280,104 v92" stroke="#cfe6f2" stroke-width="10" opacity=".22" filter="url(#jcFrost)"/>
            </g>
            <text x="280" y="116" fill="#5f7fa0" font-size="12" letter-spacing="4" text-anchor="middle">VAULT LOCK</text>

            <!-- three lock-bolts (sinks): light + retract as current reaches them -->
            <g id="journey-cache-bolt-0" class="journey-cache-bolt" transform="translate(181,224)">
              <line class="jc-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
              <rect class="jc-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
              <rect class="jc-bolt-pin" x="-6" y="-2" width="12" height="30"/>
              <circle class="jc-bolt-lamp" cx="0" cy="-4" r="5"/>
            </g>
            <g id="journey-cache-bolt-1" class="journey-cache-bolt" transform="translate(313,224)">
              <line class="jc-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
              <rect class="jc-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
              <rect class="jc-bolt-pin" x="-6" y="-2" width="12" height="30"/>
              <circle class="jc-bolt-lamp" cx="0" cy="-4" r="5"/>
            </g>
            <g id="journey-cache-bolt-2" class="journey-cache-bolt" transform="translate(445,224)">
              <line class="jc-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
              <rect class="jc-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
              <rect class="jc-bolt-pin" x="-6" y="-2" width="12" height="30"/>
              <circle class="jc-bolt-lamp" cx="0" cy="-4" r="5"/>
            </g>

            <!-- recessed housing -->
            <rect x="68" y="244" width="424" height="410" rx="10" fill="#05090f" stroke="#1a2534" stroke-width="3"/>
            <rect x="76" y="252" width="408" height="394" rx="7" fill="none" stroke="#020509" stroke-width="8" opacity=".7"/>

            <!-- reactor core (source) -->
            <ellipse cx="118" cy="742" rx="110" ry="72" fill="url(#jcCore)" filter="url(#jcGlowBig)" opacity=".55"/>
            <circle cx="118" cy="742" r="46" fill="#0a0e14" stroke="#3a3020" stroke-width="5"/>
            <g stroke="#d9902f" stroke-width="5" stroke-linecap="round" opacity=".9">
              <line x1="98" y1="724" x2="138" y2="724"/><line x1="92" y1="742" x2="144" y2="742"/><line x1="98" y1="760" x2="138" y2="760"/>
            </g>
            <rect x="106" y="636" width="24" height="70" rx="6" fill="#151f2b" stroke="#0a121c" stroke-width="2"/>
            <rect class="jc-feed" x="113" y="636" width="6" height="70"/>
            <text x="118" y="800" fill="#c88f4a" font-size="12" letter-spacing="3" text-anchor="middle">REACTOR CORE</text>

            <!-- pressure gauge -->
            <g transform="translate(438,752)">
              <circle r="46" fill="#070c14" stroke="#233242" stroke-width="4"/>
              <g stroke="#43586e" stroke-width="2">
                <line x1="0" y1="-38" x2="0" y2="-31"/><line x1="27" y1="-27" x2="22" y2="-22"/><line x1="38" y1="0" x2="31" y2="0"/>
                <line x1="-27" y1="-27" x2="-22" y2="-22"/><line x1="-38" y1="0" x2="-31" y2="0"/>
              </g>
              <path d="M-38,0 A38 38 0 0 1 38 0" fill="none" stroke="#2c4a63" stroke-width="4" opacity=".7"/>
              <g id="journey-cache-needle" transform="rotate(-120)"><line x1="0" y1="0" x2="0" y2="-33" stroke="#6fd0ff" stroke-width="3" stroke-linecap="round"/></g>
              <circle r="4" fill="#6fd0ff"/>
              <text x="0" y="40" fill="#4a6a86" font-size="12" letter-spacing="2" text-anchor="middle">SEALED</text>
            </g>

            <!-- conduit tiles injected here -->
            <g id="journey-cache-grid"></g>
          </svg>
          <div class="journey-cache-scan" aria-hidden="true"></div>
          <div class="journey-cache-vig" aria-hidden="true"></div>

          <button id="journey-cache-start" class="journey-cache-start" type="button" onclick="journeyBeginCache()">
            <strong>SEAL THE VAULT</strong>
            <small>A dead supply cache. Rotate every conduit until nothing leaks, and its lattice wakes.</small>
            <b>BOARD THE CACHE →</b>
          </button>
        </div>
      </main>`;
    JourneyCache.start({
      stageId: 'journey-cache-stage',
      encounterId: 'cache-recovery-1',
      crystalId: 'azure-cache',
      startingHull: state.resources.hull,
      initiallyPaused: true,
      onSuccessReady(result) {
        pendingCacheLaunch = null;
        pendingCacheSuccess = { node, result };
        // The vault is open and the crystal secured — apply the outcome now
        // (both writes are idempotent), then reveal it.
        JourneyState.resolvePeacefulNode({
          nodeId: 'abandoned-cache', salvage: 18, power: 6,
          unlockNodeIds: ['repair-moon'], discoveryId: 'cache-log-1'
        });
        JourneyState.awardCrystal('azure-cache');
        shipNotice = 'STAR CRYSTAL ABOARD · PIP INTERCEPTED AT OGRE GATE';
        renderCrystalReveal();
      }
    });
  }

  function renderCrystalReveal() {
    const root = host();
    const hero = selectedHero();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    root.innerHTML = `
      <main class="journey-reveal-screen">
        <div class="journey-starfield" aria-hidden="true"></div>
        <div class="journey-reveal-crystal" aria-hidden="true">
          <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="jcRevA" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#f2fbff"/><stop offset="55%" stop-color="#9bd4ff"/><stop offset="100%" stop-color="#5a63e0"/>
              </linearGradient>
              <linearGradient id="jcRevB" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#bfe6ff"/><stop offset="100%" stop-color="#4048b8"/>
              </linearGradient>
              <radialGradient id="jcRevHalo" cx="50%" cy="46%" r="55%">
                <stop offset="0" stop-color="#a9c6ff" stop-opacity=".9"/><stop offset="100%" stop-color="#a9c6ff" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="100" cy="120" r="98" fill="url(#jcRevHalo)"/>
            <polygon points="100,14 148,86 100,110 52,86" fill="url(#jcRevA)"/>
            <polygon points="52,86 100,110 78,246 60,150" fill="url(#jcRevB)"/>
            <polygon points="148,86 100,110 122,246 140,150" fill="url(#jcRevA)"/>
            <polygon points="100,110 122,246 78,246" fill="url(#jcRevB)" opacity=".82"/>
            <polyline points="100,14 100,110 100,246" fill="none" stroke="#f2fbff" stroke-width="1.4" opacity=".5"/>
            <polyline points="52,86 100,110 148,86" fill="none" stroke="#f2fbff" stroke-width="1.4" opacity=".5"/>
          </svg>
        </div>
        <div class="journey-reveal-caption">
          <span>CACHE RECOVERED</span>
          <h1>FIRST STAR CRYSTAL</h1>
        </div>
        <section class="journey-arrival-dialogue">
          <div class="journey-arrival-speaker" style="--hero-color:${hero.color}">${typeof charFace === 'function' ? charFace(hero, 'normal') : hero.emoji}</div>
          <div><span>${hero.name}</span><p>“One down. Six still out there.”</p></div>
        </section>
        <button class="journey-primary-btn journey-reveal-continue" type="button" onclick="journeyFinishCrystalBeat()">CONTINUE → · ${state.currency.crystals} / ${CRYSTAL_GOAL} CRYSTALS</button>
      </main>`;
  }

  function renderRepairMoon(node) {
    const state = JourneyState.getState();
    if (!state || !node || !active) return;
    const hullFull = state.resources.hull >= state.resources.maxHull;
    if (!hullFull) { renderRepairPuzzle(node); return; }
    renderRepairWorkshop(node);
  }

  function renderRepairPuzzle(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    pendingRepairLaunch = { node };
    root.innerHTML = `
      <main class="journey-repair-mission-screen">
        <header>
          <span>REPAIR MOON · DRY DOCK</span>
          <strong id="journey-repair-objective">PATCH THE HULL</strong>
        </header>
        <div id="journey-repair-stage" class="journey-repair-stage is-paused is-dark">
          <svg class="journey-repair-svg" viewBox="0 0 560 800" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="jrHull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#3a4656"/><stop offset="45%" stop-color="#2a3442"/><stop offset="100%" stop-color="#161d28"/>
              </linearGradient>
              <pattern id="jrStars" width="120" height="120" patternUnits="userSpaceOnUse">
                <circle cx="14" cy="20" r="1" fill="#dfefff" opacity=".5"/>
                <circle cx="70" cy="60" r="1.3" fill="#fff" opacity=".7"/>
                <circle cx="100" cy="15" r=".8" fill="#bcd" opacity=".4"/>
                <circle cx="40" cy="95" r="1" fill="#cef" opacity=".5"/>
              </pattern>
            </defs>
            <rect x="0" y="0" width="560" height="92" fill="#050a13" opacity=".94"/>
            <line x1="0" y1="92" x2="560" y2="92" stroke="#1e2d3d"/>
            <text x="24" y="36" fill="#5f9fc0" font-size="14" letter-spacing="3">WAYFARER · STARBOARD SECTION</text>
            <text x="24" y="72" fill="#e8d79a" font-size="26" letter-spacing="1.5" font-family="Arial Narrow,Arial,sans-serif" font-weight="700">HULL BREACH DETECTED</text>

            <rect x="30" y="108" width="500" height="300" rx="10" fill="#070c15" stroke="#1a2534" stroke-width="3"/>
            <rect x="56" y="130" width="448" height="256" rx="6" fill="url(#jrHull)" stroke="#0b1119" stroke-width="3"/>
            <!-- A handful of large, unevenly-sized hull plates (not a tiled
                 pattern) read as real structure at a glance without competing
                 with the puzzle's own regular cell grid drawn on top. -->
            <g class="jr-plates" fill="none" stroke="#0c1522" stroke-width="1.5" opacity=".4">
              <rect x="60" y="134" width="182" height="104" rx="4"/>
              <rect x="250" y="134" width="250" height="132" rx="4"/>
              <rect x="60" y="242" width="146" height="140" rx="4"/>
              <rect x="212" y="270" width="150" height="112" rx="4"/>
              <rect x="368" y="270" width="132" height="112" rx="4"/>
            </g>
            <g class="jr-rivets" fill="#0b1119" opacity=".5">
              <circle cx="68" cy="142" r="2"/><circle cx="234" cy="230" r="2"/>
              <circle cx="258" cy="142" r="2"/><circle cx="492" cy="258" r="2"/>
              <circle cx="68" cy="374" r="2"/><circle cx="198" cy="250" r="2"/>
              <circle cx="220" cy="374" r="2"/><circle cx="354" cy="278" r="2"/>
              <circle cx="376" cy="278" r="2"/><circle cx="492" cy="374" r="2"/>
            </g>
            <g id="journey-repair-region"></g>

            <rect x="30" y="428" width="500" height="352" rx="10" fill="#05090f" stroke="#1a2534" stroke-width="3"/>
            <text x="44" y="452" fill="#3f5f80" font-size="11" letter-spacing="3">SALVAGED SCRAP · DRAG TO SEAT · TAP TO ROTATE</text>
            <g id="journey-repair-tray"></g>
          </svg>
          <div class="journey-repair-scan" aria-hidden="true"></div>
          <div class="journey-repair-vig" aria-hidden="true"></div>

          <button id="journey-repair-start" class="journey-repair-start" type="button" onclick="journeyBeginRepairPuzzle()">
            <strong>PATCH THE HULL</strong>
            <small>Drag salvaged plates into the breach and rotate them to fit. Every plate seated, no gaps, no overlaps.</small>
            <b>BOARD THE DRY DOCK →</b>
          </button>
        </div>
      </main>`;
    JourneyRepair.start({
      stageId: 'journey-repair-stage',
      regionGroupId: 'journey-repair-region',
      trayGroupId: 'journey-repair-tray',
      cellSize: 30,
      regionOrigin: { x: 76, y: 148 },
      trayOrigin: { x: 40, y: 478 },
      trayCols: 4,
      traySpacing: 125,
      regionBackgroundFill: 'url(#jrStars)',
      maxHull: state.resources.maxHull,
      initiallyPaused: true,
      onSuccessReady(result) {
        pendingRepairLaunch = null;
        JourneyState.repairHull(result.hullRemaining, 0);
        shipNotice = 'HULL PATCHED · NO SCRAP SPENT';
        renderRepairMoon(node);
      }
    });
  }

  function renderRepairWorkshop(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !active) return;
    const upgradeCost = state.upgrades.blasterLevel === 0 ? 0 : 15;
    const readyForGate = state.upgrades.blasterLevel >= 1;
    const branch = pilotCallStatus(state);
    const notice = maintenanceNotice;
    maintenanceNotice = '';
    root.innerHTML = `
      <main class="journey-intel-screen journey-repair-screen" aria-labelledby="journey-repair-title">
        <section>
          <div class="journey-kicker">HULL PATCHED · ${Math.round(state.resources.hull)} / ${Math.round(state.resources.maxHull)}</div>
          <h1 id="journey-repair-title">DRY DOCK</h1>
          <p>Every plate seated and welded. Install one permanent upgrade before departing for Ogre Gate.</p>
          ${branch ? `<p class="journey-repair-consequence"><strong>${branch.consequenceTitle}</strong> — ${branch.consequenceDetail}</p>` : ''}
          ${notice ? `<p class="journey-repair-warning">${notice}</p>` : ''}
          <div class="journey-maintenance-grid">
            <article>
              <span>WORKSHOP · ${state.currency.salvage} SALVAGE AVAILABLE</span>
              <strong>BLASTER TUNING ${state.upgrades.blasterLevel}</strong>
              <p>Shorter delay between automatic shots. Permanent upgrade.</p>
              <button type="button" onclick="journeyBuyBlasterUpgrade()" ${state.currency.salvage >= upgradeCost ? '' : 'disabled'}>
                ${readyForGate ? `UPGRADE AGAIN · ${upgradeCost} SCRAP` : 'INSTALL FIRST UPGRADE · FREE'}
              </button>
            </article>
          </div>
          <p class="journey-repair-next"><span>NEXT · OGRE GATE</span> A route guardian blocks the road to the first settlement.</p>
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
    const scrapTraversal = node.id === 'scrap-belt';
    root.innerHTML = `
      <main class="journey-briefing-screen" aria-labelledby="journey-briefing-title">
        <section class="journey-briefing-art" aria-hidden="true">
          <div class="journey-briefing-ship">${shipIllustration('journey-encounter-ship')}</div>
          <i></i><i></i><i></i><i></i><i></i>
        </section>
        <section class="journey-briefing-copy">
          <h1 id="journey-briefing-title">${node.name}</h1>
          <p>${rescue
            ? 'Pip’s escape pod is tumbling and drifting out of control. Time two grappling shots, stabilize it, then connect the docking collar.'
            : 'Weave through the debris, tap the playfield to scan, and stay inside the signal ring. Tractor floating salvage if you can.'}</p>
          <div class="journey-objective-list">
            <span><strong>${rescue ? 'STABILIZE' : 'ROUTE'}</strong> ${rescue ? '2 GRAPPLE HITS' : 'CROSS THE BELT'}</span>
            <span><strong>${rescue ? 'DOCK' : 'SCAN'}</strong> ${rescue ? 'PIP’S POD' : 'LOCK THE CRYSTAL TRAIL'}</span>
            ${scrapTraversal ? '<span><strong>OPTIONAL</strong> TRACTOR SALVAGE</span>' : ''}
            <span><strong>HULL</strong> ${Math.round(state.resources.hull)}</span>
          </div>
          <div class="journey-briefing-controls">
            <span>${rescue ? 'TAP EACH GUN WHEN ITS PORT CROSSES THE SIGHTLINE' : 'DRAG OR WASD · TAP THE PLAYFIELD TO SCAN · TRACTOR'}</span>
          </div>
          <div class="journey-briefing-actions">
            <button class="journey-primary-btn" type="button" onclick="journeyStartEncounter()">${rescue ? 'ANSWER THE BEACON' : 'ENTER SCRAP BELT'}</button>
            <button class="journey-text-btn" type="button" onclick="journeyShip()">RETURN TO SHIP</button>
          </div>
        </section>
      </main>`;
  }

  function renderScrapBelt(node) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    pendingScrapBeltLaunch = { node };
    pendingScrapBeltSuccess = null;
    pendingScrapBeltRetry = null;
    scrapBeltTutorialStep = 0;
    root.innerHTML = `
      <main class="journey-combat-screen journey-scrap-screen is-tutorial tutorial-scan">
        <header class="journey-combat-hud journey-scrap-hud">
          <div class="journey-combat-hull-readout">
            <span>HULL</span><strong id="journey-scrap-hull">${Math.round(state.resources.hull)}</strong>
            <div><i id="journey-scrap-hull-fill" style="width:100%"></i></div>
          </div>
          <div class="journey-scrap-objective">
            <span>OBJECTIVE</span>
            <strong id="journey-scrap-status">TAP TO SCAN THE AREA</strong>
          </div>
        </header>
        <div class="journey-combat-frame journey-scrap-frame">
          <canvas id="journey-scrap-canvas" aria-label="Navigate the Scrap Belt and scan for the crystal trail"></canvas>
          <div id="journey-scrap-damage-alert" class="journey-combat-damage-alert" aria-live="assertive"></div>
          <button class="journey-combat-retreat" type="button" onclick="journeyRetreatEncounter()">RETREAT</button>
          <div class="journey-mission-controls" aria-label="Mission controls">
            <button type="button" onclick="journeyMissionTractor()">TRACTOR</button>
          </div>
          <button id="journey-scrap-start-overlay" class="journey-mission-start-overlay is-scan" type="button" onclick="journeyAdvanceScrapBeltTutorial()" aria-labelledby="journey-scrap-start-title"></button>
        </div>
      </main>`;
    startScrapBeltRuntime(node, null, true);
    renderScrapBeltTutorialStep();
  }

  function renderDistressRescue(node, attemptId) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !node || !attemptId || !active) return;
    pendingDistressLaunch = { node, attemptId };
    pendingDistressSuccess = null;
    root.innerHTML = `
      <main class="journey-rescue-screen">
        <header>
          <span>RESCUE OPERATION</span>
          <strong id="journey-rescue-objective">STABILIZE THE POD</strong>
        </header>
        <section id="journey-rescue-stage" class="journey-rescue-stage is-paused" aria-label="Stabilize Pip's tumbling escape pod">
          <div class="journey-rescue-stars" aria-hidden="true"></div>
          <svg class="journey-rescue-lines" aria-hidden="true">
            <line id="journey-rescue-line-blue"></line>
            <line id="journey-rescue-line-gold"></line>
            <line id="journey-rescue-line-dock"></line>
          </svg>
          <div class="journey-rescue-ship" aria-label="The Wayfarer holding position">
            ${shipIllustration('journey-rescue-ship-svg')}
            <button id="journey-rescue-tether-blue" class="journey-rescue-source is-blue" type="button" aria-label="Fire blue grappling tether"></button>
            <button id="journey-rescue-tether-gold" class="journey-rescue-source is-gold" type="button" aria-label="Fire gold grappling tether"></button>
            <button id="journey-rescue-dock-source" class="journey-rescue-dock-source" type="button" aria-label="Tap rapidly to extend the docking collar"></button>
          </div>
          <div id="journey-rescue-pod" class="journey-rescue-pod" aria-label="Pip's tumbling escape pod">
            <div class="journey-rescue-pod-body">
              <div id="journey-rescue-hatch" class="journey-rescue-hatch">
                <div class="journey-pip-face" aria-label="Pip is visible through the pod window"><i></i><i></i><b></b></div>
              </div>
              <i id="journey-rescue-port-blue" class="journey-rescue-port is-blue"></i>
              <i id="journey-rescue-port-gold" class="journey-rescue-port is-gold"></i>
              <span>SOS</span>
            </div>
          </div>
          <div class="journey-rescue-callout is-tethers">TAP EACH GRAPPLE GUN AS ITS PORT CROSSES THE SIGHTLINE</div>
          <div class="journey-rescue-callout is-dock">TAP RAPIDLY · KEEP THE COLLAR FROM RETRACTING</div>
          <div class="journey-rescue-dock-meter" aria-label="Docking collar extension">
            <span>COLLAR EXTENSION</span>
            <div><i id="journey-rescue-dock-fill"></i></div>
          </div>
          <button id="journey-rescue-start" class="journey-rescue-start" type="button" onclick="journeyBeginDistressRescue()">
            <span>PIP'S POD IS TUMBLING</span>
            <strong>TIME TWO GRAPPLE SHOTS</strong>
            <small>Hit each matching port as it crosses the gun’s sightline. The pod is drifting nearer and farther.</small>
            <b>START RESCUE →</b>
          </button>
        </section>
      </main>`;
    JourneyDistressRescue.start({
      stageId: 'journey-rescue-stage',
      attemptId,
      encounterId: node.encounterId,
      passengerId: node.passengerId,
      startingHull: state.resources.hull,
      initiallyPaused: true,
      onSuccessReady(result) {
        pendingDistressLaunch = null;
        pendingDistressSuccess = { node, result };
        renderDistressRescueSuccess(result);
      }
    });
  }

  function renderDistressRescueSuccess(result) {
    const stage = document.getElementById('journey-rescue-stage');
    if (!stage || !result || !active) return;
    const overlay = document.createElement('section');
    overlay.className = 'journey-rescue-success';
    overlay.setAttribute('aria-labelledby', 'journey-rescue-success-title');
    overlay.innerHTML = `
      <div class="journey-pip-portrait" aria-hidden="true">
        <div class="journey-pip-face"><i></i><i></i><b></b></div>
      </div>
      <span>RESCUE COMPLETE</span>
      <h1 id="journey-rescue-success-title">PIP IS SAFE</h1>
      <p>“I thought nobody heard the beacon.”</p>
      <button type="button" onclick="journeyConfirmDistressRescue()">BRING PIP ABOARD →</button>`;
    stage.appendChild(overlay);
  }

  function startScrapBeltRuntime(node, attemptId, initiallyPaused) {
    const state = JourneyState.getState();
    if (!state || !node || !active) return;
    JourneyScrapBelt.start({
      canvasId: 'journey-scrap-canvas',
      attemptId,
      encounterId: node.encounterId,
      startingHull: state.resources.hull,
      blasterLevel: state.upgrades.blasterLevel,
      initiallyPaused: !!initiallyPaused,
      onSuccessReady(result) {
        pendingScrapBeltRetry = null;
        pendingScrapBeltSuccess = { node, result };
        renderScrapBeltVictory(result);
      },
      onFailureReady(result) {
        pendingScrapBeltRetry = { node, result };
        renderScrapBeltFailure(result);
      },
      onComplete(result) {
        handleEncounterComplete(node, result);
      }
    });
  }

  function renderScrapBeltTutorialStep() {
    const overlay = document.getElementById('journey-scrap-start-overlay');
    const screen = document.querySelector && document.querySelector('.journey-scrap-screen');
    if (!overlay || !screen) return;
    const beats = [
      {
        className: 'scan',
        eyebrow: 'SCANNER',
        title: 'TAP TO SCAN THE AREA',
        detail: '',
        action: 'TAP FOR NEXT →'
      },
      {
        className: 'lock',
        eyebrow: 'FIND THE RING',
        title: 'STAY INSIDE',
        detail: 'CAPTURE THE SIGNAL',
        action: 'START MISSION →'
      }
    ];
    const beat = beats[scrapBeltTutorialStep] || beats[beats.length - 1];
    screen.classList.remove('tutorial-scan', 'tutorial-lock');
    screen.classList.add(`tutorial-${beat.className}`);
    overlay.className = `journey-mission-start-overlay is-${beat.className}`;
    overlay.innerHTML = `
      <span class="journey-tutorial-title">
        <small>${beat.eyebrow}</small>
        <strong id="journey-scrap-start-title">${beat.title}</strong>
        ${beat.detail ? `<em>${beat.detail}</em>` : ''}
      </span>
      <span class="journey-tutorial-focus" aria-hidden="true"><i></i></span>
      <span class="journey-tutorial-advance">${beat.action}</span>`;
  }

  function beginScrapBeltMission() {
    if (!pendingScrapBeltLaunch) return;
    const launch = pendingScrapBeltLaunch;
    const state = JourneyState.getState();
    const overlay = document.getElementById('journey-scrap-start-overlay');
    if (!state || !launch.node || !active) return;
    const attempt = JourneyState.beginEncounter(launch.node.encounterId);
    if (!attempt.ok) return;
    pendingScrapBeltLaunch = null;
    if (overlay) overlay.remove();
    const screen = document.querySelector && document.querySelector('.journey-scrap-screen');
    if (screen) screen.classList.remove('is-tutorial', 'tutorial-scan', 'tutorial-lock');
    JourneyScrapBelt.begin(attempt.attemptId);
  }

  function renderScrapBeltFailure(result) {
    const frame = document.querySelector && document.querySelector('.journey-scrap-frame');
    if (!frame || !result || !active) return;
    const overlay = document.createElement('section');
    overlay.className = 'journey-mission-failure-overlay';
    overlay.setAttribute('aria-labelledby', 'journey-scrap-failure-title');
    overlay.innerHTML = `
      <div class="journey-mission-failure-mark" aria-hidden="true">×</div>
      <span>TRY AGAIN</span>
      <h2 id="journey-scrap-failure-title">SIGNAL LOST</h2>
      <p>Scan again. Find the ring. Stay inside until it locks.</p>
      <button type="button" onclick="journeyRetryScrapBelt()">RETRY MISSION →</button>`;
    frame.appendChild(overlay);
  }

  function renderScrapBeltVictory(result) {
    const frame = document.querySelector && document.querySelector('.journey-scrap-frame');
    if (!frame || !result || !active) return;
    const overlay = document.createElement('section');
    overlay.className = 'journey-mission-victory-overlay';
    overlay.setAttribute('aria-labelledby', 'journey-scrap-victory-title');
    overlay.innerHTML = `
      <div class="journey-mission-victory-lock" aria-hidden="true"><i></i><i></i><b>✓</b></div>
      <span>MISSION COMPLETE</span>
      <h2 id="journey-scrap-victory-title">SIGNAL ACQUIRED</h2>
      <p>The crystal trail is locked beyond the Belt.</p>
      <div class="journey-mission-victory-stats">
        <strong>${Math.round(result.hullRemaining)} HULL</strong>
        <strong>+${Math.round(result.salvageCollected + 20)} SCRAP</strong>
      </div>
      <button type="button" onclick="journeyConfirmScrapBeltSuccess()">CONTINUE →</button>`;
    frame.appendChild(overlay);
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
          <div class="journey-combat-hull-readout">
            <span>HULL</span><strong id="journey-combat-hull">${Math.round(state.resources.hull)}</strong>
            <div><i id="journey-combat-hull-fill" style="width:100%"></i></div>
          </div>
          <div class="journey-combat-title"><span>${node.name.toUpperCase()}</span><strong>${rescue ? 'RESCUE RUN' : 'ASTEROID SALVAGE'}</strong></div>
          <div><span>TIME</span><strong id="journey-combat-time">${seconds}</strong></div>
          <div><span>${rescue ? 'CLEARANCE' : 'SALVAGE'}</span><strong id="journey-combat-salvage">0 / ${rescue ? '4' : '8'}</strong></div>
        </header>
        <div class="journey-combat-frame">
          <canvas id="journey-combat-canvas" aria-label="Scrap Belt asteroid encounter"></canvas>
          <div id="journey-combat-damage-alert" class="journey-combat-damage-alert" aria-live="assertive"></div>
          <button class="journey-combat-retreat" type="button" onclick="journeyRetreatEncounter()">RETREAT</button>
        </div>
        <div class="journey-combat-hint">DRAG OR USE A/D · BLASTER AUTO-FIRES</div>
      </main>`;
    JourneyCombat.start({
      canvasId: 'journey-combat-canvas',
      attemptId,
      encounterId: node.encounterId,
      encounterType: rescue ? 'rescue' : 'asteroids',
      difficulty: rescue ? 1.5 : 1.65,
      startingHull: state.resources.hull,
      rescuedPassengerId: rescue ? node.passengerId : null,
      shipStats: {
        blasterLevel: state.upgrades.blasterLevel,
        hullLevel: state.upgrades.hullLevel,
        salvageMagnetLevel: state.upgrades.salvageMagnetLevel
      },
      objectives: {
        surviveSeconds: seconds,
        salvageTarget: rescue ? 4 : 8
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
    if (node.id === 'distress-signal' && result.outcome === 'success') {
      pendingDistressSuccess = null;
      if (typeof JourneyDistressRescue !== 'undefined') JourneyDistressRescue.destroy();
      shipNotice = 'PIP IS ABOARD · CACHE CRYSTAL MOVED TO OGRE GATE';
      renderShip();
      return;
    }
    if (node.id === 'scrap-belt' && result.outcome === 'success') {
      pendingEncounterPresentation = { node, result, applied };
      renderScrapBeltExit();
      return;
    }
    renderEncounterResults(node, result, applied);
  }

  function renderScrapBeltExit() {
    const root = host();
    const hero = selectedHero();
    if (!root || !pendingEncounterPresentation || !active) return;
    root.innerHTML = `
      <main class="journey-arrival-scene journey-belt-exit">
        <div class="journey-starfield" aria-hidden="true"></div>
        <div class="journey-arrival-location"><span>ROUTE ACQUIRED</span><strong>CRYSTAL TRAIL</strong></div>
        <div class="journey-belt-exit-visual" aria-label="The Wayfarer emerges from the Scrap Belt with a locked crystal signal">
          <div class="journey-belt-exit-rocks is-left"><i></i><i></i><i></i></div>
          <div class="journey-belt-exit-signal"><i></i><i></i><span>LOCKED</span></div>
          <div class="journey-arrival-flight">${shipIllustration('journey-arrival-ship-svg')}</div>
          <div class="journey-belt-exit-rocks is-right"><i></i><i></i><i></i></div>
        </div>
        <section class="journey-arrival-dialogue">
          <div class="journey-arrival-speaker" style="--hero-color:${hero.color}">${typeof charFace === 'function' ? charFace(hero, 'normal') : hero.emoji}</div>
          <div><span>${hero.name}</span><p>“We have the trail. Two signals are waiting beyond the Belt.”</p></div>
        </section>
        <button type="button" onclick="journeyContinueScrapBeltExit()">CONTINUE →</button>
      </main>`;
  }

  function renderEncounterResults(node, result, applied) {
    const root = host();
    const state = JourneyState.getState();
    if (!root || !state || !active) return;
    const success = result.outcome === 'success';
    const rescue = node.type === 'rescue';
    const scrapTraversal = node.id === 'scrap-belt';
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
            <span>${scrapTraversal ? 'DEBRIS CLEARED' : 'ASTEROIDS BROKEN'}<strong>${Math.round(result.stats.asteroidsDestroyed)}</strong></span>
            <span>${rescue ? 'PASSENGER' : scrapTraversal ? 'CRYSTAL TRAIL' : 'OPTIONAL TARGET'}<strong>${rescue && success ? 'PIP' : success && result.objectiveComplete ? 'LOCKED' : 'MISSED'}</strong></span>
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
    const state = JourneyState.load();
    if (state && !state.settings.tutorialComplete) renderJourneyIntro();
    else renderCurrentLocation();
  };

  window.journeyNew = function () {
    playMenuSound();
    if (JourneyState.hasSave() && !window.confirm('START A NEW JOURNEY?\\nYour current Journey save will be replaced.')) return;
    JourneyState.createNew();
    renderJourneyIntro();
  };

  window.journeyFinishIntro = function () {
    clearStoryTimers();
    JourneyState.completeIntro();
    renderShip();
  };

  window.journeyContinueIntro = function () {
    if (!introAdvance) return;
    playMenuSound();
    const advance = introAdvance;
    introAdvance = null;
    advance();
  };

  window.journeyHowToPlay = function () {
    playMenuSound();
    renderHowToPlay();
  };

  window.journeyShip = function () {
    playMenuSound();
    pendingScrapBeltLaunch = null;
    pendingScrapBeltSuccess = null;
    pendingScrapBeltRetry = null;
    pendingDistressLaunch = null;
    pendingDistressSuccess = null;
    pendingCacheLaunch = null;
    pendingCacheSuccess = null;
    pendingRepairLaunch = null;
    scrapBeltTutorialStep = 0;
    if (typeof JourneyDistressRescue !== 'undefined') JourneyDistressRescue.destroy();
    if (typeof JourneyCache !== 'undefined') JourneyCache.destroy();
    if (typeof JourneyRepair !== 'undefined') JourneyRepair.destroy();
    renderShip();
  };

  window.journeyOpenDebug = function () {
    playMenuSound();
    renderDebugMenu();
  };

  window.journeyDebugCheckpoint = function (checkpointId) {
    playMenuSound();
    const result = JourneyState.prepareDebugCheckpoint(checkpointId);
    if (!result.ok) return;
    clearStoryTimers();
    pendingEncounterPresentation = null;
    pendingScrapBeltLaunch = null;
    pendingScrapBeltSuccess = null;
    pendingScrapBeltRetry = null;
    pendingDistressLaunch = null;
    pendingDistressSuccess = null;
    pendingCacheLaunch = null;
    pendingCacheSuccess = null;
    pendingRepairLaunch = null;
    scrapBeltTutorialStep = 0;
    JourneyCombat.destroy();
    if (typeof JourneyScrapBelt !== 'undefined') JourneyScrapBelt.destroy();
    if (typeof JourneyDistressRescue !== 'undefined') JourneyDistressRescue.destroy();
    if (typeof JourneyCache !== 'undefined') JourneyCache.destroy();
    if (typeof JourneyRepair !== 'undefined') JourneyRepair.destroy();
    if (typeof JourneyMissionRuntime !== 'undefined') JourneyMissionRuntime.destroy();
    shipNotice = `DEV CHECKPOINT · ${checkpointId.replace(/-/g, ' ').toUpperCase()}`;
    if (checkpointId === 'opening') renderJourneyIntro();
    else renderShip();
  };

  window.journeyDebugRestoreShip = function () {
    playMenuSound();
    const result = JourneyState.restoreDebugShip();
    if (!result.ok) return;
    shipNotice = 'DEV TOOL · SHIP RESTORED';
    renderShip();
  };

  window.journeyOpenEngineering = function () {
    playMenuSound();
    renderEngineering();
  };

  window.journeyOpenLog = function () {
    playMenuSound();
    renderLog();
  };

  window.journeyEngineeringRepair = function () {
    playMenuSound();
    const state = JourneyState.getState();
    const result = state
      ? JourneyState.repairHull(state.resources.maxHull, 5)
      : { ok: false };
    if (result.ok) shipNotice = 'HULL REPAIRED · 5 SCRAP SPENT';
    renderEngineering();
  };

  window.journeyEngineeringRefuel = function () {
    playMenuSound();
    const state = JourneyState.getState();
    if (state && state.currentNodeId === 'fuel-stop-1') JourneyState.refuelToMax('fuel-stop-service');
    renderEngineering();
  };

  window.journeyEngineeringRest = function () {
    playMenuSound();
    JourneyState.restPilot(25);
    renderEngineering();
  };

  window.journeyRoute = function () {
    playMenuSound();
    renderRoute();
  };

  window.journeyReadIntel = function (transmissionId) {
    playMenuSound();
    renderIntel(transmissionId);
  };

  window.journeyContinueIntel = function (transmissionId) {
    const transmission = JourneyData.getTransmission(transmissionId);
    if (!transmission) return;
    playMenuSound();
    JourneyState.markTransmissionRead(transmissionId);
    renderIntelChoice(transmission);
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
    else renderArrivalScene(destination);
  };

  window.journeyContinueArrival = function () {
    playMenuSound();
    renderCurrentLocation();
  };

  window.journeyFinishFuelService = function () {
    playMenuSound();
    clearStoryTimers();
    renderShip();
  };

  window.journeyStartEncounter = function () {
    const state = JourneyState.getState();
    const node = state && currentNode(state);
    if (!state || !node || !['encounter', 'rescue'].includes(node.type) || !node.encounterId) return;
    playMenuSound();
    if (node.id === 'scrap-belt') {
      renderScrapBelt(node);
      return;
    }
    if (node.id === 'distress-signal') {
      const attempt = JourneyState.beginEncounter(node.encounterId);
      if (!attempt.ok) return;
      renderDistressRescue(node, attempt.attemptId);
      return;
    }
    const attempt = JourneyState.beginEncounter(node.encounterId);
    if (!attempt.ok) return;
    renderCombat(node, attempt.attemptId);
  };

  window.journeyMissionControl = function (control, pressed) {
    if (typeof JourneyMissionRuntime !== 'undefined') {
      JourneyMissionRuntime.setControl(control, pressed);
    }
  };

  window.journeyMissionTractor = function () {
    if (typeof JourneyMissionRuntime !== 'undefined') JourneyMissionRuntime.activateTractor();
  };

  window.journeyMissionScan = function () {
    if (typeof JourneyMissionRuntime !== 'undefined') JourneyMissionRuntime.pulseScan();
  };

  window.journeyAdvanceScrapBeltTutorial = function () {
    playMenuSound();
    if (scrapBeltTutorialStep < 1) {
      scrapBeltTutorialStep += 1;
      renderScrapBeltTutorialStep();
      return;
    }
    beginScrapBeltMission();
  };

  window.journeyRetryScrapBelt = function () {
    if (!pendingScrapBeltRetry) return;
    playMenuSound();
    const retry = pendingScrapBeltRetry;
    pendingScrapBeltRetry = null;
    const overlay = document.querySelector && document.querySelector('.journey-mission-failure-overlay');
    if (overlay) overlay.remove();
    startScrapBeltRuntime(retry.node, retry.result.attemptId, false);
  };

  window.journeyBeginDistressRescue = function () {
    if (!pendingDistressLaunch) return;
    playMenuSound();
    const overlay = document.getElementById('journey-rescue-start');
    if (overlay) overlay.remove();
    JourneyDistressRescue.begin();
  };

  window.journeyConfirmDistressRescue = function () {
    if (!pendingDistressSuccess) return;
    playMenuSound();
    const completion = pendingDistressSuccess;
    pendingDistressSuccess = null;
    handleEncounterComplete(completion.node, completion.result);
  };

  window.journeyConfirmScrapBeltSuccess = function () {
    if (!pendingScrapBeltSuccess) return;
    playMenuSound();
    const completion = pendingScrapBeltSuccess;
    pendingScrapBeltSuccess = null;
    handleEncounterComplete(completion.node, completion.result);
  };

  window.journeyContinueScrapBeltExit = function () {
    if (!pendingEncounterPresentation) return;
    playMenuSound();
    const presentation = pendingEncounterPresentation;
    pendingEncounterPresentation = null;
    renderEncounterResults(presentation.node, presentation.result, presentation.applied);
  };

  window.journeyBeginCache = function () {
    if (!pendingCacheLaunch) return;
    playMenuSound();
    const overlay = document.getElementById('journey-cache-start');
    if (overlay) overlay.remove();
    JourneyCache.begin();
  };

  window.journeyBeginRepairPuzzle = function () {
    if (!pendingRepairLaunch) return;
    playMenuSound();
    const overlay = document.getElementById('journey-repair-start');
    if (overlay) overlay.remove();
    JourneyRepair.begin();
  };

  window.journeyFinishCrystalBeat = function () {
    playMenuSound();
    pendingCacheSuccess = null;
    if (typeof JourneyCache !== 'undefined') JourneyCache.destroy();
    renderShip();
  };

  window.journeyBuyBlasterUpgrade = function () {
    playMenuSound();
    const stateBefore = JourneyState.getState();
    const upgradeCost = stateBefore && stateBefore.upgrades.blasterLevel === 0 ? 0 : 15;
    const result = JourneyState.purchaseUpgrade('blasterLevel', upgradeCost);
    // A successful purchase is already reflected live in the workshop card
    // itself (level + button text update) — an extra confirmation box would
    // just restate the same fact a second time. Only surface a notice for the
    // failure case, which isn't visible anywhere else on the screen.
    maintenanceNotice = result.ok ? '' : 'NOT ENOUGH SCRAP FOR THIS UPGRADE';
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
    if (typeof JourneyScrapBelt !== 'undefined' && JourneyScrapBelt.isActive()) {
      JourneyScrapBelt.retreat();
      return;
    }
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
    const state = JourneyState.getState();
    if (state) JourneyState.repairHull(state.resources.maxHull, 5);
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
    clearStoryTimers();
    pendingEncounterPresentation = null;
    pendingScrapBeltLaunch = null;
    pendingScrapBeltSuccess = null;
    pendingScrapBeltRetry = null;
    pendingDistressLaunch = null;
    pendingDistressSuccess = null;
    pendingCacheLaunch = null;
    pendingCacheSuccess = null;
    pendingRepairLaunch = null;
    scrapBeltTutorialStep = 0;
    JourneyCombat.destroy();
    if (typeof JourneyScrapBelt !== 'undefined') JourneyScrapBelt.destroy();
    if (typeof JourneyDistressRescue !== 'undefined') JourneyDistressRescue.destroy();
    if (typeof JourneyCache !== 'undefined') JourneyCache.destroy();
    if (typeof JourneyRepair !== 'undefined') JourneyRepair.destroy();
    if (typeof JourneyMissionRuntime !== 'undefined') JourneyMissionRuntime.destroy();
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
