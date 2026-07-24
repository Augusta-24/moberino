/* Authored Distress Signal rescue.
   Owns the tether interaction only; route state remains in the controller. */
(function () {
  'use strict';

  let active = false;
  let paused = true;
  let config = null;
  let stage = null;
  let pod = null;
  let frameId = null;
  let shots = new Map();
  let shotsFired = 0;
  let dockProgress = 0;
  let lastFrameAt = 0;
  let attached = new Set();
  let listeners = [];

  const TETHERS = {
    blue: {
      sourceId: 'journey-rescue-tether-blue',
      targetId: 'journey-rescue-port-blue',
      lineId: 'journey-rescue-line-blue'
    },
    gold: {
      sourceId: 'journey-rescue-tether-gold',
      targetId: 'journey-rescue-port-gold',
      lineId: 'journey-rescue-line-gold'
    },
    dock: {
      sourceId: 'journey-rescue-dock-source',
      targetId: 'journey-rescue-hatch',
      lineId: 'journey-rescue-line-dock'
    }
  };

  function element(id) {
    return document.getElementById(id);
  }

  function playTone(frequency, endFrequency, duration, volume) {
    try {
      if (typeof getAudioCtx !== 'function') return;
      const audio = getAudioCtx();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + .01;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    } catch (error) {
      // Rescue input must remain usable without audio.
    }
  }

  function centerInStage(node) {
    const stageRect = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - stageRect.left,
      y: rect.top + rect.height / 2 - stageRect.top
    };
  }

  function placeLine(name, endPoint) {
    const tether = TETHERS[name];
    const source = element(tether.sourceId);
    const line = element(tether.lineId);
    if (!source || !line || !stage) return;
    const start = centerInStage(source);
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', endPoint.x);
    line.setAttribute('y2', endPoint.y);
  }

  function resolveGrapple(name, point) {
    const shot = shots.get(name);
    const source = element(TETHERS[name].sourceId);
    const line = element(TETHERS[name].lineId);
    const target = element(TETHERS[name].targetId);
    shots.delete(name);
    if (source) source.classList.remove('is-firing');
    const targetPoint = target && centerInStage(target);
    const distance = targetPoint
      ? Math.hypot(point.x - targetPoint.x, point.y - targetPoint.y)
      : Infinity;
    if (shot && distance <= 38) {
      attach(name);
      return;
    }
    if (line) line.classList.remove('is-dragging', 'is-attached');
    if (source) {
      source.classList.add('is-missed');
      window.setTimeout(() => source.classList.remove('is-missed'), 350);
    }
    setObjective('MISSED · TIME THE NEXT SHOT');
    window.setTimeout(() => {
      if (active && attached.size < 2) setObjective(attached.size ? 'HIT THE SECOND PORT' : 'TIME BOTH GRAPPLE SHOTS');
    }, 700);
    playTone(180, 110, .15, .025);
  }

  function updateScene(now) {
    if (!active || !stage) return;
    const deltaSeconds = lastFrameAt ? Math.max(0, Math.min(.1, (now - lastFrameAt) / 1000)) : 0;
    lastFrameAt = now;
    attached.forEach(name => {
      const target = element(TETHERS[name].targetId);
      if (target) placeLine(name, centerInStage(target));
    });
    shots.forEach((shot, name) => {
      const progress = Math.max(0, Math.min(1, (now - shot.startedAt) / shot.duration));
      const eased = 1 - Math.pow(1 - progress, 2);
      const point = {
        x: shot.start.x,
        y: shot.start.y + (shot.endY - shot.start.y) * eased
      };
      placeLine(name, point);
      if (progress >= 1) resolveGrapple(name, point);
    });
    if (attached.has('blue') && attached.has('gold') && !attached.has('dock')) {
      dockProgress = Math.max(0, dockProgress - deltaSeconds * .45);
      const source = element(TETHERS.dock.sourceId);
      const target = element(TETHERS.dock.targetId);
      const line = element(TETHERS.dock.lineId);
      const fill = element('journey-rescue-dock-fill');
      if (source && target && line) {
        const start = centerInStage(source);
        const end = centerInStage(target);
        placeLine('dock', {
          x: start.x + (end.x - start.x) * dockProgress,
          y: start.y + (end.y - start.y) * dockProgress
        });
        line.classList.toggle('is-dragging', dockProgress > 0);
      }
      if (fill) fill.style.width = `${Math.round(dockProgress * 100)}%`;
    }
    frameId = requestAnimationFrame(updateScene);
  }

  function setObjective(text) {
    const objective = element('journey-rescue-objective');
    if (objective) objective.textContent = text;
  }

  function addListener(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    listeners.push({ node, type, handler });
  }

  function finishDocking() {
    if (!active) return;
    pod.classList.add('is-docked');
    stage.classList.add('is-complete');
    setObjective('PIP SECURED');
    playTone(392, 783.99, .34, .07);
    window.setTimeout(() => {
      if (!active || !config) return;
      const completedConfig = config;
      active = false;
      if (typeof completedConfig.onSuccessReady === 'function') {
        completedConfig.onSuccessReady({
          attemptId: completedConfig.attemptId,
          encounterId: completedConfig.encounterId,
          outcome: 'success',
          hullRemaining: completedConfig.startingHull,
          damageTaken: 0,
          fuelCollected: 0,
          salvageCollected: 0,
          objectiveComplete: true,
          rescuedPassengerId: completedConfig.passengerId,
          bossDefeated: null,
          stats: {
            shotsFired,
            asteroidsDestroyed: 0,
            distanceTraveled: 0,
            podStabilized: true
          }
        });
      }
    }, 900);
  }

  function attach(name) {
    attached.add(name);
    const source = element(TETHERS[name].sourceId);
    const line = element(TETHERS[name].lineId);
    if (source) source.classList.add('is-attached');
    if (line) {
      line.classList.remove('is-dragging');
      line.classList.add('is-attached');
    }
    playTone(name === 'blue' ? 260 : 330, name === 'blue' ? 440 : 523.25, .18, .045);

    if (name === 'dock') {
      finishDocking();
      return;
    }
    if (attached.size === 1) {
      pod.classList.add('is-slowed');
      setObjective('HIT THE SECOND PORT');
    }
    if (attached.has('blue') && attached.has('gold')) {
      pod.classList.remove('is-slowed');
      pod.classList.add('is-stable');
      stage.classList.add('is-stable');
      setObjective('CONNECT THE DOCKING COLLAR');
      playTone(330, 659.25, .26, .055);
    }
  }

  function fireGrapple(name, event) {
    if (!active || paused || attached.has(name) || shots.has(name)) return;
    const source = element(TETHERS[name].sourceId);
    const target = element(TETHERS[name].targetId);
    const line = element(TETHERS[name].lineId);
    if (!source || !target || !line) return;
    const start = centerInStage(source);
    const targetPoint = centerInStage(target);
    shots.set(name, {
      start,
      endY: targetPoint.y,
      startedAt: performance.now(),
      duration: 460
    });
    shotsFired += 1;
    source.classList.add('is-firing');
    line.classList.add('is-dragging');
    placeLine(name, start);
    setObjective(`GRAPPLE ${name.toUpperCase()} FIRED`);
    playTone(name === 'blue' ? 220 : 277.18, name === 'blue' ? 330 : 415.3, .12, .035);
    event.preventDefault();
  }

  function pumpDockingCollar(event) {
    if (!active || paused || attached.has('dock') ||
        !(attached.has('blue') && attached.has('gold'))) return;
    const source = element(TETHERS.dock.sourceId);
    dockProgress = Math.min(1, dockProgress + .14);
    if (source) {
      source.classList.remove('is-pumping');
      void source.offsetWidth;
      source.classList.add('is-pumping');
    }
    setObjective(`TAP FAST · COLLAR ${Math.round(dockProgress * 100)}%`);
    playTone(260 + dockProgress * 170, 300 + dockProgress * 250, .08, .028);
    if (dockProgress >= 1) attach('dock');
    event.preventDefault();
  }

  function start(nextConfig) {
    destroy();
    config = nextConfig;
    stage = element(nextConfig.stageId);
    pod = element('journey-rescue-pod');
    if (!stage || !pod) return false;
    active = true;
    paused = !!nextConfig.initiallyPaused;
    attached = new Set();
    shots = new Map();
    shotsFired = 0;
    dockProgress = 0;
    lastFrameAt = performance.now();
    stage.classList.toggle('is-paused', paused);
    ['blue', 'gold'].forEach(name => {
      const source = element(TETHERS[name].sourceId);
      if (source) addListener(source, 'pointerdown', event => fireGrapple(name, event), { passive: false });
    });
    const dockSource = element(TETHERS.dock.sourceId);
    if (dockSource) addListener(dockSource, 'pointerdown', pumpDockingCollar, { passive: false });
    frameId = requestAnimationFrame(updateScene);
    return true;
  }

  function begin() {
    if (!active) return false;
    paused = false;
    stage.classList.remove('is-paused');
    setObjective('TIME BOTH GRAPPLE SHOTS');
    playTone(220, 330, .16, .035);
    return true;
  }

  function destroy() {
    listeners.forEach(({ node, type, handler }) => node.removeEventListener(type, handler));
    listeners = [];
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    active = false;
    paused = true;
    config = null;
    stage = null;
    pod = null;
    shots = new Map();
    shotsFired = 0;
    dockProgress = 0;
    lastFrameAt = 0;
    attached = new Set();
  }

  window.JourneyDistressRescue = Object.freeze({
    start,
    begin,
    destroy,
    isActive() {
      return active;
    }
  });
})();
