/* Isolated Journey action engine.
   This file intentionally owns no route data and performs no persistence. */
(function () {
  'use strict';

  const WORLD_WIDTH = 420;
  const WORLD_HEIGHT = 700;
  const PLAYER_SPEED = 300;
  const ENCOUNTER_DURATION_MS = 30000;

  let active = false;
  let canvas = null;
  let context = null;
  let frameId = null;
  let config = null;
  let player = null;
  let bullets = [];
  let asteroids = [];
  let pickups = [];
  let stars = [];
  let keys = { left: false, right: false, fire: false };
  let pointerActive = false;
  let lastFrameAt = 0;
  let startedAt = 0;
  let spawnClock = 0;
  let fireClock = 0;
  let shotsFired = 0;
  let asteroidsDestroyed = 0;
  let salvageCollected = 0;
  let fuelCollected = 0;
  let lastHudSecond = -1;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function circlesTouch(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const radii = a.r + b.r;
    return dx * dx + dy * dy <= radii * radii;
  }

  function createStars() {
    stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      r: randomBetween(.5, 1.8),
      alpha: randomBetween(.25, .8)
    }));
  }

  function setCanvasSize() {
    if (!canvas) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = WORLD_WIDTH * pixelRatio;
    canvas.height = WORLD_HEIGHT * pixelRatio;
    context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WORLD_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (WORLD_HEIGHT / rect.height)
    };
  }

  function movePlayerToPointer(event) {
    if (!active || !player) return;
    const point = canvasPoint(event);
    player.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, point.x));
  }

  function onPointerDown(event) {
    if (!active) return;
    pointerActive = true;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    movePlayerToPointer(event);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!pointerActive) return;
    movePlayerToPointer(event);
    event.preventDefault();
  }

  function onPointerUp(event) {
    pointerActive = false;
    if (canvas && canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event) {
    if (!active || !document.body.classList.contains('on-journey')) return;
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true;
    if (event.code === 'Space') {
      keys.fire = true;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = false;
    if (event.code === 'Space') keys.fire = false;
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

  function fire() {
    bullets.push({ x: player.x, y: player.y - 22, r: 3, vy: -540 });
    shotsFired += 1;
  }

  function spawnAsteroid() {
    const radius = randomBetween(15, 29);
    asteroids.push({
      x: randomBetween(radius, WORLD_WIDTH - radius),
      y: -radius - 5,
      r: radius,
      vy: randomBetween(105, 180),
      vx: randomBetween(-24, 24),
      hp: radius > 23 ? 2 : 1,
      rotation: Math.random() * Math.PI * 2,
      spin: randomBetween(-1.2, 1.2),
      points: Array.from({ length: 9 }, () => randomBetween(.76, 1.16))
    });
  }

  function spawnPickup(asteroid) {
    pickups.push({
      type: Math.random() < .14 ? 'fuel' : 'salvage',
      x: asteroid.x,
      y: asteroid.y,
      r: 8,
      vy: 95,
      phase: Math.random() * Math.PI * 2
    });
  }

  function updateHud(elapsedMs) {
    const hull = document.getElementById('journey-combat-hull');
    const timer = document.getElementById('journey-combat-time');
    const salvage = document.getElementById('journey-combat-salvage');
    if (hull) hull.textContent = `${Math.max(0, Math.ceil(player.hull))}`;
    if (salvage) salvage.textContent = `${salvageCollected} / ${config.objectives.salvageTarget}`;
    const second = Math.max(0, Math.ceil((config.objectives.surviveSeconds * 1000 - elapsedMs) / 1000));
    if (timer && second !== lastHudSecond) {
      timer.textContent = `${second}`;
      lastHudSecond = second;
    }
  }

  function update(deltaSeconds, now) {
    if (keys.left) player.x -= PLAYER_SPEED * deltaSeconds;
    if (keys.right) player.x += PLAYER_SPEED * deltaSeconds;
    player.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, player.x));

    fireClock += deltaSeconds;
    const fireDelay = Math.max(.13, .28 - (config.shipStats.blasterLevel || 0) * .035);
    if (fireClock >= fireDelay) {
      fireClock %= fireDelay;
      fire();
    }

    spawnClock += deltaSeconds;
    const rescuePacing = config.encounterType === 'rescue' ? .18 : 0;
    const spawnDelay = Math.max(.38, .78 + rescuePacing - config.difficulty * .05);
    while (spawnClock >= spawnDelay) {
      spawnClock -= spawnDelay;
      spawnAsteroid();
    }

    bullets.forEach(bullet => {
      bullet.y += bullet.vy * deltaSeconds;
    });
    asteroids.forEach(asteroid => {
      asteroid.x += asteroid.vx * deltaSeconds;
      asteroid.y += asteroid.vy * deltaSeconds;
      asteroid.rotation += asteroid.spin * deltaSeconds;
      if (asteroid.x < asteroid.r || asteroid.x > WORLD_WIDTH - asteroid.r) asteroid.vx *= -1;
    });
    pickups.forEach(pickup => {
      pickup.y += pickup.vy * deltaSeconds;
      pickup.phase += deltaSeconds * 4;
      pickup.x += Math.sin(pickup.phase) * 12 * deltaSeconds;
    });

    for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = bullets[bulletIndex];
      if (bullet.y < -10) {
        bullets.splice(bulletIndex, 1);
        continue;
      }
      for (let asteroidIndex = asteroids.length - 1; asteroidIndex >= 0; asteroidIndex -= 1) {
        const asteroid = asteroids[asteroidIndex];
        if (!circlesTouch(bullet, asteroid)) continue;
        bullets.splice(bulletIndex, 1);
        asteroid.hp -= 1;
        if (asteroid.hp <= 0) {
          asteroids.splice(asteroidIndex, 1);
          asteroidsDestroyed += 1;
          spawnPickup(asteroid);
        }
        break;
      }
    }

    for (let asteroidIndex = asteroids.length - 1; asteroidIndex >= 0; asteroidIndex -= 1) {
      const asteroid = asteroids[asteroidIndex];
      if (asteroid.y > WORLD_HEIGHT + asteroid.r) {
        asteroids.splice(asteroidIndex, 1);
        continue;
      }
      if (now >= player.invulnerableUntil && circlesTouch(player, asteroid)) {
        asteroids.splice(asteroidIndex, 1);
        player.hull -= Math.round(8 + asteroid.r * .28);
        player.invulnerableUntil = now + 700;
        if (player.hull <= 0) {
          finish('failure');
          return;
        }
      }
    }

    for (let pickupIndex = pickups.length - 1; pickupIndex >= 0; pickupIndex -= 1) {
      const pickup = pickups[pickupIndex];
      if (pickup.y > WORLD_HEIGHT + 15) {
        pickups.splice(pickupIndex, 1);
        continue;
      }
      if (circlesTouch(player, pickup)) {
        if (pickup.type === 'fuel') fuelCollected += 1;
        else salvageCollected += 1;
        pickups.splice(pickupIndex, 1);
      }
    }

    const elapsedMs = now - startedAt;
    updateHud(elapsedMs);
    if (elapsedMs >= config.objectives.surviveSeconds * 1000) finish('success');
  }

  function drawBackground() {
    context.fillStyle = '#030713';
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    stars.forEach(star => {
      context.globalAlpha = star.alpha;
      context.fillStyle = '#dff7ff';
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    gradient.addColorStop(0, 'rgba(105,215,255,.08)');
    gradient.addColorStop(.55, 'rgba(183,156,255,.035)');
    gradient.addColorStop(1, 'rgba(255,241,166,.04)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  function drawPlayer() {
    const blinking = performance.now() < player.invulnerableUntil && Math.floor(performance.now() / 80) % 2 === 0;
    if (blinking) return;
    context.save();
    context.translate(player.x, player.y);
    context.fillStyle = '#69d7ff';
    context.shadowColor = '#69d7ff';
    context.shadowBlur = 14;
    context.beginPath();
    context.moveTo(0, -22);
    context.lineTo(16, 18);
    context.lineTo(5, 13);
    context.lineTo(0, 21);
    context.lineTo(-5, 13);
    context.lineTo(-16, 18);
    context.closePath();
    context.fill();
    context.fillStyle = '#fff1a6';
    context.shadowBlur = 8;
    context.beginPath();
    context.arc(0, -5, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawAsteroid(asteroid) {
    context.save();
    context.translate(asteroid.x, asteroid.y);
    context.rotate(asteroid.rotation);
    context.beginPath();
    asteroid.points.forEach((scale, index) => {
      const angle = (index / asteroid.points.length) * Math.PI * 2;
      const x = Math.cos(angle) * asteroid.r * scale;
      const y = Math.sin(angle) * asteroid.r * scale;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = '#293249';
    context.strokeStyle = '#7791b5';
    context.lineWidth = 2;
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawPickup(pickup) {
    context.save();
    context.translate(pickup.x, pickup.y);
    context.rotate(pickup.phase);
    context.fillStyle = pickup.type === 'fuel' ? '#fff1a6' : '#b79cff';
    context.shadowColor = context.fillStyle;
    context.shadowBlur = 12;
    if (pickup.type === 'fuel') {
      context.fillRect(-6, -8, 12, 16);
    } else {
      context.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 8;
        const y = Math.sin(angle) * 8;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function draw() {
    drawBackground();
    if (config.encounterType === 'rescue') {
      const pulse = 14 + Math.sin(performance.now() / 240) * 3;
      context.strokeStyle = '#fff1a6';
      context.lineWidth = 3;
      context.shadowColor = '#fff1a6';
      context.shadowBlur = 16;
      context.beginPath();
      context.arc(WORLD_WIDTH / 2, 72, pulse, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#f5f3ec';
      context.font = '12px monospace';
      context.textAlign = 'center';
      context.fillText('RESCUE BEACON', WORLD_WIDTH / 2, 105);
    }
    bullets.forEach(bullet => {
      context.fillStyle = '#fff1a6';
      context.shadowColor = '#fff1a6';
      context.shadowBlur = 8;
      context.fillRect(bullet.x - 2, bullet.y - 9, 4, 13);
      context.shadowBlur = 0;
    });
    asteroids.forEach(drawAsteroid);
    pickups.forEach(drawPickup);
    drawPlayer();
  }

  function loop(now) {
    if (!active) return;
    const deltaSeconds = Math.min(.04, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    update(deltaSeconds, now);
    if (!active) return;
    draw();
    frameId = requestAnimationFrame(loop);
  }

  function finish(outcome) {
    if (!active) return;
    const completedConfig = config;
    const result = {
      attemptId: completedConfig.attemptId,
      encounterId: completedConfig.encounterId,
      outcome,
      hullRemaining: Math.max(0, Math.round(player.hull)),
      damageTaken: Math.max(0, Math.round(completedConfig.startingHull - player.hull)),
      fuelCollected,
      salvageCollected,
      objectiveComplete: salvageCollected >= completedConfig.objectives.salvageTarget,
      rescuedPassengerId: outcome === 'success' ? (completedConfig.rescuedPassengerId || null) : null,
      bossDefeated: null,
      stats: {
        shotsFired,
        asteroidsDestroyed,
        durationMs: Math.round(performance.now() - startedAt)
      }
    };
    destroy();
    if (typeof completedConfig.onComplete === 'function') completedConfig.onComplete(result);
  }

  function start(nextConfig) {
    destroy();
    config = nextConfig;
    canvas = document.getElementById(nextConfig.canvasId);
    if (!canvas) throw new Error('Journey combat canvas is missing.');
    setCanvasSize();
    createStars();
    player = {
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT - 64,
      r: 15,
      hull: nextConfig.startingHull,
      invulnerableUntil: 0
    };
    bullets = [];
    asteroids = [];
    pickups = [];
    keys = { left: false, right: false, fire: false };
    pointerActive = false;
    shotsFired = 0;
    asteroidsDestroyed = 0;
    salvageCollected = 0;
    fuelCollected = 0;
    spawnClock = 0;
    fireClock = 0;
    lastHudSecond = -1;
    active = true;
    startedAt = performance.now();
    lastFrameAt = startedAt;
    addListeners();
    updateHud(0);
    draw();
    frameId = requestAnimationFrame(loop);
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
    bullets = [];
    asteroids = [];
    pickups = [];
    keys = { left: false, right: false, fire: false };
    pointerActive = false;
  }

  window.JourneyCombat = Object.freeze({
    start,
    destroy,
    isActive() {
      return active;
    }
  });
})();
