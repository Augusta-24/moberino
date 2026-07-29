const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/arcade-profiles.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase_arcade_players.sql'), 'utf8');
const arcadeHtml = fs.readFileSync(path.join(root, 'arcade.html'), 'utf8');

function harness() {
  class Storage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] || null; }
    getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
  }
  const localStorage = new Storage();
  const rows = new Map();
  let playerTag = 'ALPHA22';
  const window = {
    addEventListener() {},
    PlayerID: { get: () => playerTag, set: tag => { playerTag = tag; } },
  };
  const document = { visibilityState: 'visible', addEventListener() {} };
  const fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      rows.set(body.username, { ...(rows.get(body.username) || {}), ...body });
      return { ok: true, text: async () => '' };
    }
    const parsed = new URL(url);
    const tag = parsed.searchParams.get('username')?.replace(/^eq\./, '');
    return { ok: true, json: async () => rows.has(tag) ? [rows.get(tag)] : [], text: async () => '' };
  };
  const context = {
    window, document, PlayerID: window.PlayerID, Storage, localStorage, fetch, URL,
    Date, JSON, Object, String, Set, console,
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(source, context);
  return { api: window.ArcadeProfiles, localStorage, rows, setPlayerTag: tag => { playerTag = tag; } };
}

test('profile sync is loaded before every game runtime', () => {
  const profileScript = arcadeHtml.indexOf('js/arcade-profiles.js');
  const firstGameScript = arcadeHtml.indexOf('js/games/face-factory');
  assert.ok(profileScript > arcadeHtml.indexOf('js/arcade.js'));
  assert.ok(profileScript < firstGameScript);
});

test('managed saves switch as one complete player snapshot', async () => {
  const { api, localStorage, rows, setPlayerTag } = harness();
  localStorage.setItem('moberinoJourneySave', '{"currentNodeId":"home-orbit"}');
  localStorage.setItem('moberino-packing-game-progression-v1', '{"unlocked":["space-1"]}');
  localStorage.setItem('arcade-music-muted', '1');
  await api.activate('ALPHA22', { create: true });
  await api.syncNow('ALPHA22');

  rows.set('BERRY33', {
    username: 'BERRY33',
    character: 'RUTH',
    updated_at: new Date().toISOString(),
    progress: {
      moberinoJourneySave: '{"currentNodeId":"repair-moon"}',
      'moberino-consume-v1': '{"profiles":{"BERRY33":{"served":[4,8,2]}}}',
    },
  });
  const result = await api.activate('BERRY33', { create: true, requireRemote: true });
  setPlayerTag('BERRY33');

  assert.equal(result.ok, true);
  assert.equal(localStorage.getItem('moberinoJourneySave'), '{"currentNodeId":"repair-moon"}');
  assert.equal(localStorage.getItem('moberino-packing-game-progression-v1'), null);
  assert.match(localStorage.getItem('moberino-consume-v1'), /"served":\[4,8,2\]/);
  assert.equal(localStorage.getItem('arcade-music-muted'), '1');
  assert.equal(JSON.parse(localStorage.getItem('moberino-character-profiles-v1')).BERRY33, 'RUTH');
  assert.equal(rows.get('ALPHA22').progress.moberinoJourneySave, '{"currentNodeId":"home-orbit"}');
});

test('current Tile Swap saves are captured and synced', async () => {
  const { api, localStorage, rows } = harness();
  const wordGrid = '{"active":"ALPHA22","profiles":{"ALPHA22":{"completed":{"1":true}}}}';
  const wordRack = '{"active":"ALPHA22","profiles":{"ALPHA22":{"completed":{"1":true}}}}';
  localStorage.setItem('moberino-consume-v2', wordGrid);
  localStorage.setItem('moberino-knot-swap-words-v3', wordRack);
  localStorage.setItem('moberino-knot-swap-numbers-v3', wordRack);

  await api.activate('ALPHA22', { create: true });
  await api.syncNow('ALPHA22');

  assert.equal(rows.get('ALPHA22').progress['moberino-consume-v2'], wordGrid);
  assert.equal(rows.get('ALPHA22').progress['moberino-knot-swap-words-v3'], wordRack);
  assert.equal(rows.get('ALPHA22').progress['moberino-knot-swap-numbers-v3'], wordRack);
});

test('an older remote snapshot cannot erase an unregistered local Word Grid save', async () => {
  const { api, localStorage, rows } = harness();
  const wordGrid = '{"active":"ALPHA22","profiles":{"ALPHA22":{"completed":{"1":true,"2":true}}}}';
  localStorage.setItem('moberino-consume-v2', wordGrid);
  rows.set('ALPHA22', {
    username: 'ALPHA22',
    updated_at: new Date().toISOString(),
    progress: { 'moberino-packing-game-progression-v1': '{"unlocked":["pack-02"]}' },
  });

  await api.activate('ALPHA22', { create: true });

  assert.equal(localStorage.getItem('moberino-consume-v2'), wordGrid);
  assert.equal(rows.get('ALPHA22').progress['moberino-consume-v2'], wordGrid);
});

test('a newer cache unions completed Tile Swap levels instead of rolling progress back', async () => {
  const { api, localStorage, rows } = harness();
  const localWordGrid = '{"active":"ALPHA22","profiles":{"ALPHA22":{"completed":{"1":true}}}}';
  const remoteWordGrid = '{"active":"ALPHA22","profiles":{"ALPHA22":{"completed":{"1":true,"2":true,"3":true,"4":true}}}}';
  localStorage.setItem('moberino-consume-v2', localWordGrid);
  localStorage.setItem('moberino-player-snapshots-v1', JSON.stringify({
    ALPHA22: {
      updatedAt: '2026-07-29T06:00:00.000Z',
      progress: { 'moberino-consume-v2': localWordGrid },
    },
  }));
  rows.set('ALPHA22', {
    username: 'ALPHA22',
    updated_at: '2026-07-29T05:00:00.000Z',
    progress: { 'moberino-consume-v2': remoteWordGrid },
  });

  await api.activate('ALPHA22', { create: true });

  const restored = JSON.parse(localStorage.getItem('moberino-consume-v2'));
  assert.deepEqual(Object.keys(restored.profiles.ALPHA22.completed), ['1', '2', '3', '4']);
  assert.deepEqual(
    Object.keys(JSON.parse(rows.get('ALPHA22').progress['moberino-consume-v2']).profiles.ALPHA22.completed),
    ['1', '2', '3', '4']
  );
});

test('a newer local snapshot wins over stale remote progress', async () => {
  const { api, localStorage, rows } = harness();
  localStorage.setItem('moberino-player-snapshots-v1', JSON.stringify({
    BERRY33: {
      updatedAt: '2026-07-26T20:00:00.000Z',
      progress: { moberinoJourneySave: '{"totalDistance":400}' },
    },
  }));
  rows.set('BERRY33', {
    username: 'BERRY33',
    character: 'RUTH',
    updated_at: '2026-07-26T19:00:00.000Z',
    progress: { moberinoJourneySave: '{"totalDistance":100}' },
  });

  await api.activate('BERRY33', { create: true, requireRemote: true });

  assert.equal(localStorage.getItem('moberinoJourneySave'), '{"totalDistance":400}');
  assert.equal(rows.get('BERRY33').progress.moberinoJourneySave, '{"totalDistance":400}');
});

test('discarding a legacy code removes its progress instead of migrating it', () => {
  const { api, localStorage } = harness();
  localStorage.setItem('moberinoJourneySave', '{"totalDistance":900}');
  localStorage.setItem('moberino-packing-game-progression-v1', '{"completed":{"space-1":true}}');
  localStorage.setItem('moberino-lb-v1', '{"space":[{"name":"OLD"}]}');
  localStorage.setItem('moberino-player-snapshots-v1', JSON.stringify({
    MANGO5: { progress: { moberinoJourneySave: '{}' }, updatedAt: '2026-01-01T00:00:00Z' },
  }));
  localStorage.setItem('moberino-character-profiles-v1', '{"MANGO5":"RUTH"}');

  api.discardLocalProfile('MANGO5');

  assert.equal(localStorage.getItem('moberinoJourneySave'), null);
  assert.equal(localStorage.getItem('moberino-packing-game-progression-v1'), null);
  assert.equal(localStorage.getItem('moberino-lb-v1'), null);
  assert.equal(JSON.parse(localStorage.getItem('moberino-player-snapshots-v1')).MANGO5, undefined);
  assert.equal(JSON.parse(localStorage.getItem('moberino-character-profiles-v1')).MANGO5, undefined);
});

test('schema supports public username upserts with versioned JSON saves', () => {
  assert.match(sql, /create table if not exists public\.arcade_players/);
  assert.match(sql, /username text primary key/);
  assert.match(sql, /progress jsonb not null/);
  assert.match(sql, /for update/);
  assert.match(sql, /grant select, insert, update/);
  assert.ok(sql.includes('^[A-Z]{5}[0-9]{2}$'));
});

test('mobile background and page exit flush the latest snapshot with keepalive', () => {
  assert.match(source, /method: 'POST',\s*keepalive: true/);
  assert.match(source, /window\.addEventListener\('pagehide', flushNow\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
});
