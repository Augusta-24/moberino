# Arcade Performance Audit - 2026-07-01

Scope: Arcade only (lobby, whack, match, space). No main-site analysis.

## Executive summary

Primary runtime risk is render cost in Space during dense moments, not raw JS execution speed.
Primary load-time risk is media payload strategy (large character image set eagerly loaded + large lobby music file).
Primary interaction risk on mobile is scroll/animation contention in UI surfaces with rich effects.

## Measured size baseline

- arcade.html: 22,071 bytes
- js/arcade.js: 74,928 bytes
- js/games/space.js: 468,365 bytes
- js/games/whack.js: 104,668 bytes
- js/games/match.js: 35,736 bytes
- css/arcade.css: 27,299 bytes
- css/games/space.css: 11,081 bytes
- css/games/whack.css: 14,359 bytes
- css/games/match.css: 7,479 bytes
- arcademusic.mp3: 5,172,662 bytes

Directory weights:
- characters: ~16 MB
- bosses: ~1.8 MB
- assets/space/sfx: ~200 KB
- arcade asset file count (assets + bosses + characters + funsounds + projectiles + thumbnails): 418 files

## High-impact opportunities

1) Lazy-load character images instead of eager-loading every variant at startup.
- Evidence: eager preload loop in js/arcade.js preloads img + whack + happy + sad for all characters.
- Location: js/arcade.js line region around GAME_CHARS preload.
- Why it matters: characters directory is ~16 MB; this creates avoidable startup network/decode pressure.

2) Reduce initial music payload strategy for first meaningful paint.
- Evidence: arcade music fetched and decoded from a single ~4.9 MB file.
- Location: js/arcade.js music loader fetch/decode path.
- Why it matters: decode + transfer can delay responsiveness on mobile and lower-end devices.

3) Add adaptive Space render quality on slower devices.
- Evidence: Space canvas runs with DPR up to 2.5 and multiple visual effects in heavy scenes.
- Locations: js/games/space.js fitSpaceCanvas DPR setup and projectile/effect draw paths.
- Why it matters: high DPR + effect-rich frames can cause frame pacing drops.

## Likely lag hotspots

Space rendering hot paths:
- Projectile and FX drawing loops include many shadow/glow branches and transforms in dense scenes.
- Even with prior optimizations, many shadowBlur usage points remain in space draw stack.
- Candidate areas include enemy/projectile draw themes and boss effect branches.

Canvas scaling:
- fitSpaceCanvas uses up to 2.5 DPR which is expensive on high-res phones.
- In high-action scenes, lowering max DPR dynamically can stabilize frame time.

Audio object churn:
- Space SFX file path clones audio nodes per play for overlap.
- Good for mix quality, but can create decode/playback churn under bursty events.

UI/compositor cost:
- Multiple blur/drop-shadow and backdrop-filter uses in shell and game overlays.
- These are visually strong but can cost extra on mobile GPUs.

## Medium-impact opportunities

1) Defer non-critical leaderboard remote fetch until idle after first UI settle.
- Evidence: loadRemoteBoard calls are integrated into result and board surfaces.
- Impact: small but helps reduce main-thread/network contention at key transitions.

2) Audit animation timer density in Space/Whack.
- Many setTimeout/setInterval chains are intentional for gameplay pacing.
- A pass to coalesce cosmetic timers into frame-driven updates can reduce jitter under load.

3) Minimize clone-heavy carousel work on touch paths.
- Mobile path already improved with native snap direction.
- Keep clone-wrap and scripted centering limited to fine-pointer environments.

## Low-impact opportunities

1) Reduce decorative filter intensity where equivalent visual read exists.
- Keep style identity while reducing expensive blur/drop-shadow combinations in stacked layers.

2) Normalize image asset dimensions and compression for characters/bosses.
- Use target display-size aware exports and modern formats where pipeline allows.

## Suggested optimization sequence (highest ROI first)

1) Character image loading policy
- Move from eager all-variant preload to demand-driven + short lookahead cache.
- Expected gain: noticeably faster startup and lower memory/network pressure.

2) Music loading strategy
- Use smaller startup loop or split intro loop from full track.
- Expected gain: faster first-interaction responsiveness on mobile.

3) Adaptive Space quality mode
- Add dynamic max DPR cap and optional FX reduction when frame time degrades.
- Expected gain: smoother mid/late-wave frame pacing.

4) Effects pass
- Profile and reduce shadowBlur/backdrop-filter layers in highest-frequency paths.
- Expected gain: fewer micro-stutters on older devices.

## No-compromise startup strategy (music + character always ready)

Constraint: never allow a game to launch without music and character art ready.

1) Intent-driven prewarm from lobby focus
- When a carousel card becomes centered, prewarm only that game's critical assets and audio path.
- This converts idle browsing time into readiness time without blocking first paint.

2) Character-priority preload, not full cast preload
- Always preload selected character's core variants first (normal/happy/sad/whack) as mandatory set.
- Then preload adjacent likely picks and only later the full long-tail set.
- Guarantees launch correctness while reducing startup payload spikes.

3) Launch gating with fast-ready handshake
- Game launch button should wait until a minimal readiness contract is satisfied:
	- selected character variants decoded,
	- game-specific first-scene assets decoded,
	- music channel started/ready.
- If not ready, keep player on an explicit short transition state (not silent gameplay).

4) Music path with guaranteed continuity
- Keep a tiny always-ready lobby/music stem active, then crossfade to full mix once decoded.
- Never start gameplay in silence; never rely on deferred decode mid-action.

5) Background opportunistic fill
- Use idle time after readiness to hydrate secondary assets (boss extras, cosmetic variants, remote leaderboard fetches).
- Protect frame budget by pausing opportunistic work during active gameplay spikes.

6) Cache policy by session stage
- Lobby: prioritize startup-critical assets.
- In-game: prioritize near-future wave assets and active character states.
- Post-game: hydrate next likely mode.

7) Repeat-visit acceleration
- Use persistent browser caching/service worker for immutable arcade assets to avoid re-downloading heavy image sets.
- Versioned cache keys prevent stale asset bugs.

## Verification checklist after optimization

- Lobby reaches interactive state quickly on mobile data/Wi-Fi variance.
- Carousel swipe settles without hitching over repeated rapid swipes.
- Space Wave 3 and dense boss scenes hold stable frame pacing.
- Audio remains clear without clipping or delayed trigger feel.
- No regressions in mode selection, onboarding readability, and game-over/leaderboard flow.

## References

- js/arcade.js
- js/games/space.js
- css/arcade.css
- css/games/space.css
- characters/
- assets/space/sfx/
- arcademusic.mp3
