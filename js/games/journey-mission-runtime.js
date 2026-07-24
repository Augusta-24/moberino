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
  let projectiles = [];
  let stars = [];
  let controls = emptyControls();
  let pointerActive = false;
  let pointerTarget = null;
  let attachedTargetId = null;
  let scanTargetId = null;
  let scanStrength = 0;
  let scanPulseStartedAt = -1;
  let scanPulseOrigin = null;
  let nextScanPulseAt = 0;
  let scrollDistance = 0;
  let missionTime = 0;
  let fireClock = 0;
  let shotsFired = 0;
  let targetsDestroyed = 0;
  let lastFrameAt = 0;

  function emptyControls() {
    return {
      left: false,
      right: false,
      up: false,
      down: false,
      scan: false,
      fire: false
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
    const revealSeconds = Math.max(0, Number(target.scanRevealSeconds) || 0);
    return {
      id: typeof target.id === 'string' ? target.id : `target-${index}`,
      type: target.type || 'object',
      x: clamp(Number(target.x) || WORLD_WIDTH / 2, 0, WORLD_WIDTH),
      y: clamp(Number(target.y) || WORLD_HEIGHT / 2, -WORLD_HEIGHT * 6, WORLD_HEIGHT * 2),
      r: Math.max(8, Number(target.r) || 18),
      scannable: target.scannable !== false,
      scanSeconds: Math.max(.1, Number(target.scanSeconds) || 1.2),
      scanProgress: 0,
      scanRevealSeconds: revealSeconds,
      scanRevealProgress: 0,
      revealed: typeof target.revealed === 'boolean' ? target.revealed : revealSeconds === 0,
      captureRadius: Math.max(0, Number(target.captureRadius) || 0),
      scanDecayRate: Math.max(0, Number(target.scanDecayRate) || 0),
      scanLostSeconds: Math.max(.2, Number(target.scanLostSeconds) || 1.2),
      scanOutsideSeconds: 0,
      scanned: !!target.scanned,
      hiddenUntilScanned: !!target.hiddenUntilScanned,
      tractorable: !!target.tractorable,
      interactable: !!target.interactable,
      destructible: !!target.destructible,
      hp: Math.max(1, Number(target.hp) || 1),
      collisionDamage: Math.max(0, Number(target.collisionDamage) || 0),
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      worldLocked: target.worldLocked !== false,
      attached: false,
      interacted: false,
      label: target.label || '',
      color: target.color || '#69d7ff',
      points: Array.isArray(target.points) ? target.points.slice() : null,
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
    if (key === 'f' || key === 'z') return 'fire';
    return null;
  }

  function onKeyDown(event) {
    if (!active || !journeyPageIsActive()) return;
    if (String(event.key || '').toLowerCase() === 'q' && config.scanMode === 'pulse') {
      pulseScan();
      event.preventDefault();
      return;
    }
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
    const requestedSpeed = typeof config.getWorldSpeed === 'function'
      ? config.getWorldSpeed({
          player: { x: player.x, y: player.y, r: player.r },
          controls: Object.assign({}, controls),
          scrollDistance
        })
      : config.worldSpeed;
    const speed = config.forwardScroll ? Math.max(0, Number(requestedSpeed) || 70) : 0;
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

  function circlesTouch(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const radii = a.r + b.r;
    return dx * dx + dy * dy <= radii * radii;
  }

  function updateTargetMotion(deltaSeconds) {
    targets.forEach(target => {
      if (target.attached) return;
      target.x += target.vx * deltaSeconds;
      target.y += target.vy * deltaSeconds;
      if (target.x < target.r || target.x > WORLD_WIDTH - target.r) {
        target.x = clamp(target.x, target.r, WORLD_WIDTH - target.r);
        target.vx *= -1;
      }
    });
  }

  function fireProjectile() {
    if (!active || !player) return { ok: false, code: 'inactive' };
    projectiles.push({
      x: player.x,
      y: player.y - player.r,
      r: 3,
      vy: -(Number(config.projectileSpeed) || 560)
    });
    shotsFired += 1;
    emitCue('blaster-fire');
    return { ok: true, code: 'fired' };
  }

  function updateProjectiles(deltaSeconds) {
    fireClock += deltaSeconds;
    const delay = Math.max(.12, Number(config.fireDelay) || .24);
    if (controls.fire && fireClock >= delay) {
      fireClock %= delay;
      fireProjectile();
    }

    projectiles.forEach(projectile => {
      projectile.y += projectile.vy * deltaSeconds;
    });
    for (let projectileIndex = projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
      const projectile = projectiles[projectileIndex];
      if (projectile.y < -20) {
        projectiles.splice(projectileIndex, 1);
        continue;
      }
      const target = targets.find(item =>
        item.destructible && !item.attached && circlesTouch(projectile, item));
      if (!target) continue;
      projectiles.splice(projectileIndex, 1);
      target.hp -= 1;
      emitCue('target-hit', { targetId: target.id, type: target.type, hp: target.hp });
      if (typeof config.onTargetHit === 'function') {
        config.onTargetHit(targetSnapshot(target));
      }
      if (target.hp <= 0) {
        const destroyed = targetSnapshot(target);
        removeTarget(target.id);
        targetsDestroyed += 1;
        emitCue('target-destroyed', { targetId: destroyed.id, type: destroyed.type });
        if (typeof config.onTargetDestroyed === 'function') {
          config.onTargetDestroyed(destroyed);
        }
      }
    }
  }

  function updatePlayerCollisions() {
    if (missionTime < player.invulnerableUntil) return;
    const target = targets.find(item =>
      item.collisionDamage > 0 && !item.attached && circlesTouch(player, item));
    if (!target) return;
    const damage = target.collisionDamage;
    const hit = targetSnapshot(target);
    removeTarget(target.id);
    player.hull = Math.max(0, player.hull - damage);
    player.invulnerableUntil = missionTime + .7;
    emitCue('player-damage', { targetId: hit.id, damage, hull: player.hull });
    if (typeof config.onPlayerDamage === 'function') {
      config.onPlayerDamage({ target: hit, damage, hull: player.hull });
    }
  }

  function updateScanner(deltaSeconds) {
    const scanRange = Math.max(40, Number(config.scanRange) || DEFAULT_SCAN_RANGE);
    if (config.scanMode === 'pulse') {
      const revealed = nearestTarget(target =>
        target.scannable && target.revealed && !target.scanned, scanRange);
      scanTargetId = revealed ? revealed.target.id : null;
      scanStrength = revealed ? clamp(1 - revealed.distance / scanRange, 0, 1) : 0;
      if (!revealed) {
        targets.forEach(target => {
          if (!target.scannable || !target.revealed || target.scanned) return;
          target.scanOutsideSeconds += deltaSeconds;
          target.scanProgress = clamp(
            target.scanProgress - deltaSeconds * target.scanDecayRate,
            0,
            target.scanSeconds
          );
          if (target.scanOutsideSeconds < target.scanLostSeconds) return;
          target.revealed = false;
          target.scanProgress = 0;
          target.scanOutsideSeconds = 0;
          emitCue('scan-lost', { targetId: target.id });
          if (typeof config.onScanLost === 'function') {
            config.onScanLost(targetSnapshot(target));
          }
        });
        return;
      }
      const target = revealed.target;
      const insideCapture = !target.captureRadius || revealed.distance <= target.captureRadius;
      if (insideCapture) {
        target.scanOutsideSeconds = 0;
        target.scanProgress = clamp(
          target.scanProgress + deltaSeconds,
          0,
          target.scanSeconds
        );
        emitCue('scan-capture', {
          targetId: target.id,
          progress: target.scanProgress / target.scanSeconds
        });
      } else {
        target.scanOutsideSeconds += deltaSeconds;
        target.scanProgress = clamp(
          target.scanProgress - deltaSeconds * target.scanDecayRate,
          0,
          target.scanSeconds
        );
        if (target.scanOutsideSeconds >= target.scanLostSeconds) {
          target.revealed = false;
          target.scanProgress = 0;
          target.scanOutsideSeconds = 0;
          scanTargetId = null;
          scanStrength = 0;
          emitCue('scan-lost', { targetId: target.id });
          if (typeof config.onScanLost === 'function') {
            config.onScanLost(targetSnapshot(target));
          }
          return;
        }
      }
      if (target.scanProgress >= target.scanSeconds && !target.scanned) {
        target.scanned = true;
        emitCue('scan-lock', { targetId: target.id });
        if (typeof config.onScanLock === 'function') config.onScanLock(targetSnapshot(target));
      }
      return;
    }

    const candidate = nearestTarget(target => target.scannable && !target.scanned, scanRange);
    scanTargetId = candidate ? candidate.target.id : null;
    scanStrength = candidate ? clamp(1 - candidate.distance / scanRange, 0, 1) : 0;
    if (!candidate) {
      targets.forEach(target => {
        if (!target.scannable || !target.revealed || target.scanned || target.scanDecayRate <= 0) return;
        target.scanProgress = clamp(
          target.scanProgress - deltaSeconds * target.scanDecayRate,
          0,
          target.scanSeconds
        );
      });
      return;
    }

    const target = candidate.target;
    if (!target.revealed) {
      if (!controls.scan) return;
      target.scanRevealProgress = clamp(
        target.scanRevealProgress + deltaSeconds * (.55 + scanStrength),
        0,
        target.scanRevealSeconds
      );
      emitCue('scan-pulse', {
        targetId: target.id,
        phase: 'reveal',
        strength: scanStrength,
        progress: target.scanRevealProgress / target.scanRevealSeconds
      });
      if (target.scanRevealProgress >= target.scanRevealSeconds) {
        target.revealed = true;
        emitCue('scan-reveal', { targetId: target.id });
        if (typeof config.onScanReveal === 'function') {
          config.onScanReveal(targetSnapshot(target));
        }
      }
      return;
    }

    const insideCapture = !target.captureRadius || candidate.distance <= target.captureRadius;
    if (controls.scan && insideCapture) {
      target.scanProgress = clamp(
        target.scanProgress + deltaSeconds * (1 + scanStrength * .2),
        0,
        target.scanSeconds
      );
    } else if (target.scanDecayRate > 0) {
      target.scanProgress = clamp(
        target.scanProgress - deltaSeconds * target.scanDecayRate,
        0,
        target.scanSeconds
      );
    }
    if (controls.scan) {
      emitCue('scan-pulse', {
        targetId: target.id,
        phase: 'capture',
        strength: scanStrength,
        insideCapture,
        progress: target.scanProgress / target.scanSeconds
      });
    }
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
    missionTime += delta;
    updateMovement(delta);
    updateForwardScroll(delta);
    updateTargetMotion(delta);
    updateScanner(delta);
    updateTractor(delta);
    updateProjectiles(delta);
    updatePlayerCollisions();
    if (typeof config.onUpdate === 'function') config.onUpdate(getSnapshot());
  }

  function setControl(name, pressed) {
    if (!Object.prototype.hasOwnProperty.call(controls, name)) return false;
    controls[name] = !!pressed;
    return true;
  }

  function pulseScan() {
    if (!active || !player) return { ok: false, code: 'inactive' };
    if (missionTime < nextScanPulseAt) {
      return { ok: false, code: 'recharging', readyAt: nextScanPulseAt };
    }
    const radius = Math.max(45, Number(config.scanPulseRadius) || 125);
    const cooldown = Math.max(.25, Number(config.scanPulseCooldown) || .85);
    nextScanPulseAt = missionTime + cooldown;
    scanPulseStartedAt = missionTime;
    scanPulseOrigin = { x: player.x, y: player.y, radius };
    emitCue('scan-sweep', { x: player.x, y: player.y, radius });
    const candidate = nearestTarget(target =>
      target.scannable && !target.scanned && !target.revealed, radius);
    if (!candidate) return { ok: true, code: 'clear' };
    candidate.target.revealed = true;
    candidate.target.scanOutsideSeconds = 0;
    scanTargetId = candidate.target.id;
    emitCue('scan-reveal', { targetId: candidate.target.id });
    if (typeof config.onScanReveal === 'function') {
      config.onScanReveal(targetSnapshot(candidate.target));
    }
    return { ok: true, code: 'revealed', targetId: candidate.target.id };
  }

  function addTarget(source) {
    if (!active) return null;
    const target = normalizeTarget(source, targets.length);
    targets.push(target);
    return targetSnapshot(target);
  }

  function removeTarget(targetId) {
    const index = targets.findIndex(target => target.id === targetId);
    if (index < 0) return false;
    if (attachedTargetId === targetId) attachedTargetId = null;
    targets.splice(index, 1);
    return true;
  }

  function updateTarget(targetId, changes) {
    const target = targets.find(item => item.id === targetId);
    if (!target || !changes || typeof changes !== 'object') return null;
    ['x', 'y', 'vx', 'vy', 'collisionDamage'].forEach(key => {
      if (Number.isFinite(changes[key])) target[key] = changes[key];
    });
    if (typeof changes.interactable === 'boolean') target.interactable = changes.interactable;
    if (typeof changes.tractorable === 'boolean') target.tractorable = changes.tractorable;
    return targetSnapshot(target);
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
      revealed: target.revealed,
      scanRevealProgress: target.scanRevealProgress,
      scanRevealSeconds: target.scanRevealSeconds,
      scanProgress: target.scanProgress,
      scanSeconds: target.scanSeconds,
      captureRadius: target.captureRadius,
      scanLostSeconds: target.scanLostSeconds,
      scanOutsideSeconds: target.scanOutsideSeconds,
      hp: target.hp,
      collisionDamage: target.collisionDamage,
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
      scrollDistance,
      missionTime,
      hull: player ? player.hull : 0,
      shotsFired,
      targetsDestroyed
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
    if (target.hiddenUntilScanned && !target.revealed && target.id !== scanTargetId) return;
    const faint = target.hiddenUntilScanned && !target.revealed;
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
      if (target.revealed && target.captureRadius) {
        context.save();
        context.globalAlpha = .4;
        context.setLineDash([9, 8]);
        context.beginPath();
        context.arc(0, 0, target.captureRadius, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;
        if (target.scanProgress > 0) {
          context.strokeStyle = '#fff1a6';
          context.lineWidth = 5;
          context.beginPath();
          context.arc(
            0,
            0,
            target.captureRadius,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * (target.scanProgress / target.scanSeconds)
          );
          context.stroke();
        }
        context.restore();
      }
      context.beginPath();
      context.arc(0, 0, pulse, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 5, 0, Math.PI * 2);
      context.fill();
    } else if (target.type === 'debris') {
      const points = target.points || [.82, 1.08, .9, 1.13, .78, 1.02, .88, 1.1];
      context.beginPath();
      points.forEach((scale, index) => {
        const angle = (index / points.length) * Math.PI * 2;
        const x = Math.cos(angle) * target.r * scale;
        const y = Math.sin(angle) * target.r * scale;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = '#293249';
      context.strokeStyle = '#8294b1';
      context.fill();
      context.stroke();
    } else if (target.type === 'salvage') {
      context.rotate(Math.PI / 4);
      context.fillStyle = '#b79cff';
      context.fillRect(-target.r * .7, -target.r * .7, target.r * 1.4, target.r * 1.4);
    } else {
      context.beginPath();
      context.arc(0, 0, target.r, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  function drawScanner() {
    if (config.scanMode === 'pulse') {
      if (!scanPulseOrigin || scanPulseStartedAt < 0) return;
      const duration = .55;
      const progress = clamp((missionTime - scanPulseStartedAt) / duration, 0, 1);
      context.save();
      context.strokeStyle = `rgba(105,215,255,${.85 * (1 - progress)})`;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(
        scanPulseOrigin.x,
        scanPulseOrigin.y,
        scanPulseOrigin.radius * (.12 + progress * .88),
        0,
        Math.PI * 2
      );
      context.stroke();
      context.restore();
      if (progress >= 1) scanPulseOrigin = null;
      return;
    }
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

  function drawProjectiles() {
    projectiles.forEach(projectile => {
      context.fillStyle = '#fff1a6';
      context.shadowColor = '#fff1a6';
      context.shadowBlur = 8;
      context.fillRect(projectile.x - 2, projectile.y - 9, 4, 13);
      context.shadowBlur = 0;
    });
  }

  function draw() {
    if (!context || !player) return;
    drawBackground();
    targets.forEach(drawTarget);
    drawProjectiles();
    drawScanner();
    drawTractor();
    drawPlayer();
  }

  function loop(now) {
    if (!active) return;
    const deltaSeconds = Math.min(.04, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    step(deltaSeconds);
    if (!active) return;
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
      r: 16,
      hull: Math.max(1, Number(config.startingHull) || 100),
      invulnerableUntil: 0
    };
    targets = Array.isArray(config.targets) ? config.targets.map(normalizeTarget) : [];
    projectiles = [];
    controls = emptyControls();
    pointerActive = false;
    pointerTarget = null;
    attachedTargetId = null;
    scanTargetId = null;
    scanStrength = 0;
    scanPulseStartedAt = -1;
    scanPulseOrigin = null;
    nextScanPulseAt = 0;
    scrollDistance = 0;
    missionTime = 0;
    fireClock = 0;
    shotsFired = 0;
    targetsDestroyed = 0;
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
    projectiles = [];
    stars = [];
    controls = emptyControls();
    pointerActive = false;
    pointerTarget = null;
    attachedTargetId = null;
    scanTargetId = null;
    scanStrength = 0;
    scanPulseStartedAt = -1;
    scanPulseOrigin = null;
    nextScanPulseAt = 0;
    scrollDistance = 0;
    missionTime = 0;
    fireClock = 0;
    shotsFired = 0;
    targetsDestroyed = 0;
  }

  window.JourneyMissionRuntime = Object.freeze({
    start,
    destroy,
    step,
    setControl,
    pulseScan,
    fireProjectile,
    addTarget,
    removeTarget,
    updateTarget,
    activateTractor,
    interact,
    getSnapshot,
    isActive() {
      return active;
    }
  });
})();
