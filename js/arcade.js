// ── STANDALONE ARCADE ROUTER ───────────────────────────────────────────────
(function() {
  let arcadeInstallPromptEvent = null;

  function arcadeIsStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function updateArcadeInstallPrompt() {
    const card = document.getElementById('arcade-install-card');
    const text = document.getElementById('arcade-install-text');
    const btn = document.getElementById('arcade-install-btn');
    if (!card || !text || !btn) return;

    const isLobby = document.body.classList.contains('on-lobby');
    if (!isLobby || arcadeIsStandaloneApp()) {
      card.hidden = true;
      return;
    }

    // Lobby setup is sequential: resolve sound first, then offer installation.
    // Showing this inline card while the fixed music card is active caused the two
    // large prompts to occupy the same visual lane on wide and short viewports.
    const musicResolved = typeof ArcadeMusic !== 'undefined' && (ArcadeMusic.playing || ArcadeMusic.muted);
    if (!musicResolved) {
      card.hidden = true;
      return;
    }

    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    card.hidden = false;
    if (arcadeInstallPromptEvent) {
      text.textContent = 'Install the arcade app for full-screen play.';
      btn.textContent = 'INSTALL';
      btn.hidden = false;
    } else if (isIOS) {
      text.textContent = 'On iPhone Safari: tap Share (square with up arrow), then Add to Home Screen, then launch from Home Screen for full-screen play.';
      btn.textContent = 'HOW';
      btn.hidden = false;
    } else {
      text.textContent = 'Use your browser menu to install or add this arcade to your Home Screen.';
      btn.hidden = true;
    }
  }

  function updateArcadeMusicPrompt() {
    const card = document.getElementById('arcade-music-card');
    const text = document.getElementById('arcade-music-text');
    const btn = document.getElementById('arcade-music-btn');
    if (!card || !text || !btn) return;

    const isLobby = document.body.classList.contains('on-lobby');
    const isStartup = document.body.classList.contains('on-char');
    const shouldShow = isLobby || isStartup;
    if (!shouldShow) {
      document.body.classList.remove('arcade-music-prompt-visible');
      card.hidden = true;
      card.setAttribute('hidden', '');
      card.style.display = 'none';
      if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
      return;
    }

    const playing = typeof ArcadeMusic !== 'undefined' && ArcadeMusic.playing;
    const muted = typeof ArcadeMusic !== 'undefined' && ArcadeMusic.muted;
    const loading = typeof ArcadeMusic !== 'undefined' && ArcadeMusic.loading;
    if (playing || muted) {
      document.body.classList.remove('arcade-music-prompt-visible');
      card.hidden = true;
      card.setAttribute('hidden', '');
      card.style.display = 'none';
      if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
      return;
    }

    const showCard = () => {
      const liveCard = document.getElementById('arcade-music-card');
      if (!liveCard) return;
      liveCard.hidden = false;
      liveCard.removeAttribute('hidden');
      liveCard.style.display = 'flex';
      document.body.classList.add('arcade-music-prompt-visible');
      if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
    };
    showCard();
    requestAnimationFrame(showCard);
    text.textContent = loading
      ? 'Loading soundtrack. If you still do not hear it, tap again.'
      : isStartup
        ? 'If you do not hear music yet, tap here to wake the soundtrack.'
        : 'No music yet. Tap here to start the lobby soundtrack.';
    btn.textContent = loading ? 'WAKE MUSIC' : 'START MUSIC';
    btn.hidden = false;
  }

  window.updateArcadeInstallPrompt = updateArcadeInstallPrompt;
  window.updateArcadeMusicPrompt = updateArcadeMusicPrompt;

  let arcadeEdgeSwipe = null;
  function arcadeSwipeGuardActive() {
    return document.body.matches('.on-lobby,.on-char,.on-signin,.on-facefactory,.on-whack,.on-match,.on-space,.on-journey,.on-gridlock,.on-packing,.on-signal,.on-snoob,.on-consume');
  }

  document.addEventListener('touchstart', e => {
    if (!arcadeSwipeGuardActive() || !e.touches || e.touches.length !== 1) {
      arcadeEdgeSwipe = null;
      return;
    }
    const touch = e.touches[0];
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const edgeSize = Math.max(28, Math.min(46, width * 0.08));
    const nearLeftEdge = touch.clientX <= edgeSize;
    const nearRightEdge = width - touch.clientX <= edgeSize;
    arcadeEdgeSwipe = nearLeftEdge || nearRightEdge
      ? { x: touch.clientX, y: touch.clientY, edge: nearLeftEdge ? 'left' : 'right', locked: false }
      : null;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!arcadeEdgeSwipe || !arcadeSwipeGuardActive() || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - arcadeEdgeSwipe.x;
    const dy = touch.clientY - arcadeEdgeSwipe.y;
    const horizontalSwipe = Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15;
    const leavingEdge = arcadeEdgeSwipe.edge === 'left' ? dx > 0 : dx < 0;
    if ((horizontalSwipe && leavingEdge) || arcadeEdgeSwipe.locked) {
      arcadeEdgeSwipe.locked = true;
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    arcadeEdgeSwipe = null;
  }, { passive: true });
  document.addEventListener('touchcancel', () => {
    arcadeEdgeSwipe = null;
  }, { passive: true });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    arcadeInstallPromptEvent = e;
    updateArcadeInstallPrompt();
  });

  window.addEventListener('appinstalled', () => {
    arcadeInstallPromptEvent = null;
    updateArcadeInstallPrompt();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('#arcade-install-btn');
    if (!btn) return;
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect();
    if (arcadeInstallPromptEvent) {
      arcadeInstallPromptEvent.prompt();
      arcadeInstallPromptEvent.userChoice.finally(() => {
        arcadeInstallPromptEvent = null;
        updateArcadeInstallPrompt();
      });
    } else {
      alert('On iPhone Safari: tap Share (square with up arrow), scroll, tap Add to Home Screen, then open the app from your Home Screen.');
    }
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('#arcade-music-btn');
    if (!btn) return;
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect();
    if (typeof ArcadeMusic !== 'undefined' && typeof ArcadeMusic.start === 'function') ArcadeMusic.start();
    updateArcadeMusicPrompt();
    updateArcadeInstallPrompt();
    setTimeout(() => {
      updateArcadeMusicPrompt();
      updateArcadeInstallPrompt();
    }, 160);
  });

  function setArcadeExitVisible(show) {
    const btn = document.getElementById('arcade-game-exit');
    if (!btn) return;
    btn.style.display = show ? '' : 'none';
  }
  window.setArcadeExitVisible = setArcadeExitVisible;

  let arcadeContextBackAction = null;
  window.setArcadeModeSelect = function(show, options) {
    document.body.classList.toggle('arcade-mode-select', !!show);
    const button = document.getElementById('arcade-mode-back');
    if (!button) return;
    const config = options && typeof options === 'object' ? options : {};
    const label = String(config.label || 'ARCADE').replace(/^◀\s*/, '');
    button.textContent = `◀ ${label}`;
    button.setAttribute('aria-label', `Back to ${label.toLowerCase()}`);
    arcadeContextBackAction = typeof config.action === 'function' ? config.action : null;
  };

  window.runArcadeContextBack = function() {
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect();
    if (arcadeContextBackAction) {
      const action = arcadeContextBackAction;
      arcadeContextBackAction = null;
      action();
      return;
    }
    nav('lobby');
  };

  window.confirmExitArcade = function() {
    if (!confirm('EXIT GAME?\nReturn to arcade menu?')) return;
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect();
    nav('lobby');
  };

  window.nav = function(p) {
    if (!document.getElementById(`pg-${p}`)) p = 'lobby';
    const targetPageId = `pg-${p}`;
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById(targetPageId)?.classList.add('active');
    window.scrollTo(0, 0);
    if (window.lockViewportHeight) window.lockViewportHeight();
    document.getElementById(targetPageId)?.scrollTo(0, 0);
    window.setArcadeModeSelect(false);

    const onLobby = p === 'lobby';
    const onCharSelect = p === 'charselect';
    const onSignIn = p === 'signin';
    const onFaceFactory = p === 'facefactory';
    const onWhack = p === 'whack';
    const onMatch = p === 'match';
    const onSpace = p === 'space';
    const onJourney = p === 'journey';
    const onGridLock = p === 'gridlock';
    const onPacking = p === 'packing';
    const onSignal = p === 'signal';
    const onSnoob = p === 'snoob';
    const onConsume = p === 'consume';
    const onPet = p === 'pet';
    document.body.classList.toggle('on-lobby', onLobby);
    document.body.classList.toggle('on-char', onCharSelect);
    document.body.classList.toggle('on-signin', onSignIn);
    document.body.classList.toggle('on-facefactory', onFaceFactory);
    document.body.classList.toggle('on-whack', onWhack);
    document.body.classList.toggle('on-match', onMatch);
    document.body.classList.toggle('on-space', onSpace);
    document.body.classList.toggle('on-journey', onJourney);
    document.body.classList.toggle('on-gridlock', onGridLock);
    document.body.classList.toggle('on-packing', onPacking);
    document.body.classList.toggle('on-signal', onSignal);
    document.body.classList.toggle('on-snoob', onSnoob);
    document.body.classList.toggle('on-consume', onConsume);
    document.body.classList.toggle('on-pet', onPet);
    document.documentElement.classList.add('arcade-root');

    try {
      if ((onLobby || onCharSelect || onSignIn || onFaceFactory || onWhack || onMatch || onSpace || onJourney || onGridLock || onPacking || onSignal || onSnoob || onConsume || onPet) && typeof ArcadeMusic !== 'undefined' && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
      if (typeof ArcadeMusic !== 'undefined') {
        if (onLobby || onCharSelect || onSignIn) ArcadeMusic.unduck();
        if (onFaceFactory || onWhack || onMatch || onSpace || onJourney || onGridLock || onPacking || onSignal || onSnoob || onConsume || onPet) ArcadeMusic.duck();
      }
    } catch(e) {}

    if (onLobby) {
      if (!window._arcadeSessionStarted) {
        const playerTag = typeof PlayerID !== 'undefined' ? PlayerID.get() : null;
        if (!playerTag) { nav('signin'); return; }
        window._arcadeSessionStarted = true;
        if (typeof hasPlayerCharacter === 'function' && !hasPlayerCharacter(playerTag)) {
          if (typeof openCharSelect === 'function') { openCharSelect('lobby'); return; }
        }
      }
      if (typeof initArcadeFloat === 'function') initArcadeFloat();
      if (typeof drawPixelIcons === 'function') drawPixelIcons();
      if (typeof initCarousel === 'function') initCarousel();
      if (typeof updatePlayerStatus === 'function') updatePlayerStatus();
    }
    if (onSignIn && typeof preparePlayerSignIn === 'function') preparePlayerSignIn();
    updateArcadeInstallPrompt();
    updateArcadeMusicPrompt();
    if (onFaceFactory && typeof initFaceFactory === 'function') initFaceFactory();
    if (onWhack && typeof initWhack === 'function') initWhack();
    if (onMatch && typeof initMatch === 'function') initMatch();
    if (onSpace && typeof initSpace === 'function') initSpace();
    if (onJourney && typeof initJourney === 'function') initJourney();
    if (onGridLock && typeof initGridLock === 'function') initGridLock();
    if (onPacking && typeof initPackingGame === 'function') initPackingGame();
    if (onSignal && typeof initSignal === 'function') initSignal();
    if (onSnoob && typeof initSnoob === 'function') initSnoob();
    if (onConsume && typeof initConsume === 'function') initConsume();
    if (onPet && typeof initPet === 'function') initPet();
    if (!onSpace && typeof spacePause === 'function') spacePause();
    if (!onJourney && typeof journeyBack === 'function') journeyBack();
    if (!onGridLock && typeof gridLockBack === 'function') gridLockBack();
    if (!onPacking && typeof packingGameBack === 'function') packingGameBack();
    if (!onSignal && typeof signalBack === 'function') signalBack();
    if (!onFaceFactory && typeof faceFactoryBack === 'function') faceFactoryBack();
    if (!onWhack && typeof whackBack === 'function') whackBack();
    if (!onMatch && typeof matchBack === 'function') matchBack();
    if (!onSnoob && typeof snoobBack === 'function') snoobBack();
    if (!onConsume && typeof consumeBack === 'function') consumeBack();
    if (!onConsume && typeof consumeRackBack === 'function') consumeRackBack();
    if (!onPet && typeof petBack === 'function') petBack();
  };

  document.addEventListener('DOMContentLoaded', async () => {
    document.documentElement.classList.add('arcade-root');
    let playerTag = typeof PlayerID !== 'undefined' ? PlayerID.get() : null;
    if (playerTag && typeof ArcadeProfiles !== 'undefined' && !ArcadeProfiles.valid(playerTag)) {
      ArcadeProfiles.discardLocalProfile(playerTag);
      PlayerID.clear();
      playerTag = null;
    } else if (playerTag && typeof ArcadeProfiles !== 'undefined') {
      await ArcadeProfiles.activate(playerTag, { create: true });
    }
    nav('lobby');
    updateArcadeInstallPrompt();
    updateArcadeMusicPrompt();
  });
})();

// ══════════════════════════════════════
//  SHARED AUDIO CONTEXT
// ══════════════════════════════════════
let _sharedAudioCtx = null;
function getAudioCtx() {
  if (!_sharedAudioCtx) {
    _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS Safari unlock: play a silent buffer immediately to unblock the context
    try {
      const buf = _sharedAudioCtx.createBuffer(1, 1, 22050);
      const src = _sharedAudioCtx.createBufferSource();
      src.buffer = buf; src.connect(_sharedAudioCtx.destination); src.start(0);
    } catch(e) {}
  }
  if (_sharedAudioCtx.state === 'suspended') _sharedAudioCtx.resume();
  return _sharedAudioCtx;
}
// iOS Safari requires AudioContext creation/resume to happen synchronously inside a real
// touch/click handler — a setTimeout-deferred SFX call (like the char-select scroll debounce)
// is too late if this is the very first audio interaction. Unlock eagerly on first touch/click.
function _unlockSfx() { getAudioCtx(); }
document.addEventListener('touchstart', _unlockSfx, { passive: true, once: true });
document.addEventListener('click', _unlockSfx, { passive: true, once: true });

// ══════════════════════════════════════
//  SFX — Web Audio chiptune sounds
// ══════════════════════════════════════
const SFX = (() => {
  function tone(freq, type, start, dur, vol, endFreq) {
    const c = getAudioCtx(), o = c.createOscillator(), g = c.createGain();
    const t0 = c.currentTime + Math.max(start, 0.05);
    o.connect(g); g.connect(c.destination);
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.01);
  }
  return {
    hit() {
      // Shared "good hit" language: tuned bars with a tiny sparkle, not a thud.
      tone(196, 'triangle', 0, 0.11, 0.11, 220);
      tone(294, 'triangle', 0.02, 0.09, 0.08, 330);
      tone(392, 'sine', 0.05, 0.10, 0.04, 440);
      tone(784, 'triangle', 0.08, 0.045, 0.016);
    },
        miss()     { tone(220,'sawtooth',0,0.14,0.07,100); },
    match()    { tone(523,'triangle',0,0.10,0.06); tone(659,'triangle',0.08,0.10,0.06); tone(784,'sine',0.16,0.14,0.06); },
    mismatch() { tone(300,'sawtooth',0,0.08,0.06); tone(220,'sawtooth',0.06,0.14,0.07,140); },
    win()      { [523,659,784,1047].forEach((f,i)=>tone(f,'triangle',i*0.09,0.13,0.06)); },
    over()     { tone(330,'sawtooth',0,0.17,0.07,200); tone(200,'sawtooth',0.12,0.26,0.08,80); },
    // Space Mobe's blaster — softer waveform, lower pitch, deliberately quiet since
    // it fires at the auto-fire rate.
    blaster()  { tone(260,'triangle',0,0.06,0.032,196); tone(520,'sine',0.012,0.03,0.010,392); },
    score()       { tone(784,'triangle',0,0.07,0.05); tone(1047,'sine',0.05,0.10,0.05); },
    menuSelect()  { tone(660,'triangle',0,0.05,0.045); tone(880,'sine',0.03,0.06,0.04); },
    charPick(i)   { const f = 300 + i * 40; tone(f,'triangle',0,0.04,0.045); tone(f*1.5,'sine',0.025,0.05,0.035); },
    whack()       { tone(180,'square',0,0.07,0.10,80); tone(120,'sawtooth',0.04,0.10,0.08,60); },
    imposter()    { tone(220,'sawtooth',0,0.19,0.10,100); tone(160,'sawtooth',0.13,0.22,0.11,80); tone(110,'sawtooth',0.28,0.34,0.10,60); },
    // Whacked yourself — a slow, soft descending sigh instead of a cartoon "wah-wah" fail
    selfWhack()   { tone(280,'triangle',0,0.22,0.09,200); tone(190,'triangle',0.16,0.32,0.08,140); },
    // Missed the mole — a fast whoosh (the swing) then a soft sad tone (it got away)
    moleEscaped() { tone(1000,'sine',0,0.07,0.05,150); tone(240,'triangle',0.09,0.26,0.07,170); },
    // Classic race-start "shotgun" bang for timed modes — a noise burst (not a clean
    // oscillator tone, which would read as a laser/zap) through a lowpass filter for a
    // duller "boom" character, with a fast exponential decay.
    raceStart() {
      const c = getAudioCtx();
      const dur = 0.28;
      const bufferSize = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      const noise = c.createBufferSource();
      noise.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 1800;
      const gain = c.createGain();
      const t0 = c.currentTime + 0.02;
      gain.gain.setValueAtTime(0.35, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      noise.connect(filter); filter.connect(gain); gain.connect(c.destination);
      noise.start(t0); noise.stop(t0 + dur + 0.02);
    },
    // Space Mobe themed-wave/mini-boss/mystery-box sounds — all the same tone()-based
    // pattern, plus two noise bursts (same scaffold as raceStart, shorter/different
    // filter) for the impact-y ones.
    ghostTeleport() { tone(900,'sine',0,0.08,0.05,200); tone(200,'sine',0.12,0.10,0.05,700); },
    miniBossHit()   { tone(380,'square',0,0.08,0.06); },
    miniBossDown()  { [440,659,880].forEach((f,i)=>tone(f,'square',i*0.08,0.10,0.06)); },
    freeze()        { tone(1200,'sine',0,0.05,0.05,2000); tone(600,'triangle',0.05,0.3,0.06,150); },
    // Bigger "jackpot" shimmer — a longer ascending run plus a high sine sparkle on
    // top, instead of the plain 3-note arpeggio it used to be.
    mysteryGood()   {
      [523,659,784,988,1175].forEach((f,i)=>tone(f,'square',i*0.05,0.13,0.065));
      tone(2200,'sine',0.2,0.3,0.05); tone(1760,'sine',0.24,0.3,0.04);
    },
    // Bigger "uh-oh" — a falling growl across three overlapping low tones instead
    // of one quick descending pair, with real weight to it.
    mysteryBad()    {
      tone(200,'sawtooth',0,0.24,0.12,65); tone(140,'square',0.04,0.32,0.10,55);
      tone(100,'sawtooth',0.14,0.38,0.09,40);
    },
    powerupCollect(){ tone(880,'square',0,0.06,0.07); tone(1320,'square',0.05,0.09,0.06); tone(1760,'sine',0.09,0.13,0.045); },
    guitarNote() { tone(330,'sawtooth',0,0.18,0.07,300); tone(415,'triangle',0.02,0.22,0.05,380); },
    pianoNote()  { tone(523,'triangle',0,0.28,0.08); tone(659,'sine',0.01,0.3,0.05); },
    saxNote() {
      tone(466, 'sawtooth', 0, 0.13, 0.065, 900);
      tone(622, 'triangle', 0.04, 0.18, 0.055, 1200);
      tone(784, 'sine', 0.11, 0.16, 0.045, 1400);
    },
    boxOpen()       { tone(523,'square',0,0.05,0.05); tone(784,'square',0.04,0.07,0.05); },
    neonOn()        { tone(220,'square',0,0.05,0.05,880); tone(880,'square',0.05,0.05,0.05,220); },
    slotTick()      { tone(700,'square',0,0.03,0.04); },
    slotLand()      { tone(440,'square',0,0.06,0.08); tone(880,'square',0.04,0.12,0.08); },
    reelPair()      {
      tone(523,'triangle',0,0.10,0.06);
      tone(784,'triangle',0.07,0.12,0.065);
      tone(1047,'sine',0.15,0.18,0.055);
    },
    reelJackpot()   {
      [523,659,784,1047].forEach((f,i)=>tone(f,'triangle',i*0.07,0.16,0.065));
      [784,988,1175,1568].forEach((f,i)=>tone(f,'triangle',0.31+i*0.07,0.19,0.068));
      tone(2093,'sine',0.48,0.34,0.045);
      tone(2637,'sine',0.57,0.28,0.035);
    },
    cameraShutter() {
      const c = getAudioCtx();
      const start = c.currentTime + 0.012;
      const master = c.createGain();
      const compressor = c.createDynamicsCompressor();
      master.gain.value = 0.72;
      compressor.threshold.value = -18;
      compressor.knee.value = 8;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.08;
      master.connect(compressor);
      compressor.connect(c.destination);

      // A camera reads as two closely spaced mechanical events: the shutter
      // opening, then the mechanism returning. Layer filtered, irregular noise
      // with a small low-frequency body instead of using an arcade oscillator chirp.
      const noiseSnap = (offset, duration, volume, frequency, type = 'bandpass') => {
        const frames = Math.max(1, Math.floor(c.sampleRate * duration));
        const buffer = c.createBuffer(1, frames, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) {
          const envelope = Math.pow(1 - i / frames, 2.6);
          const irregular = i % 7 === 0 ? 1.35 : 0.82;
          data[i] = (Math.random() * 2 - 1) * envelope * irregular;
        }
        const source = c.createBufferSource();
        const filter = c.createBiquadFilter();
        const gain = c.createGain();
        const at = start + offset;
        source.buffer = buffer;
        filter.type = type;
        filter.frequency.setValueAtTime(frequency, at);
        filter.Q.value = type === 'bandpass' ? 0.85 : 0.45;
        gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start(at);
        source.stop(at + duration + 0.006);
      };
      const bodyClack = (offset, duration, volume, from, to) => {
        const oscillator = c.createOscillator();
        const gain = c.createGain();
        const at = start + offset;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(from, at);
        oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
        gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.006);
      };

      noiseSnap(0, 0.026, 0.29, 3600, 'highpass');   // shutter button: click
      noiseSnap(0.028, 0.052, 0.34, 1900);           // shutter / mirror: clack
      noiseSnap(0.041, 0.024, 0.18, 4200, 'highpass');
      bodyClack(0.023, 0.046, 0.075, 330, 170);

      // Leave a small, audible pause before the mechanism resets. That
      // click–clack spacing makes the sound read as a physical camera.
      noiseSnap(0.166, 0.043, 0.25, 1500);
      noiseSnap(0.196, 0.029, 0.20, 3500, 'highpass');
      bodyClack(0.158, 0.055, 0.055, 260, 135);
    },
    missionSignal() {
      [523,659,784].forEach((f,i)=>tone(f,'triangle',i*0.08,0.22,0.04));
      tone(1047,'sine',0.26,0.28,0.03,1318);
      tone(784,'triangle',0.52,0.18,0.032,988);
      tone(2350,'sine',0.12,0.16,0.024,2900);
      tone(1760,'triangle',0.18,0.13,0.02,2240);
      tone(2620,'sine',0.26,0.11,0.022,3180);
      tone(1760,'triangle',0.20,0.08,0.018,1980);
      tone(2093,'sine',0.34,0.06,0.014,2350);
      tone(1865,'triangle',0.48,0.07,0.016,2140);
      tone(2489,'sine',0.62,0.05,0.012,2720);
    },
    missionBirds() {
      [
        [2489,'triangle',0.00,0.14,0.042,3180],
        [2960,'sine',    0.06,0.11,0.034,3520],
        [2637,'triangle',0.42,0.14,0.040,3320],
        [3136,'sine',    0.50,0.10,0.032,3720],
        [2794,'triangle',0.95,0.15,0.041,3460],
        [3322,'sine',    1.03,0.11,0.033,3880],
        [2350,'triangle',1.46,0.14,0.039,3010],
        [2960,'sine',    1.55,0.10,0.031,3560],
        [2637,'triangle',1.98,0.15,0.040,3340],
        [3136,'sine',    2.08,0.11,0.033,3740],
        [2794,'triangle',2.56,0.15,0.040,3470],
        [3520,'sine',    2.66,0.10,0.032,4020],
        [2489,'triangle',3.04,0.14,0.038,3200],
        [3322,'sine',    3.13,0.10,0.030,3860],
      ].forEach(args => tone(...args));
    },
    missionOminous() {
      tone(110,'sine',0,0.75,0.06,82);
      tone(220,'triangle',0.18,0.68,0.045,130);
      tone(55,'sine',0.42,0.5,0.05,42);
    },
    gizmoBark() {
      // Short two-part bark for Gizmo's shots: chunky low snap + tiny yip overtone.
      tone(190,'square',0,0.09,0.10,115);
      tone(360,'sawtooth',0.035,0.08,0.08,180);
      tone(760,'triangle',0.085,0.055,0.05,520);
    },
    missionCaptor() {
      tone(130,'sawtooth',0,0.28,0.10,55);
      tone(260,'square',0.03,0.18,0.07,95);
      tone(520,'sawtooth',0.12,0.12,0.045,180);
    },
    missionBossCharge() {
      tone(92,'sine',0,2.7,0.072,58);
      tone(146,'triangle',0.18,2.35,0.06,86);
      tone(220,'sawtooth',0.44,1.95,0.048,132);
      tone(330,'triangle',1.10,1.45,0.042,188);
      tone(660,'sawtooth',1.92,0.72,0.036,420);
    },
    missionZap() {
      tone(1600,'sawtooth',0,0.12,0.09,220);
      tone(900,'square',0.03,0.18,0.075,130);
      tone(70,'triangle',0.08,0.42,0.11,38);
      tone(2200,'sine',0.18,0.18,0.04,700);
    },
    missionJail() {
      tone(140,'square',0,0.18,0.11,70);
      tone(90,'triangle',0.10,0.34,0.10,42);
      tone(760,'square',0.05,0.05,0.055,280);
    },
    scaryLaugh() {
      [220,280,220,310,200,340,190].forEach((f,i) => {
        tone(f,'sawtooth',i*0.18,0.22,0.09,f*0.6);
        tone(f*1.5,'triangle',i*0.18+0.04,0.16,0.04,f*0.9);
      });
      tone(120,'square',1.3,0.5,0.07,55);
    },
    missionHero() {
      [392,523,659,784,1047].forEach((f,i)=>tone(f,'square',i*0.08,0.16,0.065));
      tone(1568,'sine',0.34,0.24,0.045);
    },
    // Low, wet, slightly comedic "toot" — a sawtooth wobbling down, on the ZAPPED
    // blaster's fart-shot. Deliberately silly, not a normal weapon sound.
    // Wetter and funnier — a short lowpass-filtered noise "plop" (same scaffold as
    // raceStart/emp, much softer) for the squelchy attack, plus two overlapping
    // descending tones a beat apart for a comedic wobble instead of one flat note.
    fart() {
      const c = getAudioCtx();
      const dur = 0.07;
      const bufferSize = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
      const noise = c.createBufferSource(); noise.buffer = buffer;
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 550;
      const gain = c.createGain();
      const t0 = c.currentTime + 0.02;
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      noise.connect(filter); filter.connect(gain); gain.connect(c.destination);
      noise.start(t0); noise.stop(t0 + dur + 0.02);
      tone(170,'sawtooth',0.01,0.24,0.09,55);
      tone(110,'triangle',0.07,0.20,0.07,40);
    },
    bomberDive() {
      const c = getAudioCtx();
      const dur = 0.12;
      const bufferSize = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      const noise = c.createBufferSource(); noise.buffer = buffer;
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200;
      const gain = c.createGain();
      const t0 = c.currentTime + 0.02;
      gain.gain.setValueAtTime(0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      noise.connect(filter); filter.connect(gain); gain.connect(c.destination);
      noise.start(t0); noise.stop(t0 + dur + 0.02);
    },
    emp() {
      const c = getAudioCtx();
      const dur = 0.15;
      const bufferSize = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      const noise = c.createBufferSource(); noise.buffer = buffer;
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 3000;
      const gain = c.createGain();
      const t0 = c.currentTime + 0.02;
      gain.gain.setValueAtTime(0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      noise.connect(filter); filter.connect(gain); gain.connect(c.destination);
      noise.start(t0); noise.stop(t0 + dur + 0.02);
    },
  };
})();

// ══════════════════════════════════════
//  TICKET CONFETTI
// ══════════════════════════════════════
function ticketConfetti(slow) {
  const cv = document.createElement('canvas');
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  cv.style.cssText = 'position:fixed;inset:0;z-index:9800;pointer-events:none';
  document.body.appendChild(cv);
  const cx = cv.getContext('2d');
  const COLORS = ['#ff8800','#ffcc00','#ff4444','#ffe61a','#ff66cc','#00e5ff','#ff6600'];
  const speedMult = slow ? 0.45 : 1;
  const pts = Array.from({length: 70}, () => ({
    x: Math.random() * cv.width,
    y: -10 - Math.random() * 120,
    vx: (Math.random() - 0.5) * 5 * speedMult,
    vy: (2.5 + Math.random() * 3) * speedMult,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.22,
    w: 10 + Math.random() * 14,
    h: 5 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 1,
  }));
  const t0 = performance.now();
  function tick(ts) {
    const elapsed = ts - t0;
    cx.clearRect(0, 0, cv.width, cv.height);
    let any = false;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vrot; p.vy += 0.08 * speedMult;
      if (elapsed > 1600) p.alpha = Math.max(0, p.alpha - 0.018);
      if (p.alpha <= 0 || p.y > cv.height + 20) continue;
      any = true;
      cx.save();
      cx.globalAlpha = p.alpha;
      cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.fillStyle = p.color;
      cx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      // Ticket holes
      cx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let i = 1; i <= 3; i++) {
        cx.beginPath();
        cx.arc(-p.w/2 + i * p.w/4, 0, p.h * 0.18, 0, Math.PI * 2);
        cx.fill();
      }
      cx.restore();
    }
    if (any) requestAnimationFrame(tick); else cv.remove();
  }
  requestAnimationFrame(tick);
}

// ══════════════════════════════════════
//  ARCADE MUSIC
// ══════════════════════════════════════
const ArcadeMusic = (() => {
  let muted = false, started = false;
  const FULL_VOL = 0.04, DUCK_VOL = 0.01;
  let targetVol = FULL_VOL;
  let gainNode = null, sourceNode = null, audioBuffer = null, loadStarted = false;
  let loadError = false;
  // Set by stop(), cleared by start()/duck()/unduck(). Whack/Match/Space all call
  // stop() the instant real gameplay begins (silence the lobby loop during play),
  // but body keeps its .on-whack/.on-match/.on-space class for the whole game, and
  // gameplay is inherently click/touch-driven — so the global auto-resume listeners
  // below used to immediately undo that stop() on the player's very first tap. This
  // flag lets them tell "deliberately silenced for gameplay" apart from "autoplay
  // hasn't unlocked yet" (the actual case those listeners exist to handle).
  let suppressAutoResume = false;

  // Web Audio API, not a plain <audio> element — a looping <audio>/<video> element can
  // get silently promoted by iOS to a real background media session (lock-screen "Now
  // Playing" card, continues after leaving Safari). Once that happens, the ACTUAL volume
  // is driven by the phone's hardware volume slider, not audio.volume — which is exactly
  // why ducking did nothing and it played painfully loud on mobile only. Web Audio output
  // is never promoted that way: no lock-screen card, no background continuation, and the
  // GainNode directly attenuates the signal regardless of hardware volume position.
  function loadBuffer() {
    if (loadStarted) return;
    loadStarted = true;
    loadError = false;
    const ctx = getAudioCtx();
    gainNode = ctx.createGain();
    gainNode.gain.value = muted ? 0 : targetVol;
    gainNode.connect(ctx.destination);
    fetch('arcademusic.mp3')
      .then(r => { if (!r.ok) throw new Error('fetch failed: ' + r.status); return r.arrayBuffer(); })
      .then(data => ctx.decodeAudioData(data))
      .then(buf => {
        audioBuffer = buf;
        loadError = false;
        if (started) playSource();
        if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
      })
      .catch(e => {
        // Previously a silent no-op that also left loadStarted permanently true — meaning
        // a single failed attempt (transient network blip, etc.) bricked music for the
        // rest of the session with zero visibility into why. Now it logs and allows retry.
        console.warn('[ArcadeMusic] failed to load arcademusic.mp3:', e);
        loadStarted = false;
        loadError = true;
        if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
      });
  }

  function playSource() {
    if (!audioBuffer) return;
    const ctx = getAudioCtx();
    if (sourceNode) {
      if (ctx.state !== 'running' && ctx.resume) {
        ctx.resume().finally(() => {
          if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
          if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
        });
      }
      return;
    }
    if (ctx.state !== 'running') {
      if (ctx.resume) {
        ctx.resume().then(() => {
          if (started && !muted) playSource();
          if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
          if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
        }).catch(() => {
          if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
        });
      }
      if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
      return;
    }
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.loop = true;
    sourceNode.connect(gainNode);
    sourceNode.start(0);
    requestAnimationFrame(() => {
      if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
      if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
    });
  }

  function stopSource() {
    if (sourceNode) { try { sourceNode.stop(); } catch (e) {} sourceNode.disconnect(); sourceNode = null; }
  }

  function startPlayback() {
    started = true;
    loadBuffer();
    playSource();
  }

  return {
    start() {
      suppressAutoResume = false;
      if (muted) return;
      startPlayback();
    },
    stop() { started = false; suppressAutoResume = true; stopSource(); },
    duck()   { suppressAutoResume = false; targetVol = DUCK_VOL; if (gainNode && !muted) gainNode.gain.value = DUCK_VOL; },
    unduck() { suppressAutoResume = false; targetVol = FULL_VOL; if (gainNode && !muted) gainNode.gain.value = FULL_VOL; },
    toggleMute() {
      muted = !muted;
      if (gainNode) gainNode.gain.value = muted ? 0 : targetVol;
      if (muted) { stopSource(); started = false; }
      else { suppressAutoResume = false; startPlayback(); }
      return muted;
    },
    get muted()   { return muted; },
    get playing() { return !!sourceNode && (!_sharedAudioCtx || _sharedAudioCtx.state === 'running'); },
    get loading() { return !muted && started && loadStarted && !sourceNode && !loadError; },
    get suppressAutoResume() { return suppressAutoResume; },
  };
})();

// Resume/start music on any user tap while on arcade pages — but only to unlock
// autoplay (cold load / browser blocked it), never to fight a deliberate
// ArcadeMusic.stop() from a game that's actively silencing music for gameplay.
document.addEventListener('click', function() {
  const onArcade = document.body.matches('.on-lobby,.on-signin,.on-whack,.on-match,.on-space,.on-signal,.on-snoob,.on-consume,.on-char');
    if (onArcade && !ArcadeMusic.playing && !ArcadeMusic.muted && !ArcadeMusic.suppressAutoResume) {
      ArcadeMusic.start();
      updateArcadeMusicPrompt();
      setTimeout(updateArcadeMusicPrompt, 180);
    }
}, { passive: true });
document.addEventListener('touchstart', function() {
  const onArcade = document.body.matches('.on-lobby,.on-signin,.on-whack,.on-match,.on-space,.on-signal,.on-snoob,.on-consume,.on-char');
    if (onArcade && !ArcadeMusic.playing && !ArcadeMusic.muted && !ArcadeMusic.suppressAutoResume) {
      ArcadeMusic.start();
      updateArcadeMusicPrompt();
      setTimeout(updateArcadeMusicPrompt, 180);
    }
}, { passive: true });

// ══════════════════════════════════════
//  LOCAL LEADERBOARD
// ══════════════════════════════════════
const LB = (() => {
  const KEY = 'moberino-lb-v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)||'{}'); } catch(e) { return {}; } }
  function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }

  return {
    add(game, name, score, extra, ascending) {
      const data = load();
      if (!data[game]) data[game] = [];
      data[game].push({ name: name.trim().slice(0,12).toUpperCase(), score, extra, date: new Date().toLocaleDateString() });
      data[game].sort((a,b) => ascending ? a.score - b.score : b.score - a.score);
      data[game] = data[game].slice(0, 10);
      save(data);
    },
    get(game) {
      const data = load();
      const rows = data[game] || [];
      if (game !== 'whack') return rows;
      const filtered = filterLbRows(game, rows);
      if (filtered.length !== rows.length) {
        data[game] = filtered;
        save(data);
      }
      return filtered;
    },
    html(game, neonColor) {
      const rows = this.get(game);
      return renderLbRows(rows.slice(0,5).map(r => ({ name: r.name, extra: r.extra, displayScore: r.score })), neonColor);
    }
  };
})();

function fmtTimeG(s) { s = Math.max(0, Math.round(s)); return Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60; }

function renderLbRows(rows, neonColor) {
  if (!rows || !rows.length) return '<div style="font-size:18px;letter-spacing:2px;opacity:0.4;text-align:center;padding:24px 0">NO SCORES YET</div>';
  return `<table style="width:100%;border-collapse:collapse;font-family:VCR,monospace;font-size:18px">` +
    rows.slice(0,5).map((r,i)=>
      `<tr>
        <td style="padding:4px 8px;color:${i===0?neonColor:'rgba(242,239,232,0.6)'}">${i===0?'👑':'#'+(i+1)}</td>
        <td style="padding:4px 8px;color:${i===0?neonColor:'rgba(242,239,232,0.8)'};letter-spacing:2px">${r.name}</td>
        <td style="padding:4px 8px;text-align:right;color:${i===0?neonColor:'rgba(242,239,232,0.7)'}">${r.displayScore}</td>
        <td style="padding:4px 8px;text-align:right;color:rgba(242,239,232,0.35);font-size:13px">${r.extra||''}</td>
      </tr>`
    ).join('') + '</table>';
}

function filterLbRows(game, rows) {
  if (!rows || !rows.length) return [];
  if (game !== 'whack') return rows;
  return rows.filter(r => {
    const score = Number(r.score);
    if (!Number.isFinite(score) || score < 0 || score > 50) return false;
    const extra = (r.extra || '').trim().toUpperCase();
    if (extra && !/^(EASY|HARD)$/.test(extra)) return false;
    return true;
  });
}

function getWhackLeaderboardKey(options) {
  const opts = options || {};
  const mode = opts.mode || window._whackMode || 'frenzy';
  const level = opts.difficulty || window._whackDifficulty || 'hard';
  return `whack-${mode}-${level}`;
}

function getMatchLeaderboardKey(options) {
  const opts = options || {};
  const mode = opts.mode || window._matchMode || 'hard';
  const pairs = opts.pairs || window._matchFreePairs || 8;
  return mode === 'free' ? `match-free-${pairs}` : `match-${mode}`;
}

function getSpaceLeaderboardKey() {
  return 'space';
}

function getLeaderboardKey(game, options) {
  const opts = options || {};
  if (game === 'whack') return opts.key || getWhackLeaderboardKey();
  if (game === 'match') return opts.key || getMatchLeaderboardKey();
    if (game === 'space') return opts.key || getSpaceLeaderboardKey();
    if (game === 'snoob') return opts.key || 'snoob';
    if (game === 'consume') return opts.key || 'consume';
    return opts.key || game;
}

function getLeaderboardBoards() {
  return [
    { key: 'whack-classic-easy', label: '30 SECOND RUSH · NORMAL', color: '#b884ff', field: 'score' },
    { key: 'whack-classic-hard', label: '30 SECOND RUSH · HARD', color: '#b884ff', field: 'score' },
    { key: 'whack-frenzy-easy', label: '3 LIVES · NORMAL', color: '#33cc66', field: 'score' },
    { key: 'whack-frenzy-hard', label: '3 LIVES · HARD', color: '#33cc66', field: 'score' },
    { key: 'match-hard', label: 'MEMORY MOBE · HARD', color: '#ffe61a', field: 'seconds' },
    { key: 'match-challenge', label: 'MEMORY MOBE · CHALLENGE', color: '#ff9933', field: 'seconds' },
    { key: 'match-impossible', label: 'MEMORY MOBE · IMPOSSIBLE', color: '#ff4444', field: 'score' },
    { key: 'space', label: 'SPACE MOBE', color: '#33ff66', field: 'score' },
    { key: 'snoob', label: 'SNOOB', color: '#e4b65f', field: 'score' },
    { key: 'consume', label: 'TILE SWAP · GRID', color: '#ff7180', field: 'score' },
    { key: 'consume-words', label: 'TILE SWAP · WORDS', color: '#ff7180', field: 'score' },
    { key: 'consume-numbers', label: 'TILE SWAP · RUMMY', color: '#ff7180', field: 'score' },
  ];
}

function getLeaderboardGroups() {
  const boards = getLeaderboardBoards();
  return [
    { id: 'whack', tab: 'WHACK', title: 'WHACK-A-MOBE', color: '#b884ff', keys: ['whack-classic-easy', 'whack-classic-hard', 'whack-frenzy-easy', 'whack-frenzy-hard'] },
    { id: 'memory', tab: 'MEMORY', title: 'MEMORY MOBE', color: '#ffe61a', keys: ['match-hard', 'match-challenge', 'match-impossible'] },
    { id: 'space', tab: 'SPACE', title: 'SPACE MOBE', color: '#33ff66', keys: ['space'] },
    { id: 'snoob', tab: 'SNOOB', title: 'SNOOB', color: '#e4b65f', keys: ['snoob'] },
    { id: 'tile', tab: 'TILE SWAP', title: 'TILE SWAP', color: '#ff7180', keys: ['consume', 'consume-words', 'consume-numbers'] },
  ].map(group => ({ ...group, boards: group.keys.map(key => boards.find(b => b.key === key)).filter(Boolean) }));
}

function getLeaderboardBoardMeta(game, options) {
  const key = getLeaderboardKey(game, options);
  const board = getLeaderboardBoards().find(b => b.key === key);
  if (board) return board;
  const fallbackColor = game === 'whack' ? '#ff00cc' : game === 'match' ? '#ffe61a' : game === 'signal' ? '#8f73ff' : game === 'snoob' ? '#e4b65f' : game === 'consume' ? '#ff7180' : '#33ff66';
  return { key, label: key.toUpperCase(), color: fallbackColor, field: 'score' };
}

// ══════════════════════════════════════
//  SHARED PLAYER IDENTITY (one save code across every journey/rack game)
// ══════════════════════════════════════
// Each game keeps its own progress store (profiles keyed by tag), so switching
// which tag is "active" never deletes anything — old codes just sit unused
// under their own key until re-entered. This just tracks which tag should be
// active by default: games check it on load and retroactively adopt it, and
// any rename/adopt in one game writes back here so the others pick it up too.
const PLAYER_TAG_KEY = 'moberino-player-tag';
window.PlayerID = {
  get() {
    try { return localStorage.getItem(PLAYER_TAG_KEY) || null; } catch (e) { return null; }
  },
  set(tag) {
    try { if (tag) localStorage.setItem(PLAYER_TAG_KEY, tag); } catch (e) {}
  },
  clear() {
    try { localStorage.removeItem(PLAYER_TAG_KEY); } catch (e) {}
  },
};

const PLAYER_TAG_WORDS = [
  'COMET', 'MANGO', 'PIZZA', 'DISCO', 'LASER', 'LEMON', 'BERRY', 'MAPLE',
  'JELLY', 'BAGEL', 'NACHO', 'SPARK', 'TURBO', 'COSMO', 'ASTRO',
];
let proposedPlayerTag = '';

function cleanPlayerTag(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
function validPlayerTag(tag) {
  return /^[A-Z]{5}[0-9]{2}$/.test(String(tag || ''));
}
function makePlayerTag() {
  return PLAYER_TAG_WORDS[Math.floor(Math.random() * PLAYER_TAG_WORDS.length)] + (10 + Math.floor(Math.random() * 90));
}
function preparePlayerSignIn() {
  if (PlayerID.get() && !window._forcePlayerSignIn) { nav('lobby'); return; }
  proposedPlayerTag = makePlayerTag();
  const value = document.getElementById('arcade-random-code-value');
  const input = document.getElementById('arcade-signin-input');
  const error = document.getElementById('arcade-signin-error');
  if (value) value.textContent = proposedPlayerTag;
  if (input) input.value = '';
  if (error) error.textContent = '';
}
function seedJourneyStore(storageKey, tag, highestLevel) {
  if (!highestLevel) return;
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
    data.profiles ||= {};
    data.profiles[tag] ||= { stars: {} };
    data.profiles[tag].stars ||= {};
    for (let level = 1; level <= highestLevel; level++) data.profiles[tag].stars[level] ||= 1;
    data.active = tag;
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch (e) { console.warn('[PlayerID] could not restore', storageKey, e); }
}
async function restorePlayerProgress(tag) {
  if (typeof RemoteLB === 'undefined' || !RemoteLB.lookup) return;
  const journeys = [
    ['consume', 'moberino-consume-v1'],
    ['consume-words', 'moberino-knot-swap-words-v2'],
    ['consume-numbers', 'moberino-knot-swap-numbers-v2'],
    ['snoob-journey', 'moberino-snoob-v1'],
    ['word', 'moberino-word-v1'],
  ];
  const rows = await Promise.all(journeys.map(([game]) => RemoteLB.lookup(game, tag)));
  rows.forEach((row, index) => {
    if (row) seedJourneyStore(journeys[index][1], tag, Math.max(0, Math.round(Number(row.score) || 0)));
  });
}
async function finishPlayerSignIn(tag, restore) {
  let profile = { ok: true, existed: false };
  if (typeof ArcadeProfiles !== 'undefined') {
    profile = await ArcadeProfiles.activate(tag, { create: true, requireRemote: true });
    if (!profile.ok) throw new Error('PROFILE_UNAVAILABLE');
  }
  PlayerID.set(tag);
  if (restore && !profile.existed && !profile.cached) {
    await restorePlayerProgress(tag);
    if (typeof ArcadeProfiles !== 'undefined') await ArcadeProfiles.syncNow(tag);
  }
  window._forcePlayerSignIn = false;
  window._arcadeSessionStarted = false;
  updatePlayerStatus();
  SFX.menuSelect();
  nav('lobby');
}
window.useEnteredPlayerCode = async function() {
  const input = document.getElementById('arcade-signin-input');
  const error = document.getElementById('arcade-signin-error');
  const button = document.querySelector('.arcade-signin-entry button');
  const tag = cleanPlayerTag(input && input.value);
  if (!validPlayerTag(tag)) {
    if (error) error.textContent = 'ENTER 5 LETTERS + 2 NUMBERS';
    if (input) input.focus();
    return;
  }
  if (input) input.disabled = true;
  if (button) { button.disabled = true; button.textContent = 'CHECKING...'; }
  if (error) error.textContent = 'RESTORING PROGRESS...';
  try { await finishPlayerSignIn(tag, true); }
  catch (profileError) {
    if (error) error.textContent = 'COULD NOT LOAD THAT PROFILE · CHECK CONNECTION';
  }
  finally {
    if (input) input.disabled = false;
    if (button) { button.disabled = false; button.textContent = 'ENTER CODE'; }
  }
};
window.useRandomPlayerCode = async function() {
  const button = document.getElementById('arcade-random-code');
  const error = document.getElementById('arcade-signin-error');
  if (button) button.disabled = true;
  try {
    let tag = proposedPlayerTag || makePlayerTag();
    if (typeof ArcadeProfiles !== 'undefined' && ArcadeProfiles.exists) {
      for (let attempt = 0; attempt < 12 && await ArcadeProfiles.exists(tag); attempt++) tag = makePlayerTag();
    } else if (typeof RemoteLB !== 'undefined' && RemoteLB.tagExists) {
      for (let attempt = 0; attempt < 12 && await RemoteLB.tagExists(tag); attempt++) tag = makePlayerTag();
    }
    proposedPlayerTag = tag;
    const value = document.getElementById('arcade-random-code-value');
    if (value) value.textContent = tag;
    await finishPlayerSignIn(tag, false);
  } catch (profileError) {
    if (error) error.textContent = 'COULD NOT CREATE PROFILE · CHECK CONNECTION';
  } finally {
    if (button) button.disabled = false;
  }
};
window.updatePlayerStatus = function() {
  const status = document.getElementById('arcade-player-status');
  const tag = PlayerID.get();
  if (!status) return;
  status.hidden = !tag;
  const strong = status.querySelector('strong');
  if (strong) strong.textContent = tag || '';
};
window.openPlayerSignIn = function() {
  window._forcePlayerSignIn = true;
  SFX.menuSelect();
  nav('signin');
};

// ══════════════════════════════════════
//  SHARED LEADERBOARD (Supabase — one table, public anon read+insert via RLS)
// ══════════════════════════════════════
// One shared "leaderboard_entries" table holds rows for every game, told apart by the
// `game` column. The anon key below is meant to be public (it's the whole point of a
// client-side public API key) — RLS policies on the table are what actually constrain
// it to read+insert only, nothing else.
const RemoteLB = (() => {
  const SUPABASE_URL = 'https://gsetfibwyygirpuuvcbs.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzZXRmaWJ3eXlnaXJwdXV2Y2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzIyMTAsImV4cCI6MjA5NzY0ODIxMH0.PV5Yh3FKFXhg3Wf2sqblEx4OICcHVth0rkGitga0DJo';
  const TABLE_URL = `${SUPABASE_URL}/rest/v1/leaderboard_entries`;
  const HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

  // Per-game ranking: which column decides the order, and which direction wins.
  const SORT = {
    'whack-classic-easy':  { col: 'score',   dir: 'desc' },
    'whack-classic-hard':   { col: 'score',   dir: 'desc' },
    'whack-frenzy-easy':    { col: 'score',   dir: 'desc' },
    'whack-frenzy-hard':    { col: 'score',   dir: 'desc' },
    'match-free-4':         { col: 'score',   dir: 'asc'  },
    'match-free-5':         { col: 'score',   dir: 'asc'  },
    'match-free-6':         { col: 'score',   dir: 'asc'  },
    'match-free-7':         { col: 'score',   dir: 'asc'  },
    'match-free-8':         { col: 'score',   dir: 'asc'  },
    'match-free-9':         { col: 'score',   dir: 'asc'  },
    'match-free-10':        { col: 'score',   dir: 'asc'  },
    'match-free-11':        { col: 'score',   dir: 'asc'  },
    'match-free-12':        { col: 'score',   dir: 'asc'  },
    'match-free-13':        { col: 'score',   dir: 'asc'  },
    'match-free-14':        { col: 'score',   dir: 'asc'  },
    'match-free-15':        { col: 'score',   dir: 'asc'  },
    'match-free-16':        { col: 'score',   dir: 'asc'  },
    'match-free-17':        { col: 'score',   dir: 'asc'  },
    'match-free-18':        { col: 'score',   dir: 'asc'  },
    'match-free-19':        { col: 'score',   dir: 'asc'  },
    'match-free-20':        { col: 'score',   dir: 'asc'  },
    'match-hard':           { col: 'seconds', dir: 'asc'  },
    'match-challenge':   { col: 'seconds', dir: 'asc'  },
    'match-impossible':  { col: 'score',   dir: 'asc'  },
    space:                { col: 'score',   dir: 'desc' },
    signal:               { col: 'score',   dir: 'desc' },
    snoob:                { col: 'score',   dir: 'desc' },
    'snoob-journey':      { col: 'score',   dir: 'desc' },
    word:                 { col: 'score',   dir: 'desc' },
    consume:              { col: 'score',   dir: 'desc' },
    'consume-words':      { col: 'score',   dir: 'desc' },
    'consume-numbers':    { col: 'score',   dir: 'desc' },
    pet:                  { col: 'score',   dir: 'desc' },
  };

  function isConfigured(game) { return !!SORT[game]; }

  function submit(game, name, score, seconds, text) {
    if (!isConfigured(game)) return Promise.resolve(false);
    const body = {
      game, name: name.trim().slice(0,12).toUpperCase(),
      score: Math.max(0, Math.round(score)), seconds: Math.max(0, Math.round(seconds||0)),
      extra: (text || '').slice(0, 60),
    };
    return fetch(TABLE_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    }).then(async r => {
      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
      return true;
    });
  }

  function fetchTop(game, count) {
    if (!isConfigured(game)) return Promise.resolve(null);
    const s = SORT[game];
    const limit = count || 5;
    const url = `${TABLE_URL}?game=eq.${encodeURIComponent(game)}&order=${s.col}.${s.dir}&limit=${limit}`;
    return fetch(url, { headers: HEADERS }).then(r => r.json()).then(rows => {
      let out = (rows || []).map(r => ({ name: r.name, score: r.score, seconds: r.seconds, extra: r.extra }));
      return out;
    }).catch(e => { console.warn('[RemoteLB] fetch failed:', game, e); return null; });
  }

  // Best remote row for a specific tag — lets a journey restore across devices.
  function lookup(game, name) {
    if (!isConfigured(game)) return Promise.resolve(null);
    const s = SORT[game];
    const tag = String(name || '').trim().toUpperCase().slice(0, 12);
    if (!tag) return Promise.resolve(null);
    const url = `${TABLE_URL}?game=eq.${encodeURIComponent(game)}&name=eq.${encodeURIComponent(tag)}&order=${s.col}.${s.dir}&limit=1`;
    return fetch(url, { headers: HEADERS }).then(r => r.json())
      .then(rows => (rows && rows[0]) ? { name: rows[0].name, score: rows[0].score, extra: rows[0].extra } : null)
      .catch(() => null);
  }

  // Generated player codes must not collide with any code that already has remote
  // progress, regardless of which journey created it first.
  function tagExists(name) {
    const tag = String(name || '').trim().toUpperCase().slice(0, 12);
    if (!tag) return Promise.resolve(false);
    const url = `${TABLE_URL}?select=name&name=eq.${encodeURIComponent(tag)}&limit=1`;
    return fetch(url, { headers: HEADERS }).then(async r => {
      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
      const rows = await r.json();
      return !!(rows && rows.length);
    }).catch(() => false);
  }

  window.SignalRecipeRemote = {
    submit(name, score, extra, recipe) {
      const body = {
        name: name.trim().slice(0, 12).toUpperCase(),
        score: Math.max(0, Math.round(score)),
        extra: (extra || '').slice(0, 60),
        recipe,
      };
      return fetch(`${SUPABASE_URL}/rest/v1/signal_recipes`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
        return true;
      });
    },
    fetchTop(count) {
      const url = `${SUPABASE_URL}/rest/v1/signal_recipes?select=id,name,score,extra,recipe,created_at&order=score.desc&limit=${count || 20}`;
      return fetch(url, { headers: HEADERS }).then(async r => {
        if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
        return r.json();
      }).then(rows => (rows || []).map(row => ({
        id: row.id,
        name: row.name,
        score: row.score,
        extra: row.extra,
        date: row.created_at ? new Date(row.created_at).toLocaleDateString() : '',
        recipe: row.recipe,
        remote: true,
      })));
    },
  };

  return { submit, fetchTop, lookup, tagExists, isConfigured };
})();
window.RemoteLB = RemoteLB;

// Renders the local cache instantly, then swaps in the shared Supabase board once it
// loads. If that fetch fails, the local board just stays put — no error shown, this
// is meant to degrade invisibly.
function loadRemoteBoard(game, targetId, neonColor, field) {
  const target = document.getElementById(targetId);
  if (!target) return;
  try { target.innerHTML = LB.html(game, neonColor); }
  catch(e) { target.innerHTML = ''; console.warn('[LB] render failed:', game, e); }
  const count = String(game).startsWith('whack') ? 10 : 5;
  let pending;
  try { pending = RemoteLB.fetchTop(game, count); }
  catch(e) { console.warn('[RemoteLB] fetch failed:', game, e); return; }
  if (!pending || typeof pending.then !== 'function') return;
  pending.then(entries => {
    if (entries === null) return;
    const el = document.getElementById(targetId);
    if (!el) return; // user navigated away before this resolved
    const filtered = filterLbRows(game, entries).slice(0, 3);
    const rows = filtered.map(e => ({ name: e.name, extra: e.extra, displayScore: field === 'seconds' ? fmtTimeG(e.seconds) : e.score }));
    el.innerHTML = renderLbRows(rows, neonColor);
  }).catch(e => console.warn('[RemoteLB] fetch failed:', game, e));
}

function mountSelectionArt(targetId, game) {
  const host = document.getElementById(targetId);
  if (!host) return;
  const source = document.querySelector(`#ci-${game} .game-card-art svg`);
  if (!source) return;
  const artFrame = document.createElement('div');
  artFrame.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
  const art = source.cloneNode(true);
  const artFrames = {
    whack: 'position:absolute;left:50%;top:50%;width:132%;height:132%;transform:translate(-50%,-56%) scale(1.08);transform-origin:center center',
    match: 'position:absolute;left:50%;top:50%;width:130%;height:130%;transform:translate(-50%,-53%) scale(1.08);transform-origin:center center',
    space: 'position:absolute;left:50%;top:50%;width:130%;height:130%;transform:translate(-50%,-54%) scale(1.08);transform-origin:center center',
    snoob: 'position:absolute;left:50%;top:50%;width:130%;height:130%;transform:translate(-50%,-53%) scale(1.08);transform-origin:center center',
    consume: 'position:absolute;left:50%;top:50%;width:130%;height:130%;transform:translate(-50%,-53%) scale(1.08);transform-origin:center center',
    pet: 'position:absolute;left:50%;top:50%;width:130%;height:130%;transform:translate(-50%,-53%) scale(1.08);transform-origin:center center',
  };
  art.style.cssText = artFrames[game] || artFrames.whack;
  artFrame.appendChild(art);
  host.replaceChildren(artFrame);
}

window.saveArcadeLeaderboard = async function(boardKey, localScore, remoteScore, seconds, extra, ascending, inputId, statusId, boardTargetId, neonColor, field, artTargetId, artGame) {
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  if (!input || !input.value.trim()) {
    if (status) {
      status.style.display = 'block';
      status.textContent = 'ENTER NAME';
    }
    return;
  }
  const name = input.value.trim();
  const row = input.closest('[data-save-row="arcade"]');
  const btn = document.getElementById(`${inputId}-save`);
  input.disabled = true;
  if (btn) btn.disabled = true;
  if (status) { status.style.display = 'block'; status.textContent = 'SAVING...'; }
  if (btn) btn.textContent = '...';
  try { LB.add(boardKey, name, localScore, extra, ascending); } catch(e) { console.warn('[LB] local save failed:', e); }
  let remoteSaved = false;
  try {
    remoteSaved = await RemoteLB.submit(boardKey, name, remoteScore, seconds, extra);
  } catch(e) {
    console.warn('[RemoteLB] submit failed:', boardKey, e);
  }
  const savedText = remoteSaved === false ? '✓ SAVED LOCAL' : '✓ SUBMITTED';
  const savedColor = remoteSaved === false ? '#ffe61a' : neonColor;
  if (status) status.textContent = remoteSaved === false ? 'ONLINE SAVE FAILED' : 'SUBMITTED';
  if (row) {
    row.innerHTML = `<div style="width:100%;height:40px;box-sizing:border-box;border:1.5px solid ${savedColor};border-radius:4px;background:${savedColor}18;color:${savedColor};display:flex;align-items:center;justify-content:center;gap:8px;font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;text-shadow:0 0 8px ${savedColor}66">${savedText}</div>`;
  } else if (btn) {
    btn.textContent = '✓';
  }
  loadRemoteBoard(boardKey, boardTargetId, neonColor, field);
  mountSelectionArt(artTargetId, artGame);
};

function handleArcadeLeaderboardSubmit(e) {
  const btn = e.target.closest && e.target.closest('[data-arcade-save]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.eligible === 'false') return;
  e.preventDefault();
  e.stopPropagation();
  const d = btn.dataset;
  window.saveArcadeLeaderboard(
    d.boardKey,
    Number(d.localScore),
    Number(d.remoteScore),
    Number(d.seconds || 0),
    d.extra || '',
    d.ascending === 'true',
    d.inputId,
    d.statusId,
    d.boardTargetId,
    d.neonColor,
    d.field || 'score',
    d.artTargetId,
    d.artGame
  );
}
document.addEventListener('click', handleArcadeLeaderboardSubmit, true);
document.addEventListener('pointerup', handleArcadeLeaderboardSubmit, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const input = e.target.closest && e.target.closest('[data-arcade-name]');
  if (!input) return;
  const row = input.closest('[data-save-row="arcade"]');
  const btn = row && row.querySelector('[data-arcade-save]');
  if (btn) handleArcadeLeaderboardSubmit({ target: btn, preventDefault(){ e.preventDefault(); }, stopPropagation(){ e.stopPropagation(); } });
}, true);

function buildArcadeResultCard(options) {
  const uid = options.uid;
  const boardKey = options.boardKey;
  const artGame = options.artGame;
  const color = options.color;
  const title = options.title || '';
  const scoreLabel = options.scoreLabel || 'YOUR SCORE';
  const scoreValue = options.scoreValue;
  const saveValue = Object.prototype.hasOwnProperty.call(options, 'saveValue') ? options.saveValue : scoreValue;
  const scoreExtra = options.scoreExtra || '';
  const boardField = options.field || 'score';
  const boardTargetId = `${uid}-board`;
  const artTargetId = `${uid}-art`;
  const inputId = `${uid}-name`;
  const statusId = `${uid}-status`;
  const submitLabel = options.submitLabel || '▶';
  const saveButtonId = `${inputId}-save`;
  const canSave = options.canSave !== false;
  const rowsLine = options.rowsLine || '';
  const statusLine = options.statusLine || '';
  const buttons = options.buttons || '';
  const showBoard = options.showBoard !== false;
  const showSaveArea = options.showSaveArea !== false;
  const saveMarginTop = Object.prototype.hasOwnProperty.call(options, 'saveMarginTop') ? options.saveMarginTop : 26;
  const playerTag = (() => {
    try { return PlayerID.get() || ''; }
    catch (e) { return ''; }
  })();
  const attr = value => String(value ?? '').replace(/[&"<>\u0000-\u001f]/g, ch => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;'
  }[ch] || ''));
  return `
    <div class="arcade-cabinet arcade-result-card" style="--nc:${color};--result-color:${color};max-width:${options.maxWidth || 430}px;width:92vw;position:relative">
      <div id="${artTargetId}" class="arcade-result-art"></div>
      <div class="arcade-cab-rail"></div>
      <div class="arcade-cab-marquee" style="background:${options.marqueeSolid ? (options.marqueeBg || color) : `linear-gradient(135deg,${color},${options.marqueeEnd || '#0e0b1d'})`};opacity:0.9">${options.marquee || 'GAME OVER'}</div>
      <div class="arcade-cab-screen" style="position:relative;z-index:2;overflow:hidden;padding:14px 14px 12px;min-height:${options.minHeight || 0}px;background:rgba(5,3,16,0.90)">
        <div style="position:relative;z-index:2;display:flex;flex-direction:column;gap:8px">
          ${title ? `<div style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:${color};text-shadow:0 0 16px ${color}88;line-height:1">${title}</div>` : ''}
          <div style="display:flex;flex-direction:column;gap:6px;text-align:center;padding-top:2px">
            <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:3px;color:rgba(242,239,232,0.42)">${scoreLabel}</div>
            <div style="font-family:'Bebas Neue',cursive;font-size:48px;letter-spacing:4px;color:${color};line-height:1;text-shadow:0 0 18px ${color}88">${scoreValue}</div>
            ${scoreExtra ? `<div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.42)">${scoreExtra}</div>` : ''}
            ${rowsLine ? `<div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.34)">${rowsLine}</div>` : ''}
            ${statusLine ? `<div id="${statusId}" style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:${color};text-shadow:0 0 8px ${color}66">${statusLine}</div>` : `<div id="${statusId}" style="display:none"></div>`}
          </div>
          ${showBoard ? `<div id="${boardTargetId}" class="arcade-result-board"></div>` : `<div id="${boardTargetId}" hidden></div>`}
          ${showSaveArea && canSave ? `<div class="arcade-result-save-label">${playerTag ? 'SAVE TO YOUR ARCADE PROFILE' : 'SAVE YOUR SCORE'}</div><div data-save-row="arcade" class="arcade-result-save" style="margin-top:${saveMarginTop}px">
            <input id="${inputId}" data-arcade-name="1" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ARCADE NAME" value="${attr(playerTag)}"
              style="flex:1;min-width:0;height:40px;box-sizing:border-box;background:#0e0b22;border:1.5px solid ${color};border-radius:4px;padding:10px 12px;font-family:'VCR',monospace;font-size:15px;letter-spacing:4px;color:#fff;text-align:center;text-transform:uppercase;outline:none">
            <button id="${saveButtonId}" type="button" aria-label="Submit score" data-arcade-save="1"
              data-board-key="${attr(boardKey)}" data-local-score="${attr(saveValue)}" data-remote-score="${attr(saveValue)}" data-seconds="${attr(options.seconds || 0)}" data-extra="${attr(options.extra || '')}" data-ascending="${options.ascending ? 'true' : 'false'}"
              data-input-id="${attr(inputId)}" data-status-id="${attr(statusId)}" data-board-target-id="${attr(boardTargetId)}" data-neon-color="${attr(color)}" data-field="${attr(boardField)}" data-art-target-id="${attr(artTargetId)}" data-art-game="${attr(artGame)}" data-eligible="true"
              style="flex:0 0 44px;width:44px;height:40px;box-sizing:border-box;background:${color}22;border:1.5px solid ${color};border-radius:4px;color:${color};cursor:pointer;text-shadow:0 0 8px ${color}66;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center">${submitLabel}</button>
          </div>` : showSaveArea ? `<div class="arcade-result-ineligible" style="margin-top:${saveMarginTop}px">CLEAR THE MODE TO SAVE A LEADERBOARD SCORE</div>` : ''}
        </div>
      </div>
      <div class="arcade-cab-foot" style="position:relative;z-index:2;flex-direction:column;align-items:center;gap:8px;background:rgba(5,3,16,0.90);padding:22px 16px 18px;border-top:1px solid rgba(242,239,232,0.12)">${buttons}</div>
    </div>`;
}

// ── Carousel (infinite loop, index-driven) ─────────────────────────────────
// A single #game-carousel-track element is positioned with transform:translateX(),
// animated with a CSS transition, and dragged with Pointer Events — one code path
// drives both mouse (desktop arrows/drag) and touch (mobile swipe), so the loop
// works the same way everywhere instead of desktop using a scripted scroll tween
// and touch relying on native scroll-snap (which couldn't wrap at all). The
// infinite loop keeps a buffer of cloned cards past each end of the track
// (sized to however many are actually visible at once, see bufferPerSide
// below); wrapping animates one step onto the outermost buffered clone like
// any other step, then `transitionend` — not a scroll-event guess — instantly
// swaps to the matching real card once the animation is provably finished.
let _carouselIdx = 0;

function initCarousel() {
  const carousel = document.getElementById('game-carousel');
  if (!carousel) return;
  if (carousel.dataset.carouselReady === '1') {
    carousel.classList.add('ready');
    if (typeof carousel._refreshCarouselLayout === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => carousel._refreshCarouselLayout()));
    }
    return;
  }
  carousel.dataset.carouselReady = '1';
  // Face Factory is the gentler bonus cabinet, so keep it at the end of the
  // carousel regardless of where its large card markup lives in arcade.html.
  const faceFactoryCard = carousel.querySelector('#ci-facefactory');
  if (faceFactoryCard) carousel.appendChild(faceFactoryCard);
  const originals = [...carousel.querySelectorAll('.carousel-item')];
  const N = originals.length;
  if (!N) return;

  const track = document.createElement('div');
  track.id = 'game-carousel-track';
  originals.forEach(el => track.appendChild(el));
  carousel.appendChild(track);

  function stripCloneIds(clone) {
    [clone, ...clone.querySelectorAll('[id]')].forEach(el => el.removeAttribute('id'));
    clone.dataset.clone = 'true';
  }

  // A fixed clone count isn't enough: how many neighbor cards are visible at
  // once depends on viewport width vs. card width, not just "3 cards" — a wide
  // desktop window shows a sliver of a further card past the immediate
  // neighbor too. Measure the real cards (clones don't affect card width/gap)
  // to work out how many card-steps actually fit in the visible half-width,
  // then buffer that many clones per side, +1 for the wrap-transit step itself
  // and +1 margin for modest window resizing. Without enough depth here, that
  // outer sliver goes blank for the ~360ms spent transiting the wrap, then
  // pops in once the reset lands — reads exactly like "still loading."
  let bufferPerSide = 0;
  if (N > 1) {
    // Use the layout width, not getBoundingClientRect(): inactive cards are
    // rendered at scale(.92), and feeding that painted width into the unscaled
    // track math shifts the selected card slightly to the right.
    const cw = originals[0].offsetWidth;
    const st = originals.length > 1 ? (originals[1].offsetLeft - originals[0].offsetLeft) : cw;
    const co = (carousel.offsetWidth - cw) / 2;
    bufferPerSide = Math.max(2, Math.ceil(co / st) + 2);
    for (let k = bufferPerSide; k >= 1; k--) {
      const clone = originals[((N - k) % N + N) % N].cloneNode(true);
      stripCloneIds(clone);
      track.insertBefore(clone, originals[0]);
    }
    for (let k = 0; k < bufferPerSide; k++) {
      const clone = originals[k % N].cloneNode(true);
      stripCloneIds(clone);
      track.appendChild(clone);
    }
  }

  const items = [...track.querySelectorAll('.carousel-item')];
  const firstReal = bufferPerSide;

  let logIdx = 0;
  let visualIdx = firstReal;
  let animating = false;
  let cardW = 0, step = 0, centerOffset = 0;

  function measure() {
    // offsetWidth stays in the same (untransformed) coordinate space as
    // offsetLeft and the track translate below. getBoundingClientRect().width
    // includes the resting card's scale(.92), which makes centerOffset too
    // large until that card becomes active.
    cardW = items[0].offsetWidth;
    step = items.length > 1 ? (items[1].offsetLeft - items[0].offsetLeft) : cardW;
    centerOffset = (carousel.clientWidth - cardW) / 2;
  }

  function setTransform(vIdx, animate) {
    track.classList.toggle('animate', animate);
    const activeItem = items[vIdx];
    let x = centerOffset - vIdx * step;
    if (activeItem) {
      x = (carousel.clientWidth - cardW) / 2 - activeItem.offsetLeft;
    }
    track.style.transform = `translateX(${x}px)`;
  }

  function applyActive(lIdx, vIdx) {
    items.forEach((el, i) => el.classList.toggle('active-card', i === vIdx));
    updateCarouselDots(lIdx, N);
  }

  function syncToCurrentIndex() {
    measure();
    logIdx = ((_carouselIdx % N) + N) % N;
    visualIdx = firstReal + logIdx;
    animating = false;
    clearTimeout(transitionSafetyTimer);
    setTransform(visualIdx, false);
    applyActive(logIdx, visualIdx);
    carousel.classList.add('ready');
  }

  carousel._refreshCarouselLayout = syncToCurrentIndex;

  // The clone->real teleport swaps which element carries .active-card, and that
  // class drives a 0.15s opacity/transform transition. Left as-is, the real card
  // would still have to fade up from its dim/scaled-down resting state right as
  // it's swapped in, reading as a pop/glitch. Suspending item transitions for one
  // frame makes that swap as instant as the (already-instant) position reset.
  function withoutCardTransition(fn) {
    track.classList.add('instant');
    fn();
    void track.offsetWidth;
    requestAnimationFrame(() => track.classList.remove('instant'));
  }

  // Deterministic wrap: transitionend fires exactly once when our own animation
  // genuinely finishes, so — unlike guessing from native scroll settling — there's
  // no race with in-flight motion to land the reset on the wrong frame.
  //
  // Except when it doesn't fire at all: a drag that's already clamped to exactly
  // one card-step can leave the track sitting on the very clone a boundary goTo()
  // would also animate to. The target transform is then identical to the current
  // one, so the browser never starts a transition — and transitionend never
  // fires — leaving the carousel stuck mid-wrap. transitionSafetyTimer resolves
  // the wrap on a timer in that case instead of waiting forever for an event
  // that isn't coming; it's cleared whenever transitionend does fire normally.
  let transitionSafetyTimer = null;
  let pendingDir = 0;

  function finishTransition() {
    if (!animating) return;
    animating = false;
    clearTimeout(transitionSafetyTimer);
    if (N > 1 && visualIdx === firstReal - 1) {
      const real = firstReal + logIdx;
      withoutCardTransition(() => { visualIdx = real; setTransform(real, false); applyActive(logIdx, real); });
    } else if (N > 1 && visualIdx === firstReal + N) {
      const real = firstReal;
      withoutCardTransition(() => { visualIdx = real; setTransform(real, false); applyActive(logIdx, real); });
    }

    if (pendingDir !== 0) {
      const nextDir = pendingDir;
      pendingDir = 0;
      requestAnimationFrame(() => {
        if (!animating && !dragging) beginTransition(nextDir);
      });
    }
  }
  track.addEventListener('transitionend', (e) => {
    if (e.target !== track || e.propertyName !== 'transform') return;
    finishTransition();
  });

  function beginTransition(dir) {
    if (N <= 1) return;
    if (animating) {
      pendingDir = dir;
      return;
    }
    const current = logIdx;
    logIdx = (logIdx + dir + N) % N;
    _carouselIdx = logIdx;
    let vIdx = firstReal + logIdx;
    // Boundary step: animate onto the outer clone adjacent to the current edge
    // card (continuing the drag/scroll direction) rather than jumping straight
    // to the real target — the inner clone stays populated as its far neighbor.
    if (current === 0 && dir < 0) vIdx = firstReal - 1;
    if (current === N - 1 && dir > 0) vIdx = firstReal + N;
    animating = true;
    visualIdx = vIdx;
    setTransform(vIdx, true);
    applyActive(logIdx, vIdx);
    clearTimeout(transitionSafetyTimer);
    transitionSafetyTimer = setTimeout(finishTransition, 400);
  }
  window.scrollCarousel = beginTransition;

  // ── Pointer-driven drag: one path for mouse (desktop) and touch (mobile) ──
  // Deliberately does NOT use setPointerCapture: capturing the pointer on an
  // ancestor is a known way to make click delivery to a descendant <button>
  // unreliable (especially on mobile Safari) — every "Play" tap doubles as a
  // pointerdown here, so that would break launching games entirely. Listening
  // on window for move/up instead gets the same "keep tracking off-element"
  // behavior without touching click delivery at all.
  let dragging = false, dragPointerId = null, dragStartX = 0, dragBaseVIdx = firstReal, dragBaseX = 0;
  let lastX = 0, lastT = 0, velocity = 0, dragMoved = false;
  let suppressClickUntil = 0;
  let currentX = 0;
  let touchDragActive = false;

  // Clamped to one card-step: the loop only ever keeps one clone past each end,
  // so dragging further than that would drag right off the end of the track
  // into empty space (visible as a blank gap) before the gesture even ends.
  function clampDx(dx) { return Math.max(-step, Math.min(step, dx)); }

  function beginDrag(clientX, pointerId, pointerType) {
    if (N <= 1) return;
    if (pointerType === 'mouse') {
      if (pointerId === null || pointerId === undefined) return;
    }
    if (animating) {
      clearTimeout(transitionSafetyTimer);
      animating = false;
      if (N > 1 && visualIdx === firstReal - 1) {
        visualIdx = firstReal + logIdx;
        setTransform(visualIdx, false);
      } else if (N > 1 && visualIdx === firstReal + N) {
        visualIdx = firstReal;
        setTransform(visualIdx, false);
      }
    }
    dragging = true;
    dragMoved = false;
    dragPointerId = pointerId;
    dragStartX = clientX;
    dragBaseVIdx = visualIdx;
    dragBaseX = centerOffset - dragBaseVIdx * step;
    currentX = dragBaseX;
    track.classList.remove('animate');
    track.classList.add('dragging');
    lastX = clientX; lastT = performance.now(); velocity = 0;
  }

  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    beginDrag(e.clientX, e.pointerId, e.pointerType);
  });

  track.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    touchDragActive = true;
    beginDrag(e.touches[0].clientX, 0, 'touch');
  }, { passive: true });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragPointerId || touchDragActive) return;
    const dx = clampDx(e.clientX - dragStartX);
    // 10px, not 4: ordinary tap/click jitter (finger or mouse never lands at the
    // exact same pixel on release) was crossing a tighter threshold and getting
    // misread as a drag, which suppressed the resulting click — the "Play"
    // button stopped launching anything. Real swipes clear this well before
    // release (the advance threshold below is ~60px), so raising it costs
    // nothing there.
    if (Math.abs(dx) > 10) dragMoved = true;
    currentX = dragBaseX + dx;
    track.style.transform = `translateX(${currentX}px)`;
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX; lastT = now;
  });
  function endDrag(e) {
    if (!dragging || (e.pointerId !== undefined && e.pointerId !== dragPointerId)) return;
    dragging = false;
    touchDragActive = false;
    track.classList.remove('dragging');
    const dx = clampDx(e.clientX - dragStartX);
    const advance = Math.abs(dx) > step * 0.14 || (e.pointerType === 'touch' ? Math.abs(velocity) > 0.4 : Math.abs(velocity) > 0.5);
    // Mobile Safari can coalesce a quick swipe so pointerup contains meaningful
    // travel even when no pointermove crossed the drag threshold. Mark that
    // release as a drag too, otherwise the button under the finger may receive
    // a synthetic click while the carousel advances.
    if (Math.abs(dx) > 10 || advance) {
      dragMoved = true;
      // iOS may dispatch the synthetic click after pointerup and after other
      // gesture bookkeeping has completed. Keep a brief time-based guard so
      // that delayed click cannot launch the card beneath the release point.
      suppressClickUntil = performance.now() + 500;
      e.preventDefault();
    }
    if (advance) beginTransition(dx < 0 ? 1 : -1);
    else {
      visualIdx = dragBaseVIdx;
      setTransform(dragBaseVIdx, true);
    }
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('touchmove', (e) => {
    if (!dragging || !touchDragActive || !e.touches || e.touches.length !== 1) return;
    const dx = clampDx(e.touches[0].clientX - dragStartX);
    if (Math.abs(dx) > 10) dragMoved = true;
    currentX = dragBaseX + dx;
    track.style.transform = `translateX(${currentX}px)`;
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (e.touches[0].clientX - lastX) / dt;
    lastX = e.touches[0].clientX; lastT = now;
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (!dragging || !touchDragActive) return;
    const dx = clampDx((e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : dragStartX) - dragStartX);
    const advance = Math.abs(dx) > step * 0.14 || Math.abs(velocity) > 0.4;
    if (Math.abs(dx) > 10 || advance) {
      dragMoved = true;
      suppressClickUntil = performance.now() + 500;
      e.preventDefault();
    }
    if (advance) beginTransition(dx < 0 ? 1 : -1);
    else {
      visualIdx = dragBaseVIdx;
      setTransform(dragBaseVIdx, true);
    }
    dragging = false;
    touchDragActive = false;
  }, { passive: false });
  window.addEventListener('touchcancel', () => {
    if (!dragging) return;
    dragging = false;
    touchDragActive = false;
    visualIdx = dragBaseVIdx;
    setTransform(dragBaseVIdx, true);
  });
  // A drag that moved the track shouldn't also fire the card's "Play" click.
  track.addEventListener('click', (e) => {
    if (dragMoved || performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
      dragMoved = false;
    }
  }, true);

  // Trackpad/mouse-wheel horizontal scroll steps the carousel too, so desktop
  // isn't limited to the arrows now that the track no longer natively scrolls.
  // Only hijacks genuinely horizontal intent (deltaX > deltaY) so an ordinary
  // vertical scroll over the carousel still scrolls the page.
  carousel.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    beginTransition(e.deltaX > 0 ? 1 : -1);
  }, { passive: false });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    // Skip while a finger's actually on the track: re-snapping mid-drag would
    // yank the card out from under the touch. Mobile browsers fire resize for
    // address-bar show/hide during ordinary page scroll, not just real
    // viewport changes, so this isn't a rare case to guard against.
    resizeTimer = setTimeout(() => { if (dragging) return; syncToCurrentIndex(); }, 120);
  });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    syncToCurrentIndex();
  }));
}

function updateCarouselDots(active, total) {
  const dots = document.getElementById('carousel-dots');
  if (!dots) return;
  dots.innerHTML = Array.from({length: total}, (_, i) =>
    `<div style="width:${i===active?16:6}px;height:6px;border-radius:3px;background:${i===active?'rgba(242,239,232,0.8)':'rgba(242,239,232,0.2)'};transition:all 0.2s"></div>`
  ).join('');
}

window.openLeaderboard = function() {
  const ov = document.getElementById('lb-overlay');
  if (!ov) return;
  ov.style.display = 'flex';
  const active = window._lbActiveTab || (
    document.body.classList.contains('on-match') ? getMatchLeaderboardKey()
      : document.body.classList.contains('on-space') ? 'space'
            : document.body.classList.contains('on-snoob') ? 'snoob'
            : document.body.classList.contains('on-consume') ? 'consume'
              : getWhackLeaderboardKey()
  );
  renderLbTabs(active);
};
window.closeLbOverlay = function() {
  const ov = document.getElementById('lb-overlay');
  if (ov) ov.style.display = 'none';
};
window._lbActiveTab = 'whack-classic-easy';
window._lbLastByGroup = {};

function leaderboardFilterButton(label, key, activeKey, color) {
  return `<button class="lb-filter ${activeKey === key ? 'active' : ''}"
    style="--lb-color:${color}"
    onclick="renderLbTabs('${key}')">${label}</button>`;
}

function leaderboardFilters(group, activeKey) {
  if (!group || group.boards.length < 2) return '';
  if (group.id === 'whack') {
    const rush = activeKey.startsWith('whack-classic');
    const hard = activeKey.endsWith('-hard');
    const difficulty = hard ? 'hard' : 'easy';
    const family = rush ? 'classic' : 'frenzy';
    return `<div class="lb-filter-panel">
      <div class="lb-filter-group">
        <span class="lb-filter-label">MODE</span>
        <div class="lb-filter-row" style="--lb-columns:2">
          ${leaderboardFilterButton('30 SEC RUSH', `whack-classic-${difficulty}`, activeKey, '#b884ff')}
          ${leaderboardFilterButton('3 LIVES', `whack-frenzy-${difficulty}`, activeKey, '#33cc66')}
        </div>
      </div>
      <div class="lb-filter-group">
        <span class="lb-filter-label">DIFFICULTY</span>
        <div class="lb-filter-row" style="--lb-columns:2">
          ${leaderboardFilterButton('NORMAL', `whack-${family}-easy`, activeKey, rush ? '#b884ff' : '#33cc66')}
          ${leaderboardFilterButton('HARD', `whack-${family}-hard`, activeKey, rush ? '#b884ff' : '#33cc66')}
        </div>
      </div>
    </div>`;
  }
  const labels = group.id === 'memory'
    ? { 'match-hard': 'HARD', 'match-challenge': 'CHALLENGE', 'match-impossible': 'IMPOSSIBLE' }
    : { consume: 'GRID', 'consume-words': 'WORDS', 'consume-numbers': 'RUMMY' };
  return `<div class="lb-filter-panel">
    <div class="lb-filter-group">
      <span class="lb-filter-label">MODE</span>
      <div class="lb-filter-row" style="--lb-columns:${group.boards.length}">
        ${group.boards.map(board => leaderboardFilterButton(labels[board.key] || board.label, board.key, activeKey, board.color)).join('')}
      </div>
    </div>
  </div>`;
}

window.selectLeaderboardGroup = function(groupId) {
  const group = getLeaderboardGroups().find(item => item.id === groupId);
  if (!group) return;
  renderLbTabs(window._lbLastByGroup[groupId] || group.boards[0]?.key);
};

function renderLbTabs(activeGame) {
  const games = getLeaderboardBoards();
  const groups = getLeaderboardGroups();
  const tabs = document.getElementById('lb-tabs');
  const content = document.getElementById('lb-tab-content');
  if (!tabs || !content) return;
  const selectedGroup = groups.find(group => group.keys.includes(activeGame)) || groups[0];
  const selectedBoard = games.find(board => board.key === activeGame) || selectedGroup.boards[0];
  if (!selectedBoard) return;
  activeGame = selectedBoard.key;
  window._lbActiveTab = activeGame;
  window._lbLastByGroup[selectedGroup.id] = activeGame;
  tabs.innerHTML = `
    <div class="lb-game-tabs">
      ${groups.map(group => `<button class="lb-game-tab ${group.id === selectedGroup.id ? 'active' : ''}"
        style="--lb-color:${group.color}"
        onclick="selectLeaderboardGroup('${group.id}')">${group.tab}</button>`).join('')}
    </div>
    ${leaderboardFilters(selectedGroup, activeGame)}`;
  const g = selectedBoard;
  content.innerHTML = `
    <div class="lb-scoreboard" style="--lb-color:${g.color}">
      <div class="lb-scoreboard-title">${g.label}</div>
      <div id="lb-remote-${activeGame}"></div>
    </div>`;
  loadRemoteBoard(activeGame, `lb-remote-${activeGame}`, g.color, g.field);
}

window.toggleArcadeMute = function() {
  const muted = ArcadeMusic.toggleMute();
  const label = muted ? '♪ OFF' : '♪ ON';
  document.querySelectorAll('.arcade-mute-btn').forEach(btn => {
    const action = btn.getAttribute('onclick') || '';
    if (action.includes('toggleArcadeMute')) btn.textContent = label;
  });
  if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
  if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
};
// ══════════════════════════════════════
//  GAME CHARACTERS  (replace nulls with real image paths later)
// ══════════════════════════════════════
const GAME_CHARS = [
  { name: 'KRISTEN', color: '#ff66aa', emoji: '😊', happy: '🤩', sad: '😭', img: 'characters/kristen.png', imgWhack: 'characters/kristen_whack.png', imgHappy: 'characters/kristen_happy.png', imgSad: 'characters/kristen_sad.png', tilt: 0 },
  { name: 'STEVEN',  color: '#33d4e0', emoji: '🤗', happy: '😇', sad: '😵', img: 'characters/steven.png', imgWhack: 'characters/steven_whack.png', imgHappy: 'characters/steven_happy.png',  imgSad: 'characters/steven_sad.png',  tilt: 0 },
  { name: 'TED',     color: '#e0aa33', emoji: '🤔', happy: '😆', sad: '😤', img: 'characters/ted.png', imgWhack: 'characters/ted_whack.png', imgHappy: 'characters/ted_happy.png',     imgSad: 'characters/ted_sad.png',     tilt: 0 },
  { name: 'DAWN',    color: '#aa66ff', emoji: '😁', happy: '🥳', sad: '😫', img: 'characters/dawn.png', imgWhack: 'characters/dawn_whack.png', imgHappy: 'characters/dawn_happy.png',    imgSad: 'characters/dawn_sad.png',    tilt: 0 },
  { name: 'TONY',    color: '#ff9933', emoji: '😏', happy: '😄', sad: '😤', img: 'characters/tony.png', imgWhack: 'characters/tony_whack.png', imgHappy: 'characters/tony_happy.png',    imgSad: 'characters/tony_sad.png',    tilt: 0 },
  { name: 'GRANDMA', color: '#9933e0', emoji: '😎', happy: '🤑', sad: '😩', img: 'characters/grandma.png', imgWhack: 'characters/grandma_whack.png', imgHappy: 'characters/grandma_happy.png', imgSad: 'characters/grandma_sad.png', tilt: 0 },
  { name: 'TOMMY',   color: '#44ccff', emoji: '😎', happy: '😄', sad: '😠', img: 'characters/tommy.png', imgWhack: 'characters/tommy_whack.png', imgHappy: 'characters/tommy_happy.png',   imgSad: 'characters/tommy_sad.png',   tilt: 0 },
  { name: 'POPPY',   color: '#66cc33', emoji: '😜', happy: '🤪', sad: '😬', img: 'characters/poppy.png', imgWhack: 'characters/poppy_whack.png', imgHappy: 'characters/poppy_happy.png',   imgSad: 'characters/poppy_sad.png',   tilt: 0 },
  { name: 'SHE-SHE', color: '#ff66dd', emoji: '💅', happy: '🥰', sad: '😤', img: 'characters/she-she.png', imgWhack: 'characters/she-she_whack.png', imgHappy: 'characters/she-she_happy.png', imgSad: 'characters/she-she_sad.png', tilt: 0 },
  { name: 'ROSIE',   color: '#ff4466', emoji: '🌹', happy: '🥳', sad: '😢', img: 'characters/rosie.png', imgWhack: 'characters/rosie_whack.png', imgHappy: 'characters/rosie_happy.png',   imgSad: 'characters/rosie_sad.png',   tilt: 0 },
  { name: 'KEVIN',   color: '#102a66', emoji: '🙂', happy: '😄', sad: '😢', img: 'characters/kevin.png', imgWhack: 'characters/kevin_whack.png', imgHappy: 'characters/kevin_happy.png',   imgSad: 'characters/kevin_sad.png',   tilt: 0 },
  { name: 'GRANT',   color: '#aacc22', emoji: '🤨', happy: '😁', sad: '😤', img: 'characters/grant.png', imgWhack: 'characters/grant_whack.png', imgHappy: 'characters/grant_happy.png',   imgSad: 'characters/grant_sad.png',   tilt: 0 },
  { name: 'LUKE',    color: '#5588cc', emoji: '😏', happy: '😄', sad: '😔', img: 'characters/luke.png', imgWhack: 'characters/luke_whack.png', imgHappy: 'characters/luke_happy.png',    imgSad: 'characters/luke_sad.png',    tilt: 0 },
  { name: 'LEANNE',  color: '#ff5588', emoji: '😍', happy: '🥰', sad: '😢', img: 'characters/leanne.png', imgWhack: 'characters/leanne_whack.png', imgHappy: 'characters/leanne_happy.png',  imgSad: 'characters/leanne_sad.png',  tilt: 0 },
  { name: 'LINDSAY', color: '#e03399', emoji: '🥸', happy: '😍', sad: '😖', img: 'characters/lindsay.png', imgWhack: 'characters/lindsay_whack.png', imgHappy: 'characters/lindsay_happy.png', imgSad: 'characters/lindsay_sad.png', tilt: 0 },
  { name: 'DEBBIE',  color: '#cc44ff', emoji: '😊', happy: '🤩', sad: '😭', img: 'characters/debbie.png', imgWhack: 'characters/debbie_whack.png', imgHappy: 'characters/debbie_happy.png',  imgSad: 'characters/debbie_sad.png',  tilt: 0 },
  { name: 'EDDIE',   color: '#44ddaa', emoji: '😄', happy: '😆', sad: '😟', img: 'characters/eddie.png', imgWhack: 'characters/eddie_whack.png', imgHappy: 'characters/eddie_happy.png',   imgSad: 'characters/eddie_sad.png',   tilt: 0 },
  { name: 'ANTHONY', color: '#ff7722', emoji: '🧐', happy: '😄', sad: '😒', img: 'characters/anthony.png', imgWhack: 'characters/anthony_whack.png', imgHappy: 'characters/anthony_happy.png', imgSad: 'characters/anthony_sad.png', tilt: 0 },
  { name: 'ALEX',    color: '#4488ff', emoji: '😌', happy: '😄', sad: '😢', img: 'characters/alex.png', imgWhack: 'characters/alex_whack.png', imgHappy: 'characters/alex_happy.png',    imgSad: 'characters/alex_sad.png',    tilt: 0 },
  { name: 'RUTH',    color: '#ccaa44', emoji: '😇', happy: '😄', sad: '😢', img: 'characters/ruth.png', imgWhack: 'characters/ruth_whack.png', imgHappy: 'characters/ruth_happy.png',    imgSad: 'characters/ruth_sad.png',    tilt: 0 },
  { name: 'THOMAS',  color: '#22cc99', emoji: '🙂', happy: '😄', sad: '😢', img: 'characters/thomas.png', imgWhack: 'characters/thomas_whack.png', imgHappy: 'characters/thomas_happy.png',  imgSad: 'characters/thomas_sad.png',  tilt: 0 },
];

// Character preferences follow the same player code used across the arcade.
const PLAYER_CHARACTER_PROFILES_KEY = 'moberino-character-profiles-v1';
const PLAYER_CHARACTER_MIGRATION_KEY = 'moberino-character-profile-migrated-v1';

function getPlayerCharacterProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(PLAYER_CHARACTER_PROFILES_KEY) || '{}');
    return profiles && typeof profiles === 'object' && !Array.isArray(profiles) ? profiles : {};
  } catch (e) { return {}; }
}
function getPlayerCharacterName(tag) {
  const name = getPlayerCharacterProfiles()[String(tag || '')];
  return GAME_CHARS.some(c => c.name === name) ? name : null;
}
function hasPlayerCharacter(tag) {
  return !!getPlayerCharacterName(tag);
}
function savePlayerCharacter(tag, name) {
  if (!tag || !GAME_CHARS.some(c => c.name === name)) return;
  const profiles = getPlayerCharacterProfiles();
  profiles[tag] = name;
  try { localStorage.setItem(PLAYER_CHARACTER_PROFILES_KEY, JSON.stringify(profiles)); } catch (e) {}
  if (typeof ArcadeProfiles !== 'undefined') ArcadeProfiles.setCharacter(tag, name);
}
function migrateCurrentPlayerCharacter() {
  const tag = PlayerID.get();
  if (!tag || hasPlayerCharacter(tag)) return;
  try {
    if (localStorage.getItem(PLAYER_CHARACTER_MIGRATION_KEY)) return;
    const legacyName = localStorage.getItem('moberino-char-name');
    if (GAME_CHARS.some(c => c.name === legacyName)) savePlayerCharacter(tag, legacyName);
    localStorage.setItem(PLAYER_CHARACTER_MIGRATION_KEY, '1');
  } catch (e) {}
}
migrateCurrentPlayerCharacter();

function getGlobalChar() {
  const name = getPlayerCharacterName(PlayerID.get()) || localStorage.getItem('moberino-char-name');
  if (name) {
    const idx = GAME_CHARS.findIndex(c => c.name === name);
    if (idx >= 0) return idx;
  }
  const legacy = parseInt(localStorage.getItem('moberino-char') || '0');
  return Math.min(Math.max(0, legacy), GAME_CHARS.length - 1);
}
function setGlobalChar(i) {
  localStorage.setItem('moberino-char-name', GAME_CHARS[i].name);
  localStorage.setItem('moberino-char', String(i));
  savePlayerCharacter(PlayerID.get(), GAME_CHARS[i].name);
}

// Preload all character images up front so canvas draws are instant
const _imgCache = {};
function _getImg(src) {
  if (!_imgCache[src]) { const i = new Image(); i.src = src; _imgCache[src] = i; }
  return _imgCache[src];
}
GAME_CHARS.forEach(c => {
  if (c.img)      _getImg(c.img);
  if (c.imgWhack) _getImg(c.imgWhack);
  if (c.imgHappy) _getImg(c.imgHappy);
  if (c.imgSad)   _getImg(c.imgSad);
});

// Returns innerHTML string for a character face (image or emoji fallback)
function charFace(c, expr) {
  // Self-centering regardless of the parent's own display mode — this gets dropped
  // into many different containers across the site (VS bar chips, intro screen boxes,
  // match cards, char select), and not all of them happen to be flex containers
  // themselves, which is exactly what caused faces to sit off-center in some boxes.
  if (c.img) {
    const src = expr === 'happy' ? (c.imgHappy || c.img)
              : expr === 'sad'   ? (c.imgSad   || c.img)
              : expr === 'whack' ? (c.imgWhack || c.img) : c.img;
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><img class="mobe-face-img" src="${src}" style="width:90%;height:90%;object-fit:contain;display:block"></div>`;
  }
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:inherit">${expr === 'happy' ? c.happy : expr === 'sad' ? c.sad : c.emoji}</div>`;
}

// ══════════════════════════════════════
//  CHARACTER SELECT SCREEN (scrollable list)
// ══════════════════════════════════════

const _ROW_H = 56;

function _updateBar(i) {
  const bar = document.getElementById('char-scroll-bar');
  if (!bar) return;
  const col = GAME_CHARS[i].color;
  bar.style.background = col + '28';
  bar.style.borderTopColor = col + 'cc';
  bar.style.borderBottomColor = col + 'cc';
}

function _renderCharList() {
  const list = document.getElementById('char-scroll-list');
  if (!list) return;
  const sel = getGlobalChar();
  // The wheel is responsive, so center its first/last rows from its rendered height.
  const spacerHeight = Math.max(0, (list.clientHeight - _ROW_H) / 2);
  const spacer = `<div style="height:${spacerHeight}px;flex-shrink:0"></div>`;
  list.innerHTML = spacer +
    GAME_CHARS.map((c, i) => `<div class="cs-char-row" id="cs-row-${i}" data-idx="${i}"></div>`).join('') +
    spacer;
  GAME_CHARS.forEach((c, i) => {
    const el = document.getElementById(`cs-row-${i}`);
    if (!el) return;
    el.textContent = c.name;
    el.onclick = () => selectCharInGrid(i);
  });
  list.scrollTop = sel * _ROW_H;
  _updateBar(sel);
  list.removeEventListener('scroll', _onCharListScroll);
  list.addEventListener('scroll', _onCharListScroll, { passive: true });
}

let _scrollSelTimer;
function _onCharListScroll() {
  clearTimeout(_scrollSelTimer);
  _scrollSelTimer = setTimeout(() => {
    const list = document.getElementById('char-scroll-list');
    if (!list) return;
    const i = Math.min(Math.max(0, Math.round(list.scrollTop / _ROW_H)), GAME_CHARS.length - 1);
    if (i !== getGlobalChar()) {
      setGlobalChar(i);
      SFX.charPick(i);
      updateCharPreview(i);
      _updateBar(i);
    }
  }, 40);
}

function openCharSelect(returnTo) {
  window._charSelectReturn = returnTo || 'lobby';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('pg-charselect')?.classList.add('active');
  document.body.className = document.body.className
    .replace(/\bon-\S+/g, '').trim() + ' on-char';
  updateCharPreview(getGlobalChar());
  if (typeof updateArcadeInstallPrompt === 'function') updateArcadeInstallPrompt();
  if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
  // rAF: page must be laid out (display:flex/active) before scrollTop sticks reliably
  requestAnimationFrame(() => _renderCharList());
}

function selectCharInGrid(i) {
  setGlobalChar(i);
  SFX.charPick(i);
  updateCharPreview(i);
  _updateBar(i);
  const list = document.getElementById('char-scroll-list');
  if (list) list.scrollTo({ top: i * _ROW_H, behavior: 'smooth' });
}

function updateCharPreview(i) {
  const c = GAME_CHARS[i];
  const face = document.getElementById('char-preview-face');
  const name = document.getElementById('char-preview-name');
  if (face) {
    face.innerHTML = charFace(c, 'normal');
    face.style.setProperty('--char-glow', c.color + '80'); // ~50% alpha
  }
  if (name) { name.textContent = c.name; name.style.color = c.color; name.style.textShadow = `0 0 12px ${c.color}88`; }
}

window.confirmCharSelect = function() {
  const returnTo = window._charSelectReturn || 'lobby';
  setGlobalChar(getGlobalChar());
  nav(returnTo === 'lobby' && !PlayerID.get() ? 'signin' : returnTo);
};

// ── ARCADE FLOATING COINS + TICKETS ──────────────────────────────────────────
(function() {
  function buildArcadeFloat(force) {
    const el = document.getElementById('arcade-float');
    if (!el) return;
    if (force) el.replaceChildren();
    if (el.children.length) return;

    const coinSVG = `<svg viewBox="0 0 40 40" width="42" height="42"><circle cx="20" cy="20" r="17" fill="#ffe61a14" stroke="#ffe61a" stroke-width="2.5"/><circle cx="20" cy="20" r="10" fill="none" stroke="#ffe61a" stroke-width="1.5" opacity="0.55"/><text x="20" y="26" text-anchor="middle" font-size="13" fill="#ffe61a" font-family="monospace" font-weight="900">$</text></svg>`;

    const ticketSVG = `<svg viewBox="0 0 58 24" width="58" height="24"><rect x="1.5" y="1.5" width="55" height="21" rx="5" fill="#ff00cc0c" stroke="#ff00cc" stroke-width="1.8"/><line x1="19" y1="1.5" x2="19" y2="22.5" stroke="#ff00cc" stroke-width="1" stroke-dasharray="3,2.5" opacity="0.55"/><circle cx="10" cy="12" r="4" fill="none" stroke="#ff00cc" stroke-width="1.8"/><line x1="27" y1="9" x2="50" y2="9" stroke="#ff00cc" stroke-width="2" stroke-linecap="round" opacity="0.7"/><line x1="27" y1="16" x2="43" y2="16" stroke="#ff00cc" stroke-width="2" stroke-linecap="round" opacity="0.45"/></svg>`;

    const pizzaSVG = `<svg viewBox="0 0 44 44" width="44" height="44"><path d="M22,4 L38,37 Q22,45 6,37 Z" fill="#ff660018" stroke="#ff6600" stroke-width="1.8" stroke-linejoin="round"/><path d="M6,37 Q22,47 38,37" fill="none" stroke="#ff9933" stroke-width="4" stroke-linecap="round"/><path d="M22,8 L36,36 Q22,42 8,36 Z" fill="#cc110018" stroke="#cc1100" stroke-width="1.2" opacity="0.85"/><ellipse cx="21" cy="22" rx="4.5" ry="3.5" fill="#ffe61a" opacity="0.82"/><ellipse cx="26" cy="30" rx="3.5" ry="3" fill="#ffe61a" opacity="0.72"/><ellipse cx="16" cy="30" rx="3" ry="2.5" fill="#ffe61a" opacity="0.72"/><circle cx="23" cy="16" r="2.5" fill="#cc0000" opacity="0.9"/><circle cx="17" cy="26" r="2" fill="#cc0000" opacity="0.85"/><circle cx="26" cy="25" r="2" fill="#cc0000" opacity="0.85"/></svg>`;

    // Responsive repeating wallpaper grid. The old fixed 4×6 grid looked sparse on
    // desktop because those same columns stretched across the wider viewport.
    const sequence = ['af-coin','af-ticket','af-pizza','af-coin','af-ticket','af-coin','af-pizza','af-ticket','af-coin','af-pizza','af-ticket','af-coin','af-pizza','af-ticket','af-coin','af-pizza','af-coin','af-ticket','af-pizza','af-coin'];
    const svgMap = { 'af-coin': coinSVG, 'af-ticket': ticketSVG, 'af-pizza': pizzaSVG };
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    const vh = window.innerHeight || document.documentElement.clientHeight || 700;
    const COLS = Math.max(4, Math.ceil(vw / 145));
    const ROWS = Math.max(6, Math.ceil(vh / 180));
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cls = sequence[idx++ % sequence.length];
        const div = document.createElement('div');
        div.className = cls;
        div.innerHTML = svgMap[cls];
        const left = (c / (COLS - 1) * 100) + (Math.random() * 4 - 2);
        const top  = (r / (ROWS - 1) * 100) + (Math.random() * 4 - 2);
        const dur  = 7 + Math.random() * 4; // slower float = more subtle
        const delay = -(r * COLS + c) * 0.8; // stagger so they don't all bob in sync
        div.style.cssText = `left:${Math.max(0, Math.min(100, left))}%;top:${Math.max(0, Math.min(100, top))}%;animation-duration:${dur}s;animation-delay:${delay}s`;
        el.appendChild(div);
      }
    }
  }
  function arcadeFloatPageActive() {
    const b = document.body;
    return !!b && (
      b.classList.contains('on-lobby') ||
      b.classList.contains('on-char') ||
      b.classList.contains('on-whack') ||
      b.classList.contains('arcade-selection-open')
    );
  }

  let arcadeFloatResizeTimer = null;
  function scheduleArcadeFloatRebuild() {
    if (!arcadeFloatPageActive()) return;
    clearTimeout(arcadeFloatResizeTimer);
    arcadeFloatResizeTimer = setTimeout(() => buildArcadeFloat(true), 160);
  }

  // Build immediately (element now lives at body level, persists across all arcade pages)
  buildArcadeFloat(); // DOM already loaded at script parse time
  window.initArcadeFloat = buildArcadeFloat;
  window.addEventListener('resize', scheduleArcadeFloatRebuild);
  window.addEventListener('orientationchange', scheduleArcadeFloatRebuild);
})();

// ── PIXEL ART GAME ICONS ─────────────────────────────────────────────────────
(function() {
  function px(ctx, pixels, colors, scale) {
    pixels.forEach(([x,y,ci]) => {
      ctx.fillStyle = colors[ci||0];
      ctx.fillRect(x*scale, y*scale, scale, scale);
    });
  }
  const S = 3;
  const icons = {
    whack: {
      colors: ['#cc6600','#884400','#ff8800','#ffe61a'],
      pixels: [
        [6,0,3],[7,0,3],[8,0,3],[9,0,3],
        [5,1,2],[6,1,2],[7,1,2],[8,1,2],[9,1,2],[10,1,2],
        [5,2,2],[6,2,2],[7,2,2],[8,2,2],[9,2,2],[10,2,2],
        [5,3,2],[6,3,2],[7,3,2],[8,3,2],[9,3,2],[10,3,2],
        [5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],
        [7,5,0],[7,6,0],[7,7,1],[7,8,1],[7,9,1],[7,10,0],
        [6,5,0],[8,5,0],[6,6,0],[8,6,0],
        [6,7,1],[8,7,1],[6,8,1],[8,8,1],
        [6,9,0],[8,9,0],[6,10,0],[8,10,0],
        [7,11,0],[7,12,0],[7,13,0],[7,14,0],[7,15,0],
      ]
    },
    match: {
      colors: ['#333355','#8888cc','#ffffff','#555599','#00ccff'],
      pixels: [
        [2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],
        [1,2,0],[2,2,1],[3,2,1],[4,2,1],[5,2,1],[6,2,1],[7,2,1],[8,2,1],[9,2,1],[10,2,1],[11,2,1],[12,2,1],[13,2,1],[14,2,0],
        [1,3,0],[2,3,1],[3,3,4],[4,3,4],[5,3,4],[6,3,4],[7,3,4],[8,3,4],[9,3,4],[10,3,4],[11,3,4],[12,3,1],[13,3,1],[14,3,0],
        [1,4,0],[2,4,1],[3,4,4],[4,4,4],[5,4,4],[6,4,4],[7,4,4],[8,4,4],[9,4,4],[10,4,4],[11,4,4],[12,4,1],[13,4,1],[14,4,0],
        [1,5,0],[2,5,1],[3,5,4],[4,5,2],[5,5,4],[6,5,4],[7,5,4],[8,5,4],[9,5,4],[10,5,2],[11,5,4],[12,5,1],[13,5,1],[14,5,0],
        [1,6,0],[2,6,1],[3,6,4],[4,6,4],[5,6,4],[6,6,4],[7,6,4],[8,6,4],[9,6,4],[10,6,4],[11,6,4],[12,6,1],[13,6,1],[14,6,0],
        [1,7,0],[2,7,1],[3,7,4],[4,7,4],[5,7,4],[6,7,4],[7,7,4],[8,7,4],[9,7,4],[10,7,4],[11,7,4],[12,7,1],[13,7,1],[14,7,0],
        [1,8,0],[2,8,1],[3,8,1],[4,8,1],[5,8,1],[6,8,1],[7,8,1],[8,8,1],[9,8,1],[10,8,1],[11,8,1],[12,8,1],[13,8,1],[14,8,0],
        [1,9,0],[14,9,0],
        [2,10,0],[3,10,0],[4,10,0],[5,10,0],[6,10,0],[7,10,0],[8,10,0],[9,10,0],[10,10,0],[11,10,0],[12,10,0],[13,10,0],
        [5,11,0],[6,11,0],[7,11,0],[8,11,0],[9,11,0],[10,11,0],
        [4,12,0],[5,12,0],[6,12,0],[7,12,0],[8,12,0],[9,12,0],[10,12,0],[11,12,0],
      ]
    },
    space: {
      colors: ['#33ff66','#ffffff','#00cc44','#ffe61a'],
      pixels: [
        [7,1,0],[8,1,0],
        [6,2,0],[7,2,1],[8,2,1],[9,2,0],
        [5,3,0],[6,3,0],[7,3,1],[8,3,1],[9,3,0],[10,3,0],
        [4,4,0],[5,4,0],[6,4,0],[7,4,2],[8,4,2],[9,4,0],[10,4,0],[11,4,0],
        [3,5,0],[4,5,0],[5,5,0],[6,5,2],[7,5,1],[8,5,1],[9,5,2],[10,5,0],[11,5,0],[12,5,0],
        [2,6,0],[3,6,0],[4,6,0],[5,6,0],[6,6,0],[7,6,0],[8,6,0],[9,6,0],[10,6,0],[11,6,0],[12,6,0],[13,6,0],
        [1,7,3],[2,7,0],[3,7,0],[4,7,0],[5,7,0],[6,7,0],[7,7,0],[8,7,0],[9,7,0],[10,7,0],[11,7,0],[12,7,0],[13,7,0],[14,7,3],
        [1,8,3],[2,8,3],[3,8,0],[4,8,0],[5,8,0],[6,8,0],[7,8,0],[8,8,0],[9,8,0],[10,8,0],[11,8,0],[12,8,0],[13,8,3],[14,8,3],
        [3,9,0],[4,9,0],[5,9,0],[6,9,0],[7,9,0],[8,9,0],[9,9,0],[10,9,0],[11,9,0],[12,9,0],
        [4,10,3],[5,10,3],[10,10,3],[11,10,3],
        [4,11,3],[5,11,3],[10,11,3],[11,11,3],
      ]
    }
  };

  function buildLobbyCharPicker() {
    const row = document.getElementById('lobby-char-row');
    if (!row) return;
    const sel = getGlobalChar();
    row.innerHTML = GAME_CHARS.map((c, i) => `
      <button onclick="pickGlobalChar(${i})"
        id="lcp-${i}"
        style="background:${i===sel?c.color+'33':'transparent'};border:2px solid ${i===sel?c.color:'rgba(242,239,232,0.15)'};border-radius:8px;padding:6px;cursor:pointer;transition:all 0.1s;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:28px">
        ${charFace(c,'normal')}
      </button>`
    ).join('');
    // Add "CHANGE PLAYER" button below the row
    const pick = document.getElementById('lobby-char-pick');
    if (pick) {
      let changeBtn = pick.querySelector('.lcp-change-btn');
      if (!changeBtn) {
        changeBtn = document.createElement('button');
        changeBtn.className = 'lcp-change-btn';
        changeBtn.setAttribute('onclick', "openCharSelect('lobby')");
        changeBtn.style.cssText = "font-family:'VCR',monospace;font-size:8px;letter-spacing:2px;background:none;border:none;color:rgba(242,239,232,0.3);cursor:pointer;margin-top:4px;display:block;width:100%";
        changeBtn.textContent = 'CHANGE PLAYER';
        pick.appendChild(changeBtn);
      }
    }
  }
  window.pickGlobalChar = function(i) {
    setGlobalChar(i);
  };

  window.drawPixelIcons = function() {
    Object.entries(icons).forEach(([key, icon]) => {
      const el = document.getElementById(`gc-icon-${key}`);
      if (!el) return;
      const cv = document.createElement('canvas');
      cv.width = 16 * S; cv.height = 16 * S;
      cv.style.cssText = 'display:block;image-rendering:pixelated';
      const cx = cv.getContext('2d');
      px(cx, icon.pixels, icon.colors, S);
      el.innerHTML = '';
      el.appendChild(cv);
      const hiEl = document.getElementById(`gc-hi-${key}`);
      if (hiEl) {
        const keys = {whack:'whack-best-survival',match:'match-best-score',space:'space-best'};
        const val = localStorage.getItem(keys[key]);
        if (val) hiEl.textContent = `HI SCORE: ${val}`;
      }
    });
  };
})();
