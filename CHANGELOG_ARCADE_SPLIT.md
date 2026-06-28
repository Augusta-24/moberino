# Arcade Split Changelog

## Phase 1

Created standalone `arcade.html` while keeping CSS/JS inline.

## Phase 2

Removed Arcade from main `index.html`. Main site shrank substantially and Arcade entry routes to `arcade.html`.

## Phase 3

Moved Arcade CSS to `css/arcade.css`. Important: project needs an actual `css/` folder or the page appears unstyled.

## Phase 4

Moved shared Arcade/game JS payload to `js/arcade.js`. Kept early viewport-height script inline for mobile Safari first-paint stability.

## Phase 5A

Moved Whack JS to `js/games/whack.js`.

## Phase 5B/C

Moved Match JS to `js/games/match.js` and Space JS to `js/games/space.js` in the same delivery phase, but kept them as separate files.

## Current checkpoint

Working split verified by user across main-site navigation, Arcade launch, all three games, sound, titles, gameplay, and return navigation.
