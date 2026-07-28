/* Packing Game UI. A standalone sibling of Grid Lock with its own campaign. */
(function () {
  'use strict';

  const hostId = 'packing-wrap';
  let active = false;
  let selectedWorldId = null;
  let selectedLevelId = null;
  let debugMode = false;
  let startedAt = 0;

  function host() { return document.getElementById(hostId); }
  function sound() {
    try { if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect(); } catch (error) {}
  }
  function destroyPuzzle() {
    if (typeof PackingGameEngine !== 'undefined') PackingGameEngine.destroy();
  }
  function selectedWorld() {
    return PackingGameLevels.worlds.find(world => world.id === selectedWorldId) || PackingGameLevels.worlds[0];
  }
  function selectedLevel() {
    return PackingGameLevels.get(selectedLevelId) || PackingGameLevels.get(PackingGameLevels.firstId);
  }
  function worldUnlocked(world) {
    return Boolean(world.available && PackingGameProgression.isUnlocked(world.levels[0].id));
  }
  const WORLD_THEMES = {
    'classic-packing': 'space',
      'linked-pieces': 'jungle',
      'overlap-nodes': 'ice',
    'utility-pieces': 'ocean',
    'expanding-containers': 'magic'
  };
  function themeFor(worldId) { return WORLD_THEMES[worldId] || 'space'; }
  function boardFillFor(worldId) {
    return {
      'classic-packing': '#07120f',
      'linked-pieces': '#0a180b',
      'overlap-nodes': '#0b1720'
    }[worldId] || '#07120f';
  }
  function worldIcon(index) {
    const common = 'viewBox="0 0 64 64" aria-hidden="true"';
    const icons = [
      `<svg ${common}><circle class="gl-core-planet" cx="32" cy="32" r="15"/><path class="gl-core-detail" d="M18 27H46M17 32H47M19 37H45"/></svg>`,
      `<svg ${common}><path class="gl-core-leaf" d="M45 17C28 18 18 27 20 44c15 2 25-7 25-27Z"/><path class="gl-core-detail" d="M22 42C28 34 34 28 43 20M29 34l-1-9M34 29l8 1"/></svg>`,
      `<svg ${common}><path class="gl-core-crystal" d="M32 14L44 26L39 47L25 47L20 26Z"/><path class="gl-core-detail" d="M32 14V47M20 26H44M25 47l7-21 7 21"/></svg>`,
      `<svg ${common}><path class="gl-core-wave" d="M14 27c6 0 6-5 12-5s6 5 12 5 6-5 12-5M14 38c6 0 6-5 12-5s6 5 12 5 6-5 12-5"/></svg>`,
      `<svg ${common}><path class="gl-core-castle" d="M18 47V24h7v7h6V20h7v11h6v-7h7v23Z"/><path class="gl-core-detail" d="M27 47V37h10v10M18 24h7M44 24h7"/></svg>`
    ];
    return `<div class="packing-world-core packing-world-icon" aria-hidden="true"><i></i><b></b>${icons[index] || icons[0]}</div>`;
  }

  function renderWorldMap() {
    const root = host();
    if (!root || !active) return;
    const worlds = PackingGameLevels.worlds.map((world, index) => {
      const unlocked = worldUnlocked(world);
      const completed = world.levels.every(level => PackingGameProgression.isCompleted(level.id));
      const completedCount = world.levels.filter(level => PackingGameProgression.isCompleted(level.id)).length;
      const status = completed ? 'COMPLETE' : unlocked ? `${completedCount}/${world.levels.length} CLEAR` : world.available ? 'LOCKED' : 'COMING SOON';
      return `<button class="packing-world-node ${unlocked ? 'is-unlocked' : 'is-locked'} ${completed ? 'is-complete' : ''}" type="button" data-gl-theme="${themeFor(world.id)}"
        ${unlocked ? `onclick="packingGameOpenWorld('${world.id}')"` : 'disabled'}>
        ${worldIcon(index)}
        <strong>${world.displayName}</strong>
        <em>WORLD ${index + 1} · ${status}</em>
        ${!unlocked ? '<i class="packing-world-lock" aria-hidden="true"></i>' : ''}
      </button>`;
    }).join('');
    root.innerHTML = `
      <main class="packing-world-map" aria-labelledby="packing-world-map-title">
        <header class="packing-cockpit-header">
          <button type="button" class="arcade-tier-back" onclick="nav('lobby')">◀ ARCADE</button>
          <div><span>SHAPE MOBE</span><strong id="packing-world-map-title">WORLD MAP</strong></div>
          <button type="button" class="packing-debug-trigger" onclick="packingGameOpenDebug()">DEBUG</button>
        </header>
        <section class="packing-world-map-panel">
          <div class="packing-map-heading"><strong>SELECT A WORLD</strong></div>
          <div class="packing-world-nodes">${worlds}</div>
        </section>
        <footer class="packing-cockpit-footer">EACH WORLD ADDS ONE PERMANENT PACKING RULE.</footer>
      </main>`;
  }

  function renderLevelMap() {
    const root = host();
    if (!root || !active) return;
    const world = selectedWorld();
    const nodes = world.levels.map((level, index) => {
      const unlocked = PackingGameProgression.isUnlocked(level.id);
      const complete = PackingGameProgression.isCompleted(level.id);
      return `<button class="packing-path-node ${complete ? 'is-complete' : ''} ${unlocked ? 'is-unlocked' : 'is-locked'}" type="button"
        ${unlocked ? `onclick="packingGameOpenLevel('${level.id}')"` : 'disabled'}>
        <span>${complete ? '✓' : index + 1}</span>${!unlocked ? '<i>◆</i>' : ''}
      </button>`;
    }).join('');
    root.innerHTML = `
      <main class="packing-cockpit" aria-labelledby="packing-cockpit-title" data-gl-theme="${themeFor(world.id)}">
        <header class="packing-cockpit-header">
          <button type="button" onclick="packingGameReturnToWorldMap()">◀ WORLDS</button>
          <div><span>WORLD ${PackingGameLevels.worlds.indexOf(world) + 1}</span><strong id="packing-cockpit-title">SHAPE MOBE</strong></div>
          <span class="packing-cockpit-status">MAP READY</span>
        </header>
        <section class="packing-world-panel">
          <div class="packing-world-copy"><span>${world.name.toUpperCase()}</span><strong>${world.displayName}</strong><small>${world.description}</small></div>
          ${worldIcon(PackingGameLevels.worlds.indexOf(world))}
        </section>
        <section class="packing-map-panel">
          <div class="packing-map-heading"><span>${world.levels.length} GENERATED LEVELS</span><strong>SELECT A LEVEL</strong></div>
          <div class="packing-map-nodes">${nodes}</div>
        </section>
        <footer class="packing-cockpit-footer">COMPLETED LEVELS STAY OPEN FOR A NEW GENERATED PUZZLE.</footer>
      </main>`;
  }

  function renderDebug() {
    const root = host();
    if (!root || !active) return;
    root.innerHTML = `
      <main class="packing-world-map">
        <header class="packing-cockpit-header">
          <button type="button" onclick="packingGameReturnToWorldMap()">◀ MAP</button>
          <div><span>DEVELOPMENT ACCESS</span><strong>DEBUG LEVELS</strong></div>
          <span class="packing-cockpit-status">${PackingGameLevels.all.length} LEVELS</span>
        </header>
        <section class="packing-debug-panel">
          ${PackingGameLevels.worlds.map((world, worldIndex) => `
            <section><span>WORLD ${worldIndex + 1}</span><strong>${world.name}</strong>
              <div>${world.levels.map(level => `<button type="button" onclick="packingGameDebugLevel('${level.id}')">${level.order}. ${level.name}<small>${level.generator.pieceCount} PIECES</small></button>`).join('')}</div>
            </section>`).join('')}
        </section>
        <footer class="packing-cockpit-footer">DEBUG RUNS DO NOT CHANGE PROGRESSION.</footer>
      </main>`;
  }

  function renderPuzzle() {
    const root = host();
    if (!root || !active) return;
    const level = selectedLevel();
    const worldIndex = PackingGameLevels.worlds.findIndex(world => world.id === level.worldId);
    const showIntro = !debugMode && level.order === 1;
    const anchorHelp = level.generator.anchorCount ? ' · X=PIVOT' : '';
    const linkedHelp = level.generator.anchorGroupCount ? ' · CYAN X=LINKED' : '';
    const zoneHelp = level.generator.overlapZoneSize ? ' · GLOW=DOUBLE' : '';
    // The engine recalculates the final SVG viewBox after the generated
    // board is known and the actual stage size has been measured. This
    // starter height only prevents a flash before PackingGameEngine.start().
    const canvasHeight = 900;

    root.innerHTML = `
      <main class="packing-mission-screen" aria-labelledby="packing-level-title" data-gl-theme="${themeFor(level.worldId)}">
        <header>
          <button type="button" onclick="packingGameReturnToMap()">◀ ${debugMode ? 'DEBUG' : 'MAP'}</button>
          <strong id="packing-level-title">WORLD ${worldIndex + 1} · LEVEL ${level.order}</strong>
          <div class="packing-board-actions">
            <button type="button" onclick="packingGameReset()">RESET</button>
          </div>
        </header>
        <div id="packing-stage" class="packing-stage${showIntro ? ' is-paused' : ''}" aria-label="Pack every piece into the container">
          <svg class="packing-svg" viewBox="0 0 560 ${canvasHeight}" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="packing-piece-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity=".55"/></filter>
              <linearGradient id="packing-board-depth" x1="0" y1="0" x2="0" y2="1">
                <stop stop-color="#0b2817"/><stop offset=".55" stop-color="#06150c"/><stop offset="1" stop-color="#020805"/>
              </linearGradient>
              <linearGradient id="packing-space-metal" x1="0" y1="0" x2="0" y2="1">
                <stop stop-color="#202c3d"/><stop offset=".52" stop-color="#111a28"/><stop offset="1" stop-color="#070c14"/>
              </linearGradient>
              <linearGradient id="packing-jungle-border" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#c8f79a"/><stop offset=".28" stop-color="#4f8f43"/><stop offset=".58" stop-color="#a4df74"/><stop offset="1" stop-color="#315f2d"/>
              </linearGradient>
              <linearGradient id="packing-ice-border" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#f1fbff"/><stop offset=".24" stop-color="#78afca"/><stop offset=".55" stop-color="#d8f5ff"/><stop offset=".8" stop-color="#5d8da8"/><stop offset="1" stop-color="#eaf9ff"/>
              </linearGradient>
              <linearGradient id="packing-ocean-border" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#bffcff"/><stop offset=".25" stop-color="#36b8c7"/><stop offset=".55" stop-color="#7fe4d8"/><stop offset=".78" stop-color="#e0836b"/><stop offset="1" stop-color="#237d91"/>
              </linearGradient>
              <linearGradient id="packing-magic-border" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#fff0a6"/><stop offset=".23" stop-color="#9f73e8"/><stop offset=".52" stop-color="#ffe066"/><stop offset=".78" stop-color="#7450bd"/><stop offset="1" stop-color="#e3c76a"/>
              </linearGradient>
              <linearGradient id="packing-leaf" x1="0" y1="0" x2="0" y2="1">
                <stop stop-color="#9be37c"/><stop offset="1" stop-color="#315f2d"/>
              </linearGradient>
              <linearGradient id="packing-ice-shard" x1="0" y1="1" x2="0" y2="0">
                <stop stop-color="#3a6a8c"/><stop offset=".55" stop-color="#8fc4dc"/><stop offset="1" stop-color="#eaf6ff"/>
              </linearGradient>
              <pattern id="packing-jungle-back" width="170" height="170" patternUnits="userSpaceOnUse" patternTransform="rotate(9)">
                <rect width="170" height="170" fill="#0a1608"/>
                <ellipse cx="42" cy="64" rx="50" ry="36" fill="#123016" opacity=".7"/>
                <ellipse cx="128" cy="30" rx="42" ry="32" fill="#0f2a12" opacity=".62"/>
                <ellipse cx="96" cy="128" rx="54" ry="38" fill="#112c14" opacity=".62"/>
              </pattern>
              <pattern id="packing-jungle-front" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
                <path d="M18 60C10 50 9 36 20 24c9 12 7 26-2 36Z" fill="#5c9a4a" opacity=".48"/>
                <path d="M58 27c-6-8-7-18 1-25 8 8 7 18-1 25Z" fill="#79bd5e" opacity=".4"/>
                <path d="M4 14q10-10 20-4 7 5 16-4" fill="none" stroke="#56834a" stroke-width="2" opacity=".55"/>
                <circle cx="62" cy="56" r="2" fill="#e0a542" opacity=".72"/>
              </pattern>
              <pattern id="packing-ice-back" width="175" height="175" patternUnits="userSpaceOnUse" patternTransform="rotate(7)">
                <rect width="175" height="175" fill="#0c1620"/>
                <ellipse cx="44" cy="60" rx="52" ry="38" fill="#1c3244" opacity=".62"/>
                <ellipse cx="126" cy="32" rx="44" ry="32" fill="#193040" opacity=".55"/>
                <ellipse cx="96" cy="130" rx="56" ry="38" fill="#1a2e3e" opacity=".55"/>
              </pattern>
              <pattern id="packing-ice-front" width="82" height="82" patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
                <path d="M16 18l8 12-8 12-8-12Z" fill="#7fa8c0" opacity=".42"/>
                <path d="m56 50 6 8-6 8-6-8Z" fill="#a6d5e9" opacity=".4"/>
                <path d="M4 58q7-9 15-2M46 16q7-9 15-2" fill="none" stroke="#d9f2ff" stroke-width="1.4" opacity=".55"/>
                <circle cx="66" cy="30" r="1.6" fill="#fff" opacity=".7"/>
              </pattern>
              <pattern id="packing-space-back" width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(11)">
                <rect width="180" height="180" fill="#050a14"/>
                <ellipse cx="45" cy="60" rx="55" ry="40" fill="#132a44" opacity=".5"/>
                <ellipse cx="130" cy="34" rx="46" ry="34" fill="#1a1f44" opacity=".45"/>
                <ellipse cx="100" cy="135" rx="58" ry="40" fill="#152640" opacity=".45"/>
              </pattern>
              <pattern id="packing-space-stars" width="90" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-5)">
                <circle cx="14" cy="20" r="1.4" fill="#cfe8ff" opacity=".8"/><circle cx="60" cy="10" r="1" fill="#9fc9ff" opacity=".6"/>
                <circle cx="40" cy="55" r="1.6" fill="#eaf4ff" opacity=".85"/><circle cx="76" cy="68" r="1" fill="#9fc9ff" opacity=".55"/>
                <path d="M14 72l-8 4M10 68v10" stroke="#cfe8ff" stroke-width="1" opacity=".5"/>
                <path d="M50 30c-4-4-4-10 2-13 5 4 4 10-2 13Z" fill="#4a5568" opacity=".55"/>
              </pattern>
              <pattern id="packing-space-rocks" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(6)">
                <g transform="translate(50 140) rotate(-10)"><path d="M0-24 18-16 24 4 10 22-14 20-24 0-14-20Z" fill="#3a4356" opacity=".5"/><circle cx="-4" cy="-4" r="4" fill="#2a3040" opacity=".6"/><circle cx="8" cy="6" r="3" fill="#2a3040" opacity=".5"/></g>
                <g transform="translate(150 55) rotate(20) scale(.7)"><path d="M0-24 18-16 24 4 10 22-14 20-24 0-14-20Z" fill="#333a4a" opacity=".45"/><circle cx="-4" cy="-4" r="4" fill="#242938" opacity=".55"/></g>
              </pattern>
              <pattern id="packing-space-front" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
                <circle cx="8" cy="10" r="1" fill="#fff" opacity=".7"/><circle cx="28" cy="24" r="1.3" fill="#dff0ff" opacity=".8"/><circle cx="18" cy="34" r=".8" fill="#fff" opacity=".55"/>
              </pattern>
              <pattern id="packing-ocean-back" width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(5)">
                <rect width="180" height="180" fill="#03151d"/>
                <ellipse cx="40" cy="60" rx="58" ry="42" fill="#0a3541" opacity=".68"/>
                <ellipse cx="136" cy="36" rx="48" ry="34" fill="#0c3e46" opacity=".56"/>
                <ellipse cx="102" cy="138" rx="62" ry="42" fill="#07303a" opacity=".62"/>
              </pattern>
              <pattern id="packing-ocean-front" width="86" height="86" patternUnits="userSpaceOnUse" patternTransform="rotate(-4)">
                <path d="M5 62q10-13 20 0t20 0" fill="none" stroke="#42aab0" stroke-width="2" opacity=".52"/>
                <path d="M48 20q9-11 18 0t18 0" fill="none" stroke="#68d2cc" stroke-width="1.5" opacity=".42"/>
                <circle cx="18" cy="20" r="2.5" fill="none" stroke="#a9f4ef" opacity=".65"/>
                <circle cx="28" cy="10" r="1.4" fill="#d8ffff" opacity=".7"/>
                <path d="M72 72q-8-17 1-30q10 16-1 30Z" fill="#297c69" opacity=".55"/>
              </pattern>
              <pattern id="packing-magic-back" width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(4)">
                <rect width="180" height="180" fill="#10091d"/>
                <ellipse cx="42" cy="62" rx="58" ry="42" fill="#2b1744" opacity=".66"/>
                <ellipse cx="137" cy="34" rx="48" ry="36" fill="#24133c" opacity=".6"/>
                <ellipse cx="100" cy="138" rx="62" ry="42" fill="#30194a" opacity=".54"/>
              </pattern>
              <pattern id="packing-magic-front" width="92" height="92" patternUnits="userSpaceOnUse" patternTransform="rotate(-5)">
                <path d="M18 12v14m-7-7h14" stroke="#ffe991" stroke-width="1.4" opacity=".55"/>
                <path d="m66 54 7 8-7 8-7-8Z" fill="none" stroke="#bd91ff" stroke-width="1.5" opacity=".58"/>
                <circle cx="42" cy="74" r="2" fill="#ffe066" opacity=".75"/>
                <circle cx="80" cy="20" r="1.4" fill="#e9d8ff" opacity=".7"/>
                <path d="M8 50q8-7 16 0" fill="none" stroke="#7651ad" stroke-width="2" opacity=".52"/>
              </pattern>
            </defs>
            <rect class="packing-stage-bg" width="560" height="${canvasHeight}" rx="16"/>
            <g class="packing-space-scenery" aria-hidden="true">
              <rect width="560" height="${canvasHeight}" fill="url(#packing-space-back)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-space-stars)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-space-rocks)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-space-front)"/>
              <g transform="translate(68 132) rotate(-10)"><path d="M0-20 16-13 20 4 8 18-12 17-20 0-12-17Z" fill="#465167"/><circle cx="-3" cy="-3" r="3.5" fill="#282f3d"/><circle cx="7" cy="6" r="2.5" fill="#282f3d"/></g>
              <g transform="translate(476 124) rotate(18) scale(.86)"><path d="M0-20 16-13 20 4 8 18-12 17-20 0-12-17Z" fill="#3a4356"/><circle cx="-3" cy="-3" r="3.5" fill="#262c39"/></g>
              <g transform="translate(274 83) rotate(8) scale(.62)"><path d="M0-20 16-13 20 4 8 18-12 17-20 0-12-17Z" fill="#4a5568"/></g>
            </g>
            <g class="packing-jungle-scenery" aria-hidden="true">
              <rect width="560" height="${canvasHeight}" fill="url(#packing-jungle-back)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-jungle-front)"/>
              <g fill="url(#packing-leaf)" opacity=".94">
                <path d="M18 206c-25-18-27-58 0-86 27 28 25 68 0 86Z"/><path d="M542 310c-25-18-27-58 0-86 27 28 25 68 0 86Z"/>
                <path d="M24 564c-20-14-22-48 0-71 22 23 20 57 0 71Z"/><path d="M536 650c-20-14-22-48 0-71 22 23 20 57 0 71Z"/>
              </g>
              <path d="M76 120q-25 80 5 150M474 126q30 78-2 166" fill="none" stroke="#6fae54" stroke-width="6" stroke-linecap="round"/>
            </g>
            <g class="packing-ice-scenery" aria-hidden="true">
              <rect width="560" height="${canvasHeight}" fill="url(#packing-ice-back)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-ice-front)"/>
              <g fill="url(#packing-ice-shard)" stroke="#eaf6ff" stroke-width="1" opacity=".88">
                <path d="m15 238 18-35 18 21-6 46-24 17Z"/><path d="m545 320-20-42-18 25 8 47 24 14Z"/>
                <path d="m18 586 15-30 17 18-5 40-22 15Z"/><path d="m542 650-18-38-18 22 7 42 23 14Z"/>
              </g>
              <path d="m55 175 12-9 8 5 10-16M478 190l-12-8-8 5-10-16" fill="none" stroke="#eaf6ff" stroke-width="2" opacity=".55"/>
            </g>
            <g class="packing-ocean-scenery" aria-hidden="true">
              <rect width="560" height="${canvasHeight}" fill="url(#packing-ocean-back)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-ocean-front)"/>
              <g fill="none" stroke-linecap="round">
                <path d="M22 310q-24-62 3-112q28 53-2 109q-20 49 2 102" stroke="#2b8a70" stroke-width="12" opacity=".8"/>
                <path d="M538 252q25-58-2-108q-28 54 2 108q20 48-3 102" stroke="#327c6b" stroke-width="11" opacity=".82"/>
                <path d="M18 612q-20-47 2-88q25 43-1 87" stroke="#216f61" stroke-width="10" opacity=".72"/>
                <path d="M542 698q21-50-2-92q-25 45 1 91" stroke="#2b8270" stroke-width="11" opacity=".75"/>
              </g>
              <g stroke="#e0836b" stroke-width="5" stroke-linecap="round" fill="none">
                <path d="M16 460v-34m0 18-13-16m13 7 14-19M544 532v-38m0 18-14-17m14 8 13-20"/>
              </g>
              <g fill="none" stroke="#c8ffff" opacity=".72">
                <circle cx="34" cy="170" r="5"/><circle cx="48" cy="151" r="3"/><circle cx="520" cy="390" r="5"/><circle cx="534" cy="367" r="3"/>
                <circle cx="28" cy="760" r="4"/><circle cx="526" cy="834" r="4"/>
              </g>
            </g>
            <g class="packing-magic-scenery" aria-hidden="true">
              <rect width="560" height="${canvasHeight}" fill="url(#packing-magic-back)"/>
              <rect width="560" height="${canvasHeight}" fill="url(#packing-magic-front)"/>
              <g fill="#21122f" stroke="#7651ad" stroke-width="2" opacity=".92">
                <path d="M0 356h38V194h-9v-25h-9v25H9v-25H0Z"/>
                <path d="M560 420h-38V238h9v-25h9v25h11v-25h9Z"/>
                <path d="M0 756h32V628h-8v-22h-8v22H8v-22H0Z"/>
                <path d="M560 820h-34V682h8v-22h9v22h8v-22h9Z"/>
              </g>
              <g stroke="#6d5728" stroke-width="2">
                <path d="M38 184v44M522 248v44M32 620v42M526 674v44"/>
              </g>
              <g fill="#ffe066" stroke="#fff0a6" stroke-width="1.5">
                <rect x="30" y="220" width="16" height="20" rx="3"/><rect x="514" y="284" width="16" height="20" rx="3"/>
                <rect x="24" y="654" width="16" height="20" rx="3"/><rect x="518" y="710" width="16" height="20" rx="3"/>
              </g>
              <g fill="#fff0a6">
                <circle cx="58" cy="142" r="2.5"/><circle cx="496" cy="176" r="2"/><circle cx="42" cy="470" r="2"/>
                <circle cx="520" cy="550" r="2.5"/><circle cx="52" cy="860" r="2"/><circle cx="510" cy="930" r="2"/>
              </g>
            </g>
            <g class="packing-space-foreground" aria-hidden="true">
              <g transform="translate(18 238) rotate(-18) scale(1.15)">
                <path d="M0-22 17-14 22 3 10 20-12 18-22 1-13-18Z" fill="#4a5568" stroke="#6c7a91" stroke-width="2"/>
                <circle cx="-5" cy="-4" r="4" fill="#293140"/><circle cx="8" cy="7" r="3" fill="#30394a"/>
              </g>
              <g transform="translate(544 414) rotate(21) scale(1.35)">
                <path d="M0-22 17-14 22 3 10 20-12 18-22 1-13-18Z" fill="#3f495d" stroke="#66758d" stroke-width="2"/>
                <circle cx="-5" cy="-4" r="4" fill="#252c3a"/><circle cx="7" cy="6" r="3" fill="#2b3444"/>
              </g>
              <g transform="translate(25 594) rotate(14) scale(.78)">
                <path d="M0-22 17-14 22 3 10 20-12 18-22 1-13-18Z" fill="#59647a" stroke="#7b89a1" stroke-width="2"/>
                <circle cx="-4" cy="-3" r="4" fill="#303848"/>
              </g>
            </g>
            <g id="packing-region"></g>
            <rect id="packing-rack-bg" x="18" y="670" width="524" height="425" rx="20" class="packing-rack-bg"/>
            <text id="packing-rack-label" x="36" y="705" class="packing-stage-kicker">DRAG · SPACE ROTATE${anchorHelp}${linkedHelp}${zoneHelp}</text>
            <text id="packing-rack-mobile-hint" x="36" y="705" class="packing-rack-mobile-hint" aria-hidden="true">HOLD TO MOVE · TAP TO ROTATE</text>
            <g id="packing-tray"></g>
          </svg>
          ${showIntro ? `<button id="packing-start" class="packing-start" type="button" onclick="packingGameBegin()">
            <span>${level.name.toUpperCase()}</span>
            <strong>FILL THE CONTAINER</strong>
            <small>${level.briefing}</small>
            <b>START PACKING →</b>
          </button>` : ''}
        </div>
      </main>`;

    startedAt = performance.now();
    const ok = PackingGameEngine.start({
      stageId: 'packing-stage',
      regionGroupId: 'packing-region',
      trayGroupId: 'packing-tray',
      regionArea: { x: 26, y: 26, width: 508, height: 500, maxCellSize: 88 },
      regionAlignY: 'top',
      rackArea: { x: 30, y: 620, width: 500, height: 260 },
      dynamicRack: true,
      autoLayout: {
        enabled: true,
        width: 560,
        minHeight: 660,
        maxHeight: 980,
        topPad: 24,
        sidePad: 24,
        rackSidePad: 30,
        boardHeightRatio: 0.50,
        maxBoardHeight: 520,
        maxCellSize: 88,
        rackGap: 24,
        rackLabelSpace: 60,
        bottomPad: 22,
        minRackHeight: 210,
        minTrayCellSize: 21,
        maxTrayCellSize: 31
      },
      rackGap: 24,
      rackBottom: 900,
      rackBackgroundId: 'packing-rack-bg',
      rackLabelId: 'packing-rack-label',
      rackMobileHintId: 'packing-rack-mobile-hint',
      rackTopPadding: 4,
      rackRowSpacing: 112,
      trayCellSize: 26,
      trayCols: 5,
      regionBackgroundFill: boardFillFor(level.worldId),
      pieceCount: level.generator.pieceCount,
      pieceIndexList: level.generator.pieceIndexList,
      targetMin: level.generator.targetMin,
      targetMax: level.generator.targetMax,
      maxDimension: level.generator.maxDimension,
      maxAspectRatio: level.generator.maxAspectRatio,
      verifySolutions: level.generator.verifySolutions,
      minHoles: level.generator.minHoles,
      maxHoles: level.generator.maxHoles,
      linkCount: level.generator.linkCount,
      linkSharedCount: level.generator.linkSharedCount,
      overlapCount: level.generator.overlapCount,
      anchorCount: level.generator.anchorCount,
      anchorGroupCount: level.generator.anchorGroupCount,
      overlapZoneSize: level.generator.overlapZoneSize,
      initiallyPaused: showIntro,
      onComplete: showComplete
    });
    if (!ok) {
      document.getElementById('packing-stage').insertAdjacentHTML('beforeend', '<div class="packing-error">COULD NOT GENERATE THIS PUZZLE.<button onclick="packingGameReset()">TRY AGAIN</button></div>');
    }
  }

  function showComplete() {
    const stage = document.getElementById('packing-stage');
    if (!stage || !active) return;
    const level = selectedLevel();
    const stats = { durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    if (!debugMode) PackingGameProgression.complete(level.id, stats);
    const next = PackingGameLevels.next(level.id);
    const playableNext = next && next.worldId === level.worldId;
    stage.insertAdjacentHTML('beforeend', `
      <div class="packing-solved">
        <span>${debugMode ? 'DEBUG RUN COMPLETE' : playableNext ? `LEVEL ${next.order} UNLOCKED` : 'WORLD COMPLETE'}</span>
        <strong>PUZZLE COMPLETE</strong>
        <div class="packing-solved-actions">
          <button type="button" onclick="packingGameReturnToMap()">BACK TO MAP</button>
          ${playableNext ? `<button type="button" onclick="${debugMode ? `packingGameDebugLevel('${next.id}')` : `packingGameOpenLevel('${next.id}')`}">NEXT</button>` : ''}
        </div>
      </div>`);
  }

  window.packingGameOpenWorldMap = function () { if (!active) return; sound(); destroyPuzzle(); debugMode = false; renderWorldMap(); };
  window.packingGameReturnToWorldMap = function () { if (!active) return; sound(); destroyPuzzle(); debugMode = false; renderWorldMap(); };
  window.packingGameOpenWorld = function (worldId) {
    const world = PackingGameLevels.worlds.find(candidate => candidate.id === worldId);
    if (!active || !world || !worldUnlocked(world)) return;
    sound(); selectedWorldId = worldId; selectedLevelId = null; debugMode = false; renderLevelMap();
  };
  window.packingGameOpenLevel = function (levelId) {
    const level = PackingGameLevels.get(levelId);
    if (!active || !level || !PackingGameProgression.isUnlocked(levelId)) return;
    sound(); destroyPuzzle(); selectedWorldId = level.worldId; selectedLevelId = levelId; debugMode = false; renderPuzzle();
  };
  window.packingGameOpenDebug = function () { if (!active) return; sound(); destroyPuzzle(); debugMode = true; renderDebug(); };
  window.packingGameDebugLevel = function (levelId) {
    const level = PackingGameLevels.get(levelId);
    if (!active || !level) return;
    sound(); destroyPuzzle(); selectedWorldId = level.worldId; selectedLevelId = levelId; debugMode = true; renderPuzzle();
  };
  window.packingGameReturnToMap = function () {
    if (!active) return;
    sound(); destroyPuzzle();
    if (debugMode) renderDebug(); else renderLevelMap();
  };
  window.packingGameBegin = function () {
    if (!active) return;
    sound();
    const overlay = document.getElementById('packing-start');
    if (overlay) overlay.remove();
    const stage = document.getElementById('packing-stage');
    if (stage) stage.classList.remove('is-paused');
    PackingGameEngine.begin();
    startedAt = performance.now();
  };
  window.packingGameReset = function () {
    if (!active) return;
    sound();
    const solvedOverlay = document.querySelector('.packing-solved');
    if (solvedOverlay) solvedOverlay.remove();
    PackingGameEngine.reset();
    startedAt = performance.now();
  };
  window.initPackingGame = function () {
    active = true; selectedWorldId = null; selectedLevelId = null; debugMode = false;
    renderWorldMap();
  };
  window.packingGameBack = function () {
    if (!active) return;
    active = false; destroyPuzzle();
    const root = host();
    if (root) root.innerHTML = '';
    selectedWorldId = null; selectedLevelId = null; debugMode = false;
  };
})();
