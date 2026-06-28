# Moberino split checkpoint — Phase 4/5

This package starts from the verified clean split and adds two cleanup steps:

1. **Arcade CSS split**
   - `css/arcade.css` now holds shared arcade shell/lobby/character-select styles.
   - `css/games/whack.css` holds Whack-only styles.
   - `css/games/space.css` holds Space-only styles.
   - `css/games/match.css` holds Match-only styles.

2. **Main-site cleanup**
   - `index.html` keeps Arcade as a separate page via `arcade.html`.
   - Arcade redirects are centralized through `openArcade()`.
   - Main site behavior should be unchanged.

## Required folder structure

```text
project-folder/
  index.html
  arcade.html
  css/
    arcade.css
    games/
      whack.css
      space.css
      match.css
  js/
    arcade.js
    games/
      whack.js
      match.js
      space.js
  VCR_OSD_MONO_1.001.ttf
  Duck Tape.ttf
  ...existing image/asset folders stay where they already are...
```

## Important CSS boundary

Keep shared UI in `css/arcade.css`:

- arcade background/root/body classes
- lobby carousel/game cards
- character select
- arcade header buttons
- floating icons
- shared mobe face image treatment
- shared leaderboard/result overlay styles if converted from inline later

Keep game-specific layout in the game CSS files.

## Test checklist

- Main site loads.
- Main site Arcade button opens `arcade.html`.
- Arcade lobby looks normal.
- Character select looks normal.
- Whack launches and plays.
- Match launches and plays.
- Space launches and plays.
- Sound still works after user gesture.
- Exit Arcade returns to `index.html`.
