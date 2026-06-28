# Future agent notes — after Arcade CSS split

Do not recombine Match/Space/Whack files. The intended structure is:

- `js/arcade.js`: shared arcade shell, router, audio, leaderboard helpers, character selection, floating icons.
- `js/games/whack.js`: Whack only.
- `js/games/match.js`: Match only.
- `js/games/space.js`: Space only.
- `css/arcade.css`: shared arcade/lobby/character-select styles.
- `css/games/*.css`: game-specific styles.

The leaderboard/result system is intentionally centralized. Do not duplicate it per game unless explicitly requested.

Known next work after this checkpoint:

1. Main-site theme overlay infrastructure.
2. Match intro timing polish inside `js/games/match.js` only.
3. Optional arcade class rename cleanup, e.g. old `.cats-header` usage inside arcade can eventually become `.arcade-header`, but only with a careful markup + CSS pass.

Theme overlay guidance:

- Theme = coat of paint.
- Seasonal = temporary overlay/effects.
- Do not move buttons, change layout, change behavior, or duplicate pages to create a theme.
- Prefer CSS variables and body/html theme classes.
