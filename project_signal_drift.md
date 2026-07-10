# Signal Drift Memory

- Signal Drift ("Space and Sound") is a pentatonic live-capture looper: every action plays now and stamps into the nearest step of a 16-step loop (`LOOP_STEPS` in `js/games/signal.js`).
- Modes: BUILD A TRACK (Guided or Free Build), PLAY ALONG (one listen pass, then a repeat pass), FREE PLAY (multi-layer sandbox — the loop persists across layer switches and can be saved from the layer menu), JUKEBOX (local + Supabase recipes).
- Layer order is DRUMS -> BASS -> KEYS -> CHIMES -> SWELL -> FX.
- Tempo comes from setup presets (chill / medium / fast); the 3-2-1 countdown runs at the loop's own tempo (`tempoBeatMs`), not a fixed 1s.
- Groove assist is internal only and never exposed in setup UI: Guided = `snap` (full quantize), Free Build = `light`.
- Guided flow: practice -> READY -> first note starts recording from step 0 -> one loop -> review with KEEP / ADD MORE / START OVER / FINISH TRACK (finish is available at any layer). The big bottom coach buttons own all guided actions; the top bar carries only UNDO (record stage) and the exit ×.
- CHIMES is a hold-and-pull orb BY DESIGN (owner loves the wheel + pull mechanic — do not convert to pads). A tap plays the note at the pulled angle immediately; hold still drifts on step boundaries.
- SWELL answers plain taps (one chord at the touch point) and hold-slide painting; the first swell touch starts the guided take like every other layer.
- The game's audio chain is its own gain -> compressor -> destination (`SIGNAL_MASTER_GAIN` 2.6, limiter -6dB/6:1). It intentionally ignores the arcade ♪ music mute.
- Legacy ship / bullet / boss code paths remain dormant in `js/games/signal.js` for a possible boss-duet finale; `shoot()` is no longer reachable from any music layer.
