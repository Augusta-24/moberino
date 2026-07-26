/* Grid Lock UI. It composes level data, progression, and the puzzle engine. */
(function () {
  'use strict';

  const hostId = 'gridlock-wrap';
  let active = false;
  let selectedLevelId = null;
  let selectedWorldId = null;
  let debugMode = false;

  // Presentation-only: maps each world's mechanic id to a visual theme.
  // Never read by the engine — CSS vars keyed on data-gl-theme do the work.
  const WORLD_THEMES = {
    'training-array': 'space',
    'sliding-array': 'jungle',
    'obstacle-array': 'ice',
    'router-array': 'ocean',
    'command-array': 'magic'
  };
  function themeFor(worldId) { return WORLD_THEMES[worldId] || 'space'; }
  function themeIcon(worldId) {
    const common = 'viewBox="0 0 64 64" aria-hidden="true"';
    const icons = {
      'training-array': `<svg ${common}><circle class="gl-core-planet" cx="32" cy="32" r="15"/><path class="gl-core-detail" d="M18 27H46M17 32H47M19 37H45"/></svg>`,
      'sliding-array': `<svg ${common}><path class="gl-core-leaf" d="M45 17C28 18 18 27 20 44c15 2 25-7 25-27Z"/><path class="gl-core-detail" d="M22 42C28 34 34 28 43 20M29 34l-1-9M34 29l8 1"/></svg>`,
      'obstacle-array': `<svg ${common}><path class="gl-core-crystal" d="M32 14L44 26L39 47L25 47L20 26Z"/><path class="gl-core-detail" d="M32 14V47M20 26H44M25 47l7-21 7 21"/></svg>`,
      'router-array': `<svg ${common}><path class="gl-core-wave" d="M14 27c6 0 6-5 12-5s6 5 12 5 6-5 12-5M14 38c6 0 6-5 12-5s6 5 12 5 6-5 12-5"/></svg>`,
      'command-array': `<svg ${common}><path class="gl-core-castle" d="M18 47V24h7v7h6V20h7v11h6v-7h7v23Z"/><path class="gl-core-detail" d="M27 47V37h10v10M18 24h7M44 24h7"/></svg>`
    };
    return `<div class="gridlock-world-core gridlock-world-icon"><i></i><b></b>${icons[worldId] || icons['training-array']}</div>`;
  }

  // Player-facing world identity — the level data underneath keeps its
  // mechanic names (Training/Sliding/Barrier/Router/Command Array) since
  // that's Codex's territory; these are display-only overrides used on
  // player-facing screens. The debug menu intentionally keeps the mechanic
  // names since that's a dev tool for picking generated recipes, not theme.
  const WORLD_DISPLAY = {
    'training-array': 'Space',
    'sliding-array': 'Jungle',
    'obstacle-array': 'Ice',
    'router-array': 'Ocean',
    'command-array': 'Castle'
  };
  function displayNameFor(worldId) { return WORLD_DISPLAY[worldId] || 'Unknown'; }


  // Level-intro teaching moment: instead of an abstract diagram, dim the
  // real board via an SVG mask and cut a bright hole over whatever the
  // level's rule set actually is (the movement bay, a router tile, a
  // programmable bolt) with a tiny demo animation inside it. Geometry comes
  // straight from level.modifiers + the computed puzzleLayout — no engine
  // queries, so this is pure presentation layered on top of real data.
  function introSpotlightFor(level, puzzleLayout) {
    const board = puzzleLayout.board;
    const cellRectFor = cells => {
      const rs = cells.map(c => c.r), cs = cells.map(c => c.c);
      const minR = Math.min(...rs), maxR = Math.max(...rs), minC = Math.min(...cs), maxC = Math.max(...cs);
      return {
        x: board.x + minC * board.cellSize, y: board.y + minR * board.cellSize,
        w: (maxC - minC + 1) * board.cellSize, h: (maxR - minR + 1) * board.cellSize
      };
    };
    // Router and command levels both carry a movement bay AND a router
    // (shared helpers in gridlock-levels.js), so modifier-presence alone
    // can't tell "new to this world" apart from "carried over from an
    // earlier one." Dispatch by world instead: spotlight whatever that
    // specific world actually introduces.
    if (level.worldId === 'command-array') {
      const progSink = puzzleLayout.sinks.find(s => s.programmable);
      if (progSink) return { rect: { x: progSink.x - 24, y: progSink.y - 34, w: 48, h: 50 }, kind: 'switch' };
    }
    if (level.worldId === 'router-array') {
      const routers = level.modifiers.specialTiles.filter(t => t.type === 'router');
      if (routers.length) return { rect: cellRectFor(routers), kind: 'router' };
    }
    const sliding = level.modifiers.slidingPieces;
    if (sliding.enabled && sliding.movementCells.length) {
      return { rect: cellRectFor(sliding.movementCells), kind: 'slide', cell: board.cellSize };
    }
    return null;
  }

  function spotlightDemoMarkup(spotlight) {
    const { rect, kind, cell } = spotlight;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    if (kind === 'slide') {
      const half = Math.min(rect.w, rect.h) / 2;
      const travel = Math.max(10, (cell || half) * .7);
      return `<rect class="gl-spot-demo-slide" x="${cx - half * .55}" y="${cy - half - travel / 2}" width="${half * 1.1}" height="${half * 1.1}" rx="5" fill="#e0a542" style="--gl-travel:${travel}px"/>`;
    }
    if (kind === 'router') {
      return `
        <circle class="gl-spot-demo-pulse-a" cx="${rect.x}" cy="${cy - rect.h * .25}" r="4.5" fill="#8ddcff" style="--gl-travel:${rect.w}px"/>
        <circle class="gl-spot-demo-pulse-b" cx="${rect.x}" cy="${cy + rect.h * .25}" r="4.5" fill="#9dfcc0" style="--gl-travel:${rect.w}px"/>`;
    }
    if (kind === 'switch') {
      return `<g transform="translate(${cx},${cy})">
        <rect x="-11" y="-6" width="22" height="12" rx="6" fill="#111923" stroke="#d2dbe0" stroke-width="1.4"/>
        <circle class="gl-spot-demo-knob" cx="-4" cy="0" r="4" fill="#d2dbe0"/>
      </g>`;
    }
    return '';
  }

  function introSpotlightMarkup(level, puzzleLayout) {
    const spotlight = introSpotlightFor(level, puzzleLayout);
    if (!spotlight) return { markup: '', active: false };
    const { rect } = spotlight;
    const pad = 6;
    const markup = `
      <g id="gridlock-intro-spotlight">
        <mask id="gridlock-spotlight-mask">
          <rect x="0" y="92" width="560" height="728" fill="white"/>
          <rect x="${rect.x - pad}" y="${rect.y - pad}" width="${rect.w + pad * 2}" height="${rect.h + pad * 2}" rx="8" fill="black"/>
        </mask>
        <rect x="0" y="92" width="560" height="728" fill="rgba(2,6,14,.86)" mask="url(#gridlock-spotlight-mask)"/>
        <rect class="gl-spot-ring" x="${rect.x - pad}" y="${rect.y - pad}" width="${rect.w + pad * 2}" height="${rect.h + pad * 2}" rx="8" fill="none"/>
        ${spotlightDemoMarkup(spotlight)}
      </g>`;
    return { markup, active: true };
  }

  // Static scenery for the puzzle screen (hood arch + crystal centerpiece).
  // Themed by branching on the string returned here — engine markup
  // (tiles/obstacles/conduits, drawn by gridlock.js) is untouched.
  // The full-canvas backdrop pattern ("the green space is pattern space") —
  // drawn first, so the opaque board/housing/hood sit on top of it and it
  // only shows through in the margins around them.
  function backdropMarkup(theme) {
    const layers = {
      jungle: ['glJunglePatternBack', 'glJunglePattern', 'glJungleBigLeaf', 'glJunglePatternFront'],
      space: ['glSpacePatternBack', 'glSpacePattern', 'glSpaceBigRock', 'glSpaceFront'],
      ice: ['glIcePatternBack', 'glIcePattern', 'glIceBigShard', 'glIceFront'],
      ocean: ['glOceanPatternBack', 'glOceanPattern', 'glOceanBigCoral', 'glOceanFront'],
      magic: ['glMagicPatternBack', 'glMagicPattern', 'glMagicBigLantern', 'glMagicFront']
    };
    const ids = layers[theme];
    if (!ids) return '';
    const [back, mid, big, front] = ids;
    return `
        <rect x="0" y="92" width="560" height="728" fill="url(#${back})" filter="url(#glBackBlur)"/>
        <rect x="0" y="92" width="560" height="728" fill="url(#${mid})"/>
        <rect x="0" y="92" width="560" height="728" fill="url(#${big})"/>
        <rect x="0" y="92" width="560" height="728" fill="url(#${front})"/>`;
  }

  function hoodMarkup(theme) {
    if (theme === 'jungle') {
      // Hood occupies a fixed vertical band regardless of board size: canopy
      // edge ~138-196, bolts always start ~205-208 (see gridlock-bolt
      // transforms), housing always starts ~242+. Every hanging element here
      // is capped to end by y=200 so it can never land behind a bolt or the
      // housing plate no matter where a given level's bolts fall on x.
      const vine = (x, startY, len, rot) => `
        <g transform="translate(${x},${startY}) rotate(${rot})">
          <path d="M0,0 Q-8,${len * .34} 3,${len * .6} Q10,${len * .8} 1,${len}" fill="none" stroke="#3d6e34" stroke-width="5" stroke-linecap="round"/>
          <path d="M0,0 Q-8,${len * .34} 3,${len * .6} Q10,${len * .8} 1,${len}" fill="none" stroke="#6fae54" stroke-width="2" stroke-linecap="round"/>
          <g transform="translate(1,${len})">
            <path d="M0,0 q-11,-6 -5,-17 q11,1 5,17 Z" fill="#8fe07a"/>
            <path d="M0,0 q11,-4 9,-15 q-10,0 -9,15 Z" fill="#5c9a4a"/>
            <path d="M0,2 q-4,7 3,11 q6,-4 -3,-11 Z" fill="#c8f79a"/>
          </g>
        </g>`;
      const frond = (x, y, rot, scale, dim) => `
        <g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})" opacity="${dim ? .72 : 1}">
          <path d="M0,0 C-15,-11 -17,-35 0,-54 C17,-35 15,-11 0,0 Z" fill="url(#glLeafGrad)"/>
          <path d="M0,-5 L0,-47" stroke="#173a12" stroke-width="1.4" opacity=".55"/>
        </g>`;
      const tuft = (x, y, rot) => `<path transform="translate(${x},${y}) rotate(${rot})" d="M0,0 q-6,-3 -3,-8 q6,0 3,8 Z" fill="#5c9a4a" opacity=".8"/>`;
      return `
        <path d="M-20,150 Q70,104 150,142 Q230,100 310,142 Q390,100 470,142 Q540,106 580,148 L580,90 L-20,90 Z" fill="#0c220e" opacity=".6" filter="url(#glLeafBlur)"/>
        <path d="M-20,205 Q6,148 36,194 Q60,152 90,190 Q122,140 158,196 Q188,150 220,192 Q254,144 288,188 Q322,146 354,193 Q386,138 418,191 Q450,152 480,190 Q512,142 542,196 Q566,152 580,192 L580,90 L-20,90 Z" fill="url(#glCanopyTop)"/>
        <path d="M-20,205 Q6,148 36,194 Q60,152 90,190 Q122,140 158,196 Q188,150 220,192 Q254,144 288,188 Q322,146 354,193 Q386,138 418,191 Q450,152 480,190 Q512,142 542,196 Q566,152 580,192" fill="none" stroke="#0a1c0c" stroke-width="6"/>
        ${frond(24, 186, -28, .85, true)}${frond(96, 195, -14, 1.1)}${frond(210, 185, 16, .9, true)}${frond(300, 190, -10, 1.25)}${frond(420, 188, 12, 1)}${frond(500, 193, -18, .95, true)}${frond(548, 190, 20, 1.05)}
        ${tuft(70, 195, -8)}${tuft(178, 198, 4)}${tuft(240, 194, -6)}${tuft(360, 197, 8)}${tuft(440, 193, -4)}
        ${vine(70, 152, 46, -8)}${vine(180, 150, 48, 5)}${vine(310, 146, 52, -4)}${vine(440, 152, 46, 7)}
        <circle cx="112" cy="168" r="4.5" fill="url(#glEmber)" class="gl-ember"/>
        <circle cx="260" cy="160" r="4" fill="url(#glEmber)" class="gl-ember"/>
        <circle cx="380" cy="172" r="3.5" fill="url(#glEmber)" class="gl-ember"/>
        <circle cx="470" cy="164" r="4" fill="url(#glEmber)" class="gl-ember"/>`;
    }
    if (theme === 'ice') {
      // Jagged icicle fringe instead of a smooth/organic edge — explicitly
      // angular so it never reads as a snowflake. Icicles hang from the
      // fringe's peak points (~140-146) so they clear y=200 with margin,
      // same safe-zone rule the jungle vines use.
      const icicle = (x, startY, len) => `
        <path transform="translate(${x},${startY})" d="M-6,0 L6,0 L2,${len} L0,${len + 7} L-2,${len} Z" fill="url(#glIceShardGrad)" stroke="#eaf6ff" stroke-width=".5" opacity=".92"/>`;
      const crack = (x, y, rot) => `<path transform="translate(${x},${y}) rotate(${rot})" d="M0,0 L6,-4 M6,-4 L10,-2 M6,-4 L4,-10" fill="none" stroke="#eaf6ff" stroke-width="1" opacity=".5"/>`;
      return `
        <path d="M-20,150 Q70,112 150,140 Q230,106 310,140 Q390,108 470,140 Q540,112 580,148 L580,90 L-20,90 Z" fill="#16222e" opacity=".55" filter="url(#glLeafBlur)"/>
        <path d="M-20,196 L20,144 L54,192 L88,140 L122,194 L156,142 L190,196 L224,144 L258,192 L292,140 L326,196 L360,144 L394,192 L428,142 L462,196 L496,144 L530,192 L564,146 L580,190 L580,90 L-20,90 Z" fill="url(#glIceTop)"/>
        <path d="M-20,196 L20,144 L54,192 L88,140 L122,194 L156,142 L190,196 L224,144 L258,192 L292,140 L326,196 L360,144 L394,192 L428,142 L462,196 L496,144 L530,192 L564,146 L580,190" fill="none" stroke="#0a1620" stroke-width="4"/>
        ${icicle(20, 144, 48)}${icicle(88, 140, 52)}${icicle(224, 144, 48)}${icicle(360, 144, 50)}${icicle(496, 144, 46)}
        ${crack(60, 178, 10)}${crack(160, 174, -12)}${crack(280, 180, 6)}${crack(420, 176, -8)}
        <circle cx="140" cy="166" r="4" fill="url(#glFrostGlint)" class="gl-ember"/>
        <circle cx="330" cy="160" r="3.6" fill="url(#glFrostGlint)" class="gl-ember"/>
        <circle cx="460" cy="170" r="3.2" fill="url(#glFrostGlint)" class="gl-ember"/>`;
    }
    if (theme === 'ocean') {
      // Gentle wave-crest edge (low, rounded amplitude) instead of jagged or
      // scalloped — reads as water, not foliage or ice. Kelp fronds hang up
      // into the hood band (safe), coral clusters sit on the peaks.
      const kelp = (x, y, rot, scale) => `
        <g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})">
          <path d="M0,0 Q-9,-15 0,-30 Q9,-45 0,-58" fill="none" stroke="url(#glKelpGrad)" stroke-width="7" stroke-linecap="round"/>
        </g>`;
      const coral = (x, y, rot, scale) => `
        <g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})">
          <path d="M0,0 L-4,-15 M0,0 L4,-19 M0,0 L-9,-9" stroke="#e0836b" stroke-width="4" stroke-linecap="round" fill="none"/>
          <circle cx="-4" cy="-15" r="3" fill="#ff9d7f"/><circle cx="4" cy="-19" r="3" fill="#ff9d7f"/><circle cx="-9" cy="-9" r="2.4" fill="#ff9d7f"/>
        </g>`;
      return `
        <path d="M-20,150 Q70,118 150,144 Q230,116 310,144 Q390,118 470,144 Q540,120 580,150 L580,90 L-20,90 Z" fill="#082430" opacity=".55" filter="url(#glLeafBlur)"/>
        <path d="M-20,190 Q20,160 60,188 Q100,158 140,188 Q180,160 220,188 Q260,158 300,188 Q340,160 380,188 Q420,158 460,188 Q500,160 540,188 Q566,168 580,186 L580,90 L-20,90 Z" fill="url(#glOceanTop)"/>
        <path d="M-20,190 Q20,160 60,188 Q100,158 140,188 Q180,160 220,188 Q260,158 300,188 Q340,160 380,188 Q420,158 460,188 Q500,160 540,188 Q566,168 580,186" fill="none" stroke="#041219" stroke-width="6"/>
        ${kelp(100, 186, -6, 1)}${kelp(300, 186, 5, 1.1)}${kelp(470, 186, -4, .9)}
        ${coral(180, 188, -10, 1)}${coral(390, 186, 12, .85)}
        <circle cx="130" cy="168" r="4" fill="url(#glBubbleGlow)" class="gl-ember"/>
        <circle cx="250" cy="158" r="3.4" fill="url(#glBubbleGlow)" class="gl-ember"/>
        <circle cx="420" cy="164" r="3.8" fill="url(#glBubbleGlow)" class="gl-ember"/>`;
    }
    if (theme === 'magic') {
      // Castle-parapet crenellations (rectangular teeth) instead of an
      // organic edge. Lanterns hang from the merlon gaps, capped the same
      // way jungle vines are, so nothing lands behind a bolt.
      const lantern = (x, startY, len) => `
        <g transform="translate(${x},${startY})">
          <line x1="0" y1="0" x2="0" y2="${len - 16}" stroke="#3a2f1a" stroke-width="2"/>
          <rect x="-7" y="${len - 16}" width="14" height="18" rx="2" fill="#241c12" stroke="#ffe066" stroke-width="1.4"/>
          <circle cx="0" cy="${len - 7}" r="5" fill="url(#glLanternGlow)"/>
        </g>`;
      return `
        <path d="M-20,150 Q80,108 200,148 Q320,108 440,148 Q520,120 580,150 L580,90 L-20,90 Z" fill="#150c22" opacity=".55" filter="url(#glLeafBlur)"/>
        <path d="M-20,196 L-20,150 L20,150 L20,180 L60,180 L60,144 L100,144 L100,180 L140,180 L140,152 L180,152 L180,180 L220,180 L220,146 L260,146 L260,180 L300,180 L300,152 L340,152 L340,180 L380,180 L380,146 L420,146 L420,180 L460,180 L460,152 L500,152 L500,180 L540,180 L540,148 L580,148 L580,90 L-20,90 Z" fill="url(#glCastleTop)"/>
        <path d="M-20,196 L-20,150 L20,150 L20,180 L60,180 L60,144 L100,144 L100,180 L140,180 L140,152 L180,152 L180,180 L220,180 L220,146 L260,146 L260,180 L300,180 L300,152 L340,152 L340,180 L380,180 L380,146 L420,146 L420,180 L460,180 L460,152 L500,152 L500,180 L540,180 L540,148 L580,148" fill="none" stroke="#08050e" stroke-width="4"/>
        ${lantern(40, 150, 46)}${lantern(160, 152, 42)}${lantern(280, 146, 48)}${lantern(400, 146, 44)}${lantern(520, 152, 40)}
        <circle cx="90" cy="170" r="3" fill="url(#glDustMote)" class="gl-ember"/>
        <circle cx="240" cy="165" r="2.6" fill="url(#glDustMote)" class="gl-ember"/>
        <circle cx="360" cy="172" r="3.2" fill="url(#glDustMote)" class="gl-ember"/>
        <circle cx="470" cy="166" r="2.8" fill="url(#glDustMote)" class="gl-ember"/>`;
    }
    const asteroid = (x, y, rot, scale) => `
      <g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})">
        <path d="M0,-14 L11,-9 L14,3 L6,13 L-8,12 L-14,0 L-8,-12 Z" fill="#3a4356"/>
        <circle cx="-2" cy="-2" r="2.4" fill="#262b38"/><circle cx="4" cy="4" r="1.8" fill="#262b38"/>
      </g>`;
    return `
        <path d="M-20,215 Q280,120 580,215 L580,90 L-20,90 Z" fill="url(#glMetalTop)"/>
        <path d="M-20,215 Q280,120 580,215" fill="none" stroke="#05090f" stroke-width="6"/>
        ${asteroid(70, 155, -10, 1)}${asteroid(470, 150, 18, .8)}${asteroid(250, 130, 8, .6)}
        <circle cx="110" cy="140" r="1.6" fill="#cfe8ff" class="gl-ember"/>
        <circle cx="400" cy="135" r="1.4" fill="#cfe8ff" class="gl-ember"/>
        <circle cx="320" cy="165" r="1.2" fill="#cfe8ff" class="gl-ember"/>
        <circle cx="180" cy="175" r="1.3" fill="#cfe8ff" class="gl-ember"/>
        <circle cx="450" cy="180" r="1.1" fill="#cfe8ff" class="gl-ember"/>`;
  }

  function crystalMarkup(theme) {
    if (theme === 'jungle') {
      return `
      <g id="gridlock-crystal" class="gl-crystal-shell">
        <circle cx="280" cy="148" r="42" class="gl-crystal-halo"/>
        <path d="M280,110 C300,110 313,128 313,150 C313,172 298,188 280,190 C262,188 247,172 247,150 C247,128 260,110 280,110 Z" class="gl-crystal-frame"/>
        <path d="M280,120 C295,120 305,133 305,150 C305,167 293,180 280,181 C267,180 255,167 255,150 C255,133 265,120 280,120 Z" class="gl-crystal-core"/>
        <path d="M280,128 C286,140 286,160 280,172 C274,160 274,140 280,128 Z" class="gl-crystal-facet"/>
        <circle cx="280" cy="150" r="6" class="gl-crystal-center"/>
      </g>`;
    }
    if (theme === 'ice') {
      // Angular faceted shard — deliberately not a 6-point radial snowflake.
      return `
      <g id="gridlock-crystal" class="gl-crystal-shell">
        <circle cx="280" cy="148" r="42" class="gl-crystal-halo"/>
        <polygon points="280,108 300,124 308,148 300,172 280,190 260,172 252,148 260,124" class="gl-crystal-frame"/>
        <polygon points="280,118 294,130 300,148 294,166 280,180 266,166 260,148 266,130" class="gl-crystal-core"/>
        <path d="M280,124 L288,148 L280,172 L272,148 Z" class="gl-crystal-facet"/>
        <circle cx="280" cy="148" r="6" class="gl-crystal-center"/>
      </g>`;
    }
    if (theme === 'ocean') {
      return `
      <g id="gridlock-crystal" class="gl-crystal-shell">
        <circle cx="280" cy="148" r="42" class="gl-crystal-halo"/>
        <path d="M280,112 Q306,118 313,144 Q318,168 296,184 Q280,192 264,184 Q242,168 247,144 Q254,118 280,112 Z" class="gl-crystal-frame"/>
        <ellipse cx="280" cy="150" rx="22" ry="26" class="gl-crystal-core"/>
        <path d="M270,138 Q280,132 290,138" fill="none" stroke-width="2" class="gl-crystal-facet-line"/>
        <circle cx="280" cy="150" r="7" class="gl-crystal-center"/>
      </g>`;
    }
    if (theme === 'magic') {
      return `
      <g id="gridlock-crystal" class="gl-crystal-shell">
        <circle cx="280" cy="148" r="42" class="gl-crystal-halo"/>
        <path d="M258,120 L280,100 L302,120" fill="none" stroke="#8a6a1a" stroke-width="2" opacity=".7"/>
        <polygon points="280,106 300,128 296,172 280,192 264,172 260,128" class="gl-crystal-frame"/>
        <polygon points="280,118 292,133 289,165 280,180 271,165 268,133" class="gl-crystal-core"/>
        <path d="M280,124 L286,148 L280,172 L274,148 Z" class="gl-crystal-facet"/>
        <circle cx="280" cy="148" r="6" class="gl-crystal-center"/>
        <path d="M258,176 L280,196 L302,176" fill="none" stroke="#8a6a1a" stroke-width="2" opacity=".7"/>
      </g>`;
    }
    return `
      <g id="gridlock-crystal" class="gl-crystal-shell">
        <circle cx="280" cy="148" r="42" class="gl-crystal-halo"/>
        <polygon points="280,112 311,130 311,166 280,184 249,166 249,130" class="gl-crystal-frame"/>
        <polygon points="280,120 302,133 302,159 280,172 258,159 258,133" class="gl-crystal-core"/>
        <path d="M280,126 L291,147 L280,168 L269,147 Z" class="gl-crystal-facet"/>
        <circle cx="280" cy="148" r="7" class="gl-crystal-center"/>
      </g>`;
  }

  function host() { return document.getElementById(hostId); }

  function playMenuSound() {
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect();
  }

  function alignPuzzleAnchors(layout) {
    layout.sinks.forEach(sink => {
      const bolt = document.getElementById(`gridlock-bolt-${sink.bolt}`);
      if (bolt) {
        const placement = sink.side === 'w'
          ? { x: sink.x - 26, y: sink.y, rotation: -90 }
          : sink.side === 'e'
            ? { x: sink.x + 26, y: sink.y, rotation: 90 }
            : sink.side === 's'
              ? { x: sink.x, y: sink.y + 26, rotation: 180 }
              : { x: sink.x, y: sink.y - 26, rotation: 0 };
        bolt.setAttribute('transform', `translate(${placement.x},${placement.y}) rotate(${placement.rotation})`);
        const isGreen = layout.systems[sink.system] && layout.systems[sink.system].color === 'green';
        bolt.classList.toggle('is-programmable', sink.programmable);
        bolt.classList.toggle('is-unassigned', sink.programmable);
        bolt.classList.toggle('is-green', !sink.programmable && isGreen);
        bolt.classList.toggle('is-cyan', !sink.programmable && !isGreen);
      }
    });
    const gauge = document.getElementById('gridlock-gauge');
    if (gauge) gauge.setAttribute('transform', `translate(${layout.board.x + layout.board.width / 2 - 110},${layout.board.y + layout.board.height + 52})`);
    const housing = document.getElementById('gridlock-housing');
    const housingInner = document.getElementById('gridlock-housing-inner');
    const outerMargin = 8;
    const innerMargin = 3;
    const housingX = layout.board.x - outerMargin;
    const housingY = layout.board.y - outerMargin;
    const housingWidth = layout.board.width + outerMargin * 2;
    const housingHeight = layout.board.height + outerMargin * 2;
    if (housing) {
      housing.setAttribute('x', housingX);
      housing.setAttribute('y', housingY);
      housing.setAttribute('width', housingWidth);
      housing.setAttribute('height', housingHeight);
    }
    if (housingInner) {
      housingInner.setAttribute('x', housingX + innerMargin);
      housingInner.setAttribute('y', housingY + innerMargin);
      housingInner.setAttribute('width', housingWidth - innerMargin * 2);
      housingInner.setAttribute('height', housingHeight - innerMargin * 2);
    }
  }

  function selectedLevel() { return GridLockLevels.get(selectedLevelId) || GridLockLevels.get(GridLockLevels.firstId); }
  function worldIdForLevel(levelId) {
    const level = GridLockLevels.get(levelId);
    return level ? level.worldId : null;
  }
  function navigationDestination(levelId, isDebug) {
    return { screen: isDebug ? 'debug' : 'world', worldId: worldIdForLevel(levelId) };
  }
  function selectedWorld() {
    const worldId = selectedWorldId || worldIdForLevel(selectedLevelId);
    return GridLockLevels.worlds.find(world => world.id === worldId) || GridLockLevels.worlds[0];
  }

  function renderWorldMap() {
    const root = host();
    if (!root || !active) return;
    const worlds = GridLockLevels.worlds.map((world, index) => {
      const firstLevel = world.levels[0];
      const unlocked = GridLockProgression.isUnlocked(firstLevel.id);
      const completed = world.levels.every(level => GridLockProgression.isCompleted(level.id));
      const completedCount = world.levels.filter(level => GridLockProgression.isCompleted(level.id)).length;
      const status = completed ? 'COMPLETE' : unlocked ? 'AVAILABLE' : 'LOCKED';
      return `<button class="gridlock-world-node ${unlocked ? 'is-unlocked' : 'is-locked'} ${completed ? 'is-complete' : ''}" type="button" data-gl-theme="${themeFor(world.id)}" ${unlocked ? `onclick="gridLockOpenWorld('${world.id}')"` : 'disabled'}>
        ${themeIcon(world.id)}
        <strong>${displayNameFor(world.id)}</strong><em>${status}${unlocked && !completed ? ` · ${completedCount}/${world.levels.length} CLEAR` : ''}</em>
        ${completed ? '<i class="gridlock-world-check" aria-hidden="true">✓</i>' : ''}
        ${!unlocked ? '<i class="gridlock-world-lock" aria-hidden="true"></i>' : ''}
      </button>`;
    }).join('');
    root.innerHTML = `
      <main class="gridlock-world-map" aria-labelledby="gridlock-world-map-title">
        <header class="gridlock-cockpit-header">
          <button type="button" class="arcade-tier-back" onclick="nav('lobby')">◀ ARCADE</button>
          <div><strong id="gridlock-world-map-title">WORLD MAP</strong></div>
          <button type="button" class="gridlock-debug-trigger" onclick="gridLockOpenDebugMenu()">DEBUG</button>
        </header>
        <section class="gridlock-world-map-panel" aria-label="Grid Lock worlds">
          <div class="gridlock-map-heading"><strong>SELECT A WORLD</strong></div>
          <div class="gridlock-world-nodes">${worlds}</div>
        </section>
        <footer class="gridlock-cockpit-footer">COMPLETE A WORLD TO UNLOCK THE NEXT.</footer>
      </main>`;
  }

  function renderDebugMenu() {
    const root = host();
    if (!root || !active) return;
    const worlds = GridLockLevels.worlds.map((world, worldIndex) => `
      <section class="gridlock-debug-world">
        <span>WORLD ${worldIndex + 1}</span><strong>${world.name}</strong>
        <div>${world.levels.map(level => `<button type="button" onclick="gridLockDebugOpenLevel('${level.id}')">${level.order}. ${level.name}<small>${level.size.columns}×${level.size.rows}</small></button>`).join('')}</div>
      </section>`).join('');
    root.innerHTML = `
      <main class="gridlock-world-map" aria-labelledby="gridlock-debug-title">
        <header class="gridlock-cockpit-header">
          <button type="button" onclick="gridLockReturnToWorldMap()">◀ MAP</button>
          <div><span>DEVELOPMENT ACCESS</span><strong id="gridlock-debug-title">DEBUG LEVELS</strong></div>
          <span class="gridlock-cockpit-status">${GridLockLevels.all.length} LEVELS</span>
        </header>
        <section class="gridlock-debug-panel" aria-label="Grid Lock debug level selector">
          <div class="gridlock-map-heading"><span>PLAY ANY GENERATED RECIPE</span><strong>DEBUG MODE</strong></div>
          ${worlds}
        </section>
        <footer class="gridlock-cockpit-footer">DEBUG RUNS DO NOT CHANGE COMPLETION OR UNLOCKS.</footer>
      </main>`;
  }

  function renderCockpit() {
    const root = host();
    if (!root || !active) return;
    const world = selectedWorld();
    // A plain wrapping grid of relay nodes — no connecting line. The
    // winding path drew a line through node centers, which visually cut
    // across the circles, and the tall single-file zigzag burned a lot of
    // vertical space for little payoff. A grid reads clearly at a glance
    // and needs no coordinate math to get right.
    const nodes = world.levels.map((level, index) => {
      const unlocked = GridLockProgression.isUnlocked(level.id);
      const completed = GridLockProgression.isCompleted(level.id);
      return `<button class="gridlock-path-node ${completed ? 'is-complete' : ''} ${unlocked ? 'is-unlocked' : 'is-locked'}" type="button" ${unlocked ? `onclick="gridLockOpenLevel('${level.id}')"` : 'disabled'} aria-label="Level ${index + 1}${completed ? ', complete' : unlocked ? '' : ', locked'}">
        <span>${completed ? '✓' : index + 1}</span>
        ${!unlocked ? '<i class="gridlock-path-lock" aria-hidden="true"></i>' : ''}
      </button>`;
    }).join('');
    root.innerHTML = `
      <main class="gridlock-cockpit" aria-labelledby="gridlock-cockpit-title" data-gl-theme="${themeFor(world.id)}">
        <header class="gridlock-cockpit-header">
          <button type="button" onclick="gridLockReturnToWorldMap()">◀ WORLDS</button>
          <div><span>LOCAL GRID · ${displayNameFor(world.id).toUpperCase()}</span><strong id="gridlock-cockpit-title">GRID LOCK</strong></div>
          <span class="gridlock-cockpit-status">MAP ONLINE</span>
        </header>
        <section class="gridlock-world-panel">
          <div class="gridlock-world-copy"><span>WORLD ${GridLockLevels.worlds.indexOf(world) + 1}</span><strong>${displayNameFor(world.id)}</strong></div>
          <div class="gridlock-world-core" aria-hidden="true"><i></i><b></b></div>
        </section>
        <section class="gridlock-map-panel" aria-label="Grid Lock level map">
          <div class="gridlock-map-heading"><span>WORLD ${GridLockLevels.worlds.indexOf(world) + 1} · ${world.levels.length} LEVELS</span><strong>SELECT A LEVEL</strong></div>
          <div class="gridlock-map-nodes">${nodes}</div>
        </section>
        <footer class="gridlock-cockpit-footer">COMPLETED LEVELS REMAIN AVAILABLE FOR NEW GENERATED RUNS.</footer>
      </main>`;
  }

  // ---- Puzzle mission screen ------------------------------------------------

  function renderPuzzle() {
    const root = host();
    if (!root || !active) return;
    const level = selectedLevel();
    const worldNumber = GridLockLevels.worlds.findIndex(world => world.id === level.worldId) + 1;
    const theme = themeFor(level.worldId);
    const showWorldIntro = level.order === 1;
    const puzzleLayout = GridLock.layoutFor(level);
    const introSpot = showWorldIntro ? introSpotlightMarkup(level, puzzleLayout) : { markup: '', active: false };
    const sourceMarkup = puzzleLayout.sources.map((source, sourceIndex) => `
      <g id="gridlock-source-${sourceIndex}" class="gridlock-source-port ${puzzleLayout.systems[sourceIndex].color === 'green' ? 'is-green' : 'is-cyan'}"
        transform="translate(${source.x},${puzzleLayout.board.y + puzzleLayout.board.height + 31})">
        <line class="gl-source-stub" x1="0" y1="-31" x2="0" y2="-16"/>
        <polygon class="gl-source-port-housing" points="0,-19 24,-7 24,17 0,30 -24,17 -24,-7"/>
        <polygon class="gl-source-port-inner" points="0,-12 16,-4 16,12 0,21 -16,12 -16,-4"/>
        <rect class="gl-source-port-pin" x="-6" y="-23" width="12" height="25" rx="4"/>
        <circle class="gl-source-port-lamp" cx="0" cy="2" r="5"/>
        <path class="gl-source-port-bars" d="M-10,9 H10 M-13,15 H13 M-9,21 H9"/>
        ${theme === 'jungle' ? '<g class="gl-leaf-accent"><path d="M-22,-14 q-7,-9 2,-16 q9,4 5,16 Z"/><path d="M-15,-11 q6,-6 3,-14 q-8,1 -3,14 Z" opacity=".7"/></g>' : ''}
        ${theme === 'ice' ? '<g class="gl-ice-accent"><path d="M-20,-30 l5,10 l-5,10 l-5,-10 Z"/></g>' : ''}
        ${theme === 'ocean' ? '<g class="gl-coral-accent"><path d="M-20,-14 L-24,-28 M-20,-14 L-15,-30" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="-24" cy="-28" r="2.4"/><circle cx="-15" cy="-30" r="2.4"/></g>' : ''}
        ${theme === 'magic' ? '<g class="gl-lantern-accent"><circle cx="-20" cy="-20" r="4"/></g>' : ''}
      </g>`).join('');
    const boltMarkup = puzzleLayout.sinks.map(sink => `
      <g id="gridlock-bolt-${sink.bolt}" class="gridlock-bolt${sink.programmable ? ' is-programmable is-unassigned' : ''}" onclick="gridLockToggleBolt(${sink.bolt})">
        <line class="gl-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
        <rect class="gl-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
        <rect class="gl-bolt-pin" x="-6" y="-2" width="12" height="30"/>
        <circle class="gl-bolt-lamp" cx="0" cy="-4" r="5"/>
        ${sink.programmable ? `<g class="gl-bolt-switch" transform="translate(0,-23)"><rect x="-10" y="-5" width="20" height="10" rx="5"/><circle id="gridlock-bolt-switch-knob-${sink.bolt}" cx="0" cy="0" r="3"/></g>` : ''}
        ${theme === 'jungle' ? '<g class="gl-leaf-accent"><path d="M-15,-18 q-7,-9 2,-16 q9,4 5,16 Z"/><path d="M-8,-16 q6,-5 3,-13 q-8,1 -3,13 Z" opacity=".7"/></g>' : ''}
        ${theme === 'ice' ? '<g class="gl-ice-accent"><path d="M-14,-24 l5,9 l-5,9 l-5,-9 Z"/></g>' : ''}
        ${theme === 'ocean' ? '<g class="gl-coral-accent"><path d="M-14,-16 L-18,-28 M-14,-16 L-9,-30" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="-18" cy="-28" r="2.2"/><circle cx="-9" cy="-30" r="2.2"/></g>' : ''}
        ${theme === 'magic' ? '<g class="gl-lantern-accent"><circle cx="-14" cy="-22" r="3.6"/></g>' : ''}
      </g>`).join('');
    root.innerHTML = `
      <main class="gridlock-mission-screen" data-gl-theme="${themeFor(level.worldId)}">
        <header>
          <button type="button" class="gridlock-map-back" onclick="gridLockReturnToMap()">◀ ${debugMode ? 'DEBUG' : 'MAP'}</button>
          <strong>WORLD ${worldNumber} · LEVEL ${level.order}</strong>
          <div class="gridlock-board-actions">
            <button id="gridlock-undo" type="button" onclick="gridLockUndo()" disabled>UNDO</button>
            <button id="gridlock-reset" type="button" onclick="gridLockReset()" disabled>RESET</button>
          </div>
        </header>
        <div id="gridlock-stage" class="gridlock-stage is-paused${introSpot.active ? ' has-gl-spotlight' : ''}" aria-label="Route power through the conduit grid to unlock it">
          <svg class="gridlock-svg" viewBox="0 92 560 728" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="glMetalTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#28323f"/><stop offset="18%" stop-color="#1a222d"/><stop offset="100%" stop-color="#0c1119"/>
              </linearGradient>
              <radialGradient id="glCore" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#e6a24d"/><stop offset="45%" stop-color="#a5641f"/><stop offset="100%" stop-color="#4a2a08" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="glCrys" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#dff4ff"/><stop offset="45%" stop-color="#7fbfe6"/><stop offset="100%" stop-color="#4b53c9"/>
              </radialGradient>
              <radialGradient id="glCrysJungle" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#f6ffe6"/><stop offset="45%" stop-color="#8fe07a"/><stop offset="100%" stop-color="#5c8a1f"/>
              </radialGradient>
              <radialGradient id="glCrysIce" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#ffffff"/><stop offset="45%" stop-color="#bfe9ff"/><stop offset="100%" stop-color="#3a6a8c"/>
              </radialGradient>
              <radialGradient id="glCrysOcean" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#eafffa"/><stop offset="45%" stop-color="#4fd8c4"/><stop offset="100%" stop-color="#14506b"/>
              </radialGradient>
              <radialGradient id="glCrysMagic" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#f3e8ff"/><stop offset="45%" stop-color="#b98bff"/><stop offset="100%" stop-color="#4a2a7a"/>
              </radialGradient>
              <radialGradient id="glHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#8ea6d8" stop-opacity=".55"/><stop offset="100%" stop-color="#8ea6d8" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="glIce" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#cfe6f2" stop-opacity=".9"/><stop offset="100%" stop-color="#7fa2b8" stop-opacity=".2"/>
              </linearGradient>
              <linearGradient id="glCanopyTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#1c3a1e"/><stop offset="40%" stop-color="#12280f"/><stop offset="100%" stop-color="#081505"/>
              </linearGradient>
              <linearGradient id="glLeafGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="#3d6e2f"/><stop offset="55%" stop-color="#6fae54"/><stop offset="100%" stop-color="#a8e690"/>
              </linearGradient>
              <radialGradient id="glEmber" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#ffd98a"/><stop offset="60%" stop-color="#e0a542" stop-opacity=".8"/><stop offset="100%" stop-color="#e0a542" stop-opacity="0"/>
              </radialGradient>
              <filter id="glLeafBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
              <filter id="glBackBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
              <pattern id="glVineBorder" width="40" height="16" patternUnits="userSpaceOnUse">
                <rect width="40" height="16" fill="#1c150c"/>
                <rect x="0" y="0" width="19" height="16" fill="#241b0f"/><rect x="20" y="0" width="19" height="16" fill="#2a2013"/>
                <path d="M2,12 q6,-8 10,0 q4,6 10,-2" fill="none" stroke="#5c9a4a" stroke-width="2" stroke-linecap="round" opacity=".85"/>
                <circle cx="8" cy="5" r="2.4" fill="#3d6e2f" opacity=".7"/><circle cx="30" cy="10" r="2" fill="#3d6e2f" opacity=".6"/>
              </pattern>
              <pattern id="glVineFill" width="26" height="26" patternUnits="userSpaceOnUse">
                <rect width="26" height="26" fill="#16240f"/>
                <path d="M0,14 Q7,4 13,14 Q19,24 26,14" fill="none" stroke="#5c9a4a" stroke-width="1.8"/>
                <path d="M0,6 Q7,16 13,6" fill="none" stroke="#3a6b32" stroke-width="1.3"/>
                <circle cx="20" cy="20" r="3" fill="#3d6e2f" opacity=".6"/><circle cx="5" cy="21" r="2" fill="#3d6e2f" opacity=".5"/>
              </pattern>
              <pattern id="glJunglePatternBack" width="170" height="170" patternUnits="userSpaceOnUse" patternTransform="rotate(9)">
                <rect width="170" height="170" fill="#0a1608"/>
                <ellipse cx="42" cy="64" rx="50" ry="36" fill="#123016" opacity=".6"/>
                <ellipse cx="128" cy="30" rx="42" ry="32" fill="#0f2a12" opacity=".55"/>
                <ellipse cx="96" cy="128" rx="54" ry="38" fill="#112c14" opacity=".55"/>
                <ellipse cx="10" cy="140" rx="34" ry="26" fill="#0e2711" opacity=".5"/>
              </pattern>
              <pattern id="glJunglePattern" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
                <path d="M18,60 C10,50 9,36 20,24 C29,36 27,50 18,60 Z" fill="#5c9a4a" opacity=".45"/>
                <path d="M60,26 C54,18 53,8 61,2 C68,9 67,19 60,26 Z" fill="#6fae54" opacity=".4"/>
                <path d="M44,72 C40,66 41,58 48,54 C53,59 52,67 44,72 Z" fill="#3d6e2f" opacity=".38"/>
                <path d="M4,14 Q10,4 20,10 Q26,14 34,6" fill="none" stroke="#3d6e34" stroke-width="1.6" opacity=".5"/>
                <path d="M46,44 Q52,36 62,42" fill="none" stroke="#3d6e34" stroke-width="1.4" opacity=".45"/>
                <circle cx="66" cy="58" r="2.2" fill="#e0a542" opacity=".65"/>
                <circle cx="12" cy="42" r="1.6" fill="#e0a542" opacity=".55"/>
              </pattern>
              <pattern id="glJungleBigLeaf" width="160" height="160" patternUnits="userSpaceOnUse" patternTransform="rotate(4)">
                <g transform="translate(40,120) rotate(-15)">
                  <path d="M0,0 C-20,-15 -23,-48 0,-74 C23,-48 20,-15 0,0 Z" fill="url(#glLeafGrad)" opacity=".5"/>
                  <path d="M0,-6 L0,-66" stroke="#173a12" stroke-width="1.6" opacity=".4"/>
                </g>
                <g transform="translate(120,50) rotate(20) scale(.75)">
                  <path d="M0,0 C-20,-15 -23,-48 0,-74 C23,-48 20,-15 0,0 Z" fill="url(#glLeafGrad)" opacity=".42"/>
                  <path d="M0,-6 L0,-66" stroke="#173a12" stroke-width="1.6" opacity=".35"/>
                </g>
              </pattern>
              <pattern id="glJunglePatternFront" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
                <circle cx="8" cy="10" r="1.3" fill="#c8f79a" opacity=".4"/>
                <circle cx="24" cy="22" r="1" fill="#e0a542" opacity=".45"/>
                <path d="M18,4 q4,-3 6,1 q-4,3 -6,-1 Z" fill="#6fae54" opacity=".35"/>
                <path d="M2,26 q4,-3 6,1 q-4,3 -6,-1 Z" fill="#8fe07a" opacity=".3"/>
              </pattern>

              <!-- Space: asteroids + stars -->
              <pattern id="glSpacePatternBack" width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(11)">
                <rect width="180" height="180" fill="#050a14"/>
                <ellipse cx="45" cy="60" rx="55" ry="40" fill="#132a44" opacity=".5"/>
                <ellipse cx="130" cy="34" rx="46" ry="34" fill="#1a1f44" opacity=".45"/>
                <ellipse cx="100" cy="135" rx="58" ry="40" fill="#152640" opacity=".45"/>
              </pattern>
              <pattern id="glSpacePattern" width="90" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-5)">
                <circle cx="14" cy="20" r="1.4" fill="#cfe8ff" opacity=".8"/><circle cx="60" cy="10" r="1" fill="#9fc9ff" opacity=".6"/>
                <circle cx="40" cy="55" r="1.6" fill="#eaf4ff" opacity=".85"/><circle cx="76" cy="68" r="1" fill="#9fc9ff" opacity=".55"/>
                <path d="M14,72 l-8,4 M10,68 l0,10" stroke="#cfe8ff" stroke-width="1" opacity=".5"/>
                <path d="M50,30 C46,26 46,20 52,17 C57,21 56,27 50,30 Z" fill="#4a5568" opacity=".55"/>
              </pattern>
              <pattern id="glSpaceBigRock" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(6)">
                <g transform="translate(50,140) rotate(-10)">
                  <path d="M0,-24 L18,-16 L24,4 L10,22 L-14,20 L-24,0 L-14,-20 Z" fill="#3a4356" opacity=".5"/>
                  <circle cx="-4" cy="-4" r="4" fill="#2a3040" opacity=".6"/><circle cx="8" cy="6" r="3" fill="#2a3040" opacity=".5"/>
                </g>
                <g transform="translate(150,55) rotate(20) scale(.7)">
                  <path d="M0,-24 L18,-16 L24,4 L10,22 L-14,20 L-24,0 L-14,-20 Z" fill="#333a4a" opacity=".45"/>
                  <circle cx="-4" cy="-4" r="4" fill="#242938" opacity=".55"/>
                </g>
              </pattern>
              <pattern id="glSpaceFront" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
                <circle cx="8" cy="10" r="1" fill="#ffffff" opacity=".7"/><circle cx="28" cy="24" r="1.3" fill="#dff0ff" opacity=".8"/><circle cx="18" cy="34" r=".8" fill="#ffffff" opacity=".55"/>
              </pattern>

              <!-- Ice: frost + faceted shards (no snowflakes) -->
              <linearGradient id="glIceShardGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="#3a6a8c"/><stop offset="55%" stop-color="#8fc4dc"/><stop offset="100%" stop-color="#eaf6ff"/>
              </linearGradient>
              <linearGradient id="glIceTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#1c3244"/><stop offset="40%" stop-color="#122636"/><stop offset="100%" stop-color="#0a1620"/>
              </linearGradient>
              <radialGradient id="glFrostGlint" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#ffffff"/><stop offset="60%" stop-color="#bfe9ff" stop-opacity=".8"/><stop offset="100%" stop-color="#bfe9ff" stop-opacity="0"/>
              </radialGradient>
              <pattern id="glIcePatternBack" width="175" height="175" patternUnits="userSpaceOnUse" patternTransform="rotate(7)">
                <rect width="175" height="175" fill="#0c1620"/>
                <ellipse cx="44" cy="60" rx="52" ry="38" fill="#1c3244" opacity=".5"/>
                <ellipse cx="126" cy="32" rx="44" ry="32" fill="#193040" opacity=".45"/>
                <ellipse cx="96" cy="130" rx="56" ry="38" fill="#1a2e3e" opacity=".45"/>
              </pattern>
              <pattern id="glIcePattern" width="82" height="82" patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
                <path d="M16,18 L24,30 L16,42 L8,30 Z" fill="#7fa8c0" opacity=".4"/>
                <path d="M56,50 L62,58 L56,66 L50,58 Z" fill="#9fc4d8" opacity=".38"/>
                <path d="M4,58 Q10,50 18,56" fill="none" stroke="#cfe8f5" stroke-width="1.3" opacity=".5"/>
                <path d="M46,16 Q52,8 60,14" fill="none" stroke="#cfe8f5" stroke-width="1.2" opacity=".45"/>
                <circle cx="66" cy="30" r="1.6" fill="#eaf6ff" opacity=".6"/><circle cx="30" cy="66" r="1.3" fill="#eaf6ff" opacity=".55"/>
              </pattern>
              <pattern id="glIceBigShard" width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(3)">
                <g transform="translate(46,130) rotate(-8)"><path d="M0,-30 L16,-14 L20,10 L4,28 L-16,22 L-22,-4 Z" fill="url(#glIceShardGrad)" opacity=".4"/></g>
                <g transform="translate(140,50) rotate(16) scale(.7)"><path d="M0,-30 L16,-14 L20,10 L4,28 L-16,22 L-22,-4 Z" fill="url(#glIceShardGrad)" opacity=".34"/></g>
              </pattern>
              <pattern id="glIceFront" width="38" height="38" patternUnits="userSpaceOnUse" patternTransform="rotate(-10)">
                <circle cx="8" cy="10" r="1.1" fill="#eaf6ff" opacity=".7"/><circle cx="26" cy="24" r="1.4" fill="#dff0ff" opacity=".75"/><circle cx="16" cy="32" r=".9" fill="#ffffff" opacity=".6"/>
              </pattern>

              <!-- Ocean: rocks + coral -->
              <linearGradient id="glOceanTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#0e3444"/><stop offset="40%" stop-color="#082632"/><stop offset="100%" stop-color="#041219"/>
              </linearGradient>
              <linearGradient id="glKelpGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="#2f6e4f"/><stop offset="100%" stop-color="#6fae7a"/>
              </linearGradient>
              <radialGradient id="glBubbleGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#eafffa"/><stop offset="60%" stop-color="#4fd8c4" stop-opacity=".75"/><stop offset="100%" stop-color="#4fd8c4" stop-opacity="0"/>
              </radialGradient>
              <pattern id="glOceanPatternBack" width="175" height="175" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
                <rect width="175" height="175" fill="#051a22"/>
                <ellipse cx="44" cy="60" rx="52" ry="38" fill="#0e3a44" opacity=".5"/>
                <ellipse cx="126" cy="32" rx="44" ry="32" fill="#0a3038" opacity=".45"/>
                <ellipse cx="96" cy="130" rx="56" ry="38" fill="#0c3640" opacity=".45"/>
              </pattern>
              <pattern id="glOceanPattern" width="84" height="84" patternUnits="userSpaceOnUse" patternTransform="rotate(-5)">
                <path d="M18,60 L14,44 M18,60 L24,42 M18,60 L10,50" stroke="#e0836b" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".55"/>
                <circle cx="14" cy="44" r="2" fill="#ff9d7f" opacity=".6"/><circle cx="24" cy="42" r="2" fill="#ff9d7f" opacity=".55"/>
                <path d="M56,20 L60,32 L50,36 L46,24 Z" fill="#4a5a52" opacity=".45"/>
                <circle cx="68" cy="60" r="1.6" fill="#eafffa" opacity=".5"/><circle cx="36" cy="14" r="1.2" fill="#eafffa" opacity=".45"/>
              </pattern>
              <pattern id="glOceanBigCoral" width="190" height="190" patternUnits="userSpaceOnUse" patternTransform="rotate(5)">
                <g transform="translate(48,135) rotate(-8) scale(1.2)">
                  <path d="M0,0 L-6,-24 M0,0 L6,-30 M0,0 L-14,-14 M0,0 L12,-16" stroke="#c96b52" stroke-width="5" stroke-linecap="round" fill="none" opacity=".4"/>
                  <circle cx="-6" cy="-24" r="4" fill="#ff9d7f" opacity=".4"/><circle cx="6" cy="-30" r="4" fill="#ff9d7f" opacity=".4"/>
                </g>
                <g transform="translate(140,55) rotate(14) scale(.8)">
                  <path d="M0,-26 L18,-14 L22,8 L6,26 L-16,20 L-22,-6 Z" fill="#3a5a54" opacity=".4"/>
                </g>
              </pattern>
              <pattern id="glOceanFront" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-10)">
                <circle cx="8" cy="10" r="1.2" fill="#eafffa" opacity=".6"/><circle cx="26" cy="24" r="1.5" fill="#cdf7ef" opacity=".65"/><circle cx="16" cy="32" r="1" fill="#ffffff" opacity=".5"/>
              </pattern>

              <!-- Magic: dust motes + lanterns -->
              <linearGradient id="glCastleTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#241833"/><stop offset="40%" stop-color="#170f24"/><stop offset="100%" stop-color="#08050e"/>
              </linearGradient>
              <radialGradient id="glLanternGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#fffbe0"/><stop offset="55%" stop-color="#ffe066" stop-opacity=".85"/><stop offset="100%" stop-color="#ffe066" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="glDustMote" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#e6d4ff"/><stop offset="60%" stop-color="#b98bff" stop-opacity=".8"/><stop offset="100%" stop-color="#b98bff" stop-opacity="0"/>
              </radialGradient>
              <pattern id="glMagicPatternBack" width="178" height="178" patternUnits="userSpaceOnUse" patternTransform="rotate(10)">
                <rect width="178" height="178" fill="#0e0818"/>
                <ellipse cx="44" cy="60" rx="52" ry="38" fill="#241a38" opacity=".5"/>
                <ellipse cx="126" cy="32" rx="44" ry="32" fill="#1e1530" opacity=".45"/>
                <ellipse cx="96" cy="130" rx="56" ry="38" fill="#20172f" opacity=".45"/>
              </pattern>
              <pattern id="glMagicPattern" width="86" height="86" patternUnits="userSpaceOnUse" patternTransform="rotate(-7)">
                <path d="M18,20 L24,14 L30,20 L24,26 Z" fill="#b98bff" opacity=".4"/>
                <path d="M58,52 L63,47 L68,52 L63,57 Z" fill="#f0c860" opacity=".38"/>
                <path d="M6,58 Q14,50 22,56 Q28,60 36,54" fill="none" stroke="#8a6acf" stroke-width="1.2" opacity=".45"/>
                <circle cx="66" cy="26" r="1.6" fill="#e6d4ff" opacity=".6"/><circle cx="30" cy="68" r="1.4" fill="#fff0bd" opacity=".55"/>
              </pattern>
              <pattern id="glMagicBigLantern" width="195" height="195" patternUnits="userSpaceOnUse" patternTransform="rotate(6)">
                <g transform="translate(50,138) rotate(-6) scale(1.1)">
                  <rect x="-9" y="-14" width="18" height="24" rx="3" fill="#241c33" opacity=".45" stroke="#8a6acf" stroke-width="1.2"/>
                  <circle cx="0" cy="-2" r="7" fill="url(#glLanternGlow)" opacity=".55"/>
                </g>
                <path d="M140,40 Q150,30 160,40 Q168,48 178,38" fill="none" stroke="#8a6acf" stroke-width="2" opacity=".3"/>
              </pattern>
              <pattern id="glMagicFront" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-13)">
                <circle cx="8" cy="10" r="1.2" fill="#fff0bd" opacity=".7"/><circle cx="26" cy="24" r="1.4" fill="#e6d4ff" opacity=".7"/><circle cx="16" cy="32" r="1" fill="#ffffff" opacity=".55"/>
              </pattern>

              <!-- Housing-trim and obstacle-fill textures, one pair per theme -->
              <pattern id="glSpaceRivetBorder" width="40" height="16" patternUnits="userSpaceOnUse">
                <rect width="40" height="16" fill="#141b24"/>
                <rect x="0" y="0" width="19" height="16" fill="#1a2330"/><rect x="20" y="0" width="19" height="16" fill="#161e29"/>
                <circle cx="8" cy="5" r="1.8" fill="#4a5a6e"/><circle cx="30" cy="10" r="1.8" fill="#4a5a6e"/>
              </pattern>
              <pattern id="glSpaceDebrisFill" width="26" height="26" patternUnits="userSpaceOnUse">
                <rect width="26" height="26" fill="#161d26"/>
                <path d="M4,4 L14,3 L18,10 L12,18 L3,15 Z" fill="none" stroke="#4a5a6e" stroke-width="1.2" opacity=".6"/>
                <circle cx="20" cy="20" r="1.8" fill="#4a5a6e" opacity=".5"/>
              </pattern>
              <pattern id="glIceBorder" width="40" height="16" patternUnits="userSpaceOnUse">
                <rect width="40" height="16" fill="#0e1c26"/>
                <rect x="0" y="0" width="19" height="16" fill="#152a38"/><rect x="20" y="0" width="19" height="16" fill="#122430"/>
                <path d="M2,12 L8,4 L14,10 L20,3 L26,11 L32,5" fill="none" stroke="#bfe9ff" stroke-width="1.4" opacity=".6"/>
              </pattern>
              <pattern id="glIceFill" width="32" height="32" patternUnits="userSpaceOnUse">
                <rect width="32" height="32" fill="#16262f"/>
                <rect width="32" height="32" fill="url(#glIceShardGrad)" opacity=".4"/>
                <path d="M3,5 L18,14 L27,6" fill="none" stroke="#eaf6ff" stroke-width="1.4" opacity=".6"/>
                <path d="M6,26 L16,19 L28,27" fill="none" stroke="#6a97ae" stroke-width="1.2" opacity=".55"/>
                <path d="M22,4 L28,12 L23,20" fill="none" stroke="#cfe8f5" stroke-width="1.1" opacity=".45"/>
                <path d="M2,16 L9,20 L4,25" fill="none" stroke="#bfe9ff" stroke-width="1" opacity=".4"/>
              </pattern>
              <pattern id="glCoralBorder" width="40" height="16" patternUnits="userSpaceOnUse">
                <rect width="40" height="16" fill="#0a1f24"/>
                <rect x="0" y="0" width="19" height="16" fill="#123038"/><rect x="20" y="0" width="19" height="16" fill="#0e2a30"/>
                <circle cx="8" cy="6" r="2.2" fill="#3a5a52" opacity=".7"/><circle cx="30" cy="10" r="2.6" fill="#3a5a52" opacity=".6"/>
                <path d="M4,12 L6,4 M34,12 L36,5" stroke="#e0836b" stroke-width="1.6" opacity=".55"/>
              </pattern>
              <pattern id="glCoralFill" width="26" height="26" patternUnits="userSpaceOnUse">
                <rect width="26" height="26" fill="#132622"/>
                <path d="M6,20 L9,10 M6,20 L13,14" stroke="#e0836b" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
                <circle cx="18" cy="8" r="3" fill="#3a5a52" opacity=".6"/><circle cx="9" cy="10" r="1.6" fill="#ff9d7f" opacity=".5"/>
              </pattern>
              <pattern id="glRuneBorder" width="40" height="16" patternUnits="userSpaceOnUse">
                <rect width="40" height="16" fill="#1c1428"/>
                <rect x="0" y="0" width="19" height="16" fill="#241a34"/><rect x="20" y="0" width="19" height="16" fill="#1e1530"/>
                <path d="M6,3 L6,13 M4,5 L8,5 M4,11 L8,11" stroke="#b98bff" stroke-width="1.4" opacity=".6"/>
                <circle cx="30" cy="8" r="1.8" fill="#f0c860" opacity=".65"/>
              </pattern>
              <pattern id="glRuneFill" width="26" height="26" patternUnits="userSpaceOnUse">
                <rect width="26" height="26" fill="#1a1424"/>
                <path d="M8,6 L8,20 M5,9 L11,9 M5,17 L11,17" fill="none" stroke="#8a6acf" stroke-width="1.3" opacity=".5"/>
                <circle cx="19" cy="18" r="2.4" fill="#f0c860" opacity=".55"/>
              </pattern>

              <filter id="glGlowBig" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="18"/></filter>
              <filter id="glSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter>
              <filter id="glFrost" x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="0.14 0.2" numOctaves="3" seed="4" result="n"/>
                <feDisplacementMap in="SourceGraphic" in2="n" scale="10"/></filter>
            </defs>

            ${backdropMarkup(theme)}
            ${hoodMarkup(theme)}
            ${puzzleLayout.sinks.filter(sink => sink.side === 'n').map(sink => `<path class="gl-port-wire" d="M280,174 C280,194 ${sink.x},194 ${sink.x},214"/>`).join('')}
            ${crystalMarkup(theme)}

            ${boltMarkup}

            <rect id="gridlock-housing" x="68" y="244" width="424" height="410" rx="10" fill="#05090f" stroke="#1a2534" stroke-width="3"/>
            <rect id="gridlock-housing-inner" x="76" y="252" width="408" height="394" rx="7" fill="none" stroke="#020509" stroke-width="8" opacity=".7"/>

            ${sourceMarkup}

            <g id="gridlock-gauge" transform="translate(284,768)">
              <text id="gridlock-meter-bolts" x="0" y="-11" class="gl-meter-bolts">BOLTS ONLINE 0 / 3</text>
              <rect x="0" y="0" width="220" height="20" rx="10" class="gl-meter-track"/>
              <rect id="gridlock-meter-fill" x="3" y="3" width="0" height="14" rx="7" class="gl-meter-fill"/>
              <text id="gridlock-system-status" x="220" y="47" text-anchor="end" class="gl-meter-status">SYSTEM FAULT</text>
            </g>

            <!-- conduit tiles injected here -->
            <g id="gridlock-grid"></g>
            ${introSpot.markup}
          </svg>
          <div class="gridlock-scan" aria-hidden="true"></div>
          <div class="gridlock-motif" aria-hidden="true"></div>
          <div class="gridlock-vig" aria-hidden="true"></div>

          ${showWorldIntro ? `<button id="gridlock-start" class="gridlock-start" type="button" onclick="gridLockBeginPuzzle()">
            <strong>SEAL THE GRID</strong>
            <small>${level.briefing}</small>
            <b>BOARD THE GRID →</b>
          </button>` : ''}
        </div>
      </main>`;
    alignPuzzleAnchors(puzzleLayout);
    GridLock.start({
      stageId: 'gridlock-stage',
      size: level.size,
      generationRules: level.generationRules,
      modifiers: level.modifiers,
      onHistoryChange(state) {
        const undo = document.getElementById('gridlock-undo');
        const reset = document.getElementById('gridlock-reset');
        if (undo) undo.disabled = !state.canUndo;
        if (reset) reset.disabled = !state.canReset;
      },
      onSuccessReady(result) { showSolvedBeat(result.stats); }
    });
    if (!showWorldIntro) GridLock.begin();
  }

  function showSolvedBeat(stats) {
    const stage = document.getElementById('gridlock-stage');
    if (!stage || !active) return;
    const level = selectedLevel();
    const next = GridLockLevels.next(level.id);
    if (!debugMode) GridLockProgression.complete(level.id, stats);
    const overlay = document.createElement('div');
    overlay.className = 'gridlock-solved';
    overlay.innerHTML = `
      <span>${debugMode ? 'DEBUG RUN COMPLETE' : next ? `${next.worldId === level.worldId ? `LEVEL ${next.order}` : 'NEW WORLD'} UNLOCKED` : 'ALL WORLDS COMPLETE'}</span>
      <strong>${level.name.toUpperCase()} SOLVED</strong>
      <small>${stats.rotations} ROTATIONS · NEW GENERATED RUN READY</small>
      <div class="gridlock-solved-actions">
        <button type="button" onclick="${debugMode ? 'gridLockOpenDebugMenu()' : 'gridLockReturnToMap()'}">BACK TO MAP</button>
        ${next ? `<button type="button" onclick="${debugMode ? `gridLockDebugOpenLevel('${next.id}')` : `gridLockOpenLevel('${next.id}')`}">NEXT</button>` : ''}
      </div>`;
    stage.appendChild(overlay);
  }

  // ---- Global handlers (called from rendered markup) -----------------------

  window.gridLockBeginPuzzle = function () {
    if (!active) return;
    playMenuSound();
    const overlay = document.getElementById('gridlock-start');
    if (overlay) overlay.remove();
    const spotlight = document.getElementById('gridlock-intro-spotlight');
    if (spotlight) spotlight.remove();
    if (typeof GridLock !== 'undefined') GridLock.begin();
  };

  window.gridLockUndo = function () {
    if (!active || typeof GridLock === 'undefined') return;
    GridLock.undo();
  };

  window.gridLockReset = function () {
    if (!active || typeof GridLock === 'undefined') return;
    GridLock.reset();
  };

  window.gridLockToggleBolt = function (boltIndex) {
    if (!active || typeof GridLock === 'undefined') return;
    GridLock.toggleBolt(boltIndex);
  };

  window.gridLockPlayAgain = function () {
    if (!active) return;
    playMenuSound();
    renderPuzzle();
  };

  window.gridLockOpenLevel = function (levelId) {
    const level = GridLockLevels.get(levelId);
    if (!active || !level || !GridLockProgression.isUnlocked(levelId)) return;
    selectedLevelId = levelId;
    selectedWorldId = level.worldId;
    debugMode = false;
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    renderPuzzle();
  };

  window.gridLockOpenWorld = function (worldId) {
    const world = GridLockLevels.worlds.find(candidate => candidate.id === worldId);
    if (!active || !world || !GridLockProgression.isUnlocked(world.levels[0].id)) return;
    selectedWorldId = worldId;
    selectedLevelId = null;
    debugMode = false;
    playMenuSound();
    renderCockpit();
  };

  window.gridLockOpenDebugMenu = function () {
    if (!active) return;
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    debugMode = true;
    renderDebugMenu();
  };

  window.gridLockDebugOpenLevel = function (levelId) {
    const level = GridLockLevels.get(levelId);
    if (!active || !level) return;
    selectedLevelId = levelId;
    selectedWorldId = level.worldId;
    debugMode = true;
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    renderPuzzle();
  };

  window.gridLockReturnToWorldMap = function () {
    if (!active) return;
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    debugMode = false;
    renderWorldMap();
  };

  window.gridLockReturnToMap = function () {
    if (!active) return;
    const destination = navigationDestination(selectedLevelId, debugMode);
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    if (destination.worldId) selectedWorldId = destination.worldId;
    if (destination.screen === 'debug') {
      renderDebugMenu();
      return;
    }
    debugMode = false;
    renderCockpit();
  };

  // ---- Lifecycle (called by arcade.js nav()) --------------------------------

  window.initGridLock = function () {
    active = true;
    selectedLevelId = null;
    selectedWorldId = null;
    debugMode = false;
    renderWorldMap();
  };

  window.gridLockBack = function () {
    if (!active) return;
    active = false;
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    const root = host();
    if (root) root.innerHTML = '';
    selectedLevelId = null;
    selectedWorldId = null;
    debugMode = false;
  };

  window.GridLockNavigation = Object.freeze({ worldIdForLevel, navigationDestination });
})();
