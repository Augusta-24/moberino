# Moberino Main-Site Theme Overlay Setup

This checkpoint adds infrastructure for persistent main-site visual themes without changing the current look.

## Current files

```txt
index.html
css/site-themes.css
js/site-theme.js
```

Arcade remains separate and should not be affected by main-site themes.

## Mental model

- Theme = coat of paint on the same house.
- Seasonal = temporary overlay/effects.
- Layout/function/navigation/search/map/video rendering must stay unchanged.

## What was added

`index.html` now applies a saved theme class before first paint:

```txt
html.site-theme-classic
```

The theme is stored in:

```txt
localStorage.moberinoSiteTheme
```

A small API is exposed:

```js
MoberinoSiteThemes.list()
MoberinoSiteThemes.get()
MoberinoSiteThemes.set('classic')
MoberinoSiteThemes.reset()
```

## Current theme

Only `classic` exists for now. It mirrors the existing variables so this setup should have no visual change.

## Adding a future theme

1. Add the theme id to `ALLOWED` in the early boot script inside `index.html`.
2. Add the theme metadata to `THEMES` in `js/site-theme.js`.
3. Add a block in `css/site-themes.css`:

```css
html.site-theme-newname {
  --navy: ...;
  --white: ...;
  --theme-panel-bg: ...;
}
```

4. Only override visual tokens: colors, fonts, icons, textures, tints, shadows.
5. Do not duplicate pages or move elements for a theme.

## Future work

The current main CSS still has many hard-coded color/font values. Migrate those gradually to variables before making a dramatic second theme.
