# Moberino Arcade UX Design System

This document defines the shared interaction and layout grammar for the arcade.
Games should feel related without becoming reskins of one another. Structure,
readability, control behavior, and hierarchy are shared. Color, illustration,
texture, animation, sound, and game-specific metaphors remain expressive.

## Core principles

1. A first-time player should identify the main action within two seconds.
2. A screen has one primary action unless it presents genuinely equal activities.
3. Artwork explains the activity before decorative copy does.
4. Supporting copy is one short, functional sentence. Rules and limits belong in
   compact metadata when they must be visible before play.
5. Back moves up exactly one meaningful tier and names that destination.
6. Setup asks one question per screen. Necessary setup is not treated as clutter.
7. A game's theme may change the surface, but not the meaning of shared controls.

## Screen families

Every arcade screen belongs to one of four structural families.

### Entry and menu

Use a hero card when one experience is the intended default. Put alternate modes
below as full-width secondary rows. Use peer cards only when the activities are
truly equal, such as Tile Swap's three puzzle types or Face Factory's activities.

Scan order:

1. artwork,
2. mode name,
3. one useful sentence,
4. action or compact metadata.

The whole card is the tap target. Do not place a second button inside a tappable
card.

### Setup and onboarding

Show the mode and step count, one question, its choices, and a stable footer with
Back and Next/Start. A setup flow may contain multiple steps when the choices are
necessary to understand or personalize play.

### Gameplay

Use predictable HUD zones:

- left: context, pause, or nearest-parent navigation;
- center: current objective or game state;
- right: score, time, moves, or resources.

Reset and help are utilities. They must not visually compete with the current
objective or primary gameplay action.

### Result

Order actions by likely intent:

1. Next Level or Play Again;
2. Replay, only when it differs meaningfully from the first action;
3. Game Menu.

Do not add Back to Arcade as a competing result action. The game menu already
provides the arcade exit.

## Layout

- `--arcade-content-narrow` is 440px for focused choices, setup, and results.
- `--arcade-content-wide` is 560px for peer cards, broader HUDs, and maps.
- Use the 4/8/12/16/24/32px spacing scale.
- Primary decisions should be vertically balanced, not simply pinned beneath the
  top rail. Do not stretch cards only to fill empty space.
- Explanatory body text should normally be at least 13px with moderate letter
  spacing. Very small VCR text is reserved for metadata, not instructions.

## Corner-radius rules

Rounding communicates object type. Do not choose a radius by game or accent color.

- `--arcade-radius-control` (6px): buttons, chips, inputs, small utilities.
- `--arcade-radius-panel` (8px): secondary rows, selectors, HUDs, ordinary panels,
  artwork frames, and map nodes.
- `--arcade-radius-feature` (16px): hero cards, large peer cards, results, and
  intentionally prominent feature surfaces.
- `--arcade-radius-pill` (999px): status capsules, binary toggles, tags, and objects
  whose pill shape has meaning.
- Circles are reserved for avatars, radial map nodes, indicators, and physical
  objects that are actually circular.
- Full-screen frames, adjoining cockpit sections, board cells, photographs, and
  machine seams may be square or use asymmetric corners when their physical
  construction calls for it.

Decorative game objects may break the scale when shape is part of the illustration
or simulation. Interactive UI controls may not.

## Shared CSS primitives

The foundation lives in `css/arcade.css`:

- `.arcade-screen`, `.arcade-screen-frame`
- `.arcade-top-rail`, `.arcade-top-rail-title`
- `.arcade-screen-heading`
- `.arcade-choice-stack`
- `.arcade-hero-card`, `.arcade-mode-row`
- `.arcade-peer-grid`, `.arcade-peer-card`
- `.arcade-mode-art`, `.arcade-mode-copy`, `.arcade-mode-meta`
- `.arcade-segmented`
- `.arcade-action`
- `.arcade-setup`, `.arcade-setup-progress`, `.arcade-setup-question`,
  `.arcade-setup-footer`
- `.arcade-hud`
- `.arcade-result`, `.arcade-result-actions`

Each game sets `--arcade-accent` and may set `--arcade-accent-soft`.

## Grid Lock exception

Grid Lock keeps its cockpit, world map, and mission-board composition. It should
not be forced into the standard centered menu layout.

It still shares:

- the top-rail navigation meaning and control geometry;
- the spacing and radius tokens;
- minimum type and touch-target rules;
- primary/secondary action hierarchy;
- setup, HUD, and result behavior;
- the one-tier Back rule.

Its map nodes and cockpit panels should use the shared semantic radius scale, while
connected cockpit sections may keep square or asymmetric seams. Unique layout is
not an exception to interaction consistency.

## Review checklist

- Is the primary action obvious without reading every option?
- Are peer choices actually equal, or is one the intended default?
- Does every explanatory sentence help the player decide or act?
- Is important explanatory text at least 13px and comfortably spaced?
- Is the whole visible card the tap target?
- Does Back name and return to the nearest parent?
- Are radii based on object type?
- Are pills and circles used only when their shape communicates meaning?
- Does a result screen have no more than three meaningful actions?
- Does the game retain its own visual personality after adopting shared structure?
