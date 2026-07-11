# Consume — new word game engine, handoff spec

This is a from-scratch build for a **new** game in the Moberino arcade (`arcade.html`,
`js/games/`, `css/games/`). It replaces the "Word Mobe" swap-the-wall concept that was
prototyped and then abandoned in this repo's history — do not resurrect that engine.
This doc is self-contained; you do not need prior conversation context to build from it.

## The core loop (validated with the user via a playable prototype — this is not
## speculative, it is the confirmed design)

1. A board shows N letter tiles (start around 10 for an easy board, more for harder
   ones). The letters are NOT random — they are the pooled letters of a hidden set of
   solution words (e.g. solution = FEE + HIS + SIZE → pool = E E F H I S S I Z E,
   scrambled/laid out on the board).
2. The player taps tiles (in any order) to build a candidate word in a "tray" area.
3. Submitting a valid dictionary word **removes those tiles from the board** and adds
   the word to a **tableau** of spelled words shown at the bottom of the screen.
4. **The tableau is not a static log — it is interactive**, and this is the single most
   important addition from this handoff (confirmed with the user as the "Rummikub"
   feeling): tapping a spelled word in the tableau **breaks it back apart**, returning
   its letters to the board pool so they can be reused in a different word. The
   player is expected to spell something, get near the end, realize a letter is
   trapped in the wrong word, shatter that word, and recombine — exactly like
   rearranging tiles in Rummikub until the hand resolves. This "almost there, let me
   rearrange" moment is the emotional core of the game — design and tune toward it,
   not away from it.
5. **Win condition: every tile on the board has been consumed** (i.e. the tableau's
   words collectively use 100% of the original letter pool, with zero left over).
6. **Only a small, known number of complete solutions exist** for a given board (the
   generator guarantees this — see below). Most valid words a player can spell are
   real dictionary words that are NOT part of any solution ("traps") — spelling one
   doesn't fail the game, but it can strand remaining letters into a dead end (no
   valid word can be formed from what's left). Undo (breaking tableau words apart) is
   always free and unlimited — the game is never "lost," only "currently stuck," which
   the player resolves by rearranging, not by restarting. (A Reset-to-start button
   should still exist for convenience, but shattering words is the primary recovery
   tool and should be low-friction — one tap.)
7. Difficulty scales via generator parameters, not new rules: letter pool size, number
   of solution words, number of alternate full solutions (fewer = more constrained =
   harder), number and length of "trap" words available, and how deep a wrong path
   can go before it dead-ends. This must be provable by a solver, not hand-tuned by
   feel (see Generator section).

## Why this design (context for judgment calls, not just instructions)

- An earlier prototype tried "fix broken words sitting in a grid, swap letters, wall
  collapses with gravity/fusion physics." It was rejected after real playtesting: the
  physics/gravity layer never produced genuine decisions, boards felt either trivial
  or arbitrary, and the fun that *did* show up came from one thing — freely assembling
  letters into a word that clicks together (the user's own words: "actually fun").
  This new design keeps only that assembly feeling and builds the whole game around
  it, deliberately with NO grid physics, NO gravity, NO tile-falling, NO fragments.
  Board presentation should be flat and static — tiles just appear and disappear.
- The user explicitly does not want random-letter grids ("alphabet soup") — every
  board must be generated backward from real solution words so a full clear is
  always mathematically guaranteed to exist.
- The user is a non-coder steering by feel via playable prototypes, not written specs.
  If you have a design judgment call to make and can't validate it against this doc,
  err toward: simpler, more readable, more "I can see why that happened," fewer
  simultaneous new mechanics.

## Required build order

### 1. Generator + solver (Python, offline, mirrors the existing project's proven
   pattern in `generate_word_boards.py` at the repo root — read that file first for
   house style, even though its game engine is being discarded, its pipeline
   structure and the discipline of the whole project is not: generate candidate
   boards, grade them with an exhaustive solver, only ship boards that pass gates)

   Build a script (`generate_consume_boards.py` at repo root) that:
   - Picks a set of solution words for a level (reuse the existing word list file
     `word_list_10k.txt` and the frequency/dictionary filtering logic already in
     `generate_word_boards.py` — do not re-derive vocabulary rules from scratch,
     copy/adapt the proven `load_words()` filtering, including its 3-letter
     abbreviation-junk blocklist).
   - Computes the letter pool (multiset) = union of all solution words' letters.
   - Runs an exhaustive solver over that letter pool that, using only the words in
     the shared dictionary that actually fit inside the pool (critical performance
     detail: filter the dictionary down to "words whose letters are a subset of the
     pool" FIRST, then only search within that small list — searching the full
     multi-thousand-word dictionary at every recursive step is too slow):
     - Enumerates **all distinct full partitions** of the pool into dictionary words
       (a "full partition" = a set of words whose combined letters exactly consume
       the pool with nothing left over). Cap this enumeration (e.g. stop after
       collecting more than ~40 and treat as "too open, reject" — boards with too
       many solutions are boring, exactly analogous to how the abandoned engine's
       solver gated on "tension"/"decision density," this game's core interesting-
       ness metric is having FEW solutions, not many).
     - For every word spellable from the full pool, determines via memoized
       recursion whether removing that word's letters still leaves a residue that
       CAN be fully partitioned (i.e., is this word part of some winning line, or
       does playing it immediately doom the board?). Words where the answer is "no
       full partition exists afterward" are **traps**.
   - Grades each candidate board on:
     - `solutions`: count of distinct full partitions (target: 1-3 for hard boards,
       up to ~5 for easy ones — never "wide open").
     - `traps`: count and average length of trap words (longer, more tempting traps
       = harder; a 3-letter trap is barely a trap, a juicy 5-6 letter real word that
       turns out to be a dead end is the good stuff).
     - `pool_size`: letter count (this is the primary size/difficulty-texture knob,
       analogous to how board width was pure texture in the old engine — don't
       conflate size with difficulty; a small pool with 1 solution and a nasty trap
       is harder than a big pool with 5 easy solutions).
   - Rejects/retries boards that don't meet the per-level gate (define a level-spec
     table similar to the old `level_spec(n)` function: early levels = larger
     solution counts, short/no real traps, small pools ~8-10 letters; later levels =
     1-2 solutions only, multiple long traps, larger pools ~12-16 letters).
   - Emits a JSON pack (`js/games/consume-boards.js`, following the exact pattern of
     the old `word-boards.js`: a `const CONSUME_DATA = {...}` line and a
     `const CONSUME_DICT = new Set([...])` line so the runtime never needs a server
     — the whole dictionary needed for validation ships as a JS Set literal, same as
     before). Each level entry needs at minimum: the letter pool (as an array or
     string of tiles with stable ids), and enough metadata for the runtime to
     validate submitted words against the dictionary (the full CONSUME_DICT set is
     enough — the runtime does not need to know the "official" solution words, only
     whether a submitted word is a legal dictionary word AND whether its letters are
     currently available on the board).
   - Print per-level metrics while generating (solutions count, trap count/lengths,
     pool size, generation attempts) so a human can sanity check the pack before
     shipping — mirror the console output style of the old generator's per-level
     print lines.

   Validate the generator by running it standalone and hand-inspecting a few
   generated boards (print the pool, the intended solution(s), and the trap list)
   before wiring anything into the game — this is the exact workflow that caught
   problems early in the prior engine's development, keep doing it.

### 2. Runtime game (JS + CSS, following existing arcade conventions exactly)

   Read `js/games/word.js`, `css/games/word.css`, and how they're wired into
   `arcade.html`/`js/arcade.js` FIRST — this new game must slot into the arcade using
   the identical integration pattern (own IIFE JS file, own CSS file, own `pg-<name>`
   page div, own lobby carousel card, `window.init<Name>`/`window.<name>Back` hooks
   called from the shared `nav()` router in `js/arcade.js`, shared `SFX` object and
   `getAudioCtx()` for sound, shared `LB`/`RemoteLB`/leaderboard Hall-of-Fame tab
   pattern, shared per-tag journey/localStorage pattern if a level progression is
   wanted). Do not invent a different integration shape.

   Game name/id suggestion: `consume` (page id `pg-consume`, files `consume.js` /
   `consume.css`, JS globals prefixed `initConsume`/`consumeBack`, CSS classes
   prefixed `.cw-` to avoid collisions with the old `.wm-` classes still in the repo
   — do not reuse or rename the old word.js/word.css files, this is a new sibling
   game, the old one may be deleted by the user later but that is their call, not
   part of this task).

   Screens/states needed:
   - A board view: all remaining (unconsumed) tiles laid out simply (flat grid or
     wrapped row — no physics, no falling, no fragments, no gravity of any kind).
     Tapping a tile moves it into a "current word" tray (and tapping a tray tile
     removes it back to the board) — mirror the tap-to-select-then-tap-to-place
     interaction already used in the old word.js rack, it's a proven, well-tested
     interaction pattern in this codebase, just simplified (no "select a rack letter
     then tap a target slot" — here there are no slots, only "tap letters into the
     current word in the order you tap them, submit").
   - A submit action ("Spell it" button, or auto-submit is also acceptable if it
     feels better — try tap-to-build with an explicit submit button first, since
     that's what was validated in the prototype).
   - On submit: validate the word is 3+ letters and present in `CONSUME_DICT`, AND
     that the tapped tiles' letters exactly match the word (they will, since tiles
     came from the board, but validate defensively). If valid: remove those tiles
     from the board, add the word as a new item in the tableau, play a satisfying
     chime (reuse the existing pentatonic piano SFX approach from word.js —
     `PSFX`/`ptone()` pattern — do not invent a new audio approach, extend the
     existing one). If invalid: a brief negative sound/shake, no state change.
   - **The tableau**: a horizontal or wrapped list of "chip" widgets, one per spelled
     word, persistently visible (this is the "show the spelled words at the bottom"
     feature the user explicitly asked for). Each chip is tappable. Tapping a chip
     **shatters** it: the word disappears from the tableau, and its letters return
     to the board as individual tiles again, available for reuse. This must feel
     good — some kind of small pop/scatter animation and a distinct "un-chime" sound
     (a descending version of the assembly chime is a reasonable start) — this
     shatter-and-recombine action is the single most important feeling in the game
     per the user's explicit Rummikub reference, do not treat it as an afterthought
     undo button, treat it as a first-class, delightful, frequently-used verb.
   - Win state: when the board has zero remaining tiles AND the tray is empty, the
     level is won. Show a clear win overlay (reuse the `.wm-win` style pattern from
     word.css/word.js as a visual/structural template, restyle for this game's own
     accent color) with some kind of score/rating — since there's no "par" concept
     yet in this design, a simple rating based on words-used-vs-minimum-possible (the
     generator knows the minimum word count of the best partition; fewer, longer
     words submitted = better rating) is a reasonable default; do not over-engineer
     scoring beyond that without further validation from the user.
   - A visible "stuck" indicator: if, given the current board + tray state, NO valid
     dictionary word can be formed from the remaining unconsumed letters (check this
     any time the board changes), show a clear, non-punishing message like "No word
     fits what's left — try shattering one apart." This was explicitly tested and
     liked in the prototype ("DEAD END" messaging) — keep the tone calm/informative,
     not a failure state, since the game cannot actually be lost, only temporarily
     stuck, and shattering is always available.
   - A level list / journey screen: reuse the existing word.js journey pattern
     (per-tag progress, auto-generated tag like "FROG4", no logins, no PII, tag
     lookup across devices via the shared Supabase leaderboard) if the user wants
     progression across many generated levels — this is very likely desired since
     the generator is designed to produce a graded pack of levels, but confirm scope
     with the user before building the full tag/journey system if time/credits are
     tight; the single-board playable loop is the higher priority deliverable.

   Styling: match the arcade's existing visual language (VCR/Bebas Neue fonts,
   flat dark neon panels, no gradients/shadows beyond what's already established in
   `css/arcade.css` and the other `css/games/*.css` files) — pick a new accent neon
   color distinct from the other cabinets (whack=orange/pink, match=yellow, space=
   green, signal=cyan, snoob=amber/gold, old word=magenta #ff4bd8) — something like a
   fresh teal or lime that isn't already claimed works well against the existing
   lobby carousel.

## Explicit non-goals (do not build these — they were tried and rejected)

- No swap-a-letter-into-a-slot mechanic, no "wrong letter" markers on tiles, no
  brick/wall geometry, no gravity/settling physics, no fragment-fusion system, no
  packed-wall board shape. This game's board is just a flat pool of free tiles.
- No timer, no lives, no fail/lose state of any kind at the single-level scope
  described above. (A separate risk/score-attack mode was discussed as a future
  possibility but is explicitly out of scope for this build — do not add it
  speculatively.)
- Do not invent new vocabulary-selection heuristics from scratch — reuse the
  filtering logic already proven in `generate_word_boards.py`'s `load_words()`
  (frequency ranking + system dictionary cross-check + the hand-maintained STOP
  list of abbreviation junk) rather than re-deriving it, and be aware short (3-
  letter) solution words are the highest-risk category for producing
  unsatisfying non-words/abbreviations (MIL, MIN, etc.) — if time allows, tighten
  3-letter word selection to a small hand-picked whitelist of genuinely common,
  recognizable words rather than trusting frequency rank alone at that length;
  this was identified as a known outstanding issue in the old engine and applies
  equally here.

## Definition of done for a first playable milestone

1. `generate_consume_boards.py` runs standalone, prints per-level solver metrics,
   and produces at least one hand-verified, genuinely satisfying board matching the
   spirit of the validated prototype (small pool, 1-2 solutions, at least one
   tempting multi-letter trap word).
2. That board is playable end-to-end inside the real arcade shell (launchable from
   the lobby carousel, not just a standalone HTML mockup): tap-to-build, submit,
   tableau chips appear, tapping a chip shatters it and returns letters, win
   detected correctly when the board empties completely via a full valid partition,
   "no word fits" messaging appears correctly when the board is genuinely stuck.
3. Verified in a real browser (not just reasoning about the code) — click through
   the actual interactions, confirm sounds play, confirm no console errors, take at
   least one screenshot of mid-play and one of the win state.
