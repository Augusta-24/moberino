# Codex Implementation Plan: Persistent Space Journey Game

> Visual, cinematic, copy, and interaction decisions are defined in
> [JOURNEY_VISUAL_STORY_PLAYBOOK.md](JOURNEY_VISUAL_STORY_PLAYBOOK.md).
>
> Mission verbs, encounter variety, route consequences, rewards, and gameplay
> acceptance rules are defined in
> [JOURNEY_GAMEPLAY_PLAYBOOK.md](JOURNEY_GAMEPLAY_PLAYBOOK.md).

## Project goal

Create a new, standalone arcade game built from copies of selected systems in the existing pet game and `space.js`.

The new game is a persistent space journey rather than:

- a growing-pet game,
- a traditional wave campaign,
- or an alternate mode inside Space Mobe.

The player maintains a small ship and pilot while traveling through a long route across space. The player returns over multiple real-world sessions to:

- check the ship,
- refuel,
- repair damage,
- restore power,
- care for the pilot,
- choose routes,
- respond to transmissions,
- rescue characters,
- install upgrades,
- unlock cosmetics,
- and play action encounters.

Some sessions should involve a full shooting encounter. Other sessions should be short, quiet check-ins.

The existing Space Mobe must remain unchanged as its own standalone arcade game.

---

# Living implementation status

Last reconciled: July 24, 2026.

This section is the current source of truth for progress. The detailed stages later
in this guide remain the acceptance checklist, but some early screen descriptions
reflect the first prototype rather than the visual adventure now being built.

## Current product direction

The player is their selected arcade character, piloting the Wayfarer in pursuit of
seven stolen Star Crystals. The route unfolds as a visual adventure involving
arrivals, hazards, rescued friends and unusual companions, upgrades, and bosses.

The cockpit—not a stacked ship-management page—is the home screen. It presents:

1. one current message or ship warning,
2. a visual navigation map,
3. compact ship condition and resources,
4. and the selected next destination with a clear launch state.

Story information arrives through short visual cinematics with a manual Continue
button. When the route genuinely branches, the cinematic is followed by a separate,
simple Pilot's Call decision screen. Selecting a route returns to the cockpit with
that destination ready to launch.

All new screens and story beats must follow
[JOURNEY_VISUAL_STORY_PLAYBOOK.md](JOURNEY_VISUAL_STORY_PLAYBOOK.md).
All new missions and route decisions must follow
[JOURNEY_GAMEPLAY_PLAYBOOK.md](JOURNEY_GAMEPLAY_PLAYBOOK.md).

## Implemented checkpoint

- **Stages 0–2:** the existing games are preserved; Journey is a separate arcade
  game with isolated files, save data, persistent resources, route state, and safe
  encounter-result application.
- **Stage 3:** the original ship page has evolved into the compact cockpit, with a
  visual map, status warnings, launch readiness, a separate ship/repair view, and
  an expandable log.
- **Stage 4:** Chapter One is data-driven through Ogre Gate and First Settlement.
  Fuel costs, locks, visits, completion, destination selection, and Pilot's Call
  branching persist. Pilot's Call remains changeable while the destination is only
  selected, then commits permanently when the Wayfarer departs Scrap Belt. The
  unchosen node closes as a destination and becomes an Ogre Gate consequence.
- **Stage 5:** Scrap Belt now uses the reusable mission runtime for forward travel,
  full two-axis steering, a navigable debris corridor, crystal-trail scanning,
  floating tractor salvage, persistent damage and rewards, and
  Space Mobe's piano language for rock interactions. Single-focus, tap-through
  callouts on the paused playfield teach the live controls, the smaller signal
  evades through traffic after a local scan reveals it, and an in-mission
  achievement beat confirms the lock
  before results. Success requires crossing the route with the signal locked
  rather than surviving a countdown.
- **Stage 6:** Distress Signal now uses a dedicated fixed-position rescue operation.
  The player times two grappling-gun shots against a spinning pod that drifts
  laterally and in depth, rapidly pumps a retracting docking collar to full
  extension, and sees Pip brought aboard. Passenger persistence is applied only
  after the physical rescue. Pip then remains visibly centered in rescue results
  and occupies a persistent crew position in the cockpit.
- **Stage 7 (Repair Moon) is complete — August 2026:** the hull-repair beat is now
  "Dry Dock," a hands-on hull-scrap packing puzzle. See **Kanoodle Dock puzzle
  pattern** below; the underlying engine is built generic and reusable, not a
  Repair-Moon-specific one-off. The upgrade-install workshop screen (unchanged)
  follows once the hull is patched.
- **Gameplay foundation:** the isolated Journey mission runtime now provides full
  horizontal and vertical movement, forward world scrolling, proximity scanning and
  signal locks, tractor attachment and towing, contextual interactions, keyboard
  and touch input, cue callbacks, and clean lifecycle behavior.
- **Visual story foundation:** the selected hero leads the opening crystal-theft
  cinematic; Lantern Station visibly refuels the Wayfarer; route choices are
  introduced through incoming intel; cinematics wait indefinitely for Continue;
  the cockpit map reads vertically in the direction of travel; and the Distress
  arrival shows an identifiable damaged ship rather than an abstract beacon glyph.
- **Development support:** the cockpit gear opens reproducible state-backed
  checkpoints for retesting the opening, Scrap Belt, Pilot's Call, both branch
  arrivals, and both Repair Moon branch states.
- **Stage 7.5 (Abandoned Cache) is complete — August 2026:** the cache branch is a
  real mission, "Seal the Vault." See **Seal-the-Vault puzzle pattern** below; it is
  validated and intended to be reused for later crystal recoveries.

The implemented route currently ends before **Ogre Gate**. Ogre Gate and First
Settlement exist in the route data but are intentionally marked unavailable.

### Seal-the-Vault puzzle pattern — reusable for later crystal missions

`js/games/journey-cache.js` is a generic, procedurally-generated conduit-lattice
puzzle in the Infinity-Loop tradition, not a hand-authored one-off. Reuse it (copy
the file, retune the constants) for future crystal-recovery missions rather than
inventing a new mechanic per region:

- **Design rule it satisfies:** the whole board is one coupled network — every
  tile's openings must match a neighbor's (or a sanctioned external opening at the
  source/sink edges) with zero dead tiles. Rotating one tile constrains its
  neighbors, so every tile is a real decision solved by deduction, and the puzzle
  cannot be brute-forced tile-by-tile. This replaced an earlier sparse
  core-to-bolt path design that failed exactly this test (75% of tiles were inert
  filler, five tiles had only one legal orientation). Do not regress to a sparse
  path/pressure-gauge model for a future crystal puzzle — it fails the same way.
- **Solvable by construction:** the board is generated from a randomized spanning
  tree over the grid (guarantees full connectivity) plus extra loop edges
  (`LOOP_EDGE_CHANCE`, richer coupling, fewer dead-end caps), then each cell's
  required opening-set is converted to the matching piece (`END`/`I`/`L`/`T`/`X`)
  and scrambled to a different rotation. This means it is correct by construction,
  not hand-verified per board — confirmed by brute-checking 1,000 generated boards
  (see PR history around August 2026).
- **Difficulty consistency, not just solvability:** "always winnable" and "always a
  real puzzle" are different guarantees — check both. A 4-way (`X`) crossing has
  full rotational symmetry, so it starts already sealed and costs the player zero
  decisions; sampling 3,000 raw generations showed ~6.5% of boards exceeded 15% of
  tiles being `X` (up to 30% in the worst case) — a quietly easier board with no
  visible cause. `generate()` now rejects and regenerates any board over
  `MAX_X_FRACTION` (currently 0.15), which converges in ~1.1 attempts on average
  and eliminated the tail entirely across the same sample size. Apply the same
  reject-and-regenerate check to any future reuse of this pattern — don't assume a
  procedurally solvable board is automatically a consistently *hard* one.
- **Tunable per crystal/region:** `COLS`, `ROWS`, `SOURCE`, and the `SINKS` array
  (any number of sinks, not just three) are the only things that need to change to
  reshape the puzzle for a new location. Smaller grid = gentler puzzle for an early
  crystal; larger grid or more sinks = harder for a later one.
- **Win condition is generic:** when every tile is sealed (no leaks anywhere) *and*
  the flood from the source reaches every sink, the network floods outward in
  visible layers and each sink fires its own confirmation (here: vault lock-bolts
  CLUNK and light one at a time) before the mission's `onSuccessReady` fires.
- Keep the isolated lifecycle contract used here (`start/begin/destroy`,
  `onSuccessReady`, no `JourneyState`/`localStorage` access) for any reused copy.
- **"Sealed" must mean reachable from the source, not just locally matched — this
  was a real, player-reported bug.** The loop edges that make the lattice richer
  can also let a small cluster of tiles rotate into a state where every one of
  their four sides locally matches its immediate neighbour, while the whole
  cluster is disconnected from the reactor core. The original `evaluate()` only
  checked local matching, so those tiles displayed sealed (blue) while blocking
  the win — a player fixing only the visibly-unsealed (amber) tiles could get
  stuck indefinitely, because the actual problem was hiding in tiles that looked
  finished. Fixed by computing `floodReaches()` first and requiring
  `reached.has(key(tile))` as part of the sealed condition, so a tile cannot
  display sealed without being verified connected to the source — this is a
  structural guarantee, not a probabilistic improvement. Any future reuse of this
  pattern must tie its "sealed"/"complete" visual state to actual reachability
  from the source, never to local matching alone.
- **Reachable ≠ leak-free — these are two separate signals, both needed.** After
  the reachability fix above, tile colour was changed to mean "current has
  physically flowed here" (`is-sealed` = reachable from source), matching how a
  player actually reads the board. But reachable-via-one-side does not mean a
  tile has no leak on another side — a tile can be lit blue through one matched
  opening while a different opening on the same tile still leaks. Left alone,
  that leak is invisible: the whole board can render as one solid blue mass and
  still not win, with nothing pointing at the problem. Fixed with a second,
  independent class, `is-leaking` (pulsing amber ring), applied whenever any of a
  tile's openings classify as a leak — regardless of whether that same tile is
  also `is-sealed`. Winning still requires the strict condition (zero leaks
  anywhere AND all sinks reached), unchanged. Any reuse of this pattern needs
  both signals: colour = "energized," ring = "still has an open leak here" — one
  is not a substitute for the other.

## Roadmap from the current checkpoint

The next goal is a complete, replayable Chapter One vertical slice. Build in this
order:

### 1. Pilot's Call commitment — completed July 24, 2026

- Save version 4 adds persistent branch choice, closed node, and consequence state.
- Selection can change freely until departure. Departing Scrap Belt commits the
  decision and blocks the other node from selection or travel.
- The unchosen thread now transforms:
  - rescue Pip now, and the thieves move the cache crystal to Ogre Gate;
  - recover the cache crystal now, and Pip's pod is intercepted at Ogre Gate.
- The cockpit map, Navigation screen, archived Pilot's Call, Journey Log, Repair
  Moon arrival, and Repair Moon screen all show the committed consequence.
- Both routes reconnect forward at Repair Moon. The closed thread remains visible
  as moved to Ogre Gate rather than becoming another errand or disappearing.
- Older saves migrate from existing Pip, crystal, visited-node, and completed-node
  state into one coherent branch.
- Debug checkpoints now cover Repair Moon after either path.

### 2. Abandoned Cache as the second complete mission family — completed August 2026

- The cache is "Seal the Vault": a generated, fully-coupled conduit lattice (see
  **Seal-the-Vault puzzle pattern** above). Every tile must be sealed; sealing
  floods the network from the reactor core to three vault lock-bolts, which CLUNK
  and light one at a time before the crystal-recovery achievement beat.
- The board powers on diegetically when boarded (dark → flicker → lit) instead of
  a text-instruction overlay.
- Crystal and route persistence apply once, after the reveal screen is confirmed
  (`resolvePeacefulNode` + `awardCrystal('azure-cache')`, both idempotent).
- Superseded designs, for history: a Signal-Lullaby tonal-decode phase and a
  sparse core-to-bolt path with a draining pressure/charge gauge were both built
  and rejected as too easy/brute-forceable before landing on the sealed-lattice
  model. Do not reintroduce either as the primary mechanic.

#### Crystal handling (read before touching crystal code)

- **Seven is the whole-game goal, not the chapter goal.** The intro cinematic
  establishes seven stolen Star Crystals across all regions. Chapter One recovers
  exactly **one** — "the first Star Crystal." The count goes 0 → 1 and never higher
  in Chapter One.
- **One crystal, two possible pickup points.** The Pilot's Call decides *where* you
  recover crystal #1, not whether you get it:
  - **Check the Cache** → extract crystal #1 here; Pip's rescue moves to Ogre Gate.
  - **Answer the Beacon** → rescue Pip now; crystal #1 moves to Ogre Gate and is
    recovered there.
  Both branches must record the **same** crystal id (`azure-cache`) so the count can
  never reach 2 in Chapter One.
- **The counter already exists — do not add a new save field.** `currency.crystals`
  holds the count and `JourneyState.awardCrystal(crystalId)` is idempotent (it dedupes
  on `log.discoveries` via `crystal:<id>`). Award once from each pickup point with the
  same id; the dedupe guarantees "record exactly once."
- **Display is `X / 7`.** The goal is the `CRYSTAL_GOAL` constant in `journey.js`
  (cockpit map, log, and recovery beat). Never reintroduce a bare literal `7`.

### 3. Rebuild Repair Moon as hands-on maintenance — completed August 2026

- Repair Moon is "Dry Dock": a generated hull-scrap dissection/packing puzzle (see
  **Kanoodle Dock puzzle pattern** below) hosted in a dry-dock scene, followed by
  the existing upgrade-install workshop screen once the hull is patched.
- Superseded designs, for history: a single-shape-per-hole "matching" mechanic was
  rejected as a shape-sorter ("still feels like put the triangle in the triangle
  hole"); a layered box-flap tucking-order mechanic was rejected as unclear. Do not
  reintroduce either as the primary mechanic.
- Keep repair immediate and tactile; do not reintroduce a short countdown.
- Install one permanent upgrade physically and show the changed component on the
  ship (unchanged from before — only the repair mechanic itself was redesigned).
- Let Pip speak or assist when Pip is aboard. If the cache path was chosen, use the
  intercepted distress update to establish what Ogre Gate now requires.

### Kanoodle Dock puzzle pattern — reusable engine for future packing missions

`js/games/journey-packing-engine.js` is a generic, reusable polyomino-packing
engine (Kanoodle/dissection-puzzle style), separate from `js/games/journey-repair.js`
which is the Repair Moon-specific consumer. Reuse the engine directly (new
`start()` config, no copy-and-retune) for any future "combine several irregular
pieces to completely tile a region" mission:

- **Design rule it satisfies:** no piece has a single "right hole" — 8 pieces from
  a fixed library (domino through tetrominoes) must combine, via both position and
  rotation, to exactly tile a generated region with zero gaps and zero overlap.
  This is genuinely combinatorial, not a shape-sorter (rejected direction — "still
  feels like put the triangle in the triangle hole").
- **Solvable by construction, difficulty controlled by rejection sampling:** a
  region is built by constructively packing the chosen pieces together from empty
  space (guarantees at least one solution, same principle as the cache's spanning
  tree), then an exact backtracking solver (`solveCount`) counts *every* valid
  tiling of that exact region with that exact piece set. `generate()` rejects and
  retries until the true solution count lands in `[targetMin, targetMax]`
  (Repair Moon uses 3–4) — never accept a board on the construction solution alone,
  since the true count is usually higher.
- **Two independent search bounds, because they guard different failure modes:**
  `solutionCap` stops counting once a board is known to exceed the target band;
  `nodeBudget` bounds total backtracking work regardless of solution count, because
  a region that is merely hard to classify (many dead ends before the first
  solution, or before proving there are none) can blow up the search tree without
  ever tripping the solution cap. A board that can't be classified within budget is
  rejected outright, never accepted as an unverified guess.
- **Bound the generated region's bounding box, not just its cell count.** The
  constructive packer grows in any direction with no shape preference, so an
  accepted region can come out tall-and-thin even at a modest cell count —
  `maxDimension` rejects those before they can overflow a fixed-size host panel.
  Caught by looking at the rendered result, not assumed from cell count alone.
- **Coordinate conversion between screen and puzzle space must scale each axis
  independently.** The host `<svg>` is CSS-stretched to `width:100%;height:100%` of
  its container, which does not preserve the viewBox's aspect ratio — a single
  width-derived scale factor applied to both x and y silently corrupts drop
  coordinates whenever the rendered aspect ratio differs from the viewBox's, with
  error growing for cells further from the origin (this is why only some
  lower-row pieces intermittently failed to place, not all of them). Always compute
  `scaleX`/`scaleY` separately from the viewBox and the element's own
  `getBoundingClientRect()`.
- **Resolve `stageId` down to the actual `<svg>` element, not a wrapping
  container.** A mission may host the puzzle inside a `<div>` for surrounding
  chrome; only a real `<svg>` element has a usable `.viewBox`, so the engine's
  `start()` resolves `stageId` to the element itself if it's already an `<svg>`, or
  to its first `<svg>` descendant otherwise. Passing a wrapper id straight through
  silently defaults both scale factors to 1 with no error — this was the second,
  harder-to-find half of the coordinate bug above, since it looked identical to the
  first (both produce "small aspect-ratio-shaped error") but required fixing
  separately.
- **Keep the isolated lifecycle contract** (`start/begin/destroy`, `onComplete`, no
  `JourneyState`/`localStorage` access) in the engine; let the consuming mission
  module (`journey-repair.js`) own all fantasy/persistence and translate the
  engine's generic `onComplete` into the mission's `onSuccessReady` result shape.
- **Deferred, not built:** a standalone arcade spinoff of this engine, and reuse in
  a second in-game mission — the engine is built generic enough for both, but
  neither has a second call site yet.

### 4. Build Ogre Gate as the Chapter One synthesis

- Make it a blockade set piece, not another asteroid field.
- Approach and read the structure, scan shield anchors, disable components, then
  attack exposed weak points.
- Adapt the mission to the Pilot's Call:
  - Pip helps expose the crystal lock after the rescue path;
  - the cache crystal helps breach the gate while the player rescues Pip after the
    cache path.
- Include readable damage, distinct audio cues, phase confirmations, retry on
  failure, and one non-duplicating persistent victory result.

### 5. Complete First Settlement

- Show a real arrival, landing, and character welcome.
- Resolve Pip and the crystal outcome from either branch.
- Mark Chapter One complete, award one cosmetic, show the traveled route, and tease
  the next region without opening Chapter Two.

### 6. Run the Chapter One validation gate

- Play both Pilot's Call paths from a clean save.
- Confirm every mission uses a different primary verb and has a visible subject.
- Confirm choices change later scenes rather than merely changing order.
- Confirm resources, crew, crystals, upgrades, damage, map state, and log state
  persist after closing and reopening.
- Tune difficulty, instructions, audio, text size, one-screen cockpit fit, and
  celebration beats from observed play—not from placeholder timings.

Do not expand the galaxy or build another asteroid-reskin encounter before this
milestone is tested as a coherent adventure.
The creature-companion introduction belongs in the first authored stretch after
this Chapter One vertical slice proves the core rhythm.

---

# Critical architecture rule

## Do not convert or replace Space Mobe

The existing Space Mobe must retain:

- its current arcade card,
- its current launch behavior,
- Campaign,
- Endless,
- Boss Run,
- Tutorial,
- scores,
- saves,
- balancing,
- and all existing functionality.

The new journey game must have:

- its own arcade card,
- its own launch route,
- its own container,
- its own JavaScript,
- its own CSS,
- its own save key,
- its own menu,
- its own tutorial,
- and its own progression.

Do not make the journey game call the live `space.js` file directly.

Copy the needed systems from `space.js` into a new journey-specific combat file. This prevents changes to either game from breaking the other.

The two games may share assets such as audio or images when safe, but their runtime logic should remain separate.

---

# Recommended file structure

Adapt the exact names to the existing project conventions, but use a separation similar to:

```text
js/games/space.js
css/games/space.css

js/games/journey.js
js/games/journey-state.js
js/games/journey-data.js
js/games/journey-combat.js
js/games/journey-mission-runtime.js
js/games/journey-travel.js
css/games/journey.css
```

Optional future files:

```text
js/games/journey-events.js
js/games/journey-upgrades.js
js/games/journey-passengers.js
js/games/journey-tutorial.js
```

Responsibilities:

### `journey.js`

Owns the overall game controller:

- launch and cleanup,
- screen transitions,
- ship screen,
- route screen,
- destination screen,
- menus,
- encounter startup,
- encounter results,
- reward presentation.

### `journey-state.js`

Owns:

- default save state,
- save/load,
- save migration,
- offline elapsed-time calculations,
- resources,
- route progress,
- upgrades,
- cosmetics,
- passengers,
- discoveries,
- completed encounters.

### `journey-data.js`

Contains configuration rather than runtime logic:

- regions,
- route nodes,
- destinations,
- encounters,
- bosses,
- upgrade definitions,
- cosmetics,
- passengers,
- reward tables,
- dialogue and transmission text.

### `journey-combat.js`

Begins as a copied and isolated version of the useful action systems from `space.js`.

Owns:

- player movement,
- shooting,
- enemies,
- projectiles,
- asteroids,
- bosses,
- health during encounters,
- rescue mechanics,
- pickups,
- encounter announcements,
- encounter completion.

It must not contain the new persistent route or ship-management systems.

### `journey-mission-runtime.js`

Owns reusable mission verbs shared across authored encounters:

- full horizontal and vertical movement,
- forward world scrolling,
- proximity scanning and signal locks,
- tractor attachment and towing,
- contextual interaction targets,
- keyboard and touch input,
- audiovisual cue callbacks,
- and clean start/destroy lifecycle behavior.

It contains no route sequencing, reward application, or save writes.

### `journey-travel.js`

Added later for forward-scrolling travel levels.

Owns:

- forward travel,
- speed,
- braking,
- boost,
- reverse movement,
- scrolling hazards,
- distance objectives,
- fuel pickups,
- route-specific travel gameplay.

---

# Product identity

The game needs a temporary internal ID immediately, even before the final public name is chosen.

Use something like:

```js
gameId: 'journey'
saveKey: 'moberinoJourneySave'
```

Do not reuse pet or Space Mobe save keys.

The public name can be updated later without changing the internal identifiers.

---

# Core game concept

The player owns a patched-up ship and travels toward a distant destination.

Progress is measured through:

- route nodes,
- regions,
- destinations reached,
- and total distance traveled.

The player does not age or evolve through life stages.

The journey replaces the pet’s maturity system.

The ship and pilot persist between visits.

The player should feel like they are returning to an expedition already in progress.

---

# Core design principles

## 1. Persistent but forgiving

The game should reward returning without punishing absence.

Good offline effects:

- power restores,
- the pilot rests,
- repairs complete,
- transmissions arrive,
- passive tasks finish,
- quiet discoveries occur.

Do not allow these while the player is away:

- hull damage,
- attacks that harm the ship,
- important missions expiring,
- fuel disappearing,
- the pilot becoming critically unwell,
- permanent losses.

A player returning after several days should feel curious and welcomed, not guilty.

## 2. Not every session is combat

Some visits should be meaningful in 20–60 seconds.

The player may:

- refuel,
- repair,
- collect restored power,
- rest the pilot,
- read a transmission,
- install a cosmetic,
- inspect the route,
- select the next destination,
- or complete a short ship interaction.

## 3. Combat must matter to the journey

Combat results should affect persistent state.

Examples:

- hull damage carries back to the ship,
- salvage becomes currency,
- fuel pickups increase fuel,
- rescues add passengers,
- boss victories unlock route progress,
- optional objectives award cosmetics or upgrades.

## 4. Failure delays progress but does not erase it

On encounter failure:

- keep all previously completed route progress,
- keep rescued characters,
- keep permanent upgrades,
- do not reset the journey.

Possible consequences:

- retreat to the previous safe node,
- lose some fuel,
- return with hull damage,
- require repair before trying again.

## 5. Keep the first version small

Do not begin by implementing the complete galaxy.

First prove that the basic loop is enjoyable:

```text
Check ship → prepare → travel → play encounter → receive result → return to ship
```

---

# Persistent resources

Use four primary meters.

## Fuel

Purpose:

- required to depart,
- consumed when traveling between route nodes.

Fuel sources:

- station refueling,
- encounter pickups,
- salvage rewards,
- rescue rewards,
- route events.

Low fuel should prevent departure but should not kill the player.

## Hull

Purpose:

- persistent ship durability,
- reduced by combat and hazards,
- repaired at the ship or stations.

Hull must not decay while offline.

Encounter health and persistent hull may use the same numeric range initially, such as 0–100.

## Power

Purpose:

- ship-system energy,
- can support shields, weapons, scans, repairs, or emergency actions.

Power may recharge over real time to encourage check-ins.

For the first playable version, keep power simple. It can be required for starting certain encounters or performing a repair.

## Pilot readiness

One combined pilot condition representing:

- rest,
- morale,
- focus,
- food,
- basic well-being.

Do not create four separate pilot meters.

The interface can describe the specific need contextually:

- “The pilot needs sleep.”
- “The pilot could use a meal.”
- “The pilot is ready to fly.”
- “The pilot needs a break.”

Pilot readiness may recover through rest and simple interactions.

Do not make low readiness cause catastrophic failure. It may:

- slightly reduce starting power,
- block optional difficult missions,
- or prompt the player to rest before departing.

---

# Temporary conditions

Do not place all status information into permanent meters.

Support temporary conditions separately, such as:

- engine damaged,
- shield offline,
- cargo full,
- passenger aboard,
- distress signal detected,
- weapon overheated,
- repair underway,
- route scanned.

These should appear as compact status messages or badges.

---

# Currency and rewards

Use one general journey currency initially.

Possible names:

- salvage,
- credits,
- star tokens,
- scrap.

Use the existing ticket/prize logic as inspiration, but store the new currency separately.

Currency purchases:

- functional upgrades,
- cosmetics,
- repairs,
- fuel,
- optional supplies.

Avoid multiple currencies during the first implementation.

---

# Functional upgrades

Create a small number of clear upgrade tracks.

Initial recommended tracks:

## Fuel tank

- increases maximum fuel.

## Hull plating

- increases maximum hull or reduces encounter damage.

## Blaster

- increases firing speed or projectile effectiveness.

## Power core

- increases maximum power or recharge speed.

## Salvage magnet

- increases pickup range.

## Passenger berth

- increases the number of simultaneous passengers or mission characters.

The first playable build only needs one or two upgrades.

Do not build a large randomized equipment system.

Use deterministic upgrade levels:

```js
fuelTankLevel: 0
hullLevel: 0
blasterLevel: 0
powerCoreLevel: 0
salvageMagnetLevel: 0
passengerBerthLevel: 0
```

Each upgrade definition should contain:

```js
{
  id,
  name,
  description,
  maxLevel,
  costs,
  effects
}
```

---

# Cosmetics

Cosmetics should become a major long-term reward category.

Possible cosmetic categories:

- hull color,
- hull decal,
- cockpit window,
- engine trail,
- wing shape,
- antenna,
- dashboard decoration,
- pilot outfit,
- projectile style,
- cabin theme,
- passenger charm,
- boss trophy.

For the first playable version, implement:

- one selectable hull color,
- and one boss-earned cosmetic.

Cosmetics must never overwrite Space Mobe cosmetics or pet cosmetics.

---

# Passengers and rescued characters

Rescued characters should persist after the encounter.

Store passengers and discovered characters in the journey save.

Possible passenger behavior:

- appear on the ship screen,
- provide a small passive effect,
- send dialogue,
- unlock a route node,
- request a detour,
- give a reward,
- leave when reaching their destination,
- become permanent crew.

Passenger data structure:

```js
{
  id,
  name,
  role,
  status,
  boardedAtNode,
  destinationNode,
  bonus,
  dialogueState
}
```

The first playable version needs only one rescued passenger.

The passenger must visibly appear or be acknowledged on the ship screen after rescue. Do not reduce the rescue to only a collection flag.

---

# Overall screen structure

The journey game should have its own internal screens.

Recommended flow:

## Main title/menu

Options:

- Continue Journey
- New Journey
- How to Play
- Back

Do not show Continue when no save exists.

## Ship screen

This is the central home screen.

Show:

- ship and pilot,
- current location,
- next destination,
- route progress,
- hull,
- fuel,
- power,
- pilot readiness,
- active passenger,
- available actions.

Possible actions:

- Route
- Repair
- Refuel
- Rest
- Upgrades
- Customize
- Log
- Depart

The first version can simplify this to:

- Route
- Repair
- Refuel
- Rest
- Depart

## Route screen

Shows:

- current node,
- available connected nodes,
- fuel costs,
- node types,
- known rewards or risks,
- locked paths.

The first prototype does not need a free-roaming galaxy map. Use a clear route path made from nodes and connectors.

## Encounter screen

Runs combat or travel gameplay.

## Results screen

Show:

- success or failure,
- hull remaining,
- fuel spent and earned,
- salvage earned,
- passenger rescued,
- objective progress,
- route outcome.

Then return to the ship screen.

## Upgrade screen

Added after the first validation gate.

## Customization screen

Added after the first validation gate.

## Captain’s log

Added later.

Tracks:

- regions visited,
- bosses defeated,
- passengers rescued,
- discoveries,
- transmissions,
- cosmetics,
- total distance.

---

# Route model

Use a data-driven graph.

Example node:

```js
{
  id: 'home-orbit',
  regionId: 'region-1',
  name: 'Home Orbit',
  type: 'safe',
  connections: ['fuel-stop-1'],
  firstVisitEvent: 'journey-begins',
  repeatable: true
}
```

Example encounter node:

```js
{
  id: 'scrap-belt',
  regionId: 'region-1',
  name: 'Scrap Belt',
  type: 'encounter',
  encounterId: 'asteroid-salvage-1',
  fuelCost: 8,
  connections: ['distress-signal', 'repair-moon']
}
```

Example boss node:

```js
{
  id: 'ogre-gate',
  regionId: 'region-1',
  name: 'Ogre Gate',
  type: 'boss',
  encounterId: 'boss-ogre-1',
  fuelCost: 12,
  connections: ['first-settlement'],
  unlockRequirements: {
    rescuedPassengers: ['first-rescue']
  }
}
```

Store completed nodes separately from route definitions.

Do not mutate the route configuration objects.

---

# Save state

Create a versioned save structure.

Example:

```js
const DEFAULT_JOURNEY_SAVE = {
  version: 1,

  createdAt: null,
  lastPlayedAt: null,

  currentRegionId: 'region-1',
  currentNodeId: 'home-orbit',
  selectedDestinationId: null,

  totalDistance: 0,

  resources: {
    hull: 100,
    maxHull: 100,
    fuel: 40,
    maxFuel: 40,
    power: 100,
    maxPower: 100,
    pilot: 100
  },

  currency: {
    salvage: 0
  },

  upgrades: {
    fuelTankLevel: 0,
    hullLevel: 0,
    blasterLevel: 0,
    powerCoreLevel: 0,
    salvageMagnetLevel: 0,
    passengerBerthLevel: 0
  },

  cosmetics: {
    unlocked: ['default-hull'],
    equipped: {
      hull: 'default-hull',
      trail: 'default-trail',
      cockpit: 'default-cockpit'
    }
  },

  passengers: {
    active: [],
    rescued: []
  },

  route: {
    visitedNodes: ['home-orbit'],
    completedNodes: [],
    unlockedNodes: ['home-orbit', 'fuel-stop-1'],
    defeatedBosses: []
  },

  encounters: {
    completed: {},
    failed: {}
  },

  log: {
    transmissions: [],
    discoveries: []
  },

  timers: {
    repairCompleteAt: null,
    powerUpdatedAt: null,
    pilotUpdatedAt: null
  },

  settings: {
    tutorialComplete: false
  }
};
```

Requirements:

- validate loaded values,
- clamp meters,
- recover safely from malformed saves,
- never allow one broken property to prevent the game from launching,
- include a version number,
- centralize save writes,
- avoid writing on every animation frame.

Use one save function such as:

```js
saveJourneyState(reason)
```

---

# Offline progression

On launch:

1. Read `lastPlayedAt`.
2. Calculate elapsed real time.
3. Cap the elapsed duration.
4. Apply only positive or neutral recovery.
5. Save the updated timestamp.

Initial offline behavior:

- power regenerates,
- pilot readiness regenerates,
- an active repair timer may complete.

Do not consume fuel offline.

Do not damage hull offline.

Do not auto-complete major route encounters offline.

Cap offline benefits, for example at 12 or 24 hours, so values remain predictable.

---

# Encounter architecture

`journey-combat.js` should expose a clean entry point.

Example:

```js
JourneyCombat.start({
  encounterId: 'asteroid-salvage-1',
  encounterType: 'asteroids',
  difficulty: 1,

  startingHull: journeyState.resources.hull,

  shipStats: {
    blasterLevel: 0,
    hullLevel: 0,
    salvageMagnetLevel: 0
  },

  objectives: {
    surviveSeconds: 35,
    salvageTarget: 5
  },

  rewards: {
    salvage: 20,
    fuel: 5
  },

  onComplete: handleJourneyEncounterComplete
});
```

Completion result:

```js
{
  encounterId: 'asteroid-salvage-1',
  outcome: 'success',
  hullRemaining: 72,
  damageTaken: 28,
  fuelCollected: 4,
  salvageCollected: 8,
  objectiveComplete: true,
  rescuedPassengerId: null,
  bossDefeated: null,
  stats: {
    shotsFired: 40,
    enemiesDefeated: 0,
    durationMs: 38000
  }
}
```

Failure result:

```js
{
  encounterId: 'asteroid-salvage-1',
  outcome: 'failure',
  hullRemaining: 10,
  damageTaken: 90,
  fuelCollected: 1,
  salvageCollected: 2,
  objectiveComplete: false,
  rescuedPassengerId: null,
  bossDefeated: null
}
```

The journey controller applies the result to persistent state.

The combat module must not write directly to local storage.

---

# Combat systems to copy from `space.js`

Copy only what is needed, preserving working behavior as much as possible.

Initial copied systems:

- canvas setup,
- animation loop,
- player ship,
- keyboard controls,
- touch controls,
- firing,
- projectiles,
- enemy projectiles,
- asteroid spawning,
- enemy spawning,
- enemy movement,
- collisions,
- explosions,
- pickups,
- health display,
- announcements,
- encounter cleanup,
- audio hooks.

Later copied systems:

- captive/rescue logic,
- Ogre boss,
- other bosses,
- special boss projectiles,
- Battery Catch,
- blackout or sensor effects,
- escort mechanics,
- other wave-specific behaviors.

Do not copy:

- Campaign sequencing,
- Campaign wave number handling,
- Endless mode loops,
- Boss Run menu flow,
- Space Academy flow,
- Space Mobe score storage,
- Space Mobe mode selection,
- Space Mobe game-over navigation.

Replace those systems with encounter configuration and callbacks.

---

# Initial encounter types

The complete game should eventually support:

## Combat encounter

Defeat enemies or survive an ambush.

## Asteroid encounter

Survive, destroy hazards, or collect salvage.

## Rescue encounter

Reach or defend a captive and return safely.

## Boss encounter

Defeat a route guardian or major antagonist.

## Fuel collection encounter

Collect enough fuel before time or hazards end the attempt.

## Escort encounter

Protect another ship.

## Defense encounter

Protect a station, gate, or ship system.

## Battery/power encounter

Adapt Battery Catch into emergency power restoration.

## Travel encounter

Move through a scrolling area using acceleration, braking, and reverse movement.

## Peaceful event

No action gameplay. Present a choice, discovery, merchant, transmission, or passenger moment.

The first playable version should only include:

- Scrap Belt navigation and signal search,
- rescue encounter,
- Abandoned Cache decoding and vault interaction,
- hands-on repair,
- Ogre boss,
- peaceful fuel stop.

---

# Travel gameplay

Do not force every encounter into one movement model.

The reusable Journey mission runtime already supports forward scrolling and
two-axis movement for travel, scanning, salvage, and environmental missions.
Fixed-position rescue and repair interactions remain separate. Boss combat may
reuse isolated Space Mobe ideas, but only when they serve the authored set piece.

Travel encounter controls:

- left/right steering,
- accelerate,
- brake,
- optional reverse,
- fire when the encounter includes hazards or attackers.

Travel mechanics:

- world scroll speed,
- distance remaining,
- debris,
- gates,
- moving hazards,
- fuel pickups,
- optional side routes,
- speed boosts,
- slowdown zones,
- pursuit sequences.

The player should feel like they are moving forward through space rather than sitting at the bottom of a fixed arena.

Do not add this before the first validation gate.

---

# Initial route: Chapter One

Create one short chapter.

Working title:

## Chapter One: Get Out of Town

Recommended node sequence:

```text
Home Orbit
    |
Fuel Stop
    |
Scrap Belt
    |
Distress Signal
    |
Repair Moon
    |
Ogre Gate
    |
First Settlement
```

Optional small branch:

```text
Scrap Belt
   ├── Distress Signal
   └── Abandoned Cache
```

Both paths reconnect at Repair Moon.

Node purposes:

### Home Orbit

- opening cockpit,
- tutorial introduction,
- establish the stolen-crystal hunt,
- launch toward the preselected first stop.

### Fuel Stop

- teaches fuel,
- peaceful interaction,
- restores enough fuel to continue.

### Scrap Belt

- forward navigation and local signal search,
- teaches two-axis steering, tap scanning, signal pursuit, collisions, and optional
  tractor salvage,
- uses no firing,
- awards salvage and reveals the Pilot's Call.

### Distress Signal

- fixed-position grappling and docking rescue,
- teaches timed tether shots and rapid collar extension,
- adds Pip as a persistent visible companion,
- moves the cache crystal to Ogre Gate when this route is chosen.

### Abandoned Cache

- alternate Pilot's Call mission rather than a second optional errand,
- uses tonal decoding, power routing, vault unlocking, and physical crystal
  extraction,
- recovers the first Star Crystal,
- moves Pip's rescue to Ogre Gate when this route is chosen.

### Repair Moon

- reconnects both branch outcomes,
- teaches physical persistent repair,
- restores visible hull damage,
- installs and visibly confirms the first permanent upgrade,
- sets up the branch-adaptive boss.

### Ogre Gate

- first multi-phase blockade boss,
- changes according to whether Pip or the first crystal is already aboard,
- combines scanning, component disabling, weak-point combat, and the unresolved
  branch rescue or recovery,
- unlocks the final node.

### First Settlement

- physical arrival and character welcome,
- chapter consequence for Pip and the crystal,
- Chapter One completion,
- awards a cosmetic,
- shows future route teaser,
- ends the first playable test build.

---

# Tutorial approach

Do not create a long text-heavy tutorial.

Teach systems when first encountered.

Examples:

At the ship:

- “This is your hull. Damage carries home after a fight.”
- “Fuel is used when you travel.”
- “Power and pilot readiness recover while you are away.”

At the route:

- “Choose a connected destination.”
- “Travel costs fuel.”

In Scrap Belt:

- teach drag or WASD steering on the paused playfield,
- teach tap-the-playfield scanning separately from steering,
- show hull damage clearly,
- require both crossing the route and capturing the signal,
- do not introduce firing.

At the rescue:

- explain rescue objective,
- confirm that the rescued character is now aboard.

At Repair Moon:

- explain repairs and persistent damage.

Use confirmations and allow missed tutorial actions to be repeated, following the improved Space Academy behavior.

---

# First implementation stages

## Stage 0: Protect the existing games

Before implementation:

1. Confirm Space Mobe currently launches and all modes work.
2. Confirm the existing pet game currently launches.
3. Create a dedicated branch for the journey implementation.
4. Record the current Space Mobe behavior with basic smoke-test notes.
5. Do not modify `space.js` or Space Mobe’s launch registration during the initial copy.

Acceptance check:

- Space Mobe still behaves exactly as before.
- No journey files are loaded when Space Mobe launches.

## Stage 1: Register a separate arcade game

Add:

- new arcade card,
- temporary journey title,
- new game ID,
- new launch path,
- new container,
- new CSS,
- new JavaScript entry file,
- back/close behavior matching other arcade games.

Initially, launching Journey may display a static placeholder ship screen.

Acceptance check:

- Space Mobe and Journey appear as two separate cards.
- Each launches independently.
- Closing Journey returns to the arcade correctly.
- Launching Journey does not initialize Space Mobe.
- Launching Space Mobe does not initialize Journey.
- No console errors occur when switching repeatedly between them.

## Stage 2: Build persistent journey state

Implement:

- default save,
- save/load,
- versioning,
- new journey,
- continue journey,
- reset journey for development,
- timestamps,
- resource clamping.

Create a simple developer debug panel or temporary console helpers for:

- loading a known-good checkpoint immediately before each authored beat,
- restoring hull, fuel, power, and pilot readiness without changing progression,
- rebuilding prerequisite route, intel, crew, and resource state rather than
  jumping only the visible screen.

During active development, the Journey cockpit exposes these tools from a gear
in the top bar. A checkpoint intentionally replaces the Journey save so every
retest begins from a reproducible state and still uses normal route and mission
logic.

Ensure debug controls are disabled or removed for production.

Acceptance check:

- create a journey,
- change a resource,
- close the game,
- reload,
- confirm the state persists,
- confirm Space Mobe saves are unchanged,
- corrupt one optional journey save property and confirm the game still launches safely.

## Stage 3: Build the ship screen

Create the cockpit as the central home screen.

The cockpit must show, in this order:

- one message, transmission, or ship-status warning,
- a vertical visual map with current position and forward route,
- compact Wayfarer condition, resources, selected hero, and visible companions,
- and the selected next destination with a green ready or red blocked launch state.

Detailed systems belong one level deeper:

- Open Ship contains repair, maintenance, upgrade, power, and readiness details.
- Log expands messages, discoveries, crew, and route consequences.
- The map handles genuine route decisions.
- The next-destination panel launches or explains exactly why launch is blocked.

Acceptance check:

- the full cockpit fits in one viewport without scrolling,
- map, ship status, and next destination are visually distinct,
- active companions are visibly present rather than only named in text,
- launch readiness is legible without opening another screen,
- blocked launch states give one clear reason,
- state persists after closing and reopening,
- layout works on desktop and mobile,
- no ship-screen action affects Space Mobe.

## Stage 4: Build the route system

Implement the Chapter One route as data.

Requirements:

- show current node,
- show connected available nodes,
- show fuel cost,
- prevent travel without enough fuel,
- prevent selecting locked nodes,
- record visited and completed nodes,
- allow returning to safe nodes when intended.

Use a simple readable vertical map. Travel reads bottom-to-top, optional branches
separate laterally, and their forward reconnection is visible.

Acceptance check:

- player can select Fuel Stop from Home Orbit,
- fuel cost is previewed,
- fuel is consumed exactly once,
- current node updates exactly once,
- locked nodes cannot be opened,
- a Pilot's Call choice returns to the cockpit with the destination selected,
- committing to a branch transforms the unchosen story thread,
- reopening the game preserves the route position.

## Stage 5: Build the first isolated Journey mission

Create isolated Journey action runtimes from selected ideas in `space.js`.

First encounter:

- Scrap Belt navigation and signal-search encounter.

Do not modify the original `space.js`.

Implement encounter launch configuration and completion callback.

The first encounter needs:

- full two-axis movement through a forward-scrolling field,
- readable debris traffic and collisions,
- tap-the-playfield local scanning,
- a small moving signal that must be reacquired if lost,
- proximity capture by staying inside its ring,
- optional tractor salvage,
- no firing,
- persistent hull damage and salvage,
- retry on failure,
- and an in-mission achievement confirmation before results.

Acceptance check:

- Journey can launch the Scrap Belt mission,
- Space Mobe still launches independently,
- tapping scans while dragging steers,
- scanning reveals only a local area,
- the signal moves enough to require pursuit through traffic,
- success requires route completion and captured signal,
- hull failure cannot award success,
- damage taken updates persistent hull,
- rewards update persistent salvage and/or fuel,
- results apply once,
- reloading during results does not duplicate rewards,
- encounter cleanup removes listeners and animation loops,
- launching the encounter multiple times does not accelerate timers or duplicate input.

## Stage 6: Add the rescue encounter

Build a dedicated fixed-position rescue interaction rather than adapting the
forward-flight mission.

Requirements:

- distress-signal node launches the rescue,
- the Wayfarer holds position while Pip's pod visibly tumbles,
- the pod spins while moving laterally and nearer/farther from the Wayfarer,
- the player times two fixed grappling-gun shots as moving, color-matched ports
  cross their sightlines,
- misses retract for immediate retry and each hit visibly slows the pod,
- the docking collar is unavailable until both tethers stabilize the pod,
- each tap extends the collar while it continuously retracts between taps,
- reaching full collar extension visibly reels the pod toward the Wayfarer,
- rescued passenger ID is returned in results,
- passenger is added once,
- passenger appears or is acknowledged on the ship screen,
- route unlocks the next required node.

Acceptance check:

- no scanning, shooting, free flight, or survival timer appears,
- a missed tether retracts and can be tried again immediately,
- both tethers are required before docking,
- successful rescue adds the passenger,
- repeating the encounter cannot add a duplicate passenger,
- failure does not mark the rescue complete,
- the passenger persists after reopening the game,
- passenger dialogue or presence appears on the ship screen.

## Stage 7: Add Repair Moon

Create a peaceful hands-on destination that teaches persistent maintenance.

Requirements:

- show the Wayfarer docked with accumulated damage visible on the ship,
- let the player repair through a physical patch, alignment, cable, or component
  interaction,
- make the repair effect immediate and visible,
- introduce one functional upgrade through physical installation,
- reflect the installed component on the ship,
- let the active companion participate in the beat,
- prepare the player for the branch-adaptive Ogre Gate mission.

Initial upgrade recommendation:

- Blaster Level 1,
- or Hull Plating Level 1.

Acceptance check:

- repair cost is clear,
- no arbitrary short repair countdown appears,
- repair requires one readable physical action,
- repair cannot exceed maximum hull,
- upgrade cost is charged once,
- upgrade persists,
- the installed upgrade is visibly confirmed,
- the upgrade has a measurable effect in combat.

## Stage 8: Add the adaptive Ogre Gate boss

Use isolated Space Mobe boss ideas as ingredients, but author Ogre Gate around the
Journey route and the unresolved Pilot's Call consequence.

Do not alter the Space Mobe Ogre.

Requirements:

- launch through the Ogre Gate route node,
- use journey hull and upgrades,
- begin with a readable physical blockade,
- scan shield anchors and disable components before weak-point combat,
- change the objective and dialogue based on whether Pip or the cache crystal is
  already aboard,
- resolve the transformed branch thread during the mission,
- return a boss-specific result,
- unlock First Settlement after victory,
- retreat safely after failure.

Acceptance check:

- boss is winnable,
- both Pilot's Call paths produce meaningfully different setups,
- the boss is not an asteroid-field reskin,
- boss failure does not reset Chapter One,
- damage persists,
- Pip and crystal outcomes apply once,
- boss victory records exactly once,
- boss rewards cannot be duplicated,
- Ogre remains unchanged in Space Mobe.

## Stage 9: Add chapter completion

First Settlement should:

- show the Wayfarer arrive and land,
- introduce a visible settlement character,
- mark Chapter One complete,
- award one cosmetic,
- resolve Pip and crystal status from either route,
- show total distance traveled,
- tease the next region,
- return the player to a stable ship screen.

Do not build Chapter Two yet.

---

# Mandatory validation gate

## Stop development here before building the rest of the game

At this point, the game must include:

- a separate arcade card,
- independent launch,
- independent save,
- one-screen cockpit and separate ship detail,
- four resources,
- simple offline recovery,
- vertical Chapter One route with a consequential Pilot's Call,
- peaceful fuel stop,
- Scrap Belt navigation and signal mission,
- rescue encounter,
- Abandoned Cache decoding and crystal recovery,
- one passenger,
- hands-on repair destination,
- one functional upgrade,
- branch-adaptive Ogre boss,
- one cosmetic reward,
- chapter completion.

Do not proceed directly into the full route.

Test this build as a complete miniature version of the final game.

---

# Validation questions

The build should be played across multiple sessions rather than only in one sitting.

Evaluate:

## Core feeling

- Does this feel like a journey rather than a menu of minigames?
- Does the route create anticipation?
- Does returning to the ship feel meaningful?
- Does the player understand where they are going?
- Does arriving at the settlement feel like progress?

## Session variety

- Is a quiet check-in satisfying?
- Does every session feel forced into combat?
- Are maintenance actions meaningful without becoming chores?
- Is it obvious when the next action can wait?

## Resources

- Are four meters understandable?
- Does any meter feel redundant?
- Does fuel create useful decisions or only annoyance?
- Does persistent hull damage make encounters more meaningful?
- Is pilot readiness adding personality or just another bar?
- Is power doing enough to justify existing?

## Combat integration

- Does combat feel like part of the route?
- Are rewards and damage clearly carried back?
- Does the transition from ship to encounter feel smooth?
- Does the copied combat still feel as responsive as Space Mobe?
- Is encounter cleanup reliable?

## Persistence

- Does closing and reopening feel natural?
- Are offline benefits pleasant?
- Does the player ever feel punished for leaving?
- Are save states stable?

## Emotional value

- Does rescuing a passenger matter after the encounter?
- Does the ship feel more personal after receiving a cosmetic?
- Does the boss feel like it guards progress rather than being an isolated fight?

## Scope decision

After testing, classify the result:

### Proceed

The ship/travel/combat loop already feels compelling.

### Adjust

The structure works, but resources, pacing, UI, or transitions need refinement.

### Reconsider

The action encounters feel disconnected from the persistent layer, or the ship maintenance feels like chores.

Do not build the full game until the build reaches Proceed or a strong Adjust.

---

# Work after the validation gate

Once the Chapter One build is proven, continue with the following phases.

---

# Phase 2: Strengthen the persistent ship

## Improve ship presentation

Add:

- visible hull condition,
- engine state,
- passenger area,
- equipped cosmetics,
- small ambient animations,
- current-region background,
- contextual pilot behavior.

The ship screen should change as the journey progresses.

## Expand maintenance

Add optional interactions such as:

- patch hull damage,
- recharge a ship system,
- clear debris,
- prepare provisions,
- tune communications.

These should be short and not all required every session.

## Add transmissions

Transmissions may:

- introduce encounters,
- deliver passenger dialogue,
- reveal optional nodes,
- foreshadow bosses,
- announce repairs,
- acknowledge return after time away.

Store read/unread state.

## Expand upgrades

Add the initial upgrade tracks:

- fuel tank,
- hull plating,
- blaster,
- power core,
- salvage magnet,
- passenger berth.

Keep upgrades deterministic and understandable.

## Expand cosmetics

Add unlock and equip interfaces.

Cosmetic rewards should come from:

- bosses,
- route exploration,
- rescued passengers,
- chapter completion,
- optional objectives.

Acceptance check:

- the ship visibly reflects equipment,
- upgrade effects are real and documented,
- no cosmetic affects gameplay unless explicitly categorized as an upgrade,
- save migration supports new properties.

---

# Phase 3: Build scrolling travel encounters

Create `journey-travel.js`.

First travel encounter:

- move through a debris corridor,
- accelerate and brake,
- collect fuel,
- avoid collisions,
- reach a distance target.

Controls should support keyboard and touch.

Recommended behavior:

- left/right steer,
- press/hold to accelerate,
- release or use brake to slow,
- limited reverse thrust,
- firing available only where useful.

Do not replace classic combat with travel movement.

Use travel encounters selectively between destinations.

Acceptance check:

- forward motion is visually clear,
- speed changes feel responsive,
- reverse movement has a purpose,
- touch controls are understandable,
- world scrolling does not break collisions,
- encounter state cleans up correctly,
- classic combat encounters remain unchanged.

---

# Phase 4: Expand encounter library

Add reusable encounter templates.

## Enemy ambush

- defeat a required number,
- or survive for a duration.

## Swarm passage

- use existing swarmer behavior,
- frame it as a dangerous route crossing.

## Battery emergency

- adapt Battery Catch,
- restore power before travel can continue.

## Escort mission

- protect another ship until reaching safety.

## Station defense

- protect a target from waves.

## Salvage run

- collect valuable debris while avoiding hazards.

## Blackout/sensor storm

- restricted visibility,
- optional headlight or scanner mechanic.

## Captive rescue variants

- direct rescue,
- defend rescue target,
- escort rescued character,
- rescue during a boss fight.

## Boss encounters

Copy bosses individually from Space Mobe only when their route context is ready.

Acceptance check for every new encounter:

- configuration is data-driven,
- it launches independently,
- it returns a standard result,
- persistent effects apply once,
- failure behavior is defined,
- tutorial messaging exists where needed,
- Space Mobe remains unaffected.

---

# Phase 5: Build the complete journey route

Recommended large-scale structure:

## Region 1: Home Orbit and Scrap Belt

Purpose:

- teach resources,
- first rescue,
- Ogre boss.

## Region 2: Ancient Route

Purpose:

- route gates,
- navigation choices,
- Knight boss,
- first meaningful branch.

## Region 3: Flooded Nebula

Purpose:

- limited visibility,
- strange movement,
- Shark boss,
- fuel scarcity.

## Region 4: Burning Corridor

Purpose:

- overheating,
- fast travel,
- Dragon boss,
- power management.

## Region 5: Gray Territory

Purpose:

- captives,
- disabled systems,
- deceptive signals,
- Gray Visitor boss.

## Region 6: Roadside Expanse

Purpose:

- strange stations,
- merchants,
- optional detours,
- Taco and Octopus encounters.

## Region 7: Lost System

Purpose:

- combine prior mechanics,
- resolve passenger stories,
- Gizmo confrontation,
- final destination.

Each region should contain:

- 5–10 primary nodes,
- at least one safe node,
- at least one choice,
- at least one peaceful event,
- at least two action encounters,
- one major reward,
- one region climax.

Do not require every player to visit every node in one journey.

Branches should reconnect so players cannot permanently ruin progression.

---

# Boss route integration

Bosses should have narrative and mechanical roles.

## Ogre

Blocks an early supply route.

Victory:

- opens the first major settlement,
- rewards an early ship cosmetic or hull upgrade.

## Knight

Guards an ancient gate.

Victory:

- unlocks a route shortcut,
- teaches lane-based danger.

## Shark

Attacks ships in a flooded nebula.

Victory:

- restores safe passage,
- awards navigation or fuel equipment.

## Dragon

Occupies a burning star corridor.

Victory:

- unlocks heat-resistant plating or engine trail.

## Gray Visitor

Captures travelers and disrupts systems.

Victory:

- frees multiple captives,
- unlocks a scanner upgrade.

## Taco

Runs an absurd hostile roadside station.

Victory:

- turns the station into a friendly stop or merchant.

## Octopus

Hides inside a sensor-obscuring ink cloud.

Victory:

- unlocks improved sensors or visibility cosmetic.

## Gizmo

Recurring antagonist or pursuer.

Do not wait until the final battle to introduce Gizmo.

Use:

- transmissions,
- distant sightings,
- ambush aftermath,
- stolen cargo,
- recurring projectiles or symbols.

Final victory should resolve the main journey.

---

# Peaceful events and choices

Not every route node should start action gameplay.

Event examples:

- abandoned station,
- traveler requesting fuel,
- merchant,
- strange radio signal,
- shortcut with uncertain risk,
- damaged cargo ship,
- passenger disagreement,
- beautiful cosmic phenomenon,
- optional detour,
- salvage auction,
- ship system malfunction,
- friendly rest stop.

Choice outcomes may affect:

- fuel,
- salvage,
- pilot readiness,
- passenger relationships,
- route unlocks,
- optional encounters,
- cosmetic rewards.

Avoid invisible arbitrary punishment.

Show enough information for a choice to feel informed.

---

# Passenger system expansion

Passengers may become:

- temporary travelers,
- permanent crew,
- recurring contacts.

Possible crew bonuses:

- mechanic: repairs are cheaper,
- navigator: reveals optional route nodes,
- musician: pilot readiness recovers faster,
- scout: warns about ambushes,
- engineer: increases power capacity,
- trader: improves merchant prices.

Do not stack unlimited passive bonuses.

Use one active crew bonus per ship station or a small equipped crew limit.

Passengers should occasionally:

- speak on the ship screen,
- react to destinations,
- request a route,
- give a reward,
- leave at a destination,
- appear in the Captain’s Log.

---

# Failure and recovery rules

Standard encounter failure:

1. Return to the previous safe node or current node.
2. Preserve a small amount of earned salvage if appropriate.
3. Apply hull damage.
4. Consume some or all travel fuel.
5. Keep the encounter available.
6. Show a clear recovery action.

Never reduce persistent hull below a safe post-failure floor unless the game has an explicit non-punitive tow system.

Recommended failure floor:

```js
hull = Math.max(hullRemaining, 10);
```

If the ship cannot continue:

- tow it to the nearest safe node,
- set hull to a low but repairable value,
- do not charge premium currency,
- do not erase progress.

---

# Economy and pacing

Initial target pacing:

- common encounter: enough salvage for a partial repair or progress toward an upgrade,
- optional route: better rewards with higher risk,
- boss: guaranteed meaningful reward,
- chapter completion: guaranteed cosmetic plus progression unlock.

Avoid requiring repeated grinding of the same node.

Repeatable encounters may exist but should not be mandatory for basic progression.

Fuel should create route planning, not force repetitive chores.

Always provide a recoverable path if the player has insufficient fuel.

Examples:

- free emergency fuel,
- short fuel collection activity,
- passenger assistance,
- station debt,
- nearby salvage node.

---

# Return-session design

When the player opens the game, present one concise return summary.

Examples:

- “Power restored while you were away.”
- “Hull repairs are complete.”
- “A transmission arrived from the outer route.”
- “Your passenger has something to tell you.”
- “The ship is ready to depart.”

Do not stack numerous modal dialogs.

Use one return panel with grouped updates.

---

# Captain’s Log

Add after several regions exist.

Track:

- total distance,
- regions reached,
- route nodes visited,
- bosses defeated,
- passengers rescued,
- crew recruited,
- transmissions,
- discoveries,
- cosmetics,
- encounter records.

The log is not a score screen. It should tell the story of this journey.

---

# New journey and replayability

After completing the final destination, offer:

- continue exploring,
- post-game expedition routes,
- New Journey Plus,
- replay bosses,
- alternate branches.

Do not erase the first completed journey without explicit confirmation.

Possible New Journey Plus carryover:

- cosmetics,
- logbook discoveries,
- selected ship appearance.

Possible reset:

- route,
- resources,
- functional upgrades,
- passengers.

This is future work and not required before the main journey is complete.

---

# Audio and visual reuse

Reuse existing assets only where licensing and project structure already allow it.

Journey should have its own presentation even when using familiar combat assets.

Distinguish Journey through:

- route interface,
- ship home screen,
- region backgrounds,
- travel effects,
- calmer check-in audio,
- transmission sounds,
- destination arrival sequences.

Space Mobe should continue to feel like an arcade shooter.

Journey should feel like a persistent expedition.

---

# Cleanup and lifecycle requirements

This project already launches multiple arcade games in one site, so cleanup is critical.

Journey must clean up:

- animation frames,
- intervals,
- timeouts,
- keyboard listeners,
- pointer listeners,
- touch listeners,
- audio loops,
- DOM overlays,
- combat objects,
- travel objects,
- temporary callbacks.

Provide one top-level cleanup path:

```js
Journey.destroy()
```

Combat and travel modules should also expose cleanup methods.

Repeated sequence to test:

1. Launch Journey.
2. Start encounter.
3. Exit.
4. Launch Space Mobe.
5. Exit.
6. Launch Journey again.
7. Start another encounter.

There must be no:

- duplicated input,
- accelerated timers,
- stacked audio,
- stale overlays,
- old encounter objects,
- incorrect save application.

---

# Accessibility and usability

Requirements:

- buttons must have readable text,
- touch targets must be large enough,
- important state must not rely only on color,
- meters need labels or accessible names,
- tutorial instructions must remain on screen long enough,
- mobile controls must avoid browser zoom and scrolling conflicts,
- results must clearly show success or failure,
- players must understand why departure is blocked.

Avoid dense technical ship terminology.

Use plain language.

---

# Development rules for Codex

1. Inspect current project patterns before adding files.
2. Follow existing arcade registration and cleanup conventions.
3. Make small commits by stage.
4. Do not perform broad unrelated refactors.
5. Do not modify Space Mobe unless explicitly required later.
6. Prefer copied, isolated logic over a risky shared runtime dependency.
7. Keep encounter definitions data-driven.
8. Keep save logic centralized.
9. Test desktop and mobile layouts.
10. Add temporary developer tools where they materially speed testing.
11. Remove or disable debug tools before final release.
12. Document each encounter’s launch and completion contract.
13. Stop at the mandatory validation gate before implementing the full game.

---

# Remaining checkpoint sequence

```text
Completed: standalone game, persistence, visual cockpit, Lantern refuel,
           Scrap Belt mission runtime, Pilot's Call commitment and thread
           transformation, Pip rescue, Abandoned Cache "Seal the Vault" puzzle
           (reusable pattern — see Seal-the-Vault section), vertical route,
           debug checkpoints, and visual/gameplay playbooks

Next 1. Rebuild Repair Moon as hands-on repair and upgrade installation
Next 2. Build the branch-adaptive Ogre Gate set piece
Next 3. Build First Settlement and Chapter One completion
Next 4. Playtest both paths and stabilize the Chapter One validation build
```

Keep these as separate testable checkpoints.

---

# Definition of first playable success

The first playable build succeeds when a new player can:

1. Launch Journey from its own arcade card.
2. Start a new persistent journey.
3. Understand the current message, vertical route, ship state, crew, and next launch
   from one cockpit screen.
4. Refuel and prepare the ship.
5. Navigate Scrap Belt, scan for the trail, and return with persistent damage and
   rewards.
6. Make a clear Pilot's Call and understand that it changes the other thread.
7. Either rescue Pip through grappling and docking or recover the first crystal
   through decoding and vault interaction.
8. See the chosen outcome persist in the cockpit, log, map, Repair Moon, and Ogre
   Gate setup.
9. Repair the Wayfarer through a physical interaction and install one upgrade.
10. Resolve the transformed story thread during the adaptive Ogre Gate mission.
11. Reach First Settlement, see the branch consequence resolve, and unlock one
    cosmetic.
12. Close the game and resume accurately later.
13. Replay the other branch from a clean save and receive a meaningfully different
    Ogre Gate setup.
14. Launch Space Mobe and confirm it remains completely unchanged.

At that point, stop and evaluate the core game before expanding.

---

# Final intended game

The finished game should be a persistent arcade road trip through space.

It combines:

- a long visible journey,
- short check-in sessions,
- ship maintenance,
- pilot care,
- route choices,
- action shooting,
- scrolling travel,
- rescues,
- passengers,
- bosses,
- upgrades,
- cosmetics,
- discoveries,
- and an evolving ship.

Space Mobe remains the focused arcade shooter.

Journey becomes the slower, persistent adventure built from some of the same mechanical DNA but developed as a separate game.
