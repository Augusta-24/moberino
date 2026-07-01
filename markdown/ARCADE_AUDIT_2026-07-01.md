# Arcade Audit - 2026-07-01

Scope: Arcade only (lobby, Whack, Match, Space). Main site excluded.

## Summary

- Overall direction is strong: clear visual identity, distinct game personalities, and high effort in readability/tutorialization.
- Space is currently the most mature experience (mode structure, objective clarity, progression pacing, debugability).
- Biggest quality gap is consistency at the shell layer: leaderboard model mismatch and control-language drift across games.
- Biggest UX risk is mobile responsiveness/clarity in transition states (carousel momentum feel is improved but still a tuning-sensitive area).

## Findings by severity

### High

1) Leaderboard taxonomy mismatch between game outputs and shell board definitions.
- Shell board list still includes a generic Space board key while Space game logic supports campaign/endless/bossrun distinctions.
- Risk: players can feel scores are "missing" or mixed between run types.
- Evidence:
  - js/arcade.js defines generic space board metadata and groups.
  - js/games/space.js has mode-specific leaderboard routing.

2) Input/interaction language is inconsistent in core loop actions.
- Whack uses direct pointer tapping semantics, Match uses card-flip semantics, Space uses drag/auto-fire with sockets.
- The designs are good independently, but shell-level onboarding language is not normalized (especially between lobby promises and in-game first 5 seconds).
- Risk: new players need to relearn controls each mode instead of transfering knowledge.

### Medium

3) Carousel DOM complexity on desktop can duplicate card nodes and increases cognitive noise in accessibility snapshots.
- Cloned items are visible to tooling and can confuse semantic ordering.
- Not a visual blocker for players, but affects robustness and future accessibility improvements.

4) Install/fullscreen guidance quality is strong on iOS, but still split between static card copy and runtime prompt copy.
- Risk: stale wording drift in future edits.

5) Sound palette is rich but very dense in Space + shell interactions.
- There are many tonal identities that are fun individually, yet mix management may become crowded during rapid event chains.
- Risk: audio fatigue and cue masking, especially on phone speakers.

### Low

6) Typography/spacing consistency is intentionally retro and expressive, but some compact labels are near readability thresholds on smaller devices.
- This is mostly a polish issue (button copy and micro-label line heights).

7) Some dense inline-style authored card blocks are hard to maintain.
- Not a runtime issue, but future iteration cost is high.

## Category audit

## Sound

Strengths:
- Distinct, authored timbre per interaction family.
- Shared audio context unlock strategy is careful for iOS.
- Music ducking model is thoughtful.

Gaps:
- Too many near-simultaneous cues can stack in high-intensity moments.
- Per-game loudness normalization strategy is implicit, not declared.

Ideas:
- Add per-category gain lanes (UI, combat, reward, warning).
- Add optional low-fatigue audio profile toggle for long play sessions.

## Design system and visual language

Strengths:
- Strong arcade personality; cards and game launch screens feel authored.
- Color coding by game family is memorable and mostly consistent.

Gaps:
- Shell-level consistency varies between pages (header vs floating exit, badge language, button density).
- Some components rely heavily on inline styles, reducing shared visual tokens.

Ideas:
- Define a small Arcade component token sheet (badge, primary action, danger action, panel).
- Consolidate repeated marquee and stat block styles.

## Visibility and readability

Strengths:
- Space objective signaling and mode callouts are clear.
- Whack/Match mode-select states are highly readable.

Gaps:
- Microtext in some areas is borderline on very small screens.
- Dense decorative visuals can compete with status text in some states.

Ideas:
- Add one accessibility profile: +1 font step for micro labels and status lines.
- Add optional reduced FX mode for heavy overlays/particles.

## Menu consistency

Strengths:
- Global flow is coherent (lobby -> mode select -> play -> results -> lobby).
- Leaderboard and mute are globally reachable.

Gaps:
- Naming conventions differ (Frenzy/Survival vs Hard/Challenge/Impossible vs Campaign/Boss Run/Endless).
- This is not wrong, but lacks a shell-level framing pattern.

Ideas:
- Add short mode chips under each launch card: Tempo, Difficulty, Session Length.
- Standardize subtitle grammar (verb + object + constraint).

## Features and gameplay completeness

Strengths:
- Space has full campaign identity, tutorial, debug jumps, and robust progression scaffolding.
- Whack and Match have meaningful mode differentiation.

Gaps:
- Cross-game progression is limited; each mode feels siloed.
- No shared meta-loop to encourage rotating between games.

Ideas:
- Add Arcade Circuit (daily 3-game run with combined badge).
- Add lightweight achievements tied to mode mastery and consistency streaks.
- Add post-run "Play Next" recommendation rail based on session behavior.

## Gameplay addition ideas

Whack:
- Add one advanced hazard wave where target timing is delayed by fake pops.
- Add optional score multiplier chain for consecutive perfect hits.

Match:
- Add a "fog memory" mutator where previously seen cards fade over time.
- Add one no-timer but strict move-ceiling rank mode distinct from Impossible.

Space:
- Add optional elite wave modifiers announced before launch (example: fast rain, no bomb drops).
- Add post-campaign remix chapters with constrained loadouts.

## Gaps to prioritize next

1) Leaderboard model alignment across shell and Space run modes.
2) Shell-level control-language consistency pass (copy, onboarding framing).
3) Audio lane balancing pass for high-event moments.
4) Maintainability pass: reduce repeated inline visual style blocks in lobby card templates.

## Notes from live pass

- Lobby and mode-select states are visually compelling and mostly readable.
- Mobile carousel responsiveness is much improved after native-snap-oriented tuning.
- Space launch screen remains one of the strongest onboarding surfaces in the project.

## Suggested acceptance checks for future passes

- New player can launch any game and understand objective in under 8 seconds.
- Mode names convey difficulty and session shape consistently.
- Leaderboard entries match the visible mode context every time.
- On mobile, one-finger swipe on lobby carousel resolves to a centered card reliably.
