# Space Mobe SFX — Credits

Starter asset pack for the Space Mobe `SPACE_SFX` registry. All clips are CC0
(public domain dedication) unless noted otherwise. No background music
included. Every file was trimmed to 0.1–1.0s, loudness-normalized
(`loudnorm`, target true peak ≤ -1.5dB), and converted to mono 44.1kHz MP3.

Total pack size: ~196 KB (target was < 1 MB). `powerup_bomb.mp3` is
currently empty (removed by request) — see "Open items" below.

## Sources

### Kenney — Game Audio packs (CC0)
Original packs: [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds),
[Impact Sounds](https://kenney.nl/assets/impact-sounds),
[RPG Audio](https://kenney.nl/assets/rpg-audio),
[Interface Sounds](https://kenney.nl/assets/interface-sounds),
[Digital Audio](https://kenney.nl/assets/digital-audio).
Author: Kenney (kenney.nl). License: **CC0** — confirmed via the pack's own
`readme.txt` ("License: (Creative Commons Zero, CC0) ... free to use in
personal, educational and commercial projects").
Files were downloaded from the CC0 mirror at
`https://gamesounds.xyz/?dir=Kenney%27s+Sound+Pack` (a straight redistribution
of Kenney's own CC0 zips, used here because kenney.nl's own asset pages are a
JS app with no static per-file download links reachable from this tool).

### OpenGameArt — Monster Sound Pack, Volume 1 (CC0)
Page: https://opengameart.org/content/monster-sound-pack-volume-1
Author: **Ogrebane** (OpenGameArt user). License: **CC0**, as stated on the
asset page.

### User-supplied clips — license/origin UNCONFIRMED ⚠️
Five clips (`ogre_projectile.mp3`, `dog.mp3`, `grayvisitor.mp3`, `dragon.mp3`,
`shark.mp3`) were supplied directly by the project owner from a local
`funsounds/` folder, not sourced or license-verified by this pass. **Source
and license are unknown** — please confirm where these came from and under
what license before treating this pack as fully cleared for
redistribution/commercial use. If they came from a personal recording or a
library you already have rights to, note that here; if they came from an
unknown web source, please find/confirm the license.

## File-by-file credits

| Target file | Source file | Pack | License | Source URL |
|---|---|---|---|---|
| `boss_ogre_voice.mp3` | Monster-1.wav | OpenGameArt — Monster Sound Pack Vol. 1 (Ogrebane) | CC0 | https://opengameart.org/content/monster-sound-pack-volume-1 |
| `boss_ogre_projectile.mp3` | ogre_projectile.mp3 (donkey bray) | User-supplied (`funsounds/`) | **UNCONFIRMED ⚠️** | n/a — confirm source/license |
| `boss_dragon_voice.mp3` | dragon.mp3 | User-supplied (`funsounds/`) | **UNCONFIRMED ⚠️** | n/a — confirm source/license |
| `boss_dragon_projectile.mp3` | explosionCrunch_000.ogg | Kenney — Sci-Fi Sounds | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| `boss_knight_voice.mp3` | impactMetal_heavy_000.ogg | Kenney — Impact Sounds | CC0 | https://kenney.nl/assets/impact-sounds |
| `boss_knight_projectile.mp3` | drawKnife1.ogg | Kenney — RPG Audio | CC0 | https://kenney.nl/assets/rpg-audio |
| `boss_gray_voice.mp3` | grayvisitor.mp3 (alien chatter) | User-supplied (`funsounds/`) | **UNCONFIRMED ⚠️** | n/a — confirm source/license |
| `boss_gray_projectile.mp3` | forceField_000.ogg | Kenney — Sci-Fi Sounds | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| `boss_shark_voice.mp3` | shark.mp3 | User-supplied (`funsounds/`) | **UNCONFIRMED ⚠️** | n/a — confirm source/license |
| `boss_shark_projectile.mp3` | impactGeneric_light_000.ogg | Kenney — Impact Sounds | CC0 | https://kenney.nl/assets/impact-sounds |
| `boss_taco_voice.mp3` | cloth1.ogg | Kenney — RPG Audio | CC0 | https://kenney.nl/assets/rpg-audio |
| `boss_taco_projectile.mp3` | impactBell_heavy_000.ogg | Kenney — Impact Sounds | CC0 | https://kenney.nl/assets/impact-sounds |
| `boss_octo_voice.mp3` | slime_000.ogg | Kenney — Sci-Fi Sounds | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| `boss_octo_projectile.mp3` | slime_001.ogg | Kenney — Sci-Fi Sounds | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| `boss_gizmo_voice.mp3` | dog.mp3 (bark) | User-supplied (`funsounds/`) | **UNCONFIRMED ⚠️** | n/a — confirm source/license |
| `boss_gizmo_projectile.mp3` | impactPlank_medium_000.ogg | Kenney — Impact Sounds | CC0 | https://kenney.nl/assets/impact-sounds |
| `player_hit.mp3` | impactPunch_medium_000.ogg | Kenney — Impact Sounds | CC0 | https://kenney.nl/assets/impact-sounds |
| `player_death.mp3` | lowFrequency_explosion_000.ogg | Kenney — Sci-Fi Sounds | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| `rescue_success.mp3` | confirmation_001.ogg | Kenney — Interface Sounds | CC0 | https://kenney.nl/assets/interface-sounds |
| `powerup_hp.mp3` | confirmation_001.ogg (same clip as `rescue_success.mp3`, by design — project owner's choice) | Kenney — Interface Sounds | CC0 | https://kenney.nl/assets/interface-sounds |
| `powerup_bomb.mp3` | *(removed by request — project owner didn't like the Kenney explosion placeholder)* | — | — | n/a — open slot, needs a new pick |
| `wave_start.mp3` | twoTone1.ogg | Kenney — Digital Audio | CC0 | https://kenney.nl/assets/digital-audio |

## Resolved gaps (previously flagged as imperfect placeholders)

Five originally-flagged or generic-fit stand-ins have been replaced with
user-supplied clips from `funsounds/` that are a much better semantic fit:

- **`boss_ogre_projectile.mp3`** — now a real donkey bray (was a generic
  monster grunt standing in for the "donkey charge" attack).
- **`boss_gray_voice.mp3`** — now real alien chatter (was a slice of an
  ambient `computerNoise` loop).
- **`boss_gizmo_voice.mp3`** — now a real dog bark (was a generic monster
  grunt standing in for "robot dog bark").
- **`boss_dragon_voice.mp3`** — now the project owner's own dragon clip (was
  an OpenGameArt monster growl).
- **`boss_shark_voice.mp3`** — now the project owner's own shark clip (was an
  OpenGameArt monster growl).

**Action needed:** these five are marked UNCONFIRMED ⚠️ in the table above —
please confirm where each clip originally came from and its license so this
pack can be fully cleared the same way the Kenney/OpenGameArt entries are.

## Intentional design choices (not bugs)

- **`powerup_hp.mp3`** is deliberately the *same* clip as `rescue_success.mp3`
  — the project owner wants picking up HP to sound like a small rescue/success
  cue rather than a distinct "powerup" chime. Not a duplication error.
- **`powerup_bomb.mp3`** has been intentionally removed — the project owner
  didn't like the Kenney explosion placeholder. This slot is currently empty;
  the `SPACE_SFX` registry's existing procedural `powerup.bomb` sound
  (`SFX.over()`) remains the only thing backing that event until a
  replacement file is chosen.

## Open items

- Pick a replacement for `powerup_bomb.mp3` (Kenney/OpenGameArt CC0, or
  another `funsounds/`-style personal clip).
- `funsounds/taco_projectile.mp3` is still unused — say if you want it
  swapped in for `boss_taco_projectile.mp3`.
- Confirm source/license for the five UNCONFIRMED ⚠️ user-supplied clips.
