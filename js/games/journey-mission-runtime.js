/* Reusable Journey mission runtime.
   Owns movement and interaction primitives, never route or save state. */
(function () {
  'use strict';

  const WORLD_WIDTH = 420;
  const WORLD_HEIGHT = 700;
  const DEFAULT_SPEED = 250;
  const DEFAULT_SCAN_RANGE = 300;
  const DEFAULT_TRACTOR_RANGE = 130;
  const DEFAULT_INTERACTION_RANGE = 92;

  let active = false;
  let canvas = null;
  let context = null;
  let frameId = null;
  let config = null;
  let player = null;
  let targets = [];
  let stars = [];
  let controls = emptyControls();
  let pointerActive = false;
  let pointerTarget = null;
  let attachedTargetId = null;
  let scanTargetId = null;
  let scanStrength = 0;
  let scrollDistance = 0;
  let lastFrameAt = 0;

  function emptyControls() {
    return {
      left: false,
      right: false,
      up: false,
      down: false,
      scan: false
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function distanceBetween(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function emitCue(name, detail) {
    if (config && typeof config.onCue === 'function') {
      config.onCue(name, detail || {});
    }
  }

  function createStars() {
    stars = Array.from({ length: 72 }, () => ({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      size: .5 + Math.random() * 1.6,
      speed: .35 + Math.random() * .9,
      alpha: .2 + Math.random() * .65
    }));
  }

  function normalizeTarget(source, index) {
    const target = source || {};
    return {
      id: typeof target.id === 'string' ? target.id : `target-${index}`,
      type: target.type || 'object',
      x: clamp(Number(target.x) || WORLD_WIDTH / 2, 0, WORLD_WIDTH),
      y: clamp(Number(target.y) || WORLD_HEIGHT / 2, -WORLD_HEIGHT, WORLD_HEIGHT * 2),
      r: Math.max(8, Number(target.r) || 18),
      scannable: target.scannable !== false,
      scanSeconds: Math.max(.1, Number(target.scanSeconds) || 1.2),
      scanProgress: 0,
      scanned: !!target.scanned,
      hiddenUntilScanned: !!target.hiddenUntilScanned,
      tractorable: !!target.tractorable,
      interactable: !!target.interactable,
      worldLocked: target.worldLocked !== false,
      attached: false,
      interacted: false,
      label: target.label || '',
      color: target.color || '#69d7ff',
      data: target.data || null
    };
  }

  function setCanvasSize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = WORLD_WIDTH * ratio;
    canvas.height = WORLD_HEIGHT * ratio;
    context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WORLD_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (WORLD_HEIGHT / rect.height)
    };
  }

  function movePointer(event) {
    if (!active || !player) return;
    pointerTarget = canvasPoint(event);
    player.x = clamp(pointerTarget.x, player.r, WORLD_WIDTH - player.r);
    player.y = clamp(pointerTarget.y, player.r, WORLD_HEIGHT - player.r);
  }

  function onPointerDown(event) {
    if (!active) return;
    pointerActive = true;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    movePointer(event);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!pointerActive) return;
    movePointer(event);
    event.preventDefault();
  }

  function onPointerUp(event) {
    pointerActive = false;
    pointerTarget = null;
    if (canvas && canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function journeyPageIsActive() {
    return document.body && document.body.classList &&
      document.body.classList.contains('on-journey');
  }

  function keyControl(event) {
    const key = String(event.key || '').toLowerCase();
    if (event.key === 'ArrowLeft' || key === 'a') return 'left';
    if (event.key === 'ArrowRight' || key === 'd') return 'right';
    if (event.key === 'ArrowUp' || key === 'w') return 'up';
    if (event.key === 'ArrowDown' || key === 's') return 'down';
    if (key === 'q') return 'scan';
    return null;
  }

  function onKeyDown(event) {
    if (!active || !journeyPageIsActive()) return;
    const control = keyControl(event);
    if (control) {
      controls[control] = true;
      event.preventDefault();
      return;
    }
    if (event.code === 'Space' && !event.repeat) {
      activateTractor();
      event.preventDefault();
      return;
    }
    if (String(event.key || '').toLowerCase() === 'e' && !event.repeat) {
      interact();
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const control = keyControl(event);
    if (control) controls[control] = false;
  }

  function addListeners() {
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }

  function removeListeners() {
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  }

  function nearestTarget(predicate, maximumDistance) {
    let nearest = null;
    let nearestDistance = maximumDistance;
    targets.forEach(target => {
      if (!predicate(target)) return;
      const distance = distanceBetween(player, target);
      if (distance <= nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    });
    return nearest ? { target: nearest, distance: nearestDistance } : null;
  }

  function updateMovement(deltaSeconds) {
    if (pointerActive) return;
    let dx = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    let dy = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
    if (dx && dy) {
      const diagonalScale = Math.SQRT1_2;
      dx *= diagonalScale;
      dy *= diagonalScale;
    }
    const speed = Number(config.playerSpeed) || DEFAULT_SPEED;
    player.x = clamp(player.x + dx * speed * deltaSeconds, player.r, WORLD_WIDTH - player.r);
    player.y = clamp(player.y + dy * speed * deltaSeconds, player.r, WORLD_HEIGHT - player.r);
  }

  function updateForwardScroll(deltaSeconds) {
    const speed = config.forwardScroll ? Math.max(0, Number(config.worldSpeed) || 70) : 0;
    if (!speed) return;
    const movement = speed * deltaSeconds;
    scrollDistance += movement;
    stars.forEach(star => {
      star.y += movement * star.speed;
      if (star.y > WORLD_HEIGHT + 3) {
        star.y = -3;
        star.x = Math.random() * WORLD_WIDTH;
      }
    });
    targets.forEach(target => {
      if (target.worldLocked && !target.attached) target.y += movement;
    });
  }

  function updateScanner(deltaSeconds) {
    const scanRange = Math.max(40, Number(config.scanRange) || DEFAULT_SCAN_RANGE);
    const candidate = nearestTarget(target => target.scannable && !target.scanned, scanRange);
    scanTargetId = candidate ? candidate.target.id : null;
    scanStrength = candidate ? clamp(1 - candidate.distance / scanRange, 0, 1) : 0;
    if (!controls.scan || !candidate) return;

    const target = candidate.target;
    target.scanProgress = clamp(
      target.scanProgress + deltaSeconds * (.45 + scanStrength),
      0,
      target.scanSeconds
    );
    emitCue('scan-pulse', {
      targetId: target.id,
      strength: scanStrength,
      progress: target.scanProgress / target.scanSeconds
    });
    if (target.scanProgress >= target.scanSeconds && !target.scanned) {
      target.scanned = true;
      emitCue('scan-lock', { targetId: target.id });
      if (typeof config.onScanLock === 'function') config.onScanLock(targetSnapshot(target));
    }
  }

  function updateTractor(deltaSeconds) {
    if (!attachedTargetId) return;
    const target = targets.find(item => item.id === attachedTargetId);
    if (!target) {
      attachedTargetId = null;
      return;
    }
    const desiredX = player.x;
    const desiredY = clamp(player.y + 58, target.r, WORLD_HEIGHT - target.r);
    const pull = clamp(deltaSeconds * 5.5, 0, 1);
    target.x += (desiredX - target.x) * pull;
    target.y += (desiredY - target.y) * pull;
  }

  function step(deltaSeconds) {
    if (!active || !player) return;
    const delta = clamp(Number(deltaSeconds) || 0, 0, .1);
    updateMovement(delta);
    updateForwardScroll(delta);
    updateScanner(delta);
    updateTractor(delta);
    if (typeof config.onUpdate === 'function') config.onUpdate(getSnapshot());
  }

  function setControl(name, pressed) {
    if (!Object.prototype.hasOwnProperty.call(controls, name)) return false;
    controls[name] = !!pressed;
    return true;
  }

  function activateTractor() {
    if (!active || !player) return { ok: false, code: 'inactive' };
    if (attachedTargetId) {
      const released = targets.find(target => target.id === attachedTargetId);
      if (released) released.attached = false;
      const releasedId = attachedTargetId;
      attachedTargetId = null;
      emitCue('tractor-release', { targetId: releasedId });
      return { ok: true, code: 'released', targetId: releasedId };
    }
    const range = Math.max(30, Number(config.tractorRange) || DEFAULT_TRACTOR_RANGE);
    const candidate = nearestTarget(target =>
      target.tractorable && (!target.hiddenUntilScanned || target.scanned), range);
    if (!candidate) return { ok: false, code: 'no-tractor-target' };
    candidate.target.attached = true;
    attachedTargetId = candidate.target.id;
    emitCue('tractor-lock', { targetId: attachedTargetId });
    if (typeof config.onTractorAttach === 'function') {
      config.onTractorAttach(targetSnapshot(candidate.target));
    }
    return { ok: true, code: 'attached', targetId: attachedTargetId };
  }

  function interact() {
    if (!active || !player) return { ok: false, code: 'inactive' };
    const range = Math.max(30, Number(config.interactionRange) || DEFAULT_INTERACTION_RANGE);
    const candidate = nearestTarget(target =>
      target.interactable &&
      (!target.hiddenUntilScanned || target.scanned) &&
      !target.interacted, range);
    if (!candidate) return { ok: false, code: 'no-interaction-target' };
    candidate.target.interacted = true;
    emitCue('interaction-complete', { targetId: candidate.target.id });
    if (typeof config.onInteract === 'function') {
      config.onInteract(targetSnapshot(candidate.target));
    }
    return { ok: true, code: 'interacted', targetId: candidate.target.id };
  }

  function targetSnapshot(target) {
    return {
      id: target.id,
      type: target.type,
      x: target.x,
      y: target.y,
      scanned: target.scanned,
      scanProgress: target.scanProgress,
      attached: target.attached,
      interacted: target.interacted,
      data: target.data
    };
  }

  function getSnapshot() {
    return {
      active,
      player: player ? { x: player.x, y: player.y, r: player.r } : null,
      targets: targets.map(targetSnapshot),
      attachedTargetId,
      scanTargetId,
      scanStrength,
      scrollDistance
    };
  }

  function drawBackground() {
    context.fillStyle = '#030713';
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    stars.forEach(star => {
      context.globalAlpha = star.alpha;
      context.fillStyle = '#dff7ff';
      context.beginPath();
      context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  }

  function drawTarget(target) {
    if (target.hiddenUntilScanned && !target.scanned && target.id !== scanTargetId) return;
    const faint = target.hiddenUntilScanned && !target.scanned;
    context.save();
    context.translate(target.x, target.y);
    context.globalAlpha = faint ? .32 : 1;
    context.strokeStyle = target.color;
    context.fillStyle = '#12243d';
    context.shadowColor = target.color;
    context.shadowBlur = target.scanned ? 15 : 6;
    context.lineWidth = 2;

    if (target.type === 'pod') {
      context.beginPath();
      context.ellipse(0, 0, target.r * .7, target.r, .25, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = '#ff7c8f';
      context.beginPath();
      context.arc(0, -target.r * .25, 4, 0, Math.PI * 2);
      context.fill();
    } else if (target.type === 'signal') {
      const pulse = target.r + Math.sin(performance.now() / 220) * 5;
      context.beginPath();
      context.arc(0, 0, pulse, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 5, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.arc(0, 0, target.r, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  function drawScanner() {
    if (!controls.scan) return;
    const scanRange = Math.max(40, Number(config.scanRange) || DEFAULT_SCAN_RANGE);
    context.save();
    context.strokeStyle = `rgba(105,215,255,${.24 + scanStrength * .6})`;
    context.lineWidth = 2;
    context.setLineDash([7, 9]);
    context.beginPath();
    context.arc(player.x, player.y, scanRange * (.7 + scanStrength * .3), 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    const target = targets.find(item => item.id === scanTargetId);
    if (target) {
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
    context.restore();
  }

  function drawTractor() {
    if (!attachedTargetId) return;
    const target = targets.find(item => item.id === attachedTargetId);
    if (!target) return;
    context.save();
    context.strokeStyle = '#b79cff';
    context.lineWidth = 4;
    context.shadowColor = '#b79cff';
    context.shadowBlur = 12;
    context.beginPath();
    context.moveTo(player.x, player.y + 12);
    context.lineTo(target.x, target.y);
    context.stroke();
    context.restore();
  }

  function drawPlayer() {
    context.save();
    context.translate(player.x, player.y);
    context.fillStyle = '#69d7ff';
    context.shadowColor = '#69d7ff';
    context.shadowBlur = 13;
    context.beginPath();
    context.moveTo(0, -21);
    context.lineTo(16, 17);
    context.lineTo(5, 12);
    context.lineTo(0, 21);
    context.lineTo(-5, 12);
    context.lineTo(-16, 17);
    context.closePath();
    context.fill();
    context.fillStyle = '#fff1a6';
    context.beginPath();
    context.arc(0, -5, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function draw() {
    if (!context || !player) return;
    drawBackground();
    targets.forEach(drawTarget);
    drawScanner();
    drawTractor();
    drawPlayer();
  }

  function loop(now) {
    if (!active) return;
    const deltaSeconds = Math.min(.04, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    step(deltaSeconds);
    draw();
    frameId = requestAnimationFrame(loop);
  }

  function start(nextConfig) {
    destroy();
    config = nextConfig || {};
    canvas = document.getElementById(config.canvasId);
    if (!canvas) throw new Error('Journey mission canvas is missing.');
    setCanvasSize();
    createStars();
    player = {
      x: clamp(Number(config.startX) || WORLD_WIDTH / 2, 16, WORLD_WIDTH - 16),
      y: clamp(Number(config.startY) || WORLD_HEIGHT - 95, 16, WORLD_HEIGHT - 16),
      r: 16
    };
    targets = Array.isArray(config.targets) ? config.targets.map(normalizeTarget) : [];
    controls = emptyControls();
    pointerActive = false;
    pointerTarget = null;
    attachedTargetId = null;
    scanTargetId = null;
    scanStrength = 0;
    scrollDistance = 0;
    active = true;
    lastFrameAt = performance.now();
    addListeners();
    draw();
    frameId = requestAnimationFrame(loop);
    return getSnapshot();
  }

  function destroy() {
    active = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    removeListeners();
    canvas = null;
    context = null;
    config = null;
    player = null;
    targets = [];
    stars = [];
    controls = emptyControls();
    pointerActive = false;
    pointerTarget = null;
    attachedTargetId = null;
    scanTargetId = null;
    scanStrength = 0;
    scrollDistance = 0;
  }

  window.JourneyMissionRuntime = Object.freeze({
    start,
    destroy,
    step,
    setControl,
    activateTractor,
    interact,
    getSnapshot,
    isActive() {
      return active;
    }
  });
})();
