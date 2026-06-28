# Codex Theme Handoff

The project is ready for a visual-theme exploration pass.

## Hard rules

- Main-site themes are paint-only.
- Do not duplicate pages.
- Do not move/restructure buttons, headers, grids, Home hero, Map, Search, or video card DOM.
- Do not touch Arcade for main-site theme work.
- Keep seasonal effects separate.

## Preferred edit targets

1. `css/site-themes.css` — add/adjust theme variables.
2. `js/site-theme.js` — add a new theme name to the available list.
3. Optional: a small theme picker UI, but keep it scoped and reversible.

## Current theme architecture

- Early boot script in `index.html` applies `html.site-theme-<name>` before first paint.
- `css/site-themes.css` defines `html.site-theme-classic`.
- `js/site-theme.js` exposes `window.MoberinoSiteThemes`.
- Classic should remain visually unchanged.

## Suggested next step

Add a second theme block, for example:

```css
html.site-theme-alt {
  --theme-site-bg: ...;
  --theme-site-bg-2: ...;
  --theme-site-text: ...;
  --theme-panel-bg: ...;
  --theme-panel-bg-strong: ...;
  --theme-nav-bg: ...;
  --theme-photo-overlay: ...;
  --theme-font-body: ...;
  --theme-font-title: ...;
}
```

Then test Home, Browse, Search, Map, Timeline, Shelf, and seasonal overlays.
