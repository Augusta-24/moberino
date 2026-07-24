/* Authored Scrap Belt traversal built on JourneyMissionRuntime.
   Owns no route sequencing or persistence. */
(function () {
  'use strict';

  const ROUTE_DISTANCE = 2600;
  const WORLD_WIDTH = 420;
  const WORLD_HEIGHT = 700;

  let active = false;
  let config = null;
  let signalLocked = false;
  let salvageCollected = 0;
  let storedSalvageId = null;
  let tractorAttachedAt = 0;
  let lastScanToneAt = 0;
  let signalWaypointIndex = 0;
  let signalNextTurnAt = 0;
  let signalLastUpdateAt = 0;

  function playTone(frequency, type, duration, volume, endFrequency) {
    try {
      if (typeof getAudioCtx !== 'function') return;
      const audio = getAudioCtx();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + .01;
      oscillator.type = type || 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      }
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    } catch (error) {
      // Mission audio must never interrupt input.
    }
  }

  function playRockImpact() {
    const notes = [110, 130.81, 146.83, 164.81, 196, 220];
    const frequency = notes[Math.floor(Math.random() * notes.length)];
    playTone(frequency, 'triangle', .052, .022, frequency * .99);
  }

  function playRockBreak() {
    const notes = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440];
    const frequency = notes[Math.floor(Math.random() * notes.length)];
    playTone(frequency, 'triangle', .145, .07, frequency * .992);
    playTone(frequency * 2.01, 'sine', .062, .02, frequency * 1.98);
  }

  function playRockPlayerHit() {
    playTone(73.42, 'sine', .088, .036, 55);
    playTone(146.83, 'triangle', .05, .016, 138.59);
  }

  function playScanLock() {
    [392, 523.25, 659.25].forEach((frequency, index) => {
      try {
        const audio = getAudioCtx();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + .01 + index * .07;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.035 - index * .005, start);
        gain.gain.exponentialRampToValueAtTime(.001, start + .11);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + .13);
      } catch (error) {
        return;
      }
    });
  }

  function playMissionComplete() {
    [261.63, 392, 523.25, 783.99].forEach((frequency, index) => {
      playTone(frequency, index < 2 ? 'triangle' : 'sine', .22, .05 - index * .006, frequency * 1.015);
    });
  }

  function playSignalReveal() {
    playTone(220, 'sine', .11, .03, 293.66);
    playTone(440, 'triangle', .15, .028, 523.25);
  }

  function playScanPulse(detail) {
    const now = Date.now();
    const progress = Math.max(0, Math.min(1, Number(detail.progress) || 0));
    const interval = 470 - progress * 300;
    if (now - lastScanToneAt < interval) return;
    lastScanToneAt = now;
    const base = 300;
    const frequency = base + (Number(detail.strength) || 0) * 360 + progress * 260;
    playTone(frequency, 'sine', .07, .018, frequency * 1.035);
  }

  function playSalvageStored() {
    playTone(440, 'triangle', .09, .035, 523.25);
    playTone(659.25, 'sine', .12, .02, 783.99);
  }

  function debrisField() {
    const targets = [];
    const lanes = [30, 90, 150, 210, 270, 330, 390];
    for (let band = 0; band < 20; band += 1) {
      const gap = [95, 210, 325, 210][band % 4];
      lanes.forEach((x, lane) => {
        if (Math.abs(x - gap) < 62) return;
        if ((band + lane) % 5 === 0) return;
        const radius = 17 + ((band * 7 + lane * 5) % 17);
        targets.push({
          id: `belt-rock-${band}-${lane}`,
          type: 'debris',
          x,
          y: 430 - band * 145 + ((lane % 3) - 1) * 18,
          r: radius,
          scannable: false,
          destructible: true,
          hp: radius > 28 ? 3 : radius > 22 ? 2 : 1,
          collisionDamage: Math.round(7 + radius * .32),
          vx: ((band + lane) % 3 - 1) * 11,
          points: Array.from({ length: 9 }, (_, point) =>
            .78 + ((band * 11 + lane * 7 + point * 13) % 37) / 100)
        });
      });
    }
    targets.push({
      id: 'crystal-trail-signal',
      type: 'signal',
      x: 318,
      y: 105,
      r: 11,
      worldLocked: false,
      revealed: false,
      hiddenUntilScanned: true,
      scannable: true,
      scanSeconds: 2.25,
      captureRadius: 76,
      scanDecayRate: .9,
      scanLostSeconds: .9,
      color: '#fff1a6'
    });
    return targets;
  }

  function hud(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = hud(id);
    if (element) element.textContent = value;
  }

  function updateHull(hull) {
    setText('journey-scrap-hull', Math.max(0, Math.ceil(hull)));
    const fill = hud('journey-scrap-hull-fill');
    if (fill) {
      const percent = Math.max(0, Math.min(100, hull / config.startingHull * 100));
      fill.style.width = `${percent}%`;
      fill.classList.toggle('is-critical', percent <= 35);
    }
  }

  function showDamage(damage) {
    const alert = hud('journey-scrap-damage-alert');
    const frame = document.querySelector && document.querySelector('.journey-scrap-frame');
    if (alert) {
      alert.textContent = `HULL −${damage}`;
      alert.classList.remove('is-visible');
      void alert.offsetWidth;
      alert.classList.add('is-visible');
    }
    if (frame) {
      frame.classList.remove('is-hit');
      void frame.offsetWidth;
      frame.classList.add('is-hit');
    }
  }

  function updateHud(snapshot) {
    const routePercent = Math.min(100, Math.round(snapshot.scrollDistance / ROUTE_DISTANCE * 100));
    const signal = snapshot.targets.find(target => target.id === 'crystal-trail-signal');
    const revealed = !!(signal && signal.revealed);
    const capturePercent = signal
      ? Math.round(signal.scanProgress / signal.scanSeconds * 100)
      : 0;
    const dx = signal ? snapshot.player.x - signal.x : 0;
    const dy = signal ? snapshot.player.y - signal.y : 0;
    const insideRadio = !!(signal && revealed && Math.sqrt(dx * dx + dy * dy) <= signal.captureRadius);
    setText('journey-scrap-distance', `${routePercent}%`);
    setText('journey-scrap-salvage', `${salvageCollected}`);
    setText(
      'journey-scrap-signal',
      signalLocked ? 'LOCKED' : revealed ? `${capturePercent}%` : 'HIDDEN'
    );
    setText(
      'journey-scrap-status',
      signalLocked
        ? 'TRAIL LOCKED · REACH THE FAR SIDE'
        : revealed
          ? insideRadio
            ? 'CAPTURING SIGNAL · STAY INSIDE THE RING'
            : 'CHASE THE SIGNAL · ENTER ITS RADIO RING'
          : 'MOVE THROUGH THE FIELD · TAP SCAN TO SWEEP'
    );
    updateHull(snapshot.hull);
  }

  function finish(outcome) {
    if (!active) return;
    const snapshot = JourneyMissionRuntime.getSnapshot();
    const completedConfig = config;
    active = false;
    JourneyMissionRuntime.destroy();
    config = null;
    const result = {
      attemptId: completedConfig.attemptId,
      encounterId: completedConfig.encounterId,
      outcome,
      hullRemaining: Math.max(0, Math.round(snapshot.hull)),
      damageTaken: Math.max(0, Math.round(completedConfig.startingHull - snapshot.hull)),
      fuelCollected: 0,
      salvageCollected,
      objectiveComplete: signalLocked,
      rescuedPassengerId: null,
      bossDefeated: null,
      stats: {
        shotsFired: snapshot.shotsFired,
        asteroidsDestroyed: snapshot.targetsDestroyed,
        distanceTraveled: Math.round(snapshot.scrollDistance),
        signalLocked
      }
    };
    if (outcome === 'success') playMissionComplete();
    if (outcome === 'success' && typeof completedConfig.onSuccessReady === 'function') {
      completedConfig.onSuccessReady(result);
    } else if (typeof completedConfig.onComplete === 'function') {
      completedConfig.onComplete(result);
    }
  }

  function onUpdate(snapshot) {
    const signal = snapshot.targets.find(target => target.id === 'crystal-trail-signal');
    if (signal && signal.revealed && !signal.scanned) {
      const waypoints = [
        { x: 88, y: 180 },
        { x: 332, y: 245 },
        { x: 132, y: 310 },
        { x: 292, y: 145 },
        { x: 210, y: 270 }
      ];
      if (snapshot.missionTime >= signalNextTurnAt) {
        signalWaypointIndex = (signalWaypointIndex + 1) % waypoints.length;
        signalNextTurnAt = snapshot.missionTime + 1.25;
      }
      const delta = Math.max(0, Math.min(.1, snapshot.missionTime - signalLastUpdateAt));
      const waypoint = waypoints[signalWaypointIndex];
      const playerDistanceX = signal.x - snapshot.player.x;
      const evasionPush = Math.abs(playerDistanceX) < 115
        ? (playerDistanceX >= 0 ? 48 : -48)
        : 0;
      const captureRatio = Math.max(0, Math.min(1, signal.scanProgress / signal.scanSeconds));
      const movementScale = 1 - captureRatio * .5;
      const desiredX = Math.max(48, Math.min(WORLD_WIDTH - 48, waypoint.x + evasionPush));
      const desiredY = waypoint.y + Math.sin(snapshot.missionTime * 2.1) * 24;
      JourneyMissionRuntime.updateTarget(signal.id, {
        x: signal.x + (desiredX - signal.x) * delta * 1.25 * movementScale,
        y: signal.y + (desiredY - signal.y) * delta * 1.05 * movementScale
      });
      signalLastUpdateAt = snapshot.missionTime;
    }
    updateHud(snapshot);
    snapshot.targets
      .filter(target => target.y > WORLD_HEIGHT + 80 && target.id !== 'crystal-trail-signal')
      .forEach(target => JourneyMissionRuntime.removeTarget(target.id));

    if (storedSalvageId && snapshot.attachedTargetId === storedSalvageId &&
        snapshot.missionTime - tractorAttachedAt >= .65) {
      JourneyMissionRuntime.removeTarget(storedSalvageId);
      salvageCollected += 1;
      storedSalvageId = null;
      tractorAttachedAt = 0;
      playSalvageStored();
      setText('journey-scrap-status', 'SALVAGE STOWED');
    }
    if (snapshot.hull <= 0) {
      finish('failure');
      return;
    }
    if (snapshot.scrollDistance >= ROUTE_DISTANCE && signalLocked) finish('success');
  }

  function start(nextConfig) {
    destroy();
    config = nextConfig;
    active = true;
    signalLocked = false;
    salvageCollected = 0;
    storedSalvageId = null;
    tractorAttachedAt = 0;
    lastScanToneAt = 0;
    signalWaypointIndex = 0;
    signalNextTurnAt = 1;
    signalLastUpdateAt = 0;
    JourneyMissionRuntime.start({
      canvasId: nextConfig.canvasId,
      startX: WORLD_WIDTH / 2,
      startY: WORLD_HEIGHT - 105,
      startingHull: nextConfig.startingHull,
      playerSpeed: 265,
      forwardScroll: true,
      worldSpeed: 92,
      getWorldSpeed(runtime) {
        const forwardPosition = 1 - runtime.player.y / WORLD_HEIGHT;
        return 26 + Math.max(0, Math.min(1, forwardPosition)) * 132;
      },
      scanRange: 520,
      scanMode: 'pulse',
      scanPulseRadius: 112,
      scanPulseCooldown: .8,
      tractorRange: 145,
      fireDelay: Math.max(.13, .25 - (nextConfig.blasterLevel || 0) * .03),
      targets: debrisField(),
      onUpdate,
      onScanLock(target) {
        if (target.id !== 'crystal-trail-signal') return;
        signalLocked = true;
        playScanLock();
      },
      onScanReveal(target) {
        if (target.id === 'crystal-trail-signal') playSignalReveal();
      },
      onScanLost(target) {
        if (target.id !== 'crystal-trail-signal') return;
        playTone(260, 'sine', .16, .025, 130);
        setText('journey-scrap-status', 'SIGNAL LOST · MOVE AND SCAN AGAIN');
      },
      onCue(name, detail) {
        if (name === 'scan-sweep') {
          playTone(180, 'sine', .11, .018, 420);
        } else if (name === 'scan-capture') {
          playScanPulse(detail);
        }
      },
      onTargetHit() {
        playRockImpact();
      },
      onTargetDestroyed(target) {
        playRockBreak();
        const rockNumber = target.id.split('-').reduce((total, part) => total + (Number(part) || 0), 0);
        if (rockNumber % 2 !== 0) return;
        JourneyMissionRuntime.addTarget({
          id: `salvage-${target.id}`,
          type: 'salvage',
          x: target.x,
          y: target.y,
          r: 10,
          scannable: false,
          tractorable: true,
          color: '#b79cff'
        });
      },
      onTractorAttach(target) {
        if (target.type !== 'salvage') return;
        storedSalvageId = target.id;
        tractorAttachedAt = JourneyMissionRuntime.getSnapshot().missionTime;
      },
      onPlayerDamage(event) {
        playRockPlayerHit();
        showDamage(event.damage);
      }
    });
  }

  function destroy() {
    active = false;
    config = null;
    signalLocked = false;
    storedSalvageId = null;
    tractorAttachedAt = 0;
    lastScanToneAt = 0;
    signalWaypointIndex = 0;
    signalNextTurnAt = 0;
    signalLastUpdateAt = 0;
    if (typeof JourneyMissionRuntime !== 'undefined') JourneyMissionRuntime.destroy();
  }

  function retreat() {
    finish('failure');
  }

  window.JourneyScrapBelt = Object.freeze({
    start,
    destroy,
    retreat,
    isActive() {
      return active;
    }
  });
})();
