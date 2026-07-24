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
  let drag = null;
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

  function updateAttachedLines() {
    if (!active || !stage) return;
    attached.forEach(name => {
      const target = element(TETHERS[name].targetId);
      if (target) placeLine(name, centerInStage(target));
    });
    frameId = requestAnimationFrame(updateAttachedLines);
  }

  function setObjective(text) {
    const objective = element('journey-rescue-objective');
    if (objective) objective.textContent = text;
  }

  function addListener(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    listeners.push({ node, type, handler });
  }

  function clearDrag() {
    if (!drag) return;
    const line = element(TETHERS[drag.name].lineId);
    const source = element(TETHERS[drag.name].sourceId);
    if (line) line.classList.remove('is-dragging');
    if (source) source.classList.remove('is-dragging');
    drag = null;
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
            shotsFired: 0,
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
    if (line) line.classList.add('is-attached');
    playTone(name === 'blue' ? 260 : 330, name === 'blue' ? 440 : 523.25, .18, .045);

    if (name === 'dock') {
      finishDocking();
      return;
    }
    if (attached.size === 1) {
      pod.classList.add('is-slowed');
      setObjective('ATTACH THE SECOND TETHER');
    }
    if (attached.has('blue') && attached.has('gold')) {
      pod.classList.remove('is-slowed');
      pod.classList.add('is-stable');
      stage.classList.add('is-stable');
      setObjective('CONNECT THE DOCKING COLLAR');
      playTone(330, 659.25, .26, .055);
    }
  }

  function pointerPoint(event) {
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function onPointerMove(event) {
    if (!drag || !active || paused) return;
    placeLine(drag.name, pointerPoint(event));
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (!drag || !active || paused) return;
    if (event.type === 'pointercancel') {
      clearDrag();
      return;
    }
    const name = drag.name;
    const target = element(TETHERS[name].targetId);
    const targetPoint = target && centerInStage(target);
    const point = pointerPoint(event);
    const distance = targetPoint
      ? Math.hypot(point.x - targetPoint.x, point.y - targetPoint.y)
      : Infinity;
    clearDrag();
    if (distance <= 44) {
      attach(name);
    } else {
      const line = element(TETHERS[name].lineId);
      if (line) line.classList.remove('is-attached');
      playTone(180, 110, .15, .025);
    }
  }

  function beginDrag(name, event) {
    if (!active || paused || attached.has(name)) return;
    if (name === 'dock' && !(attached.has('blue') && attached.has('gold'))) return;
    drag = { name };
    const line = element(TETHERS[name].lineId);
    const source = element(TETHERS[name].sourceId);
    if (line) line.classList.add('is-dragging');
    if (source) source.classList.add('is-dragging');
    placeLine(name, pointerPoint(event));
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
    stage.classList.toggle('is-paused', paused);
    Object.keys(TETHERS).forEach(name => {
      const source = element(TETHERS[name].sourceId);
      if (source) addListener(source, 'pointerdown', event => beginDrag(name, event), { passive: false });
    });
    addListener(window, 'pointermove', onPointerMove, { passive: false });
    addListener(window, 'pointerup', onPointerUp, { passive: true });
    addListener(window, 'pointercancel', onPointerUp, { passive: true });
    frameId = requestAnimationFrame(updateAttachedLines);
    return true;
  }

  function begin() {
    if (!active) return false;
    paused = false;
    stage.classList.remove('is-paused');
    setObjective('ATTACH BOTH TETHERS');
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
    drag = null;
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
