# Future Agent Notes — Moberino Arcade Split

## Standing rules

Use small, scoped changes. Do not casually touch main-site nav/header, Home, Map/Places, Search, seasonal effects, or shared shell code while working on Arcade.

The project was originally a giant single-file `index.html`. It has now been split so Arcade is separate.

## Current architecture

Main site:

- `index.html`
- Should link/redirect Arcade entry points to `arcade.html`.
- Should not contain Whack/Match/Space code anymore.

Arcade:

- `arcade.html`
- `css/arcade.css`
- `js/arcade.js`
- `js/games/whack.js`
- `js/games/match.js`
- `js/games/space.js`

Load order in `arcade.html` matters:

```html
<script src="js/arcade.js"></script>
<script src="js/games/whack.js"></script>
<script src="js/games/match.js"></script>
<script src="js/games/space.js"></script>
```

Do not combine game files. Match and Space were intentionally split into separate files.

## Responsibilities by file

### `index.html`

Main Moberino site only:

- Home
- Browse/Cats
- Search
- Map/Places
- Timeline
- Shelf
- seasonal effects
- main desktop/mobile nav

Arcade entry should navigate to `arcade.html`.

### `arcade.html`

Arcade DOM/shell only:

- lobby
- character select
- Whack page
- Match page
- Space page
- floating Arcade/game exit controls
- leaderboard/result overlay containers

Do not put main-site pages back into this file.

### `css/arcade.css`

Arcade and game styling only.

Important inherited/fragile selectors may still exist from the original single-file site, especially `.cats-header` and `.page`. Be careful renaming them. If renaming, do it in a dedicated pass and test all arcade screens.

### `js/arcade.js`

Shared Arcade shell/helpers:

- page routing inside Arcade
- body class switching
- character selection/shared selected character state
- arcade floating icons
- shared audio/mute helpers
- leaderboard/result shell helpers
- game launch/exit glue

Avoid moving game-specific logic back into this file unless it is truly shared.

### `js/games/whack.js`

Whack-A-Mobe only.

Be careful with:

- `window.initWhack`
- `.whack-wrap`
- `.whack-grid`
- `--hole-sz`
- `GRID_COLS`
- `GRID_ROWS`
- `playModeIntro()`
- `startMemoryRound()`
- `memoryPhase`
- `render()`

Do not change gameplay/scoring/hit detection/adventure logic unless explicitly asked.

### `js/games/match.js`

Match / Memory Mobe only.

Known user preference:

- Keep existing named modes: Hard, Challenge, Impossible, Free Play.
- Do not rename to Easy/Medium/Hard.
- Challenge currently uses 4×8 / 16 pairs from the prior layout fix.
- Match intro timing may still feel wonky; debug it here, not in Arcade shell.

### `js/games/space.js`

Space Mobe only.

Be careful with:

- `#space-canvas`
- wave/boss progression
- rescue/captive logic
- Gizmo scenes/projectiles/bark sound
- powerup sockets
- game-over/leaderboard handoff

Recent Space changes that should be preserved:

- Gizmo laugh/escape timing fixed.
- Boss preview clipping fixed by enlarging preview canvas surface.
- Gizmo projectile enlarged and bark/yip sound added.
- Kevin default color changed to navy blue.
- Random trapped-hero spawns removed from normal waves; scheduled rescue/boss encounters preserved.
- Empty socket powerups render faded/muted until collected.
- Game-over flash fixed by clearing stale launch menu and preparing leaderboard/result handoff before Mission Failed fades.

## Asset path warning

Do not move existing asset folders unless also updating references. The current split assumes root-relative project placement:

- `index.html` at project root
- `arcade.html` at project root
- fonts at project root
- asset folders at their existing root-level locations
- CSS in `css/`
- JS in `js/`

Font paths inside `css/arcade.css` should point back to the root font files using `../` if needed.

## Suggested future cleanup order

1. Commit/checkpoint this working split.
2. Fix Match intro timing inside `js/games/match.js` only.
3. Optional: rename arcade-inherited `.cats-header` usage to `.arcade-header` in a dedicated pass.
4. Optional: rename arcade `.page` usage to `.arcade-page` in a dedicated pass.
5. Optional: split game CSS into `css/games/whack.css`, `css/games/match.css`, `css/games/space.css` only after JS split remains stable.
6. Optional: remove stale comments/dead helpers after verifying there are no hidden dependencies.

## Do not do next

Avoid combining cleanup with gameplay changes. Do not refactor Arcade shell, rename classes, and rebalance games in the same pass.

## 2026-07 QA + Carousel Responsiveness Pass

- Space wave readability/balance pass landed in `js/games/space.js` (purple rain clarity + red identity effects).
- Lobby carousel swipe responsiveness improved for touch devices:
	- `js/arcade.js`: touch/coarse pointers now use a native-snap carousel path (no clone-wrap logic on mobile).
	- `js/arcade.js`: reduced JS churn during swipe with rAF-throttled active-card updates.
	- `css/arcade.css`: added `touch-action: pan-x` and `overscroll-behavior-x: contain` for `#game-carousel` on coarse pointers.
- If carousel feels laggy again on mobile, first verify no scripted re-centering runs during momentum scroll before changing card styles.
