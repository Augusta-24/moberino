// Moberino main-site theme API.
// Theme = persistent visual skin. Seasonal effects are separate temporary overlays.
(function() {
  const STORAGE_KEY = 'moberinoSiteTheme';
  const DEFAULT_THEME = 'classic';
  const THEMES = Object.freeze({
    classic: {
      id: 'classic',
      label: 'Classic',
      description: 'Original Moberino look.'
    },
    retro: {
      id: 'retro',
      label: 'Retro',
      description: 'Corporate VHS archive look.'
    }
  });

  function normalizeTheme(themeId) {
    return Object.prototype.hasOwnProperty.call(THEMES, themeId) ? themeId : DEFAULT_THEME;
  }

  function getTheme() {
    const rootTheme = document.documentElement.dataset.siteTheme;
    if (rootTheme) return normalizeTheme(rootTheme);
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME);
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function applyTheme(themeId, options = {}) {
    const next = normalizeTheme(themeId);
    const root = document.documentElement;
    Object.keys(THEMES).forEach(id => root.classList.remove('site-theme-' + id));
    root.classList.add('site-theme-' + next);
    root.dataset.siteTheme = next;

    if (options.persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('moberino:site-theme-change', {
      detail: { theme: next, themeInfo: THEMES[next] }
    }));
    return next;
  }

  function listThemes() {
    return Object.values(THEMES).map(theme => ({ ...theme }));
  }

  function nextTheme() {
    const ids = Object.keys(THEMES);
    const current = getTheme();
    const index = ids.indexOf(current);
    return applyTheme(ids[(index + 1) % ids.length]);
  }

  // Pre-made brush art (not generated SVG) — white reads against the classic
  // theme's navy buttons, black against retro's cream/paper buttons.
  const BRUSH_ICON = { classic: 'paint_white.png', retro: 'paint_black.png' };

  function syncToggle(toggle) {
    const theme = getTheme();
    const info = THEMES[theme];
    const label = info.label;
    const labelNode = toggle.querySelector('[data-site-theme-label]');
    if (labelNode) {
      labelNode.textContent = label;
    } else {
      toggle.textContent = label;
    }
    toggle.setAttribute('aria-label', 'Switch site theme. Current theme: ' + info.label);
    toggle.title = 'Theme: ' + info.label;
    const brush = toggle.querySelector('.site-theme-brush-icon');
    if (brush) brush.src = BRUSH_ICON[theme];
  }

  function createBrushIcon() {
    const img = document.createElement('img');
    img.className = 'nav-icon-img site-theme-brush-icon';
    img.alt = '';
    img.src = BRUSH_ICON[getTheme()];
    return img;
  }

  function createToggle(className) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = className;
    toggle.dataset.siteThemeToggle = 'true';
    toggle.addEventListener('click', () => nextTheme());
    return toggle;
  }

  function installThemeToggle() {
    document.querySelectorAll('.cats-header-nav').forEach(nav => {
      if (nav.querySelector('[data-site-theme-toggle]')) return;
      const searchBtn = nav.querySelector('.page-nav-btn.is-search');
      if (!searchBtn) return;
      const toggle = createToggle('page-nav-btn site-theme-toggle site-theme-nav-toggle');
      toggle.appendChild(createBrushIcon());
      const label = document.createElement('span');
      label.dataset.siteThemeLabel = 'true';
      toggle.appendChild(label);
      nav.insertBefore(toggle, searchBtn);
    });

    if (!document.getElementById('mobileSiteThemeToggle')) {
      const mobileToggle = createToggle('site-theme-toggle site-theme-mobile-toggle');
      mobileToggle.id = 'mobileSiteThemeToggle';
      mobileToggle.appendChild(createBrushIcon());
      // syncToggle() falls back to `toggle.textContent = label` when it can't find a
      // [data-site-theme-label] child — which replaces ALL children, silently deleting
      // the brush icon above on the very first sync. A visually-hidden label span gives
      // it somewhere to write the text instead, so the icon (the only visible content
      // in this round icon-only button) survives.
      const mobileLabel = document.createElement('span');
      mobileLabel.dataset.siteThemeLabel = 'true';
      mobileLabel.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap';
      mobileToggle.appendChild(mobileLabel);
      document.body.appendChild(mobileToggle);
    }

    const syncAll = () => {
      document.querySelectorAll('[data-site-theme-toggle]').forEach(syncToggle);
    };
    window.addEventListener('moberino:site-theme-change', syncAll);
    syncAll();
  }

  window.MoberinoSiteThemes = Object.freeze({
    list: listThemes,
    get: getTheme,
    set: applyTheme,
    reset: () => applyTheme(DEFAULT_THEME),
    toggle: nextTheme
  });

  // Re-apply after body scripts are loaded so unsupported saved values get cleaned up.
  applyTheme(getTheme(), { persist: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installThemeToggle);
  } else {
    installThemeToggle();
  }
})();
