# Space Mobe Campaign — Future Plan

## Current diagnosis

Waves 1–3 now have clearer identities, but Wave 1 has swung between two bad extremes:

- Random rocks created clutter without a readable challenge.
- Authored alternating gates created clarity without interesting decisions.
- Ricochets currently feel lucky because their future path is not visually legible.

Do not continue tuning asteroid counts or gate cadence. The next pass should replace the current left/right conveyor with a small pattern system built around readable trajectories and multiple valid routes.

## Design rules for every campaign wave

1. One objective per wave.
2. Difficulty comes from decisions, not object count.
3. Every damaging object must have a readable origin and path.
4. A player should understand why they were hit.
5. Each encounter needs escalation, payoff, and a clean ending.
6. HP resets mean a normal first clear should finish around 10–30 HP; a learned run should finish much higher.
7. Contextual help appears only after demonstrated confusion, directly in the playfield.

## Wave 1 redesign: Meteor Gauntlet

Target length: 28–32 seconds. Completion remains time-based.

### Act 1 — Read the field (6 seconds)

- Large, slow rocks enter on diagonals.
- Two or three safe routes remain open; there is no single prescribed left/right answer.
- Wall-bound rocks show a short projected path before moving.

### Act 2 — Crossing paths (12 seconds)

- Mix slow blockers with a few faster aimed rocks.
- Aimed rocks lock the player's old position and never track afterward.
- Introduce one clearly telegraphed, single-bounce ricochet at a time.
- The wall contact point flashes before the rock reaches it, revealing the rebound direction.

### Act 3 — Meteor storm (10–14 seconds)

- Combine the established pieces without adding a new rule.
- Maintain at least two viable routes whenever possible.
- Finish with one memorable authored formation, not a longer stream of ordinary rocks.

### Ricochet requirements

- One bounce maximum per rock.
- Fixed authored angle, never a random angle.
- Brief dotted path or wall marker before launch.
- Strong musical wall-contact cue.
- No overlapping ricochets until playtesting proves one is consistently readable.

## Wave 1 success criteria

- A stationary ship fails within 8–12 seconds.
- A new player can identify the safe decision after each hit.
- No required back-and-forth rhythm lasts longer than two formations.
- First clear commonly ends at 10–30 HP.
- A skilled player can finish above 70 HP.
- The wave remains interesting after three consecutive plays.

## Rock sound audit

### Current behavior

- `playRockPianoSoundscape()` still contains the intended A-minor piano identity.
- It is called only through `playTargetBreakSfx('asteroid')`, when a destructible asteroid is destroyed.
- Wave 1's authored gate and ricochet rocks are indestructible, so the piano path never runs.
- Bullet impacts on indestructible rocks currently create a visual spark but no rock sound.
- Wall ricochets use `playAsteroidWallBounceSfx()`, a low triangle tone plus noise. This reads as a generic game impact rather than piano.
- Autofire itself is intentionally silent, so the perceived generic sound is coming from collision/bounce/damage feedback—not the player blaster.

### Recommended sound map

- Bullet hits rock: short muted piano note, throttled so autofire cannot create noise soup.
- Rock breaks: fuller existing A-minor piano note/chord.
- Rock hits wall: low piano octave plus a higher reflected note; no generic noise burst.
- Rock hits player: physical low thud with a small dissonant piano accent.
- Different rock sizes select different octaves, preserving one coherent instrument family.

Implement separate functions for `rockImpact`, `rockBreak`, `rockRicochet`, and `rockPlayerHit` rather than routing all events through one sound.

## Instrumentation before the next tuning pass

Record locally for each Wave 1 attempt:

- Completion or failure.
- Ending HP.
- Time survived.
- Number of hits.
- Pattern ID responsible for each hit.
- Player position at impact.
- Whether it was the first attempt or a retry.

Use ten human attempts—not unattended runs—to tune difficulty. Unattended testing should only confirm that inactivity fails and that the wave terminates correctly.

## Recommended next session

1. Remove the current alternating-gate schedule.
2. Build reusable authored trajectory helpers with optional path previews.
3. Implement only Act 1 and one ricochet.
4. Restore the piano sound family for impact, bounce, break, and player collision.
5. Playtest that small slice before building Acts 2 and 3.
6. Continue to Waves 2 and 3 only after Wave 1 is genuinely replayable.
