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

  window.MoberinoSiteThemes = Object.freeze({
    list: listThemes,
    get: getTheme,
    set: applyTheme,
    reset: () => applyTheme(DEFAULT_THEME)
  });

  // Re-apply after body scripts are loaded so unsupported saved values get cleaned up.
  applyTheme(getTheme(), { persist: true });
})();
