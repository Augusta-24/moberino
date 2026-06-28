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
  }

  function createBrushIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M18 3l3 3-9.5 9.5-3-3L18 3z"/><path d="M7.5 13.5c-2.8.7-4.1 2.4-4.1 5.1 1.8-.9 3.1-.7 4.4-2 1-1 .9-2.1-.3-3.1z"/>';
    return svg;
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
      const label = document.createElement('span');
      label.dataset.siteThemeLabel = 'true';
      toggle.appendChild(label);
      nav.insertBefore(toggle, searchBtn);
    });

    if (!document.getElementById('mobileSiteThemeToggle')) {
      const mobileToggle = createToggle('site-theme-toggle site-theme-mobile-toggle');
      mobileToggle.id = 'mobileSiteThemeToggle';
      mobileToggle.appendChild(createBrushIcon());
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
