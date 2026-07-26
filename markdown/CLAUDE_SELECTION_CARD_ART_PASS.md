# Claude Script: Selection Card Artwork Pass

Use this as the complete implementation brief for the next arcade UI pass.

## Goal

Apply the approved artwork treatment to every arcade selection card that contains
substantial artwork:

- The selection card has one outer border.
- Artwork fills the card's left section.
- Artwork is centered within that section.
- Do not place a second border around the artwork.
- Do not add a separate artwork background when the artwork reads clearly on the
  card's existing background.
- Do not leave a visible seam, black strip, divider, shadow edge, or color jump
  between the artwork well and the copy.

Space Mobe's Campaign card and the current Tile Swap cards are the starting
references for structure, but they still need the cleanup rules below applied
consistently.

## Visual contract

For horizontal cards:

1. Use a two-column grid: artwork on the left, copy on the right.
2. The artwork wrapper is flush with the card's top, left, and bottom edges.
3. The card owns the radius and border. The artwork wrapper must not draw another
   border.
4. Clip the artwork with the card. If a wrapper radius is needed for clipping, use
   only the card's inner left corners, never a freestanding rounded rectangle.
5. Center the meaningful artwork both horizontally and vertically. Center the
   subject, not merely the SVG or canvas bounds if those bounds contain whitespace.
6. Keep the artwork large enough to be understood immediately, but do not crop its
   must-see subject.
7. Put spacing on the copy column, not around the entire card.

For desktop layouts that intentionally use vertical cards:

- Let artwork fill the card's upper visual region using the same one-border rule.
- Center it in that region.
- Do not force a left/right layout when it damages the established desktop grid.

## Background and seam rules

- Default artwork-wrapper background: `transparent`.
- Default artwork-wrapper border: `0`.
- Default artwork-wrapper box shadow: `none`.
- Do not use a dark rectangle merely to make the artwork look framed.
- Remove the black backing currently visible at the right edge of Tile Swap's art
  wells. The Tile Swap artwork should sit directly on the card wash without a
  black vertical line.
- If artwork includes its own complete scene, keep that scene but remove any
  redundant wrapper background.
- A background is allowed only when it is part of the artwork itself or is required
  for legibility. In that case, blend its edge into the card using the same base
  color; do not add a divider.
- Do not add gradients whose only purpose is to mark the boundary between art and
  copy.

## Cards to audit and update

Audit the rendered selection screens rather than changing selectors blindly.
Likely targets include:

- Whack-a-Mobe primary and secondary mode cards:
  `css/games/whack.css` (`.whack-mode-card .game-card-art`)
- Space Mobe Campaign:
  `css/games/space.css` (`.space-campaign-card`,
  `.space-campaign-art`)
- Space and Sound Build a Track:
  `css/games/signal.css` (`.signal-mode-hero`, `.signal-track-art`)
- Snoob Play:
  `css/games/snoob.css` (`.snoob-mode-primary`, `.snoob-hero-art`)
- Tile Swap Grid, Words, and Rummy:
  `css/games/consume-rack.css` (`.consume-mode-card`,
  `.consume-mode-art`, `.consume-grid-art`, `.consume-float-art`)
- Face Factory's three selection cards:
  `css/games/face-factory.css` (`.ff-mode-card`, `.ff-mode-preview`)

Do not convert these into artwork wells:

- Small icon-only secondary buttons.
- Difficulty toggles.
- Pilot or information strips.
- Memory Mobe's expression icons unless an icon has been wrapped in a redundant
  framed preview.
- Grid Lock. It shares typography, radius, and color rules but intentionally uses
  its unique map layout.

## Implementation approach

For each applicable horizontal card:

```css
.selection-card {
  display: grid;
  grid-template-columns: minmax(150px, 34%) minmax(0, 1fr);
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.selection-card-art {
  width: 100%;
  height: 100%;
  min-width: 0;
  align-self: stretch;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.selection-card-copy {
  min-width: 0;
  padding: 14px 16px;
}
```

Adapt existing selectors instead of introducing these generic class names unless
the markup genuinely benefits from a shared component. Preserve each game's art,
color identity, card height, click target, and mode behavior.

For SVG artwork, use a centered `viewBox` and verify the visible subject is
centered. For HTML/CSS artwork, use `display:grid; place-items:center` on an inner
stage when absolutely positioned children would otherwise prevent centering.

## Required visual review

Check every changed screen at the compact arcade viewport and at desktop width.
For each artwork card, verify:

- Only one visible border.
- No black line or divider between artwork and copy.
- Artwork is centered.
- Artwork is not clipped.
- Copy remains vertically balanced and readable.
- The entire card remains the click target.
- Cards without artwork were not changed.
- The result still feels like the same game, not a generic template.

Compare Whack-a-Mobe, Space Mobe, Space and Sound, Snoob, Tile Swap, and Face
Factory side by side before considering the pass complete.

## Guardrails and verification

- Do not change game flow, labels, mode order, difficulty behavior, or save state.
- Do not add play buttons.
- Preserve the existing outer card radii and restrained glow tokens.
- Preserve reduced-motion behavior.
- Bump affected CSS cache query versions in `arcade.html`.
- Run:

```sh
node --test tests/arcade-navigation.test.js
git diff --check
```

Completion means the rendered cards satisfy the visual contract. A selector-level
change without visual verification is not completion.
