// ── STANDALONE ARCADE ROUTER ───────────────────────────────────────────────
(function() {
  function setArcadeExitVisible(show) {
    const btn = document.getElementById('arcade-game-exit');
    if (!btn) return;
    btn.style.display = show ? '' : 'none';
  }
  window.setArcadeExitVisible = setArcadeExitVisible;

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

    const onLobby = p === 'lobby';
    const onCharSelect = p === 'charselect';
    const onWhack = p === 'whack';
    const onMatch = p === 'match';
    const onSpace = p === 'space';
    document.body.classList.toggle('on-lobby', onLobby);
    document.body.classList.toggle('on-char', onCharSelect);
    document.body.classList.toggle('on-whack', onWhack);
    document.body.classList.toggle('on-match', onMatch);
    document.body.classList.toggle('on-space', onSpace);
    document.documentElement.classList.add('arcade-root');

    try {
      if ((onLobby || onCharSelect || onWhack || onMatch || onSpace) && typeof ArcadeMusic !== 'undefined' && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
      if (typeof ArcadeMusic !== 'undefined') {
        if (onLobby || onCharSelect) ArcadeMusic.unduck();
        if (onWhack || onMatch || onSpace) ArcadeMusic.duck();
      }
    } catch(e) {}

    if (onLobby) {
      if (!window._arcadeSessionStarted) {
        window._arcadeSessionStarted = true;
        if (typeof openCharSelect === 'function') { openCharSelect('lobby'); return; }
      }
      if (typeof initArcadeFloat === 'function') initArcadeFloat();
      if (typeof drawPixelIcons === 'function') drawPixelIcons();
      if (typeof initCarousel === 'function') initCarousel();
    }
    if (onWhack && typeof initWhack === 'function') initWhack();
    if (onMatch && typeof initMatch === 'function') initMatch();
    if (onSpace && typeof initSpace === 'function') initSpace();
    if (!onSpace && typeof spacePause === 'function') spacePause();
    if (!onWhack && typeof whackBack === 'function') whackBack();
    if (!onMatch && typeof matchBack === 'function') matchBack();
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('arcade-root');
    nav('lobby');
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
      // 1. THE SUB-BASS DROP: Extreme low-end weight that punches through the cabinet
      tone(180, 'triangle', 0, 0.22, 0.60, 40); // Cascades down into heavy 40Hz sub-bass

      // 2. THE MECHANICAL ACCELERATION: A whip-crack pitch slide that simulates high velocity
      tone(900, 'sawtooth', 0, 0.05, 0.25, 200); // Massive instant pitch drop (900Hz -> 200Hz)
      
      // 3. THE CRUNCH: A tight acoustic snap for the physical mallet-on-mole contact
      tone(600, 'square', 0, 0.04, 0.15, 300);

      // --- THE ADDICTIVE "WAHOO" TRIAD FLARE ---
      // A bright, major arpeggio that feels like collecting a rare coin
      tone(523, 'square', 0.03, 0.04, 0.18); // Note 1 (C5)
      tone(659, 'square', 0.06, 0.04, 0.18); // Note 2 (E5)
      tone(784, 'square', 0.09, 0.06, 0.22); // Note 3 (G5) - Triumphant peak

      // --- THE JUICE: HARMONIC ECHO SPARKLE ---
      // A high-pitched, softer echo of the final note that mimics a glittering reward
      tone(1568, 'square', 0.13, 0.04, 0.06); // Ultra-high G6 octave sparkle at a fraction of the volume
    },
        miss()     { tone(220,'sawtooth',0,0.14,0.07,100); },
    match()    { tone(523,'square',0,0.11,0.07); tone(659,'square',0.08,0.11,0.07); tone(784,'square',0.16,0.17,0.08); },
    mismatch() { tone(300,'sawtooth',0,0.08,0.06); tone(220,'sawtooth',0.06,0.14,0.07,140); },
    win()      { [523,659,784,1047].forEach((f,i)=>tone(f,'square',i*0.09,0.14,0.07)); },
    over()     { tone(330,'sawtooth',0,0.17,0.07,200); tone(200,'sawtooth',0.12,0.26,0.08,80); },
    // Space Mobe's blaster — softer waveform, lower pitch, deliberately quiet since
    // it fires at the auto-fire rate.
    blaster()  { tone(260,'triangle',0,0.07,0.035,180); },
    score()       { tone(784,'square',0,0.07,0.06); tone(1047,'square',0.05,0.10,0.07); },
    menuSelect()  { tone(660,'square',0,0.05,0.05); tone(880,'square',0.03,0.06,0.05); },
    charPick(i)   { const f = 300 + i * 40; tone(f,'square',0,0.04,0.05); tone(f*1.5,'square',0.025,0.05,0.04); },
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
    const ctx = getAudioCtx();
    gainNode = ctx.createGain();
    gainNode.gain.value = muted ? 0 : targetVol;
    gainNode.connect(ctx.destination);
    fetch('arcademusic.mp3')
      .then(r => { if (!r.ok) throw new Error('fetch failed: ' + r.status); return r.arrayBuffer(); })
      .then(data => ctx.decodeAudioData(data))
      .then(buf => { audioBuffer = buf; if (started) playSource(); })
      .catch(e => {
        // Previously a silent no-op that also left loadStarted permanently true — meaning
        // a single failed attempt (transient network blip, etc.) bricked music for the
        // rest of the session with zero visibility into why. Now it logs and allows retry.
        console.warn('[ArcadeMusic] failed to load arcademusic.mp3:', e);
        loadStarted = false;
      });
  }

  function playSource() {
    if (!audioBuffer || sourceNode) return;
    const ctx = getAudioCtx();
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.loop = true;
    sourceNode.connect(gainNode);
    sourceNode.start(0);
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
      if (muted) return;
      startPlayback();
    },
    stop() { started = false; stopSource(); },
    duck()   { targetVol = DUCK_VOL; if (gainNode && !muted) gainNode.gain.value = DUCK_VOL; },
    unduck() { targetVol = FULL_VOL; if (gainNode && !muted) gainNode.gain.value = FULL_VOL; },
    toggleMute() {
      muted = !muted;
      if (gainNode) gainNode.gain.value = muted ? 0 : targetVol;
      if (muted) { stopSource(); started = false; }
      else { startPlayback(); }
      return muted;
    },
    get muted()   { return muted; },
    get playing() { return !!sourceNode; },
  };
})();

// Resume/start music on any user tap while on arcade pages
document.addEventListener('click', function() {
  const onArcade = document.body.matches('.on-lobby,.on-whack,.on-match,.on-space,.on-char');
  if (onArcade && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
}, { passive: true });
document.addEventListener('touchstart', function() {
  const onArcade = document.body.matches('.on-lobby,.on-whack,.on-match,.on-space,.on-char');
  if (onArcade && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
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
  return opts.key || game;
}

function getLeaderboardBoards() {
  return [
    { key: 'whack-classic-easy', label: 'FRENZY · MEDIUM', color: '#00e5ff', field: 'score' },
    { key: 'whack-classic-hard', label: 'FRENZY · HARD', color: '#00e5ff', field: 'score' },
    { key: 'whack-frenzy-easy', label: 'ADVENTURE · MEDIUM', color: '#ff00cc', field: 'score' },
    { key: 'whack-frenzy-hard', label: 'ADVENTURE · HARD', color: '#ff00cc', field: 'score' },
    { key: 'match-hard', label: 'MATCH · HARD', color: '#ffe61a', field: 'seconds' },
    { key: 'match-challenge', label: 'MATCH · CHALLENGE', color: '#ff9933', field: 'seconds' },
    { key: 'match-impossible', label: 'MATCH · IMPOSSIBLE', color: '#ff4444', field: 'score' },
    { key: 'space', label: 'SPACE MOBE', color: '#33ff66', field: 'score' },
  ];
}

function getLeaderboardGroups() {
  const boards = getLeaderboardBoards();
  return [
    { title: 'WHACK', keys: ['whack-classic-easy', 'whack-classic-hard', 'whack-frenzy-easy', 'whack-frenzy-hard'] },
    { title: 'MATCH', keys: ['match-hard', 'match-challenge', 'match-impossible'] },
    { title: 'SPACE', keys: ['space'] },
  ].map(group => ({ ...group, boards: group.keys.map(key => boards.find(b => b.key === key)).filter(Boolean) }));
}

function getLeaderboardBoardMeta(game, options) {
  const key = getLeaderboardKey(game, options);
  const board = getLeaderboardBoards().find(b => b.key === key);
  if (board) return board;
  const fallbackColor = game === 'whack' ? '#ff00cc' : game === 'match' ? '#ffe61a' : '#33ff66';
  return { key, label: key.toUpperCase(), color: fallbackColor, field: 'score' };
}

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
    const url = `${TABLE_URL}?game=eq.${encodeURIComponent(game)}&order=${s.col}.${s.dir}&limit=${count || 5}`;
    return fetch(url, { headers: HEADERS }).then(r => r.json()).then(rows =>
      (rows || []).map(r => ({ name: r.name, score: r.score, seconds: r.seconds, extra: r.extra }))
    ).catch(e => { console.warn('[RemoteLB] fetch failed:', game, e); return null; });
  }

  return { submit, fetchTop, isConfigured };
})();

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
  const rowsLine = options.rowsLine || '';
  const statusLine = options.statusLine || '';
  const buttons = options.buttons || '';
  const saveMarginTop = Object.prototype.hasOwnProperty.call(options, 'saveMarginTop') ? options.saveMarginTop : 26;
  const attr = value => String(value ?? '').replace(/[&"<>\u0000-\u001f]/g, ch => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;'
  }[ch] || ''));
  return `
    <div class="arcade-cabinet" style="--nc:${color};max-width:${options.maxWidth || 390}px;width:92vw;position:relative">
      <div id="${artTargetId}" style="position:absolute;inset:0;z-index:0;opacity:0.40;transform:scale(1.26) translateY(10px);filter:saturate(1.18) brightness(1.02);pointer-events:none;mix-blend-mode:screen"></div>
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
          <div id="${boardTargetId}"></div>
          <div data-save-row="arcade" style="width:min(100%,280px);height:40px;margin:${saveMarginTop}px auto 0;display:flex;align-items:stretch;gap:8px">
            <input id="${inputId}" data-arcade-name="1" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ENTER NAME"
              style="flex:1;min-width:0;height:40px;box-sizing:border-box;background:#0e0b22;border:1.5px solid ${color};border-radius:4px;padding:10px 12px;font-family:'VCR',monospace;font-size:15px;letter-spacing:4px;color:#fff;text-align:center;text-transform:uppercase;outline:none">
            <button id="${saveButtonId}" type="button" aria-label="Submit score" data-arcade-save="1"
              data-board-key="${attr(boardKey)}" data-local-score="${attr(saveValue)}" data-remote-score="${attr(saveValue)}" data-seconds="${attr(options.seconds || 0)}" data-extra="${attr(options.extra || '')}" data-ascending="${options.ascending ? 'true' : 'false'}"
              data-input-id="${attr(inputId)}" data-status-id="${attr(statusId)}" data-board-target-id="${attr(boardTargetId)}" data-neon-color="${attr(color)}" data-field="${attr(boardField)}" data-art-target-id="${attr(artTargetId)}" data-art-game="${attr(artGame)}"
              style="flex:0 0 44px;width:44px;height:40px;box-sizing:border-box;background:${color}22;border:1.5px solid ${color};border-radius:4px;color:${color};cursor:pointer;text-shadow:0 0 8px ${color}66;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center">${submitLabel}</button>
          </div>
        </div>
      </div>
      <div class="arcade-cab-foot" style="position:relative;z-index:2;flex-direction:column;align-items:center;gap:8px;background:rgba(5,3,16,0.90);padding:22px 16px 18px;border-top:1px solid rgba(242,239,232,0.12)">${buttons}</div>
    </div>`;
}

// ── Carousel (infinite loop, JS-driven) ───────────────────────────────────────
let _carouselIdx = 0;

function initCarousel() {
  const carousel = document.getElementById('game-carousel');
  if (!carousel) return;
  if (carousel.dataset.carouselReady === '1') {
    carousel.classList.add('ready');
    return;
  }
  carousel.dataset.carouselReady = '1';
  const originals = [...carousel.querySelectorAll('.carousel-item')];
  const N = originals.length;
  if (!N) return;

  function stripCloneIds(clone) {
    [clone, ...clone.querySelectorAll('[id]')].forEach(el => el.removeAttribute('id'));
    clone.dataset.clone = 'true';
  }

  if (N > 1) {
    const before = originals[N - 1].cloneNode(true);
    const after = originals[0].cloneNode(true);
    stripCloneIds(before);
    stripCloneIds(after);
    carousel.insertBefore(before, originals[0]);
    carousel.appendChild(after);
  }

  const items = [...carousel.querySelectorAll('.carousel-item')];
  const firstReal = N > 1 ? 1 : 0;

  let logIdx = 0;
  let scrollEndTimer = null;
  let scrollAnimFrame = null;

  // Native scrollTo({behavior:'smooth'}) has no speed control — its duration is
  // fixed by the browser, which is what was actually reading as laggy. A short,
  // explicit rAF tween gives real control over how fast the snap feels.
  function animateScrollTo(target, duration) {
    cancelAnimationFrame(scrollAnimFrame);
    const start = carousel.scrollLeft;
    const delta = target - start;
    if (Math.abs(delta) < 1) { carousel.scrollLeft = target; return; }
    const t0 = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      carousel.scrollLeft = start + delta * eased;
      if (t < 1) scrollAnimFrame = requestAnimationFrame(tick);
    }
    scrollAnimFrame = requestAnimationFrame(tick);
  }

  function scrollToVisualIdx(idx, behavior) {
    const item = items[idx];
    if (!item) return;
    const offset = item.offsetLeft - (carousel.offsetWidth - item.offsetWidth) / 2;
    if (behavior === 'instant') carousel.scrollTo({ left: offset, behavior: 'instant' });
    else animateScrollTo(offset, 360);
  }

  function syncActive(logicalIdx, visualIdx) {
    const activeVisual = visualIdx == null ? firstReal + logicalIdx : visualIdx;
    items.forEach((el, i) => el.classList.toggle('active-card', i === activeVisual));
  }

  function closestVisualIdx() {
    const center = carousel.scrollLeft + carousel.offsetWidth / 2;
    let best = 0, bestDist = Infinity;
    items.forEach((el, i) => {
      const dist = Math.abs((el.offsetLeft + el.offsetWidth / 2) - center);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best;
  }

  function settleToVisualIdx(visualIdx) {
    if (N > 1 && visualIdx === 0) {
      logIdx = N - 1;
      _carouselIdx = logIdx;
      syncActive(logIdx);
      updateCarouselDots(logIdx, N);
      scrollToVisualIdx(firstReal + logIdx, 'instant');
      return;
    }
    if (N > 1 && visualIdx === items.length - 1) {
      logIdx = 0;
      _carouselIdx = logIdx;
      syncActive(logIdx);
      updateCarouselDots(logIdx, N);
      scrollToVisualIdx(firstReal, 'instant');
      return;
    }
    logIdx = Math.max(0, Math.min(N - 1, visualIdx - firstReal));
    _carouselIdx = logIdx;
    syncActive(logIdx, visualIdx);
    updateCarouselDots(logIdx, N);
    scrollToVisualIdx(visualIdx, 'smooth');
  }

  // Swipe/touch scroll doesn't call scrollCarousel(), so track scroll settling directly
  // and gently finish on the nearest centered card.
  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      settleToVisualIdx(closestVisualIdx());
    }, 120);
  }, { passive: true });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollToVisualIdx(firstReal, 'instant');
    syncActive(0);
    updateCarouselDots(0, N);
    carousel.classList.add('ready');
  }));

  // Merry-go-round wrap: scroll onto a clone, then silently reset to the matching real card.
  window.scrollCarousel = function(dir) {
    const current = logIdx;
    logIdx = (logIdx + dir + N) % N;
    _carouselIdx = logIdx;
    let visualIdx = firstReal + logIdx;
    if (N > 1 && current === 0 && dir < 0) visualIdx = 0;
    if (N > 1 && current === N - 1 && dir > 0) visualIdx = items.length - 1;
    scrollToVisualIdx(visualIdx, 'smooth');
    syncActive(logIdx, visualIdx);
    updateCarouselDots(logIdx, N);
  };
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
  const active = window._lbActiveTab || (document.body.classList.contains('on-match') ? getMatchLeaderboardKey() : document.body.classList.contains('on-space') ? 'space' : getWhackLeaderboardKey());
  renderLbTabs(active);
};
window.closeLbOverlay = function() {
  const ov = document.getElementById('lb-overlay');
  if (ov) ov.style.display = 'none';
};
window._lbActiveTab = 'whack';
function renderLbTabs(activeGame) {
  window._lbActiveTab = activeGame;
  const games = getLeaderboardBoards();
  const groups = getLeaderboardGroups();
  const tabs = document.getElementById('lb-tabs');
  const content = document.getElementById('lb-tab-content');
  if (!tabs || !content) return;
  tabs.style.cssText = 'display:block;margin-bottom:14px';
  tabs.innerHTML = groups.map(group => `
    <div style="width:100%;margin-bottom:10px">
      <div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:3px;color:rgba(242,239,232,0.35);margin:0 0 6px 2px">${group.title}</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">
        ${group.boards.map(g =>
          `<button onclick="renderLbTabs('${g.key}')"
            style="font-family:'VCR',monospace;font-size:11px;letter-spacing:1.2px;line-height:1.25;min-height:38px;padding:8px 10px;border-radius:4px;cursor:pointer;text-align:left;
              background:${activeGame===g.key?g.color+'22':'rgba(242,239,232,0.035)'};
              border:${activeGame===g.key?`2px solid ${g.color}`:'1.5px solid rgba(242,239,232,0.12)'};
              color:${activeGame===g.key?g.color:'rgba(242,239,232,0.62)'};
              ${activeGame===g.key?`text-shadow:0 0 8px ${g.color}88`:''}"
          >${g.label}</button>`
        ).join('')}
      </div>
    </div>
  `).join('');
  const g = games.find(x=>x.key===activeGame);
  content.innerHTML = `
    <div style="border:1.5px solid ${(g && g.color) || '#ffe61a'}55;background:rgba(5,3,16,0.72);border-radius:6px;padding:12px 10px 14px;box-shadow:inset 0 0 35px rgba(0,0,0,0.55)">
      <div style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;line-height:1;color:${(g && g.color) || '#ffe61a'};text-shadow:0 0 12px ${((g && g.color) || '#ffe61a')}88;margin-bottom:8px">${g ? g.label : activeGame}</div>
      <div id="lb-remote-${activeGame}"></div>
    </div>`;
  loadRemoteBoard(activeGame, `lb-remote-${activeGame}`, g ? g.color : '#ffe61a', g ? g.field : 'score');
  content.style.cssText = 'line-height:1.8';
}

window.toggleArcadeMute = function() {
  const muted = ArcadeMusic.toggleMute();
  const label = muted ? '♪ OFF' : '♪ ON';
  document.querySelectorAll('.arcade-mute-btn').forEach(btn => { btn.textContent = label; });
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

// Global character selection (persisted in localStorage by name so reordering is safe)
function getGlobalChar() {
  const name = localStorage.getItem('moberino-char-name');
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
const _WRAP_H = 280;
const _SPACER_H = (_WRAP_H - _ROW_H) / 2; // 112 — lets first/last row reach center

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
  const spacer = `<div style="height:${_SPACER_H}px;flex-shrink:0"></div>`;
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
  nav(window._charSelectReturn || 'lobby');
};

// ══════════════════════════════════════
//  WHACK-A-MOBE
// ══════════════════════════════════════
(function() {
  // Board size follows difficulty. Adventure Easy keeps the compact 12-hole
  // board; Adventure Hard gets a taller 20-hole 4x5 board so mobile uses the
  // portrait screen better without changing the actual Whack rules.
  let GRID_COLS = 4, GRID_ROWS = 4, HOLES = GRID_COLS * GRID_ROWS;
  function applyDifficultyGridSize() {
    GRID_COLS = difficulty === 'easy' ? 3 : 4;
    GRID_ROWS = difficulty === 'easy' ? 4 : 5;
    HOLES = GRID_COLS * GRID_ROWS;
  }
  const CRACK_SVG = `<svg viewBox="0 0 100 100" style="position:absolute;inset:0;pointer-events:none;animation:crack-in 0.3s ease-out forwards;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.45))">
    <g stroke="rgba(0,0,0,0.58)" stroke-width="1" opacity="0.48" fill="none" stroke-linecap="butt" stroke-linejoin="miter">
      <path d="M47,45 L38,31 L31,23 L18,12"/>
      <path d="M48,45 L59,34 L68,20 L84,5"/>
      <path d="M49,46 L64,48 L80,53 L96,66"/>
      <path d="M47,47 L42,61 L35,77 L20,96"/>
      <path d="M46,46 L31,49 L17,57 L5,75"/>
    </g>
    <g stroke="#fff" stroke-width="2" opacity="0.86" fill="none" stroke-linecap="butt" stroke-linejoin="miter">
      <path d="M47,45 L38,31 L31,23 L18,12"/>
      <path d="M48,45 L59,34 L68,20 L84,5"/>
      <path d="M49,46 L64,48 L80,53 L96,66"/>
      <path d="M47,47 L42,61 L35,77 L20,96"/>
      <path d="M46,46 L31,49 L17,57 L5,75"/>
      <path d="M47,46 L55,61 L63,75 L70,94"/>
      <path d="M48,45 L63,42 L78,39 L92,30"/>
    </g>
    <g stroke="#fff" stroke-width="1.05" opacity="0.62" fill="none" stroke-linecap="butt" stroke-linejoin="miter">
      <path d="M31,23 L43,18"/>
      <path d="M38,31 L27,40"/>
      <path d="M59,34 L57,18"/>
      <path d="M68,20 L79,22"/>
      <path d="M64,48 L75,44"/>
      <path d="M80,53 L75,68"/>
      <path d="M55,61 L47,72"/>
      <path d="M35,77 L44,88"/>
      <path d="M31,49 L22,42"/>
      <path d="M17,57 L31,65"/>
      <path d="M48,45 L39,58"/>
      <path d="M63,42 L67,55"/>
      <path d="M42,61 L29,65"/>
    </g>
    <g fill="none" stroke="#fff" opacity="0.72" stroke-linecap="butt" stroke-linejoin="miter">
      <path d="M38,38 L45,34 L54,39 L57,48 L51,56 L42,57 L35,50 L34,42 Z" stroke-width="1.35"/>
      <path d="M42,41 L48,39 L53,44 L52,50 L47,53 L40,50 L38,45 Z" stroke-width="0.8" opacity="0.55"/>
    </g>
  </svg>`;
  let state = 'mode-select'; // mode-select | mole-select | playing | over
  let wave = 1, waveHits = 0;
  let timerInterval;
  let difficulty = 'hard'; // 'easy' | 'hard'
  // Classic is a standalone 30s score-attack sibling to the wave-based game (now
  // labeled "Frenzy" in the UI) — gameMode persists across replays the same way
  // difficulty already does, only defaulting to 'frenzy' on script init.
  let gameMode = 'frenzy'; // 'classic' | 'frenzy'
  let classicHits = 0, classicPieces = [], classicTimeLeft = 30, classicInterval = null;
  let activeChar = getGlobalChar(); // user's char — to AVOID
  let moleChar = -1;               // random other char — to WHACK
  let selfActive = false;          // true once user's char starts appearing
  let selfIntroWave = 0;           // wave selfActive turned on — self-hit rate ramps from here
  let holeTimers = [], holeStates = [], holeCharIdx = [];
  let holeGrace = []; // brief post-uptime grace window — see popDown()
  let awaitingGameOverTap = false; // true once dead — frozen board, waiting for player to tap through
  let waveTransitioning = false;   // true during the pause between waves — blocks new spawns,
                                    // including ones a stale "just hit" cleanup callback might try to sneak in

  // Round types: normal trickle-spawn "whack" waves, occasionally replaced by a "clear"
  // wave — board fills with several targets at once, mixed good/bad, clear it before
  // the timer runs out. Picked once per wave (not recomputed) so the label/HUD stay
  // consistent with what's actually running.
  let currentRoundType = 'whack';
  // Extended, slower first-time intro for each mode (new players were confused about
  // what to do) — only plays once per run, the very first time that mode comes up.
  // Reset alongside the rest of the run's state in whackPlay()/initWhack().
  let introShownFor = { whack: false, clear: false, memory: false };
  let adventureIntroShown = false;
  function getClearRoundSeconds() {
    return difficulty === 'easy' ? 12 : 8;
  }
  let clearRoundTargets = 0, clearRoundHit = 0, clearRoundTimeLeft = 0, clearRoundInterval = null;
  // From the 2nd Clear round on, pieces hop to a touching/diagonal empty hole on a
  // timer instead of staying put — clearRoundPieces tracks each one's current hole so
  // moveClearRoundPieces() knows what to relocate. Speed climbs with each appearance.
  let clearRoundAppearances = 0, clearRoundPieces = [], clearRoundMoveInterval = null;
  // Memory round: a handful of holes flash a mole, then go blank — recall those exact
  // spots to clear it. Wrong spot (or any spot not in memoryTargets) is an instant fail,
  // same zero-tolerance rule as everything else.
  let memoryTargets = [], memoryHit = 0, memoryPhase = null; // 'showing' | 'recall' | null
  let memoryAppearances = 0; // counts up each Memory round this run — drives difficulty scaling

  function charHTML(ci, expr) {
    const c = GAME_CHARS[ci];
    const face = expr === 'happy' ? c.happy : expr === 'sad' ? c.sad : c.emoji;
    if (c.img) {
      const src = expr === 'happy' ? (c.imgHappy||c.img) : expr === 'sad' ? (c.imgSad||c.img) : expr === 'whack' ? (c.imgWhack||c.img) : c.img;
      return `<img class="mobe-face-img" src="${src}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;display:block;margin:0 auto">`;
    }
    return `<div class="whack-char-placeholder" style="background:${c.color}">${face}</div>`;
  }

  function pickMole() {
    const others = GAME_CHARS.map((_,i)=>i).filter(i=>i!==activeChar);
    return others[Math.floor(Math.random()*others.length)];
  }

  function showStatus(msg) {
    const el = document.getElementById('whack-status');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  function startSlotMachine() {
    const face = document.getElementById('whack-slot-face');
    const box  = document.getElementById('whack-slot-box');
    const nameEl = document.getElementById('whack-slot-name');
    const readyBtn = document.getElementById('whack-ready-btn');
    if (!face) return;
    const others = GAME_CHARS.map((_,i)=>i).filter(i=>i!==activeChar);
    let idx = 0, delay = 80, spins = 0, totalSpins = 16;
    function tick() {
      idx = (idx + 1) % others.length;
      face.innerHTML = charHTML(others[idx], 'normal');
      SFX.slotTick();
      spins++;
      if (spins < totalSpins * 0.55) {
        setTimeout(tick, delay);
      } else if (spins < totalSpins) {
        delay = 80 + (spins - totalSpins * 0.55) * 40;
        setTimeout(tick, delay);
      } else {
        face.innerHTML = charHTML(moleChar, 'normal');
        const gc = GAME_CHARS[moleChar];
        if (box) { box.style.borderColor = gc.color; box.style.boxShadow = `0 0 24px ${gc.color}88`; }
        if (nameEl) { nameEl.textContent = gc.name; nameEl.style.color = gc.color; nameEl.style.textShadow = `0 0 12px ${gc.color}`; nameEl.style.opacity = '1'; }
        if (readyBtn) { readyBtn.style.opacity = '1'; readyBtn.style.pointerEvents = 'auto'; }
        SFX.win();
      }
    }
    setTimeout(tick, 120);
  }

  // Freeze the board exactly as it is at the moment of death — no re-render, no reset —
  // and wait for the player to tap before showing the results screen.
  // Zero-tolerance wave clearing: any self-hit or missed mole ends the run immediately —
  // no life budget to absorb it. Shared by both failure paths so the flow is identical.
  function failWave(reason) {
    holeTimers.forEach(clearTimeout);
    clearInterval(clearRoundInterval); // in case a Clear round's countdown is still running
    clearInterval(clearRoundMoveInterval);
    removeClearTimerOverlay();
    removeSideBar();
    memoryPhase = null; // in case a Memory round is mid-recall
    flashBrokenHeart();
    showStatus(reason);
    SFX.over();
    // Tap-to-continue waits for the heart to have its moment on screen rather than
    // stacking on top of it immediately.
    setTimeout(freezeForGameOver, BROKEN_HEART_HOLD_MS);
  }

  function freezeForGameOver() {
    const wrap = document.getElementById('whack-wrap');
    if (!wrap) return;
    if (currentRoundType === 'memory' && memoryTargets.length) {
      revealMemoryBoard(showWhackGameOver);
      return;
    }
    showWhackGameOver();
  }

  window.whackContinue = function() {
    if (!awaitingGameOverTap) return;
    awaitingGameOverTap = false;
    if (currentRoundType === 'memory' && memoryTargets.length) {
      revealMemoryBoard(showWhackGameOver);
      return;
    }
    showWhackGameOver();
  };

  // After a Memory-round failure, flip every still-covered hole so the player can
  // see where the real targets were, instead of cutting straight to game over. Waits
  // for an explicit second tap to move on (as long as they want to look), rather than
  // an automatic delay — and advances immediately on that tap, no lingering pause.
  function revealMemoryBoard(onDone) {
    const tapOv = document.getElementById('whack-gameover-tap');
    if (tapOv) tapOv.remove();
    for (let h = 0; h < HOLES; h++) {
      const flip = document.getElementById(`wflip-${h}`);
      if (!flip || flip.classList.contains('flipped')) continue;
      flip.classList.add('flipped');
      if (memoryTargets.includes(h)) {
        const faceEl = document.getElementById(`wface-${h}`);
        // Small checkmark badge so the correct spots are unmistakable at a glance,
        // not just "a face showed up" — matches the intro demo's own checkmark reveal.
        if (faceEl) faceEl.innerHTML = `<div style="position:relative;width:100%;height:100%">${charHTML(moleChar, 'normal')}<div style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#33ff66;color:#0a1f10;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;box-shadow:0 0 6px rgba(51,255,102,0.7)">✓</div></div>`;
      }
    }
    setTimeout(() => { onDone(); }, 550); // keep the revealed board visible briefly, then move on automatically
  }

  function render() {
    const wrap = document.getElementById('whack-wrap');
    if (!wrap) return;
    setArcadeExitVisible(state !== 'over');
    wrap.classList.toggle('mode-select-layout', state === 'mode-select');
    document.body.classList.toggle('arcade-selection-open', state === 'mode-select' || state === 'mole-select');
    if (state === 'mode-select' || state === 'mole-select') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }

    if (state === 'mode-select') {
      wrap.innerHTML = `
<div class="whack-mode-shell" style="transform:translateY(54px)">          <div class="whack-mode-title">CHOOSE MODE</div>
          <div class="whack-mode-grid">
            <div class="game-card whack-mode-card" style="border-color:#b884ff66;cursor:default">
              <div class="game-card-art" style="background:#0d0a1e">
                <svg viewBox="0 0 200 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
                  <rect width="200" height="120" fill="#0d0a1e"/>
                  <line x1="0" y1="20" x2="200" y2="20" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="0" y1="40" x2="200" y2="40" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="0" y1="60" x2="200" y2="60" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="0" y1="80" x2="200" y2="80" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="50" y1="0" x2="50" y2="120" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="100" y1="0" x2="100" y2="120" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="150" y1="0" x2="150" y2="120" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <ellipse cx="145" cy="40" rx="46" ry="29" fill="#ff6600" opacity="0.055"/>
                  <g transform="translate(151, 45) rotate(40) scale(0.78)" opacity="0.9">
                    <rect x="-5" y="4" width="10" height="64" rx="4" fill="#6B3410"/>
                    <rect x="-5" y="4" width="5" height="64" rx="3" fill="#8B4513"/>
                    <line x1="-1" y1="12" x2="-1" y2="60" stroke="#5a2a0c" stroke-width="1" opacity="0.5"/>
                    <rect x="-30" y="-18" width="60" height="26" rx="7" fill="#cc7722"/>
                    <rect x="-30" y="-18" width="60" height="11" rx="7" fill="#ff9933"/>
                    <rect x="-28" y="-16" width="56" height="5" rx="3" fill="#ffcc77" opacity="0.45"/>
                    <rect x="-30" y="-18" width="8" height="26" rx="4" fill="#aa6010"/>
                    <rect x="22" y="-18" width="8" height="26" rx="4" fill="#aa6010"/>
                    <circle cx="-18" cy="-5" r="2.5" fill="#884411"/>
                    <circle cx="18" cy="-5" r="2.5" fill="#884411"/>
                  </g>
                  <text x="56" y="22" font-size="20" fill="#ffe61a" opacity="0.82">✦</text>
                  <text x="28" y="16" font-size="10" fill="#00e5ff" opacity="0.42">✦</text>
                  <text x="180" y="14" font-size="13" fill="#ffe61a" opacity="0.62">✦</text>
                  <text x="160" y="46" font-size="8" fill="#00e5ff" opacity="0.32">✦</text>
                  <line x1="174" y1="8" x2="160" y2="20" stroke="#ff9933" stroke-width="2.2" opacity="0.2" stroke-linecap="round"/>
                  <line x1="186" y1="14" x2="172" y2="26" stroke="#ff9933" stroke-width="1.4" opacity="0.14" stroke-linecap="round"/>
                  <line x1="162" y1="4" x2="150" y2="14" stroke="#ff9933" stroke-width="1" opacity="0.1" stroke-linecap="round"/>
                </svg>
                <div style="position:absolute;top:12px;left:12px;font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:3px;color:#ffffff;text-shadow:0 0 8px rgba(136,72,214,0.62)">FRENZY</div>
              </div>
              <div class="game-card-info">
                <div class="game-card-badge" style="background:#b884ff1a;color:#d8b8ff;border:1px solid #b884ff55">SCORE ATTACK</div>
                <div class="game-card-marquee" style="color:#b178ff;text-shadow:0 0 16px rgba(143,77,224,0.74)">30 SECOND RUSH</div>
                <div class="game-card-desc">WHACK AGAINST TIME.</div>
                <div class="whack-mode-diff">
                  <button class="whack-btn" style="border-color:#caa5ff;background:rgba(202,165,255,0.24);color:#f4eaff" onclick="whackSelectModeDifficulty('classic','easy')">MEDIUM</button>
                  <button class="whack-btn" style="border-color:#8f4de0;background:rgba(124,67,201,0.28);color:#ead4ff" onclick="whackSelectModeDifficulty('classic','hard')">HARD</button>
                </div>
              </div>
            </div>

            <div class="game-card whack-mode-card" style="border-color:#ffb04a66;cursor:default">
              <div class="game-card-art" style="background:#0d0a1e">
                <svg viewBox="0 0 200 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
                  <rect width="200" height="120" fill="#0d0a1e"/>
                  <g opacity="0.66" transform="translate(0 10)">
                    <rect x="0" y="44" width="200" height="76" fill="#111800"/>
                    <rect x="0" y="41" width="200" height="6" fill="#253000"/>
                    <ellipse cx="20" cy="43" rx="22" ry="7" fill="#2d5a00" opacity="0.76"/>
                    <ellipse cx="68" cy="42" rx="20" ry="6" fill="#336600" opacity="0.76"/>
                    <ellipse cx="118" cy="43" rx="24" ry="7" fill="#2d5a00" opacity="0.76"/>
                    <ellipse cx="170" cy="42" rx="20" ry="6" fill="#336600" opacity="0.76"/>
                    <ellipse cx="44" cy="52" rx="22" ry="10" fill="#060800"/>
                    <ellipse cx="100" cy="54" rx="22" ry="10" fill="#060800"/>
                    <ellipse cx="158" cy="52" rx="22" ry="10" fill="#060800"/>
                  </g>
                  <line x1="0" y1="30" x2="200" y2="30" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="0" y1="48" x2="200" y2="48" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="50" y1="0" x2="50" y2="56" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="100" y1="0" x2="100" y2="56" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="150" y1="0" x2="150" y2="56" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <text x="22" y="22" font-size="12" fill="#ffe61a" opacity="0.65">✦</text>
                  <text x="164" y="18" font-size="9" fill="#ffe61a" opacity="0.45">✦</text>
                </svg>
                <div style="position:absolute;top:12px;left:12px;font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:3px;color:#ffffff;text-shadow:0 0 8px rgba(255,153,51,0.48)">ADVENTURE</div>
              </div>
              <div class="game-card-info">
                <div class="game-card-badge" style="background:#ff99331a;color:#ffad4d;border:1px solid #ffb04a55">JOURNEY</div>
                <div class="game-card-marquee" style="color:#ff9933;text-shadow:0 0 15px rgba(255,153,51,0.62)">WAVE SURVIVAL</div>
                <div class="game-card-desc">3 MODES TO EXPLORE.</div>
                <div class="whack-mode-diff">
                  <button class="whack-btn" style="border-color:#ffc27a;background:rgba(255,194,122,0.22);color:#fff5e8" onclick="whackSelectModeDifficulty('frenzy','easy')">MEDIUM</button>
                  <button class="whack-btn" style="border-color:#e07b25;background:rgba(201,106,31,0.25);color:#ffe8d0" onclick="whackSelectModeDifficulty('frenzy','hard')">HARD</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      return;
    }

    if (state === 'mole-select') {
      const isClassic = gameMode === 'classic';
      wrap.innerHTML = `
        <div class="arcade-cabinet" style="--nc:#ff00cc;max-width:390px;width:92vw;position:relative">
          <div class="arcade-cab-rail"></div>
          <div class="arcade-cab-marquee" style="background:linear-gradient(135deg,#ff00cc,#990066);opacity:0.9;font-size:30px;letter-spacing:6px">GET READY</div>
          <div class="arcade-cab-screen" style="position:relative;z-index:2;overflow:hidden;padding:14px 14px 4px;min-height:0;background:rgba(5,3,16,0.78)">
            <div style="position:relative;z-index:2;display:flex;flex-direction:column;gap:8px;text-align:center">
              <div style="font-family:'VCR',monospace;font-size:19px;letter-spacing:3px;color:rgba(242,239,232,0.96)">FINDING THE MOLE</div>
              <div style="display:flex;justify-content:center">
                <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
                  <div style="font-size:11px;letter-spacing:2px;color:#ff4444;font-family:'VCR',monospace">${isClassic ? 'MOBE' : 'WHACK THIS'}</div>
                  <div id="whack-slot-box" style="width:128px;height:128px;border-radius:16px;background:rgba(255,68,68,0.1);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,68,68,0.5);box-shadow:0 0 18px rgba(255,68,68,0.25);transition:border-color 0.3s,box-shadow 0.3s">
                    <div id="whack-slot-face" style="width:96px;height:96px;display:flex;align-items:center;justify-content:center"></div>
                  </div>
                  <div id="whack-slot-name" style="font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;opacity:0;transition:opacity 0.4s;min-height:14px;text-align:center"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="arcade-cab-foot" style="position:relative;z-index:2;flex-direction:column;align-items:center;gap:8px;background:rgba(5,3,16,0.78);padding:22px 16px 18px;border-top:1px solid rgba(242,239,232,0.12)">
            <button id="whack-ready-btn" class="whack-btn" onclick="whackBegin()" style="width:100%;border-color:#ff00cc;background:rgba(255,0,204,0.20);padding:16px 48px;font-size:20px;letter-spacing:5px;text-shadow:0 0 10px #ff00cc88;box-shadow:0 0 18px rgba(255,0,204,0.3);opacity:0.35;pointer-events:none">READY!</button>
          </div>
        </div>`;
      startSlotMachine();
      return;
    }

    if (state === 'playing' && gameMode === 'classic') {
      wrap.innerHTML = `
        <div class="whack-hud" style="flex-direction:column;justify-content:flex-start;gap:6px;padding:8px 14px">
          <div style="text-align:center;width:100%;font-family:'Bebas Neue',cursive;font-size:24px;letter-spacing:2px;color:#00e5ff;text-shadow:0 0 10px #00e5ff88">FRENZY — <span id="classic-time">30</span>s</div>
          <div style="text-align:center;width:100%;font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.6);padding-top:4px;border-top:1px solid rgba(242,239,232,0.1)">HITS: <span id="classic-hits" style="color:#33ff66">0</span></div>
        </div>
        <div class="whack-grid" id="whack-grid" style="--cols:${GRID_COLS};--rows:${GRID_ROWS}">${
          Array.from({length:HOLES},(_,i)=>
            `<div class="whack-hole" id="wh-${i}" onpointerdown="whackHit(${i})">
               <div class="whack-char" id="wc-${i}"></div>
               <div class="whack-tint" id="wt-${i}"></div>
               <div class="whack-miss-x" id="wx-${i}">✕</div>
             </div>`
          ).join('')
        }</div>
        <div id="whack-status" style="font-family:'VCR',monospace;font-size:18px;letter-spacing:2px;color:#ff4444;text-align:center;min-height:24px;margin-top:8px;opacity:0;transition:opacity 0.4s;text-shadow:0 0 10px #ff444488"></div>`;
      holeStates = Array(HOLES).fill('empty');
      holeCharIdx = Array(HOLES).fill(-1);
      holeGrace = Array(HOLES).fill(false);
      // Classic's pieces start spawning from classicStart(), called once the
      // no-title intro finishes — never here, same reasoning as Frenzy's spawn timing.
      return;
    }

    if (state === 'playing') {
      const youGc = GAME_CHARS[activeChar], moleGc = GAME_CHARS[moleChar];
      const vs = vsLabels();
      wrap.innerHTML = `
        <div class="whack-hud" id="whack-hud-bar" style="flex-direction:column;justify-content:flex-start;gap:6px;padding:8px 14px">
          <div id="whack-wave-mode" style="text-align:center;width:100%;font-family:'Bebas Neue',cursive;font-size:24px;letter-spacing:2px;color:#ffe61a;text-shadow:0 0 10px #ffe61a88">${whackWaveHeaderHTML()}</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding-top:4px;border-top:1px solid rgba(242,239,232,0.1)">
            <div style="width:46px;height:46px;border-radius:8px;overflow:hidden;border:2px solid #33ff66;background:#33ff6622;box-shadow:0 0 12px #33ff6666;flex-shrink:0">${charFace(youGc,'normal')}</div>
            <div id="whack-vs-dont" style="flex:1;text-align:left;font-family:'Bebas Neue',cursive;font-size:13px;letter-spacing:1.5px;color:#33ff66;text-shadow:0 0 8px #33ff6688;line-height:1.2">DON'T<br>${vs.verb}</div>
            <div style="font-family:'Bebas Neue',cursive;font-size:17px;letter-spacing:2px;color:#ffe61a;text-shadow:0 0 10px #ffe61a;flex-shrink:0;padding:0 2px">VS</div>
            <div id="whack-vs-do" style="flex:1;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-family:'Bebas Neue',cursive;font-size:13px;letter-spacing:1.5px;color:#ff4444;text-shadow:0 0 8px #ff444488;line-height:1.2">${vs.verb}</div>
            <div style="width:46px;height:46px;border-radius:8px;overflow:hidden;border:2px solid #ff4444;background:#ff444422;box-shadow:0 0 12px #ff444466;transform:scaleX(-1);flex-shrink:0">${charFace(moleGc,'normal')}</div>
          </div>
        </div>
        <div id="whack-memorize-banner" style="display:none;text-align:center;padding:10px 0 6px;font-family:'Bebas Neue',cursive;font-size:36px;letter-spacing:4px;color:#00e5ff;text-shadow:0 0 20px #00e5ff,0 0 40px #00e5ff66">MEMORIZE</div>
        <div class="whack-grid" id="whack-grid" style="--cols:${GRID_COLS};--rows:${GRID_ROWS}">${
          Array.from({length:HOLES},(_,i)=>
            `<div class="whack-hole" id="wh-${i}" onpointerdown="whackHit(${i})">
               <div class="whack-char" id="wc-${i}"></div>
               <div class="whack-tint" id="wt-${i}"></div>
               <div class="whack-miss-x" id="wx-${i}">✕</div>
             </div>`
          ).join('')
        }</div>
        <div id="whack-status" style="font-family:'VCR',monospace;font-size:18px;letter-spacing:2px;color:#ff4444;text-align:center;min-height:24px;margin-top:8px;opacity:0;transition:opacity 0.4s;text-shadow:0 0 10px #ff444488"></div>`;
      holeStates = Array(HOLES).fill('empty');
      holeCharIdx = Array(HOLES).fill(-1);
      holeGrace = Array(HOLES).fill(false);
      // Scheduling the first spawn happens explicitly from whackBegin()/
      // clearWaveTransition() after the wave-start overlay finishes — never here. This
      // used to call scheduleAll() unconditionally, which fired immediately and could
      // show a mole while the "WAVE 1" text was still on screen.
      return;
    }

    if (state === 'over' && gameMode === 'classic') {
      setArcadeExitVisible(false);
      const boardKey = getWhackLeaderboardKey({ mode: gameMode, difficulty });
      const key = 'classic-best';
      const best = parseInt(localStorage.getItem(key)||'0');
      const isNew = classicHits > best;
      if (isNew) localStorage.setItem(key, classicHits);
      const uid = `whack-classic-${difficulty}`;
      wrap.innerHTML = buildArcadeResultCard({
        uid,
        boardKey,
        artGame: 'whack',
        color: '#00e5ff',
        marquee: isNew ? '🏆 NEW BEST!' : 'GAME OVER',
        marqueeEnd: '#006677',
        scoreLabel: 'YOUR SCORE',
        scoreValue: classicHits,
        saveValue: classicHits,
        field: 'score',
        extra: difficulty.toUpperCase(),
        ascending: false,
        saveMarginTop: 12,
        buttons: `
          <button class="whack-btn" style="border-color:#00e5ff;background:rgba(0,229,255,0.30)" onclick="whackPlay()">PLAY AGAIN</button>
          <button class="whack-btn" style="border-color:#00e5ff;background:rgba(0,229,255,0.30)" onclick="whackChangeMode()">CHANGE MODE</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
        `,
      });
      loadRemoteBoard(boardKey, `${uid}-board`, '#00e5ff', 'score');
      mountSelectionArt(`${uid}-art`, 'whack');
      return;
    }

    if (state === 'over') {
      setArcadeExitVisible(false);
      // Score is now waves actually cleared — `wave` is the one that was in progress
      // when the run ended, so the last one *cleared* is wave-1.
      const boardKey = getWhackLeaderboardKey({ mode: gameMode, difficulty });
      const wavesCleared = Math.max(0, wave - 1);
      const key = 'whack-best-survival';
      const best = parseInt(localStorage.getItem(key)||'0');
      const isNew = wavesCleared > best;
      if (isNew) localStorage.setItem(key, wavesCleared);
      const uid = `whack-frenzy-${difficulty}`;
      wrap.innerHTML = buildArcadeResultCard({
        uid,
        boardKey,
        artGame: 'whack',
        color: '#ff00cc',
        marquee: isNew ? '🏆 NEW BEST!' : 'GAME OVER',
        marqueeEnd: '#990066',
        scoreLabel: 'YOUR SCORE',
        scoreValue: wavesCleared,
        saveValue: wavesCleared,
        field: 'score',
        extra: difficulty.toUpperCase(),
        ascending: false,
        saveMarginTop: 12,
        buttons: `
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="whackPlay()">PLAY AGAIN</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="whackChangeMode()">CHANGE MODE</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
        `,
      });
      loadRemoteBoard(boardKey, `${uid}-board`, '#ff00cc', 'score');
      mountSelectionArt(`${uid}-art`, 'whack');
    }
  }

  function getPopDelay() {
    // Both difficulties approach a floor asymptotically rather than a linear ramp
    // clamped by Math.max — climb toward max difficulty stretches over dozens of
    // waves and mathematically can never cross the floor. Slowed further than before
    // since waves are now zero-tolerance (a miss ends the run, not just a life) —
    // less grace per mistake means the ramp itself needs to be gentler.
    if (difficulty === 'easy') {
      const decay = 1 + (wave - 1) * 0.07 + waveHits * 0.014;
      return 260 + (900 - 260) / decay + Math.random() * 80;
    }
    // Starting pace nudged harder (790->720) and the ramp rate brought back down a
    // bit (0.15->0.11) — last pass made the climb too steep again chasing "too easy."
    const adventureHard = gameMode === 'frenzy';
    const decay = 1 + (wave - 1) * (adventureHard ? 0.15 : 0.11) + waveHits * (adventureHard ? 0.022 : 0.017);
    const popDelay = (adventureHard ? 180 : 200) + ((adventureHard ? 640 : 720) - (adventureHard ? 180 : 200)) / decay;
    return popDelay + Math.random() * (adventureHard ? 45 : 60);
  }
  function getUpTime() {
    // Floors (620ms easy / 480ms hard) were sanity-checked against human reaction
    // time for a "visually identify, then tap" task — demanding at the limit, but
    // never literally impossible no matter how long a run goes.
    if (difficulty === 'easy') {
      const decay = 1 + (wave - 1) * 0.06 + waveHits * 0.012;
      let upTime = 620 + (1450 - 620) / decay;
      upTime += (concurrencyForWave(wave) - 1) * 110;
      return upTime + Math.random() * 120;
    }
    // HARD: same asymptotic approach as getPopDelay(). Floor is 480ms — demanding
    // (requires real, sustained skill) but above the ~400ms+ that visual-search-plus-tap
    // tasks actually take even for skilled players, so it stays masterable rather than
    // becoming a wall no amount of practice gets past. Starting pace nudged harder
    // (1100->1000), ramp rate brought back down a bit (0.13->0.10) for a smoother climb.
    const adventureHard = gameMode === 'frenzy';
    const decay = 1 + (wave - 1) * (adventureHard ? 0.13 : 0.10) + waveHits * (adventureHard ? 0.019 : 0.015);
    let upTime = (adventureHard ? 450 : 480) + ((adventureHard ? 900 : 1000) - (adventureHard ? 450 : 480)) / decay;
    // More moles up at once means more to visually track — give each one a little extra
    // time so "more moles" and "less time per mole" don't both hit at once.
    upTime += (concurrencyForWave(wave) - 1) * 90;
    return upTime + Math.random() * (adventureHard ? 80 : 100);
  }
  // How many moles can be up/scheduled at once — this is what makes "overlapping moles" real
  function concurrencyForWave(w) {
    const adventureHard = gameMode === 'frenzy' && difficulty === 'hard';
    if (adventureHard) {
      if (w >= 8) return 3;
      return 2;
    }
    if (difficulty === 'easy') return w >= 7 ? 2 : 1;
    if (w >= 10) return 3;
    if (w >= 5) return 2;
    return 1;
  }

  function scheduleSurvivalNext() {
    // currentRoundType check is the real belt-and-suspenders guard here — a stray
    // timer from the normal whack pop-up/pop-down cycle has no business spawning a
    // mole (or causing a miss) during a Clear or Memory round, no matter how it
    // managed to survive a wave transition.
    if (state !== 'playing' || waveTransitioning || currentRoundType !== 'whack') return;
    const open = Array.from({length:HOLES}, (_,i) => i).filter(i => holeStates[i] === 'empty');
    if (!open.length) return;
    const i = open[Math.floor(Math.random() * open.length)];
    holeTimers[i] = setTimeout(() => popUp(i), getPopDelay());
  }

  function scheduleAll() {
    holeTimers.forEach(clearTimeout); holeTimers = [];
    scheduleSurvivalNext();
  }


  function popUp(i) {
    if (state !== 'playing' || currentRoundType !== 'whack') return; // stray call from a round that's since moved on
    if (holeStates[i] !== 'empty') {
      scheduleSurvivalNext();
      return;
    }

    let picked = moleChar;
    // Self-character rate ramps in gradually from the wave it's introduced, instead of
    // flipping on at a flat ~28% forever — under zero-tolerance that flat rate made a
    // self-hit (instant fail) feel like it could happen at any moment with no warm-up.
    if (selfActive) {
      const easy = difficulty === 'easy';
      const selfRate = Math.min(easy ? 0.16 : 0.22, (wave - selfIntroWave) * (easy ? 0.014 : 0.02));
      if (Math.random() < selfRate) picked = activeChar;
    }

    // Tease glow: doesn't directly cause a fail (tapping a glowing-but-empty hole is
    // just a no-op), but combined with the self-character risk, still worth keeping
    // gentler than the old flat rate. Ramp rate bumped up along with everything else
    // after feedback that the early game felt too slow again.
    const decoyRate = difficulty === 'easy'
      ? Math.min(0.6, 0.25 + wave * 0.01)
      : Math.min(0.85, 0.45 + wave * 0.018);
    const useDecoy = Math.random() < decoyRate;
    let teaseIdx = i;
    if (useDecoy) {
      const decoys = Array.from({length:HOLES},(_,j)=>j).filter(j=>j!==i&&holeStates[j]==='empty');
      if (decoys.length) teaseIdx = decoys[Math.floor(Math.random()*decoys.length)];
    }
    const teaseEl = document.getElementById(`wh-${teaseIdx}`);
    if (teaseEl) {
      teaseEl.classList.add('teasing');
      setTimeout(()=>teaseEl.classList.remove('teasing'), 180);
    }

    holeStates[i] = 'up'; holeCharIdx[i] = picked;
    // This reveal delay must be tracked in holeTimers[i] too (not just the popDown
    // timer assigned inside it) — otherwise clearWaveTransition()'s clearTimeout sweep
    // can't cancel it, and it fires after the wave has already moved on, showing a
    // mole that's secretly already reset to 'empty' underneath — unclickable, with no
    // visible explanation. That was the "pops up but isn't clickable" bug.
    holeTimers[i] = setTimeout(() => {
      if (state !== 'playing') return;
      const hole = document.getElementById(`wh-${i}`), charEl = document.getElementById(`wc-${i}`);
      if (!hole || !charEl) return;
      charEl.innerHTML = charHTML(picked, 'normal');
      hole.classList.add('up');
      setTint(i, picked);
      holeTimers[i] = setTimeout(() => popDown(i, false), getUpTime());
    }, 110);
  }

  // Subtle color cue: red = mole (whack it), green = your own character (don't)
  function setTint(i, ci) {
    const tint = document.getElementById(`wt-${i}`);
    if (!tint) return;
    if (ci === moleChar) {
      tint.style.background = 'radial-gradient(circle, rgba(255,40,40,0.4) 0%, transparent 72%)';
      tint.classList.add('show');
    } else if (ci === activeChar) {
      tint.style.background = 'radial-gradient(circle, rgba(40,255,120,0.4) 0%, transparent 72%)';
      tint.classList.add('show');
    } else {
      tint.classList.remove('show');
    }
  }
  function clearTint(i) {
    const tint = document.getElementById(`wt-${i}`);
    if (tint) tint.classList.remove('show');
  }
  function showMissX(i) {
    const x = document.getElementById(`wx-${i}`);
    if (x) x.classList.add('show');
  }
  function hideMissX(i) {
    const x = document.getElementById(`wx-${i}`);
    if (x) x.classList.remove('show');
  }
  function flashWhackEmptyTap(i) {
    const hole = document.getElementById(`wh-${i}`);
    if (!hole) return;
    hole.classList.remove('tap-miss');
    void hole.offsetWidth;
    hole.classList.add('tap-miss');
    setTimeout(() => hole.classList.remove('tap-miss'), 220);
    SFX.whack();
  }

  // Faded heart flash behind the board whenever a life is lost — easy to miss otherwise
  const BROKEN_HEART_HOLD_MS = 2600; // 4x the original 650ms — gives it room to register before the tap prompt shows up
  function flashBrokenHeart() {
    // Fixed overlay above everything (not "behind the board" — that put it behind the
    // opaque hole tiles where it was nearly invisible). Click-through, so it never
    // blocks the next tap, but it's now actually visible.
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:min(35vw,180px);opacity:0;transition:opacity 0.18s ease-out';
    el.textContent = '💔';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0.38'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, BROKEN_HEART_HOLD_MS);
  }


  function popDown(i, wasHit) {
    const prev = holeCharIdx[i];
    // Grace window: the very first time the up-time timeout fires for a genuine miss,
    // give it one short extra window instead of failing immediately. This is purely a
    // safety margin against JS event-loop timing — a tap landing right at the edge of
    // getUpTime() can lose a race against the timer for reasons that have nothing to do
    // with the player's actual reaction speed. Under zero-tolerance, that kind of
    // un-felt timing slop now ends the whole run, so it needs covering. holeStates[i]
    // stays 'up' through this window, so a click lands exactly like a normal hit.
    // The currentRoundType checks below are the real fix for a stray timer surviving
    // a wave transition (e.g. a "post-hit cleanup" call scheduled near the end of a
    // whack/clear wave, firing 350ms later after the round has already moved on to
    // Clear or Memory) — cleanup of this hole's state/CSS always happens regardless,
    // but the *consequences* (grace window, miss-fail, rescheduling a new mole) only
    // apply if we're still actually in a whack round. Without this, a stray timer
    // could trigger a "missed mole" instant-fail during an unrelated round.
    if (!wasHit && prev === moleChar && !holeGrace[i] && currentRoundType === 'whack') {
      holeGrace[i] = true;
      holeTimers[i] = setTimeout(() => popDown(i, false), 150);
      return;
    }
    holeGrace[i] = false;
    holeStates[i] = 'empty'; holeCharIdx[i] = -1;
    const hole = document.getElementById(`wh-${i}`);
    if (!hole) return;
    hole.classList.remove('up', 'hit', 'hit-success', 'wrong-hit');

    if (!wasHit && prev === moleChar && currentRoundType === 'whack') {
      // Missed the mole — sad state, then instant fail under zero-tolerance.
      const charEl = document.getElementById(`wc-${i}`);
      if (charEl) charEl.innerHTML = charHTML(moleChar, 'sad');
      hole.classList.add('up', 'missed');
      showMissX(i);
      SFX.moleEscaped();
      setTimeout(() => failWave('💔 MISSED MOLE'), 700);
      return;
    }

    clearTint(i);
    scheduleSurvivalNext();
  }

  function addSelf() {
    // Used to show a big screen-covering warning here — removed, the VS bar already
    // communicates "don't whack" clearly enough on its own by now.
    if (selfActive) return;
    selfActive = true;
    selfIntroWave = wave; // self-hit rate ramps up gradually starting from here
  }

  window.whackHit = function(i) {
    if (state !== 'playing') return;
    if (gameMode === 'classic') { classicHit(i); return; }
    if (currentRoundType === 'memory' && memoryPhase === 'recall') { handleMemoryClick(i); return; }
    if (holeStates[i] !== 'up') {
      if (currentRoundType === 'whack') flashWhackEmptyTap(i);
      return;
    }
    const ci = holeCharIdx[i];
    holeStates[i] = 'hit';
    clearTimeout(holeTimers[i]);
    const hole = document.getElementById(`wh-${i}`), charEl = document.getElementById(`wc-${i}`);
    if (!hole || !charEl) return;

    if (ci === moleChar) {
      // hit-success (not 'hit') deliberately skips the yellow glow — that glow was
      // bleeding through behind the reaction art and reading like a weird character aura.
      charEl.innerHTML = charHTML(moleChar, 'whack') + CRACK_SVG;
      hole.classList.add('hit-success');
      clearTint(i);
      const pop = document.createElement('div');
      pop.className = 'whack-score-pop'; pop.textContent = '✓';
      pop.style.cssText = `left:${20+Math.random()*60}%;top:${20+Math.random()*40}%`;
      hole.appendChild(pop); setTimeout(() => pop.remove(), 700);
      SFX.whack(); SFX.hit();

      if (currentRoundType === 'clear') {
        // Clear rounds finish when every good target placed at round-start is hit —
        // not the usual running waveHits threshold, since this is a fixed snapshot.
        clearRoundHit++;
        clearRoundPieces = clearRoundPieces.filter(p => p.hole !== i); // stop tracking it, it's resolved
        if (clearRoundHit >= clearRoundTargets) {
          clearInterval(clearRoundInterval);
          clearInterval(clearRoundMoveInterval);
          removeClearTimerOverlay();
          removeSideBar();
          wave++;
          clearWaveTransition();
        }
        setTimeout(() => popDown(i, true), 350);
        return;
      }

      waveHits++;
      const easy = difficulty === 'easy';
      const threshold = wave === 1 ? 3 : (easy ? 8 : 5);
      if (waveHits >= threshold) {
        waveHits = 0; wave++;
        clearWaveTransition();
        // Wave 4 is the second WHACK-type wave in the round cycle (wave 1 is the
        // first) — same intro point for both difficulties now.
        if (wave === 4 && !selfActive) setTimeout(addSelf, 900);
      }
      setTimeout(() => popDown(i, true), 350);
    } else {
      // Hit self — instant fail under zero-tolerance. Always sad, no exceptions.
      charEl.innerHTML = charHTML(ci, 'sad');
      hole.classList.add('wrong-hit');
      SFX.selfWhack();
      if (currentRoundType === 'clear') {
        // Mark the mistake, and highlight the good targets still standing so it's
        // obvious what should have been hit instead.
        showMissX(i);
        for (let h = 0; h < HOLES; h++) {
          if (holeStates[h] === 'up' && holeCharIdx[h] === moleChar) {
            const goodHole = document.getElementById(`wh-${h}`);
            if (goodHole) goodHole.classList.add('reveal-correct');
          }
        }
      }
      setTimeout(() => failWave('💔 YOU WHACKED YOURSELF'), 600);
    }
  };

  // Waves now clear-then-break instead of blending into each other: cancel anything
  // still live (no penalty — this is a deliberate transition, not a miss), show a
  // brief "WAVE CLEARED" beat, then start the next wave fresh. The old version avoided
  // any pause specifically because waves used to flow continuously into one another;
  // now that each wave is its own discrete clear-it-or-fail unit, a clean visible break
  // is the whole point.
  // Big checkmark + sound, fades in then out — confirmation that a whole wave (not
  // just one hit) is cleared. Distinct from the green hit-success outline on an
  // individual hole, which is the per-hit confirmation within a Clear/Memory round.
  function showWaveClearCheckmark(clearedWave) {
    SFX.win();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.3s ease-in-out';
    el.innerHTML = `
      <div style="font-size:min(40vw,180px);color:#33ff66;text-shadow:0 0 40px #33ff66,0 0 80px #33ff6688;line-height:1">✓</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 16px #33ff66;margin-top:10px">WAVE ${clearedWave} CLEARED</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 350);
    }, 900);
  }

  function clearWaveTransition() {
    waveTransitioning = true; // blocks scheduleSurvivalNext() for the whole pause,
                               // including from any stale "just hit" timer firing late
    holeTimers.forEach(clearTimeout);
    // Sweeps everything except a hole still in 'hit' state (the just-landed hit that
    // triggered this transition — let its own 350ms popDown finish resolving naturally
    // rather than clipping it). Not gated on holeStates[h]==='up' like before — Memory
    // round targets only ever touch CSS classes/content directly, never holeStates, so
    // that old conditional check would've missed them and left stale visuals behind.
    for (let h = 0; h < HOLES; h++) {
      if (holeStates[h] === 'hit') continue;
      holeStates[h] = 'empty'; holeCharIdx[h] = -1;
      const hole = document.getElementById(`wh-${h}`), charEl = document.getElementById(`wc-${h}`);
      if (hole) hole.classList.remove('up','hit','hit-success','wrong-hit','missed');
      if (charEl) charEl.innerHTML = '';
      clearTint(h); hideMissX(h);
    }

    // Phase 1: "WAVE {n-1} CLEARED" + checkmark — the wave number belongs here, not
    // in the next wave's intro.
    const clearedWave = wave - 1;
    const wm = document.getElementById('whack-wave-mode');
    if (wm) wm.textContent = `WAVE ${clearedWave} CLEARED`;
    showWaveClearCheckmark(clearedWave);
    currentRoundType = pickRoundType(wave);

    setTimeout(() => {
      if (state !== 'playing') return;
      // Phase 2: next wave's mode intro — big bold mode phrase, no wave number.
      const wm2 = document.getElementById('whack-wave-mode');
      if (wm2) wm2.innerHTML = whackWaveHeaderHTML();
      const vs = vsLabels();
      const dontEl = document.getElementById('whack-vs-dont'), doEl = document.getElementById('whack-vs-do');
      if (dontEl) dontEl.innerHTML = `DON'T<br>${vs.verb}`;
      if (doEl) doEl.innerHTML = vs.verb;

      const startRound = () => {
        if (state !== 'playing') return;
        waveTransitioning = false;
        if (currentRoundType === 'clear') { startClearRound(); return; }
        if (currentRoundType === 'memory') { startMemoryRound(); return; }
        const n = concurrencyForWave(wave);
        for (let k = 0; k < n; k++) scheduleSurvivalNext();
      };

      playModeIntro(currentRoundType, startRound);
    }, 1300);
  }

  // Clear round: several holes fill at once (mixed good/bad, no decoy trickery — the
  // whole point is a clean snapshot to scan), with a countdown to clear every good one.
  // A bad hit still ends the run instantly (whackHit's self-hit branch is unchanged and
  // applies here too); running out of time does the same via failWave().
  // 8-directional neighbors on the 3-col x 4-row board — used to give Clear-round
  // pieces somewhere valid to hop to.
  function getNeighbors(i) {
    const row = Math.floor(i / GRID_COLS), col = i % GRID_COLS;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) out.push(r * GRID_COLS + c);
      }
    }
    return out;
  }

  function startClearRound() {
    clearRoundAppearances++;
    const firstAdventureHardClear = gameMode === 'frenzy' && difficulty === 'hard' && clearRoundAppearances === 1;
    const goodCount = firstAdventureHardClear ? 6 : (difficulty === 'easy' ? 4 : 5), badCount = firstAdventureHardClear ? 3 : (difficulty === 'easy' ? 1 : 2);
    const open = Array.from({length: HOLES}, (_, i) => i);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    const chosen = open.slice(0, goodCount + badCount);
    clearRoundTargets = goodCount;
    clearRoundHit = 0;
    clearRoundPieces = chosen.map((hi, idx) => ({ hole: hi, ci: idx < goodCount ? moleChar : activeChar }));
    chosen.forEach((hi, idx) => {
      const ci = idx < goodCount ? moleChar : activeChar;
      holeStates[hi] = 'up'; holeCharIdx[hi] = ci;
      const hole = document.getElementById(`wh-${hi}`), charEl = document.getElementById(`wc-${hi}`);
      if (hole && charEl) {
        charEl.innerHTML = charHTML(ci, 'normal');
        hole.classList.add('up');
        setTint(hi, ci);
      }
    });
    const clearRoundSeconds = getClearRoundSeconds();
    clearRoundTimeLeft = clearRoundSeconds;
    showClearTimerOverlay();
    updateClearTimerDisplay();
    showSideBar();
    updateSideBar(100, 1);
    SFX.raceStart();
    clearInterval(clearRoundInterval);
    clearRoundInterval = setInterval(() => {
      clearRoundTimeLeft--;
      updateClearTimerDisplay();
      updateSideBar((clearRoundTimeLeft / clearRoundSeconds) * 100, 1);
      if (clearRoundTimeLeft <= 0) {
        clearInterval(clearRoundInterval);
        for (let h = 0; h < HOLES; h++) {
          if (holeStates[h] === 'up' && holeCharIdx[h] === moleChar) {
            const charEl = document.getElementById(`wc-${h}`);
            const holeEl = document.getElementById(`wh-${h}`);
            if (charEl) charEl.innerHTML = charHTML(moleChar, 'sad');
            if (holeEl) holeEl.classList.add('missed');
          }
        }
        failWave('⏰ TIME UP!');
      }
    }, 1000);

    // Pieces stay put on the first couple Clear rounds so the mechanic itself isn't
    // sprung on the player along with everything else — easy gets an extra calm
    // appearance and a gentler, slower-floor ramp once they do start moving.
    clearInterval(clearRoundMoveInterval);
    const moveGrace = difficulty === 'easy' ? 2 : 1;
    if (clearRoundAppearances > moveGrace) {
      const moveMs = difficulty === 'easy'
        ? Math.max(1000, 2400 - (clearRoundAppearances - moveGrace - 1) * 150)
        : Math.max(700, 2000 - (clearRoundAppearances - moveGrace - 1) * 200);
      clearRoundMoveInterval = setInterval(moveClearRoundPieces, moveMs);
    }
  }

  function moveClearRoundPieces() {
    if (state !== 'playing' || currentRoundType !== 'clear') {
      clearInterval(clearRoundMoveInterval);
      return;
    }
    const occupied = new Set(clearRoundPieces.map(p => p.hole));
    clearRoundPieces.forEach(piece => {
      const oldHoleIdx = piece.hole;
      const options = getNeighbors(oldHoleIdx).filter(n => !occupied.has(n) && holeStates[n] === 'empty');
      if (!options.length) return; // nowhere to go this tick, stays put
      const dest = options[Math.floor(Math.random() * options.length)];

      const oldHoleEl = document.getElementById(`wh-${oldHoleIdx}`), oldCharEl = document.getElementById(`wc-${oldHoleIdx}`);
      const newHoleEl = document.getElementById(`wh-${dest}`), newCharEl = document.getElementById(`wc-${dest}`);

      occupied.delete(oldHoleIdx);
      holeStates[oldHoleIdx] = 'empty'; holeCharIdx[oldHoleIdx] = -1;
      if (oldHoleEl) oldHoleEl.classList.remove('up');
      if (oldCharEl) oldCharEl.innerHTML = '';
      clearTint(oldHoleIdx);

      piece.hole = dest;
      occupied.add(dest);
      holeStates[dest] = 'up'; holeCharIdx[dest] = piece.ci;
      if (newHoleEl) newHoleEl.classList.add('up');
      setTint(dest, piece.ci);

      // Slide instead of teleport: place the character in its new hole, but offset
      // by exactly the distance back to the old hole, then animate that offset to
      // zero. Wrapped in its own inner div rather than touching .whack-char's own
      // transform directly, since that's already doing the translateX(-50%) centering
      // for the pop-up animation and overwriting it would knock that off-center.
      if (newCharEl && oldHoleEl && newHoleEl) {
        const oldRect = oldHoleEl.getBoundingClientRect();
        const newRect = newHoleEl.getBoundingClientRect();
        const dx = oldRect.left - newRect.left, dy = oldRect.top - newRect.top;
        const slideId = `wslide-${dest}`;
        newCharEl.innerHTML = `<div id="${slideId}" style="width:100%;height:100%;transform:translate(${dx}px,${dy}px)">${charHTML(piece.ci, 'normal')}</div>`;
        requestAnimationFrame(() => {
          const slideEl = document.getElementById(slideId);
          if (slideEl) {
            slideEl.style.transition = 'transform 0.35s ease-in-out';
            slideEl.style.transform = 'translate(0,0)';
          }
        });
      }
    });
  }

  // ── Classic mode ── standalone 30s score-attack: no waves, no self-character to
  // avoid — every spawn is the single character chosen at mole-select, hit anything.
  // Moles continuously reposition between holes like Clear's pieces, but each on its
  // own independently-timed clock instead of one shared interval, so speeds can be
  // staggered per-mole rather than uniform.
  const CLASSIC_SPEED_TIERS = [
    { weight: 0.35, ms: () => 1800 + Math.random() * 600 },  // lingers
    { weight: 0.40, ms: () => 1000 + Math.random() * 400 },  // normal
    { weight: 0.25, ms: () => 650  + Math.random() * 200 },  // fast — floor stays tappable
  ];
  function rollClassicSpeed() {
    // Hard shifts the mix toward faster tiers rather than lowering the floor, so
    // "never faster than humanly possible" holds at both difficulties.
    const tiers = difficulty === 'hard'
      ? [{ weight: 0.20, ms: CLASSIC_SPEED_TIERS[0].ms }, { weight: 0.35, ms: CLASSIC_SPEED_TIERS[1].ms }, { weight: 0.45, ms: CLASSIC_SPEED_TIERS[2].ms }]
      : CLASSIC_SPEED_TIERS;
    const r = Math.random();
    let acc = 0;
    for (const t of tiers) { acc += t.weight; if (r <= acc) return t.ms(); }
    return tiers[0].ms();
  }
  function classicConcurrency() { return difficulty === 'easy' ? 3 : 5; }
  function classicEmptyHoles() {
    const occupied = new Set(classicPieces.map(p => p.hole));
    const out = [];
    for (let h = 0; h < HOLES; h++) if (!occupied.has(h)) out.push(h);
    return out;
  }

  function classicSpawnPiece(hole) {
    const piece = { hole, timer: null };
    classicPieces.push(piece);
    holeStates[hole] = 'up'; holeCharIdx[hole] = moleChar;
    const holeEl = document.getElementById(`wh-${hole}`), charEl = document.getElementById(`wc-${hole}`);
    if (holeEl && charEl) {
      charEl.innerHTML = charHTML(moleChar, 'normal');
      holeEl.classList.add('up');
      setTint(hole, moleChar);
    }
    piece.timer = setTimeout(() => classicRelocate(piece), rollClassicSpeed());
  }

  function classicRelocate(piece) {
    if (state !== 'playing' || gameMode !== 'classic') return;
    const occupied = new Set(classicPieces.map(p => p.hole));
    const options = getNeighbors(piece.hole).filter(n => !occupied.has(n) && holeStates[n] === 'empty');
    if (!options.length) {
      piece.timer = setTimeout(() => classicRelocate(piece), rollClassicSpeed());
      return;
    }
    const dest = options[Math.floor(Math.random() * options.length)];
    const oldHoleIdx = piece.hole;
    const oldHoleEl = document.getElementById(`wh-${oldHoleIdx}`), oldCharEl = document.getElementById(`wc-${oldHoleIdx}`);
    const newHoleEl = document.getElementById(`wh-${dest}`), newCharEl = document.getElementById(`wc-${dest}`);

    holeStates[oldHoleIdx] = 'empty'; holeCharIdx[oldHoleIdx] = -1;
    if (oldHoleEl) oldHoleEl.classList.remove('up');
    if (oldCharEl) oldCharEl.innerHTML = '';
    clearTint(oldHoleIdx);

    piece.hole = dest;
    holeStates[dest] = 'up'; holeCharIdx[dest] = moleChar;
    if (newHoleEl) newHoleEl.classList.add('up');
    setTint(dest, moleChar);

    // Same slide-instead-of-teleport technique as moveClearRoundPieces().
    if (newCharEl && oldHoleEl && newHoleEl) {
      const oldRect = oldHoleEl.getBoundingClientRect();
      const newRect = newHoleEl.getBoundingClientRect();
      const dx = oldRect.left - newRect.left, dy = oldRect.top - newRect.top;
      const slideId = `cslide-${dest}`;
      newCharEl.innerHTML = `<div id="${slideId}" style="width:100%;height:100%;transform:translate(${dx}px,${dy}px)">${charHTML(moleChar, 'normal')}</div>`;
      requestAnimationFrame(() => {
        const slideEl = document.getElementById(slideId);
        if (slideEl) { slideEl.style.transition = 'transform 0.35s ease-in-out'; slideEl.style.transform = 'translate(0,0)'; }
      });
    }
    piece.timer = setTimeout(() => classicRelocate(piece), rollClassicSpeed());
  }

  function classicHit(i) {
    const idx = classicPieces.findIndex(p => p.hole === i);
    if (idx === -1) { flashWhackEmptyTap(i); return; }
    const piece = classicPieces[idx];
    clearTimeout(piece.timer);
    classicPieces.splice(idx, 1);
    classicHits++;

    const holeEl = document.getElementById(`wh-${i}`), charEl = document.getElementById(`wc-${i}`);
    holeStates[i] = 'hit'; holeCharIdx[i] = -1;
    if (charEl) charEl.innerHTML = charHTML(moleChar, 'whack') + CRACK_SVG;
    if (holeEl) holeEl.classList.add('hit-success');
    clearTint(i);
    SFX.whack(); SFX.hit();
    const hitsEl = document.getElementById('classic-hits');
    if (hitsEl) hitsEl.textContent = classicHits;

    setTimeout(() => {
      if (state !== 'playing' || gameMode !== 'classic') return;
      if (holeEl) { holeEl.classList.remove('hit-success', 'up'); }
      if (charEl) charEl.innerHTML = '';
      holeStates[i] = 'empty';
      const empties = classicEmptyHoles();
      if (!empties.length) return;
      classicSpawnPiece(empties[Math.floor(Math.random() * empties.length)]);
    }, 250);
  }

  const CLASSIC_DURATION_S = 30;
  function classicStart() {
    classicHits = 0;
    classicPieces.forEach(p => clearTimeout(p.timer));
    classicPieces = [];
    classicTimeLeft = CLASSIC_DURATION_S;
    for (let h = 0; h < HOLES; h++) { holeStates[h] = 'empty'; holeCharIdx[h] = -1; }
    const n = Math.min(classicConcurrency(), HOLES);
    const open = Array.from({ length: HOLES }, (_, i) => i);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    for (let k = 0; k < n; k++) classicSpawnPiece(open[k]);
    showSideBar();
    updateSideBar(100, 1);
    clearInterval(classicInterval);
    classicInterval = setInterval(() => {
      classicTimeLeft--;
      updateSideBar((classicTimeLeft / CLASSIC_DURATION_S) * 100, 1);
      const tEl = document.getElementById('classic-time');
      if (tEl) tEl.textContent = classicTimeLeft;
      if (classicTimeLeft <= 0) { clearInterval(classicInterval); classicEnd(); }
    }, 1000);
  }

  function classicEnd() {
    clearInterval(classicInterval);
    classicPieces.forEach(p => clearTimeout(p.timer));
    classicPieces = [];
    removeSideBar();
    // No failWave()/broken-heart flash — Classic only ends on the clock, never on a
    // mistake, so it goes straight to the game-over screen.
    showWhackGameOver();
  }

  function showWhackGameOver() {
    holeTimers.forEach(clearTimeout);
    clearInterval(timerInterval);
    clearInterval(clearRoundInterval);
    clearInterval(clearRoundMoveInterval);
    classicPieces.forEach(p => clearTimeout(p.timer));
    classicPieces = [];
    clearInterval(classicInterval);
    removeSideBar();
    removeClearTimerOverlay();
    document.querySelectorAll('.whack-intro-overlay').forEach(el => el.remove());
    const tapOv = document.getElementById('whack-gameover-tap');
    if (tapOv) tapOv.remove();
    awaitingGameOverTap = false;
    memoryPhase = null;
    waveTransitioning = false;
    state = 'over';
    render();
    const wrap = document.getElementById('whack-wrap');
    if (wrap) wrap.scrollTop = 0;
  }

  // Measures the actual HUD bar (wave/mode line + VS row) and covers it exactly,
  // opaque, for the duration of the round — replaces both with just the countdown
  // rather than floating a separate badge over the gameplay area.
  let clearTimerOverlayEl = null;
  function showClearTimerOverlay() {
    removeClearTimerOverlay();
    const hud = document.querySelector('.whack-hud');
    if (!hud) return;
    const rect = hud.getBoundingClientRect();
    clearTimerOverlayEl = document.createElement('div');
    clearTimerOverlayEl.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;z-index:9400;pointer-events:none;display:flex;align-items:center;justify-content:center;background:#150a28;border-radius:6px;border:1px solid rgba(255,230,26,0.3)`;
    clearTimerOverlayEl.innerHTML = `<div id="whack-clear-overlay-txt" style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:#ffe61a;text-shadow:0 0 14px #ffe61a"></div>`;
    document.body.appendChild(clearTimerOverlayEl);
  }
  function removeClearTimerOverlay() {
    if (clearTimerOverlayEl) { clearTimerOverlayEl.remove(); clearTimerOverlayEl = null; }
  }

  function updateClearTimerDisplay() {
    const txt = document.getElementById('whack-clear-overlay-txt');
    if (!txt) return;
    txt.textContent = `⏰ CLEAR! ${clearRoundTimeLeft}s`;
    txt.style.color = clearRoundTimeLeft <= 3 ? '#ff4444' : '#ffe61a';
  }

  // Vertical countdown bar to the right of the board — fixed-positioned against the
  // grid's own measured rect (same trick as the HUD overlay above) so it tracks the
  // board regardless of layout. The fill is bottom-anchored so it drains from the top
  // down rather than shrinking from the bottom up. Shared by Clear (ticks once a
  // second, so the CSS transition smooths between ticks) and Memory (driven every
  // frame via rAF, so no CSS transition is needed there).
  let sideBarEl = null;
  // theme: 'yellow' (Clear's countdown, default) or 'memorize' (Memory round's
  // memorize window) — memorize gets a blue glow so the bar itself signals "this is
  // memorize time," matching Memory's blue branding instead of Clear's yellow.
  function showSideBar(theme) {
    removeSideBar();
    const grid = document.getElementById('whack-grid');
    if (!grid) return;
    const isMemorize = theme === 'memorize';
    const borderColor = isMemorize ? 'rgba(0,229,255,0.4)' : 'rgba(255,230,26,0.25)';
    const fillColor = isMemorize ? 'rgba(0,229,255,0.55)' : 'rgba(255,230,26,0.5)';
    const glowColor = isMemorize ? 'rgba(0,229,255,0.7)' : 'rgba(255,230,26,0.35)';
    const rect = grid.getBoundingClientRect();
    sideBarEl = document.createElement('div');
    sideBarEl.dataset.theme = theme || 'yellow';
    sideBarEl.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.right + 10}px;width:12px;height:${rect.height}px;z-index:9400;pointer-events:none;background:rgba(0,0,0,0.35);border:1px solid ${borderColor};border-radius:6px;overflow:hidden;${isMemorize ? `box-shadow:0 0 14px ${glowColor};` : ''}`;
    sideBarEl.innerHTML = `<div id="whack-sidebar-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:${fillColor};box-shadow:0 0 8px ${glowColor};transition:background 0.3s"></div>`;
    document.body.appendChild(sideBarEl);
  }
  function removeSideBar() {
    if (sideBarEl) { sideBarEl.remove(); sideBarEl = null; }
  }
  function updateSideBar(pct, smoothSeconds) {
    const fill = document.getElementById('whack-sidebar-fill');
    if (!fill) return;
    const isMemorize = sideBarEl && sideBarEl.dataset.theme === 'memorize';
    fill.style.transition = smoothSeconds ? `height ${smoothSeconds}s linear,background 0.3s` : 'background 0.3s';
    fill.style.height = Math.max(0, pct) + '%';
    fill.style.background = pct <= 30 ? 'rgba(255,68,68,0.55)' : isMemorize ? 'rgba(0,229,255,0.55)' : 'rgba(255,230,26,0.5)';
  }

  // Shared by startMemoryRound() and the next-wave intro overlay, so the announced
  // memorize time and the actual one always match — appearanceCount is "which Memory
  // round is this" (1st, 2nd, ...), not memoryAppearances directly, since the overlay
  // needs to predict the upcoming round's value before it's actually started.
  // Hard's two difficulty levers (time to memorize, and how much there is to
  // memorize) alternate one step at a time instead of both ramping every appearance —
  // each new appearance either trims 0.5s off the clock OR adds one more target, never
  // both, so "harder" always reads as one clear change rather than a compound jump.
  // Time stays in clean 0.5s increments throughout (4.0, 3.5, 3.0, ... down to a 1.5s floor).
  function memoryHardStep(appearanceCount) {
    return Math.max(0, appearanceCount - 3); // same 3-appearance grace period as before
  }
  function getMemorizeMs(appearanceCount) {
    if (difficulty === 'easy') {
      const tier = Math.max(0, appearanceCount - 5); // longer grace period before scaling kicks in
      return Math.max(2200, 3200 - tier * 100); // more time throughout, slower decay
    }
    const step = memoryHardStep(appearanceCount);
    const timeSteps = Math.ceil(step / 2); // time moves on odd steps
    return Math.max(1.5, 4 - timeSteps * 0.5) * 1000;
  }
  function getMemoryGoodCount(appearanceCount) {
    if (difficulty === 'easy') {
      const tier = Math.max(0, appearanceCount - 5);
      return Math.min(6, 3 + Math.floor(tier / 3)); // starts with fewer targets, grows slower
    }
    const step = memoryHardStep(appearanceCount);
    const patternSteps = Math.floor(step / 2); // pattern moves on even steps
    return Math.min(8, 5 + patternSteps);
  }

  const MEMORY_INTRO_MS = 0; // Reveal memorize targets immediately after the wave title; no blank-board pause
  function startMemoryRound() {
    memoryAppearances++;
    // Same difficulty for the first few appearances, then scales up gradually: more
    // targets, less time to memorize, and — a few appearances in — your own character
    // shows up among the targets purely as visual noise. It's never a target itself
    // (recall logic only ever checks memoryTargets), but it's one more face to filter
    // out while memorizing, which is real extra load even though the actual pattern
    // of correct spots hasn't changed.
    const goodCount = getMemoryGoodCount(memoryAppearances);
    const memorizeMs = getMemorizeMs(memoryAppearances);
    const showDistraction = memoryAppearances > (difficulty === 'easy' ? 6 : 4);

    const open = Array.from({length: HOLES}, (_, i) => i);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    memoryTargets = open.slice(0, goodCount);
    const distractionHoles = showDistraction ? open.slice(goodCount, goodCount + 2) : [];
    memoryHit = 0;
    // 'intro': board stays blank for a beat before targets reveal. No big "MEMORIZE"
    // flash here anymore — the wave-start title ("MEMORIZE THE BOARD") already covers
    // that, and the two together read as a redundant double message.
    memoryPhase = 'intro';
    const wm = document.getElementById('whack-wave-mode');
    if (wm) wm.innerHTML = whackWaveHeaderHTML('MEMORIZE');

    setTimeout(() => {
      if (state !== 'playing' || memoryPhase !== 'intro') return;
      memoryPhase = 'showing';
      memoryTargets.forEach(hi => {
        const hole = document.getElementById(`wh-${hi}`), charEl = document.getElementById(`wc-${hi}`);
        if (hole && charEl) { charEl.innerHTML = charHTML(moleChar, 'normal'); hole.classList.add('up'); }
      });
      distractionHoles.forEach(hi => {
        const hole = document.getElementById(`wh-${hi}`), charEl = document.getElementById(`wc-${hi}`);
        if (hole && charEl) { charEl.innerHTML = charHTML(activeChar, 'normal'); hole.classList.add('up'); }
      });
      const wgEl = document.getElementById('whack-grid');
      if (wgEl) wgEl.classList.add('memorize-glow');
      // Drop the HUD entirely for this window — it's the one thing new players kept
      // tapping through before actually looking. Just the grid, the glow, and a big
      // "MEMORIZE" standing in for it, so there's nothing else competing for attention.
      const hudBar = document.getElementById('whack-hud-bar'), banner = document.getElementById('whack-memorize-banner');
      if (hudBar) hudBar.style.display = 'none';
      if (banner) banner.style.display = 'block';
      driveMemorizeSideBar(memorizeMs);

      setTimeout(() => {
        if (state !== 'playing') return;
        const wgEl2 = document.getElementById('whack-grid');
        if (wgEl2) wgEl2.classList.remove('memorize-glow');
        const hudBar2 = document.getElementById('whack-hud-bar'), banner2 = document.getElementById('whack-memorize-banner');
        if (hudBar2) hudBar2.style.display = '';
        if (banner2) banner2.style.display = 'none';
        // Every hole becomes a face-down card — not just the targets — so the board
        // reads as "N cards, flip to find the ones you memorized" rather than some holes
        // being mysteriously blank and others not. The "?" cover slides in left-to-right
        // over whatever was showing (rather than an instant swap), staggered by column
        // so the whole board reads as one sweep moving left to right — this is the real
        // version of the same motion previewed in the first-time intro.
        for (let h = 0; h < HOLES; h++) {
          const hole = document.getElementById(`wh-${h}`), charEl = document.getElementById(`wc-${h}`);
          if (!hole || !charEl) continue;
          hole.classList.add('up');
          const oldContent = charEl.innerHTML;
          const col = h % GRID_COLS;
          // A permanent clipping wrapper (inset:8%, matching .whack-card-flip's own
          // sizing) hides the card while it's offset — so it looks like it slides out
          // from a hidden compartment behind the left edge, not like it flies in from
          // off-screen. The clipping lives on this wrapper, not on .whack-card-flip
          // itself, since overflow:hidden would force transform-style:flat and break
          // its own later 3D rotateY flip-on-click.
          charEl.innerHTML = `<div style="position:absolute;inset:8%;overflow:hidden;border-radius:10px">
            <div id="wold-${h}" style="position:absolute;inset:0">${oldContent}</div>
            <div class="whack-card-flip" id="wflip-${h}" style="inset:0;transform:translateX(-100%)">
              <div class="whack-card-back" id="wback-${h}">?</div>
              <div class="whack-card-face" id="wface-${h}"></div>
            </div>
          </div>`;
          setTimeout(() => {
            requestAnimationFrame(() => {
              const flipEl = document.getElementById(`wflip-${h}`);
              if (!flipEl) return;
              flipEl.style.animation = 'cabinet-slide-cover 0.65s cubic-bezier(0.32,1.2,0.66,1) forwards';
              flipEl.addEventListener('animationend', () => {
                // Clear the inline animation/transform once settled — animation output
                // has higher specificity than the .flipped class rule and would
                // otherwise block the later 3D rotate-on-click.
                flipEl.style.animation = '';
                flipEl.style.transform = '';
                // The old revealed content is fully hidden behind the "?" cover now and
                // never needs to show again — remove it so it can't peek through during
                // the later 3D rotateY flip. preserve-3d lets a flat sibling sitting
                // behind a rotating element become visible at in-between angles, which
                // is exactly the "stacking" look this was causing.
                const oldEl = document.getElementById(`wold-${h}`);
                if (oldEl) oldEl.remove();
              }, { once: true });
            });
          }, col * 45);
        }
        memoryPhase = 'recall';
        const wm2 = document.getElementById('whack-wave-mode');
        if (wm2) wm2.innerHTML = whackWaveHeaderHTML();
      }, memorizeMs);
    }, MEMORY_INTRO_MS);
  }

  // Routed here from whackHit() while memoryPhase === 'recall' — every hole is a
  // flippable card now (not just the 5 targets), so this bypasses the normal
  // holeStates-driven click handling entirely.
  function handleMemoryClick(i) {
    if (memoryPhase !== 'recall') return;
    const flip = document.getElementById(`wflip-${i}`);
    if (!flip || flip.classList.contains('flipped')) return; // already flipped, ignore
    flip.classList.add('flipped');
    const faceEl = document.getElementById(`wface-${i}`);

    if (memoryTargets.includes(i)) {
      if (faceEl) faceEl.innerHTML = charHTML(moleChar, 'whack') + CRACK_SVG;
      const holeEl = document.getElementById(`wh-${i}`);
      if (holeEl) holeEl.classList.add('hit-success');
      SFX.whack(); SFX.hit();
      memoryHit++;
      if (memoryHit >= memoryTargets.length) {
        memoryPhase = null;
        // Hold the final correct flip on screen for a beat before moving on, instead
        // of cutting straight to the wave-clear transition.
        setTimeout(() => { wave++; clearWaveTransition(); }, 1000);
      }
    } else {
      if (faceEl) faceEl.innerHTML = `<div style="font-family:'Bebas Neue',cursive;font-size:32px;color:#ff4444">✕</div>`;
      SFX.moleEscaped();
      memoryPhase = null;
      // Same idea — let the wrong flip actually be visible before the freeze screen.
      setTimeout(() => failWave('WRONG SPOT!'), 600);
    }
  }

  // Called from nav() whenever leaving the whack page (mirrors spacePause()'s role
  // for Space) — stops every pending timer and removes every body-level floating
  // element Whack creates (side bar, Clear's timer overlay, a stray intro overlay),
  // since exiting early via "ARCADE MENU" never naturally reaches the code paths
  // that would otherwise clean those up.
  window.whackBack = function() {
    holeTimers.forEach(clearTimeout); clearInterval(timerInterval);
    clearInterval(clearRoundInterval); clearInterval(clearRoundMoveInterval);
    classicPieces.forEach(p => clearTimeout(p.timer)); classicPieces = []; clearInterval(classicInterval);
    removeSideBar();
    removeClearTimerOverlay();
    document.querySelectorAll('.whack-intro-overlay').forEach(el => el.remove());
    const tapOv = document.getElementById('whack-gameover-tap');
    if (tapOv) tapOv.remove();
    awaitingGameOverTap = false;
    // No ArcadeMusic call here — nav() already ducks/unducks correctly based on
    // the destination page; doing it here too could un-duck when navigating
    // straight into another arcade game.
  };

  window.whackPlay = function() {
    holeTimers.forEach(clearTimeout); clearInterval(timerInterval);
    introShownFor = { whack: false, clear: false, memory: false };
    adventureIntroShown = false;
    activeChar = getGlobalChar();
    moleChar = pickMole();
    wave = 1; waveHits = 0;
    selfActive = false; selfIntroWave = 0; waveTransitioning = false;
    currentRoundType = 'whack'; clearInterval(clearRoundInterval); clearInterval(clearRoundMoveInterval); memoryPhase = null; removeClearTimerOverlay(); removeSideBar(); memoryAppearances = 0; clearRoundAppearances = 0;
    classicPieces.forEach(p => clearTimeout(p.timer)); classicPieces = []; clearInterval(classicInterval); classicHits = 0;
    holeStates = Array(HOLES).fill('empty');
    holeCharIdx = Array(HOLES).fill(-1);
    holeGrace = Array(HOLES).fill(false);
    holeTimers   = Array(HOLES).fill(null);
    state = 'mole-select'; render();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  };

  window.whackChangeMode = function() {
    window.whackBack();
    state = 'mode-select';
    render();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  };

  // Strict repeating cycle, not chance — WHACK, CLEAR, MEMORY, WHACK, CLEAR, MEMORY...
  // Wave 1 is always WHACK, Clear lands on wave 2, Memory on wave 3, then it repeats.
  const ROUND_CYCLE = ['whack', 'clear', 'memory'];
  function pickRoundType(w) {
    return ROUND_CYCLE[(w - 1) % ROUND_CYCLE.length];
  }

  // Short verb — used by the persistent HUD line ("WAVE N: WHACK"), which has limited
  // space and updates every wave.
  function roundTypeLabel() {
    if (currentRoundType === 'clear') return 'CLEAR';
    if (currentRoundType === 'memory') return 'MEMORIZE';
    return 'WHACK';
  }

  // Full phrase — used for the big, transient next-wave intro overlay, where there's
  // room to spell it out and it reads more clearly than a bare verb.
  function roundTypePhrase() {
    if (currentRoundType === 'clear') return 'CLEAR THE MOLES';
    if (currentRoundType === 'memory') return 'MEMORIZE THE BOARD';
    return 'WHACK THE MOLE';
  }

  function vsLabels() {
    if (currentRoundType === 'clear') return { dont: "DON'T CLEAR", verb: 'CLEAR' };
    if (currentRoundType === 'memory') return { dont: "DON'T FIND", verb: 'FIND' };
    return { dont: "DON'T WHACK", verb: 'WHACK' };
  }

  // Next-wave intro — now includes the upcoming wave number above the mode label
  // so players can track the Adventure sequence at a glance.
  function showWaveStartOverlay() {
    const ann = document.createElement('div');
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none';
    const meta = stageMeta(currentRoundType);
    // Clear and Memory rounds each get an extra line up front naming the time limit
    // they're about to be working against — Whack has no such limit, so it gets none.
    const subLine = currentRoundType === 'clear'
      ? `<span style="font-size:22px;color:#ffe61a">${getClearRoundSeconds()} SECONDS</span>`
      : currentRoundType === 'memory'
      ? `<span style="font-size:22px;color:#ffe61a">${(getMemorizeMs(memoryAppearances + 1) / 1000).toFixed(1)} SECONDS</span>`
      : '';
    ann.innerHTML = `<div style="text-align:center;animation:wave-announce 2.2s ease-out forwards">
      ${stageAnnouncementHTML(currentRoundType, roundTypePhrase(), meta.color, 46)}
      ${subLine ? `<div style="font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;color:rgba(242,239,232,0.7);margin-top:10px;line-height:1.8">${subLine}</div>` : ''}
    </div>`;
    document.body.appendChild(ann);
    setTimeout(() => ann.remove(), 2200);
  }

  // ── First-time mode intros ──────────────────────────────────────────────────
  // New players were confused about what to do, so the very first time each round
  // type comes up, it gets a slower, more explicit walkthrough instead of the normal
  // quick wave-start overlay. introShownFor (declared above) tracks which modes have
  // already had theirs this run. Runs a list of {duration, show} steps strictly in
  // order, bailing out cleanly if the game ends mid-sequence.
  function ensureIntroSkipButton(overlay, onSkip) {
    if (!overlay || !onSkip || overlay.querySelector('.intro-skip-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'intro-skip-btn';
    btn.textContent = 'SKIP';
    btn.style.cssText = "position:fixed;top:max(10px, env(safe-area-inset-top, 10px));right:calc(max(10px, env(safe-area-inset-right, 10px)) + 44px);z-index:10000;pointer-events:auto;height:32px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:6px;padding:0 12px;color:rgba(242,239,232,0.5);cursor:pointer";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    };
    overlay.appendChild(btn);
  }

  function playIntroSteps(steps, onComplete, overlay, onSkip) {
    let i = 0;
    let timeoutId = null;
    let done = false;
    function cancel() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
    }
    function finish() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      onComplete();
    }
    function tick() {
      if (done || state !== 'playing') return;
      if (i >= steps.length) { finish(); return; }
      const step = steps[i++];
      step.show();
      ensureIntroSkipButton(overlay, onSkip);
      timeoutId = setTimeout(tick, step.duration);
    }
    tick();
    return { cancel, finish };
  }

  function introHeadline(text, color, size) {
    return `<div style="font-family:'Bebas Neue',cursive;font-size:${size||42}px;letter-spacing:3px;color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color}66;text-align:center;line-height:1.2">${text}</div>`;
  }
  function stageMeta(type) {
    if (type === 'clear') return { label: 'CLEAR', color: '#ffe61a', icon: 'grid' };
    if (type === 'memory') return { label: 'MEMORIZE', color: '#00e5ff', icon: 'cards' };
    return { label: 'WHACK', color: '#ff00cc', icon: 'burst' };
  }
  function stageIconHTML(type, color, size) {
    const s = size || 44;
    const stroke = color;
    const glow = `${color}66`;
    const shape = type === 'grid'
      ? `<rect x="13" y="13" width="30" height="30" rx="4" fill="rgba(255,255,255,0.035)" stroke="${stroke}" stroke-width="3"/><line x1="23" y1="13" x2="23" y2="43" stroke="${stroke}" stroke-width="2" opacity="0.8"/><line x1="33" y1="13" x2="33" y2="43" stroke="${stroke}" stroke-width="2" opacity="0.8"/><line x1="13" y1="23" x2="43" y2="23" stroke="${stroke}" stroke-width="2" opacity="0.8"/><line x1="13" y1="33" x2="43" y2="33" stroke="${stroke}" stroke-width="2" opacity="0.8"/><path d="M19 31 L26 38 L39 20" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      : type === 'cards'
      ? `<rect x="15" y="11" width="22" height="30" rx="4" fill="rgba(255,255,255,0.04)" stroke="${stroke}" stroke-width="3" transform="rotate(-9 26 26)"/><rect x="22" y="16" width="22" height="30" rx="4" fill="rgba(255,255,255,0.035)" stroke="${stroke}" stroke-width="3" transform="rotate(8 33 31)"/><circle cx="32" cy="31" r="5" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="32" cy="31" r="1.7" fill="#fff"/>`
      : `<path d="M28 7 L33 21 L48 16 L39 29 L50 40 L35 38 L28 51 L21 38 L6 40 L17 29 L8 16 L23 21 Z" fill="rgba(255,255,255,0.04)" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/><circle cx="28" cy="29" r="8" fill="none" stroke="#fff" stroke-width="2.5"/>`;
    return `<svg width="${s}" height="${s}" viewBox="0 0 56 56" style="flex:0 0 auto;overflow:visible;filter:drop-shadow(0 0 8px ${glow})" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="rgba(5,2,18,0.34)" stroke="${stroke}" stroke-width="2" opacity="0.7"/>
      ${shape}
    </svg>`;
  }
  function stageTitleHTML(type, label, color, size) {
    const meta = stageMeta(type);
    const c = color || meta.color;
    return `<div style="display:flex;align-items:center;justify-content:center;gap:12px;line-height:1">
      ${stageIconHTML(meta.icon, c, Math.max(34, (size || 58) * 0.72))}
      ${introHeadline(label || meta.label, c, size || 58)}
    </div>`;
  }
  function stageAnnouncementHTML(type, label, color, size) {
    const meta = stageMeta(type);
    const c = color || meta.color;
    const waveHTML = gameMode === 'frenzy'
      ? `<div style="font-family:'VCR',monospace;font-size:15px;letter-spacing:4px;color:rgba(242,239,232,0.72);text-shadow:0 0 10px ${c}55;text-transform:uppercase;margin-bottom:8px">WAVE ${wave}</div>`
      : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      ${waveHTML}
      ${stageTitleHTML(type, label, c, size)}
    </div>`;
  }
  function whackWaveHeaderHTML(label) {
    const meta = stageMeta(currentRoundType);
    return `<span style="display:inline-flex;align-items:center;justify-content:center;gap:7px;color:${meta.color};text-shadow:0 0 10px ${meta.color}88">
      ${stageIconHTML(meta.icon, meta.color, 24)}
      <span>WAVE ${wave}: ${label || roundTypeLabel()}</span>
    </span>`;
  }

  // Title/objective text anchors to the vertical middle of the grid's top row of
  // holes (not a generic viewport-center percentage) — reads as pointing at the
  // board itself rather than floating in empty space. Falls back to viewport-center
  // if the grid isn't in the DOM yet for some reason.
  function introTopRowY() {
    const grid = document.getElementById('whack-grid');
    if (!grid) return window.innerHeight * 0.5;
    const rect = grid.getBoundingClientRect();
    const rowHeight = rect.height / (GRID_ROWS || 4);
    return rect.top + rowHeight / 2;
  }
  function introObjectiveHTML(text, color, contentHTML) {
    const y = introTopRowY();
    return `<div style="position:absolute;top:${y}px;left:50%;width:100%;transform:translate(-50%,-50%)">${introHeadline(text, color, 40)}</div>` +
      (contentHTML ? `<div style="position:absolute;top:${y + 56}px;left:50%;transform:translateX(-50%)">${contentHTML}</div>` : '');
  }

  // boxSize/faceSize let callers ask for "medium" (title beats) vs "big" (objective
  // beats) without two near-duplicate functions.
  function introFace(ci, ringColor, boxSize, faceSize) {
    const gc = GAME_CHARS[ci];
    return `<div style="width:${boxSize}px;height:${boxSize}px;margin:16px auto 0;border-radius:16px;overflow:hidden;border:3px solid ${ringColor};background:${ringColor}22;box-shadow:0 0 26px ${ringColor}66;display:flex;align-items:center;justify-content:center">
      <div style="width:${faceSize}px;height:${faceSize}px">${charFace(gc,'normal')}</div>
    </div>`;
  }

  // Small demo of the real side-bar timer draining, used by Clear/Memory's first-time
  // intro to call out "watch this" before it matters for real.
  function introTimerDemoHTML() {
    // The fill is bottom-anchored (position:absolute;bottom:0), matching the real
    // side-bar exactly — without it, a plain flow child shrinks from the top down
    // instead of draining the same direction as the real timer.
    return `<div style="margin:16px auto 0;width:14px;height:90px;border-radius:7px;border:1px solid rgba(255,230,26,0.35);background:rgba(0,0,0,0.35);overflow:hidden;position:relative">
      <div id="intro-timer-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:rgba(255,230,26,0.55)"></div>
    </div>`;
  }
  function startIntroTimerDrain() {
    const fill = document.getElementById('intro-timer-fill');
    if (!fill) return;
    requestAnimationFrame(() => {
      fill.style.transition = 'height 1.5s linear';
      fill.style.height = '0%';
    });
  }

  // opaque=true (first-time sequences, which include grid-shaped demo content) uses
  // the near-solid background that stops the real board showing through and reading
  // as a second, stacked board behind the demo. Repeat title-only flashes have no
  // demo content to protect against that, so they stay lighter — full opacity every
  // single wave forever was overkill once the novelty of the first 3 wears off.
  function makeIntroOverlay(opaque) {
    const ann = document.createElement('div');
    ann.className = 'whack-intro-overlay'; // tagged so whackBack() can find and remove a stray one on early exit
    const bg = opaque ? 'rgba(5,2,18,0.92)' : 'rgba(5,2,18,0.55)';
    ann.style.cssText = `position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;pointer-events:none;background:${bg}`;
    document.body.appendChild(ann);
    return ann;
  }

  // Title shows every time a mode starts (pink, larger). The extra steps after it —
  // objective (blue) plus any demo beats — only ever play the first time that mode
  // comes up this run; every later wave just gets the title alone, briefly.
  function playModeIntro(type, onDone) {
    const isFirst = !introShownFor[type];
    const titleText = type === 'whack' ? 'WHACK' : type === 'clear' ? 'CLEAR THE MOLES' : 'MEMORIZE THE BOARD';
    const ann = makeIntroOverlay(isFirst);
    let ctrl = null;
    const skipIntro = () => {
      introShownFor[type] = true;
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    ctrl = playIntroSteps([
      { duration: isFirst ? 1800 : 1200, show: () => {
        const meta = stageMeta(type);
        ann.innerHTML = `<div style="position:absolute;top:50%;left:50%;width:100%;transform:translate(-50%,-50%)">${stageAnnouncementHTML(type, titleText, meta.color, 54)}</div>`;
      } },
    ], () => {
      if (!isFirst) { ann.remove(); onDone(); return; }
      introShownFor[type] = true;
      const extraSteps = type === 'whack' ? whackIntroExtraSteps()
        : type === 'clear' ? clearIntroExtraSteps()
        : memoryIntroExtraSteps();
      ctrl = playIntroSteps(extraSteps, () => { ann.remove(); onDone(); }, ann, skipIntro);
      function whackIntroExtraSteps() {
        return [
          { duration: 1500, show: () => {
            ann.innerHTML = introObjectiveHTML('THIS IS THE MOLE', '#00e5ff',
              `<div style="width:130px;height:130px;margin:16px auto 0;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;box-shadow:0 0 26px #ff444466;display:flex;align-items:center;justify-content:center">
                <div id="intro-mole-face" style="width:104px;height:104px;position:relative">${charFace(GAME_CHARS[moleChar],'normal')}</div>
              </div>`);
            // Demonstrate the real whack-hit effect (BAM face + sound) partway
            // through, so the first mole this player ever sees already shows them what
            // a successful hit looks like.
            setTimeout(() => {
              if (state !== 'playing') return;
              const faceBox = document.getElementById('intro-mole-face');
              if (faceBox) faceBox.innerHTML = charFace(GAME_CHARS[moleChar], 'whack') + CRACK_SVG;
              SFX.whack(); SFX.hit();
            }, 1000);
          }},
          { duration: 1500, show: () => {
            ann.innerHTML = introObjectiveHTML("DON'T WHACK YOURSELF", '#00e5ff', introFace(activeChar, '#33ff66', 130, 104));
          }},
        ];
      }
      function clearIntroExtraSteps() {
        return [
          { duration: 800, show: () => { ann.innerHTML = ''; } }, // brief blank beat
          { duration: 1200, show: () => { ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff', ''); } }, // ominous, alone
          { duration: 2200, show: () => {
            // Text comes up immediately; the sliding image follows shortly after, so the
            // warning reads before the motion that's being warned about.
            ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff',
              `<div id="intro-clear-slide-slot" style="min-height:84px;display:flex;align-items:center;justify-content:center"></div>` +
              `<div style="margin-top:32px">${introHeadline('THEY MAY MOVE', '#00e5ff', 40)}</div>`);
            setTimeout(() => {
              if (state !== 'playing') return;
              const slot = document.getElementById('intro-clear-slide-slot');
              if (slot) slot.innerHTML = `<div style="width:84px;height:84px;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;animation:intro-mole-slide 0.9s ease-in-out infinite">${charFace(GAME_CHARS[moleChar],'normal')}</div>`;
            }, 450);
          }},
          { duration: 1800, show: () => {
            ann.innerHTML = introObjectiveHTML('WATCH THE TIMER', '#00e5ff', introTimerDemoHTML());
            startIntroTimerDrain();
          }},
        ];
      }
      function memoryIntroExtraSteps() {
        return [
          { duration: 3800, show: () => {
            // Bring the instruction and demo board up together so there is no dead
            // beat between the title and the thing the player needs to watch.
            const SIZE = 9, MOLE_COUNT = 3;
            // Never let the 3 moles land on a tic-tac-toe line (row/column/diagonal) —
            // a "winning" pattern reads as deliberate, not like real random spots.
            const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
            let moleSet;
            do {
              moleSet = new Set();
              while (moleSet.size < MOLE_COUNT) moleSet.add(Math.floor(Math.random() * SIZE));
            } while (LINES.some(line => line.every(i => moleSet.has(i))));
            let html = introObjectiveHTML('MEMORIZE THE BOARD', '#00e5ff', '') +
              `<div style="position:absolute;top:${introTopRowY() + 56}px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:repeat(3,46px);gap:6px">`;
            for (let k = 0; k < SIZE; k++) {
              const isMole = moleSet.has(k);
              html += `<div class="intro-mem-cell" data-i="${k}" style="position:relative;width:46px;height:46px;overflow:hidden;border-radius:8px">
                <div style="position:absolute;inset:0;border-radius:8px;overflow:hidden;border:2px solid ${isMole ? '#ff4444' : 'rgba(255,255,255,0.08)'};background:${isMole ? '#ff444422' : 'rgba(255,255,255,0.03)'}">${isMole ? charFace(GAME_CHARS[moleChar], 'normal') : ''}</div>
                <div class="intro-mem-cover" style="position:absolute;inset:0;border-radius:8px;background:linear-gradient(135deg,#2a1a4a,#1a0f2e);border:2px solid rgba(0,229,255,0.6);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',cursive;font-size:16px;color:rgba(0,229,255,0.7);transform:translateX(-100%)">?</div>
              </div>`;
            }
            html += `</div>`;
            ann.innerHTML = html;
            // Covers slide in over every cell, staggered.
            setTimeout(() => {
              if (state !== 'playing') return;
              document.querySelectorAll('.intro-mem-cover').forEach((el, idx) => {
                setTimeout(() => {
                  requestAnimationFrame(() => {
                    el.style.animation = 'cabinet-slide-cover 0.65s cubic-bezier(0.32,1.2,0.66,1) forwards';
                  });
                }, idx * 35);
              });
            }, 650);
            // The correct cells pop open (briefly revealing the mole again), then
            // close back over a green checkmark — recall, demonstrated.
            setTimeout(() => {
              if (state !== 'playing') return;
              let mi = 0;
              moleSet.forEach(k => {
                setTimeout(() => {
                  const cell = document.querySelector(`.intro-mem-cell[data-i="${k}"]`);
                  const cover = cell && cell.querySelector('.intro-mem-cover');
                  if (!cover) return;
                  cover.style.transition = 'transform 0.45s ease-in';
                  cover.style.transform = 'translateX(-100%)';
                  setTimeout(() => {
                    cover.innerHTML = '✓';
                    cover.style.color = '#33ff66';
                    cover.style.borderColor = 'rgba(51,255,102,0.7)';
                    cover.style.background = 'rgba(51,255,102,0.15)';
                    cover.style.transition = 'transform 0.45s ease-out';
                    cover.style.transform = 'translateX(0)';
                  }, 450);
                }, mi * 190);
                mi++;
              });
            }, 1550);
          }},
          { duration: 1800, show: () => {
            ann.innerHTML = introObjectiveHTML('WATCH THE TIMER', '#00e5ff', introTimerDemoHTML());
            startIntroTimerDrain();
          }},
        ];
      }
    }, ann, isFirst ? skipIntro : null);
  }

  function playAdventureOverviewIntro(onDone) {
    if (adventureIntroShown || gameMode !== 'frenzy') { onDone(); return; }
    adventureIntroShown = true;
    const ann = makeIntroOverlay(true);
    let ctrl = null;
    const skipIntro = () => {
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    const overviewLines = [];
    const showIntroWord = (text, color, size, type) => {
      overviewLines.push({ text, color, size: size || 56, type });
      ann.innerHTML = `<div style="position:absolute;top:50%;left:50%;width:100%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px">
        ${overviewLines.map(line => line.type ? stageTitleHTML(line.type, line.text, line.color, line.size) : introHeadline(line.text, line.color, line.size)).join('')}
      </div>`;
    };
    ctrl = playIntroSteps([
      { duration: 1700, show: () => showIntroWord('THIS ADVENTURE HAS THREE WAVES', '#f2efe8', 34) },
      { duration: 1400, show: () => showIntroWord('WHACK', '#ff00cc', 64, 'whack') },
      { duration: 1400, show: () => showIntroWord('CLEAR', '#ffe61a', 64, 'clear') },
      { duration: 1400, show: () => showIntroWord('MEMORIZE', '#00e5ff', 64, 'memory') },
    ], () => { ann.remove(); onDone(); }, ann, skipIntro);
  }

  // Classic's intro — skips the pink title step entirely (no per-mode title concept
  // for a standalone mode) and plays in full every session, not gated by
  // introShownFor: "THIS IS THE MOLE" (with the same whack-hit demo as Frenzy's Whack
  // intro) followed by Clear's full BE CAREFUL sequence verbatim, since Classic's
  // movement mechanic is the same hole-to-hole sliding Clear introduces.
  function classicIntroSteps(onDone) {
    const ann = makeIntroOverlay(true); // plays in full every session — always the opaque treatment
    let ctrl = null;
    const skipIntro = () => {
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    ctrl = playIntroSteps([
      { duration: 1500, show: () => {
        ann.innerHTML = introObjectiveHTML('THIS IS THE MOLE', '#00e5ff',
          `<div style="width:130px;height:130px;margin:16px auto 0;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;box-shadow:0 0 26px #ff444466;display:flex;align-items:center;justify-content:center">
            <div id="intro-mole-face" style="width:104px;height:104px;position:relative">${charFace(GAME_CHARS[moleChar],'normal')}</div>
          </div>`);
        setTimeout(() => {
          if (state !== 'playing') return;
          const faceBox = document.getElementById('intro-mole-face');
          if (faceBox) faceBox.innerHTML = charFace(GAME_CHARS[moleChar], 'whack') + CRACK_SVG;
          SFX.whack(); SFX.hit();
        }, 1000);
      }},
      { duration: 1000, show: () => { ann.innerHTML = ''; } }, // blank beat
      { duration: 1000, show: () => { ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff', ''); } }, // ominous, alone
      { duration: 3000, show: () => {
        ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff',
          `<div id="intro-classic-slide-slot" style="min-height:84px;display:flex;align-items:center;justify-content:center"></div>` +
          `<div style="margin-top:32px">${introHeadline('THEY MAY MOVE', '#00e5ff', 40)}</div>`);
        setTimeout(() => {
          if (state !== 'playing') return;
          const slot = document.getElementById('intro-classic-slide-slot');
          if (slot) slot.innerHTML = `<div style="width:84px;height:84px;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;animation:intro-mole-slide 1.1s ease-in-out infinite">${charFace(GAME_CHARS[moleChar],'normal')}</div>`;
        }, 1000);
      }},
      { duration: 2000, show: () => {
        ann.innerHTML = introObjectiveHTML('WATCH THE TIMER', '#00e5ff', introTimerDemoHTML());
        startIntroTimerDrain();
      }},
    ], () => { ann.remove(); onDone(); }, ann, skipIntro);
  }

  // Drives the vertical side bar over the actual memorize window — started only once
  // targets are revealed, every frame rather than once a second (memorizeMs is too
  // short for per-second ticks to read as a smooth drain).
  function driveMemorizeSideBar(memorizeMs) {
    showSideBar('memorize');
    const start = Date.now();
    const tick = () => {
      // Round moved on (recall phase, or reset/fail) before the bar naturally hit
      // zero — remove it rather than abandoning it mid-drain on screen.
      if (memoryPhase !== 'showing') { removeSideBar(); return; }
      const pct = Math.max(0, 1 - (Date.now() - start) / memorizeMs) * 100;
      updateSideBar(pct);
      if (pct > 0) requestAnimationFrame(tick);
      else removeSideBar();
    };
    requestAnimationFrame(tick);
  }

  // Inline onclick="..." attributes run with the GLOBAL scope as their lexical parent
  // — they cannot see this IIFE's own `let` variables (gameMode/difficulty/state) or
  // call its plain `render()`. Every screen-transition triggered from markup must go
  // through an explicitly window-exposed function like these, the same way
  // whackBegin/whackPlay/whackHit already are.
  function syncWhackLeaderboardState() {
    window._whackMode = gameMode;
    window._whackDifficulty = difficulty;
  }
  syncWhackLeaderboardState();
  window.whackChooseMode = function(mode) {
    gameMode = mode;
    syncWhackLeaderboardState();
    render();
  };
  window.whackSetDifficulty = function(d) {
    difficulty = d;
    syncWhackLeaderboardState();
  };
  window.whackSelectModeDifficulty = function(mode, d) {
    gameMode = mode;
    difficulty = d;
    syncWhackLeaderboardState();
    moleChar = pickMole();
    state = 'mole-select';
    render();
  };
  window.whackToMoleSelect = function() {
    moleChar = pickMole();
    state = 'mole-select';
    render();
  };

  window.whackBegin = function() {
    ArcadeMusic.stop();
    if (gameMode === 'classic') {
      const _mob = window.innerWidth <= 600;
      if (difficulty === 'easy') { GRID_COLS = _mob ? 3 : 4; GRID_ROWS = _mob ? 5 : 4; }
      else                        { GRID_COLS = 4; GRID_ROWS = 5; }
      HOLES = GRID_COLS * GRID_ROWS;
      state = 'playing'; render();
      classicIntroSteps(classicStart);
      return;
    }
    applyDifficultyGridSize();
    state = 'playing'; render();
    waveTransitioning = true;
    const startWhacking = () => {
      if (state !== 'playing') return;
      waveTransitioning = false;
      scheduleAll();
    };
    playAdventureOverviewIntro(() => playModeIntro('whack', startWhacking));
  };

  window.initWhack = function() {
    holeTimers.forEach(clearTimeout); clearInterval(timerInterval);
    syncWhackLeaderboardState();
    introShownFor = { whack: false, clear: false, memory: false };
    adventureIntroShown = false;
    activeChar = getGlobalChar();
    moleChar = pickMole();
    state = 'mode-select'; wave = 1; waveHits = 0;
    selfActive = false; selfIntroWave = 0; waveTransitioning = false;
    currentRoundType = 'whack'; clearInterval(clearRoundInterval); clearInterval(clearRoundMoveInterval); memoryPhase = null; removeClearTimerOverlay(); removeSideBar(); memoryAppearances = 0; clearRoundAppearances = 0;
    classicPieces.forEach(p => clearTimeout(p.timer)); classicPieces = []; clearInterval(classicInterval); classicHits = 0;
    holeStates = Array(HOLES).fill('empty');
    holeCharIdx = Array(HOLES).fill(-1);
    holeGrace = Array(HOLES).fill(false);
    holeTimers   = Array(HOLES).fill(null);
    render();
  };
})();

// ══════════════════════════════════════
//  MEMORY MOBE
// ══════════════════════════════════════
(function() {
  let PAIRS = 9; // dynamic, set per-mode in makeCards()
  let cards = [], flipped = [], locked = false;
  let moves = 0, matched = 0, state = 'idle', matchScore = 0, combo = 0, matchTimer = 0, timerInt, previewInt, timeLimit = 60;
  let matchOutOfMoves = false;
  let matchCutoffWaived = false; // true once "FINISH ANYWAY" is chosen — stops re-prompting
  const IMPOSSIBLE_MOVE_CUTOFF = 55;
  let matchMode = 'hard'; // 'free' | 'hard' | 'challenge' | 'impossible'
  let freePlayCharCount = 8; // 4–20, how many distinct characters appear in free play
  window._matchMode = matchMode;
  window._matchFreePairs = freePlayCharCount;
  // Hard = the old "timed" mode. Challenge/Impossible add a target-moves benchmark to
  // beat (not a hard fail — you can always finish, it's just a "did you beat it?" badge)
  // plus a generous time limit so move-efficiency, not the clock, is the real challenge.
  const MODE_CONFIG = {
    hard:       { pairs: 12, time: 60, targetMoves: null },
    challenge:  { pairs: 16, time: 60, targetMoves: null },
    impossible: { pairs: 21, time: 20, targetMoves: null },
  };

  function shuffle(arr) {
    for (let i = arr.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }

  function gridLayout(pairs) {
    // Named modes use explicit clean grids so mobile never gets a ragged row or a
    // too-wide square-ish board. Challenge uses 16 pairs to fit 4x8 cleanly.
    if (matchMode === 'hard') return { cols: 4, rows: 6 };       // 24 cards
    if (matchMode === 'challenge') return { cols: 4, rows: 8 };  // 32 cards
    if (matchMode === 'impossible') return { cols: 6, rows: 7 }; // 42 cards
    const n = pairs * 2;
    const cols = Math.max(2, Math.min(7, Math.round(Math.sqrt(n))));
    return { cols, rows: Math.ceil(n / cols) };
  }

  function makeCards() {
    // Every mode now picks a random subset of characters (free play already did this —
    // the old hard/"timed" mode always used the same fixed first-N characters, every
    // single game; randomizing it too is strictly more replayable, no downside).
    PAIRS = matchMode === 'free' ? freePlayCharCount : MODE_CONFIG[matchMode].pairs;
    const pairIndices = shuffle([...Array(GAME_CHARS.length).keys()]).slice(0, PAIRS);
    return shuffle([...pairIndices, ...pairIndices]).map((ci, id) => ({ id, ci, matched: false, flipped: false }));
  }

  function fmtTime(s) { return Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60; }

  function render() {
    const wrap = document.getElementById('match-wrap');
    if (!wrap) return;
    setArcadeExitVisible(state !== 'over');
    wrap.classList.toggle('mode-select-layout', state === 'idle' || state === 'free-setup');
    document.body.classList.toggle('arcade-selection-open', state === 'idle' || state === 'free-setup' || state === 'preview');
    if (state === 'idle' || state === 'free-setup' || state === 'preview') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }

    if (state === 'idle') {
      if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
      const best = localStorage.getItem('match-best-score');
      wrap.innerHTML = `
        <div class="whack-mode-shell" style="max-width:440px;margin-top:24px">
          <div class="whack-mode-title">CHOOSE MODE</div>
          <div class="game-card whack-mode-card" style="border-color:#ffe61a66;cursor:default;min-height:0">
            <div class="game-card-art" style="background:#0d0a1e">
              <div id="match-mode-art" style="position:absolute;inset:0;z-index:0;opacity:0.97;transform:scale(1.26) translateY(10px);filter:saturate(1.18) brightness(.8);pointer-events:none;mix-blend-mode:screen"></div>
            </div>
            <div class="game-card-info" style="position:relative;z-index:2">
            <div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 14px #ffe61a88;margin-bottom:8px">MEMORY MOBE</div>
            <svg viewBox="0 0 280 80" width="100%" height="70" style="display:block;margin:0 auto 8px">
              <g class="card-drift" style="--r0:-4deg;--r1:1deg;animation-delay:0s"><rect x="8" y="6" width="50" height="66" rx="6" fill="#2a1a55" stroke="#ffe61a" stroke-width="1.5" opacity="0.8"/><text x="33" y="46" text-anchor="middle" font-size="22" fill="#ffe61a" opacity="0.5" font-family="'Bebas Neue',cursive">?</text></g>
              <g class="card-drift" style="--r0:0deg;--r1:3deg;animation-delay:0.4s"><rect x="66" y="6" width="50" height="66" rx="6" fill="#3a2a77" stroke="#ffe61a" stroke-width="2"/><path d="M75,38 L82,47 L97,27" stroke="#ffe61a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
              <g class="card-drift" style="--r0:3deg;--r1:-2deg;animation-delay:0.8s"><rect x="124" y="6" width="50" height="66" rx="6" fill="#2a1a55" stroke="#ffe61a" stroke-width="1.5" opacity="0.8"/><text x="149" y="46" text-anchor="middle" font-size="22" fill="#ffe61a" opacity="0.5" font-family="'Bebas Neue',cursive">?</text></g>
              <g class="card-drift" style="--r0:0deg;--r1:-3deg;animation-delay:1.2s" opacity="0.85"><rect x="182" y="6" width="50" height="66" rx="6" fill="#3a2a77" stroke="#ffe61a" stroke-width="2"/><path d="M191,38 L198,47 L213,27" stroke="#ffe61a" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
              <text x="248" y="24" font-size="14" fill="#ffe61a" opacity="0.9">✦</text>
              <text x="258" y="40" font-size="10" fill="#ffe61a" opacity="0.7">✦</text>
            </svg>
            <div class="game-card-marquee" style="color:#ffe61a;text-shadow:0 0 16px rgba(255,230,26,0.65)">FLIP CARDS TO FIND PAIRS</div>
            ${best ? `<div class="game-card-desc" style="color:#ffe61a;opacity:0.9;margin-bottom:10px">BEST SCORE: ${best}</div>` : `<div style="height:8px"></div>`}
            <div class="match-mode-select" style="display:flex;flex-direction:column;gap:8px;align-items:stretch;margin-top:2px">
            <button class="whack-btn match-mode-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.14);padding:10px 16px;text-align:left" onclick="matchGoFreeSetup()">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">FREE PLAY</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">4-20 PAIRS · UNLIMITED MOVES · NO TIME LIMIT</div>
            </button>
            <button class="whack-btn match-mode-btn" style="border-color:#ffe61a;background:rgba(255,230,26,0.14);padding:10px 16px;text-align:left" onclick="matchPlay('hard')">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">HARD</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">12 PAIRS · UNLIMITED MOVES · 60 SECONDS</div>
            </button>
            <button class="whack-btn match-mode-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.1);padding:10px 16px;text-align:left" onclick="matchPlay('challenge')">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">CHALLENGE</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">16 PAIRS · UNLIMITED MOVES · 60 SECONDS</div>
            </button>
            <button class="whack-btn match-mode-btn" style="border-color:#ff4444;background:rgba(255,68,68,0.1);padding:10px 16px;text-align:left" onclick="matchPlay('impossible')">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">IMPOSSIBLE</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">21 PAIRS · ${IMPOSSIBLE_MOVE_CUTOFF} MOVES · 20 SECONDS</div>
            </button>
            </div>
            </div>
          </div>
        </div>`;
      mountSelectionArt('match-mode-art', 'match');
      return;
    }

    if (state === 'free-setup') {
      if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
      const btnStyle = 'font-family:\'VCR\',monospace;font-size:13px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:4px;color:rgba(242,239,232,0.65);width:36px;height:36px;cursor:pointer;padding:0;line-height:1';
      wrap.innerHTML = `
        <div class="arcade-cabinet" style="--nc:#ffe61a">
          <div class="arcade-cab-rail"></div>
          <div class="arcade-cab-marquee">FREE PLAY</div>
          <div class="arcade-cab-screen" style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px">
            <div class="match-sub">ONE PAIR PER CHARACTER · UNIQUE FACES</div>
            <div class="match-sub" style="margin-top:4px">HOW MANY CHARACTERS?</div>
            <div style="display:flex;align-items:center;gap:20px;margin:8px 0">
              <button onclick="matchAdjChar(-1)" style="${btnStyle}">−</button>
              <span id="match-char-ct" style="font-family:'Bebas Neue',cursive;font-size:56px;letter-spacing:4px;color:#ffe61a;line-height:1;text-shadow:0 0 18px #ffe61a88">${freePlayCharCount}</span>
              <button onclick="matchAdjChar(1)" style="${btnStyle}">+</button>
            </div>
            <div class="match-sub" style="opacity:0.4">4 – 20</div>
          </div>
          <div class="arcade-cab-foot" style="display:flex;flex-direction:column;gap:8px;align-items:stretch">
            <button class="whack-btn match-mode-btn" style="border-color:#ffe61a;background:rgba(255,230,26,0.14)" onclick="matchPlay('free')">▶ START</button>
            <button class="whack-btn match-mode-btn" style="border-color:rgba(255,230,26,0.15);background:none;font-size:10px" onclick="matchGoIdle()">◀ BACK</button>
          </div>
        </div>`;
      return;
    }

    if (state === 'preview') {
      const _gl = gridLayout(PAIRS);
      const _gap = matchMode === 'challenge' ? 4 : 6;
      // Timed modes draw a vertical countdown bar to the right of the board.
      // Reserve that gutter in the mobile card-size math so the bar sits BESIDE
      // the cards instead of being clamped back on top of the last column.
      const _sideBarReserve = (window.innerWidth <= 600 && (matchMode === 'hard' || matchMode === 'challenge')) ? 28 : 0;
      const _ghp = (_gl.cols - 1) * _gap + 24 + _sideBarReserve;
      const _vPad = window.innerWidth <= 600 ? (matchMode === 'challenge' ? 58 : 70) : 180;
      const _gStyle = `--card:min(calc((min(100vw,520px) - ${_ghp}px) / ${_gl.cols}),calc((var(--app-vh, 100dvh) - ${_vPad}px) / ${_gl.rows}));grid-template-columns:repeat(${_gl.cols},var(--card));grid-template-rows:repeat(${_gl.rows},var(--card));gap:${_gap}px`;
      wrap.innerHTML = `
        <div class="match-hud" style="padding:6px 16px">
          <div style="font-family:'Bebas Neue',cursive;font-size:28px;letter-spacing:5px;color:#ffe61a;text-shadow:0 0 14px #ffe61a88" id="match-preview-cd">MEMORIZE!  ${matchMode === 'impossible' ? 7 : matchMode === 'challenge' ? 4 : 3}</div>
        </div>
        <div class="match-grid" style="${_gStyle}">${
          cards.map((c,i) => {
            const gc = GAME_CHARS[c.ci];
            return `<div class="match-card-wrap">
              <div class="match-card flipped" id="mc-${i}">
                <div class="match-card-front"></div>
                <div class="match-card-back" style="background:${gc.color}22;border-color:${gc.color}55">${charFace(gc,'normal')}</div>
              </div>
            </div>`;
          }).join('')
        }</div>`;
      return;
    }

    if (state === 'playing') {
      const _gl = gridLayout(PAIRS);
      const _gap = matchMode === 'challenge' ? 4 : 6;
      // Timed modes draw a vertical countdown bar to the right of the board.
      // Reserve that gutter in the mobile card-size math so the bar sits BESIDE
      // the cards instead of being clamped back on top of the last column.
      const _sideBarReserve = (window.innerWidth <= 600 && (matchMode === 'hard' || matchMode === 'challenge')) ? 28 : 0;
      const _ghp = (_gl.cols - 1) * _gap + 24 + _sideBarReserve;
      const _vPad = window.innerWidth <= 600 ? (matchMode === 'challenge' ? 58 : 70) : 180;
      const _gStyle = `--card:min(calc((min(100vw,520px) - ${_ghp}px) / ${_gl.cols}),calc((var(--app-vh, 100dvh) - ${_vPad}px) / ${_gl.rows}));grid-template-columns:repeat(${_gl.cols},var(--card));grid-template-rows:repeat(${_gl.rows},var(--card));gap:${_gap}px`;
      wrap.innerHTML = `
        <div class="match-hud" style="padding:6px 16px">
          <div style="display:none"><div class="whack-stat-label">SCORE</div><div class="whack-stat-val" id="ms" style="font-size:24px">${matchScore}</div></div>
          <div><div class="whack-stat-label">TIME</div><div class="whack-stat-val" id="mt" style="font-size:${matchMode === 'free' ? 22 : 32}px;line-height:1">${matchMode === 'free' ? 'NONE' : Math.max(0, timeLimit - matchTimer) + 's'}</div></div>
          <div style="text-align:center"><div class="whack-stat-label">PAIRS</div><div class="whack-stat-val" id="match-pairs" style="font-size:24px">${matched}/${PAIRS}</div></div>
          <div style="text-align:right"><div class="whack-stat-label">MOVES</div><div class="whack-stat-val" id="match-moves" style="font-size:24px">${moves}${matchMode==='impossible'?'/'+IMPOSSIBLE_MOVE_CUTOFF:''}</div></div>
        </div>
        <div class="match-grid" style="${_gStyle}">${
          cards.map((c,i) => {
            const gc = GAME_CHARS[c.ci];
            return `<div class="match-card-wrap" onclick="matchFlip(${i})">
              <div class="match-card${c.flipped||c.matched?' flipped':''}${c.matched?' matched':''}" id="mc-${i}">
                <div class="match-card-front"></div>
                <div class="match-card-back" style="background:${gc.color}22;border-color:${gc.color}55">${charFace(gc,'normal')}</div>
              </div>
            </div>`;
          }).join('')
        }</div>`;
      return;
    }

    if (state === 'over') {
      setArcadeExitVisible(false);
      wrap.scrollTop = 0;
      const didWin = matched === PAIRS;
      if (matchMode === 'free') {
        const boardKey = getMatchLeaderboardKey({ mode: matchMode, pairs: freePlayCharCount });
        const uid = `match-free-${freePlayCharCount}`;
        wrap.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'match',
          color: '#ff9933',
          marquee: 'CLEARED!',
          marqueeEnd: '#a89000',
          marqueeSolid: true,
          marqueeBg: '#ff9933',
          scoreLabel: 'YOUR SCORE',
          scoreValue: matchScore,
          saveValue: matchScore,
          field: 'score',
          extra: `FREE PLAY · ${freePlayCharCount} PAIRS`,
          ascending: false,
          buttons: `
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchGoFreeSetup()">PLAY AGAIN</button>
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchChangeMode()">CHANGE MODE</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#ff9933', 'score');
        mountSelectionArt(`${uid}-art`, 'match');
      } else {
        const headline = didWin ? 'CLEARED!' : (matchOutOfMoves ? 'OUT OF MOVES!' : "TIME'S UP!");
        const boardKey = getMatchLeaderboardKey({ mode: matchMode, pairs: freePlayCharCount });
        const uid = `match-${matchMode}`;
        let scoreLabel = 'YOUR SCORE';
        let scoreValue = matchScore;
        let saveValue = matchScore;
        let scoreExtra = '';
        let field = 'score';
        let ascending = false;
        if (matchMode === 'challenge') {
          scoreLabel = 'YOUR TIME';
          scoreValue = fmtTime(matchTimer);
          saveValue = matchTimer;
          scoreExtra = '';
          field = 'seconds';
          ascending = true;
        } else if (matchMode === 'impossible') {
          scoreLabel = 'YOUR MOVES';
          scoreValue = moves;
          saveValue = moves;
          scoreExtra = '';
          field = 'score';
          ascending = true;
        } else if (matchMode === 'hard') {
          scoreExtra = '';
        }
        wrap.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'match',
          color: '#ff9933',
          marquee: headline,
          marqueeEnd: '#ff00cc',
          marqueeSolid: true,
          marqueeBg: '#ff9933',
          scoreLabel,
          scoreValue,
          saveValue,
          scoreExtra,
          field,
          extra: scoreExtra,
          seconds: matchMode === 'challenge' ? matchTimer : 0,
          ascending,
          buttons: `
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchPlay('${matchMode}')">PLAY AGAIN</button>
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchChangeMode()">CHANGE MODE</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#ff9933', field);
        mountSelectionArt(`${uid}-art`, 'match');
      }
    }
  }

  window.matchFlip = function(i) {
    if (locked || cards[i].matched || cards[i].flipped || flipped.length >= 2) return;
    cards[i].flipped = true;
    flipped.push(i);
    const el = document.getElementById(`mc-${i}`);
    if (el) el.classList.add('flipped');

    if (flipped.length < 2) return;

    moves++;
    const mv = document.getElementById('match-moves');
    if (mv) mv.textContent = moves + (matchMode==='impossible' ? '/'+IMPOSSIBLE_MOVE_CUTOFF : '');
    locked = true;

    const [a, b] = flipped;
    const isMatch = cards[a].ci === cards[b].ci;

    setTimeout(() => {
      if (isMatch) {
        SFX.match();
        matchFlash();
        combo++;
        matchScore += 100 + (combo > 1 ? (combo - 1) * 60 : 0);
        const sv = document.getElementById('ms'); if (sv) sv.textContent = matchScore;
        cards[a].matched = cards[b].matched = true;
        matched++;
        const pv = document.getElementById('match-pairs');
        if (pv) pv.textContent = `${matched}/${PAIRS}`;
        [a, b].forEach(idx => {
          const el = document.getElementById(`mc-${idx}`);
          if (el) {
            el.classList.add('matched', 'match-holo');
            const back = el.querySelector('.match-card-back');
            if (back) back.innerHTML = charFace(GAME_CHARS[cards[idx].ci], 'happy');
            const oldBurst = el.querySelector('.match-spark-burst');
            if (oldBurst) oldBurst.remove();
            const burst = document.createElement('span');
            burst.className = 'match-spark-burst';
            burst.innerHTML = '<i></i><i></i><i></i><i></i>';
            el.appendChild(burst);
            setTimeout(() => burst.remove(), 900);
            setTimeout(() => el.classList.remove('match-holo'), 1200);
          }
        });
        flipped = []; locked = false;
        if (matched === PAIRS) {
          clearInterval(timerInt); clearInterval(previewInt);
          removeMatchSideBar();
          if (matchMode !== 'free') {
            const timeBonus = Math.max(0, (timeLimit - matchTimer) * 5);
            matchScore += timeBonus;
          }
          setTimeout(() => {
            showMatchGameOver();
            try { SFX.win(); ticketConfetti(); } catch(e) { console.warn('[Match] finish effect failed:', e); }
          }, 700);
        } else {
          checkMoveCutoff();
        }
      } else {
        combo = 0;
        SFX.mismatch();
        [a, b].forEach(idx => {
          const el = document.getElementById(`mc-${idx}`);
          if (el) {
            el.classList.add('miss-flash');
            const back = el.querySelector('.match-card-back');
            if (back) back.innerHTML = charFace(GAME_CHARS[cards[idx].ci], 'sad');
          }
        });
        setTimeout(() => {
          [a, b].forEach(idx => {
            cards[idx].flipped = false;
            const el = document.getElementById(`mc-${idx}`);
            if (el) el.classList.remove('flipped','miss-flash');
            const back = el && el.querySelector('.match-card-back');
            if (back) back.innerHTML = charFace(GAME_CHARS[cards[idx].ci], 'normal');
          });
          flipped = [];
          locked = false;
          checkMoveCutoff();
        }, 280);
      }
    }, 180);
  };

  // Impossible mode's hard fail-state: run out of moves before clearing the board.
  function checkMoveCutoff() {
    if (matchMode !== 'impossible' || moves < IMPOSSIBLE_MOVE_CUTOFF || matched === PAIRS || matchCutoffWaived) return false;
    clearInterval(timerInt); clearInterval(previewInt);
    locked = true;
    SFX.over();
    setTimeout(showCutoffPrompt, 400);
    return true;
  }

  function showCutoffPrompt() {
    const ov = document.createElement('div');
    ov.id = 'match-cutoff-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;background:rgba(5,2,18,0.88);backdrop-filter:blur(8px)';
    ov.innerHTML = `
      <div style="background:#080515;border:2px solid #ff4444;border-radius:12px;padding:28px 24px;max-width:300px;width:90vw;text-align:center;box-shadow:0 0 30px rgba(255,68,68,0.4)">
        <div style="font-family:'Bebas Neue',cursive;font-size:44px;letter-spacing:4px;color:#ff4444;text-shadow:0 0 20px #ff4444;line-height:1;margin-bottom:14px">FAILED</div>
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.7);margin-bottom:20px">YOU'VE USED ${IMPOSSIBLE_MOVE_CUTOFF} MOVES</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button onclick="matchGiveUp()" style="font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;background:rgba(255,68,68,0.14);border:2px solid #ff4444;border-radius:6px;padding:12px;color:#ff4444;cursor:pointer">GIVE UP?</button>
          <button onclick="matchFinishAnyway()" style="font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;background:none;border:1.5px solid rgba(242,239,232,0.3);border-radius:6px;padding:12px;color:rgba(242,239,232,0.8);cursor:pointer">FINISH ANYWAY</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }

  window.matchGiveUp = function() {
    const ov = document.getElementById('match-cutoff-modal');
    if (ov) ov.remove();
    matchOutOfMoves = true;
    removeMatchSideBar();
    showMatchGameOver();
  };

  window.matchFinishAnyway = function() {
    const ov = document.getElementById('match-cutoff-modal');
    if (ov) ov.remove();
    matchCutoffWaived = true;
    locked = false;
  };

  function matchFlash() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#33ff66;opacity:0.32;pointer-events:none;transition:opacity 0.3s ease-out';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 350);
  }

  // Vertical countdown bar to the right of the board for the timed modes (Hard,
  // Challenge) — same fixed-position-against-the-grid trick used in Whack, but kept
  // soft/translucent rather than solid so the dark background reads through it.
  let matchSideBarEl = null;
  function showMatchSideBar() {
    removeMatchSideBar();
    const grid = document.querySelector('.match-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const barW = 12;
    const barGap = 8;
    const safeRight = 8;
    // The grid sizing reserves a mobile gutter for this bar. Keep this clamp only
    // as a last-resort safety so the bar never leaves the viewport.
    const barLeft = Math.min(rect.right + barGap, window.innerWidth - barW - safeRight);
    matchSideBarEl = document.createElement('div');
    matchSideBarEl.style.cssText = `position:fixed;top:${rect.top}px;left:${barLeft}px;width:${barW}px;height:${rect.height}px;z-index:9400;pointer-events:none;background:rgba(0,0,0,0.35);border:1px solid rgba(255,230,26,0.25);border-radius:6px;overflow:hidden`;
    matchSideBarEl.innerHTML = `<div id="match-sidebar-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:rgba(255,230,26,0.5);box-shadow:0 0 8px rgba(255,230,26,0.35);transition:height 1s linear,background 0.3s"></div>`;
    document.body.appendChild(matchSideBarEl);
  }
  function removeMatchSideBar() {
    if (matchSideBarEl) { matchSideBarEl.remove(); matchSideBarEl = null; }
  }
  function updateMatchSideBar(pct) {
    const fill = document.getElementById('match-sidebar-fill');
    if (!fill) return;
    fill.style.height = Math.max(0, pct) + '%';
    fill.style.background = pct <= 25 ? 'rgba(255,68,68,0.55)' : 'rgba(255,230,26,0.5)';
  }

  // Replaced by the blue mode-intro sequence above (matchModeIntroSteps) — that
  // already covers "unlimited moves" and the time limit before the round starts,
  // so this redundant screen flash is gone.

  // ── Mode intro ── same blue objective-text language as Whack/Space (Bebas Neue,
  // #00e5ff, glow) — a separate IIFE from both, so a small mirrored copy of the
  // helpers lives here too. Flashes the same three facts already shown on the idle
  // screen's subtext for that mode (1s each), then for the two real-timer modes
  // (HARD/CHALLENGE) follows with a WATCH THE TIMER beat + a demo drain — FREE PLAY
  // and IMPOSSIBLE have no real countdown, so they skip that beat.
  function mmIntroHeadline(text) {
    const color = '#00e5ff';
    return `<div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:3px;color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color}66;text-align:center;line-height:1.2">${text}</div>`;
  }
  function mmMakeIntroOverlay() {
    const ann = document.createElement('div');
    ann.className = 'match-intro-overlay'; // tagged so matchBack() can remove a stray one on early exit
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:rgba(5,2,18,0.93)';
    document.body.appendChild(ann);
    return ann;
  }
  function mmPlayIntroSteps(steps, onDone) {
    let i = 0;
    function tick() {
      if (i >= steps.length) { onDone(); return; }
      const step = steps[i++];
      step.show();
      setTimeout(tick, step.duration);
    }
    tick();
  }
  function mmIntroTimerDemoHTML() {
    return `<div style="margin:16px auto 0;width:14px;height:90px;border-radius:7px;border:1px solid rgba(0,229,255,0.4);background:rgba(0,0,0,0.35);overflow:hidden;position:relative">
      <div id="mm-intro-timer-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:rgba(0,229,255,0.55)"></div>
    </div>`;
  }
  function mmStartIntroTimerDrain() {
    const fill = document.getElementById('mm-intro-timer-fill');
    if (!fill) return;
    requestAnimationFrame(() => { fill.style.transition = 'height 1.5s linear'; fill.style.height = '0%'; });
  }
  function matchModeIntroSteps(mode, onDone) {
    const ann = mmMakeIntroOverlay();
    let items, watchTimer;
    if (mode === 'free') {
      items = [`${freePlayCharCount} PAIRS`, 'UNLIMITED MOVES', 'NO TIME LIMIT'];
      watchTimer = false;
    } else if (mode === 'hard') {
      items = ['12 PAIRS', 'UNLIMITED MOVES', '60 SECONDS'];
      watchTimer = true;
    } else if (mode === 'challenge') {
      items = ['16 PAIRS', 'UNLIMITED MOVES', '60 SECONDS'];
      watchTimer = true;
    } else {
      items = ['21 PAIRS', `${IMPOSSIBLE_MOVE_CUTOFF} MOVE LIMIT`, '20 SECONDS'];
      watchTimer = true;
    }
    const steps = items.map(text => ({ duration: 1000, show: () => { ann.innerHTML = mmIntroHeadline(text); } }));
    if (watchTimer) {
      steps.push({ duration: 2000, show: () => {
        ann.innerHTML = mmIntroHeadline('WATCH THE TIMER') + mmIntroTimerDemoHTML();
        mmStartIntroTimerDrain();
      }});
    }
    mmPlayIntroSteps(steps, () => { ann.remove(); onDone(); });
  }

  window.matchPlay = function(mode) {
    matchModeIntroSteps(mode || 'hard', () => _matchPlayReal(mode));
  };
  function _matchPlayReal(mode) {
    matchMode = mode || 'hard';
    window._matchMode = matchMode;
    window._matchFreePairs = freePlayCharCount;
    removeMatchSideBar();
    if (matchMode !== 'free') timeLimit = MODE_CONFIG[matchMode].time;
    cards = makeCards(); flipped=[]; locked=false; moves=0; matched=0; matchOutOfMoves=false; matchCutoffWaived=false;
    matchScore=0; combo=0; matchTimer=0;
    clearInterval(timerInt); clearInterval(previewInt);
    ArcadeMusic.stop();

    if (matchMode === 'free') {
      state = 'playing'; render();
      return;
    }

    // Hard/Challenge/Impossible all share the same memorize-preview + countdown flow.
    // Impossible gets longer to actually take in a 21-pair/42-card board.
    locked = true;
    state = 'preview'; render();
    let countdown = matchMode === 'impossible' ? 10 : matchMode === 'challenge' ? 4 : 3;
    previewInt = setInterval(() => {
      countdown--;
      const cd = document.getElementById('match-preview-cd');
      if (cd) cd.textContent = countdown > 0 ? `MEMORIZE!  ${countdown}` : 'GO!';
      if (countdown <= 0) {
        clearInterval(previewInt);
        cards.forEach(c => { c.flipped = false; });
        locked = false;
        state = 'playing'; render();
        const startTimer = () => {
          SFX.raceStart();
          timerInt = setInterval(() => {
            matchTimer++;
            const el = document.getElementById('mt');
            if (el) {
              const remaining = timeLimit - matchTimer;
              el.textContent = remaining + 's';
              if (remaining <= 10) el.style.color = '#ff4444';
            }
            updateMatchSideBar((Math.max(0, timeLimit - matchTimer) / timeLimit) * 100);
            if (matchTimer >= timeLimit) {
              clearInterval(timerInt);
              removeMatchSideBar();
              SFX.over();
              setTimeout(showMatchGameOver, 700);
            }
          }, 1000);
        };
        if (matchMode === 'hard' || matchMode === 'challenge' || matchMode === 'impossible') {
          showMatchSideBar();
          updateMatchSideBar(100);
        }
        startTimer();
      }
    }, 1000);
  }

  function showMatchGameOver() {
    clearInterval(timerInt);
    clearInterval(previewInt);
    removeMatchSideBar();
    const cutoff = document.getElementById('match-cutoff-modal');
    if (cutoff) cutoff.remove();
    document.querySelectorAll('.match-intro-overlay').forEach(el => el.remove());
    locked = false;
    state = 'over';
    render();
    const wrap = document.getElementById('match-wrap');
    if (wrap) wrap.scrollTop = 0;
  }

  const PAIR_SAFE_COUNTS = [4,5,6,7,8,9,10,12,14,15,16,18,20].filter(n => n <= GAME_CHARS.length);
  window.matchAdjChar = function(delta) {
    const idx = PAIR_SAFE_COUNTS.indexOf(freePlayCharCount);
    const next = idx < 0 ? 0 : Math.max(0, Math.min(PAIR_SAFE_COUNTS.length - 1, idx + delta));
    freePlayCharCount = PAIR_SAFE_COUNTS[next];
    window._matchFreePairs = freePlayCharCount;
    const el = document.getElementById('match-char-ct');
    if (el) el.textContent = freePlayCharCount;
  };

  function closeMatchFreeSetup() {
    const ov = document.getElementById('match-free-setup-modal');
    if (ov) ov.remove();
  }

  window.matchStartFreeFromPopup = function() {
    closeMatchFreeSetup();
    matchPlay('free');
  };

  window.matchGoFreeSetup = function() {
    closeMatchFreeSetup();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    const btnStyle = "font-family:'VCR',monospace;font-size:13px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:4px;color:rgba(242,239,232,0.78);width:38px;height:38px;cursor:pointer;padding:0;line-height:1";
    const ov = document.createElement('div');
    ov.id = 'match-free-setup-modal';
    ov.className = 'match-free-setup-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,2,18,0.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
    ov.innerHTML = `
      <div style="width:min(92vw,360px);background:#080515;border:2px solid #33ff66;border-radius:10px;padding:22px 18px 18px;text-align:center;box-shadow:0 0 28px rgba(51,255,102,0.24), inset 0 0 22px rgba(51,255,102,0.05)">
        <div style="font-family:'Bebas Neue',cursive;font-size:42px;letter-spacing:5px;line-height:1;color:#33ff66;text-shadow:0 0 18px #33ff6688;margin-bottom:10px">FREE PLAY</div>
        <div class="match-sub">ONE PAIR PER CHARACTER</div>
        <div class="match-sub" style="margin-top:5px;color:rgba(242,239,232,0.72)">HOW MANY MATCHES?</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin:16px 0 8px">
          <button onclick="matchAdjChar(-1)" style="${btnStyle}" aria-label="Fewer matches">−</button>
          <span id="match-char-ct" style="font-family:'Bebas Neue',cursive;font-size:62px;letter-spacing:4px;color:#33ff66;line-height:1;text-shadow:0 0 18px #33ff6688;min-width:72px;display:inline-block">${freePlayCharCount}</span>
          <button onclick="matchAdjChar(1)" style="${btnStyle}" aria-label="More matches">+</button>
        </div>
        <div class="match-sub" style="opacity:0.45;margin-bottom:16px">4 - 20</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <button class="whack-btn match-mode-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.16)" onclick="matchStartFreeFromPopup()">▶ START</button>
          <button class="whack-btn match-mode-btn" style="border-color:rgba(242,239,232,0.18);background:none;font-size:10px;color:rgba(242,239,232,0.6)" onclick="matchGoIdle()">CANCEL</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  };

  window.matchGoIdle = function() {
    closeMatchFreeSetup();
    state = 'idle';
    render();
  };

  window.matchChangeMode = function() {
    window.matchBack();
    state = 'idle';
    render();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  };

  window.initMatch = function() {
    removeMatchSideBar();
    state='idle'; cards=[]; flipped=[]; locked=false; render();
  };

  // Called from nav() whenever leaving the match page (mirrors whackBack()/
  // spacePause()) — stops pending timers and removes body-level floating elements
  // (side bar, a stray intro overlay) that exiting early via "ARCADE MENU" never
  // naturally reaches the cleanup for.
  window.matchBack = function() {
    clearInterval(timerInt); clearInterval(previewInt);
    removeMatchSideBar();
    closeMatchFreeSetup();
    document.querySelectorAll('.match-intro-overlay').forEach(el => el.remove());
  };
})();

// ══════════════════════════════════════
//  SPACE MOBE — Vertical Scroller
// ══════════════════════════════════════
(function() {
  'use strict';

  let canvas, ctx, W, H, raf, state = 'idle';
  let spaceIntroShown = false; // first-time-only objective intro, before the real run starts
  let player, bullets, obstacles, stars, score, health, wave, waveKills, highScore, spawnsRemaining;
  let leftHeld = false, rightHeld = false, lastAutoFire = 0, lastPizzaFire = 0, activeChar = getGlobalChar();
  let enemyBullets = [], lastEnemyFire = 0;
  let dangerY = 0, socketAnchorY = 0, lineFlashA = 0;
  const SPACE_SHIP_BOTTOM_OFFSET = 40;
  const SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET = 94;
  // REVERSE theme: a separate fixed "escape" line near the top, just below the
  // HUD/banner strip — kept independent of dangerY on purpose, since dangerY tracks
  // the player position and also drives the socket column's placement; repurposing
  // it for this would yank the sockets up to the top during a reverse wave.
  const REVERSE_LINE_Y = 92;
  let floatTexts = []; // {text, x, y, color, a, vy, size}
  let currentCfg = null;
  let powerups = []; // {type:'speed'|'gun'|'bomb'|'shield'|'hp'|'mystery', x, y, vy, r}
  let buffSpeedUntil = 0, buffGunUntil = 0, buffShieldUntil = 0;
  // Frozen (movement x0.5, bullets render as snowflakes — cosmetic only) and zapped
  // (bullets deal 0 damage, render as farts — the skin IS the mechanical tell) are
  // the two "disabled state" debuffs shared by the ICE/EMP mini-bosses and the
  // mystery box's bad outcomes — one timer each, regardless of source.
  let buffFrozenUntil = 0, buffZappedUntil = 0;
  let buffPizzaUntil = 0; // mystery "pizza blast" — fires a shotgun spread of pizza-slice bullets instead of one straight shot
  let snowingUntil = 0; // mystery "negative one" — ambient snow; any hit taken while it's active also freezes for 2s
  let bossInkBlindUntil = 0; // Cosmic Octo ink hit: brief screen-ink vignette during boss fights
  let lastRaveConfetti = 0; // throttles RAVE's periodic confetti bursts
  let snowParticles = [];
  let controlsReversedUntil = 0; // mystery box: left/right flipped, briefly
  let twin = null; // mystery box "twin ship" — {x,y,lastFire}, mirrors player and auto-fires
  let rebound = null; // mystery box "rebound" penalty — a bouncing hazard ball that can hit the player

  // Powerup inventory — speed/gun/shield/bomb are now banked on catch (max 1 each)
  // and deployed on demand instead of applying instantly. HP and mystery boxes are
  // unaffected — both still apply immediately on catch, same as before.
  let inventory = { gun: false, shield: false, bomb: false };
  const SOCKET_TYPES = ['gun', 'shield', 'bomb'];
  const SOCKET_COLOR = { gun: '#ffe61a', shield: '#00e5ff', bomb: '#ff8800' };
  const SOCKET_GLYPH = { gun: '⚡', bomb: '💣' }; // fallback only; sockets prefer PNGs now
  const SOCKET_SIZE = 34, SOCKET_GAP = 8, SOCKET_X = 10;
  // Anchored to the old danger line position rather than the actual current
  // danger boundary, so the sockets stay where they were even if the line moves.
  function socketRect(i) {
    const n = SOCKET_TYPES.length;
    const totalH = n * SOCKET_SIZE + (n - 1) * SOCKET_GAP;
    const groupTop = (socketAnchorY - 14) - totalH;
    return { x: SOCKET_X, y: groupTop + i * (SOCKET_SIZE + SOCKET_GAP), w: SOCKET_SIZE, h: SOCKET_SIZE };
  }
  // Returns the socket type hit by a canvas-space point, or null — used both for
  // touch (reserving that column from also moving the ship) and desktop clicks.
  function hitSocket(x, y) {
    for (let i = 0; i < SOCKET_TYPES.length; i++) {
      const r = socketRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return SOCKET_TYPES[i];
    }
    return null;
  }
  function deploySocket(type) {
    if (!inventory[type]) return;
    inventory[type] = false;
    applyPowerup(type);
  }
  let mysteryTimer = null;
  let shakeMag = 0; // screen shake on big hits — decays each frame
  function triggerShake(amount) { shakeMag = Math.max(shakeMag, amount); }
  // Rescued hero escort — temporary wingman, cap 1 (rescuing again refreshes/replaces it).
  // null when inactive. state: 'active' while escorting, 'leaving' during its fly-off.
  let escort = null;
  const ESCORT_DURATION_MS = 10000;
  // Boss waves — starting wave 3 and every 5 waves after, a big scary creature (not
  // one of the family characters) hovers near the top (never crosses the danger line),
  // alternates a telegraphed laser and a machine-gun burst, and periodically deploys
  // a regular enemy of its own. Asteroids are paused for the duration of the fight so
  // the encounter stays the focus.
  let boss = null;
  let bossDeployTimer = 0;
  let pendingBossCreature = null;
  const rescuedChars = new Set();
  let rescueBanner = null;
  const missionTrappedChars = [];
  const missionEnemyChars = [];
  const missionRetryCaptives = [];
  const waveCaptivesSeen = new Set();
  const SPACE_MISSION_CAST_COUNT = 12;
  const SPACE_MISSION_CAPTOR_COUNT = 2;
  const SPACE_RESCUE_TARGET_COUNT = SPACE_MISSION_CAST_COUNT - SPACE_MISSION_CAPTOR_COUNT;
  // Themed waves run on a light chapter cadence instead of pure randomness.
  // Regular waves still exist as breathers, but boss/captive fights are chapter
  // gates and the wave immediately after them is always a special "new tier" wave.
  let waveTheme = null; // null = normal wave, else one of WAVE_THEMES
  let themeEffectsAt = 0; // BLACKOUT's vignette waits until this time so it doesn't visually swallow the wave/theme announcement
  let waveTransitioning = false; // true from nextWave() until its announcement clears — guards against the per-frame wave-cleared check re-firing nextWave()
  let mirrorSequenceActive = false, mirrorStageTimers = [];
  let spaceBriefingTimers = [];
  // 'flip' (not 'reverse') for the wave theme key — the mystery outcome list below
  // already uses 'reverse' for reversed controls, an unrelated effect; same string
  // in both would be confusing to read even though they're different variables.
  const WAVE_THEMES = ['asteroids','ghost','captive','rave','swarm','blackout','mirror','bomber','emp','goldrush','boss','gizmo','music','flip'];
  const THEME_LABEL = {
    asteroids: 'ALL ASTEROIDS', ghost: 'GHOST ATTACK', captive: 'RESCUE MISSION',
    rave: 'PARTY RAVE MODE', swarm: 'SWARM', blackout: 'BLACKOUT', mirror: 'MIRROR ENEMY',
    bomber: 'BOMBER RUN', emp: 'EMP WARNING', goldrush: 'GOLD RUSH', boss: 'BOSS',
    gizmo: 'GIZMO',
    music: 'JAM SESSION', flip: 'REVERSE',
  };
  const EARLY_SPECIALS = ['asteroids', 'swarm'];
  const MID_SPECIALS = ['bomber', 'mirror', 'music', 'blackout'];
  const LATE_SPECIALS = ['ghost', 'emp', 'flip', 'rave'];
  const POST_BOSS_SPECIALS = ['swarm', 'bomber', 'asteroids', 'rave'];
  function chapterPick(pool, w, previousTheme, offset) {
    const choices = pool.filter(t => t !== previousTheme);
    const list = choices.length ? choices : pool;
    return list[(Math.floor(w / 5) + (offset || 0)) % list.length];
  }
  function pickWaveTheme(w, previousTheme) {
    const campaign = {
      1: null,
      2: 'gizmo',
      3: 'swarm',
      4: 'boss',
      5: 'asteroids',
      6: 'boss',
      7: 'captive',
      8: 'boss',
      9: 'bomber',
      10: 'gizmo',
      11: 'boss',
      12: 'mirror',
      13: 'boss',
      14: 'boss',
      15: 'boss',
      16: 'blackout',
      17: 'gizmo',
    };
    if (Object.prototype.hasOwnProperty.call(campaign, w)) return campaign[w];
    if (previousTheme === 'gizmo') return 'rave';
    if (previousTheme === 'boss' || previousTheme === 'captive') return chapterPick(POST_BOSS_SPECIALS, w, previousTheme, 0);
    if (w % 3 === 0 && unrescuedMissionCaptives().length) return 'captive';
    if (w % 9 === 0) return 'boss';
    const pos = ((w - 1) % 5) + 1;
    if (pos === 3) return chapterPick(EARLY_SPECIALS, w, previousTheme, 0);
    if (pos === 4) return chapterPick(MID_SPECIALS, w, previousTheme, 1);
    if (w >= 8 && pos === 2) return chapterPick(LATE_SPECIALS, w, previousTheme, 2);
    return null;
  }
  // Lighter-weight boss-style encounter for GHOST/ICE/EMP — deliberately separate
  // from `boss` so the "pause all normal spawning" behavior tied to a real boss
  // fight doesn't also apply here; mini-bosses are a wave feature, not a takeover.
  // (MINIBOSS_R/MINIBOSS_HP are declared further down, right after FACE_R/BOSS_R.)
  let miniBoss = null;
  // Small retro pixel-sprite system instead of emoji for boss faces. Each sprite is
  // its LEFT HALF only (mirrored when drawn) — keeps every creature symmetric by
  // construction. '.' = transparent, other letters look up a color in that
  // creature's own palette.
  const BOSS_CREATURES = [
    { name: 'STAR OGRE', palette: { A:'#5a8c3a', K:'#0a1a05', B:'#345420', W:'#fff8e0' }, sprite: [
      ".AAAAA.",
      "AAAAAAA",
      "AAAAAAA",
      "AAAKAAA",
      "AAAKAAA",
      "AAABAAA",
      "AAAAAAA",
      "AAWAAAA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
    ]},
    { name: 'SKY DRAGON', palette: { A:'#dd4422', K:'#2a0a00', B:'#a82a10' }, sprite: [
      "....A..",
      "...AAA.",
      "..AAAAA",
      ".AAAAAA",
      "AAAKAAA",
      "AAAAAAA",
      "AABBBAA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'DARK KNIGHT', palette: { A:'#4a9c4a', K:'#0a2a0a', W:'#fff8e0' }, sprite: [
      ".AAAAA.",
      "AAAAAAA",
      "AAAAAAA",
      "AAAKAAA",
      "AAAAAAA",
      "AAAAAAA",
      "AWAWAWA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'GRAY VISITOR', palette: { A:'#9aa8a0', K:'#0a0a0a' }, sprite: [
      "...AAA.",
      "..AAAAA",
      ".AAAAAA",
      "AAAAAAA",
      "AAKKKAA",
      "AAKKKAA",
      "AAAAAAA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'SPACE SHARK', palette: { A:'#2f8fb8', B:'#14506f', K:'#031018', W:'#f4fbff' }, sprite: [
      "...AAA.",
      "..AAAAA",
      ".AAAAAA",
      "AAAAAAA",
      "AAAKKAA",
      "AAAAAAA",
      "AWWWWAA",
      "AAAAAAA",
      ".AAAAA.",
      "..BBA..",
      "...B...",
    ]},
    { name: 'MEAN TACO', palette: { A:'#d99a2b', B:'#6fcf45', C:'#cc3322', K:'#2a1400', W:'#fff4c8' }, sprite: [
      "..AAAA.",
      ".AAAAAA",
      "AAAAAAA",
      "AABCBBA",
      "ABCKCBA",
      "AABCBBA",
      "AAAAAAA",
      "AWWWWAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'COSMIC OCTO', palette: { A:'#b34cff', B:'#5ab1ff', K:'#170025', W:'#f7edff' }, sprite: [
      "..AAAA.",
      ".AAAAAA",
      "AAAAAAA",
      "AAAKAAA",
      "AAAKAAA",
      "AAAAAAA",
      "AABBAAA",
      "AA.AA.A",
      "A..A..A",
      "A.A.A.A",
      ".A...A.",
    ]},
  ];

  const BOSS_STYLE = {
    'STAR OGRE': 'donkey',
    'SKY DRAGON': 'fire',
    'DARK KNIGHT': 'shield',
    'GRAY VISITOR': 'orb',
    'SPACE SHARK': 'fish',
    'MEAN TACO': 'sombrero',
    'COSMIC OCTO': 'ink',
    'GIZMO': 'gizmo',
  };
  const BOSS_IMAGE_SRC = {
    'STAR OGRE': 'bosses/boss_ogre.png',
    'SKY DRAGON': 'bosses/boss_dragon.png',
    'DARK KNIGHT': 'bosses/boss_knight.png',
    'GRAY VISITOR': 'bosses/boss_gray_visitor.png',
    'SPACE SHARK': 'bosses/boss_shark.png',
    'MEAN TACO': 'bosses/boss_taco.png',
    'COSMIC OCTO': 'bosses/boss_octopus.png',
    'GIZMO': 'bosses/boss_gizmo.png',
  };
  const BOSS_GLOW = {
    'STAR OGRE': { main: '#b7ff68', alt: '#6f9d42' },
    'SKY DRAGON': { main: '#ff8a00', alt: '#ffe06a' },
    'DARK KNIGHT': { main: '#c8d4ff', alt: '#5b6f9f' },
    'GRAY VISITOR': { main: '#7dffbb', alt: '#33ff66' },
    'SPACE SHARK': { main: '#5ab1ff', alt: '#00e5ff' },
    'MEAN TACO': { main: '#ffe48c', alt: '#ff442f' },
    'COSMIC OCTO': { main: '#ff4fd8', alt: '#d82cff' },
    'GIZMO': { main: '#b987ff', alt: '#fff8e8' },
  };
  const BOSS_IMAGE_SCALE = {
    'GIZMO': 1.04,
    'SPACE SHARK': 1.1,
    'SKY DRAGON': 1.12,
    'COSMIC OCTO': 1.1,
  };
  const BOSS_IMAGE_OFFSET = {
    'STAR OGRE': { x: 0, y: -0.025 },
    'SKY DRAGON': { x: 0.015, y: -0.015 },
    'DARK KNIGHT': { x: 0, y: -0.025 },
    'GRAY VISITOR': { x: 0, y: -0.02 },
    'SPACE SHARK': { x: 0.015, y: -0.015 },
    'MEAN TACO': { x: 0, y: -0.04 },
    'COSMIC OCTO': { x: 0, y: 0.025 },
    'GIZMO': { x: 0, y: -0.02 },
  };
  Object.values(BOSS_IMAGE_SRC).forEach(src => _getImg(src));
  const PROJECTILE_IMAGE_SRC = {
    donkey: 'projectiles/donkey.png',
    fire: 'projectiles/fireball.png',
    greenOrb: 'projectiles/green_orb.png',
    fish: 'projectiles/shark_tooth.png',
    sombrero: 'projectiles/sombrero.png',
    ink: 'projectiles/ink_burst.png',
    shield: 'projectiles/shield.png',
    lock: 'projectiles/blue_bone.png',
    ice: 'projectiles/snowflake.png',
    zap: 'projectiles/fart_cloud.png',
    pizza: 'projectiles/pizza.png',
    hp: 'projectiles/hp_icon.png',
    gun: 'projectiles/lightning.png',
    bomb: 'projectiles/bomb.png',
    powerShield: 'projectiles/shield.png',
    mystery: 'projectiles/mystery_crate.png',
    guitar: 'projectiles/guitar.png',
    piano: 'projectiles/piano.png',
    saxophone: 'projectiles/saxophone.png',
  };
  Object.values(PROJECTILE_IMAGE_SRC).forEach(src => _getImg(src));

  function bossAttackTypeFor(creature) {
    const style = BOSS_STYLE[creature.name];
    if (style) return style;
    return Math.random() < 0.5 ? 'laser' : 'machinegun';
  }

  function pickBossCreature() {
    if (waveTheme === 'gizmo') return { name: 'GIZMO', isGizmo: true };
    const campaignBossWaves = [4, 6, 8, 11, 13, 14, 15];
    const campaignIdx = campaignBossWaves.indexOf(wave);
    if (campaignIdx >= 0) return BOSS_CREATURES[campaignIdx % BOSS_CREATURES.length];
    return BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)];
  }

  function addFloatText(text, x, y, color, size) {
    floatTexts.push({text, x, y, color, a: 1, vy: -1.5, size: size || 20});
  }


  const P_SPEED = 5, B_SPEED = 9, O_SPEED_BASE = 2.0; // +10% over original 1.8
  const AUTO_FIRE_MS = 200;
  const FACE_R = 22, ASTEROID_R_MIN = 14, ASTEROID_R_MAX = 30;
  const CAPTIVE_RING_HP = 15;
  const BOSS_R = FACE_R * 2.5, BOSS_HP = 35;
  const MINIBOSS_R = FACE_R * 1.6, MINIBOSS_HP = 6;

  // PARTY RAVE wave theme: a lookup-table + wrapper instead of refactoring every
  // draw function — call sites wrap their existing color literal in C(...), no
  // structural changes. Gameplay canvas only; DOM/HTML overlays are untouched.
  const NEON_PALETTE = {
    '#5c526c':'#ff00ff', '#7a6a90':'#00ffff', '#ffe61a':'#39ff14',
    '#00e5ff':'#ff00aa', '#33ff66':'#ffff00', '#ff4444':'#ff5500', '#ff6666':'#ff77ff',
  };
  function C(hex) { return waveTheme === 'rave' ? (NEON_PALETTE[hex] || hex) : hex; }

  function rand(a,b){ return a + Math.random()*(b-a); }

  function shuffledSpaceCharIndexes(excludeIdx) {
    const arr = GAME_CHARS.map((_, i) => i).filter(i => i !== excludeIdx);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function prepareSpaceMission() {
    const pool = shuffledSpaceCharIndexes(activeChar);
    const cast = pool.slice(0, Math.min(SPACE_MISSION_CAST_COUNT, pool.length));
    missionEnemyChars.splice(0, missionEnemyChars.length, ...cast.slice(0, SPACE_MISSION_CAPTOR_COUNT));
    missionTrappedChars.splice(0, missionTrappedChars.length, ...cast.slice(SPACE_MISSION_CAPTOR_COUNT));
    missionRetryCaptives.splice(0, missionRetryCaptives.length);
    rescuedChars.clear();
  }

  function unrescuedMissionCaptives() {
    return missionTrappedChars.filter(i => !rescuedChars.has(i));
  }
  function hasUnrescuedMissionCaptive() {
    return unrescuedMissionCaptives().length > 0;
  }

  function nextMissionCaptiveIndex(excludeSet) {
    const excluded = excludeSet || new Set();
    const activeCaptives = new Set(obstacles.filter(o => o.isTrapped).map(o => o.ci));
    const open = unrescuedMissionCaptives().filter(ci => !excluded.has(ci) && !activeCaptives.has(ci));
    while (missionRetryCaptives.length) {
      const retry = missionRetryCaptives.shift();
      if (open.includes(retry)) return retry;
    }
    if (open.length) return open[Math.floor(Math.random() * open.length)];
    return -1;
  }

  function nextMissionEnemyIndex() {
    const pool = missionEnemyChars.length ? missionEnemyChars : GAME_CHARS.map((_, i) => i).filter(i => i !== activeChar);
    return pool[Math.floor(Math.random() * pool.length)] || 0;
  }

  function rescueMissionChar(ci, x, y, label) {
    if (ci == null || ci < 0) return false;
    const wasNew = !rescuedChars.has(ci);
    rescuedChars.add(ci);
    for (let i = missionRetryCaptives.length - 1; i >= 0; i--) if (missionRetryCaptives[i] === ci) missionRetryCaptives.splice(i, 1);
    escort = { ci, state: 'active', expiresAt: Date.now() + ESCORT_DURATION_MS, x: player.x - 40, y: player.y, lastFire: 0, opacity: 1 };
    rescueBanner = { ci, startedAt: Date.now(), rescued: rescuedChars.size, total: missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT };
    faceFlash(ci, 'happy', x, y);
    addFloatText(label || '+150 RESCUED!', x, y, '#00e5ff', 22);
    if (wasNew && rescuedChars.size >= missionTrappedChars.length && missionTrappedChars.length) {
      score += 750;
      addFloatText('ALL MOBES RESCUED! +750', W / 2, H * 0.28, '#33ff66', 22);
      showTopBanner('ALL MOBES RESCUED!', 'good');
      ticketConfetti(true);
    }
    return wasNew;
  }

  function queueMissionCaptiveRetry(ci) {
    if (ci == null || ci < 0 || rescuedChars.has(ci) || missionRetryCaptives.includes(ci)) return;
    missionRetryCaptives.push(ci);
  }

  function mkStars() {
    stars = Array.from({length:45}, () => ({
      x: rand(0,W), y: rand(0,H),
      r: rand(0.5,2), speed: rand(0.15,0.65),
      a: rand(0.135,0.63),
    }));
  }

  function campaignTier(w) {
    if (w < 4) return 0;      // establish controls + Gizmo connection
    if (w < 9) return 1;      // first boss/rescue loop
    if (w < 13) return 2;     // patterns get sharper
    if (w < 17) return 3;     // late campaign pressure
    if (w === 17) return 4;   // final Gizmo
    return 5;                 // victory lap endless ramp
  }

  function waveConfig(w) {
    const tier = campaignTier(w);
    const endless = Math.max(0, w - 18);
    // Difficulty now rises by campaign tier first, wave number second. That keeps
    // the campaign legible on mobile: fewer unreadable floods, more deliberate
    // pressure windows and tighter recovery timing.
    return {
      poolSize: 10 + w * 3 + tier * 3 + endless * 2,
      speed: O_SPEED_BASE + Math.min(w, 10) * 0.13 + tier * 0.22 + endless * 0.18,
      spawnMs: Math.max(390, 1760 - Math.min(w, 12) * 62 - tier * 70 - endless * 34),
      asteroidRatio: Math.max(0.2, 0.64 - tier * 0.055 - endless * 0.012),
      tier,
    };
  }

  function enemyFireAt(shooter, speedMult) {
    const dx = player.x - shooter.x;
    const dy = player.y - shooter.y;
    const dist = Math.sqrt(dx*dx+dy*dy) || 1;
    const tier = currentCfg ? currentCfg.tier : campaignTier(wave);
    const bulletSpeed = (3.0 + tier * 0.45 + Math.min(wave, 12) * 0.16 + Math.max(0, wave - 18) * 0.18) * (speedMult || 1);
    enemyBullets.push({ x: shooter.x, y: shooter.y + shooter.r, vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, r: 4 });
  }

  // REVERSE theme: spawns from the bottom moving upward instead of the normal
  // top-down fall. Rather than threading a flip through every push() site below
  // (asteroid/swarm/bomber/normal/mirror all have their own hardcoded y/vy), this
  // wrapper just corrects whatever _spawnObstacleReal() actually pushed afterward.
  function spawnObstacle(cfg) {
    const before = obstacles.length;
    _spawnObstacleReal(cfg);
    if (waveTheme === 'flip' && obstacles.length > before) {
      const o = obstacles[obstacles.length - 1];
      o.y = H + o.r + 10;
      o.vy = -Math.abs(o.vy);
      // The normal "pause partway down, then burst-fire" behavior assumes top-down
      // travel — with obstacles now moving continuously upward instead, force it
      // off so nothing gets stuck mid-pause or fires unexpectedly close-range.
      o.pausedBurstDone = true;
    }
  }
  function _spawnObstacleReal(cfg) {
    // Themed waves bend the asteroid/enemy mix and a few spawn stats without
    // touching waveConfig(cfg) itself — purely a local override of this one roll.
    let ratio = cfg.asteroidRatio;
    if (waveTheme === 'asteroids' || waveTheme === 'ghost' || waveTheme === 'emp') ratio = 1;
    else if (waveTheme === 'swarm') ratio = 0.1;
    else if (waveTheme === 'goldrush') ratio = 0.85;
    else if (waveTheme === 'mirror') ratio = 1;
    const isAsteroid = Math.random() < ratio;
    if (isAsteroid) {
      const r = rand(ASTEROID_R_MIN, ASTEROID_R_MAX);
      const sides = 7 + Math.floor(Math.random() * 5);
      const verts = Array.from({length:sides}, (_,i) => {
        const a = (i/sides)*Math.PI*2;
        const rr = r * (0.7 + Math.random()*0.3);
        return [Math.cos(a)*rr, Math.sin(a)*rr];
      });
      // ALL ASTEROIDS: controlled storm, not a single screen-flood. Same direction,
      // slightly slower than normal rock speed, and tiny lane drift so it feels alive
      // without creating impossible diagonal clumps.
      const jitter = waveTheme !== 'asteroids';
      obstacles.push({ type:'asteroid', x:rand(r,W-r), y:-r-10, vx: jitter ? rand(-0.4,0.4)*cfg.speed : rand(-0.08,0.08)*cfg.speed, vy: jitter ? cfg.speed*(0.8+Math.random()*0.4) : cfg.speed*0.82, r, verts, rot:0, rotSpeed:rand(-0.02,0.02), hp:1, shadeSeed: Math.random() * 1000, rockStyle: Math.floor(Math.random() * 3) });
    } else {
      // Random trapped heroes in regular waves are disabled. The campaign already
      // has one rescue target per boss/chapter beat, so surprise hero spawns made the
      // rescue count feel noisy instead of intentional.
      const canRandomRescue = false;
      let isTrapped = false;
      let ci = isTrapped ? nextMissionCaptiveIndex(waveCaptivesSeen) : nextMissionEnemyIndex();
      if (isTrapped && ci < 0) { isTrapped = false; ci = nextMissionEnemyIndex(); }
      if (isTrapped) waveCaptivesSeen.add(ci);
      // Enemies take 3 hits to clear; trapped heroes still resolve via the ring, hp unused for them.
      // Non-hero enemies descend slower and pause partway down for a burst of fire before
      // continuing — a middle ground between "charges the line" and "just hovers and shoots":
      // keeps some advance pressure but spaces out how much is closing in on the player at once.
      if (waveTheme === 'swarm') {
        // Many small, weak, fast enemies instead of a few tough ones. Faster now
        // that powerups are banked, not lost if you can't immediately catch one —
        // there's more of a safety net to draw on, so this can push harder.
        const r = FACE_R * 0.6;
        obstacles.push({ type:'face', x:rand(r,W-r), y:-r-10, vx:rand(-0.8,0.8)*cfg.speed, vy:cfg.speed*2.0, r, ci: nextMissionEnemyIndex(), hp:1, isTrapped:false, ringHp:0, pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0 });
        return;
      }
      if (waveTheme === 'bomber') {
        // Capped at 1 on screen at a time. Bomber is funniest as a readable dive,
        // not a stack of overlapping dives on a phone-sized lane.
        if (obstacles.filter(o => o.isBomber).length < 1) {
          const x = rand(FACE_R, W-FACE_R);
          const dx = (player ? player.x - x : 0);
          // Faster dive and more HP than before — same "banked powerups give more
          // safety net" reasoning as SWARM.
          obstacles.push({ type:'face', x, y:-FACE_R-10, vx: dx*0.008, vy: cfg.speed*1.45, r:FACE_R, ci: nextMissionEnemyIndex(), hp:4, isTrapped:false, ringHp:0, pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0, isBomber:true });
          SFX.bomberDive();
          return;
        }
      }
      obstacles.push({ type:'face', x:rand(FACE_R,W-FACE_R), y:-FACE_R-10, vx:rand(-0.6,0.6)*cfg.speed, vy:cfg.speed*(0.7+Math.random()*0.5)*(isTrapped?0.82:0.6), r:FACE_R, ci, hp: isTrapped ? 1 : 3, isTrapped, ringHp: isTrapped ? CAPTIVE_RING_HP : 0, maxRingHp: isTrapped ? CAPTIVE_RING_HP : 0, pausedBurstDone: isTrapped, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0 });
    }
  }

  // captive=true reskins this exact fight as "free the hero from the jail cell" —
  // same HP/attack pattern/minion-deploy/defeat-reward underneath (those only ever
  // reference boss.x/y/r/hp/..., never the creature directly outside drawBoss()'s
  // body-rendering branch and the three text spots below), just a different look
  // and no minion deploys (a jail cell shouldn't be dispatching reinforcements).
  function spawnBoss(captive, options) {
    options = options || {};
    if (boss) return;
    const guardedRescue = !!options.guardedRescue;
    const captiveCi = (captive || guardedRescue) ? nextMissionCaptiveIndex() : -1;
    if (captive && captiveCi < 0) {
      spawnBoss(false);
      return;
    }
    const creature = captive ? BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)] : (pendingBossCreature || pickBossCreature());
    pendingBossCreature = null;
    const gizmoEscape = !!(creature.isGizmo && options.escape);
    const gizmoFinal = !!(creature.isGizmo && options.final);
    const tier = campaignTier(wave);
    const hpBase = gizmoEscape ? Math.round(BOSS_HP * (wave === 2 ? 0.62 : 1.06)) : gizmoFinal ? Math.round(BOSS_HP * 1.48) : BOSS_HP;
    const hp = hpBase + tier * (captive ? 5 : gizmoFinal ? 12 : 8) + Math.min(captive ? 16 : gizmoFinal ? 36 : 24, Math.floor(wave * (captive ? 1.0 : gizmoFinal ? 1.9 : 1.35)));
    const attackType = captive ? 'lockpulse' : bossAttackTypeFor(creature);
    boss = {
      creature, x: W / 2, y: 185, vx: (Math.random() < 0.5 ? -1 : 1) * (captive ? 0.72 : 1.1),
      r: BOSS_R, hp, maxHp: hp,
      attackType,
      nextAttack: Date.now() + (captive ? 2200 : 1800),
      attackDelay: captive ? Math.max(1650, 2450 - tier * 150 - wave * 12) : Math.max(gizmoFinal ? 1250 : 1450, 2380 - tier * 155 - wave * 14),
      burstCount: Math.min(gizmoFinal ? 8 : 6, 3 + tier + Math.floor(Math.max(0, wave - 10) / 8)),
      laserPhase: null, laserChargeStart: 0, laserX: 0,
      hitFlash: 0,
      isCaptive: !!captive,
      isGizmo: !!creature.isGizmo,
      isGizmoEscape: gizmoEscape,
      isFinalGizmo: gizmoFinal,
      guardedRescue,
      captiveCi,
    };
    bossDeployTimer = Date.now() + 3500; // first reinforcement a little after the fight starts
    addFloatText(captive ? `FREE ${GAME_CHARS[captiveCi].name}!` : `${creature.name} INCOMING`, W / 2, 140, captive ? '#00e5ff' : '#ff4444', 22);
    if (captive) showTopBanner(`FREE ${GAME_CHARS[captiveCi].name}`, 'good');
    else if (guardedRescue && captiveCi >= 0) showTopBanner(`${creature.name} HAS ${GAME_CHARS[captiveCi].name}`, 'bad');
    SFX.over();
  }

  // Lighter-weight encounter for GHOST ATTACK (teleports, bounces, fires ice shots)
  // and EMP (holds still, fires zap shots) — see the `if (miniBoss)` block in
  // loop() for movement/attack behavior. Reuses BOSS_CREATURES/drawPixelSprite, no
  // new assets. GHOST is treated like a real boss fight (normal spawning fully
  // paused via the same check as `boss` — see startWaveSpawn's doSpawn): tankier,
  // smaller (half the real boss's radius, since it's also bouncing and harder to
  // pin down), and constantly moving instead of just sitting between teleports.
  function spawnMiniBoss(kind) {
    if (miniBoss) return;
    const creature = BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)];
    const isGhost = kind === 'ghost';
    const r = isGhost ? BOSS_R * 0.5 : MINIBOSS_R;
    const hp = isGhost ? 25 : MINIBOSS_HP;
    miniBoss = {
      kind, creature, x: rand(r + 20, W - r - 20), y: 140,
      r, hp, maxHp: hp,
      vx: isGhost ? (Math.random() < 0.5 ? -1 : 1) * 2.2 : 0,
      vy: isGhost ? (Math.random() < 0.5 ? -1 : 1) * 1.6 : 0,
      nextAttack: Date.now() + 1500, hitFlash: 0, opacity: 1,
      phase: 'active', phaseStart: Date.now(),
      teleportAt: isGhost ? Date.now() + 3000 + Math.random() * 1500 : Infinity,
    };
    addFloatText(isGhost ? 'GHOST ATTACK!' : 'EMP WARNING!', W / 2, 140, '#ff4444', 22);
    SFX.over();
  }

  // Mirror mode is three readable beats, not a single blob: one scout, then a
  // small triangle, then a bowling-pin triangle. Each enemy hovers and tracks the
  // player's x every frame — see the obstacle-update loop for the tracking.
  function spawnMirrorGroup(layout, label) {
    const baseY = H * 0.18;
    layout.forEach(([offset, row], i) => {
      const ci = nextMissionEnemyIndex();
      obstacles.push({
        type:'face', x: Math.max(FACE_R, Math.min(W - FACE_R, W / 2 + offset)), y: baseY + row * 38,
        vx:0, vy:0, r:FACE_R * 0.95, ci, hp:4, isTrapped:false, ringHp:0,
        pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0,
        isMirror:true, mirrorOffset: offset, mirrorEase: 0.085 + i * 0.018
      });
    });
    addFloatText(label, W/2, 140, '#ff4444', 20);
  }
  function spawnMirrorEnemy() {
    mirrorStageTimers.forEach(clearTimeout);
    mirrorStageTimers = [];
    mirrorSequenceActive = true;
    const gap = Math.min(72, W * 0.17);
    const stages = [
      { delay: 0, label: 'MIRROR SCOUT!', layout: [[0, 0]] },
      { delay: 3900, label: 'MIRROR TRIANGLE!', layout: [[0, 0], [-gap, 1], [gap, 1]] },
      { delay: 8300, label: 'MIRROR SWARM!', layout: [[0, 0], [-gap * 0.72, 1], [gap * 0.72, 1], [-gap * 1.44, 2], [0, 2], [gap * 1.44, 2]] },
    ];
    stages.forEach((stage, idx) => {
      const timer = setTimeout(() => {
        if (state !== 'playing' || waveTheme !== 'mirror') return;
        spawnMirrorGroup(stage.layout, stage.label);
        if (idx === stages.length - 1) mirrorSequenceActive = false;
      }, stage.delay);
      mirrorStageTimers.push(timer);
    });
  }

  const POWERUP_R = 18;
  // Both pickups scale off the same base (2x a regular asteroid's speed) — power-ups
  // fall 20% faster than HP. They're the bigger reward (speed/gun/bomb/shield vs. a
  // flat HP top-up), so catching one should take a little more urgency/skill, not less.
  function hpFallSpeed() { return (currentCfg ? currentCfg.speed : O_SPEED_BASE) * 2; }
  function powerupFallSpeed() { return hpFallSpeed() * 1.7; }

  function spawnPowerup() {
    const types = ['gun', 'bomb', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    powerups.push({ type, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed(), r: POWERUP_R, bob: Math.random() * Math.PI * 2 });
  }

  // Rare, risky pickup — could be great or could backfire. "Just enough to be
  // special": a much longer random interval than the other two schedules.
  function spawnMysteryBox() {
    // Falls a lot slower than every other pickup — it's on a parachute, it's rare,
    // and now it's a shoot target (ringHp) rather than something to catch, so there's
    // no rush to intercept it before it lands.
    powerups.push({ type: 'mystery', x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed() * 0.2, r: POWERUP_R, bob: Math.random() * Math.PI * 2, ringHp: 5 });
  }
  function scheduleMysteryBox() {
    clearTimeout(mysteryTimer);
    mysteryTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (!boss && !waveTransitioning) spawnMysteryBox();
      scheduleMysteryBox();
    }, 14000 + Math.random() * 9000);
  }

  // MUSIC ("JAM SESSION") theme — purely fun, no extra danger: asteroids/enemies
  // fall exactly as normal, but instrument pickups also drop. Shoot one (not catch
  // — same shoot-target language as the mystery ring) for its own note/sound and points.
  const INSTRUMENT_KINDS = ['guitar', 'piano', 'saxophone'];
  function spawnInstrument() {
    const kind = INSTRUMENT_KINDS[Math.floor(Math.random() * INSTRUMENT_KINDS.length)];
    powerups.push({ type: 'instrument', kind, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed() * 0.55, r: POWERUP_R, bob: Math.random() * Math.PI * 2 });
  }
  let instrumentTimer = null;
  function scheduleInstrument() {
    clearTimeout(instrumentTimer);
    instrumentTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (waveTheme === 'music' && !boss && !waveTransitioning) spawnInstrument();
      scheduleInstrument();
    }, 230 + Math.random() * 230);
  }

  let powerupTimer = null;
  function schedulePowerup() {
    clearTimeout(powerupTimer);
    // GOLD RUSH: heavy powerup rain, the whole point of the wave — unaffected by the
    // halving below. Normal rate halved now that catching one banks it instead of
    // using it instantly — no longer "use it now or it's wasted," so it can afford
    // to be rarer and feel more deliberate.
    const tier = campaignTier(wave);
    const range = waveTheme === 'goldrush' ? [600, 1500] : [Math.max(8200, 10400 - tier * 420), Math.max(15000, 19500 - tier * 750)];
    powerupTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (!boss && !waveTransitioning) spawnPowerup();
      schedulePowerup();
    }, range[0] + Math.random() * (range[1] - range[0]));
  }

  // Small green orb HP pickup with a plus sign — a smooth circle rather than a jagged
  // asteroid shape, so it's never visually confused with an actual (hostile) asteroid
  // at a glance.
  function spawnHpPowerup() {
    const roll = Math.random();
    const hpValue = roll < 0.15 ? 5 : roll < 0.5 ? 3 : 2;
    const r = hpValue === 5 ? 18 : hpValue === 3 ? 13.5 : 11;
    powerups.push({ type:'hp', hpValue, x: rand(r, W-r), y: -r-10, vy: hpFallSpeed(), r, bob: Math.random() * Math.PI * 2 });
  }

  let hpPowerupTimer = null;
  function scheduleHpPowerup() {
    clearTimeout(hpPowerupTimer);
    const tier = campaignTier(wave);
    const minDelay = 3150 + Math.min(1800, tier * 360);
    const maxDelay = 6300 + Math.min(2600, tier * 520);
    hpPowerupTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (!boss && !waveTransitioning) spawnHpPowerup();
      scheduleHpPowerup();
    }, minDelay + Math.random() * (maxDelay - minDelay));
  }


  // Wooden crate on a parachute, falling slower than every other pickup — visually
  // distinct from the start (not just a colored circle) and an obvious "special,
  // worth a beat to notice" silhouette even before it's close enough to read the "?".
  function drawMysteryBox(p) {
    ctx.save(); ctx.translate(p.x, p.y);
    const sway = Math.sin(Date.now() * 0.0025 + p.bob) * 7;
    // Canopy — semi-transparent, not a flat solid fill. Shrunk smaller now that the
    // ring is the main visual signal, not the parachute.
    ctx.save(); ctx.rotate(sway * 0.01);
    ctx.beginPath(); ctx.ellipse(0, -p.r * 1.35, p.r * 0.68, p.r * 0.49, 0, Math.PI, 0);
    ctx.fillStyle = 'rgba(204,102,255,0.26)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,210,255,0.42)'; ctx.lineWidth = 1.3; ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * p.r * 0.58, -p.r * 1.35);
      ctx.lineTo(i * p.r * 0.32 + sway * 0.3, -p.r * 0.52);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    // Crate — square (not the wider rect that read as an envelope), with horizontal
    // plank lines and corner brackets for actual texture instead of a flap-like X.
    ctx.translate(sway * 0.3, 0);
    const s = p.r * 0.72; // crate is tighter; the glow remains sized from p.r below
    // Soft translucent halo behind the crate, enlarged and sized off p.r (not the
    // now-smaller crate half-size s) so shrinking the crate doesn't also shrink it.
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    const haloR = p.r * 1.45 * pulse + 16;
    const halo = ctx.createRadialGradient(0, 0, p.r * 0.25, 0, 0, haloR);
    halo.addColorStop(0, 'rgba(255,120,220,0.34)');
    halo.addColorStop(0.38, 'rgba(195,90,255,0.28)');
    halo.addColorStop(0.72, 'rgba(70,170,255,0.18)');
    halo.addColorStop(1, 'rgba(70,170,255,0)');
    ctx.beginPath(); ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fillStyle = halo; ctx.fill();
    if (!drawProjectileImage('mystery', 0, 0, p.r * 1.7, Math.sin(Date.now() * 0.002 + p.bob) * 0.1, '#cc66ff')) {
      const glow = ctx.createLinearGradient(-s, -s, s, s);
      glow.addColorStop(0, 'rgba(255,105,210,0.26)');
      glow.addColorStop(0.5, 'rgba(170,80,255,0.16)');
      glow.addColorStop(1, 'rgba(90,170,255,0.24)');
      ctx.fillStyle = glow;
      ctx.fillRect(-s - 3, -s - 3, s * 2 + 6, s * 2 + 6);
      ctx.fillStyle = '#7a4a28'; ctx.fillRect(-s, -s, s * 2, s * 2);
      // Plank seams
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
      for (const fy of [-s * 0.34, s * 0.34]) {
        ctx.beginPath(); ctx.moveTo(-s, fy); ctx.lineTo(s, fy); ctx.stroke();
      }
      // Grain flecks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const gy = -s + (i + 0.5) * (s * 2 / 4);
        ctx.beginPath(); ctx.moveTo(-s * 0.7, gy + 3); ctx.lineTo(s * 0.7, gy - 2); ctx.stroke();
      }
      ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 2.5;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      // Corner metal brackets
      ctx.strokeStyle = '#cfae6a'; ctx.lineWidth = 2;
      for (const [cx, cy] of [[-s,-s],[s,-s],[s,s],[-s,s]]) {
        const ix = cx > 0 ? -1 : 1, iy = cy > 0 ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(cx, cy + iy*s*0.32); ctx.lineTo(cx, cy); ctx.lineTo(cx + ix*s*0.32, cy); ctx.stroke();
      }
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${s * 1.5}px 'Bebas Neue', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#2a1a40'; ctx.lineWidth = 3;
      ctx.strokeText('?', 0, 3);
      ctx.fillText('?', 0, 3);
    }
    ctx.save();
    ctx.rotate(Date.now() * 0.002 + p.bob);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const rr = s * (1.25 + 0.12 * Math.sin(Date.now() * 0.005 + i));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      ctx.fillStyle = i % 2 ? 'rgba(255,228,119,0.9)' : 'rgba(255,132,247,0.86)';
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 2.5, y - 1.2);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x + 2.5, y + 1.2);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 2.5, y + 1.2);
      ctx.lineTo(x - 5, y);
      ctx.lineTo(x - 2.5, y - 1.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Purple dashed "shoot this" ring — same rotating-dots language as the trapped
    // hero's rescue ring, pulled in to overlap the crate's edge rather than floating
    // outside it (same tightening as the enemy reticle). It's now a shoot target,
    // not a catch target, so this ring is the whole signal for that.
    if (p.ringHp > 0) {
      const t2 = Date.now() * 0.003;
      ctx.save();
      ctx.rotate(t2);
      const ringPulse = 1 + Math.sin(Date.now() * 0.008 + p.bob) * 0.05;
      ctx.beginPath(); ctx.arc(0, 0, s * 1.37 * ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,120,220,0.26)'; ctx.lineWidth = 9; ctx.stroke();
      const ringGrad = ctx.createLinearGradient(-s, -s, s, s);
      ringGrad.addColorStop(0, '#ff76d2');
      ringGrad.addColorStop(0.5, '#cc66ff');
      ringGrad.addColorStop(1, '#5ab1ff');
      ctx.beginPath(); ctx.arc(0, 0, s * 1.22 * ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = ringGrad; ctx.lineWidth = 3.2; ctx.stroke();
      for (let d = 0; d < 4; d++) {
        const a = (d / 4) * Math.PI * 2 + t2;
        ctx.fillStyle = d % 2 ? '#fff' : '#ff9be3';
        ctx.beginPath(); ctx.arc(Math.cos(a) * s * 1.22 * ringPulse, Math.sin(a) * s * 1.22 * ringPulse, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawChunkyLightning(x, y, size, rotation, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = size * 0.32;
    }
    ctx.beginPath();
    ctx.moveTo(-size * 0.06, -size * 0.5);
    ctx.lineTo(size * 0.3, -size * 0.5);
    ctx.lineTo(size * 0.1, -size * 0.04);
    ctx.lineTo(size * 0.38, -size * 0.04);
    ctx.lineTo(-size * 0.15, size * 0.56);
    ctx.lineTo(-size * 0.02, size * 0.13);
    ctx.lineTo(-size * 0.33, size * 0.13);
    ctx.closePath();
    ctx.fillStyle = '#ffe61a';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.strokeStyle = '#2f2300';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.03, -size * 0.38);
    ctx.lineTo(size * 0.16, -size * 0.38);
    ctx.lineTo(size * 0.03, -size * 0.08);
    ctx.lineTo(size * 0.17, -size * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawIceShard(x, y, size, rotation, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = size * 0.28;
    }
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.58);
    ctx.lineTo(size * 0.38, -size * 0.12);
    ctx.lineTo(size * 0.2, size * 0.5);
    ctx.lineTo(-size * 0.25, size * 0.45);
    ctx.lineTo(-size * 0.42, -size * 0.08);
    ctx.closePath();
    ctx.fillStyle = '#8ee8ff';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.4, size * 0.07);
    ctx.strokeStyle = '#1f6f9e';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.46);
    ctx.lineTo(size * 0.1, size * 0.3);
    ctx.lineTo(-size * 0.18, size * 0.28);
    ctx.strokeStyle = 'rgba(245,255,255,0.78)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  // Shared 6-spoke fallback snowflake — kept for tiny ambient sparkle cases.
  function drawSnowflake(x, y, R, color, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = R * 0.85; }
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, R * 0.21); ctx.lineCap = 'round';
    const branch = R * 0.35;
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const ex = Math.cos(a) * R, ey = Math.sin(a) * R;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
      const mx = ex * 0.6, my = ey * 0.6;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + 1) * branch, my + Math.sin(a + 1) * branch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a - 1) * branch, my + Math.sin(a - 1) * branch); ctx.stroke();
    }
    ctx.restore();
  }

  function projectileImageForType(type) {
    return PROJECTILE_IMAGE_SRC[type] || null;
  }
  const PROJECTILE_FX = {
    fire: { glow: '#ff5b20', spin: 0.0008, wobble: 0.07, trail: '#ff6b1f', sparks: '#ffd33d' },
    greenOrb: { glow: '#6dff24', spin: 0.0018, wobble: 0.09, pulse: 0.1, orbit: '#d8ff78' },
    ink: { glow: '#bd35ff', spin: -0.0016, wobble: 0.08, splat: '#ff70e8' },
    lock: { glow: '#3db8ff', spin: 0.0013, wobble: 0.06, orbit: '#b9f7ff' },
    ice: { glow: '#73e6ff', spin: 0.0022, wobble: 0.05, orbit: '#eaffff' },
    zap: { glow: '#aaff33', spin: -0.001, wobble: 0.08, fumes: '#baff3b' },
    shield: { glow: '#20dfff', spin: 0.001, wobble: 0.04, orbit: '#eaffff' },
    sombrero: { glow: '#ffd34a', spin: 0.0027, wobble: 0.1 },
    donkey: { glow: '#c7a16b', spin: 0.0007, wobble: 0.08 },
    fish: { glow: '#6bd7ff', spin: 0.0005, wobble: 0.05, trail: '#7fe3ff' },
    gun: { glow: '#ffe928', spin: 0.001, wobble: 0.07, sparks: '#fff7a6' },
    bomb: { glow: '#8b55ff', spin: -0.0007, wobble: 0.05 },
    hp: { glow: '#33ff66', spin: 0.0012, wobble: 0.05, orbit: '#eaffd8' },
    powerShield: { glow: '#20dfff', spin: 0.001, wobble: 0.04, orbit: '#eaffff' },
    mystery: { glow: '#d25cff', spin: 0.001, wobble: 0.06, orbit: '#ffe477', sparks: '#ff84f7' },
    pizza: { glow: '#ffb13d', spin: 0.0014, wobble: 0.06 },
    guitar: { glow: '#ff7133', spin: 0.001, wobble: 0.08, sparks: '#ffe6a0' },
    piano: { glow: '#78b7ff', spin: -0.0008, wobble: 0.05, sparks: '#f5f3ec' },
    saxophone: { glow: '#ffd34a', spin: 0.0011, wobble: 0.08, sparks: '#ffe48a' },
  };
  function rgbaFromHex(hex, alpha) {
    const h = (hex || '#ffffff').replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) || 255;
    const g = parseInt(h.slice(2, 4), 16) || 255;
    const b = parseInt(h.slice(4, 6), 16) || 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function drawProjectileImage(type, x, y, size, rotation, glowColor, staticIcon, mutedIcon) {
    const src = projectileImageForType(type);
    if (!src) return false;
    const img = _getImg(src);
    if (!img.complete || !img.naturalWidth) return false;
    const fx = PROJECTILE_FX[type] || {};
    const t = Date.now();
    const activeGlow = mutedIcon ? null : (glowColor || (fx.glow ? rgbaFromHex(fx.glow, 0.78) : null));
    const pulse = mutedIcon ? 1 : 1 + Math.sin(t * 0.006 + x * 0.01 + y * 0.01) * (fx.pulse || 0.035);
    const wobble = mutedIcon ? 0 : Math.sin(t * 0.005 + x * 0.02) * (fx.wobble || 0);
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    // Static badges (HUD buff icons, inventory sockets) hold their printed orientation —
    // only projectiles actually in flight get the continuous spin. Otherwise an icon like
    // the bomb (fuse pointing up) could land sideways at any given instant and read wrong.
    if (fx.spin && !staticIcon) ctx.rotate(t * fx.spin);
    if (wobble) ctx.rotate(wobble);
    if (!mutedIcon && fx.trail) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = rgbaFromHex(fx.trail, 0.2);
      ctx.beginPath();
      ctx.ellipse(0, size * 0.36, size * 0.28, size * 0.54, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!mutedIcon && fx.fumes) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rgbaFromHex(fx.fumes, 0.32);
      for (let i = 0; i < 3; i++) {
        const a = t * 0.002 + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * size * 0.34, Math.sin(a) * size * 0.26 + size * 0.08, size * (0.08 + i * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (!mutedIcon && fx.orbit) {
      ctx.save();
      ctx.rotate(t * 0.003);
      ctx.strokeStyle = rgbaFromHex(fx.orbit, 0.38);
      ctx.lineWidth = Math.max(1.2, size * 0.035);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.48, size * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgbaFromHex(fx.orbit, 0.9);
      ctx.beginPath();
      ctx.arc(size * 0.48, 0, Math.max(1.5, size * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!mutedIcon && fx.sparks) {
      ctx.save();
      ctx.fillStyle = rgbaFromHex(fx.sparks, 0.82);
      for (let i = 0; i < 2; i++) {
        const a = t * 0.004 + i * Math.PI + x * 0.01;
        const rr = size * (0.5 + i * 0.08);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(1.4, size * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (activeGlow) {
      ctx.shadowColor = activeGlow;
      ctx.shadowBlur = size * 0.3;
    }
    if (mutedIcon) {
      ctx.globalAlpha *= 0.55;
      ctx.filter = 'grayscale(1) saturate(0.25) brightness(0.75)';
    }
    ctx.drawImage(img, -size * pulse / 2, -size * pulse / 2, size * pulse, size * pulse);
    ctx.restore();
    return true;
  }
  function drawPickupImage(type, p, size, glowColor) {
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Date.now() * 0.0015 + p.bob * 0.12);
    ctx.beginPath();
    const haloR = p.r * pulse + 7;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = haloR * (k % 2 ? 0.86 : 1.04);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = glowColor || 'rgba(255,230,26,0.18)';
    ctx.fill();
    ctx.restore();
    return drawProjectileImage(type, p.x, p.y, size, Math.sin(Date.now() * 0.003 + p.bob) * 0.12, glowColor ? glowColor.replace(/0\.\d+\)/, '0.8)') : null);
  }

  // MUSIC theme instrument pickups. One hit to "play" and clear.
  function drawInstrument(p) {
    if (drawPickupImage(p.kind, p, p.r * 2.25, 'rgba(255,230,26,0.18)')) return;
    ctx.save(); ctx.translate(p.x, p.y);
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,230,26,0.15)'; ctx.fill();
    const s = p.r;
    if (p.kind === 'guitar') {
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, -s * 1.15); ctx.stroke();
      ctx.fillStyle = '#1a1008'; ctx.fillRect(-s * 0.12, -s * 1.25, s * 0.24, s * 0.18);
      ctx.beginPath(); ctx.ellipse(-s * 0.18, s * 0.15, s * 0.42, s * 0.55, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#c47a32'; ctx.fill();
      ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.18, s * 0.15, s * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1a0a'; ctx.fill();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
      for (const dx of [-0.32, -0.18, -0.04]) { ctx.beginPath(); ctx.moveTo(dx * s, -s * 0.2); ctx.lineTo(dx * s + s * 0.14, s * 0.62); ctx.stroke(); }
    } else if (p.kind === 'piano') {
      ctx.fillStyle = '#161616'; ctx.fillRect(-s * 0.85, -s * 0.55, s * 1.7, s * 1.1);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.strokeRect(-s * 0.85, -s * 0.55, s * 1.7, s * 1.1);
      const keyW = s * 1.6 / 5;
      ctx.fillStyle = '#f5f3ec';
      for (let k = 0; k < 5; k++) ctx.fillRect(-s * 0.8 + k * keyW, -s * 0.05, keyW * 0.92, s * 0.5);
      ctx.fillStyle = '#161616';
      for (let k = 0; k < 4; k++) ctx.fillRect(-s * 0.8 + (k + 0.7) * keyW, -s * 0.05, keyW * 0.36, s * 0.3);
    } else {
      ctx.strokeStyle = '#9b6a17'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.62, s * 0.45); ctx.quadraticCurveTo(-s * 0.1, -s * 0.38, s * 0.56, -s * 0.3); ctx.stroke();
      ctx.fillStyle = '#e6ad2e';
      ctx.beginPath(); ctx.ellipse(s * 0.53, -s * 0.26, s * 0.36, s * 0.22, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-s * 0.6, s * 0.48, s * 0.24, s * 0.33, 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffe48a'; ctx.lineWidth = 1.5;
      for (const t of [-0.24, -0.02, 0.2]) { ctx.beginPath(); ctx.moveTo(t * s, -s * 0.18); ctx.lineTo((t + 0.04) * s, -s * 0.03); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawPowerup(p) {
    if (p.type === 'mystery') { drawMysteryBox(p); return; }
    if (p.type === 'instrument') { drawInstrument(p); return; }
    if (p.type === 'hp') {
      if (drawPickupImage('hp', p, p.r * 2.25, 'rgba(51,255,102,0.18)')) return;
      ctx.save(); ctx.translate(p.x, p.y);
      const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
      ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(51,255,102,0.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a5c2e'; ctx.fill();
      ctx.strokeStyle = C('#33ff66'); ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#eafff0'; ctx.lineWidth = Math.max(3, p.r * 0.22); ctx.lineCap = 'round';
      const armLen = p.r * (p.hpValue >= 3 ? 0.34 : 0.45);
      ctx.beginPath(); ctx.moveTo(-armLen, 0); ctx.lineTo(armLen, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -armLen); ctx.lineTo(0, p.hpValue >= 3 ? armLen * 0.2 : armLen); ctx.stroke();
      if (p.hpValue >= 3) {
        ctx.fillStyle = '#eafff0';
        ctx.font = `bold ${Math.max(9, p.r * 0.62)}px 'Bebas Neue', cursive`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p.hpValue), 0, p.r * 0.46);
      }
      ctx.restore();
      return;
    }
    if (p.type === 'shield') {
      if (drawPickupImage('powerShield', p, p.r * 2.25, 'rgba(0,229,255,0.18)')) return;
      ctx.save(); ctx.translate(p.x, p.y);
      const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
      ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,229,255,0.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1530'; ctx.fill();
      ctx.strokeStyle = C('#00e5ff'); ctx.lineWidth = 2; ctx.stroke();
      // Bold hexagon badge instead of a soft shield silhouette — reads clearly as
      // "protection" at small sizes without needing to be a literal shield outline.
      const hr = p.r * 0.62;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        const x = Math.cos(a) * hr, y = Math.sin(a) * hr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#00e5ff'; ctx.fill();
      ctx.strokeStyle = '#eafffd'; ctx.lineWidth = 2; ctx.stroke();
      // Small inner bolt accent so it doesn't read as a blank badge
      ctx.fillStyle = '#1a1530';
      ctx.beginPath();
      ctx.moveTo(-hr*0.12, -hr*0.55); ctx.lineTo(hr*0.32, -hr*0.05); ctx.lineTo(0, -hr*0.05);
      ctx.lineTo(hr*0.12, hr*0.55); ctx.lineTo(-hr*0.32, hr*0.05); ctx.lineTo(0, hr*0.05);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    const pickupType = p.type === 'gun' ? 'gun' : p.type === 'bomb' ? 'bomb' : null;
    if (pickupType && drawPickupImage(pickupType, p, p.r * 2.25, p.type === 'bomb' ? 'rgba(255,136,0,0.18)' : 'rgba(255,230,26,0.18)')) return;
    ctx.save(); ctx.translate(p.x, p.y);
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    const ringColor = p.type === 'bomb' ? '#ff8800' : '#ffe61a';
    ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
    ctx.fillStyle = p.type === 'bomb' ? 'rgba(255,136,0,0.18)' : 'rgba(255,230,26,0.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1530'; ctx.fill();
    ctx.strokeStyle = C(ringColor); ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `${p.r * 1.3}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.type === 'gun' ? '⚡' : '💣', 0, 1);
    ctx.restore();
  }


  // Mystery box "rebound" penalty — a single hazard ball that bounces off the side
  // walls and the top, so it keeps re-aiming back into the play field ("bounces off
  // and shoots back at you") instead of just drifting offscreen. Disappears either
  // on hitting the player (after dealing damage) or once its timer runs out.
  function spawnRebound() {
    const ang = Math.PI * 0.25 + Math.random() * Math.PI * 0.5; // roughly downward, varied angle
    const speed = 3.5;
    rebound = {
      x: W / 2, y: H * 0.25,
      vx: Math.cos(ang) * speed * (Math.random() < 0.5 ? -1 : 1),
      vy: Math.sin(ang) * speed,
      r: 15, expiresAt: Date.now() + 9000, nextFire: 0,
    };
  }

  function applyPowerup(type) {
    if (type === 'gun') {
      buffGunUntil = Date.now() + 8000;
      addFloatText('MACHINE GUN!', player.x, player.y - 50, '#ffe61a', 20);
      showTopBanner('MACHINE GUN', 'good');
      SFX.powerupCollect();
    } else if (type === 'bomb') {
      let cleared = 0;
      obstacles.forEach(o => {
        if (o.isTrapped) return; // spare heroes — bomb only hits hostiles
        bigExplosion(o.x, o.y, o.type === 'asteroid' ? '#7a6a90' : GAME_CHARS[o.ci].color);
        score += o.type === 'asteroid' ? (10 + wave * 2) : (25 + wave * 5);
        waveKills++; cleared++;
        o.alive = false;
      });
      obstacles = obstacles.filter(o => o.alive !== false);
      addFloatText(`BOMB! +${cleared}`, player.x, player.y - 50, '#ff8800', 22);
      showTopBanner(`BOMB +${cleared}`, 'good');
      SFX.over();
    } else if (type === 'hp') {
      const gain = arguments[1] || 2;
      health = Math.min(100, health + gain);
      addFloatText(`+${gain} HP`, player.x, player.y - 50, '#33ff66', 20);
      showTopBanner(`+${gain} HP`, 'good');
      SFX.powerupCollect();
    } else if (type === 'shield') {
      buffShieldUntil = Date.now() + 8000;
      addFloatText('SHIELD UP!', player.x, player.y - 50, '#00e5ff', 20);
      showTopBanner('SHIELD UP', 'good');
      SFX.powerupCollect();
    } else if (type === 'mystery') {
      SFX.boxOpen();
      // No plain "bomb" here — that's already a normal pickup with no twist on it.
      // Every outcome below is either not a regular powerup at all, or a clear
      // escalation of one (tripleBuff stacks all 3 AND extends on top of whatever's
      // already running, never just resetting/wasting active time).
      const outcomes = ['bigHp', 'tripleBuff', 'twin', 'pizzaBlast', 'frozen', 'zapped', 'reverse', 'tiny', 'rebound', 'snowing'];
      const roll = outcomes[Math.floor(Math.random() * outcomes.length)];
      if (roll === 'bigHp') {
        health = Math.min(100, health + 25);
        addFloatText('MYSTERY: +25 HP!', player.x, player.y - 50, '#33ff66', 20);
        showTopBanner('MYSTERY: +25 HP!', 'good');
        SFX.mysteryGood();
      } else if (roll === 'tripleBuff') {
        const now = Date.now();
        buffSpeedUntil = Math.max(buffSpeedUntil, now) + 8000;
        buffGunUntil = Math.max(buffGunUntil, now) + 8000;
        buffShieldUntil = Math.max(buffShieldUntil, now) + 8000;
        addFloatText('MYSTERY: TRIPLE BUFF!', player.x, player.y - 50, '#ffe61a', 20);
        showTopBanner('MYSTERY: TRIPLE BUFF!', 'good');
        SFX.mysteryGood(); ticketConfetti(true);
      } else if (roll === 'twin') {
        twin = { x: player.x + 40, y: player.y, lastFire: 0, expiresAt: Date.now() + 8000 };
        addFloatText('MYSTERY: TWIN SHIP!', player.x, player.y - 50, '#ffe61a', 20);
        showTopBanner('MYSTERY: TWIN SHIP!', 'good');
        SFX.mysteryGood(); ticketConfetti(true);
      } else if (roll === 'pizzaBlast') {
        buffPizzaUntil = Date.now() + 8000;
        addFloatText('MYSTERY: PIZZA BLAST!', player.x, player.y - 50, '#ffcc44', 20);
        showTopBanner('MYSTERY: PIZZA BLAST!', 'good');
        SFX.mysteryGood();
      } else if (roll === 'frozen') {
        buffFrozenUntil = Date.now() + 5000;
        addFloatText('MYSTERY: FROZEN!', player.x, player.y - 50, '#66ddff', 20);
        showTopBanner('MYSTERY: FROZEN!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'zapped') {
        buffZappedUntil = Date.now() + 5000;
        addFloatText('MYSTERY: FARTED!', player.x, player.y - 50, '#cc99ff', 20);
        showTopBanner('MYSTERY: FARTED!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'reverse') {
        controlsReversedUntil = Date.now() + 4000;
        addFloatText('MYSTERY: REVERSED!', player.x, player.y - 50, '#ff5500', 20);
        showTopBanner('MYSTERY: REVERSED!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'tiny') {
        player.r = Math.max(8, player.r * 0.6);
        addFloatText('MYSTERY: TINY SHIP!', player.x, player.y - 50, '#cc66ff', 20);
        showTopBanner('MYSTERY: TINY SHIP!', 'bad');
        SFX.mysteryBad();
        setTimeout(() => { if (state === 'playing') player.r = 18; }, 6000);
      } else if (roll === 'rebound') {
        spawnRebound();
        addFloatText('MYSTERY: REBOUND!', player.x, player.y - 50, '#ff4444', 20);
        showTopBanner('MYSTERY: REBOUND!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'snowing') {
        snowingUntil = Date.now() + 12000;
        addFloatText('MYSTERY: SNOWSTORM!', player.x, player.y - 50, '#aee8ff', 20);
        showTopBanner('MYSTERY: SNOWSTORM!', 'bad');
        SFX.mysteryBad();
      }
    }
  }

  // Locked aspect ratio instead of a free-stretching height — see the CSS comment on
  // #pg-space for why (orientation/screen-shape was silently changing difficulty by
  // changing how far obstacles had to fall to reach the danger line). Computes the
  // largest box at SPACE_RATIO that fits the space below the header, sets it as the
  // canvas's actual CSS size via inline style. The backing bitmap is scaled up for
  // high-DPI displays, while W/H stay in CSS/game coordinates so gameplay speed and
  // collision math do not change.
  const SPACE_RATIO = 9 / 16; // width / height
  let spaceDpr = 1;
  function fitSpaceCanvas() {
    const wrap = document.getElementById('pg-space');
    if (!wrap || !canvas) return;
    const headerEl = wrap.querySelector('.cats-header');
    const availW = wrap.clientWidth || window.innerWidth;
    const availH = (wrap.clientHeight || window.innerHeight) - (headerEl ? headerEl.offsetHeight : 0);
    let w = availW, h = w / SPACE_RATIO;
    if (h > availH) { h = availH; w = h * SPACE_RATIO; }
    w = Math.floor(w); h = Math.floor(h);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    spaceDpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2.5);
    W = w;
    H = h;
    canvas.width = Math.max(1, Math.round(w * spaceDpr));
    canvas.height = Math.max(1, Math.round(h * spaceDpr));
    if (ctx) {
      ctx.setTransform(spaceDpr, 0, 0, spaceDpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    }
  }

  function reset() {
    fitSpaceCanvas();
    player = { x:W/2, y:H-SPACE_SHIP_BOTTOM_OFFSET, r:18 };
    bullets=[]; obstacles=[]; score=0; health=100; wave=1; waveKills=0;
    enemyBullets=[]; lastEnemyFire=0; floatTexts=[]; lineFlashA=0;
    powerups=[]; buffSpeedUntil=0; buffGunUntil=0; buffShieldUntil=0; escort=null; shakeMag=0;
    boss=null; rescuedChars.clear(); rescueBanner = null; missionRetryCaptives.splice(0, missionRetryCaptives.length); waveCaptivesSeen.clear();
    waveTheme = null; miniBoss = null; themeEffectsAt = 0; waveTransitioning = false;
    mirrorSequenceActive = false; mirrorStageTimers.forEach(clearTimeout); mirrorStageTimers = [];
    buffFrozenUntil = 0; buffZappedUntil = 0; controlsReversedUntil = 0; twin = null; rebound = null; buffPizzaUntil = 0; snowingUntil = 0; snowParticles = [];
    inventory = { gun: false, shield: false, bomb: false };
    socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
    dangerY = socketAnchorY + (H - socketAnchorY) * 0.5;
    player.y = dangerY + player.r * 1.1;
    highScore = parseInt(localStorage.getItem('space-best')||'0');
    leftHeld=false; rightHeld=false; lastAutoFire=0; lastPizzaFire=0;
    mkStars();
    currentCfg = waveConfig(wave);
    startWaveSpawn(currentCfg);
    scheduleHpPowerup();
    schedulePowerup();
    scheduleMysteryBox();
    scheduleInstrument();
    setTimeout(() => {
      if (state === 'playing' && wave === 1) showTopBanner('PICK TARGETS. DODGE CLEAN.', 'good');
    }, 900);
  }

  function clearSpaceRuntimeTimers() {
    clearTimeout(spawnTimer);
    clearTimeout(hpPowerupTimer);
    clearTimeout(powerupTimer);
    clearTimeout(mysteryTimer);
    clearTimeout(instrumentTimer);
    mirrorStageTimers.forEach(clearTimeout);
    mirrorStageTimers = [];
    mirrorSequenceActive = false;
  }

  function beginConfiguredWave(startWave, forcedBossName) {
    clearSpaceRuntimeTimers();
    bullets = []; obstacles = []; enemyBullets = []; powerups = []; floatTexts = [];
    boss = null; miniBoss = null; rescueBanner = null; waveCaptivesSeen.clear();
    wave = startWave;
    waveKills = 0;
    health = 100;
    score = Math.max(score || 0, (startWave - 1) * 100);
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, null);
    if (forcedBossName) {
      waveTheme = forcedBossName === 'GIZMO' ? 'gizmo' : 'boss';
      pendingBossCreature = forcedBossName === 'GIZMO'
        ? { name: 'GIZMO', isGizmo: true }
        : BOSS_CREATURES.find(c => c.name === forcedBossName) || pickBossCreature();
    } else {
      pendingBossCreature = (waveTheme === 'boss' || waveTheme === 'gizmo') ? pickBossCreature() : null;
    }
    spawnsRemaining = 0;
    themeEffectsAt = 0;
    waveTransitioning = false;
    startWaveSpawn(currentCfg);
    scheduleHpPowerup();
    schedulePowerup();
    scheduleMysteryBox();
    scheduleInstrument();
    if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: wave <= 15 && hasUnrescuedMissionCaptive() });
    if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: wave !== 17 && hasUnrescuedMissionCaptive(), escape: !forcedBossName && wave !== 17, final: !forcedBossName && wave === 17 });
    if (waveTheme === 'captive') spawnBoss(true);
    if (waveTheme === 'ghost' || waveTheme === 'emp') spawnMiniBoss(waveTheme);
    if (waveTheme === 'mirror') spawnMirrorEnemy();
    if (waveTheme === 'rave') SFX.neonOn();
    showTopBanner(forcedBossName ? `TEST ${forcedBossName}` : `DEBUG WAVE ${wave}`, 'good');
    showSkillCalloutForWave();
  }

  let spawnTimer = null;
  function startWaveSpawn(cfg) {
    clearTimeout(spawnTimer);
    // Boss/captive waves are true encounter waves now: beat the boss, then advance
    // into the next chapter beat instead of resuming a hidden regular spawn pool.
    if (waveTheme === 'boss' || waveTheme === 'captive' || waveTheme === 'gizmo') spawnsRemaining = 0;
    else if (waveTheme === 'asteroids') spawnsRemaining = Math.max(1, Math.ceil(cfg.poolSize * 1.55));
    else if (waveTheme === 'mirror') spawnsRemaining = Math.max(4, Math.ceil(cfg.poolSize * 0.34));
    else if (waveTheme === 'bomber') spawnsRemaining = Math.max(4, Math.ceil(cfg.poolSize * 0.48));
    else spawnsRemaining = cfg.poolSize;
    function doSpawn() {
      if (state !== 'playing') return;
      // Paused entirely while a boss fight is active — it's deploying its own minions
      // instead, not stacked on top of the regular wave queue. GHOST gets the same
      // full pause because it is meant to read as a real encounter.
      if (boss || (miniBoss && miniBoss.kind === 'ghost')) { spawnTimer = setTimeout(doSpawn, 500); return; }
      if (spawnsRemaining <= 0) return; // pool exhausted — let the board clear naturally, no forced wipe
      spawnObstacle(cfg);
      spawnsRemaining--;
      // SWARM speeds up by cadence, not by screen-flooding. ALL ASTEROIDS now works
      // the same way: more total rocks across the wave, but no triple-dumps that
      // make one bomb erase the whole mode or create impossible clumps.
      const themeSpeedup = waveTheme === 'swarm' ? 0.65 : waveTheme === 'goldrush' ? 0.6 : waveTheme === 'asteroids' ? 0.95 : waveTheme === 'mirror' ? 1.25 : waveTheme === 'bomber' ? 1.18 : 1;
      spawnTimer = setTimeout(doSpawn, cfg.spawnMs * 0.8 * themeSpeedup * (0.7 + Math.random()*0.6));
    }
    spawnTimer = setTimeout(doSpawn, 1500);
  }

  // Brief "WAVE N CLEARED" checkmark beat, same language as the equivalent moment
  // in Whack-a-Mobe — a clean confirmation that the wave is actually done, shown
  // for ~1s before the slot-machine announcement for the next wave begins.
  function showWaveClearedBeat(clearedWave, onDone) {
    SFX.win();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.2s ease-in-out;background:rgba(3,1,16,0.7)';
    el.innerHTML = `
      <div style="font-size:min(30vw,120px);color:#33ff66;text-shadow:0 0 30px #33ff66,0 0 60px #33ff6688;line-height:1">✓</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:26px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 14px #33ff66;margin-top:8px">WAVE ${clearedWave} CLEARED</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); onDone(); }, 200);
    }, 1000);
  }

  function showGizmoEscapeBeat(rescuedCi, onDone) {
    waveTransitioning = true;
    const isEarlyWave = (wave <= 2 || wave === 10 || wave === 11);
    const holdMs = isEarlyWave ? 7800 : 3300;
    const flyDur = isEarlyWave ? 1.8 : 1.45;
    const flyDelay = isEarlyWave ? 5.2 : 0.25;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(3,1,16,0.9);opacity:0;transition:opacity 0.25s ease;pointer-events:none';
    const rescueLine = rescuedCi >= 0 ? `BUT ${GAME_CHARS[rescuedCi].name.toUpperCase()} IS FREE` : 'BUT A MOBE IS FREE';
    const hahaHTML = isEarlyWave ? `
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden">
        <div style="position:absolute;top:12%;left:8%;font-family:'Bebas Neue',cursive;font-size:28px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 0.5s forwards">HA</div>
        <div style="position:absolute;top:22%;right:12%;font-family:'Bebas Neue',cursive;font-size:34px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 0.9s forwards">HA HA</div>
        <div style="position:absolute;top:8%;left:42%;font-family:'Bebas Neue',cursive;font-size:22px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 1.3s forwards">HA</div>
        <div style="position:absolute;top:32%;left:18%;font-family:'Bebas Neue',cursive;font-size:30px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 1.7s forwards">HA HA</div>
        <div style="position:absolute;top:16%;right:28%;font-family:'Bebas Neue',cursive;font-size:26px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.0s forwards">HA</div>
        <div style="position:absolute;top:38%;right:8%;font-family:'Bebas Neue',cursive;font-size:32px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.3s forwards">HA HA HA</div>
        <div style="position:absolute;top:5%;left:22%;font-family:'Bebas Neue',cursive;font-size:20px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.6s forwards">HA</div>
        <div style="position:absolute;top:28%;left:52%;font-family:'Bebas Neue',cursive;font-size:24px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.9s forwards">HA HA</div>
        <div style="position:absolute;top:42%;left:6%;font-family:'Bebas Neue',cursive;font-size:27px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 3.2s forwards">HA</div>
        <div style="position:absolute;top:18%;left:62%;font-family:'Bebas Neue',cursive;font-size:30px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 3.5s forwards">HA HA</div>
      </div>` : '';
    el.innerHTML = `
      ${hahaHTML}
      <div style="position:absolute;left:50%;top:50%;width:118px;text-align:center;animation:sp-gizmo-centered-out ${flyDur}s ease-in ${flyDelay}s both">
        <div style="animation:sp-gizmo-laugh-rock 0.92s ease-in-out infinite">${spaceBriefingBoss('hold')}</div>
      </div>
      <div style="position:absolute;left:50%;top:calc(50% + 88px);width:min(92vw,390px);transform:translateX(-50%);text-align:center">
        <div style="font-family:'Bebas Neue',cursive;font-size:48px;letter-spacing:5px;line-height:1;color:#cc66ff;text-shadow:0 0 18px #cc66ff88">GIZMO ESCAPED!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:#00e5ff;text-shadow:0 0 10px #00e5ff;margin-top:12px">${rescueLine}</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    if (isEarlyWave) SFX.scaryLaugh();
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); waveTransitioning = false; if (onDone) onDone(); }, 260);
    }, holdMs);
  }

  function showMissionFailedBeat(onDone) {
    const gc = GAME_CHARS[activeChar];
    const rescued = rescuedChars.size;
    const total = missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT;
    const allSaved = rescued >= total;
    const captiveGrid = missionTrappedChars.length ? missionTrappedChars.map(ci => {
      const g = GAME_CHARS[ci];
      const freed = rescuedChars.has(ci);
      return `<div style="width:42px;text-align:center">
        <div style="position:relative;width:42px;height:42px;border-radius:50%;overflow:visible;filter:${freed ? 'none' : 'grayscale(0.9) brightness(0.55)'}">
          ${charFace(g, freed ? 'happy' : 'sad')}
          ${freed ? `<div style="position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;background:#0c1a12;border:1.5px solid #33ff66;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;color:#33ff66;box-shadow:0 0 6px rgba(51,255,102,0.65)">&#10003;</div>` : ''}
        </div>
        <div style="font-family:'VCR',monospace;font-size:6px;letter-spacing:0.5px;color:${freed ? 'rgba(242,239,232,0.7)' : 'rgba(242,239,232,0.3)'};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.name}</div>
      </div>`;
    }).join('') : '';
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(3,1,16,0);opacity:1;transition:background 0.35s ease;pointer-events:none';
    el.innerHTML = `
      <div style="width:min(94vw,410px);text-align:center;opacity:0;transform:scale(0.96);transition:opacity 0.35s ease,transform 0.35s ease">
        <div style="font-family:'Bebas Neue',cursive;font-size:52px;letter-spacing:6px;line-height:0.95;color:#ff4444;text-shadow:0 0 22px #ff444488;margin-bottom:18px">MISSION FAILED</div>
        <div style="width:110px;height:110px;margin:0 auto 14px;border-radius:18px;overflow:hidden;border:3px solid ${gc.color}66;background:${gc.color}11;box-shadow:0 0 18px ${gc.color}33">${charFace(gc, 'sad')}</div>
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:3px;color:rgba(242,239,232,0.5);margin-bottom:6px">${gc.name}</div>
        <div style="font-family:'Bebas Neue',cursive;font-size:36px;letter-spacing:4px;line-height:1;color:${allSaved ? '#33ff66' : '#00e5ff'};text-shadow:0 0 14px ${allSaved ? '#33ff66' : '#00e5ff'}88;margin-bottom:6px">${rescued}/${total} HEROES SAVED</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.45);margin-bottom:18px">WAVE ${wave} · SCORE ${score}</div>
        ${captiveGrid ? `<div style="display:grid;grid-template-columns:repeat(5,42px);justify-content:center;gap:10px 14px;margin:0 auto 20px">${captiveGrid}</div>` : ''}
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.4)">THEY STILL NEED YOU</div>
      </div>`;
    document.body.appendChild(el);
    const card = el.firstElementChild;
    requestAnimationFrame(() => {
      el.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    setTimeout(() => {
      // Build the leaderboard/result overlay BEFORE the mission-failed card fades out,
      // so the player never sees the stale launch menu underneath during the handoff.
      if (onDone) onDone();
      requestAnimationFrame(() => {
        el.style.background = 'rgba(3,1,16,0)';
        card.style.opacity = '0';
        card.style.transform = 'scale(1.04)';
        setTimeout(() => { el.remove(); }, 350);
      });
    }, 4800);
  }

  function showBossDefeatedBeat(bossName, x, y, onDone) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.2s ease';
    el.innerHTML = `
      <div style="text-align:center">
        <div style="font-family:'Bebas Neue',cursive;font-size:clamp(36px,8vw,58px);letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 22px #ffe61a88,0 0 44px #ffe61a44;transform:scale(0.85);transition:transform 0.35s cubic-bezier(.2,1.15,.35,1)">${(bossName || 'BOSS').toUpperCase()} DEFEATED!</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.querySelector('div > div').style.transform = 'scale(1)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); if (onDone) onDone(); }, 220);
    }, 1800);
  }

  function showBossRescueUnlockBeat(rescuedCi, bossName, onDone) {
    if (rescuedCi == null || rescuedCi < 0) { if (onDone) onDone(); return; }
    waveTransitioning = true;
    const gc = GAME_CHARS[rescuedCi];
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,rgba(0,229,255,0.34),rgba(6,30,72,0.96) 48%,rgba(3,1,16,0.98) 100%);opacity:0;transition:opacity 0.25s ease;pointer-events:none;overflow:hidden';
    const img = gc.imgHappy || gc.img;
    el.innerHTML = `
      <div style="position:absolute;inset:-20%;background:repeating-linear-gradient(115deg,rgba(90,190,255,0.08) 0 2px,transparent 2px 36px);animation:sp-brief-star-drift 4s linear infinite"></div>
      <div style="width:min(92vw,410px);text-align:center;position:relative">
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:3px;color:#b9f7ff;text-shadow:0 0 12px #00e5ff;margin-bottom:14px">${bossName || 'BOSS'} LOCK BROKEN</div>
        <div style="position:relative;width:154px;height:154px;margin:0 auto 18px">
          <div style="position:absolute;inset:-10px;border-radius:50%;border:8px solid rgba(0,229,255,0.24);box-shadow:0 0 28px rgba(0,229,255,0.72);animation:sp-ring-spin 2.2s linear infinite"></div>
          <div style="position:absolute;inset:5px;border-radius:50%;border:3px solid #00e5ff;box-shadow:inset 0 0 18px rgba(0,229,255,0.5),0 0 18px rgba(0,229,255,0.5)"></div>
          <div style="position:absolute;inset:22px;border-radius:50%;background:${gc.color || '#33d4e0'};box-shadow:0 0 22px ${gc.color || '#33d4e0'}88;overflow:hidden">
            ${img ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:contain;filter:saturate(1.15)">` : `<div style="font-size:62px;line-height:110px">${gc.happy || gc.emoji || ''}</div>`}
          </div>
        </div>
        <div style="font-family:'Bebas Neue',cursive;font-size:54px;letter-spacing:6px;line-height:0.95;color:#33ff66;text-shadow:0 0 22px #33ff6688">${gc.name.toUpperCase()} IS FREE!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:#b9f7ff;text-shadow:0 0 10px #00e5ff;margin-top:12px">RESCUED ${rescuedChars.size}/${missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT}</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    SFX.missionHero();
    ticketConfetti(true);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); waveTransitioning = false; if (onDone) onDone(); }, 260);
    }, 4800);
  }

  function freeAllRemainingMobes() {
    unrescuedMissionCaptives().forEach(ci => rescuedChars.add(ci));
    missionRetryCaptives.splice(0, missionRetryCaptives.length);
    rescueBanner = { ci: activeChar, startedAt: Date.now(), rescued: rescuedChars.size, total: missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT };
  }

  function showSpaceVictoryBriefing(onDone) {
    waveTransitioning = true;
    const ov = document.createElement('div');
    ov.className = 'space-rescue-briefing';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,1,16,0);transition:background 0.35s ease;pointer-events:none';
    const allMobes = [...missionEnemyChars, ...missionTrappedChars];
    const gridStyle = "display:grid;grid-template-columns:repeat(4,58px);justify-content:center;gap:12px 14px";
    ov.innerHTML = `
      <div style="width:min(94vw,430px);text-align:center;opacity:0;transform:scale(0.96);transition:opacity 0.35s ease,transform 0.35s ease">
        <div style="font-family:'Bebas Neue',cursive;font-size:54px;letter-spacing:6px;line-height:0.96;color:#33ff66;text-shadow:0 0 22px #33ff6688;margin-bottom:14px">GIZMO DEFEATED!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:3px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;margin-bottom:16px">LIFE IS BACK TO NORMAL</div>
        <div style="${gridStyle}">${allMobes.map(ci => spaceBriefingFace(ci, 'happy')).join('')}</div>
      </div>`;
    document.body.appendChild(ov);
    const card = ov.firstElementChild;
    SFX.win(); ticketConfetti(true);
    requestAnimationFrame(() => {
      ov.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    setTimeout(() => {
      ov.style.background = 'rgba(3,1,16,0)';
      card.style.opacity = '0';
      card.style.transform = 'scale(1.04)';
      setTimeout(() => { ov.remove(); waveTransitioning = false; if (onDone) onDone(); }, 350);
    }, 5200);
  }

function nextWave() {
    if (waveTransitioning) return;

    waveTransitioning = true;

    // Reward player for clearing a wave
    health = Math.min(100, health + 5);
    addFloatText('+5 HP', player.x, player.y - 50, '#33ff66', 22);
    showTopBanner('+5 HP', 'good');

    const clearedWave = wave;
    const previousTheme = waveTheme;
    wave++;
    waveKills=0;
    waveCaptivesSeen.clear();
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, previousTheme);
    pendingBossCreature = (waveTheme === 'boss' || waveTheme === 'gizmo') ? pickBossCreature() : null;
    const announceMs = 7000;
    showWaveClearedBeat(clearedWave, () => {
      themeEffectsAt = Date.now() + announceMs;
      // Nothing for the new wave spawns until the announcement is actually gone —
      // previously these fired on their own shorter timers, racing the announcement
      // rather than waiting for it.
      announceWave(wave, announceMs, () => {
        waveTransitioning = false;
        if (state !== 'playing') return;
        startWaveSpawn(currentCfg);
        if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: wave <= 15 && hasUnrescuedMissionCaptive() });
        if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: wave !== 17 && hasUnrescuedMissionCaptive(), escape: wave !== 17, final: wave === 17 });
        if (waveTheme === 'captive') spawnBoss(true);
        if (waveTheme === 'ghost' || waveTheme === 'emp') spawnMiniBoss(waveTheme);
        if (waveTheme === 'mirror') spawnMirrorEnemy();
        if (waveTheme === 'rave') SFX.neonOn();
        showSkillCalloutForWave();
      });
    });
  }

  function skillCalloutForWave() {
    if (wave === 2) return 'HURT GIZMO. SAVE A MOBE.';
    if (wave === 10) return 'YOU CAN HURT HIM MORE NOW.';
    if (wave === 17) return 'FINAL GIZMO. USE EVERYTHING.';
    if (waveTheme === 'boss' && boss && boss.creature && boss.creature.name === 'DARK KNIGHT') return "DON'T SHOOT THE SHIELD";
    if (waveTheme === 'boss') return 'SAVE RAPID FIRE FOR BOSS';
    if (waveTheme === 'captive') return 'BREAK THE LOCK FIRST';
    if (waveTheme === 'swarm') return 'BOMB NOW OR DODGE CLEAN';
    if (waveTheme === 'bomber') return 'KILL BOMBERS EARLY';
    if (waveTheme === 'mirror') return 'FIND THE TRIANGLE GAP';
    if (waveTheme === 'asteroids') return 'WEAVE. SAVE THE BOMB.';
    if (waveTheme === 'blackout') return 'STAY CALM. WATCH THE LINE.';
    if (waveTheme === 'emp') return 'DODGE THE ZAPS';
    if (waveTheme === 'ghost') return 'TRACK THE GHOST';
    return null;
  }

  function showSkillCalloutForWave() {
    const text = skillCalloutForWave();
    if (!text) return;
    setTimeout(() => {
      if (state !== 'playing' || waveTransitioning) return;
      showTopBanner(text, waveTheme === 'boss' || waveTheme === 'gizmo' || waveTheme === 'captive' ? 'bad' : 'good');
    }, 420);
  }

  const SLOT_SPIN_LABELS = ['SURVIVE', ...WAVE_THEMES.map(t => THEME_LABEL[t])];

  // TYPE (theme name, or SURVIVE for a normal wave) is the headline, with the wave
  // number underneath as the smaller secondary line. Before landing on the actual
  // roll, it spins through random labels like a slot machine, slowing down toward
  // the end — gives the player a clear, dramatic beat to register what's coming
  // instead of an instant reveal. The outer fade-in/out animation runs once across
  // the whole duration; only the type line's text/color is touched during the spin.
  // Captive roster shown on every between-wave break — dim/grayscale (like an empty
  // power-up socket) for Mobes still jailed, full-color happy face + rescued check
  // for ones already freed this run. Reuses the same charFace() the rest of the game
  // draws faces with, just with a CSS filter instead of a separate jail-cell effect.
  function waveCaptiveFace(ci) {
    const gc = GAME_CHARS[ci];
    const freed = rescuedChars.has(ci);
    const size = 54;
    return `<div style="width:${size}px;text-align:center;font-family:'VCR',monospace;font-size:7.5px;letter-spacing:0.5px;color:${freed ? 'rgba(242,239,232,0.7)' : 'rgba(242,239,232,0.38)'}">
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;overflow:visible;filter:${freed ? 'none' : 'grayscale(0.9) brightness(0.55)'}">
        ${charFace(gc, freed ? 'happy' : 'normal')}
        ${freed ? `<div style="position:absolute;right:-2px;bottom:-2px;width:16px;height:16px;border-radius:50%;background:#0c1a12;border:1.5px solid #33ff66;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:#33ff66;box-shadow:0 0 6px rgba(51,255,102,0.65)">&#10003;</div>` : ''}
      </div>
      <div style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${gc.name}</div>
    </div>`;
  }

  function announceWave(w, duration, onDone) {
    const ann = document.createElement('div');
    // A real dark "intermission" backdrop, not just text floating over still-visible
    // gameplay — this isn't a rush game, a clear break between waves is fine. Fades
    // in/out on its own short transition rather than riding the text's scale/opacity
    // keyframe, so the backdrop itself doesn't appear to "shrink."
    ann.style.cssText='position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow-y:auto;padding:10px 0;pointer-events:none;background:rgba(3,1,16,0);transition:background 0.45s ease';
    const ds = (duration / 1000).toFixed(2);
    // Folding the captive grid into the same centered, animated block naturally pulls
    // the slot-machine text up a bit too — the taller block still centers as a whole.
    const captiveGridHTML = missionTrappedChars.length ? `
      <div style="margin-top:22px;display:flex;flex-wrap:wrap;justify-content:center;gap:12px 16px;max-width:380px">${missionTrappedChars.map(waveCaptiveFace).join('')}</div>` : '';
    ann.innerHTML=`<div style="text-align:center;animation:wave-announce ${ds}s ease-out forwards">
      <div id="sp-wave-incoming" style="font-family:'VCR',monospace;font-size:11px;letter-spacing:5px;color:#33ff66">INCOMING</div>
      <div id="sp-wave-type" style="font-family:'Bebas Neue',cursive;font-size:clamp(30px, 8vh, 60px);letter-spacing:6px;color:#33ff66;text-shadow:0 0 20px #33ff66,0 0 40px #33ff6688;line-height:1;transition:transform 0.3s ease-out">SURVIVE</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:clamp(17px, 3.4vh, 26px);letter-spacing:4px;color:#33ff66;text-shadow:0 0 10px #33ff6688;margin-top:6px">WAVE ${w}</div>
      ${captiveGridHTML}
    </div>`;
    document.body.appendChild(ann);
    requestAnimationFrame(() => { ann.style.background = 'rgba(3,1,16,0.88)'; });
    setTimeout(() => { ann.style.background = 'rgba(3,1,16,0)'; }, Math.max(0, duration - 450));
    const typeEl = ann.querySelector('#sp-wave-type'), incomingEl = ann.querySelector('#sp-wave-incoming');
    // BOSS is now just another theme entry, with its own THEME_LABEL — no more
    // separate wave-number-based fallback needed.
    const finalLabel = waveTheme === 'boss' && pendingBossCreature ? pendingBossCreature.name : (waveTheme ? THEME_LABEL[waveTheme] : 'SURVIVE');
    const finalColor = waveTheme ? '#ff00cc' : '#33ff66';
    const spinDelays = [60,60,70,80,90,110,140,180,230,300,400];
    let i = 0;
    function spin() {
      if (i >= spinDelays.length) {
        typeEl.textContent = finalLabel;
        typeEl.style.color = finalColor;
        typeEl.style.textShadow = `0 0 20px ${finalColor},0 0 40px ${finalColor}88`;
        incomingEl.style.color = finalColor;
        typeEl.style.transform = 'scale(1.18)';
        setTimeout(() => { typeEl.style.transform = 'scale(1)'; }, 10);
        SFX.slotLand();
        return;
      }
      typeEl.textContent = SLOT_SPIN_LABELS[Math.floor(Math.random() * SLOT_SPIN_LABELS.length)];
      typeEl.style.color = '#999';
      typeEl.style.textShadow = 'none';
      SFX.slotTick();
      setTimeout(spin, spinDelays[i++]);
    }
    spin();
    setTimeout(() => { ann.remove(); if (onDone) onDone(); }, duration);
  }

  function takeDamage(amount) {
    if (Date.now() < buffShieldUntil) {
      addFloatText('BLOCKED!', player.x, player.y - 40, '#00e5ff', 18);
      miniExplosion(player.x, player.y, '#00e5ff');
      return; // shield fully absorbs the hit — no health loss
    }
    health = Math.max(0, health - amount);
    addFloatText(`-${amount}`, player.x, player.y - 40, '#ff4444', 20);
    miniExplosion(player.x, player.y, '#ff4444');
    triggerShake(amount * 1.2);
    // Mystery "snowing" outcome — getting hit at all while it's snowing also
    // freezes you briefly, on top of the normal damage. Reuses the existing
    // FROZEN debuff (movement slow + snowflake bullets) rather than a new state.
    if (Date.now() < snowingUntil) {
      buffFrozenUntil = Math.max(buffFrozenUntil, Date.now() + 2000);
      addFloatText('FROZEN!', player.x, player.y - 60, '#66ddff', 16);
    }
    if (health <= 0) {
      // 'dying' (not 'over' yet) — loop() keeps redrawing a frozen frame (background,
      // stars, frozen obstacles/player) for this window instead of stopping outright.
      // Cancelling the loop immediately here used to leave the death explosion's own
      // particle frames smeared on a canvas nothing was clearing anymore.
      state = 'dying';
      clearTimeout(spawnTimer);
      SFX.over();
      triggerShake(18);
      bigExplosion(player.x, player.y, GAME_CHARS[activeChar].color);
      if (score > highScore) { highScore = score; localStorage.setItem('space-best', score); }
      // Freeze on the death frame for 3s before showing the game-over overlay
      setTimeout(() => {
        state = 'over';
        cancelAnimationFrame(raf);
        showSpaceOverlay('over');
      }, 3000);
    }
  }

  function shieldDeflectObstacle(o) {
    if (!o || o.isTrapped || o.isDeflected) return false;
    const dx = o.x - player.x;
    const dy = o.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    o.isDeflected = true;
    o.deflectStart = Date.now();
    o.deflectDuration = 620;
    o.deflectScale = 1;
    o.deflectSpin = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.08);
    o.vx = (dx / dist) * 8;
    o.vy = -Math.abs((dy / dist) * 8) - 5;
    o.paused = false;
    o.pausedBurstDone = true;
    o.burstShotsLeft = 0;
    waveKills++;
    score += o.type === 'asteroid' ? 10 + wave * 2 : 25 + wave * 5;
    addFloatText('DEFLECT!', o.x, o.y - 10, '#00e5ff', 18);
    miniExplosion(o.x, o.y, '#00e5ff');
    SFX.powerupCollect();
    return true;
  }

  function drawCanvasMobe(gc, expr, x, y, w, h, options) {
    options = options || {};
    const src = expr === 'happy' ? (gc.imgHappy || gc.img)
      : expr === 'sad' ? (gc.imgSad || gc.img)
      : gc.img;
    const img = src ? _getImg(src) : null;
    ctx.save();
    if (options.glowColor) {
      ctx.shadowColor = options.glowColor;
      ctx.shadowBlur = options.glowBlur || Math.max(w, h) * 0.18;
    }
    if (img && img.complete && img.naturalWidth) {
      if (options.whiteOutline) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= 0.92;
        ctx.filter = 'brightness(0) invert(1)';
        const o = options.outlineSize || Math.max(2, Math.min(w, h) * 0.08);
        for (const [dx, dy] of [[-o,0],[o,0],[0,-o],[0,o],[-o,-o],[o,-o],[-o,o],[o,o]]) {
          ctx.drawImage(img, x + dx, y + dy, w, h);
        }
        ctx.filter = 'none';
        ctx.globalAlpha /= 0.92;
        if (options.glowColor) {
          ctx.shadowColor = options.glowColor;
          ctx.shadowBlur = options.glowBlur || Math.max(w, h) * 0.18;
        }
      }
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.font = `${Math.min(w, h) * 0.72}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(expr === 'happy' ? gc.happy : expr === 'sad' ? gc.sad : gc.emoji, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = player, gc = GAME_CHARS[activeChar];
    ctx.save(); ctx.translate(p.x, p.y);
    if (Date.now() < buffShieldUntil) {
      const t = Date.now() * 0.005;
      const pulse = 0.95 + Math.sin(t * 1.6) * 0.06;
      const r = p.r * 1.82 * pulse;
      ctx.save();
      ctx.rotate(t * 0.45);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const rr = r * (k % 2 ? 0.9 : 1.05);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,229,255,0.1)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,229,255,0.72)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(234,255,255,0.9)';
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = t * 1.4 + k * Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        ctx.fillStyle = k % 2 ? '#eaffff' : '#00e5ff';
        ctx.beginPath(); ctx.rect(x - 2.4, y - 2.4, 4.8, 4.8); ctx.fill();
      }
      ctx.restore();
    }
    // thruster glow — no shadowBlur for perf; use a larger semi-transparent fill instead
    ctx.beginPath(); ctx.moveTo(-10,10); ctx.lineTo(0,28); ctx.lineTo(10,10); ctx.closePath();
    ctx.fillStyle='rgba(0,229,255,0.5)'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0,-p.r*1.1);
    ctx.lineTo(p.r*0.75, p.r*0.5);
    ctx.lineTo(p.r*0.4,  p.r*0.8);
    ctx.lineTo(-p.r*0.4, p.r*0.8);
    ctx.lineTo(-p.r*0.75,p.r*0.5);
    ctx.closePath();
    ctx.fillStyle=gc.color; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    const fr = p.r*0.52;
    ctx.beginPath(); ctx.arc(0,-fr*0.3,fr+2,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,-fr*0.3,fr,0,Math.PI*2);
    ctx.fillStyle=gc.color; ctx.fill();
    drawCanvasMobe(gc, 'normal', -fr, -fr * 1.3, fr * 2, fr * 2);
    ctx.restore();
  }

  function drawObstacle(o) {
    ctx.save(); ctx.translate(o.x,o.y);
    if (o.isDeflected) {
      ctx.globalAlpha *= Math.max(0, o.deflectScale == null ? 1 : o.deflectScale);
      ctx.rotate((Date.now() - (o.deflectStart || Date.now())) * 0.02 * (o.deflectSpin || 0.2));
      ctx.scale(Math.max(0.08, o.deflectScale || 1), Math.max(0.08, o.deflectScale || 1));
    }
    if (o.type==='asteroid') {
      ctx.rotate(o.rot);
      const rockStyle = o.rockStyle || 0;
      const fill = rockStyle === 1 ? '#6a5b78' : rockStyle === 2 ? '#4f596f' : '#5c526c';
      const stroke = rockStyle === 1 ? '#9b86a8' : rockStyle === 2 ? '#7f94a8' : '#8b7fa3';
      const dark = rockStyle === 1 ? '#3c3048' : rockStyle === 2 ? '#2f3848' : '#362f42';
      ctx.beginPath();
      o.verts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
      ctx.closePath();
      ctx.fillStyle=C(fill); ctx.fill();
      ctx.strokeStyle=C(dark); ctx.lineWidth=Math.max(3, o.r * 0.16); ctx.stroke();
      ctx.strokeStyle=C(stroke); ctx.lineWidth=Math.max(1.5, o.r * 0.06); ctx.stroke();

      const facets = [
        [[-0.55,-0.18],[-0.2,-0.58],[0.08,-0.2],[-0.12,0.08]],
        [[0.05,-0.48],[0.54,-0.26],[0.32,0.12],[-0.02,0.02]],
        [[-0.42,0.08],[-0.06,0.24],[-0.2,0.58],[-0.58,0.42]],
        [[0.16,0.16],[0.5,0.04],[0.42,0.48],[0.02,0.55]],
      ];
      facets.forEach((poly, i) => {
        ctx.beginPath();
        poly.forEach(([px, py], k) => k ? ctx.lineTo(px * o.r, py * o.r) : ctx.moveTo(px * o.r, py * o.r));
        ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)';
        ctx.fill();
      });
      ctx.strokeStyle='rgba(25,20,34,0.34)'; ctx.lineWidth=Math.max(1.2, o.r * 0.045);
      ctx.beginPath(); ctx.moveTo(-o.r*0.44,-o.r*0.22); ctx.lineTo(o.r*0.18,o.r*0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.r*0.12,-o.r*0.44); ctx.lineTo(o.r*0.44,o.r*0.08); ctx.stroke();
    } else {
      const gc=GAME_CHARS[o.ci];
      if (o.isTrapped) {
        const jailS = o.r * 1.85;
        ctx.fillStyle = 'rgba(0,229,255,0.12)';
        ctx.fillRect(-jailS/2, -jailS/2, jailS, jailS);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-jailS/2, -jailS/2, jailS, jailS);
        ctx.fillStyle = 'rgba(0,229,255,0.22)';
        ctx.fillRect(-jailS/2, -jailS/2, jailS, jailS);
        ctx.strokeStyle = 'rgba(234,255,255,0.72)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-jailS * 0.22, -jailS/2); ctx.lineTo(-jailS * 0.22, jailS/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(jailS * 0.22, -jailS/2); ctx.lineTo(jailS * 0.22, jailS/2); ctx.stroke();
        ctx.save();
        ctx.beginPath(); ctx.rect(-jailS/2, -jailS/2, jailS, jailS); ctx.clip();
      }
      const faceScale = o.isTrapped ? 2.12 : 2.24;
      drawCanvasMobe(gc, o.isTrapped ? 'sad' : 'normal', -o.r * faceScale / 2, -o.r * faceScale / 2, o.r * faceScale, o.r * faceScale, {
        glowColor: o.isTrapped ? 'rgba(0,229,255,0.72)' : 'rgba(255,68,68,0.45)',
        glowBlur: o.r * (o.isTrapped ? 0.35 : 0.18),
      });
      if (o.isTrapped) {
        ctx.restore();
        ctx.fillStyle = 'rgba(0,229,255,0.32)';
        ctx.fillRect(-o.r, -o.r, o.r * 2, o.r * 2);
      }
      if (!o.isTrapped) {
        // Enemy target lock: keep the red language outside the face so the character
        // art stays readable, then add small inward ticks that say "shoot this."
        ctx.lineCap = 'round';
        if (o._pulseSeed === undefined) o._pulseSeed = Math.random() * 1000;
        const pulse = 0.94 + Math.sin(Date.now() * 0.004 + o._pulseSeed) * 0.06;
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 1.18, 0.12 * Math.PI, 1.88 * Math.PI);
        ctx.strokeStyle = 'rgba(255,68,68,0.28)'; ctx.lineWidth = 9; ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 1.18, 0.12 * Math.PI, 1.88 * Math.PI);
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,235,235,0.82)';
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-o.r * 1.05, 0); ctx.lineTo(-o.r * 0.62, 0); ctx.moveTo(o.r * 0.62, 0); ctx.lineTo(o.r * 1.05, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -o.r * 1.05); ctx.lineTo(0, -o.r * 0.68); ctx.moveTo(0, o.r * 0.68); ctx.lineTo(0, o.r * 1.05); ctx.stroke();
      }
      if (o.isTrapped && o.ringHp > 0) {
        // Same "special shoot target" language as the mystery crate, but blue:
        // a soft outer glow, a bright inner ring, and orbiting dots that read as
        // rescue tech instead of a plain selection outline.
        const ringR = o.r * 0.76;
        const t2 = Date.now() * 0.003;
        const seed = o._pulseSeed || 0;
        const ringPulse = 1 + Math.sin(Date.now() * 0.008 + seed) * 0.05;
        ctx.save();
        ctx.rotate(t2);
        ctx.beginPath(); ctx.arc(0, 0, ringR * 1.14 * ringPulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(90,190,255,0.26)'; ctx.lineWidth = 8; ctx.stroke();
        const ringGrad = ctx.createLinearGradient(-ringR, -ringR, ringR, ringR);
        ringGrad.addColorStop(0, '#5ab1ff');
        ringGrad.addColorStop(0.48, '#00e5ff');
        ringGrad.addColorStop(1, '#b9f7ff');
        ctx.beginPath(); ctx.arc(0, 0, ringR * 1.02 * ringPulse, 0, Math.PI * 2);
        ctx.strokeStyle = ringGrad; ctx.lineWidth = 2.8; ctx.stroke();
        for (let d = 0; d < 4; d++) {
          const a = (d / 4) * Math.PI * 2 + t2;
          ctx.fillStyle = d % 2 ? '#eaffff' : '#5ab1ff';
          ctx.beginPath(); ctx.arc(Math.cos(a) * ringR * 1.02 * ringPulse, Math.sin(a) * ringR * 1.02 * ringPulse, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        if (o.maxRingHp) {
          ctx.font = `bold ${Math.max(10, o.r * 0.54)}px 'Bebas Neue', cursive`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#eaffff';
          ctx.strokeStyle = 'rgba(0,0,0,0.72)'; ctx.lineWidth = 3;
          const hpText = `${Math.max(0, o.ringHp)}/${o.maxRingHp}`;
          ctx.strokeText(hpText, 0, o.r + 14);
          ctx.fillText(hpText, 0, o.r + 14);
        }
      }
    }
    ctx.restore();
  }

  // RAVE wave: a disco ball hanging at the top, slowly spinning, throwing off a
  // few sparkle glints. SVG-style vector shapes (facets + lines), not emoji.
  function drawDiscoBall() {
    const x = W / 2, y = 46, r = 22;
    const t = Date.now() * 0.0012;
    // Rotating colored light beams sweeping down from the ball — drawn first so
    // the ball itself sits in front of them.
    const beamColors = ['255,0,255', '0,255,255', '255,255,0', '57,255,20'];
    for (let i = 0; i < beamColors.length; i++) {
      const a = t * 1.3 + (i / beamColors.length) * Math.PI * 2;
      const len = H * 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(${beamColors[i]},0.22)`);
      grad.addColorStop(1, `rgba(${beamColors[i]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(34, len); ctx.lineTo(-34, len);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(200,200,210,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -r - 18); ctx.lineTo(0, -r); ctx.stroke();
    ctx.rotate(Math.sin(t) * 0.25);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#aab0c0'; ctx.fill();
    // Faceted mirror tiles — a small grid of quads, alternating shade for a
    // checkered-mirror look, clipped to the circle.
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    const cols = 7;
    for (let row = -cols; row <= cols; row++) {
      for (let col = -cols; col <= cols; col++) {
        const tx = col * (r * 2 / cols), ty = row * (r * 2 / cols);
        if (Math.hypot(tx, ty) > r + 4) continue;
        const shade = (row + col + Math.floor(t * 2)) % 2 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(40,40,60,0.35)';
        ctx.fillStyle = shade;
        ctx.fillRect(tx - r/cols + 0.5, ty - r/cols + 0.5, r*2/cols - 1, r*2/cols - 1);
      }
    }
    ctx.restore();
    ctx.restore();
    // Sparkle glints flung outward, twinkling on/off.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 1.6;
      const dist = r + 14 + Math.sin(t * 3 + i) * 6;
      const spx = x + Math.cos(a) * dist, spy = y + Math.sin(a) * dist * 0.6;
      const tw = Math.abs(Math.sin(t * 4 + i * 1.7));
      if (tw < 0.4) continue;
      ctx.beginPath(); ctx.arc(spx, spy, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${tw})`; ctx.fill();
    }
  }

  function drawHUD() {
    // Score (top left) — hidden while the top banner is showing (appears through
    // its full fade-in/hold/fade-out) rather than competing with it; nobody reads
    // it that closely mid-action anyway.
    if (!topBanner) {
      ctx.fillStyle = 'rgba(242,239,232,0.92)';
      ctx.font = `bold 23px 'Bebas Neue', cursive`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`SCORE ${score}`, 10, 6);
    }

    // Wave number / HP percent text both removed — the health bar fill is already
    // the at-a-glance signal, and wave number isn't something players read mid-action.
    const barY = 56;
    const barW = W; // spans the full screen edge-to-edge, not inset
    const barX = 0;
    const barH = 14;
    const hp = Math.max(0, health) / 100;

    // Background track
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX, barY, barW, barH);

    // Health fill — no shadowBlur; use a brighter overlay strip for effect
    ctx.fillStyle = hp > 0.6 ? '#33ff66' : hp > 0.3 ? '#ffe61a' : '#ff4444';
    ctx.fillRect(barX, barY, barW * hp, barH);
    ctx.fillStyle = hp > 0.6 ? 'rgba(51,255,102,0.3)' : hp > 0.3 ? 'rgba(255,230,26,0.3)' : 'rgba(255,68,68,0.3)';
    ctx.fillRect(barX, barY, barW * hp, barH * 0.4);

    // Section dividers (10 segments = 10 HP each)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const sx = barX + barW * (i / 10);
      ctx.beginPath(); ctx.moveTo(sx, barY); ctx.lineTo(sx, barY + barH); ctx.stroke();
    }

    // Active buff indicators (top right, under the health bar now). Right-aligned at
    // W-10, so a long string only ever grows further left — drawBuffLine() shrinks the
    // font until it fits within the canvas width instead of risking it running off
    // the left edge on a narrow screen.
    function drawBuffLine(text, y, color, baseSize) {
      let size = baseSize;
      ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      // Extra margin beyond the raw fit check — emoji glyphs (especially ones with a
      // variation selector) can render wider than measureText() reports on some
      // platforms, so don't cut it exactly at the limit.
      while (ctx.measureText(text).width > W - 28 && size > 9) {
        size--;
        ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      }
      ctx.fillStyle = color;
      ctx.fillText(text, W - 10, y);
    }
    function drawBuffIconLine(iconType, text, y, color, baseSize) {
      let size = baseSize;
      const iconSize = Math.max(16, baseSize + 5);
      ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      while (ctx.measureText(text).width + iconSize + 7 > W - 28 && size > 9) {
        size--;
        ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      }
      const textW = ctx.measureText(text).width;
      const iconX = W - 10 - textW - 7 - iconSize / 2;
      const iconY = y - Math.max(5, size * 0.36);
      drawProjectileImage(iconType, iconX, iconY, iconSize, 0, color, true);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.fillText(text, W - 10, y);
    }
    ctx.textAlign = 'right';
    let buffY = barY + barH + 16;
    const now = Date.now();
    if (now < buffSpeedUntil) {
      drawBuffIconLine('gun', `SPEED ${Math.ceil((buffSpeedUntil - now) / 1000)}s`, buffY, '#ffe61a', 13);
      buffY += 18;
    }
    if (now < buffGunUntil) {
      drawBuffIconLine('gun', `RAPID FIRE ${Math.ceil((buffGunUntil - now) / 1000)}s`, buffY, '#ffe61a', 13);
      buffY += 18;
    }
    if (now < buffShieldUntil) {
      drawBuffIconLine('powerShield', `SHIELD ${Math.ceil((buffShieldUntil - now) / 1000)}s`, buffY, '#00e5ff', 13);
      buffY += 18;
    }
    if (now < buffFrozenUntil) {
      drawBuffIconLine('ice', `FROZEN ${Math.ceil((buffFrozenUntil - now) / 1000)}s`, buffY, '#66ddff', 13);
      buffY += 18;
    }
    if (now < buffZappedUntil) {
      drawBuffIconLine('zap', `FART ${Math.ceil((buffZappedUntil - now) / 1000)}s`, buffY, '#cc99ff', 13);
      buffY += 18;
    }
    if (now < controlsReversedUntil) {
      drawBuffLine(`🔀 REVERSED ${Math.ceil((controlsReversedUntil - now) / 1000)}s`, buffY, '#ff5500', 13);
      buffY += 18;
    }
    if (now < buffPizzaUntil) {
      drawBuffIconLine('pizza', `PIZZA BLAST ${Math.ceil((buffPizzaUntil - now) / 1000)}s`, buffY, '#ffcc44', 13);
      buffY += 18;
    }
    if (waveTheme === 'rave') {
      drawBuffLine('🪩 RAVE MODE!', buffY, '#ff00aa', 13);
      buffY += 18;
    }
    if (escort && escort.state === 'active') {
      // 2 sizes larger than the other buff lines
      drawBuffLine(`🤝 ESCORT ${Math.max(0, Math.ceil((escort.expiresAt - now) / 1000))}s`, buffY, '#33ff66', 19);
    }

    ctx.textBaseline = 'alphabetic';

    if (missionTrappedChars.length) {
      const total = missionTrappedChars.length;
      const rescued = Math.min(rescuedChars.size, total);
      const done = rescued >= total;
      ctx.textAlign = 'left';
      ctx.font = `bold 13px 'Bebas Neue', cursive`;
      ctx.fillStyle = done ? '#33ff66' : '#00e5ff';
      ctx.fillText(`RESCUED ${rescued}/${total}`, 10, barY + barH + 16);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(10, barY + barH + 23, 92, 4);
      ctx.fillStyle = done ? '#33ff66' : '#00e5ff';
      ctx.fillRect(10, barY + barH + 23, 92 * (rescued / total), 4);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawRescueBanner() {
    if (!rescueBanner) return;
    const age = Date.now() - rescueBanner.startedAt;
    const hold = 1850;
    if (age > hold) { rescueBanner = null; return; }
    const inA = Math.min(1, age / 220);
    const outA = age > hold - 360 ? Math.max(0, (hold - age) / 360) : 1;
    const a = inA * outA;
    const gc = GAME_CHARS[rescueBanner.ci];
    const x = W / 2, y = H * 0.29;
    const scale = 0.88 + Math.min(1, age / 260) * 0.12;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(3,1,16,0.72)';
    ctx.strokeStyle = 'rgba(0,229,255,0.72)';
    ctx.lineWidth = 2;
    const bx = -132, by = -62, bw = 264, bh = 124, br = 12;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.fill(); ctx.stroke();

    const ringPulse = 1 + Math.sin(Date.now() * 0.01) * 0.05;
    ctx.save();
    ctx.translate(-76, 0);
    ctx.beginPath(); ctx.arc(0, 0, 36 * ringPulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 31 * ringPulse, 0.16 * Math.PI, 1.82 * Math.PI);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-34, -10); ctx.lineTo(-44, -22); ctx.lineTo(-35, -33); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 12); ctx.lineTo(45, 20); ctx.lineTo(35, 33); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.fillStyle = gc.color; ctx.fill();
    const img = _getImg(gc.imgHappy || gc.img);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -21, -21, 42, 42);
    else {
      ctx.font = '29px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(gc.happy || gc.emoji, 0, 1);
    }
    ctx.restore();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `bold 23px 'Bebas Neue', cursive`;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('MOBE RESCUED', -25, -18);
    ctx.font = `bold 18px 'Bebas Neue', cursive`;
    ctx.fillStyle = '#33ff66';
    ctx.fillText(`${rescueBanner.rescued}/${rescueBanner.total} MOBES RESCUED`, -25, 12);
    ctx.restore();
  }

  function drawCaptiveWaveBackdrop() {
    if (!(boss && boss.isCaptive)) return;
    const t = Date.now() * 0.001;
    ctx.save();
    const pulse = 0.12 + Math.sin(t * 3.2) * 0.035;
    const grad = ctx.createRadialGradient(boss.x, boss.y, 30, boss.x, boss.y, Math.max(W, H) * 0.72);
    grad.addColorStop(0, `rgba(0,229,255,${pulse})`);
    grad.addColorStop(0.38, 'rgba(0,120,255,0.055)');
    grad.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(0,229,255,0.11)';
    ctx.lineWidth = 1;
    const gap = 38;
    const offset = (t * 18) % gap;
    for (let x = -gap + offset; x < W + gap; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * 0.32, H); ctx.stroke();
    }
    for (let x = W + gap - offset; x > -gap; x -= gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - H * 0.32, H); ctx.stroke();
    }
    ctx.restore();
  }

  function drawCaptiveObjectiveHUD() {
    if (!(boss && boss.isCaptive)) return;
    const gc = GAME_CHARS[boss.captiveCi];
    const x = W / 2, y = 86;
    const pct = Math.max(0, boss.hp / boss.maxHp);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(3,1,16,0.76)';
    ctx.fillRect(x - 116, y - 23, 232, 46);
    ctx.strokeStyle = 'rgba(0,229,255,0.64)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 116, y - 23, 232, 46);
    ctx.font = `bold 15px 'Bebas Neue', cursive`;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(`FREE ${gc.name}`, x, y - 7);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x - 72, y + 7, 144, 6);
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(x - 72, y + 7, 144 * pct, 6);
    ctx.font = `bold 10px 'VCR', monospace`;
    ctx.fillStyle = 'rgba(234,255,255,0.72)';
    ctx.fillText('BREAK THE LOCK', x, y + 21);
    ctx.restore();
  }

  function loop(ts) {
    if (state === 'dying') {
      // Frozen frame: redraw background/stars/entities as-is (no movement, spawning,
      // or input) so the death explosion still animates against a properly-cleared
      // canvas instead of smearing on a static one.
      raf = requestAnimationFrame(loop);
      ctx.fillStyle = '#030110'; ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fill();
      }
      obstacles.forEach(drawObstacle);
      if (boss) drawBoss();
      if (escort) drawEscort();
      drawPlayer();
      drawHUD();
      return;
    }
    if (state!=='playing') return;
    raf=requestAnimationFrame(loop);

    ctx.save();
    if (shakeMag > 0.4) {
      ctx.translate((Math.random()-0.5)*shakeMag, (Math.random()-0.5)*shakeMag);
      shakeMag *= 0.85;
    } else {
      shakeMag = 0;
    }

    ctx.fillStyle='#030110'; ctx.fillRect(0,0,W,H);

    const _rave = waveTheme === 'rave';
    const RAVE_STAR_COLORS = ['255,0,255', '0,255,255', '57,255,20', '255,0,170', '255,255,0'];
    for(const s of stars){
      s.y+=s.speed;
      if(s.y>H) { s.y=-2; s.x=rand(0,W); }
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      // Stars are the one thing neon mode missed before — index into a small neon
      // set instead of plain white, every star, the whole wave.
      ctx.fillStyle = _rave ? `rgba(${RAVE_STAR_COLORS[Math.floor(s.x + s.y) % RAVE_STAR_COLORS.length]},${s.a})` : `rgba(255,255,255,${s.a})`;
      ctx.fill();
    }
    if (_rave) {
      drawDiscoBall();
      // Periodic confetti bursts — reuses the same celebratory effect used for
      // mini-boss kills/triple-buff elsewhere, just on a timer instead of an event.
      if (Date.now() - lastRaveConfetti > 2800) { ticketConfetti(true); lastRaveConfetti = Date.now(); }
    }
    drawCaptiveWaveBackdrop();

    // Mystery "snowing" outcome — ambient, not overly dense, purely atmospheric on
    // its own. takeDamage() is what actually punishes getting hit while this is up.
    if (Date.now() < snowingUntil) {
      while (snowParticles.length < 22) snowParticles.push({ x: rand(0, W), y: rand(-20, H), speed: 0.6 + Math.random() * 0.9, r: 6 + Math.random() * 4, drift: Math.random() * Math.PI * 2, rot: Math.random() * Math.PI });
      for (const sp of snowParticles) {
        sp.y += sp.speed;
        sp.x += Math.sin(sp.drift + sp.y * 0.02) * 0.4;
        sp.rot += 0.015;
        if (sp.y > H) { sp.y = -10; sp.x = rand(0, W); }
        drawIceShard(sp.x, sp.y, sp.r * 1.55, sp.rot, null);
      }
    } else if (snowParticles.length) {
      snowParticles = [];
    }

    const _now = Date.now();
    const _frozen = _now < buffFrozenUntil, _zapped = _now < buffZappedUntil;
    const _pizza = _now < buffPizzaUntil;
    const curFireMs = _now < buffGunUntil ? AUTO_FIRE_MS * 0.4 : AUTO_FIRE_MS;
    if (!waveTransitioning && _pizza) {
      // Its own much slower, separate cadence — a deliberate pump-shotgun rhythm,
      // not rapid fire — plus slower bullets so each blast reads as heavy rather
      // than just "more bullets at the normal speed."
      const PIZZA_FIRE_MS = 950;
      if (ts - lastPizzaFire > PIZZA_FIRE_MS) {
        for (const a of [-0.36, -0.18, 0, 0.18, 0.36]) {
          bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED*0.5*Math.cos(a),vx:-B_SPEED*0.5*Math.sin(a),isPizza:true});
        }
        SFX.bomberDive();
        lastPizzaFire = ts;
      }
    } else if(!waveTransitioning && ts-lastAutoFire>curFireMs){
      bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED});
      if (_zapped) SFX.fart(); else SFX.blaster();
      lastAutoFire=ts;
    }

    let curSpeed = _now < buffSpeedUntil ? P_SPEED * 1.6 : P_SPEED;
    if (_frozen) curSpeed *= 0.5; // FROZEN — the only real penalty; the snowflake bullet skin is just its visible tell
    const reversed = _now < controlsReversedUntil;
    const goLeft = reversed ? rightHeld : leftHeld, goRight = reversed ? leftHeld : rightHeld;
    if(goLeft)  player.x=Math.max(player.r,     player.x-curSpeed);
    if(goRight) player.x=Math.min(W-player.r,   player.x+curSpeed);

    // Hero escort: appears at the player's side, follows and auto-fires while active,
    // then flies off with a "thanks" instead of just vanishing once its time is up.
    // The departure is deliberately slow — it was easy to miss before. (Used to fly in
    // from the rescue spot first, but with everything else already converging on the
    // player, that extra moving piece just added to the clutter — appearing instantly
    // reads cleaner.)
    if (escort) {
      if (escort.state === 'active') {
        escort.x = player.x - 40;
        escort.y = player.y + 4;
        if (Date.now() > escort.expiresAt) {
          escort.state = 'leaving';
          addFloatText('THANKS!', escort.x, escort.y - 20, '#33ff66', 16);
        } else if (!waveTransitioning && ts - escort.lastFire > AUTO_FIRE_MS * 1.6) {
          bullets.push({x:escort.x, y:escort.y-14, vy:-B_SPEED});
          escort.lastFire = ts;
        }
      } else {
        escort.y -= 1.6;
        escort.opacity -= 0.007;
        if (escort.opacity <= 0 || escort.y < -60) escort = null;
      }
    }

    // Mystery-box "twin ship" — mirrors the player at a fixed offset and auto-fires
    // alongside them for its duration, same auto-fire rate as the real ship.
    if (twin) {
      twin.x = player.x + 40; twin.y = player.y;
      if (Date.now() > twin.expiresAt) { twin = null; }
      else if (!waveTransitioning && ts - twin.lastFire > AUTO_FIRE_MS) {
        bullets.push({x:twin.x, y:twin.y-player.r*1.2, vy:-B_SPEED});
        twin.lastFire = ts;
      }
    }

    // Mystery box "rebound" hazard — bounces off the side walls/top AND off any
    // enemy or asteroid it touches (true reflection off the obstacle's surface,
    // not just a wall-style axis flip), so its path stays unpredictable rather
    // than passing straight through the rest of the wave. Hits the player once
    // for real damage (shield still blocks it) then clears, or expires on its own.
    if (rebound) {
      rebound.x += rebound.vx; rebound.y += rebound.vy;
      if (rebound.x < rebound.r || rebound.x > W - rebound.r) rebound.vx *= -1;
      if (rebound.y < rebound.r) rebound.vy *= -1;
      if (rebound.y > dangerY) rebound.vy *= -1; // stays in the playfield, doesn't sneak through as a free hit at the line
      for (const o of obstacles) {
        if (o.alive === false) continue;
        const odx = rebound.x - o.x, ody = rebound.y - o.y;
        const dist = Math.hypot(odx, ody);
        const minDist = rebound.r + o.r;
        if (dist > 0 && dist < minDist) {
          const nx = odx / dist, ny = ody / dist;
          const dot = rebound.vx * nx + rebound.vy * ny;
          rebound.vx -= 2 * dot * nx; rebound.vy -= 2 * dot * ny;
          rebound.x += nx * (minDist - dist); rebound.y += ny * (minDist - dist);
          miniExplosion(rebound.x, rebound.y, '#ff8855');
          break; // one bounce per frame is plenty
        }
      }
      if (Math.hypot(rebound.x - player.x, rebound.y - player.y) < rebound.r + player.r * 0.8) {
        takeDamage(15);
        miniExplosion(rebound.x, rebound.y, '#ff4444');
        rebound = null;
      } else if (Date.now() > rebound.expiresAt) {
        rebound = null;
      } else if (Date.now() > rebound.nextFire) {
        // Fires along its own spin angle (same formula drawRebound uses to rotate
        // it visually) — rapid-fire that sweeps through every direction as it spins,
        // rather than aiming at the player.
        const spinAngle = Date.now() * 0.006;
        const fireSpeed = 4;
        enemyBullets.push({ x: rebound.x, y: rebound.y, vx: Math.cos(spinAngle) * fireSpeed, vy: Math.sin(spinAngle) * fireSpeed, r: 4 });
        rebound.nextFire = Date.now() + 130;
      }
    }

    // Boss: hovers near the top (never crosses the danger line), alternates a
    // telegraphed laser (dodge sideways during the charge-up) and a machine-gun burst,
    // and periodically deploys a minion of its own — the only enemies that show up
    // during the fight, since the regular wave queue is paused for its duration.
    if (boss) {
      boss.x += boss.vx;
      if (boss.x < boss.r + 20 || boss.x > W - boss.r - 20) boss.vx *= -1;
      boss.hitFlash = Math.max(0, boss.hitFlash - 0.05);

      // A jail cell shouldn't be dispatching reinforcements — captive fights are just
      // rescue + dodge attacks, no minions.
      if (!boss.isCaptive && Date.now() > bossDeployTimer) {
        // Spawns from right behind the boss, not a random spot at the top — reads as
        // the boss actually deploying it rather than an unrelated arrival.
        const side = Math.random() < 0.5 ? -1 : 1;
        obstacles.push({ type:'face', x: Math.max(FACE_R, Math.min(W-FACE_R, boss.x + side*boss.r*0.7)), y: boss.y + boss.r*0.5, vx:rand(-0.6,0.6)*currentCfg.speed, vy:currentCfg.speed*0.55, r:FACE_R, ci: nextMissionEnemyIndex(), hp:3, isTrapped:false, ringHp:0, pausedBurstDone:false, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0 });
        bossDeployTimer = Date.now() + 4000 + Math.random()*1500;
      }

      if (Date.now() > boss.nextAttack && !boss.laserPhase) {
        const bt = campaignTier(wave);
        if (boss.isCaptive) {
          const count = Math.min(7, 4 + Math.floor(bt / 2));
          const speed = 2.55 + bt * 0.28 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const spread = count === 1 ? 0 : (k - (count - 1) / 2) / ((count - 1) / 2);
            const vx = spread * speed * 0.55;
            const vy = speed * (0.92 + Math.abs(spread) * 0.12);
            enemyBullets.push({ x: boss.x + spread * boss.r * 0.55, y: boss.y + boss.r * 0.72, vx, vy, r: 6.6, isLock: true });
          }
          addFloatText('LOCK PULSE!', boss.x, boss.y + boss.r + 18, '#00e5ff', 16);
          SFX.neonOn && SFX.neonOn();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'donkey') {
          const count = bt >= 3 ? 5 : 4;
          const speed = 2.25 + bt * 0.16 + Math.max(0, wave - 18) * 0.06;
          for (let k = 0; k < count; k++) {
            const spread = (k - (count - 1) / 2) * 0.28;
            enemyBullets.push({ x: boss.x + (k - (count - 1) / 2) * boss.r * 0.34, y: boss.y + boss.r * 0.48, vx: spread * speed, vy: speed * 0.72, r: 9, theme: 'donkey', gravity: 0.055, born: Date.now() });
          }
          addFloatText('DONKEY STOMP!', boss.x, boss.y + boss.r + 18, '#c7a16b', 16);
          SFX.bomberDive && SFX.bomberDive();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'fire') {
          const count = bt >= 3 ? 5 : 4;
          const base = Math.atan2(player.y - boss.y, player.x - boss.x);
          const speed = 3.0 + bt * 0.22 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const ang = base + (k - (count - 1) / 2) * 0.16;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.48, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.7, theme: 'fire', splitAt: 520, splitTheme: 'fire', splitSpeed: 2.35, born: Date.now() });
          }
          addFloatText('FIRE BREATH!', boss.x, boss.y + boss.r + 18, '#ff6600', 16);
          SFX.tone && SFX.tone(160,'sawtooth',0,0.18,0.09,80);
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'shield') {
          boss.shieldUntil = Date.now() + 1400;
          addFloatText('SHIELD UP!', boss.x, boss.y + boss.r + 18, '#c8d4ff', 16);
          for (let k = 0; k < 3; k++) {
            const spread = (k - 1) * 0.42;
            enemyBullets.push({ x: boss.x + spread * boss.r * 0.46, y: boss.y + boss.r * 0.5, vx: spread * 2.8, vy: 2.8, r: 7, theme: 'shield', born: Date.now() });
          }
          SFX.neonOn && SFX.neonOn();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2400);
        } else if (boss.attackType === 'orb') {
          const count = bt >= 2 ? 5 : 4;
          const speed = 2.65 + bt * 0.16 + Math.max(0, wave - 18) * 0.06;
          for (let k = 0; k < count; k++) {
            const spread = (k - (count - 1) / 2) * 0.24;
            enemyBullets.push({ x: boss.x + spread * boss.r, y: boss.y + boss.r * 0.45, vx: spread * speed, vy: speed, r: 7.4, theme: 'greenOrb', homing: 0.018, maxSpeed: speed + 0.85, born: Date.now() });
          }
          addFloatText('HOMING ORBS!', boss.x, boss.y + boss.r + 18, '#33ff66', 16);
          SFX.emp && SFX.emp();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'fish') {
          const count = bt >= 3 ? 6 : 4;
          const speed = 2.95 + bt * 0.2 + Math.max(0, wave - 18) * 0.07;
          for (let k = 0; k < count; k++) {
            const left = k % 2 === 0;
            const lane = Math.floor(k / 2);
            enemyBullets.push({ x: left ? -10 : W + 10, y: boss.y + boss.r * (0.72 + lane * 0.28), vx: (left ? 1 : -1) * (speed * 0.82), vy: speed * 0.68, r: 7.7, theme: 'fish', waveAmp: 0.9 + lane * 0.15, waveFreq: 0.015, phase: k, born: Date.now() });
          }
          addFloatText('TEETH PINCER!', boss.x, boss.y + boss.r + 18, '#5ab1ff', 16);
          SFX.bomberDive && SFX.bomberDive();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'sombrero') {
          const count = bt >= 3 ? 5 : 4;
          const base = Math.atan2(player.y - boss.y, player.x - boss.x);
          const speed = 3.05 + bt * 0.18 + Math.max(0, wave - 18) * 0.06;
          for (let k = 0; k < count; k++) {
            const ang = base + (k - (count - 1) / 2) * 0.28;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.55, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.7, theme: 'sombrero', boomerang: 0.012, born: Date.now() });
          }
          addFloatText('BOOMERANG HATS!', boss.x, boss.y + boss.r + 18, '#d99a2b', 16);
          SFX.tone && SFX.tone(420,'square',0,0.06,0.08,260);
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'ink') {
          const count = Math.min(12, 7 + bt);
          const speed = 2.75 + bt * 0.22 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const ang = Math.PI * 0.15 + (k / (count - 1)) * Math.PI * 0.7;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.35, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.4, theme: 'ink', splat: true, born: Date.now() });
          }
          addFloatText('INK BURST!', boss.x, boss.y + boss.r + 18, '#7040b8', 16);
          SFX.neonOn && SFX.neonOn();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'gizmo') {
          const count = boss.isFinalGizmo ? 9 : wave >= 10 ? 7 : 5;
          const speed = 2.9 + bt * 0.24 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const spread = count === 1 ? 0 : (k - (count - 1) / 2) / ((count - 1) / 2);
            enemyBullets.push({ x: boss.x + spread * boss.r * 0.58, y: boss.y + boss.r * 0.5, vx: spread * speed * 0.45, vy: speed, r: 7.8, isLock: true, visualScale: 4.1, homing: boss.isFinalGizmo ? 0.012 : 0.007, maxSpeed: speed + 0.55, born: Date.now() });
          }
          addFloatText('GIZMO GLOW!', boss.x, boss.y + boss.r + 18, '#8e55d8', 16);
          SFX.gizmoBark ? SFX.gizmoBark() : (SFX.missionOminous && SFX.missionOminous());
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'laser') {
          boss.laserPhase = 'charging';
          boss.laserChargeStart = Date.now();
          boss.laserX = boss.x;
        } else {
          const count = boss.burstCount || 4;
          for (let k = 0; k < count; k++) {
            const dx = player.x - boss.x, dy = player.y - boss.y;
            const ang = Math.atan2(dy, dx) + (k - (count - 1) / 2) * 0.12;
            const bulletSpeed = 4 + wave * 0.15;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r*0.6, vx: Math.cos(ang)*bulletSpeed, vy: Math.sin(ang)*bulletSpeed, r: 6 });
          }
          SFX.tone && SFX.tone(300,'square',0,0.04,0.08,200);
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        }
      }
      if (boss.laserPhase === 'charging' && Date.now() - boss.laserChargeStart > 700) {
        boss.laserPhase = 'firing';
        boss.laserFireStart = Date.now();
        boss.laserHasHit = false;
      } else if (boss.laserPhase === 'firing') {
        if (!boss.laserHasHit && Math.abs(player.x - boss.laserX) < player.r + 14) {
          takeDamage(20);
          boss.laserHasHit = true;
        }
        if (Date.now() - boss.laserFireStart > 220) {
          boss.laserPhase = null;
          boss.nextAttack = Date.now() + (boss.attackDelay || 2400);
        }
      }
    }

    // Mini-boss: a wave feature, not a takeover (normal spawning is suppressed via
    // asteroidRatio for that wave, not the boss-pause mechanism). GHOST teleports on
    // a cycle and fires ice-flagged shots; EMP holds still and fires zap-flagged shots.
    if (miniBoss) {
      const mb = miniBoss;
      mb.hitFlash = Math.max(0, mb.hitFlash - 0.05);
      if (mb.kind === 'ghost') {
        // Bounces around the upper field continuously while active — "bouncing all
        // over," not just sitting still between teleports.
        if (mb.phase === 'active') {
          mb.x += mb.vx; mb.y += mb.vy;
          if (mb.x < mb.r + 20 || mb.x > W - mb.r - 20) mb.vx *= -1;
          if (mb.y < 80 || mb.y > H * 0.45) mb.vy *= -1;
        }
        if (mb.phase === 'active' && Date.now() > mb.teleportAt) {
          mb.phase = 'vanishing'; mb.phaseStart = Date.now();
          miniExplosion(mb.x, mb.y, '#8855ff');
          SFX.ghostTeleport();
        } else if (mb.phase === 'vanishing') {
          mb.opacity = Math.max(0, 1 - (Date.now() - mb.phaseStart) / 300);
          if (Date.now() - mb.phaseStart > 300) {
            mb.x = rand(mb.r + 20, W - mb.r - 20); mb.y = rand(100, H * 0.4);
            mb.phase = 'appearing'; mb.phaseStart = Date.now();
          }
        } else if (mb.phase === 'appearing') {
          // Flickering, untouchable telegraph — reappearing should never feel like a
          // cheap ambush.
          const t = Date.now() - mb.phaseStart;
          mb.opacity = 0.4 + 0.3 * Math.abs(Math.sin(t * 0.02));
          if (t > 400) { mb.phase = 'active'; mb.opacity = 1; mb.teleportAt = Date.now() + 3000 + Math.random() * 1500; mb.nextAttack = Date.now() + 1400; }
        }
      }
      if (mb.phase === 'active' && Date.now() > mb.nextAttack) {
        const dx = player.x - mb.x, dy = player.y - mb.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const bulletSpeed = 3.2 + wave * 0.3;
        enemyBullets.push({ x: mb.x, y: mb.y + mb.r, vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, r: 5, isIce: mb.kind === 'ghost', isZap: mb.kind === 'emp' });
        mb.nextAttack = Date.now() + 1400;
      }
    }

    bullets=bullets.filter(b=>b.y>-10);
    bullets.forEach(b=>{
      if (_frozen) {
        // Was moving at full normal speed despite the icy snowflake skin implying
        // otherwise — slowed to actually feel cold/sluggish, not just look different.
        b.y += b.vy * 0.4;
        if (b.vx) b.x += b.vx * 0.4;
      } else if (_zapped) {
        // Even floatier and gassier — drifts up slowly with a wide, loose wobble
        // instead of a clean straight shot, on top of dealing 0 damage.
        b.y += b.vy * 0.28;
        b._wob = (b._wob || Math.random()*10) + 0.09;
        b.x += Math.sin(b._wob) * 2.2;
      } else {
        b.y += b.vy;
        if (b.vx) b.x += b.vx;
      }
    });

    // Power-ups: drift down, draw, collect by touch only — bullets pass straight
    // through them. SHOOT is for hostiles, CATCH is for pickups; letting bullets
    // also collect them blurred that distinction. Mystery is the one deliberate
    // exception now — it's a shoot target (ring takes 7 hits to break, then the
    // outcome applies automatically), not something you fly into to catch.
    powerups = powerups.filter(p => p.y < H + 40);
    for (const p of powerups) {
      if (!waveTransitioning) p.y += p.vy;
      // Mystery box drifts under its parachute — a gentle vertical waver on top of
      // the steady fall, not a literal pendulum swing (kept subtle on purpose).
      if (!waveTransitioning && p.type === 'mystery') p.y += Math.sin(Date.now() * 0.003 + p.bob) * 0.4;
      if (!waveTransitioning && p.rotSpeed) p.rot += p.rotSpeed;
      drawPowerup(p);
      if (waveTransitioning) continue;
      if (p.type === 'mystery' && p.ringHp > 0) {
        for (const b of bullets) {
          if (b.vy === 999) continue; // already spent on something else this frame
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r * 1.1) {
            b.vy = 999;
            p.ringHp--;
            if (p.ringHp <= 0) {
              miniExplosion(p.x, p.y, '#cc66ff');
              applyPowerup('mystery');
              p._collected = true;
            } else {
              SFX.score();
            }
            break;
          }
        }
        if (p._collected) continue;
      }
      if (p.type === 'instrument') {
        // One hit and it's gone — pure fun, no ring/HP, just a note + points.
        for (const b of bullets) {
          if (b.vy === 999) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r * 1.1) {
            b.vy = 999;
            score += 20;
            addFloatText('♪ +20', p.x, p.y - 10, '#ffe61a', 18);
            miniExplosion(p.x, p.y, p.kind === 'guitar' ? '#c47a32' : p.kind === 'piano' ? '#f5f3ec' : '#e6ad2e');
            if (p.kind === 'guitar') SFX.guitarNote();
            else if (p.kind === 'piano') SFX.pianoNote();
            else SFX.saxNote();
            p._collected = true;
            break;
          }
        }
        if (p._collected) continue;
      }
      let gotIt = p.type !== 'mystery' && p.type !== 'instrument' && Math.hypot(p.x - player.x, p.y - player.y) < p.r + player.r * 0.9;
      // An active escort can also catch pickups itself, not just the player ship —
      // it's right there next to you, no reason it should be unable to grab one.
      if (!gotIt && p.type !== 'mystery' && p.type !== 'instrument' && escort && escort.state === 'active') {
        gotIt = Math.hypot(p.x - escort.x, p.y - escort.y) < p.r + 16 * 0.9;
      }
      if (gotIt) {
        if (SOCKET_TYPES.includes(p.type)) {
          // Banked, not applied — deployed later by tapping its socket. HP and
          // mystery boxes aren't bankable and keep applying instantly below.
          if (inventory[p.type]) {
            showTopBanner('ALREADY HELD', 'bad');
            SFX.miss();
          } else {
            inventory[p.type] = true;
            showTopBanner(p.type.toUpperCase() + ' ADDED', 'good');
            SFX.powerupCollect();
          }
        } else {
          applyPowerup(p.type, p.type === 'hp' ? p.hpValue : undefined);
        }
        miniExplosion(p.x, p.y, p.type === 'hp' ? '#33ff66' : p.type === 'mystery' ? '#cc66ff' : '#ffe61a');
        p._collected = true;
      }
    }
    powerups = powerups.filter(p => !p._collected);

    obstacles=obstacles.filter(o=>o.y<H+60&&o.x>-60&&o.x<W+60);
    for(const o of obstacles){
      if (o.isDeflected) {
        const elapsed = Date.now() - (o.deflectStart || Date.now());
        const t = Math.min(1, elapsed / (o.deflectDuration || 620));
        o.x += o.vx;
        o.y += o.vy;
        o.vx *= 0.985;
        o.vy *= 0.955;
        o.deflectScale = 1 - t * 0.92;
        if (o.type === 'asteroid') o.rot += (o.deflectSpin || 0.24);
        if (t >= 1) o.alive = false;
        continue;
      }
      // MIRROR ENEMY: hovers at a fixed height and tracks the player's x every frame
      // instead of falling — skips the normal vx/vy movement entirely.
      if (o.isMirror) {
        const targetX = Math.max(o.r, Math.min(W - o.r, player.x + (o.mirrorOffset || 0)));
        o.x += (targetX - o.x) * (o.mirrorEase || 0.12);
        continue;
      }
      o.x+=o.vx;
      if(o.x<o.r&&o.vx<0) o.vx*=-1;
      if(o.x>W-o.r&&o.vx>0) o.vx*=-1;

      // Non-hero enemies pause once, partway down, for a quick burst of fire before
      // resuming their descent — see the note in spawnObstacle() for why.
      if (o.type === 'face' && !o.isTrapped && !o.pausedBurstDone) {
        if (!o.paused && o.y > H * 0.4) {
          o.paused = true; o.pauseUntil = Date.now() + 1000; o.burstShotsLeft = 3; o.lastBurstShot = 0;
        }
        if (o.paused) {
          if (Date.now() > o.pauseUntil) {
            o.paused = false; o.pausedBurstDone = true;
          } else {
            if (o.burstShotsLeft > 0 && Date.now() - o.lastBurstShot > 320) {
              enemyFireAt(o, 1.15);
              o.burstShotsLeft--; o.lastBurstShot = Date.now();
            }
            continue; // hold position while paused
          }
        }
      }

      o.y+=o.vy;
      if(o.type==='asteroid') o.rot+=o.rotSpeed;
    }
    // Danger line crossing — REVERSE flips both which line and which direction
    // counts as "crossed", since obstacles travel upward toward REVERSE_LINE_Y
    // instead of downward toward dangerY.
    const _lineY = waveTheme === 'flip' ? REVERSE_LINE_Y : dangerY;
    for(const o of obstacles){
      if (o.isDeflected) continue;
      const _crossedLine = waveTheme === 'flip' ? o.y < _lineY : o.y > _lineY;
      if(!o._crossed && _crossedLine){
        o._crossed = true;
        o.alive = false;
        lineFlashA = 1.0;
        if(o.type==='asteroid'){
          takeDamage(10);
          bigExplosion(o.x, _lineY, '#aa8855');
          SFX.whack && SFX.whack(); // thud sound
          waveKills++;
        } else if(!o.isTrapped){
          // enemy crosses line — big damage
          takeDamage(30);
          bigExplosion(o.x, _lineY, GAME_CHARS[o.ci].color);
          faceFlash(o.ci, 'sad', o.x, _lineY - 30);
          SFX.miss();
          waveKills++;
        } else {
          // trapped hero crosses line — not gone forever, queued back into the rescue pool
          queueMissionCaptiveRetry(o.ci);
          addFloatText('TRY AGAIN!', o.x, o.y, '#00e5ff', 24);
          faceFlash(o.ci, 'sad', o.x, o.y - 20);
          SFX.miss();
          waveKills++;
        }
        if(state==='over') return;
      }
    }
    obstacles=obstacles.filter(o=>!o._crossed);

    obstacles.forEach(drawObstacle);

    // Draw all bullets in one batch (no per-bullet ctx.save/restore or shadowBlur).
    // FROZEN/ZAPPED are purely cosmetic reskins of the SAME bullets, except zapped
    // bullets also genuinely deal 0 damage (gated below) — the fart skin is the
    // visible reason why, same idea as the snowflake being the tell for the slow.
    // (_frozen/_zapped computed once near the top of loop() and reused throughout.)
    ctx.fillStyle=C('#ffe61a');
    for(const b of bullets){
      if (_frozen) {
        drawIceShard(b.x, b.y, 28, (b._wob || 0) * 0.5, 'rgba(102,221,255,0.72)');
      } else if (_zapped) {
        if (drawProjectileImage('zap', b.x, b.y, 34, b._wob || 0, 'rgba(204,153,255,0.72)')) continue;
        // Hand-drawn puff cluster instead of the emoji glyph — soft translucent
        // greenish-brown blobs, comedic rather than a clean projectile. Bigger and
        // more spread out than a normal bullet — it should read as a cloud, not a shot.
        ctx.save();
        ctx.translate(b.x, b.y);
        const wob = b._wob || 0;
        ctx.fillStyle = 'rgba(150,200,90,0.45)';
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(180,160,90,0.38)';
        ctx.beginPath(); ctx.arc(Math.cos(wob)*14, Math.sin(wob)*10, 12, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-Math.cos(wob)*14, 10, 11, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(150,200,90,0.32)';
        ctx.beginPath(); ctx.arc(Math.sin(wob)*11, -13, 9, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-Math.sin(wob)*12, 4, 7.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(180,160,90,0.28)';
        ctx.beginPath(); ctx.arc(Math.cos(wob*0.7)*16, -4, 7, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      } else if (b.isPizza) {
        if (drawProjectileImage('pizza', b.x, b.y, 27, Math.atan2(b.vy, b.vx) + Math.PI / 2, 'rgba(255,204,68,0.7)')) continue;
        // Hand-drawn pizza slice — wedge and pepperoni dots,
        // rotated to face the direction it's actually flying (the shotgun spread
        // fans out at angles, not just straight up).
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(-7, 8); ctx.lineTo(7, 8); ctx.closePath();
        ctx.fillStyle = '#ffcc44'; ctx.fill();
        ctx.strokeStyle = '#e8a020'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#cc3322';
        ctx.beginPath(); ctx.arc(-2.5, -1, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2.5, 2, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0.5, -4.5, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillRect(b.x-2,b.y-12,4,14);
        ctx.fillStyle='rgba(255,230,26,0.35)'; ctx.fillRect(b.x-4,b.y-14,8,18); // cheap glow
        ctx.fillStyle=C('#ffe61a');
      }
    }

    // Bullet vs boss — skipped entirely while zapped, so "deals 0 damage" is literal.
    if (boss && !_zapped) {
      for (const b of bullets) {
        if (b.vy === 999) continue;
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + 3) {
          if (boss.attackType === 'shield' && Date.now() < (boss.shieldUntil || 0)) {
            b.vy = 999;
            enemyBullets.push({ x: b.x, y: b.y, vx: (b.vx || 0) * 0.35, vy: 5.4 + wave * 0.08, r: 5.5, theme: 'shield' });
            addFloatText('DEFLECTED!', boss.x, boss.y - boss.r - 20, '#c8d4ff', 16);
            miniExplosion(b.x, b.y, '#c8d4ff');
            SFX.powerupCollect && SFX.powerupCollect();
            continue;
          }
          b.vy = 999;
          boss.hp--; boss.hitFlash = 1;
          miniExplosion(b.x, b.y, boss.isCaptive ? '#00e5ff' : '#ff8888');
          if (boss.isCaptive && boss.hp > 0 && boss.hp % 10 === 0) addFloatText('LOCK CRACKING!', boss.x, boss.y - boss.r - 24, '#00e5ff', 16);
          if (boss.hp <= 0) {
            const defeatedBoss = boss;
            const hpGain = Math.round(health * 0.5);
            health = Math.min(100, health + hpGain);
            score += 500 + wave * 20;
            let rescuedCi = -1;
            if ((defeatedBoss.isCaptive || defeatedBoss.guardedRescue) && defeatedBoss.captiveCi >= 0) {
              rescuedCi = defeatedBoss.captiveCi;
              rescueMissionChar(defeatedBoss.captiveCi, defeatedBoss.x, defeatedBoss.y, ' ');
              rescueBanner = null;
            }
            triggerShake(14);
            bigExplosion(defeatedBoss.x, defeatedBoss.y, '#ff4444');
            if (!defeatedBoss.isCaptive) addFloatText(defeatedBoss.isGizmoEscape ? 'GIZMO RETREATS!' : defeatedBoss.isFinalGizmo ? 'GIZMO DOWN!' : 'BOSS DOWN! +500', defeatedBoss.x, defeatedBoss.y, '#ffe61a', 22);
            if (hpGain > 0) addFloatText(`+${hpGain} HP`, defeatedBoss.x, defeatedBoss.y - 30, '#33ff66', 16);
            SFX.win();
            boss = null;
            if (defeatedBoss.isGizmoEscape) {
              showGizmoEscapeBeat(rescuedCi, () => {
                if (state !== 'playing') return;
                if (rescuedCi >= 0) showBossRescueUnlockBeat(rescuedCi, defeatedBoss.creature.name, () => { if (state === 'playing') nextWave(); });
                else nextWave();
              });
            } else if (defeatedBoss.isFinalGizmo) {
              freeAllRemainingMobes();
              showSpaceVictoryBriefing(() => { if (state === 'playing') nextWave(); });
            } else if (rescuedCi >= 0) {
              showBossDefeatedBeat(defeatedBoss.creature.name, defeatedBoss.x, defeatedBoss.y, () => {
                if (state !== 'playing') return;
                showBossRescueUnlockBeat(rescuedCi, defeatedBoss.creature.name, () => { if (state === 'playing') nextWave(); });
              });
            } else if (!defeatedBoss.isCaptive) {
              showBossDefeatedBeat(defeatedBoss.creature.name, defeatedBoss.x, defeatedBoss.y);
            }
            break;
          } else {
            SFX.hit();
          }
        }
      }
    }

    // Bullet vs mini-boss
    if (miniBoss && !_zapped && miniBoss.phase === 'active') {
      for (const b of bullets) {
        if (b.vy === 999) continue;
        if (Math.hypot(b.x - miniBoss.x, b.y - miniBoss.y) < miniBoss.r + 3) {
          b.vy = 999;
          miniBoss.hp--; miniBoss.hitFlash = 1;
          miniExplosion(b.x, b.y, '#ff8888');
          SFX.miniBossHit();
          if (miniBoss.hp <= 0) {
            score += 150 + wave * 10;
            bigExplosion(miniBoss.x, miniBoss.y, '#ff4444');
            ticketConfetti(true);
            addFloatText('MINI-BOSS DOWN!', miniBoss.x, miniBoss.y, '#ffe61a', 20);
            SFX.miniBossDown();
            miniBoss = null;
            break;
          }
        }
      }
    }

    if (!_zapped) for(const b of bullets){
      for(const o of obstacles){
        if(o.alive===false) continue;
        const hitRadius = (o.type==='face' && o.isTrapped && o.ringHp > 0) ? o.r+12 : o.r+3;
        if(Math.hypot(b.x-o.x,b.y-o.y)<hitRadius){
          b.vy=999;
          if(o.type==='face'){
            if(o.isTrapped && o.ringHp > 0){
              // Hit the rescue ring
              o.ringHp--;
              if(o.ringHp <= 0){
                // Ring destroyed — rescued! Becomes a temporary escort (cap 1 — rescuing
                // again just replaces/refreshes it with the newest hero, no stacking).
                score += 150; waveKills++;
                o.alive=false;
                SFX.win();
                miniExplosion(o.x,o.y,'#00e5ff');
                rescueMissionChar(o.ci, o.x, o.y, '+150 RESCUED!');
                const hpGain = Math.min(30, 100 - health);
                if(hpGain > 0){ health = Math.min(100, health + 30); addFloatText(`+${hpGain} HP`, o.x, o.y - 30, '#33ff66', 18); }
              } else {
                addFloatText('RING HIT!', o.x, o.y, '#00e5ff', 18);
                SFX.score();
                b.vy=999; // bullet spent but obstacle survives
              }
            } else if(o.isTrapped && o.ringHp === 0){
              // Ring already destroyed but player shot the face — penalty!
              SFX.miss();
              o.alive=false;
              addFloatText('OOPS!', o.x, o.y, '#ff4444', 24);
              miniExplosion(o.x, o.y, '#ff4444');
              faceFlash(o.ci,'sad',o.x,o.y);
              takeDamage(30);
              if(state==='over') return;
            } else {
              // Normal enemy face — takes 3 hits to clear
              o.hp--;
              if (o.hp > 0) {
                SFX.hit();
                miniExplosion(o.x, o.y, 'rgba(255,255,255,0.7)'); // hurt flicker, not destroyed yet
                addFloatText('HIT!', o.x, o.y - 14, '#ffffff', 14);
              } else {
                const pts = 25+(wave*5);
                score+=pts; SFX.score();
                miniExplosion(o.x,o.y,GAME_CHARS[o.ci].color);
                faceFlash(o.ci,'sad',o.x,o.y);
                addFloatText('+'+pts, o.x, o.y, GAME_CHARS[o.ci].color, 18);
                waveKills++;
                o.alive=false;
              }
            }
          } else {
            // Asteroid
            const pts = 10+(wave*2);
            score+=pts; SFX.hit();
            miniExplosion(o.x,o.y,'#7a6a90');
            if(o.r > 22 && currentCfg){
              for(let s=0; s<2; s++){
                obstacles.push({
                  type:'asteroid', alive:true,
                  x: o.x + (s===0?-1:1)*o.r*0.5, y: o.y,
                  vx: (Math.random()-0.5)*currentCfg.speed*1.8,
                  vy: currentCfg.speed*(0.6+Math.random()*0.4),
                  r: o.r*0.52,
                  verts: Array.from({length:6},(_,i)=>{
                    const a=(i/6)*Math.PI*2; const rr=o.r*0.52*(0.7+Math.random()*0.3);
                    return [Math.cos(a)*rr, Math.sin(a)*rr];
                  }),
                  rot:0, rotSpeed:(Math.random()-0.5)*0.06, hp:1,
                  shadeSeed: Math.random() * 1000,
                  rockStyle: o.rockStyle == null ? Math.floor(Math.random() * 3) : o.rockStyle
                });
              }
            }
            waveKills++;
            o.alive=false;
          }
          break;
        }
      }
    }
    obstacles=obstacles.filter(o=>o.alive!==false);
    bullets=bullets.filter(b=>b.vy!==999);

    // REVERSE: obstacles spawn right next to the ship and immediately retreat
    // upward — they're not "attacking" by being close, so simple contact doesn't
    // hurt here. Shooting them (still works normally, bullets pass right through
    // this check) is the only way they actually do anything to the player.
    if (waveTheme !== 'flip') {
      for(const o of obstacles){
        if(Math.hypot(o.x-player.x,o.y-player.y)<o.r+player.r*0.7){
          if (Date.now() < buffShieldUntil && shieldDeflectObstacle(o)) {
            continue;
          }
          o.alive=false; SFX.miss();
          takeDamage(o.type==='face' ? 30 : 15);
          if(state==='over') return;
        }
      }
      obstacles=obstacles.filter(o=>o.alive!==false);
    }

    // Wave ends naturally once the spawn pool is exhausted, the board has cleared,
    // AND every falling powerup has resolved (caught, broken, or fallen off-screen)
    // — no forced wipe, and nothing is still visibly falling once the wave-transition
    // announcement covers the screen.
    if (spawnsRemaining <= 0 && obstacles.length === 0 && powerups.length === 0 && !boss && !miniBoss && !mirrorSequenceActive && state === 'playing') {
      nextWave();
    }

    // Enemy fire ramps by campaign tier, not raw wave flood. Later chapters ask for
    // better dodging and target priority, but keep a readable cadence on mobile.
    const fireTier = currentCfg ? currentCfg.tier : campaignTier(wave);
    if(Date.now() - lastEnemyFire > Math.max(420, 1280 - fireTier * 125 - Math.min(wave, 12) * 28 - Math.max(0, wave - 18) * 35)){
      const shooters = obstacles.filter(o => o.type==='face' && !o.isTrapped && o.y > 0);
      if(shooters.length > 0){
        const numShots = Math.min(shooters.length, 1 + Math.floor(fireTier / 2) + Math.floor(Math.max(0, wave - 14) / 7));
        const chosen = shooters.map(s => [Math.random(), s]).sort((a,b) => a[0]-b[0]).slice(0, numShots).map(p => p[1]);
        chosen.forEach(shooter => enemyFireAt(shooter, 1));
        lastEnemyFire = Date.now();
        SFX.tone && SFX.tone(420, 'square', 0, 0.03, 0.08, 280);
      }
    }
    enemyBullets.forEach(b => {
      const now = Date.now();
      if (!b.born) b.born = now;
      const age = now - b.born;
      if (b.gravity) b.vy += b.gravity;
      if (b.homing && player) {
        const dxh = player.x - b.x, dyh = player.y - b.y;
        const dist = Math.hypot(dxh, dyh) || 1;
        b.vx += (dxh / dist) * b.homing;
        b.vy += (dyh / dist) * b.homing;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const maxSp = b.maxSpeed || 4.2;
        if (sp > maxSp) { b.vx = (b.vx / sp) * maxSp; b.vy = (b.vy / sp) * maxSp; }
      }
      if (b.boomerang && age > 360 && boss) {
        b.vx += Math.max(-0.08, Math.min(0.08, (boss.x - b.x) * b.boomerang));
      }
      if (b.waveAmp) {
        b.x += Math.sin(age * (b.waveFreq || 0.012) + (b.phase || 0)) * b.waveAmp;
      }
      if (b.splitAt && !b.splitDone && age > b.splitAt) {
        b.splitDone = true;
        const base = Math.atan2(b.vy, b.vx || 0);
        const speed = b.splitSpeed || 2.4;
        [-0.34, 0.34].forEach(off => {
          const ang = base + off;
          enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: Math.max(4.2, (b.r || 6) * 0.72), theme: b.splitTheme || b.theme, born: now });
        });
      }
      b.x += b.vx; b.y += b.vy;
      if (b.theme) {
        ctx.save();
        ctx.translate(b.x, b.y);
        const rot = Math.atan2(b.vy, b.vx || 0) + Math.PI / 2;
        ctx.rotate(rot);
        const rr = b.r || 5;
        if (drawProjectileImage(b.theme, 0, 0, rr * (b.theme === 'donkey' ? 4.1 : b.theme === 'sombrero' ? 4.4 : b.theme === 'fish' ? 3.7 : 3.5), 0, null)) {
          // PNG projectile handled.
        } else if (b.theme === 'donkey') {
          ctx.fillStyle = '#9a7a55'; ctx.fillRect(-rr*0.9, -rr*0.35, rr*1.8, rr*0.95);
          ctx.beginPath(); ctx.moveTo(-rr*0.9,-rr*0.3); ctx.lineTo(-rr*1.45,-rr*0.95); ctx.lineTo(-rr*0.3,-rr*0.55); ctx.fill();
          ctx.fillStyle = '#2a1a10'; ctx.fillRect(-rr*0.35, rr*0.05, rr*0.22, rr*0.85); ctx.fillRect(rr*0.35, rr*0.05, rr*0.22, rr*0.85);
        } else if (b.theme === 'fire') {
          ctx.beginPath(); ctx.moveTo(0,-rr*1.7); ctx.bezierCurveTo(rr*1.2,-rr*0.5,rr*0.6,rr*1.1,0,rr*1.4); ctx.bezierCurveTo(-rr*0.9,rr*0.7,-rr*1.1,-rr*0.4,0,-rr*1.7); ctx.fillStyle = '#ff5a00'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0,-rr); ctx.bezierCurveTo(rr*0.5,-rr*0.2,rr*0.25,rr*0.6,0,rr*0.85); ctx.bezierCurveTo(-rr*0.45,rr*0.35,-rr*0.5,-rr*0.2,0,-rr); ctx.fillStyle = '#ffe61a'; ctx.fill();
        } else if (b.theme === 'greenOrb') {
          ctx.beginPath(); ctx.arc(0,0,rr*1.25,0,Math.PI*2); ctx.fillStyle='rgba(51,255,102,0.25)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,0,rr,0,Math.PI*2); ctx.fillStyle='#33ff66'; ctx.fill();
        } else if (b.theme === 'fish') {
          ctx.beginPath(); ctx.ellipse(0,0,rr*1.25,rr*0.62,0,0,Math.PI*2); ctx.fillStyle='#5ab1ff'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0,rr*0.35); ctx.lineTo(-rr*0.9,rr*1.0); ctx.lineTo(-rr*0.45,0); ctx.lineTo(-rr*0.9,-rr*1.0); ctx.closePath(); ctx.fillStyle='#2f8fb8'; ctx.fill();
          ctx.fillStyle='#031018'; ctx.beginPath(); ctx.arc(rr*0.55,-rr*0.12,rr*0.15,0,Math.PI*2); ctx.fill();
        } else if (b.theme === 'sombrero') {
          ctx.beginPath(); ctx.ellipse(0,rr*0.2,rr*1.65,rr*0.45,0,0,Math.PI*2); ctx.fillStyle='#d99a2b'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,-rr*0.05,rr*0.72,Math.PI,0); ctx.fillStyle='#fff4c8'; ctx.fill();
          ctx.strokeStyle='#cc3322'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-rr*1.1,rr*0.2); ctx.lineTo(rr*1.1,rr*0.2); ctx.stroke();
        } else if (b.theme === 'ink') {
          ctx.fillStyle='rgba(35,18,54,0.86)';
          for (const [ix,iy,ir] of [[0,0,1.15],[-0.6,0.35,0.72],[0.65,0.25,0.62],[0.1,-0.55,0.55]]) { ctx.beginPath(); ctx.arc(ix*rr,iy*rr,ir*rr,0,Math.PI*2); ctx.fill(); }
        } else if (b.theme === 'shield') {
          ctx.beginPath(); ctx.moveTo(0,-rr*1.35); ctx.lineTo(rr, -rr*0.45); ctx.lineTo(rr*0.72, rr*1.1); ctx.lineTo(0, rr*1.45); ctx.lineTo(-rr*0.72, rr*1.1); ctx.lineTo(-rr, -rr*0.45); ctx.closePath(); ctx.fillStyle='#c8d4ff'; ctx.fill(); ctx.strokeStyle='#4d5f99'; ctx.lineWidth=1.5; ctx.stroke();
        }
        ctx.restore();
      } else {
        const specialType = b.isLock ? 'lock' : b.isIce ? 'ice' : b.isZap ? 'zap' : null;
        if (specialType) {
          const rot = Math.atan2(b.vy, b.vx || 0) + Math.PI / 2;
          const glow = b.isLock ? 'rgba(0,229,255,0.75)' : b.isIce ? 'rgba(160,220,255,0.75)' : 'rgba(204,153,255,0.72)';
          drawProjectileImage(specialType, b.x, b.y, (b.r || 5) * (b.visualScale || 3.4), rot, glow);
        } else {
          // Longer, thinner streak — reads as a directional bullet rather than a round
          // drifting rock. Halo + core kept small so it doesn't puff back out into
          // looking like an asteroid.
          const bSpeed = Math.hypot(b.vx, b.vy) || 1;
          const tailLen = (b.r||4) * 6;
          const tx = b.x - (b.vx/bSpeed)*tailLen, ty = b.y - (b.vy/bSpeed)*tailLen;
          const tailGrad = ctx.createLinearGradient(b.x, b.y, tx, ty);
          tailGrad.addColorStop(0, b.isLock ? 'rgba(0,229,255,0.86)' : 'rgba(255,90,90,0.8)');
          tailGrad.addColorStop(1, b.isLock ? 'rgba(0,229,255,0)' : 'rgba(255,68,68,0)');
          ctx.strokeStyle = tailGrad; ctx.lineWidth = (b.r||4)*0.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
          // halo + core without shadowBlur — red, more visible
          ctx.beginPath(); ctx.arc(b.x, b.y, (b.r||4)+2.5, 0, Math.PI*2);
          ctx.fillStyle = b.isLock ? 'rgba(0,229,255,0.42)' : 'rgba(255,80,80,0.4)'; ctx.fill();
          ctx.beginPath(); ctx.arc(b.x, b.y, (b.r||4)*0.85, 0, Math.PI*2);
          ctx.fillStyle = b.isLock ? '#00e5ff' : '#ff6666'; ctx.fill();
          ctx.beginPath(); ctx.arc(b.x, b.y, (b.r||4)*0.25, 0, Math.PI*2);
          ctx.fillStyle='rgba(255,255,255,0.43)'; ctx.fill();
        }
      }
      const dx=b.x-player.x, dy=b.y-player.y;
      if(Math.sqrt(dx*dx+dy*dy) < (b.r||4) + player.r*0.8){
        b._hit=true;
        if (b.isIce) {
          buffFrozenUntil = Date.now() + 5000;
          addFloatText('FROZEN!', player.x, player.y - 40, '#66ddff', 18);
          SFX.freeze();
        } else if (b.isZap) {
          buffZappedUntil = Date.now() + 5000;
          addFloatText('FARTED!', player.x, player.y - 40, '#cc99ff', 18);
          SFX.emp();
        } else if (b.isLock) {
          addFloatText('LOCK HIT!', player.x, player.y - 40, '#00e5ff', 16);
          SFX.miss();
          takeDamage(7);
        } else if (b.splat || b.theme === 'ink') {
          bossInkBlindUntil = Date.now() + 2400;
          addFloatText('INKED!', player.x, player.y - 40, '#ff76d2', 18);
          SFX.neonOn && SFX.neonOn();
          takeDamage(5);
        } else {
          SFX.miss();
          takeDamage(5);
        }
      }
    });
    enemyBullets = enemyBullets.filter(b => !b._hit && b.y < H + 20 && b.y > -20 && b.x > -20 && b.x < W + 20);
    if(state==='over') return;

    // Float texts
    floatTexts = floatTexts.filter(t => t.a > 0.02);
    floatTexts.forEach(t => {
      t.y += t.vy; t.a -= 0.02;
      ctx.save();
      ctx.globalAlpha = t.a;
      ctx.font = `bold ${t.size}px 'Bebas Neue', cursive`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });

    // Danger line — no shadowBlur; use a wider semi-transparent halo line instead.
    // Drawn at the actual danger boundary, which has been moved down while the
    // sockets remain anchored to their original line.
    const _renderLineY = waveTheme === 'flip' ? REVERSE_LINE_Y : dangerY;
    if (lineFlashA > 0) lineFlashA = Math.max(0, lineFlashA - 0.04);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -(Date.now() / 90) % 11;
    // halo
    ctx.beginPath(); ctx.moveTo(0, _renderLineY); ctx.lineTo(W, _renderLineY);
    ctx.strokeStyle = `rgba(51,255,100,${(0.28 + lineFlashA * 0.62) * 0.35})`;
    ctx.lineWidth = 6 + lineFlashA * 4;
    ctx.stroke();
    // core line
    ctx.beginPath(); ctx.moveTo(0, _renderLineY); ctx.lineTo(W, _renderLineY);
    ctx.strokeStyle = `rgba(51,255,100,${0.28 + lineFlashA * 0.62})`;
    ctx.lineWidth = 1.5 + lineFlashA;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (boss) drawBoss();
    if (miniBoss) drawMiniBoss();
    drawPlayer();
    if (twin) drawTwin();
    if (rebound) drawRebound();
    if (escort) drawEscort();
    // BLACKOUT: a radial-gradient vignette drawn over everything — nearly opaque
    // dark except a small clear radius around the ship, so vision is the actual
    // gameplay constraint rather than a new spawn/damage rule.
    if (waveTheme === 'blackout' && Date.now() > themeEffectsAt) {
      const grad = ctx.createRadialGradient(player.x, player.y, player.r*3, player.x, player.y, player.r*8.4); // spotlight enlarged 20%
      grad.addColorStop(0, 'rgba(3,1,16,0)');
      grad.addColorStop(1, 'rgba(3,1,16,0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    if (Date.now() < bossInkBlindUntil) {
      const a = Math.min(0.82, (bossInkBlindUntil - Date.now()) / 2400 * 0.72);
      const inkGrad = ctx.createRadialGradient(player.x, player.y, player.r * 2.1, player.x, player.y, player.r * 7.2);
      inkGrad.addColorStop(0, `rgba(24,8,42,${a * 0.18})`);
      inkGrad.addColorStop(0.58, `rgba(28,12,48,${a * 0.62})`);
      inkGrad.addColorStop(1, `rgba(6,1,14,${a})`);
      ctx.fillStyle = inkGrad;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore(); // undo shake before HUD — text should stay stable/readable
    drawHUD();
    drawCaptiveObjectiveHUD();
    drawSockets();
    drawRescueBanner();
    drawTopBanner();
  }

  // Unified callout for every power/advantage/HP event — one consistent place to
  // look instead of scattered popups (ship-position float text, socket flashes,
  // full-screen banners), which is exactly the "everything flying at me" chaos this
  // is meant to cut down on. Drawn last so it visually covers the score/wave row
  // for its duration. Same cyan/red as the hero ring / enemy reticle, same glowing
  // Bebas Neue language as the intro objective text. Fades in and out rather than
  // snapping on/off — reads as "appearing," not a flash.
  let topBanner = null;
  const TOP_BANNER_FADE_IN = 220, TOP_BANNER_HOLD = 700, TOP_BANNER_FADE_OUT = 380;
  function showTopBanner(text, kind) {
    topBanner = {
      text,
      color: kind === 'bad' ? '#ff4444' : '#00e5ff',
      startedAt: Date.now(),
    };
  }
  function drawTopBanner() {
    if (!topBanner) return;
    const elapsed = Date.now() - topBanner.startedAt;
    const total = TOP_BANNER_FADE_IN + TOP_BANNER_HOLD + TOP_BANNER_FADE_OUT;
    if (elapsed > total) { topBanner = null; return; }
    let a;
    if (elapsed < TOP_BANNER_FADE_IN) a = elapsed / TOP_BANNER_FADE_IN;
    else if (elapsed < TOP_BANNER_FADE_IN + TOP_BANNER_HOLD) a = 1;
    else a = 1 - (elapsed - TOP_BANNER_FADE_IN - TOP_BANNER_HOLD) / TOP_BANNER_FADE_OUT;
    const c = topBanner.color;
    ctx.save();
    ctx.globalAlpha = a;
    // Solid enough to actually obscure what's happening underneath, on purpose —
    // half-visible motion through a translucent banner read as more confusing than
    // just hiding it for the brief moment the banner is up.
    ctx.fillStyle = '#0a0418';
    ctx.fillRect(0, 0, W, 54);
    ctx.fillStyle = c + '33';
    ctx.fillRect(0, 0, W, 54);
    ctx.shadowColor = c; ctx.shadowBlur = 20;
    ctx.fillStyle = c;
    ctx.font = `38px 'Bebas Neue', cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(topBanner.text, W / 2, 28);
    ctx.restore();
  }

  // Left-edge inventory sockets — dim/gray glyph when empty, full-color when holding
  // one (max 1 per type). Tapping/clicking a filled socket deploys it (see
  // deploySocket/hitSocket above); empty sockets just sit there as a placeholder.
  function drawSockets() {
    SOCKET_TYPES.forEach((type, i) => {
      const r = socketRect(i);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = r.w / 2;
      const held = inventory[type];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fillStyle = held ? '#1a1530' : 'rgba(120,120,130,0.08)'; ctx.fill();
      ctx.strokeStyle = held ? SOCKET_COLOR[type] : 'rgba(150,150,160,0.35)';
      ctx.lineWidth = held ? 2.5 : 2;
      ctx.stroke();
      if (!held) ctx.globalAlpha = 0.45;
      const socketImgType = type === 'shield' ? 'powerShield' : type === 'gun' ? 'gun' : type === 'bomb' ? 'bomb' : null;
      if (socketImgType && drawProjectileImage(socketImgType, 0, 0, rad * 1.35, 0, held ? SOCKET_COLOR[type] : null, true, !held)) {
        // PNG icon handled.
      } else if (type === 'shield') {
        const hr = rad * 0.6;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 3;
          const x = Math.cos(a) * hr, y = Math.sin(a) * hr;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = held ? SOCKET_COLOR.shield : 'rgba(150,150,160,0.5)';
        ctx.fill();
      } else {
        ctx.font = `${rad * 1.1}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = held ? '#fff' : 'rgba(150,150,160,0.5)';
        ctx.fillText(SOCKET_GLYPH[type], 0, 1);
      }
      ctx.restore();
    });
  }

  // Renders a half-grid sprite mirrored into a full symmetric sprite, centered at
  // (cx, cy) and scaled to fit within `size`. The +0.6 padding on each block avoids
  // thin seam lines between adjacent pixels that canvas anti-aliasing can otherwise
  // leave when rects are placed edge-to-edge.
  function drawPixelSprite(rows, palette, cx, cy, size) {
    const halfCols = rows[0].length;
    const totalCols = halfCols * 2;
    const totalRows = rows.length;
    const px = size / totalCols;
    const startX = cx - size / 2, startY = cy - (totalRows * px) / 2;
    for (let r = 0; r < totalRows; r++) {
      const rowStr = rows[r];
      for (let c = 0; c < halfCols; c++) {
        const ch = rowStr[c];
        if (ch === '.' || !palette[ch]) continue;
        ctx.fillStyle = palette[ch];
        ctx.fillRect(startX + c * px, startY + r * px, px + 0.6, px + 0.6);
        const mirroredCol = totalCols - 1 - c;
        ctx.fillRect(startX + mirroredCol * px, startY + r * px, px + 0.6, px + 0.6);
      }
    }
  }

  function drawBossPngImage(creature, size, options) {
    const name = creature && creature.name;
    const src = BOSS_IMAGE_SRC[name];
    if (!src) return false;
    const img = _getImg(src);
    if (!img.complete || !img.naturalWidth) return false;
    options = options || {};
    const t = Date.now() * 0.004;
    const activeBoss = boss && boss.creature && boss.creature.name === name;
    const attacking = options.attacking !== undefined ? options.attacking : (activeBoss && Date.now() > (boss.nextAttack || 0) - 760);
    const glow = BOSS_GLOW[name] || { main: '#fff', alt: '#00e5ff' };
    const bob = options.still ? 0 : Math.sin(t * 1.7) * size * 0.018;
    const breathe = 1 + Math.sin(t * 2.2) * 0.025 + (attacking ? 0.035 : 0);
    const ringR = size * 0.55;
    const drawSize = size * (BOSS_IMAGE_SCALE[name] || 1);
    const offset = BOSS_IMAGE_OFFSET[name] || { x: 0, y: 0 };

    ctx.save();
    ctx.translate(0, bob);
    ctx.scale(breathe, breathe);
    ctx.rotate(Math.sin(t * 1.25) * (attacking ? 0.035 : 0.014));

    ctx.save();
    ctx.rotate(t * (attacking ? 0.68 : 0.28));
    ctx.shadowColor = glow.main;
    ctx.shadowBlur = size * 0.22;
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `${glow.main}55`; ctx.lineWidth = Math.max(5, size * 0.085); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0, 0, ringR * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = `${glow.alt}cc`; ctx.lineWidth = Math.max(1.5, size * 0.025); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + t * 1.05;
      ctx.fillStyle = k % 2 ? glow.alt : glow.main;
      ctx.beginPath(); ctx.arc(Math.cos(a) * ringR * 0.98, Math.sin(a) * ringR * 0.98, Math.max(2, size * 0.035), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.shadowColor = glow.main;
    ctx.shadowBlur = size * 0.12;
    ctx.drawImage(img, -drawSize / 2 + offset.x * size, -drawSize / 2 + offset.y * size, drawSize, drawSize);
    ctx.restore();
    return true;
  }

  function drawGizmoOrb(size) {
    if (drawBossPngImage({ name: 'GIZMO', isGizmo: true }, size)) return;
    const t = Date.now() * 0.004;
    ctx.save();
    ctx.scale(size / 118, size / 118);
    const bob = Math.sin(t * 1.7) * 2.2;
    ctx.translate(0, bob);

    // PS1-ish boss language: chunky faceted plates, hard color bands, and glow.
    ctx.save();
    ctx.rotate(t * 0.22);
    ctx.beginPath(); ctx.arc(0, 0, 61, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(187,116,255,0.22)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 57, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(142,85,216,0.78)'; ctx.lineWidth = 2.6; ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = t * 0.8 + k * Math.PI / 2;
      ctx.fillStyle = k % 2 ? '#f2e2bd' : '#b987ff';
      ctx.beginPath(); ctx.arc(Math.cos(a) * 57, Math.sin(a) * 57, 3.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Chunky poodle tufts made of low-poly cream rocks, with subtle bobbing.
    const puffColors = ['#fff8e8', '#efe1c4', '#c8b592', '#8c7457'];
    const tufts = [[-46,-13,22],[-53,11,18],[-35,25,14],[46,-13,22],[53,11,18],[35,25,14],[0,-50,22],[-18,-43,15],[18,-43,15]];
    tufts.forEach(([x,y,r], idx) => {
      const yy = y + Math.sin(t * 1.3 + idx) * 1.7;
      ctx.beginPath();
      for (let p = 0; p < 7; p++) {
        const a = -Math.PI / 2 + p * Math.PI * 2 / 7;
        const rr = r * (0.74 + ((p + idx) % 3) * 0.1);
        const px = x + Math.cos(a) * rr, py = yy + Math.sin(a) * rr;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = puffColors[idx % puffColors.length]; ctx.fill();
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 3; ctx.stroke();
    });

    // Twitching back tuft, not a ring/earring.
    ctx.save();
    ctx.translate(52, 28);
    ctx.rotate(Math.sin(t * 2.2) * 0.18);
    ctx.beginPath(); ctx.moveTo(-4,-8); ctx.lineTo(18,-4); ctx.lineTo(11,8); ctx.lineTo(-7,9); ctx.closePath();
    ctx.fillStyle = '#fff8e8'; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();

    // Faceted white/purple body: mostly poodle-white, with purple energy in the shadows.
    const bodyGrad = ctx.createRadialGradient(-18, -20, 4, 0, 0, 58);
    bodyGrad.addColorStop(0, '#fff7e6');
    bodyGrad.addColorStop(0.34, '#f4e9ff');
    bodyGrad.addColorStop(0.68, '#8e55d8');
    bodyGrad.addColorStop(1, '#19042e');
    ctx.beginPath();
    [[0,-49],[33,-39],[50,-12],[42,26],[16,48],[-22,44],[-47,14],[-42,-25],[-17,-48]].forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fillStyle = bodyGrad; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#8e55d8'; ctx.lineWidth = 2; ctx.stroke();

    const facets = [
      [[0,-49],[33,-39],[10,-7],[-13,-13],'rgba(255,248,232,0.58)'],
      [[33,-39],[50,-12],[18,8],[10,-7],'rgba(142,85,216,0.38)'],
      [[50,-12],[42,26],[13,20],[18,8],'rgba(55,12,96,0.5)'],
      [[-47,14],[-42,-25],[-13,-13],[-20,21],'rgba(255,248,232,0.24)'],
      [[-22,44],[16,48],[13,20],[-20,21],'rgba(70,23,120,0.42)'],
    ];
    facets.forEach(poly => {
      ctx.beginPath();
      poly.slice(0, -1).forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      ctx.closePath(); ctx.fillStyle = poly[poly.length - 1]; ctx.fill();
    });

    // Meaner almond eyes: heavier sockets, sharper brows, tiny gold irises.
    ctx.fillStyle = '#120818';
    ctx.beginPath(); ctx.ellipse(-18, -9, 9.4, 5.3, -0.34, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, -8, 9.4, 5.3, 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c78f1e';
    ctx.beginPath(); ctx.ellipse(-17.6, -8.8, 2.7, 3.8, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(15.8, -8, 2.7, 3.8, 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-31, -22); ctx.lineTo(-8, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(29, -21); ctx.lineTo(7, -12); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-29, -17); ctx.lineTo(-11, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -16); ctx.lineTo(9, -10); ctx.stroke();
    ctx.fillStyle = '#170025';
    ctx.beginPath(); ctx.arc(-17.6, -8.8, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(15.8, -8, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,245,210,0.65)';
    ctx.beginPath(); ctx.arc(-18.8, -10.3, 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14.6, -9.4, 0.75, 0, Math.PI * 2); ctx.fill();
    // Faceted dog snout: side-pointed Crash-ish muzzle + black dog nose.
    const sniff = Math.sin(t * 3.1) * 1.2;
    ctx.beginPath();
    ctx.moveTo(-14, 3); ctx.lineTo(-4, -1); ctx.lineTo(8, 0 + sniff); ctx.lineTo(25, 6 + sniff);
    ctx.lineTo(22, 17); ctx.lineTo(9, 24); ctx.lineTo(-6, 22); ctx.lineTo(-14, 15); ctx.closePath();
    ctx.fillStyle = '#d8c6a0'; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,223,0.36)';
    ctx.beginPath(); ctx.moveTo(-12, 5); ctx.lineTo(8, 0 + sniff); ctx.lineTo(3, 13); ctx.lineTo(-9, 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(109,90,70,0.42)';
    ctx.beginPath(); ctx.moveTo(8, 0 + sniff); ctx.lineTo(24, 7 + sniff); ctx.lineTo(21, 17); ctx.lineTo(9, 24); ctx.lineTo(3, 13); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, 2 + sniff); ctx.lineTo(26, 6 + sniff); ctx.lineTo(22, 13 + sniff); ctx.lineTo(11, 12 + sniff); ctx.closePath();
    ctx.fillStyle = '#050208'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.beginPath(); ctx.ellipse(15, 4 + sniff, 2.1, 1.1, -0.25, 0, Math.PI * 2); ctx.fill();
    // Bitey mouth: dark wedge with jagged teeth, like he might snap at the player.
    ctx.beginPath();
    ctx.moveTo(-18, 25); ctx.quadraticCurveTo(1, 18, 25, 24); ctx.lineTo(19, 34); ctx.quadraticCurveTo(1, 39, -15, 34); ctx.closePath();
    ctx.fillStyle = '#09030d'; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#fff8e8';
    [[-12,25,-8,33,-4,24],[0,22,4,34,8,23],[13,24,17,32,21,24]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }

  function drawThemedBoss(creature, size) {
    if (drawBossPngImage(creature, size)) return;
    const s = size / 118;
    ctx.save();
    ctx.scale(s, s);
    const name = creature.name;
    const t = Date.now() * 0.004;
    const activeBoss = boss && boss.creature && boss.creature.name === name;
    const attacking = activeBoss && Date.now() > (boss.nextAttack || 0) - 760;
    const pulse = 1 + Math.sin(t * 2.2) * 0.025;
    ctx.scale(pulse, pulse);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    function poly(points, fill, stroke, lw) {
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke(); }
    }
    function openPoly(points, stroke, lw) {
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke();
    }
    function bossAura(c1, c2) {
      const g = ctx.createRadialGradient(-12, -20, 3, 0, 0, 64);
      g.addColorStop(0, c1);
      g.addColorStop(0.55, c2);
      g.addColorStop(1, '#080012');
      ctx.shadowColor = c1; ctx.shadowBlur = 18; ctx.fillStyle = g;
    }
    function facet(points, fill) { poly(points, fill, null, 0); }
    function meanEyes(color, y) {
      y = y || -9;
      ctx.fillStyle = '#110816';
      ctx.beginPath(); ctx.ellipse(-17, y, 9, 5.4, -0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(17, y, 9, 5.4, 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color || '#ffe61a';
      ctx.beginPath(); ctx.ellipse(-16.6, y, 3, 3.8, -0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16.6, y, 3, 3.8, 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#100515';
      ctx.beginPath(); ctx.arc(-16.6, y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(16.6, y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-30, y - 13); ctx.lineTo(-8, y - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, y - 13); ctx.lineTo(8, y - 5); ctx.stroke();
    }
    function teeth(points) {
      ctx.fillStyle = '#fff8e8';
      points.forEach(p => poly([[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]], '#fff8e8', null, 0));
    }
    function orbitGlow(color) {
      ctx.save();
      ctx.rotate(t * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.restore();
    }

    if (name === 'STAR OGRE') {
      bossAura('#b7ff68', '#365b24');
      poly([[-34,-35],[10,-42],[40,-20],[43,23],[15,47],[-26,42],[-47,10]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[-34,-35],[10,-42],[-4,-8],[-35,2]], 'rgba(190,255,115,0.34)');
      facet([[10,-42],[40,-20],[12,-4],[-4,-8]], 'rgba(44,92,31,0.42)');
      facet([[-47,10],[-35,2],[-18,35],[-36,31]], 'rgba(255,255,190,0.14)');
      const earWob = Math.sin(t * 2.1) * 3;
      [[-24,-49,-36,-71], [24,-49,36,-71]].forEach(([x1,y1,x2,y2], idx) => {
        const tipX = x2 + (idx ? 1 : -1) * earWob;
        openPoly([[x1,y1],[tipX,y2]], '#170025', 9);
        openPoly([[x1,y1],[tipX,y2]], '#6f9d42', 5);
        ctx.beginPath(); ctx.arc(tipX, y2, 8, 0, Math.PI * 2); ctx.fillStyle = '#8ac957'; ctx.fill(); ctx.strokeStyle = '#170025'; ctx.lineWidth = 3; ctx.stroke();
      });
      meanEyes('#ffe61a', -12);
      poly([[-10,4],[2,-2],[14,4],[12,15],[1,19],[-10,14]], '#b27645', '#170025', 3);
      ctx.fillStyle = '#170025'; ctx.beginPath(); ctx.arc(-3, 7, 2, 0, Math.PI*2); ctx.arc(7, 7, 2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-19,26); ctx.quadraticCurveTo(0,34,21,26); ctx.stroke();
      orbitGlow('rgba(183,255,104,0.42)');
    } else if (name === 'SKY DRAGON') {
      const blink = Math.sin(t * 1.15) > 0.92;
      bossAura('#ffb33d', '#8e1d10');
      poly([[-53,-36],[-24,-52],[17,-45],[43,-25],[64,-4],[69,19],[52,37],[16,41],[-18,29],[-39,4]], ctx.fillStyle, '#170025', 5.8);
      ctx.shadowBlur = 0;
      facet([[-53,-36],[-24,-52],[-15,-18],[-42,-4]], 'rgba(255,178,54,0.42)');
      facet([[-24,-52],[17,-45],[4,-13],[-15,-18]], 'rgba(255,94,22,0.45)');
      facet([[17,-45],[43,-25],[19,-7],[4,-13]], 'rgba(118,26,9,0.42)');
      facet([[43,-25],[69,19],[41,10],[19,-7]], 'rgba(73,12,4,0.42)');
      facet([[-18,29],[16,41],[17,16],[-11,12]], 'rgba(255,190,72,0.28)');
      poly([[-27,-47],[-9,-76],[10,-47]], '#f2aa28', '#3a1608', 4);
      facet([[-18,-48],[-7,-69],[2,-47]], 'rgba(255,230,120,0.38)');
      poly([[12,-46],[32,-71],[45,-33]], '#f5b436', '#3a1608', 4);
      facet([[20,-45],[32,-62],[38,-35]], 'rgba(255,233,128,0.35)');
      poly([[-46,-26],[-73,-39],[-55,-9]], '#3b2a1c', '#170025', 3.2);
      poly([[-49,-6],[-77,2],[-52,18]], '#008f83', '#170025', 3);
      poly([[-44,13],[-67,36],[-34,29]], '#006d65', '#170025', 3);
      [
        [-42,-18,-32,-23,-29,-12],[-21,-28,-9,-34,-6,-22],[18,-31,31,-36,32,-23],
        [-44,0,-33,-5,-30,7],[-28,18,-17,13,-14,24],[7,20,19,14,21,26],
      ].forEach((p, i) => poly([[p[0],p[1]],[p[2],p[3]],[p[4],p[5]]], i % 2 ? 'rgba(255,212,92,0.46)' : 'rgba(255,118,42,0.52)', '#7a1808', 1.2));
      if (blink) {
        openPoly([[5,-14],[24,-15]], '#170025', 5);
      } else {
        ctx.fillStyle = '#07312f'; ctx.beginPath(); ctx.ellipse(15,-13,13,15,0.18,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#25c6a7'; ctx.beginPath(); ctx.ellipse(16,-13,8,11,0.16,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#071015'; ctx.beginPath(); ctx.ellipse(18,-12,4,7,0.05,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff8e8'; ctx.beginPath(); ctx.arc(13,-19,2.7,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#170025'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-2,-25); ctx.quadraticCurveTo(13,-34,35,-23); ctx.stroke();
      }
      poly([[25,-12],[51,-16],[72,-4],[78,13],[64,27],[37,24],[20,10]], '#e85617', '#170025', 4.2);
      facet([[29,-10],[51,-14],[42,3],[23,7]], 'rgba(255,169,54,0.34)');
      facet([[51,-14],[72,-4],[57,7],[42,3]], 'rgba(109,20,8,0.38)');
      ctx.fillStyle = '#120308';
      ctx.beginPath(); ctx.ellipse(55, -2, 3.8, 2.4, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(69, 3, 3.4, 2.1, 0.16, 0, Math.PI * 2); ctx.fill();
      poly([[22,18],[40,27],[68,22],[63,39],[35,48],[18,35]], '#09030d', '#170025', 3);
      teeth([[30,23,35,37,40,24],[48,25,53,39,58,24],[62,23,67,35,72,22]]);
      poly([[45,25],[64,35],[43,42]], '#ff8a00', null, 0);
      poly([[-10,29],[0,51],[16,41]], '#f2aa28', '#170025', 3);
      poly([[-24,20],[-13,47],[0,35]], '#d8871d', '#170025', 2.4);
      orbitGlow('rgba(255,120,40,0.4)');
    } else if (name === 'DARK KNIGHT') {
      bossAura('#c8d4ff', '#20263b');
      poly([[0,-55],[41,-28],[36,35],[16,50],[-19,46],[-39,25],[-34,-28]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[0,-55],[41,-28],[7,-12],[-8,-13]], 'rgba(230,238,255,0.28)');
      facet([[41,-28],[36,35],[13,14],[7,-12]], 'rgba(37,45,67,0.52)');
      facet([[-39,25],[-34,-28],[-8,-13],[-14,18]], 'rgba(200,212,255,0.2)');
      poly([[-29,-12],[29,-12],[25,4],[-25,4]], '#05070d', '#c8d4ff', 2.3);
      for (const x of [-18,-7,4,15]) openPoly([[x,-12],[x,4]], '#c8d4ff', 2);
      const sway = Math.sin(t * 1.9) * 4;
      if (boss && boss.attackType === 'shield' && Date.now() < (boss.shieldUntil || 0)) {
        ctx.save(); ctx.translate(sway, 6);
        poly([[-54,-7],[-30,-29],[-4,-12],[-10,31],[-37,44],[-58,21]], 'rgba(200,212,255,0.28)', '#c8d4ff', 4);
        facet([[-51,-5],[-31,-24],[-25,10],[-51,20]], 'rgba(255,255,255,0.18)');
        openPoly([[-42,-18],[-38,34]], 'rgba(234,242,255,0.48)', 2);
        ctx.restore();
      }
      orbitGlow('rgba(200,212,255,0.32)');
    } else if (name === 'GRAY VISITOR') {
      const wob = Math.sin(t * 10) * 3;
      ctx.translate(wob, Math.cos(t * 8) * 1.5);
      bossAura('#d8ded8', '#4e5854');
      poly([[0,-55],[31,-37],[43,-8],[34,31],[8,54],[-25,42],[-40,6],[-29,-34]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[0,-55],[31,-37],[9,-7],[-11,-7]], 'rgba(255,255,255,0.26)');
      facet([[31,-37],[43,-8],[15,11],[9,-7]], 'rgba(75,88,82,0.38)');
      facet([[-40,6],[-29,-34],[-11,-7],[-16,20]], 'rgba(255,255,255,0.16)');
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(-15,-11,12,19,-0.18,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(15,-11,12,19,0.18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.34)'; ctx.beginPath(); ctx.arc(-18,-18,2.2,0,Math.PI*2); ctx.arc(11,-18,2.2,0,Math.PI*2); ctx.fill();
      poly([[-9,24],[0,19],[9,24],[5,30],[-5,30]], '#33ff66', '#170025', 2);
      orbitGlow('rgba(180,255,220,0.28)');
    } else if (name === 'SPACE SHARK') {
      const flap = Math.sin(t * 3.4) * 9;
      bossAura('#5ab1ff', '#14506f');
      poly([[-26,-2],[-62,-20],[-83,-1],[-63,18]], '#14506f', '#170025', 3);
      poly([[-70,-1],[-95,-17 + flap],[-86,-1],[-95,16 - flap]], '#2f8fb8', '#170025', 3);
      poly([[-46,-21],[-7,-50],[36,-40],[61,-11],[57,20],[31,44],[-10,51],[-45,30],[-60,1]], ctx.fillStyle, '#170025', 5.6);
      ctx.shadowBlur = 0;
      facet([[-46,-21],[-7,-50],[-13,-8],[-48,8]], 'rgba(116,205,255,0.28)');
      facet([[-7,-50],[36,-40],[16,-9],[-13,-8]], 'rgba(34,124,170,0.36)');
      facet([[36,-40],[61,-11],[26,7],[16,-9]], 'rgba(9,54,80,0.52)');
      facet([[-35,31],[31,44],[22,18],[-24,18]], 'rgba(220,248,255,0.5)');
      poly([[-10,-44],[5,-79],[24,-42]], '#14506f', '#170025', 3.6);
      ctx.fillStyle = '#031018';
      ctx.beginPath(); ctx.ellipse(-17,-8,5.4,7,-0.12,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14,-8,5.4,7,0.12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#b9f7ff'; ctx.beginPath(); ctx.arc(-19,-11,1.4,0,Math.PI*2); ctx.arc(12,-11,1.4,0,Math.PI*2); ctx.fill();
      openPoly([[-34,-23],[-9,-16]], '#031018', 4.5);
      openPoly([[30,-23],[7,-16]], '#031018', 4.5);
      poly([[-35,6],[-8,15],[31,6],[24,23],[-4,31],[-34,21]], '#031018', '#170025', 2.8);
      teeth([[-28,8,-23,21,-18,11],[-13,13,-8,28,-3,15],[3,15,8,29,13,15],[18,11,23,24,29,9],[-21,25,-16,14,-11,24],[-5,29,0,16,5,28],[10,27,15,14,20,25]]);
      orbitGlow('rgba(90,177,255,0.35)');
    } else if (name === 'MEAN TACO') {
      bossAura('#ffe48c', '#9e6414');
      poly([[-54,19],[-45,-8],[-20,-30],[16,-32],[43,-9],[55,20],[34,40],[-22,42]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[-45,-8],[-20,-30],[-7,5],[-39,17]], 'rgba(255,246,175,0.36)');
      facet([[16,-32],[43,-9],[15,6],[-7,5]], 'rgba(158,100,20,0.38)');
      const float = Math.sin(t * 2.2) * 4;
      [[-30,-24,'#6fcf45'],[-13,-34,'#ffcc44'],[4,-30,'#cc3322'],[22,-31,'#6fcf45'],[37,-20,'#ffcc44']].forEach(([x,y,c],i)=>{
        ctx.beginPath(); ctx.arc(x, y + float * (i%2?-.6:.6), 7, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#170025'; ctx.lineWidth = 2; ctx.stroke();
      });
      meanEyes('#ff442f', 2);
      ctx.strokeStyle = '#2a1400'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-25,18); ctx.quadraticCurveTo(0,33,28,18); ctx.stroke();
      orbitGlow('rgba(255,228,140,0.35)');
    } else if (name === 'COSMIC OCTO') {
      const spin = t * (attacking ? 2.2 : 0.55);
      ctx.save(); ctx.rotate(spin);
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 4);
        const bend = Math.sin(t * 1.7 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(-7, 30);
        ctx.bezierCurveTo(-16 + bend, 48, -4 + bend, 66, -13, 84);
        ctx.bezierCurveTo(-3 + bend, 78, 15 - bend, 60, 8, 31);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ff4fd8' : '#d82cff'; ctx.fill(); ctx.strokeStyle = '#170025'; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.fillStyle = '#ffd5f6';
        for (let k=0;k<4;k++){
          ctx.beginPath(); ctx.arc((k % 2 ? 4 : -4) + bend * 0.08, 43 + k * 10, 2.3 - k * 0.12, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      bossAura('#ff6be8', '#7b168d');
      poly([[0,-50],[33,-36],[47,-6],[34,31],[0,47],[-34,31],[-47,-6],[-33,-36]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[0,-50],[33,-36],[10,-7],[-12,-8]], 'rgba(255,190,242,0.38)');
      facet([[33,-36],[47,-6],[14,12],[10,-7]], 'rgba(130,25,145,0.48)');
      meanEyes('#5ab1ff', -10);
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-19,15); ctx.quadraticCurveTo(0,24,21,15); ctx.stroke();
      orbitGlow('rgba(255,80,216,0.45)');
    } else {
      drawPixelSprite(creature.sprite, creature.palette, 0, 0, size / s);
    }
    ctx.restore();
  }

  const BOSS_PREVIEW_META = {
    'STAR OGRE': 'SHOOTS DONKEYS',
    'SKY DRAGON': 'FIRE BREATHER',
    'DARK KNIGHT': 'SHIELD DEFLECT',
    'GRAY VISITOR': 'GREEN ORBS',
    'SPACE SHARK': 'SHARK TEETH',
    'MEAN TACO': 'SOMBREROS',
    'COSMIC OCTO': 'INK BURST',
    'GIZMO': 'LOCK GLOW',
  };
  function bossPreviewList() {
    return [...BOSS_CREATURES, { name: 'GIZMO', isGizmo: true }];
  }
  let bossPreviewRaf = null;
  function renderSpaceBossPreviewCanvases() {
    const oldCtx = ctx;
    const oldBoss = boss;
    bossPreviewList().forEach((creature, i) => {
      const cv = document.getElementById(`space-boss-cv-${i}`);
      if (!cv) return;
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const css = 112; // larger drawing surface prevents the boss aura/ring from clipping at the canvas edge
      cv.width = Math.round(css * dpr);
      cv.height = Math.round(css * dpr);
      cv.style.width = `${css}px`;
      cv.style.height = `${css}px`;
      const cctx = cv.getContext('2d');
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cctx.clearRect(0, 0, css, css);
      ctx = cctx;
      boss = {
        creature,
        attackType: bossAttackTypeFor(creature),
        nextAttack: Date.now() + 420,
        shieldUntil: creature.name === 'DARK KNIGHT' ? Date.now() + 100000 : 0,
      };
      ctx.save();
      ctx.translate(css / 2, css / 2 + 4);
      if (creature.isGizmo) drawGizmoOrb(82);
      else drawThemedBoss(creature, 82);
      ctx.restore();
    });
    ctx = oldCtx;
    boss = oldBoss;
  }
  function startSpaceBossPreviewAnimation() {
    cancelAnimationFrame(bossPreviewRaf);
    const tick = () => {
      const ov = document.getElementById('space-overlay');
      if (!ov || !ov.classList.contains('space-boss-preview')) { bossPreviewRaf = null; return; }
      renderSpaceBossPreviewCanvases();
      bossPreviewRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function bossPreviewHTML() {
    return `
      <div style="width:100%;max-width:432px;margin:0 auto 12px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:5px;line-height:1;color:#33ff66;text-shadow:0 0 14px #33ff6688">BOSS PREVIEW</div>
          <div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:1.5px;color:rgba(242,239,232,0.48);margin-top:5px">SPACE MOBE ROGUES</div>
        </div>
        <button class="whack-btn" style="width:auto;min-width:82px;height:38px;border-color:rgba(51,255,102,0.42);background:rgba(51,255,102,0.1);font-size:11px;letter-spacing:2px;padding:0 12px" onclick="showSpaceOverlay('select')">CLOSE</button>
      </div>
      <div class="space-boss-gallery">
        ${bossPreviewList().map((creature, i) => `
          <div class="space-boss-card">
            <canvas id="space-boss-cv-${i}" width="184" height="184"></canvas>
            <div class="space-boss-name">${creature.name}</div>
            <div class="space-boss-ability">${BOSS_PREVIEW_META[creature.name] || 'BOSS ATTACK'}</div>
            <button class="space-boss-practice" onclick="spaceDebugBoss('${creature.name}')">PRACTICE</button>
          </div>
        `).join('')}
      </div>`;
  }

  function drawBoss() {
    // Laser telegraph (charging) and beam (firing)
    if (boss.laserPhase === 'charging') {
      const t = (Date.now() - boss.laserChargeStart) / 700;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * Math.PI * 6));
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(boss.laserX - 3, boss.y, 6, H - boss.y);
      ctx.restore();
    } else if (boss.laserPhase === 'firing') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,80,80,0.85)';
      ctx.fillRect(boss.laserX - 9, boss.y, 18, H - boss.y);
      ctx.fillStyle = '#fff';
      ctx.fillRect(boss.laserX - 3, boss.y, 6, H - boss.y);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.isCaptive) {
      ctx.save();
      ctx.translate(0, -boss.r * 0.78 + Math.sin(Date.now() * 0.004) * 2);
      ctx.globalAlpha = 0.9;
      drawGizmoOrb(boss.r * 1.25);
      ctx.restore();
      // Jail cell reskin — same fight underneath, but restyled to match the look
      // of a normal trapped hero (blue square frame + the same rotating pulsing
      // ring) instead of a separate gray jail-bars design.
      ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.95, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1530'; ctx.fill();
      const gc = GAME_CHARS[boss.captiveCi];
      ctx.fillStyle = 'rgba(0,229,255,0.12)';
      ctx.fillRect(-boss.r * 0.95, -boss.r * 0.95, boss.r * 1.9, boss.r * 1.9);
      ctx.strokeStyle = 'rgba(234,255,255,0.72)';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-boss.r * 0.35, -boss.r * 0.95); ctx.lineTo(-boss.r * 0.35, boss.r * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(boss.r * 0.35, -boss.r * 0.95); ctx.lineTo(boss.r * 0.35, boss.r * 0.95); ctx.stroke();
      drawCanvasMobe(gc, 'sad', -boss.r * 0.7, -boss.r * 0.7, boss.r * 1.4, boss.r * 1.4, {
        glowColor: 'rgba(0,229,255,0.72)',
        glowBlur: boss.r * 0.2,
      });
      ctx.fillStyle = 'rgba(0,229,255,0.24)';
      ctx.fillRect(-boss.r * 0.7, -boss.r * 0.7, boss.r * 1.4, boss.r * 1.4);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
      ctx.strokeRect(-boss.r * 0.95, -boss.r * 0.95, boss.r * 1.9, boss.r * 1.9);
      const crackProgress = 1 - (boss.hp / boss.maxHp);
      if (crackProgress > 0.22) {
        ctx.strokeStyle = 'rgba(234,255,255,0.86)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-boss.r * 0.58, -boss.r * 0.72); ctx.lineTo(-boss.r * 0.36, -boss.r * 0.42); ctx.lineTo(-boss.r * 0.5, -boss.r * 0.12); ctx.stroke();
      }
      if (crackProgress > 0.48) {
        ctx.beginPath(); ctx.moveTo(boss.r * 0.52, -boss.r * 0.62); ctx.lineTo(boss.r * 0.28, -boss.r * 0.26); ctx.lineTo(boss.r * 0.44, boss.r * 0.04); ctx.stroke();
      }
      if (crackProgress > 0.72) {
        ctx.beginPath(); ctx.moveTo(-boss.r * 0.1, boss.r * 0.72); ctx.lineTo(boss.r * 0.06, boss.r * 0.38); ctx.lineTo(-boss.r * 0.08, boss.r * 0.12); ctx.lineTo(boss.r * 0.14, -boss.r * 0.08); ctx.stroke();
      }
      // Same blue rescue-target language as the smaller trapped heroes: soft glow,
      // bright inner ring, and orbiting dots. Boss captive still has the square
      // frame, but the thing you shoot now reads exactly like rescue.
      const _bRingR = boss.r * 0.85;
      const _bT = Date.now() * 0.003;
      const _bPulse = 1 + Math.sin(Date.now() * 0.008) * 0.05;
      ctx.save();
      ctx.rotate(_bT);
      ctx.beginPath(); ctx.arc(0, 0, _bRingR * 1.14 * _bPulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,190,255,0.26)'; ctx.lineWidth = 8; ctx.stroke();
      const _bGrad = ctx.createLinearGradient(-_bRingR, -_bRingR, _bRingR, _bRingR);
      _bGrad.addColorStop(0, '#5ab1ff');
      _bGrad.addColorStop(0.48, '#00e5ff');
      _bGrad.addColorStop(1, '#b9f7ff');
      ctx.beginPath(); ctx.arc(0, 0, _bRingR * 1.02 * _bPulse, 0, Math.PI * 2);
      ctx.strokeStyle = _bGrad; ctx.lineWidth = 2.8; ctx.stroke();
      for (let d = 0; d < 4; d++) {
        const a = (d / 4) * Math.PI * 2 + _bT;
        ctx.fillStyle = d % 2 ? '#eaffff' : '#5ab1ff';
        ctx.beginPath(); ctx.arc(Math.cos(a) * _bRingR * 1.02 * _bPulse, Math.sin(a) * _bRingR * 1.02 * _bPulse, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else {
      // No red ring here — unlike a small enemy face, the boss is already unmistakably
      // a threat (its size, name label, and health bar), so the ring was redundant.
      if (boss.isGizmo) {
        drawGizmoOrb(boss.r * 2.1);
      } else {
        drawThemedBoss(boss.creature, boss.r * 2.05);
      }
      if (boss.guardedRescue && boss.captiveCi >= 0) {
        const gc = GAME_CHARS[boss.captiveCi];
        const t = Date.now() * 0.003;
        const bx = boss.r * 0.72;
        const by = boss.r * 0.76 + Math.sin(t * 2.2) * 2;
        const br = boss.r * 0.42;
        ctx.save();
        ctx.globalAlpha = 0.96;
        ctx.translate(bx, by);
        ctx.beginPath(); ctx.arc(0, 0, br * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,229,255,0.12)'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,229,255,0.36)'; ctx.lineWidth = 8; ctx.stroke();
        ctx.save();
        ctx.rotate(t * 1.7);
        ctx.beginPath(); ctx.arc(0, 0, br * 1.02, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2.8; ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + t * 2;
          ctx.fillStyle = k % 2 ? '#eaffff' : '#5ab1ff';
          ctx.beginPath(); ctx.rect(Math.cos(a) * br - 2.2, Math.sin(a) * br - 2.2, 4.4, 4.4); ctx.fill();
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(0, 0, br * 0.72, 0, Math.PI * 2);
        ctx.fillStyle = gc.color || '#33d4e0'; ctx.fill();
        drawCanvasMobe(gc, 'sad', -br * 0.7, -br * 0.7, br * 1.4, br * 1.4, {
          glowColor: 'rgba(0,229,255,0.7)',
          glowBlur: br * 0.2,
        });
        ctx.fillStyle = 'rgba(0,229,255,0.22)';
        ctx.beginPath(); ctx.arc(0, 0, br * 0.74, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    if (boss.hitFlash > 0) {
      ctx.globalAlpha = boss.hitFlash;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, boss.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Name + health bar above the boss
    const barW = boss.r * 2.2, barX = boss.x - barW/2, barY = boss.y - boss.r - 18;
    ctx.font = `bold 13px 'Bebas Neue', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = boss.isCaptive ? '#00e5ff' : '#ff4444';
    ctx.fillText(boss.isCaptive ? 'CAPTIVE LOCK' : boss.guardedRescue && boss.captiveCi >= 0 ? `${boss.creature.name} HAS ${GAME_CHARS[boss.captiveCi].name}` : boss.creature.name, boss.x, barY - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = boss.isCaptive ? '#00e5ff' : '#ff4444'; ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), 8);
  }

  function drawMiniBoss() {
    const mb = miniBoss;
    ctx.save();
    ctx.globalAlpha = mb.opacity;
    ctx.translate(mb.x, mb.y);
    if (!drawBossPngImage(mb.creature, mb.r * 1.7)) drawPixelSprite(mb.creature.sprite, mb.creature.palette, 0, 0, mb.r * 1.7);
    if (mb.hitFlash > 0) {
      ctx.globalAlpha = mb.hitFlash;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, mb.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    if (mb.phase !== 'active') return; // mid-teleport — no bar, can't be hit yet
    const barW = mb.r * 1.8, barX = mb.x - barW/2, barY = mb.y - mb.r - 14;
    ctx.font = `bold 11px 'Bebas Neue', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mb.kind === 'ghost' ? '#8855ff' : '#cc99ff';
    ctx.fillText(mb.kind === 'ghost' ? 'GHOST' : 'EMP', mb.x, barY - 5);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX, barY, barW, 6);
    ctx.fillStyle = mb.kind === 'ghost' ? '#8855ff' : '#cc99ff'; ctx.fillRect(barX, barY, barW * (mb.hp / mb.maxHp), 6);
  }

  function drawTwin() {
    const gc = GAME_CHARS[activeChar];
    ctx.save();
    ctx.translate(twin.x, twin.y);
    ctx.globalAlpha = 0.85;
    drawCanvasMobe(gc, 'normal', -player.r, -player.r, player.r * 2, player.r * 2, {
      glowColor: 'rgba(255,230,26,0.35)',
      glowBlur: player.r * 0.22,
    });
    ctx.restore();
  }

  // SVG-style drawn shape (no emoji) — a spinning red/orange hazard ball with a
  // warning-stripe pattern, deliberately reading as "dangerous to touch."
  function drawRebound() {
    const t = Date.now() * 0.006;
    ctx.save();
    ctx.translate(rebound.x, rebound.y);
    ctx.rotate(t);
    ctx.beginPath(); ctx.arc(0, 0, rebound.r, 0, Math.PI * 2);
    ctx.fillStyle = '#7a1010'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, rebound.r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#ff4444';
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((i / 6) * Math.PI * 2);
      ctx.fillRect(-rebound.r, -2, rebound.r * 2, 4);
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffaa55'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function drawEscort() {
    const gc = GAME_CHARS[escort.ci];
    ctx.save();
    ctx.globalAlpha = Math.max(0, escort.opacity);
    ctx.translate(escort.x, escort.y);
    // Green dashed ring — same "this is friendly, not a threat" color language as the
    // cyan rescue ring elsewhere, so it never reads as something to shoot.
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(51,255,102,0.4)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI*2);
    ctx.strokeStyle = '#33ff66'; ctx.lineWidth = 2; ctx.setLineDash([4,3]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2);
    ctx.fillStyle = gc.color; ctx.fill();
    drawCanvasMobe(gc, 'happy', -12, -12, 24, 24, {
      glowColor: 'rgba(51,255,102,0.45)',
      glowBlur: 6,
    });
    ctx.restore();
  }

  function drawChunkShard(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.c;
    ctx.beginPath();
    const sides = p.sides || 4;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rr = p.r * (i % 2 ? 0.72 : 1);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * (p.flat || 0.86);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1, p.r * 0.18);
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.stroke();
    ctx.restore();
  }

  function drawJaggedBurstRing(x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    const pts = 16;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.78 : 1.05);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function miniExplosion(x, y, color) {
    const parts = Array.from({length: 14}, () => ({
      x, y,
      c: Math.random() < 0.3 ? '#ffe61a' : color,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      r: 4 + Math.random() * 8,
      a: 1,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.24,
      sides: Math.random() < 0.45 ? 4 : 5,
      flat: 0.65 + Math.random() * 0.35,
    }));
    let age = 0;
    function tick() {
      age++;
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.rot += p.vr; p.a -= 0.058; p.r *= 0.965; });
      if (ctx && parts[0].a > 0) {
        ctx.save();
        if (age < 9) drawJaggedBurstRing(x, y, 8 + age * 3.4, color, 0.5 - age * 0.045);
        parts.forEach(p => {
          if (p.a <= 0) return;
          ctx.globalAlpha = p.a;
          drawChunkShard(p);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  function bigExplosion(x, y, color) {
    triggerShake(7);
    const parts = Array.from({length: 26}, () => ({
      x, y, c: Math.random() < 0.35 ? '#ffe61a' : color,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      r: 7 + Math.random() * 15,
      a: 1,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      sides: Math.random() < 0.4 ? 4 : 6,
      flat: 0.58 + Math.random() * 0.38,
    }));
    let age = 0;
    function tick() {
      age++;
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.rot += p.vr; p.a -= 0.035; p.r *= 0.955; });
      if (ctx && parts[0].a > 0) {
        ctx.save();
        if (age < 14) {
          drawJaggedBurstRing(x, y, 16 + age * 5.4, '#ffe61a', 0.52 - age * 0.032);
          drawJaggedBurstRing(x, y, 7 + age * 3.1, color, 0.44 - age * 0.028);
        }
        parts.forEach(p => {
          if (p.a <= 0) return;
          ctx.globalAlpha = p.a;
          drawChunkShard(p);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  function faceFlash(ci, mood, x, y) {
    const gc = GAME_CHARS[ci];
    const imgSrc = mood === 'happy' ? gc.imgHappy : gc.imgSad;
    const img = _getImg(imgSrc);
    let a = 1.0, size = 52;
    function tick() {
      a -= 0.038; size += 0.6;
      if (!ctx || a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
      } else {
        ctx.font = `${Math.round(size * 0.7)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mood === 'happy' ? gc.happy : gc.sad, x, y);
      }
      ctx.restore();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function showSpaceOverlay(mode) {
    try { if (mode === 'select' && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start(); } catch(e){}
    document.body.classList.toggle('arcade-selection-open', mode === 'select' || mode === 'boss-preview');
    if (mode === 'select' || mode === 'boss-preview') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }
    const ov=document.getElementById('space-overlay');
    if(!ov) return;
    ov.classList.toggle('space-over', mode === 'over');
    ov.classList.toggle('space-boss-preview', mode === 'boss-preview');
    ov.style.justifyContent = mode === 'select' || mode === 'boss-preview' ? 'flex-start' : '';
    ov.style.paddingTop = mode === 'select' ? '16px' : '';
    setArcadeExitVisible(mode !== 'over');
    if(mode==='select'){
      const gc=GAME_CHARS[activeChar];
      ov.innerHTML=`
        <div class="whack-mode-shell" style="max-width:440px;margin-top:16px">
          <div class="whack-mode-title">GET READY</div>
          <div class="game-card whack-mode-card" style="border-color:#33ff6677;cursor:default;min-height:0">
            <div class="game-card-art" style="background:#0d0a1e">
              <div id="space-select-art" style="position:absolute;inset:0;z-index:0;opacity:0.40;transform:scale(1.26) translateY(10px);filter:saturate(1.18) brightness(1.02);pointer-events:none;mix-blend-mode:screen"></div>
            </div>
            <div class="game-card-info" style="position:relative;z-index:2;padding:14px 16px 16px;background:linear-gradient(to top, rgba(5,2,18,0.96) 74%, rgba(5,2,18,0.14) 100%)">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
                <div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:5px;line-height:1;color:#33ff66;text-shadow:0 0 14px #33ff6688">SPACE MOBE</div>
                <button class="space-boss-trigger" onclick="showSpaceOverlay('boss-preview')" aria-label="Preview bosses" title="Preview bosses">
                  <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13.2c0-4.2 3-7.2 7-7.2s7 3 7 7.2c0 3.5-2 5.8-4.8 6.6v-2.3h-1.4v2.6h-1.6v-2.6H9.8v2.3C7 19 5 16.7 5 13.2Z" fill="currentColor" opacity="0.95"/>
                    <circle cx="9.2" cy="13.1" r="1.6" fill="#030110"/>
                    <circle cx="14.8" cy="13.1" r="1.6" fill="#030110"/>
                    <path d="M9.1 9.2 7.2 7.6M14.9 9.2l1.9-1.6" stroke="#030110" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div style="display:flex;align-items:center;gap:14px;width:100%">
                <div style="width:68px;height:68px;flex-shrink:0;border-radius:50%;background:${gc.color}33;display:flex;align-items:center;justify-content:center;border:2px solid ${gc.color}88;box-shadow:0 0 16px ${gc.color}44">
                  <div class="char-tilt" style="width:54px;height:54px">${charFace(gc,'normal')}</div>
                </div>
                <div style="text-align:left">
                  <div style="font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.5);font-family:'VCR',monospace">YOUR PILOT</div>
                  <div style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:${gc.color};text-shadow:0 0 10px ${gc.color}88;line-height:1.1">${gc.name}</div>
                  <div style="font-size:11px;letter-spacing:1px;color:rgba(242,239,232,0.35);font-family:'VCR',monospace;margin-top:3px">CHANGE IN ARCADE MENU</div>
                </div>
              </div>
              <div style="width:100%;height:1px;background:rgba(242,239,232,0.1);margin:12px 0"></div>
              <div style="width:100%;display:flex;flex-direction:column;gap:14px;font-family:'VCR',monospace">
                <div style="display:flex;align-items:center;gap:14px">
                  <div style="font-size:14px;letter-spacing:2px;color:rgba(242,239,232,0.85);width:78px;flex-shrink:0">SHOOT</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <svg width="30" height="30" viewBox="0 0 30 30" style="flex-shrink:0">
                      <polygon points="15,3 22,8 27,15 22,24 14,27 7,22 3,14 9,5" fill="#5c526c" stroke="#7a6a90" stroke-width="1.5"/>
                    </svg>
                    <svg width="30" height="30" viewBox="0 0 30 30" style="flex-shrink:0">
                      <circle cx="15" cy="15" r="11" fill="#cc44ff"/>
                      <polyline points="6.5,1.5 1.5,1.5 1.5,6.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                      <polyline points="23.5,1.5 28.5,1.5 28.5,6.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                      <polyline points="1.5,23.5 1.5,28.5 6.5,28.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                      <polyline points="28.5,23.5 28.5,28.5 23.5,28.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                    <svg width="30" height="30" viewBox="0 0 30 30" style="flex-shrink:0">
                      <defs>
                        <linearGradient id="spSelectMysteryGrad" x1="3" y1="3" x2="27" y2="27">
                          <stop offset="0" stop-color="#ff76d2"/>
                          <stop offset="0.5" stop-color="#cc66ff"/>
                          <stop offset="1" stop-color="#5ab1ff"/>
                        </linearGradient>
                        <linearGradient id="spSelectMysteryCrateGrad" x1="8" y1="7" x2="23" y2="23">
                          <stop offset="0" stop-color="#f7b45c"/>
                          <stop offset="0.48" stop-color="#9a5a2a"/>
                          <stop offset="1" stop-color="#5b2e7f"/>
                        </linearGradient>
                      </defs>
                      <circle cx="15" cy="15" r="13.5" fill="rgba(255,118,210,0.13)"/>
                      <rect x="7" y="7" width="16" height="16" rx="2.2" fill="url(#spSelectMysteryCrateGrad)" stroke="#ffe0a3" stroke-width="1.8"/>
                      <path d="M8.5 11.5 H21.5 M8.5 16 H21.5 M11.5 7.5 V22.5 M18.5 7.5 V22.5" stroke="rgba(47,24,42,0.45)" stroke-width="1"/>
                      <path d="M8.5 8.5 H13 M8.5 8.5 V13 M21.5 8.5 H17 M21.5 8.5 V13 M8.5 21.5 H13 M8.5 21.5 V17 M21.5 21.5 H17 M21.5 21.5 V17" fill="none" stroke="#ffd27a" stroke-width="1.5" stroke-linecap="round"/>
                      <text x="15" y="19.6" text-anchor="middle" font-family="'Bebas Neue', cursive" font-size="14" font-weight="bold" fill="#fff06a" stroke="#24103e" stroke-width="1.2">?</text>
                      <circle cx="15" cy="15" r="13" fill="none" stroke="rgba(255,120,220,0.34)" stroke-width="5.5"/>
                      <circle cx="15" cy="15" r="12" fill="none" stroke="url(#spSelectMysteryGrad)" stroke-width="3"/>
                      <circle cx="15" cy="3" r="2.1" fill="#fff"/>
                      <circle cx="27" cy="15" r="2.1" fill="#ff9be3"/>
                      <circle cx="15" cy="27" r="2.1" fill="#fff"/>
                      <circle cx="3" cy="15" r="2.1" fill="#ff9be3"/>
                    </svg>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:14px">
                  <div style="font-size:14px;letter-spacing:2px;color:rgba(242,239,232,0.85);width:78px;flex-shrink:0">RESCUE</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <svg width="34" height="34" viewBox="0 0 34 34" style="flex-shrink:0;overflow:visible">
                      <defs>
                        <linearGradient id="spSelectRescueGrad2" x1="2" y1="2" x2="32" y2="32">
                          <stop offset="0" stop-color="#5ab1ff"/>
                          <stop offset="0.48" stop-color="#00e5ff"/>
                          <stop offset="1" stop-color="#b9f7ff"/>
                        </linearGradient>
                      </defs>
                      <rect x="7" y="7" width="20" height="20" rx="2" fill="rgba(0,229,255,0.12)" stroke="#00e5ff" stroke-width="2"/>
                      <line x1="13" y1="7" x2="13" y2="27" stroke="rgba(234,255,255,0.78)" stroke-width="1.5"/>
                      <line x1="21" y1="7" x2="21" y2="27" stroke="rgba(234,255,255,0.78)" stroke-width="1.5"/>
                      <circle cx="17" cy="17" r="8.5" fill="#33d4e0"/>
                      <rect x="8.5" y="8.5" width="17" height="17" fill="rgba(0,229,255,0.24)"/>
                      <circle cx="17" cy="17" r="15" fill="none" stroke="rgba(90,190,255,0.26)" stroke-width="7"/>
                      <circle cx="17" cy="17" r="13.2" fill="none" stroke="url(#spSelectRescueGrad2)" stroke-width="2.8"/>
                      <circle cx="17" cy="3.8" r="2.3" fill="#eaffff"/>
                      <circle cx="30.2" cy="17" r="2.3" fill="#5ab1ff"/>
                      <circle cx="17" cy="30.2" r="2.3" fill="#eaffff"/>
                      <circle cx="3.8" cy="17" r="2.3" fill="#5ab1ff"/>
                    </svg>
                    <div style="font-size:11px;letter-spacing:1.5px;color:rgba(242,239,232,0.55);line-height:1.25">BREAK BLUE RINGS</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:14px">
                  <div style="font-size:14px;letter-spacing:2px;color:rgba(242,239,232,0.85);width:78px;flex-shrink:0">CATCH</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <img src="projectiles/hp_icon.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(51,255,102,0.45))">
                    <img src="projectiles/shield.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(0,229,255,0.45))">
                    <img src="projectiles/lightning.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(255,230,26,0.45))">
                    <img src="projectiles/bomb.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(255,136,0,0.45))">
                  </div>
                </div>
              </div>
              <button class="whack-btn" style="width:100%;border-color:#33ff66;background:rgba(51,255,102,0.18);font-size:16px;letter-spacing:4px;padding:14px 40px;margin-top:12px" onclick="spaceStart()">LAUNCH!</button>
              <div class="space-debug-row" aria-label="Space debug jumps">
                <button class="space-debug-chip" onclick="spaceDebugJump(2)">W2 GIZMO</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(4)">W4 BOSS</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(10)">W10 GIZMO</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(17)">FINAL</button>
              </div>
              <div class="space-debug-row" aria-label="Space boss playtests">
                <button class="space-debug-chip" onclick="spaceDebugBoss('STAR OGRE')">OGRE</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('SKY DRAGON')">DRAGON</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('DARK KNIGHT')">KNIGHT</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('GRAY VISITOR')">VISITOR</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('SPACE SHARK')">SHARK</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('MEAN TACO')">TACO</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('COSMIC OCTO')">OCTO</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('GIZMO')">GIZMO</button>
              </div>
            </div>
          </div>
        </div>`;
      mountSelectionArt('space-select-art', 'space');
    } else if(mode==='boss-preview'){
      ov.innerHTML = bossPreviewHTML();
      startSpaceBossPreviewAnimation();
    } else if(mode==='over'){
      setArcadeExitVisible(false);
      // Clear stale launch/select markup immediately; otherwise it can flash between
      // the in-game mission-failed beat and the leaderboard game-over card.
      ov.innerHTML = '';
      ov.classList.remove('hidden');
      const isNew=score>=parseInt(localStorage.getItem('space-best')||'0');
      const boardKey = getSpaceLeaderboardKey();
      const uid = 'space';
      showMissionFailedBeat(() => {
        ov.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'space',
          color: '#33ff66',
          marquee: isNew && score > 0 ? 'GAME OVER' : 'GAME OVER',
          marqueeEnd: '#006622',
          scoreLabel: 'YOUR SCORE',
          scoreValue: score,
          saveValue: score,
          field: 'score',
          extra: `RESCUED ${rescuedChars.size}/${missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT} / WAVE ${wave}`,
          ascending: false,
          maxWidth: 410,
          minHeight: 330,
          saveMarginTop: 18,
          buttons: `
            <button class="whack-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.30)" onclick="spaceStart()">PLAY AGAIN</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#33ff66', 'score');
        mountSelectionArt(`${uid}-art`, 'space');
      });
    }
    ov.classList.remove('hidden');
  }
  window.showSpaceOverlay = showSpaceOverlay;

  // Desktop arrow key support
  document.addEventListener('keydown', e => {
    if (!document.getElementById('pg-space')?.classList.contains('active')) return;
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A')  { leftHeld=true;  e.preventDefault(); }
    if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') { rightHeld=true; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A')  leftHeld=false;
    if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') rightHeld=false;
  });
  window.spaceShoot=function(){
    if(state!=='playing')return;
    bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED});
    SFX.blaster();
  };
  // ── First-time intro ── same font/color/size/timing as Whack's objective text
  // (Bebas Neue, #00e5ff, 40px, 3000ms holds) — this is a separate IIFE from Whack's,
  // so those helpers aren't reachable here and get a small mirrored copy instead.
  // No grid to anchor to like Whack's intro does, so headlines anchor to a fixed
  // viewport percentage instead — same idea as Whack's introObjectiveHTML: every
  // beat's headline sits at the exact same Y regardless of how tall that beat's demo
  // content is, instead of flex-centering the pair as one variable-height group.
  function spIntroHeadline(text, size) {
    const color = '#00e5ff';
    return `<div style="font-family:'Bebas Neue',cursive;font-size:${size||40}px;letter-spacing:3px;color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color}66;text-align:center;line-height:1.2">${text}</div>`;
  }
  const SP_INTRO_Y = '38%';
  function spIntroObjectiveHTML(text, contentHTML) {
    return `<div style="position:absolute;top:${SP_INTRO_Y};left:50%;width:100%;transform:translate(-50%,-50%)">${spIntroHeadline(text)}</div>` +
      (contentHTML ? `<div style="position:absolute;top:calc(${SP_INTRO_Y} + 70px);left:50%;transform:translateX(-50%)">${contentHTML}</div>` : '');
  }
  function spMakeIntroOverlay() {
    const ann = document.createElement('div');
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;pointer-events:none;background:rgba(5,2,18,0.92)';
    document.body.appendChild(ann);
    return ann;
  }
  function spEnsureIntroSkipButton(overlay, onSkip) {
    if (!overlay || !onSkip || overlay.querySelector('.intro-skip-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'intro-skip-btn';
    btn.textContent = 'SKIP';
    btn.style.cssText = "position:fixed;top:max(10px, env(safe-area-inset-top, 10px));right:calc(max(10px, env(safe-area-inset-right, 10px)) + 44px);z-index:10000;pointer-events:auto;height:32px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:6px;padding:0 12px;color:rgba(242,239,232,0.5);cursor:pointer";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    };
    overlay.appendChild(btn);
  }
  function spPlayIntroSteps(steps, onComplete, onSkip) {
    let i = 0;
    let timeoutId = null;
    let done = false;
    const ann = steps._ann;
    function cancel() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
    }
    function finish() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      onComplete();
    }
    function tick() {
      if (done || !document.body.contains(ann)) return; // overlay was torn down — bail cleanly
      if (i >= steps.length) { finish(); return; }
      const step = steps[i++];
      step.show();
      spEnsureIntroSkipButton(ann, onSkip);
      timeoutId = setTimeout(tick, step.duration);
    }
    tick();
    return { cancel, finish };
  }

  function spaceIntroSteps(onDone) {
    const ann = spMakeIntroOverlay();
    let ctrl = null;
    const skipIntro = () => {
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    const steps = [
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('SHOOT ENEMIES AND ASTEROIDS',
          `<div style="display:flex;gap:28px;align-items:flex-start">
            <div style="position:relative;width:46px;height:90px">
              <div id="sp-intro-rock" style="position:absolute;top:0;left:0;width:46px;height:46px;background:linear-gradient(135deg,#8b7fa3 0 23%,#5c526c 23% 58%,#362f42 58%);clip-path:polygon(48% 0,84% 12%,100% 46%,82% 84%,42% 100%,8% 74%,0 34%,18% 8%);box-shadow:0 0 0 4px #241f2d,0 0 0 6px #8b7fa3"></div>
              <div id="sp-intro-bullet1" style="position:absolute;left:21px;top:84px;width:4px;height:14px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff;transition:top 0.35s linear"></div>
            </div>
            <div style="position:relative;width:46px;height:90px">
              <div id="sp-intro-ring" style="position:absolute;top:2px;left:2px;width:42px;height:42px">
                <div style="position:absolute;top:0;left:0;width:10px;height:10px;border-top:2.5px solid #ff4444;border-left:2.5px solid #ff4444"></div>
                <div style="position:absolute;top:0;right:0;width:10px;height:10px;border-top:2.5px solid #ff4444;border-right:2.5px solid #ff4444"></div>
                <div style="position:absolute;bottom:0;left:0;width:10px;height:10px;border-bottom:2.5px solid #ff4444;border-left:2.5px solid #ff4444"></div>
                <div style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-bottom:2.5px solid #ff4444;border-right:2.5px solid #ff4444"></div>
              </div>
              <div id="sp-intro-enemy" style="position:absolute;top:6px;left:6px;width:34px;height:34px;border-radius:50%;background:#cc44ff"></div>
              <div id="sp-intro-bullet2" style="position:absolute;left:21px;top:84px;width:4px;height:14px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff;transition:top 0.35s linear"></div>
            </div>
          </div>`);
        // Bullets travel up to meet each target before it bursts — shooting causes
        // the destruction, rather than the shapes just vanishing on a timer.
        setTimeout(() => {
          const b1 = document.getElementById('sp-intro-bullet1'), b2 = document.getElementById('sp-intro-bullet2');
          if (b1) b1.style.top = '40px';
          if (b2) b2.style.top = '40px';
          SFX.blaster && SFX.blaster();
        }, 700);
        setTimeout(() => {
          const rock = document.getElementById('sp-intro-rock'), enemy = document.getElementById('sp-intro-enemy');
          const ring = document.getElementById('sp-intro-ring');
          const b1 = document.getElementById('sp-intro-bullet1'), b2 = document.getElementById('sp-intro-bullet2');
          [rock, enemy].forEach(el => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            spIntroBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
          });
          [rock, enemy, ring, b1, b2].forEach(el => { if (el) el.style.opacity = '0'; });
          SFX.hit && SFX.hit();
        }, 1050);
      }},
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('BEFORE THEY CROSS THE LINE',
          `<div id="sp-intro-line-wrap" style="position:relative;width:140px;height:90px">
            <div style="position:absolute;bottom:14px;left:0;width:100%;height:0;border-top:2px dashed rgba(51,255,100,0.7)"></div>
            <div id="sp-intro-rock2" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:40px;height:40px;background:linear-gradient(135deg,#8b7fa3 0 22%,#5c526c 22% 60%,#362f42 60%);clip-path:polygon(48% 0,84% 12%,100% 46%,82% 84%,42% 100%,8% 74%,0 34%,18% 8%);box-shadow:0 0 0 4px #241f2d,0 0 0 6px #8b7fa3;transition:top 0.9s ease-in"></div>
            <div id="sp-intro-dmg" style="position:absolute;bottom:18px;left:50%;transform:translateX(-50%) translateY(0);font-family:'Bebas Neue',cursive;font-size:24px;color:#ff4444;text-shadow:0 0 10px #ff4444;opacity:0;transition:opacity 0.2s,transform 0.4s">-10</div>
          </div>`);
        // Asteroid falls all the way to the line and actually hits it — the danger
        // isn't "it disappears," it's "it costs you health if you let it get there."
        setTimeout(() => {
          const rock = document.getElementById('sp-intro-rock2');
          if (rock) rock.style.top = '36px';
        }, 300);
        setTimeout(() => {
          const rock = document.getElementById('sp-intro-rock2'), wrap = document.getElementById('sp-intro-line-wrap'), dmg = document.getElementById('sp-intro-dmg');
          if (rock) {
            const rect = rock.getBoundingClientRect();
            spIntroBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
            rock.style.opacity = '0';
          }
          if (dmg) { dmg.style.opacity = '1'; dmg.style.transform = 'translateX(-50%) translateY(-14px)'; }
          SFX.miss && SFX.miss();
          if (wrap) {
            wrap.style.transition = 'transform 0.08s';
            wrap.style.transform = 'translateX(-4px)';
            setTimeout(() => { wrap.style.transform = 'translateX(4px)'; }, 80);
            setTimeout(() => { wrap.style.transform = 'translateX(0)'; }, 160);
          }
        }, 1200);
      }},
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('RESCUE HEROES',
          `<div style="position:relative;width:80px;height:140px">
            <div id="sp-intro-hero-wrap" style="position:absolute;top:0;width:80px;height:80px;display:flex;align-items:center;justify-content:center">
              <div style="position:absolute;left:13px;top:13px;width:54px;height:54px;border:3px solid #00e5ff;background:rgba(0,229,255,0.12);box-shadow:0 0 18px rgba(0,229,255,0.5)">
                <div style="position:absolute;inset:0;background:rgba(0,229,255,0.22)"></div>
                <div style="position:absolute;top:0;bottom:0;left:17px;width:2px;background:rgba(234,255,255,0.78)"></div>
                <div style="position:absolute;top:0;bottom:0;right:17px;width:2px;background:rgba(234,255,255,0.78)"></div>
              </div>
              <svg id="sp-intro-ring" width="80" height="80" viewBox="0 0 80 80" style="position:absolute;inset:0;overflow:visible;animation:sp-ring-spin 2s linear infinite">
                <defs>
                  <linearGradient id="spIntroRescueGrad" x1="8" y1="8" x2="72" y2="72">
                    <stop offset="0" stop-color="#5ab1ff"/>
                    <stop offset="0.48" stop-color="#00e5ff"/>
                    <stop offset="1" stop-color="#b9f7ff"/>
                  </linearGradient>
                </defs>
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(90,190,255,0.26)" stroke-width="10"/>
                <circle cx="40" cy="40" r="32" fill="none" stroke="url(#spIntroRescueGrad)" stroke-width="3.5"/>
                <circle cx="40" cy="8" r="4" fill="#eaffff"/>
                <circle cx="72" cy="40" r="4" fill="#5ab1ff"/>
                <circle cx="40" cy="72" r="4" fill="#eaffff"/>
                <circle cx="8" cy="40" r="4" fill="#5ab1ff"/>
              </svg>
              <svg width="36" height="36" viewBox="0 0 36 36" style="flex-shrink:0;position:relative;z-index:1;filter:saturate(0.95)">
                <path d="M18,15 L8,33 L28,33 Z" fill="#a020a0" opacity="0.8"/>
                <path d="M18,15 L11,33 L25,33 Z" fill="#2255cc"/>
                <circle cx="18" cy="9" r="6.5" fill="#f0c9a0"/>
                <path d="M12,8 Q12,2 18,2 Q24,2 24,8 Q22,5 18,5 Q14,5 12,8 Z" fill="#5a3520"/>
                <ellipse cx="25" cy="11" rx="3" ry="5" fill="#5a3520" transform="rotate(25 25 11)"/>
              </svg>
              <div style="position:absolute;left:22px;top:22px;width:36px;height:36px;background:rgba(0,229,255,0.24);z-index:2;pointer-events:none"></div>
            </div>
            <div style="position:absolute;top:86px;left:50%;transform:translateX(-50%);font-family:'VCR',monospace;font-size:8px;letter-spacing:1.5px;color:#00e5ff;text-shadow:0 0 8px #00e5ff;white-space:nowrap">15 HITS TO FREE</div>
            <div id="sp-intro-bullet3" style="position:absolute;left:6px;bottom:0;width:4px;height:14px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff;transition:bottom 0.4s linear"></div>
          </div>`);
        // Travels up the ring's left edge, not straight through the center where
        // the heroine sits — reads as "hits the ring," not "hits the person."
        setTimeout(() => {
          const b = document.getElementById('sp-intro-bullet3');
          if (b) b.style.bottom = '60px';
          SFX.blaster && SFX.blaster();
        }, 900);
        setTimeout(() => {
          const ring = document.getElementById('sp-intro-ring'), b = document.getElementById('sp-intro-bullet3');
          if (b) b.style.opacity = '0';
          if (ring) {
            const rect = ring.getBoundingClientRect();
            spIntroBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
            ring.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
            ring.style.transform = 'scale(1.8)'; ring.style.opacity = '0';
          }
          SFX.win && SFX.win();
        }, 1300);
      }},
      { duration: 3800, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('CATCH POWER UPS AND HEALTH',
          `<div style="position:relative;width:160px;height:130px">
            <img id="sp-intro-hp" src="projectiles/hp_icon.png" alt="" style="position:absolute;top:0;left:18px;width:34px;height:34px;object-fit:contain;transform:translate3d(0,0,0);will-change:transform,opacity;transition:transform 0.9s ease-in,opacity 0.2s">
            <img id="sp-intro-pu" src="projectiles/lightning.png" alt="" style="position:absolute;top:0;right:18px;width:34px;height:34px;object-fit:contain;filter:drop-shadow(0 0 8px rgba(255,230,26,0.65));transform:translate3d(0,0,0);will-change:transform,opacity;transition:transform 0.9s ease-in,opacity 0.2s">
            <div id="sp-intro-ship" style="position:absolute;bottom:0;left:50%;width:0;height:0;border-left:17px solid transparent;border-right:17px solid transparent;border-bottom:28px solid #00e5ff;transform:translateX(-50%) translateX(0px);transition:transform 0.9s ease-in-out"></div>
            <div id="sp-intro-check" style="position:absolute;bottom:38px;left:50%;transform:translateX(-50%);font-size:28px;color:#33ff66;opacity:0;transition:opacity 0.3s">✓</div>
          </div>`);
        // Explicit, one-at-a-time catches: the ship visibly drifts under each item as
        // it falls so its nose actually meets the pickup, instead of both items
        // landing near a stationary ship and just disappearing.
        setTimeout(() => {
          const hp = document.getElementById('sp-intro-hp'), s = document.getElementById('sp-intro-ship');
          if (hp) hp.style.transform = 'translate3d(0,88px,0)';
          if (s) s.style.transform = 'translateX(-50%) translateX(-47px)';
        }, 300);
        setTimeout(() => {
          const hp = document.getElementById('sp-intro-hp'), s = document.getElementById('sp-intro-ship');
          if (hp) hp.style.opacity = '0';
          if (s) { const rect = s.getBoundingClientRect(); spIntroBurst(rect.left + rect.width / 2, rect.top); }
          SFX.powerupCollect && SFX.powerupCollect();
        }, 1200);
        setTimeout(() => {
          const pu = document.getElementById('sp-intro-pu'), s = document.getElementById('sp-intro-ship');
          if (pu) pu.style.transform = 'translate3d(0,88px,0)';
          if (s) s.style.transform = 'translateX(-50%) translateX(47px)';
        }, 1500);
        setTimeout(() => {
          const pu = document.getElementById('sp-intro-pu'), s = document.getElementById('sp-intro-ship');
          if (pu) pu.style.opacity = '0';
          if (s) { const rect = s.getBoundingClientRect(); spIntroBurst(rect.left + rect.width / 2, rect.top); }
          SFX.powerupCollect && SFX.powerupCollect();
        }, 2400);
        setTimeout(() => {
          const s = document.getElementById('sp-intro-ship');
          if (s) s.style.transform = 'translateX(-50%) translateX(0px)';
        }, 2700);
        setTimeout(() => {
          const check = document.getElementById('sp-intro-check');
          if (check) check.style.opacity = '1';
        }, 3200);
      }},
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('USE YOUR POWERUPS',
          `<div style="position:relative;width:190px;height:90px;display:flex;flex-direction:column;align-items:center;gap:10px">
            <div style="position:relative;width:44px;height:44px">
              <div id="sp-intro-socket" style="width:44px;height:44px;border-radius:50%;background:#1a1530;border:3px solid #ffe61a;display:flex;align-items:center;justify-content:center;transition:border-color 0.4s ease-out,opacity 0.4s ease-out,box-shadow 0.4s ease-out;box-shadow:0 0 14px rgba(255,230,26,0.5)"><img src="projectiles/lightning.png" alt="" style="width:30px;height:30px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(255,230,26,0.65))"></div>
              <div id="sp-intro-tap" style="position:absolute;top:0;left:0;width:44px;height:44px;border-radius:50%;border:3px solid #fff;opacity:0;transition:transform 0.5s ease-out,opacity 0.5s ease-out"></div>
            </div>
            <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:1px;color:rgba(242,239,232,0.5);text-align:center;white-space:nowrap;width:190px">TAP A POWER TO USE IT</div>
          </div>`);
        // Lit (held) → tap ripple → fades to the same dim/gray empty look the real
        // socket uses once spent, so the demo matches the actual in-game states.
        setTimeout(() => {
          const tap = document.getElementById('sp-intro-tap');
          if (tap) { tap.style.opacity = '0.8'; tap.style.transform = 'scale(1.5)'; }
          SFX.neonOn && SFX.neonOn();
        }, 900);
        setTimeout(() => {
          const tap = document.getElementById('sp-intro-tap');
          if (tap) tap.style.opacity = '0';
        }, 1300);
        setTimeout(() => {
          const socket = document.getElementById('sp-intro-socket');
          if (socket) {
            socket.style.borderColor = 'rgba(150,150,160,0.35)';
            socket.style.boxShadow = 'none';
            socket.style.opacity = '0.4';
          }
        }, 1350);
      }},
    ];
    steps._ann = ann;
    ctrl = spPlayIntroSteps(steps, () => { ann.remove(); onDone(); }, skipIntro);
  }
  // Small DOM/CSS particle burst — same idea as the canvas miniExplosion(), but for
  // intro mockups that live outside the canvas, in screen (fixed) coordinates.
  function spIntroBurst(x, y) {
    for (let k = 0; k < 12; k++) {
      const p = document.createElement('div');
      const angle = (k / 12) * Math.PI * 2, dist = 30 + Math.random() * 24;
      const size = 6 + Math.random() * 8;
      const rot = Math.floor(Math.random() * 90);
      const color = k % 3 === 0 ? '#fff2a3' : k % 3 === 1 ? '#ffe61a' : '#ff8844';
      p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size * 0.72}px;background:${color};clip-path:polygon(50% 0,100% 35%,82% 100%,20% 86%,0 28%);box-shadow:0 0 0 2px rgba(0,0,0,0.35);z-index:9999;pointer-events:none;transition:transform 0.45s steps(4,end),opacity 0.45s steps(4,end)`;
      document.body.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) rotate(${rot + 120}deg)`;
        p.style.opacity = '0';
      });
      setTimeout(() => p.remove(), 500);
    }
  }

  function spaceBriefingFace(ci, mode) {
    const gc = GAME_CHARS[ci];
    const isCaptor = mode === 'captor';
    const isZapped = mode === 'zapped';
    const isCarried = mode === 'carried';
    const border = isCaptor ? '#ff4444' : (isZapped || isCarried) ? '#00e5ff' : 'rgba(225,245,255,0.85)';
    const bg = isCaptor ? 'rgba(255,68,68,0.16)' : (isZapped || isCarried) ? 'rgba(0,229,255,0.11)' : 'rgba(120,210,255,0.1)';
    const glow = isCaptor ? 'rgba(255,68,68,0.46)' : (isZapped || isCarried) ? 'rgba(0,229,255,0.42)' : 'rgba(170,225,255,0.55)';
    const anim = isCaptor ? 'sp-brief-traitor-pop 0.62s ease-out both' : isCarried ? 'sp-brief-captive-out 1.6s ease-in both' : 'sp-brief-rock 1.65s ease-in-out infinite';
    const wash = isCaptor
      ? `<div style="position:absolute;inset:-6px;border-radius:15px;border:2px solid rgba(255,68,68,0.78);box-shadow:0 0 18px rgba(255,68,68,0.62);pointer-events:none"></div>
         <div style="position:absolute;inset:-10px;border-radius:17px;border:1px solid rgba(255,68,68,0.28);box-shadow:0 0 22px rgba(255,68,68,0.3);pointer-events:none"></div>`
      : (isZapped || isCarried)
        ? `<div style="position:absolute;inset:0;background:rgba(0,229,255,0.16);mix-blend-mode:screen;pointer-events:none"></div>
           <div style="position:absolute;left:-18%;right:-18%;top:46%;height:3px;background:#eaffff;box-shadow:0 0 10px #00e5ff;transform:rotate(-16deg);pointer-events:none"></div>`
        : '';
    const ring = (isZapped || isCarried)
      ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid #00e5ff;box-shadow:0 0 14px rgba(0,229,255,0.75);animation:sp-ring-spin 2.2s linear infinite;pointer-events:none"></div>`
      : '';
    const label = isCaptor ? 'TRAITOR' : '';
    const faceExpr = (isZapped || isCarried) ? 'sad' : mode === 'happy' ? 'happy' : 'normal';
    const boxSize = isCaptor || isZapped || isCarried ? 68 : 62;
    return `<div class="sp-brief-face" style="width:${boxSize}px;text-align:center;font-family:'VCR',monospace;font-size:7.5px;letter-spacing:1px;color:${isCaptor ? border : 'rgba(242,239,232,0.68)'};transition:transform 0.35s ease,opacity 0.35s ease;animation:${anim};animation-delay:${(ci % 6) * 0.08}s">
      <div style="position:relative;width:${boxSize}px;height:${boxSize}px;border-radius:${isCaptor || isZapped || isCarried ? '13px' : '50%'};overflow:visible;border:${isCaptor || isZapped || isCarried ? `2px solid ${border}` : `1.5px solid ${border}`};background:${bg};box-shadow:0 0 ${isCaptor || isZapped || isCarried ? '15px' : '11px'} ${glow};${isCaptor ? 'filter:saturate(1.28) contrast(1.06)' : ''}">
        ${ring}
        <div style="position:absolute;inset:-5px">${charFace(gc, faceExpr)}</div>
        ${wash}
      </div>
      <div style="margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(242,239,232,0.68)">${gc.name}</div>
      ${label ? `<div style="margin-top:2px;color:${border}">${label}</div>` : ''}
    </div>`;
  }

  function spaceBriefingBoss(mode) {
    const anim = mode === 'out' ? 'sp-brief-boss-out 1.6s ease-in both' : (mode === 'hold' ? 'none' : 'sp-brief-boss-in 0.9s cubic-bezier(.2,1.15,.35,1) both');
    return `<div style="width:118px;text-align:center;font-family:'VCR',monospace;font-size:9px;letter-spacing:2px;color:#cc66ff;animation:${anim}">
      <div style="position:relative;width:118px;height:118px;margin:0 auto;border-radius:50%;background:radial-gradient(circle,rgba(185,135,255,0.24) 0 48%,rgba(185,135,255,0.06) 64%,rgba(25,4,46,0) 76%);border:3px solid #8e55d8;box-shadow:0 0 30px rgba(142,85,216,0.72), inset 0 -14px 20px rgba(0,0,0,0.3)">
        <div style="position:absolute;inset:-12px;border-radius:50%;border:2px solid rgba(142,85,216,0.68);box-shadow:0 0 24px rgba(142,85,216,0.48);animation:sp-ring-spin 3s linear infinite"></div>
        <img src="bosses/boss_gizmo.png" alt="" style="position:absolute;left:50%;top:50%;width:116px;height:116px;object-fit:contain;transform:translate(-50%,-52%);filter:drop-shadow(0 0 16px rgba(185,135,255,0.82))">
      </div>
      <div style="margin-top:8px;color:#d8c6a0">GIZMO</div>
    </div>`;
  }

  function spaceBriefingPilot() {
    const gc = GAME_CHARS[activeChar];
    // Small ship glyph riding just above the pilot's face — same hull color and nose
    // shape as the actual in-game ship (drawPlayer()), so it reads as "this is who
    // you're about to fly," not just a generic decoration. It shares the parent's
    // sp-brief-pilot-ship animation, so it flies in and back out together with the rest.
    const shipGlyph = `<div style="width:0;height:0;margin:0 auto 6px;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:19px solid ${gc.color};filter:drop-shadow(0 0 8px ${gc.color}99)"></div>`;
    return `<div style="width:min(92vw,360px);height:268px;position:relative;text-align:center">
      <div style="position:absolute;left:50%;top:0;width:100%;animation:sp-brief-pilot-ship 5.05s cubic-bezier(.2,1.02,.28,1) both">
        ${shipGlyph}
        <div style="font-family:'VCR',monospace;font-size:15px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 12px #33ff66;margin-bottom:10px">PILOT ONLINE</div>
        <div style="width:122px;height:122px;margin:0 auto 12px;border-radius:18px;overflow:hidden;border:3px solid ${gc.color};background:${gc.color}22;box-shadow:0 0 28px ${gc.color}77">${charFace(gc, 'normal')}</div>
        <div style="font-family:'Bebas Neue',cursive;font-size:43px;letter-spacing:5px;line-height:0.96;color:#33ff66;text-shadow:0 0 18px #33ff6688">IT'S UP TO ME NOW!</div>
        <div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;color:rgba(242,239,232,0.56);margin-top:12px">BREAK THE BLUE RINGS. BRING THEM HOME.</div>
      </div>
    </div>`;
  }

  function showSpaceRescueBriefing(onDone) {
    spaceBriefingTimers.forEach(clearTimeout);
    spaceBriefingTimers = [];
    const ov = document.createElement('div');
    ov.className = 'space-rescue-briefing';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,1,16,0);transition:background 0.35s ease;pointer-events:auto';
    const starsHTML = Array.from({length:38}, (_, i) => {
      const left = Math.round(Math.random() * 1000) / 10;
      const top = Math.round(Math.random() * 1000) / 10;
      const size = Math.round((1 + Math.random() * 2.2) * 10) / 10;
      const dur = Math.round((2.8 + Math.random() * 3.5) * 10) / 10;
      const delay = Math.round(Math.random() * 30) / -10;
      const alpha = Math.round((0.35 + Math.random() * 0.5) * 100) / 100;
      return `<i style="position:absolute;left:${left}%;top:${top}%;width:${size}px;height:${size}px;border-radius:50%;background:rgba(234,255,255,${alpha});box-shadow:0 0 ${size * 4}px rgba(90,177,255,0.65);animation:sp-brief-star-drift ${dur}s linear ${delay}s infinite"></i>`;
    }).join('');
    const cast = [...missionEnemyChars, ...missionTrappedChars];
    const castGrid = (captorMode, zappedMode, excludeCaptors) => cast.filter(ci => !(excludeCaptors && missionEnemyChars.includes(ci))).map(ci => {
      const mode = missionEnemyChars.includes(ci) ? captorMode : zappedMode;
      return spaceBriefingFace(ci, mode);
    }).join('');
    ov.innerHTML = `
      <div aria-hidden="true" style="position:absolute;inset:0;overflow:hidden;pointer-events:none">${starsHTML}</div>
      <div id="space-brief-card" style="width:min(94vw,430px);text-align:center;transform:scale(0.96);opacity:0;transition:transform 0.35s ease,opacity 0.35s ease">
      </div>`;
    document.body.appendChild(ov);
    const card = ov.querySelector('#space-brief-card');
    function setStage(html) {
      if (!document.body.contains(ov)) return;
      card.style.opacity = '0';
      card.style.transform = 'scale(0.97)';
      const t = setTimeout(() => {
        if (!document.body.contains(ov)) return;
        card.innerHTML = html;
        requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = 'scale(1)';
        });
      }, 230);
      spaceBriefingTimers.push(t);
    }
    const gridStyle = "display:grid;grid-template-columns:repeat(4,58px);justify-content:center;gap:12px 14px";
    const normalDayStage = `
      <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:4px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;animation:sp-brief-line-in 0.35s ease-out both">ON A NORMAL MOBE DAY</div>`;
    const castStage = `
      <div style="font-family:'Bebas Neue',cursive;font-size:40px;letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 18px #ffe61a88;margin-bottom:14px;animation:sp-brief-line-in 0.35s ease-out both">12 MOBES WERE FROLICKING</div>
      <div style="${gridStyle}">${castGrid('normal', 'normal')}</div>`;
    const traitorLineStage = `
      <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:4px;color:#ff4444;text-shadow:0 0 12px #ff4444;animation:sp-brief-line-in 0.35s ease-out both">BUT TWO OF THEM WERE TRAITORS</div>`;
    const captorStage = `
      <div style="display:flex;justify-content:center;gap:18px;margin-bottom:10px">${missionEnemyChars.map(ci => spaceBriefingFace(ci, 'captor')).join('')}</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:52px;letter-spacing:5px;line-height:0.96;color:#ff4444;text-shadow:0 0 20px #ff444488;margin-bottom:14px;animation:sp-brief-line-in 0.35s ease-out both">"COME HERE, GIZMO"</div>
      <div style="${gridStyle}">${castGrid('captor', 'normal', true)}</div>`;
    const bossLineStage = `
      <div style="font-family:'Bebas Neue',cursive;font-size:48px;letter-spacing:5px;line-height:0.96;color:#cc66ff;text-shadow:0 0 18px #cc66ff88;animation:sp-brief-line-in 0.35s ease-out both">EVIL GIZMO TOOK THE MOBES CAPTIVE</div>`;
    const bossCaptureStage = `
      <div style="display:flex;justify-content:center;gap:16px;margin-bottom:8px">${missionEnemyChars.map(ci => `<div style="transform:scale(0.82);transform-origin:center bottom">${spaceBriefingFace(ci, 'captor')}</div>`).join('')}</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:12px">${spaceBriefingBoss('in')}</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:44px;letter-spacing:5px;line-height:1;color:#00e5ff;text-shadow:0 0 18px #00e5ff88;margin-bottom:10px;opacity:0;animation:sp-brief-line-in 0.42s ease-out 1.1s both">CAPTIVE RINGS LOCKED!</div>
      <div style="${gridStyle};opacity:0;animation:sp-brief-line-in 0.42s ease-out 1.18s both">${castGrid('captor', 'zapped', true)}</div>`;
    // Sand grains scattered over the line's footprint, each drifting off in roughly
    // the same direction the text itself blurs/slides toward (sp-brief-dust-away),
    // so the line reads as crumbling into sand and blowing away rather than just fading.
    const sandGrainsHTML = Array.from({ length: 22 }, () => {
      const x = Math.round(Math.random() * 1000) / 10;
      const y = Math.round(40 + Math.random() * 20);
      const dx = Math.round(40 + Math.random() * 70);
      const dy = Math.round(-26 + Math.random() * 30);
      const size = Math.round((1.4 + Math.random() * 2.6) * 10) / 10;
      const delay = (2.05 + Math.random() * 0.55).toFixed(2);
      const dur = (0.7 + Math.random() * 0.5).toFixed(2);
      return `<i style="position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:#ff9ad6;box-shadow:0 0 ${size * 2}px rgba(255,154,214,0.7);--dx:${dx}px;--dy:${dy}px;animation:sp-brief-sand-grain ${dur}s ease-out ${delay}s forwards"></i>`;
    }).join('');
    const abductStage = `
      <div style="min-height:232px;display:flex;align-items:center;justify-content:center;position:relative">
        <div style="font-family:'Bebas Neue',cursive;font-size:38px;letter-spacing:5px;line-height:0.98;color:#ff76d2;text-shadow:0 0 18px #ff76d288;opacity:0;animation:sp-brief-line-in 0.34s ease-out 0.14s both, sp-brief-dust-away 0.9s ease-in 2.1s forwards;text-align:center;max-width:100%">THEY VANISHED INTO SPACE</div>
        <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none">${sandGrainsHTML}</div>
      </div>`;
    const pilotStage = spaceBriefingPilot();
    requestAnimationFrame(() => {
      ov.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    card.innerHTML = normalDayStage;
    SFX.missionSignal && SFX.missionSignal();
    [
      [2000, castStage, 'missionBirds'],
      [5600, traitorLineStage, 'missionOminous'],
      [8600, captorStage, 'missionCaptor'],
      // +500ms here so "COME HERE, GIZMO" holds half a second longer — every stage
      // after it just shifts later by the same amount, keeping its own pacing intact.
      [11800, bossLineStage, 'missionBossCharge'],
      [14500, bossCaptureStage, null],
      [15600, null, 'missionZap'],
      [16050, null, 'missionJail'],
      [20200, abductStage, 'missionOminous'],
      [24400, pilotStage, 'missionHero'],
    ].forEach(([delay, html, cue]) => {
      const timer = setTimeout(() => {
        if (cue && SFX[cue]) SFX[cue]();
        if (html) setStage(html);
      }, delay);
      spaceBriefingTimers.push(timer);
    });
    const finishTimer = setTimeout(() => {
      if (!document.body.contains(ov)) return;
      ov.style.background = 'rgba(3,1,16,0)';
      card.style.opacity = '0';
      card.style.transform = 'scale(1.04)';
      const removeTimer = setTimeout(() => {
        if (!document.body.contains(ov)) return;
        ov.remove();
        onDone();
      }, 350);
      spaceBriefingTimers.push(removeTimer);
    }, 29400);
    spaceBriefingTimers.push(finishTimer);
  }

  window.spaceStart=function(){
    ArcadeMusic.stop();
    activeChar=getGlobalChar();
    prepareSpaceMission();
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    const beginRun = () => {
      reset(); state='playing'; raf=requestAnimationFrame(loop);
    };
    const briefThenBegin = () => showSpaceRescueBriefing(beginRun);
    if (!spaceIntroShown) {
      spaceIntroShown = true;
      spaceIntroSteps(briefThenBegin);
      return;
    }
    briefThenBegin();
  };
  window.spaceDebugJump=function(startWave){
    ArcadeMusic.stop();
    activeChar=getGlobalChar();
    prepareSpaceMission();
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    cancelAnimationFrame(raf);
    reset();
    clearSpaceRuntimeTimers();
    beginConfiguredWave(Math.max(1, parseInt(startWave, 10) || 1));
    state='playing';
    raf=requestAnimationFrame(loop);
  };
  window.spaceDebugBoss=function(bossName){
    ArcadeMusic.stop();
    activeChar=getGlobalChar();
    prepareSpaceMission();
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    cancelAnimationFrame(raf);
    reset();
    clearSpaceRuntimeTimers();
    beginConfiguredWave(8, bossName);
    state='playing';
    raf=requestAnimationFrame(loop);
  };
  window.spacePause=function(){
    clearSpaceRuntimeTimers();spaceBriefingTimers.forEach(clearTimeout);spaceBriefingTimers=[];cancelAnimationFrame(raf);state='idle';
    document.querySelectorAll('.space-rescue-briefing').forEach(el => el.remove());
    const _ov=document.getElementById('space-overlay');
    if(_ov) _ov.classList.add('hidden');
  };
  window.initSpace=function(){
    activeChar=getGlobalChar();
    canvas=document.getElementById('space-canvas');
    if(!canvas)return;
    // Always unhide the overlay when entering the space page
    const _ov=document.getElementById('space-overlay');
    if(_ov) _ov.classList.remove('hidden');
    ctx=canvas.getContext('2d');
    state='idle';
    if(!canvas._spaceTouchReady){
      canvas._spaceTouchReady=true;
      function getTouchPos(touch){
        const rect=canvas.getBoundingClientRect();
        return {
          x: (touch.clientX-rect.left)*(W/rect.width),
          y: (touch.clientY-rect.top)*(H/rect.height)
        };
      }
      // Movement reads touch X only (ship Y is fixed) across the whole canvas width,
      // so the socket column needs its own reserved hit-zone on touchstart — a tap
      // there deploys instead of moving the ship. _touchOnSocket maps touch ids to
      // whether that individual pointer started on a socket.
      const _touchOnSocket = new Map();
      canvas.addEventListener('touchstart',e=>{
        e.preventDefault();
        if(state!=='playing') return;
        for(const touch of e.changedTouches){
          const {x:tx,y:ty}=getTouchPos(touch);
          const hitType=hitSocket(tx,ty);
          if(hitType){
            _touchOnSocket.set(touch.identifier, true);
            deploySocket(hitType);
          } else {
            _touchOnSocket.set(touch.identifier, false);
            player.x=Math.max(player.r,Math.min(W-player.r,tx));
          }
        }
      },{passive:false});
      canvas.addEventListener('touchmove',e=>{
        e.preventDefault();
        if(state!=='playing') return;
        for(const touch of e.changedTouches){
          if(_touchOnSocket.get(touch.identifier)) continue;
          const {x:tx}=getTouchPos(touch);
          player.x=Math.max(player.r,Math.min(W-player.r,tx));
        }
      },{passive:false});
      canvas.addEventListener('touchend',e=>{
        for(const touch of e.changedTouches) _touchOnSocket.delete(touch.identifier);
      },{passive:true});
      canvas.addEventListener('touchcancel',e=>{
        for(const touch of e.changedTouches) _touchOnSocket.delete(touch.identifier);
      },{passive:true});
      // Desktop: click a socket to deploy it, or number keys 1-4 as a shortcut.
      canvas.addEventListener('click',e=>{
        if(state!=='playing') return;
        const rect=canvas.getBoundingClientRect();
        const cx=(e.clientX-rect.left)*(W/rect.width);
        const cy=(e.clientY-rect.top)*(H/rect.height);
        const hitType=hitSocket(cx,cy);
        if(hitType) deploySocket(hitType);
      });
      document.addEventListener('keydown',e=>{
        if(state!=='playing' || !document.body.classList.contains('on-space')) return;
        const idx={'1':0,'2':1,'3':2}[e.key];
        if(idx!==undefined) deploySocket(SOCKET_TYPES[idx]);
      });
    }
    // rAF ensures the page has painted before we measure canvas dimensions
    requestAnimationFrame(function(){
      try {
        fitSpaceCanvas();
        mkStars();
        showSpaceOverlay('select');
      } catch(err) {
        const ov=document.getElementById('space-overlay');
        if(ov) { ov.classList.remove('hidden'); ov.innerHTML='<div style="color:#ff4444;font-family:monospace;font-size:11px;padding:20px;white-space:pre-wrap;word-break:break-all">SPACE MOBE ERROR:\n'+err.message+'\n\n'+err.stack+'</div>'; }
      }
    });
  };

  // Re-fit on rotate/resize while the page is actually visible — otherwise turning
  // an iPad from portrait to landscape (or just resizing a desktop window) would
  // leave the canvas at its old size until the next full reset(). Debounced since
  // resize/orientationchange can fire several times in quick succession.
  let _spaceFitTimer = null;
  function _spaceRefit() {
    clearTimeout(_spaceFitTimer);
    _spaceFitTimer = setTimeout(() => {
      if (!document.body.classList.contains('on-space') || !canvas) return;
      const oldW = W, oldH = H;
      fitSpaceCanvas();
      if (player && oldW) {
        player.x = Math.min(Math.max(player.r, player.x * (W / oldW)), W - player.r);
        player.y = H - SPACE_SHIP_BOTTOM_OFFSET;
        socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
        dangerY = socketAnchorY + (H - socketAnchorY) * 0.5;
      }
      mkStars();
    }, 150);
  }
  window.addEventListener('resize', _spaceRefit);
  window.addEventListener('orientationchange', _spaceRefit);
})();

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
