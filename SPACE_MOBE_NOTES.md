# Space Mobe — Developer Reference

Written at the end of a long build session, for whoever (human or Claude) opens
this project next with zero context. Space Mobe is one of three arcade
mini-games in `index.html` (the others are Whack-a-Mobe and Memory Mobe). All
three are self-contained IIFEs in one giant single-file site — no build step,
no modules. Space Mobe's IIFE runs roughly **line 7843 to line 10528** of
`index.html` (search for `SPACE MOBE — Vertical Scroller` to jump to the top).

Line numbers below will drift as the file is edited — treat them as "roughly
here," and re-grep the function/variable names if a number looks wrong.

## What the game is

A vertical-scroller shooter. Ship sits near the bottom, auto-fires upward,
moves left/right (touch-drag, arrow keys, or A/D). Asteroids and enemy faces
fall from the top; a dashed "danger line" near the ship is the lose-condition
— let too much cross it and you lose HP, eventually game over. Waves escalate
via `waveConfig(w)` (smooth difficulty ramp — speed, spawn rate, asteroid mix).

## The wave/theme system

This is the architectural backbone of most of what's been built on top.

- `WAVE_THEMES` (array) — the pool of possible "special wave" types.
- `THEME_LABEL` (object) — display name shown on the wave announcement for
  each theme key.
- `THEME_MIN_WAVE` (3), `THEME_COOLDOWN` (1), `THEME_CHANCE` (0.5) — wave 1-2
  are always plain, from wave 3 on there's a 50% ("every other wave") chance
  of rolling a theme from the pool. No theme rolled → wave just says
  "SURVIVE."
- `pickWaveTheme(w)` — does the roll. Returns `null` or one theme key.
- `waveTheme` — the currently active theme for the wave in progress, or
  `null`. Almost every theme-specific branch elsewhere in the code checks
  this variable directly.
- **BOSS is just a theme now**, not a separate "every 3rd wave" rule (that's
  how it used to work — was ripped out). `'boss'` and `'captive'` are both
  theme-pool entries; both spawn a real boss fight (`spawnBoss(isCaptive)`),
  one with a jail-cell reskin. Because only one theme is ever picked per
  wave, a boss fight can never accidentally land on the same wave as a
  ghost/emp mini-boss theme — that used to need explicit wave-number-based
  filtering, it doesn't anymore.
- **Known unresolved wrinkle**: the pool filter only excludes `ghost`/`emp`
  from being picked on what *used to be* boss waves — there's no such
  filtering needed anymore since boss-ness is just one theme among many. Not
  a bug, just flagged in case a "boss wave also rolled something deeply
  incongruous" complaint ever comes up — hasn't been reported as an issue.

### Wave transition / announcement

`nextWave()` → `announceWave(wave, durationMs, onDone)`. Sequence:
1. `waveTransitioning = true` (guards against the per-frame "wave cleared"
   check re-firing `nextWave()` every frame — this caused a real bug once:
   dozens of stacked overlapping banners).
2. A full-width dark overlay fades in, behind which a **slot-machine spin**
   cycles through random theme labels before landing on the real one (~1.7s
   of spins, decelerating, then holds on the result). Total duration is
   `5200ms` (`announceMs` in `nextWave()`).
3. Wave doesn't actually end until `obstacles.length === 0 && spawnsRemaining
   <= 0 && powerups.length === 0` — i.e. nothing is still visibly falling
   when the dark break screen shows. All three powerup schedulers
   (`scheduleHpPowerup`, `schedulePowerup`, `scheduleMysteryBox`) also check
   `!waveTransitioning` before spawning, so nothing new appears mid-break
   either.
4. `onDone` fires `startWaveSpawn`, and theme-specific spawns (`spawnBoss`,
   `spawnMiniBoss`, `spawnMirrorEnemy`, `SFX.neonOn()`).

If you need to change how long the break/announcement feels, `announceMs` in
`nextWave()` is the one number to touch — everything else (spin timing,
backdrop fade) is proportional to it.

## Every theme, what it actually does

| Theme key | Label shown | Behavior |
|---|---|---|
| `asteroids` | ALL ASTEROIDS | `asteroidRatio` forced to 1, no per-rock jitter (uniform speed "rain"), triple-spawns per tick, pool tripled so the wave doesn't end early |
| `ghost` | GHOST ATTACK | Spawns a mini-boss (`spawnMiniBoss('ghost')`) that bounces around, teleports, fires ice shots. Pauses normal spawning like a real boss. |
| `captive` | HERO TAKEN CAPTIVE | Real boss fight, jail-cell visual reskin, no minion deploys |
| `rave` | PARTY RAVE MODE | Neon recolor via `C(hex)` lookup (`NEON_PALETTE`), neon stars, spinning disco ball with rotating light beams, periodic confetti bursts (~every 2.8s) |
| `swarm` | SWARM | Many small/weak/fast enemies, asteroid ratio dropped to 0.1, faster spawn cadence |
| `blackout` | BLACKOUT | Radial-gradient vision-limiting vignette around the ship. Delayed via `themeEffectsAt` so it doesn't kick in until the wave announcement has fully cleared. |
| `mirror` | MIRROR ENEMY | One tanky enemy that hovers and continuously tracks `player.x` |
| `bomber` | BOMBER RUN | Enemies dive straight at the player's x instead of pausing to fire. Capped at **3 on screen at once** (was 1, raised after powerups became bankable) |
| `emp` | EMP WARNING | Mini-boss that fires zap shots (triggers the FART/zapped debuff on hit) |
| `goldrush` | GOLD RUSH | Heavy powerup + asteroid rain, no boss |
| `boss` | BOSS | Plain boss fight, no reskin |
| `music` | JAM SESSION | Asteroids/enemies fall **completely normally** — this theme only adds guitar/piano/drum pickups that fall and must be **shot** (not caught) for a sound + 20 points. Pure fun, no added danger. |
| `flip` | REVERSE (displayed) | **Internal key is `flip`, not `reverse`** — `reverse` was already taken by the mystery-box "reversed controls" outcome; using the same string for both would've been confusing even though they're unrelated variables. Obstacles spawn from the bottom and travel upward instead of falling; the danger line relocates to a fixed `REVERSE_LINE_Y` (92, near the top) instead of `dangerY`. Ship-contact damage is disabled for this theme (obstacles are retreating, not attacking) — the only way they hurt you is by escaping past the top line unshot. Implemented via a `spawnObstacle` wrapper that calls the real spawn logic then flips `y`/`vy` on whatever it just pushed, rather than touching every individual `push()` call site. |

## Mini-bosses & bosses

- `boss` (singular, global var) — the real boss. `spawnBoss(isCaptive)`.
- `miniBoss` — ghost/emp encounters. Deliberately a **separate variable** from
  `boss` so the "pause all spawning" behavior doesn't leak between them
  unless explicitly wired (ghost *does* get the full pause treatment, same
  check as a real boss).
- Mini-boss HP/attack pattern: see `spawnMiniBoss(kind)`.

## Powerup inventory (sockets)

Speed/gun/shield/bomb used to apply instantly on catch. Now (except speed,
see below) they're **banked, not applied** — max 1 of each type held, shown
as a socket icon (gray/dim when empty, full color when held) anchored
**bottom-left, just above the danger line** (follows `dangerY` so it
auto-relocates if the canvas re-fits). Tap/click a filled socket to deploy it
— that's when `applyPowerup(type)` actually runs.

- `inventory` — `{ gun, shield, bomb }` (booleans).
- `SOCKET_TYPES`, `SOCKET_COLOR`, `SOCKET_GLYPH` — bomb is orange (`#ff8800`),
  gun is yellow, shield has no glyph (drawn as a hexagon instead).
- `socketRect(i)` / `hitSocket(x,y)` / `deploySocket(type)`.
- Touch: a tap inside the socket column deploys instead of moving the ship
  (`_touchOnSocket` flag suppresses the rest of that gesture's drag). Desktop:
  click, or number keys 1-3.
- Drop interval was doubled when this went in — no longer "use it now or
  it's wasted," so rarer felt right.
- **Speed was removed entirely as a regular pickup/socket.** It still exists
  as a buff (`buffSpeedUntil`) but is now *only* reachable via the rare
  mystery "triple buff" outcome — there is no standalone speed pickup, no
  speed socket. The speed HUD indicator (top-right buff timer list) still
  shows when it's active.

## Mystery box

Used to be: falls slowly, catch it with the ship, roll an outcome. **Now: a
shoot target, not a catch target.** Falls a lot slower, smaller parachute,
purple dashed ring (same rotating-dot visual language as the trapped-hero
rescue ring) that takes **5 bullet hits** (`ringHp`) to break. On the 5th hit
the outcome applies automatically — no need to also touch it with the ship.
Touching it does nothing.

Current outcome pool (`applyPowerup('mystery')`):
- `bigHp` — +25 HP (good)
- `tripleBuff` — speed+gun+shield all at once, **extends** existing time
  rather than resetting it (good)
- `twin` — temporary second ship mirroring yours, auto-fires (good)
- `pizzaBlast` — see below (good, but slow/deliberate)
- `frozen` / `zapped` (displayed as "FARTED") / `reverse` (reversed controls)
  / `tiny` / `rebound` (bad)
- `snowing` — see below (bad)

No plain `bomb` outcome — that outcome was removed early on since bomb is
already a normal pickup with no twist on it.

### Pizza blast

A mystery-only weapon buff (`buffPizzaUntil`). Fires a 5-bullet shotgun
spread of hand-drawn pizza-slice bullets (`isPizza` flag) instead of one
straight shot. Deliberately has its **own separate, much slower firing
timer** (`lastPizzaFire`, ~950ms cadence) and slower bullet speed (`B_SPEED *
0.5`) — a "pump shotgun" rhythm, not rapid fire. This needed its own timer
because it used to share the normal auto-fire cadence, which read as way too
fast.

### Snowing (mystery bad outcome)

`snowingUntil` — ~12s of ambient snow (not dense, ~22 particles,
`snowParticles` array). Purely atmospheric on its own. The actual punishment
is in `takeDamage()`: **any hit taken while `snowingUntil` is active also
sets `buffFrozenUntil` for 2s**, reusing the existing FROZEN debuff rather
than inventing a new one.

## Debuffs (player-affecting)

- `buffFrozenUntil` — movement ×0.5. Bullets render as hand-drawn snowflakes
  via the shared `drawSnowflake(x, y, R, color, glowColor)` helper (used by
  both the bullet skin and the ambient snow particles — they used to look
  inconsistent, snow looked like generic stars, now they're visually the
  same shape). **Bullets also now move at 0.4x speed** while frozen — this
  used to be a purely cosmetic reskin with full-speed bullets, which read as
  wrong ("icy" should feel slow).
- `buffZappedUntil` — bullets deal 0 damage, render as a fart-puff cluster.
  Displayed everywhere as **"FART"/"FARTED"**, not "ZAPPED" — renamed per
  explicit request; internal variable name is unchanged.
- `controlsReversedUntil` — left/right input flipped.

## Top banner (HUD callout)

`showTopBanner(text, kind)` / `drawTopBanner()` — replaced several older,
inconsistent feedback mechanisms (full-screen banners, socket-adjacent flash
text) with **one** consistent location: a full-width strip above the health
bar, `kind: 'good'` = cyan (matches the hero-rescue ring color), `kind:
'bad'` = red (matches the enemy reticle color). Same glowing Bebas Neue
language as the intro objective text. Solid enough at peak opacity to fully
obscure whatever's happening in that strip underneath (deliberate — half-
visible motion through a translucent banner read as more confusing than just
hiding it briefly). Fades in/out softly rather than snapping.

Fired on: HP gain, powerup added to socket / already-held, every
buff-deploy, every mystery outcome.

## HUD simplification

Removed the "WAVE N · X LEFT" text and the "HP X%" text label entirely — the
health bar fill is the at-a-glance signal, wave number isn't something
players read mid-action. Score (top-left) stays, but **hides while the top
banner is showing** (covers the same strip).

## SFX added this session

All in the global `SFX` object near the top of the file (search for `const
SFX = (() =>`), built with the existing `tone(freq, type, start, dur, vol,
endFreq)` helper or raw noise-burst buffers for percussive sounds:

- `powerupCollect()` — catching/socket-adding gun/shield/bomb, or gaining HP.
  Used to all reuse `win()`, which is also used for completely unrelated
  things (boss defeat, hero rescue, other games' wins) — felt generic.
- `mysteryGood()` / `mysteryBad()` — beefed up from simple 2-3 note
  arpeggios into a 5-note ascending shimmer with a sparkle, and a heavier
  3-tone descending growl, respectively.
- `guitarNote()`, `pianoNote()`, `drumHit()` — for the MUSIC theme
  instruments.
- `slotTick()` / `slotLand()` — wave-announcement slot machine spin/landing.

## Canvas sizing

Space Mobe locks to a **9:16 aspect ratio** (`SPACE_RATIO`), letterboxed —
`fitSpaceCanvas()` computes the largest box at that ratio that fits below the
header, scales up/down but never stretches. This was a deliberate fix for
portrait vs. landscape difficulty asymmetry (landscape gave much less fall
distance to react). `#pg-space` needs `align-items: center` for this
centering to work, which had a side effect worth remembering: it also
shrinks `.cats-header` to content-width unless overridden — see the `#pg-space
.cats-header { align-self: stretch; width: 100%; }` rule. If a header looks
"squeezed" on some page in the future, check for exactly this pattern
(flex parent with non-default `align-items` quietly affecting a header
child).

## Design philosophy notes (why things are shaped the way they are)

- The user's stated goal throughout: surprise and fun first, "I never knew
  what would happen." When a design choice was ambiguous, the funnier/more
  surprising option won.
- A recurring, explicit complaint was **chaos** — "it's so fun, but it's
  chaos, trying to reduce that feeling." Several changes exist specifically
  to fight that: the powerup banking/socket system (no more "catch it now or
  lose it"), the unified top banner (one place to look instead of four), the
  HUD text removal (less to read mid-action), hiding gameplay under the top
  banner on purpose.
- Visual language is reused deliberately across systems rather than
  invented fresh each time: the rotating-dot ring (hero rescue ring, mystery
  box ring), the corner-bracket/crosshair reticle (enemies), the snowflake
  shape (frozen bullets, ambient snow). When adding a new "shoot this" or
  "this is dangerous" visual, check whether an existing pattern already
  covers it before inventing a new one.
- No emoji in in-canvas sprites/bullets/enemies — hand-drawn canvas shapes
  instead (the snowflake, the fart-puff cluster, the pizza slice, the
  guitar/piano/drum). Emoji are still used in HUD *text* labels (buff
  indicator lines like "⚡ RAPID FIRE") since that list was already
  emoji-prefixed before this session and stayed consistent with itself.

## If you're picking this up cold

Good first moves:
1. `grep -n "function nextWave\|function announceWave\|function pickWaveTheme"` to
   re-orient on the wave system.
2. `grep -n "WAVE_THEMES\|THEME_LABEL"` to see the full theme roster fast.
3. Play through a few waves locally (`python3 -m http.server` from the repo
   root) and watch for: theme variety (should feel like "every other wave"),
   mystery box behavior (shoot it, don't fly into it), socket deploy on
   touch/click, top banner legibility.
4. If asked to add a new theme: copy the pattern of an existing simple one
   (e.g. `swarm`) — touch `WAVE_THEMES`, `THEME_LABEL`, and the relevant
   branch in `spawnObstacle`/`nextWave`'s `onDone`. Most themes need zero
   changes outside those two or three spots.
