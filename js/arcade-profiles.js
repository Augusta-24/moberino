// Lightweight arcade profiles. A player code is intentionally the only credential:
// selecting a code swaps the complete local save set, while Supabase mirrors it so
// the same code can resume on another device.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://gsetfibwyygirpuuvcbs.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzZXRmaWJ3eXlnaXJwdXV2Y2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzIyMTAsImV4cCI6MjA5NzY0ODIxMH0.PV5Yh3FKFXhg3Wf2sqblEx4OICcHVth0rkGitga0DJo';
  const TABLE_URL = `${SUPABASE_URL}/rest/v1/arcade_players`;
  const HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  const CACHE_KEY = 'moberino-player-snapshots-v1';
  const EXACT_KEYS = new Set([
    'moberinoJourneySave',
    'moberino-gridlock-progression-v1',
    'moberino-packing-game-progression-v1',
    'moberino-consume-v1',
    'moberino-knot-swap-words-v2',
    'moberino-knot-swap-numbers-v2',
    'moberino-snoob-v1',
    'moberino-word-v1',
    'moberino-pet-v1',
    'signal-recipes-v1',
  ]);
  const KEY_PREFIXES = ['whack-best-', 'match-best-', 'space-best-'];
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  let applying = false;
  let activeTag = null;
  let syncTimer = null;

  function normalize(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  }

  function valid(tag) {
    return /^[A-Z]{5}[0-9]{2}$/.test(normalize(tag));
  }

  function isManagedKey(key) {
    return EXACT_KEYS.has(key) || KEY_PREFIXES.some(prefix => String(key).startsWith(prefix));
  }

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveCache(cache) {
    try { nativeSetItem.call(localStorage, CACHE_KEY, JSON.stringify(cache)); } catch (error) {}
  }

  function capture() {
    const progress = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && isManagedKey(key)) progress[key] = localStorage.getItem(key);
    }
    return progress;
  }

  function cacheSnapshot(tag, progress) {
    const code = normalize(tag);
    if (!code) return;
    const cache = loadCache();
    cache[code] = { progress: progress || capture(), updatedAt: new Date().toISOString() };
    saveCache(cache);
  }

  function cachedSnapshot(cache, tag) {
    const entry = cache[normalize(tag)];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    if (entry.progress && typeof entry.progress === 'object' && !Array.isArray(entry.progress)) {
      return { progress: entry.progress, updatedAt: Date.parse(entry.updatedAt || '') || 0 };
    }
    // Version-one local caches stored the progress object directly.
    return { progress: entry, updatedAt: 0 };
  }

  function clearManagedKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && isManagedKey(key)) keys.push(key);
    }
    keys.forEach(key => nativeRemoveItem.call(localStorage, key));
  }

  function applySnapshot(progress) {
    applying = true;
    try {
      clearManagedKeys();
      Object.entries(progress || {}).forEach(([key, value]) => {
        if (isManagedKey(key) && typeof value === 'string') nativeSetItem.call(localStorage, key, value);
      });
    } finally {
      applying = false;
    }
  }

  function getCharacter(tag) {
    try {
      const profiles = JSON.parse(localStorage.getItem('moberino-character-profiles-v1') || '{}');
      return String(profiles[normalize(tag)] || '');
    } catch (error) {
      return '';
    }
  }

  function setLocalCharacter(tag, character) {
    if (!character) return;
    try {
      const profiles = JSON.parse(localStorage.getItem('moberino-character-profiles-v1') || '{}');
      profiles[normalize(tag)] = character;
      nativeSetItem.call(localStorage, 'moberino-character-profiles-v1', JSON.stringify(profiles));
    } catch (error) {}
  }

  async function fetchProfile(tag) {
    const url = `${TABLE_URL}?username=eq.${encodeURIComponent(tag)}&select=username,character,progress,updated_at&limit=1`;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    const rows = await response.json();
    return rows && rows[0] ? rows[0] : null;
  }

  async function upsert(tag, progress) {
    const code = normalize(tag);
    if (!valid(code)) return false;
    const body = {
      username: code,
      character: getCharacter(code) || null,
      progress: progress || capture(),
      updated_at: new Date().toISOString(),
    };
    const response = await fetch(TABLE_URL, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    return true;
  }

  async function syncNow(tag) {
    const code = normalize(tag || activeTag);
    if (!code) return false;
    const progress = capture();
    cacheSnapshot(code, progress);
    try { return await upsert(code, progress); }
    catch (error) {
      console.warn('[ArcadeProfiles] sync failed:', error);
      return false;
    }
  }

  function queueSync() {
    const code = normalize(activeTag || (window.PlayerID && PlayerID.get && PlayerID.get()));
    if (!code || applying) return;
    cacheSnapshot(code, capture());
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(code), 700);
  }

  async function activate(rawTag, options) {
    const tag = normalize(rawTag);
    const config = options || {};
    if (!valid(tag)) return { ok: false, reason: 'invalid' };

    const outgoing = normalize(activeTag || (window.PlayerID && PlayerID.get && PlayerID.get()));
    const outgoingProgress = outgoing && outgoing !== tag ? capture() : null;
    if (outgoingProgress) {
      cacheSnapshot(outgoing, outgoingProgress);
      await syncNow(outgoing);
    }

    const cache = loadCache();
    const cached = cachedSnapshot(cache, tag);
    if (cached) applySnapshot(cached.progress);
    else if (outgoing && outgoing !== tag) applySnapshot({});

    let remote = null;
    try {
      remote = await fetchProfile(tag);
      if (remote) {
        setLocalCharacter(tag, remote.character);
        const remoteUpdatedAt = Date.parse(remote.updated_at || '') || 0;
        if (cached && cached.updatedAt > remoteUpdatedAt) {
          applySnapshot(cached.progress);
          await upsert(tag, cached.progress);
        } else {
          applySnapshot(remote.progress && typeof remote.progress === 'object' ? remote.progress : {});
          cacheSnapshot(tag, capture());
        }
      } else if (config.create !== false) {
        await upsert(tag, cached ? cached.progress : capture());
      }
    } catch (error) {
      console.warn('[ArcadeProfiles] profile load failed:', error);
      if (!cached && outgoing && outgoing !== tag && config.requireRemote) {
        applySnapshot(outgoingProgress || {});
        return { ok: false, reason: 'offline' };
      }
    }

    activeTag = tag;
    return { ok: true, existed: !!remote, cached: !!cached };
  }

  function setCharacter(tag, character) {
    setLocalCharacter(tag, character);
    if (normalize(tag) === normalize(activeTag)) queueSync();
  }

  function discardLocalProfile(rawTag) {
    const tag = normalize(rawTag);
    applying = true;
    try {
      clearManagedKeys();
      nativeRemoveItem.call(localStorage, 'moberino-lb-v1');

      const cache = loadCache();
      delete cache[tag];
      saveCache(cache);

      const characters = JSON.parse(localStorage.getItem('moberino-character-profiles-v1') || '{}');
      if (characters && typeof characters === 'object') {
        delete characters[tag];
        nativeSetItem.call(localStorage, 'moberino-character-profiles-v1', JSON.stringify(characters));
      }
    } catch (error) {
      console.warn('[ArcadeProfiles] could not discard legacy profile:', error);
    } finally {
      applying = false;
    }
  }

  async function exists(rawTag) {
    const tag = normalize(rawTag);
    if (!valid(tag)) return false;
    try { return !!(await fetchProfile(tag)); }
    catch (error) { return false; }
  }

  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && isManagedKey(String(key))) queueSync();
  };
  Storage.prototype.removeItem = function (key) {
    nativeRemoveItem.call(this, key);
    if (this === localStorage && isManagedKey(String(key))) queueSync();
  };

  window.addEventListener('pagehide', () => {
    const code = normalize(activeTag || (window.PlayerID && PlayerID.get && PlayerID.get()));
    if (code) cacheSnapshot(code, capture());
  });

  window.ArcadeProfiles = Object.freeze({
    activate,
    capture,
    discardLocalProfile,
    exists,
    isManagedKey,
    normalize,
    queueSync,
    setCharacter,
    syncNow,
    valid,
  });
})();
