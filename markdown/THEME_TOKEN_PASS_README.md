# Moberino Theme Token Pass

This package builds on the verified Arcade split and initial theme overlay setup.

## What changed

- Main-site paint values were migrated toward CSS custom properties.
- Classic theme values intentionally match the existing site.
- The user-facing theme API is still in `js/site-theme.js`.
- Seasonal effects remain separate from site style themes.
- Arcade files were not intentionally changed.

## Important boundaries

Theme work must remain a coat of paint on the same house:

- Do not move buttons.
- Do not change nav structure.
- Do not alter Home layout, Map logic, Search behavior, video data, or seasonal behavior.
- Add new visual themes by overriding variables in `css/site-themes.css`.
- Keep `classic` visually identical unless the user explicitly wants a redesign.

## Useful files for future agents

- `index.html`: main site with theme-token-ready inline CSS.
- `css/site-themes.css`: theme variable definitions.
- `js/site-theme.js`: theme get/set/list/reset API.
- `arcade.html`, `css/arcade.css`, `css/games/*`, `js/arcade.js`, `js/games/*`: split Arcade. Avoid touching these during main-site theme work.

## Theme API

From the browser console:

```js
MoberinoSiteThemes.list()
MoberinoSiteThemes.get()
MoberinoSiteThemes.set('classic')
MoberinoSiteThemes.reset()
```

## Next good task

Create a new theme block like:

```css
html.site-theme-newstyle {
  --theme-site-bg: ...;
  --theme-site-text: ...;
  --theme-panel-bg: ...;
  --theme-font-body: ...;
}
```

Then add it to `AVAILABLE_THEMES` in `js/site-theme.js` and provide a small UI picker.
