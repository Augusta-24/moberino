/* Authored Repair Moon mission: hands-on hull patching. Hosts the generic
   polyomino-packing engine (journey-packing-engine.js) inside the ship-repair
   fantasy — the damage silhouette, the salvage tray, and the weld-seal
   confirmation when every plate is fitted. Owns none of the puzzle logic itself
   (that lives in the engine, reusable elsewhere); this module only reskins it
   and reports a standard mission result. Story text (Pip dialogue, branch-
   specific Ogre Gate setup line) stays in the controller, matching how
   journey-cache.js never owns dialogue either. This module never touches
   persistent save state. */
(function () {
  'use strict';

  let active = false;
  let solved = false;
  let config = null;
  let stage = null;
  let timers = [];
  let startedAt = 0;

  function element(id) { return document.getElementById(id); }

  function playTone(f0, f1, dur, vol, type) {
    try {
      if (typeof getAudioCtx !== 'function') return;
      const a = getAudioCtx(); const o = a.createOscillator(); const g = a.createGain();
      const t = a.currentTime + .01; o.type = type || 'triangle';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02);
    } catch (e) { /* playable without audio */ }
  }

  function later(cb, delay) {
    let h = null;
    const run = () => { if (h !== null) timers = timers.filter(x => x !== h); cb(); };
    h = window.setTimeout(run, delay); timers.push(h); return h;
  }
  function clearTimers() { timers.forEach(id => window.clearTimeout(id)); timers = []; }

  function handlePuzzleComplete() {
    if (!active || solved) return;
    solved = true;
    if (stage) stage.classList.add('is-welded');
    // three-beat weld confirmation, distinct from the engine's own placement clicks
    playTone(240, 200, .12, .04);
    later(() => playTone(320, 520, .18, .05), 140);
    later(() => playTone(440, 880, .3, .06), 320);

    later(() => {
      if (!active || !config) return;
      const done = config;
      active = false;
      if (typeof done.onSuccessReady === 'function') {
        done.onSuccessReady({
          attemptId: done.attemptId,
          encounterId: done.encounterId,
          outcome: 'success',
          hullRemaining: done.maxHull,
          damageTaken: 0,
          fuelCollected: 0,
          salvageCollected: 0,
          objectiveComplete: true,
          rescuedPassengerId: null,
          bossDefeated: null,
          stats: { durationMs: Math.max(0, Math.round(performance.now() - startedAt)) }
        });
      }
    }, 1100);
  }

  function start(nextConfig) {
    destroy();
    config = nextConfig;
    stage = element(nextConfig.stageId);
    if (!stage) return false;
    if (typeof JourneyPackingEngine === 'undefined') return false;

    active = true; solved = false; startedAt = performance.now();
    const ok = JourneyPackingEngine.start({
      stageId: nextConfig.stageId,
      regionGroupId: nextConfig.regionGroupId,
      trayGroupId: nextConfig.trayGroupId,
      cellSize: nextConfig.cellSize,
      regionOrigin: nextConfig.regionOrigin,
      trayOrigin: nextConfig.trayOrigin,
      trayCols: nextConfig.trayCols,
      traySpacing: nextConfig.traySpacing,
      regionBackgroundFill: nextConfig.regionBackgroundFill,
      pieceCount: 8,
      targetMin: 3,
      targetMax: 4,
      initiallyPaused: !!nextConfig.initiallyPaused,
      onComplete: handlePuzzleComplete
    });
    if (!ok) { active = false; return false; }
    return true;
  }

  function begin() {
    if (!active) return false;
    if (stage) { stage.classList.remove('is-paused'); stage.classList.add('is-powering'); }
    later(() => { if (stage) stage.classList.remove('is-powering', 'is-dark'); }, 640);
    return typeof JourneyPackingEngine !== 'undefined' && JourneyPackingEngine.begin();
  }

  function destroy() {
    clearTimers();
    if (typeof JourneyPackingEngine !== 'undefined') JourneyPackingEngine.destroy();
    active = false; solved = false; config = null; stage = null;
  }

  window.JourneyRepair = Object.freeze({
    start, begin, destroy,
    isActive() { return active; }
  });
})();
