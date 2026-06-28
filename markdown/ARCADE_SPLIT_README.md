# Moberino Arcade Split — Clean Checkpoint

This package is the working split architecture after Phase 5B/C.

## Final structure

```txt
project-folder/
  index.html
  arcade.html
  css/
    arcade.css
  js/
    arcade.js
    games/
      whack.js
      match.js
      space.js
  VCR_OSD_MONO_1.001.ttf
  Duck Tape.ttf
  existing asset folders...
```

Keep all existing asset folders exactly where they already are. The split assumes `index.html` and `arcade.html` both live at the project root, so existing relative image/font/projectile/character paths continue to resolve from the same location.

## What changed during the split

- The main site is now separated from Arcade.
- `index.html` contains the main site only.
- `arcade.html` contains the Arcade DOM/shell.
- Arcade CSS moved to `css/arcade.css`.
- Shared Arcade JS moved to `js/arcade.js`.
- Game JS split into:
  - `js/games/whack.js`
  - `js/games/match.js`
  - `js/games/space.js`

## Verified working before this checkpoint

User tested and confirmed:

- Main site loads.
- Main site navigates to Arcade.
- Arcade launches.
- Whack launches and plays.
- Match launches and plays.
- Space launches and plays.
- Sound works.
- Titles work.
- Gameplay works.
- Navigation back to Home works.

## Testing checklist after replacing files

1. Open `index.html`.
2. Navigate to Arcade.
3. Confirm `arcade.html` opens.
4. Launch Whack.
5. Launch Match.
6. Launch Space.
7. Confirm sound after user interaction.
8. Trigger at least one result/game-over flow if possible.
9. Exit Arcade back to the main site.
10. Quick mobile Safari sanity check.

## Known note

Safari may not play background music when opening local HTML directly until there is a user gesture. This behavior existed before the split and should not automatically be treated as a split regression.
