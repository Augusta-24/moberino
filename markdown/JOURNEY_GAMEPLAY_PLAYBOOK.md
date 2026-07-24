# Journey Gameplay Playbook

This is the gameplay language for The Wayfarer journey game. Read it with:

- [PERSISTENT_SPACE_JOURNEY_IMPLEMENTATION_GUIDE.md](PERSISTENT_SPACE_JOURNEY_IMPLEMENTATION_GUIDE.md)
- [JOURNEY_VISUAL_STORY_PLAYBOOK.md](JOURNEY_VISUAL_STORY_PLAYBOOK.md)

The game is a cinematic space adventure built from short, distinct interactive
set pieces. It is not an asteroid game wrapped in a route interface.

## Player fantasy

The player is their selected arcade character: a resourceful space adventurer
piloting the patched-up Wayfarer in pursuit of seven stolen Star Crystals.

They should feel like they:

- follow physical clues across a visible route,
- enter strange places,
- operate and repair real machinery,
- navigate hazards and unusual forces,
- decode signals and unlock ancient systems,
- rescue memorable friends and creatures,
- make route decisions with consequences,
- and confront guardians that change the journey.

The cockpit connects the adventure. The missions are the adventure.

## Core loop

1. A visible lead or problem appears.
2. The player selects or earns a destination.
3. The Wayfarer arrives somewhere visually specific.
4. The player performs an activity unique to that situation.
5. A discovery, rescue, repair, victory, or setback happens physically.
6. Persistent ship, crew, crystal, and route state change.
7. The cockpit shows what changed and presents the next lead.

No mission is complete if only its result table changes.

## Mission onboarding and completion

When a mission introduces an unfamiliar verb or combines familiar verbs in a new
way, pause the playfield behind a short pre-mission overlay. The overlay should:

- state the physical objective,
- teach no more than three actions in play order,
- use the same verbs as the live HUD and controls,
- show the primary touch action explicitly (`TAP SCAN`, not simply `SCAN`),
- and wait for the player to start.

Hazards do not move and the player cannot take damage while instructions are open.
An earlier briefing may explain why the mission matters; this overlay explains how
to act once the playfield is visible.

Mission success must be unmistakable inside the play experience. Before replacing
the playfield:

1. stop or suppress immediate danger,
2. show the objective changing physically into its completed state,
3. play a distinct success sound,
4. state the achievement with a large, concrete result,
5. show one or two earned outcomes,
6. and wait for a player confirmation before continuing to story or rewards.

Do not end a mission on the same frame that a progress threshold is crossed. Players
need time to recognize that their action caused the win.

## Shared player verbs

Journey should reuse a small, learnable toolkit while changing the objective and
environment around it.

### Navigate

- steer horizontally and vertically,
- thrust, brake, drift, or orbit,
- choose openings and routes,
- use gravity, currents, moving structures, and safe zones.

Portrait flight should usually communicate forward travel by moving the world
downward while the Wayfarer advances upward. Bottom-locked shooting is reserved for
encounters that specifically benefit from it.

### Scan

- triangulate signals,
- reveal hidden paths or objects,
- identify weak points,
- tune frequencies,
- compare signal strength through movement or alignment.

Scanning must require interpretation or positioning. It is not a progress bar the
player watches.

Use a three-beat scanning language when acquiring an important signal:

1. **Search:** the player moves through the space and taps Scan to pulse a small
   local area. Scanning the entire screen or holding a trivial button is not a
   meaningful search.
2. **Track:** a successful pulse reveals the source and its radio envelope. The
   source may move, drift, flicker, or become obstructed, so the player must stay
   with it.
3. **Capture:** remaining inside the signal area automatically fills a visible lock
   ring. Leaving drains partial progress; losing contact hides the source and
   requires another local scan.

Every phase needs audiovisual feedback. The local sweep must be visible and audible.
Capture pulses should become faster, brighter, or higher in pitch as lock approaches.
Full capture needs a distinct lock animation and sound, followed by a visible change
to the objective or route.

### Interact

- attach a tractor beam,
- tow or escort an object,
- cut restraints,
- rotate mechanisms,
- connect hoses or cables,
- collect and place physical objects,
- speak to characters and make choices.

### Operate and repair

- reroute power,
- patch damaged sections,
- align circuits,
- stabilize pressure,
- unlock doors or vaults,
- restore antennas, engines, gates, and life-support systems.

Not every repair is a timer or currency button. Important repairs are hands-on
activities with visible before-and-after states.

### Fight

- fire the blaster,
- dodge readable attacks,
- disable components,
- protect another target,
- exploit scanned weak points.

Shooting is one tool, not the universal answer.

## Encounter families

### Travel and navigation

Forward movement, gravity navigation, pursuits, escapes, corridors, orbital
approaches, moving gates, and hazardous currents.

### Search and rescue

Find a real target, reach it, free or stabilize it, and bring it to safety. The
person, creature, pod, or ship must be visible and mechanically relevant.

### Signal and discovery

Triangulate, decode, tune, align, map, or follow a changing clue. Discovery should
change what the player can see or reach.

### Systems and repair

Work directly on the Wayfarer or a destination. Route power, connect parts, seal
damage, restore machinery, or improvise a solution.

### Environmental puzzle

Understand a place and manipulate it: redirect light, balance gravity, rotate
structures, open locks, route energy, match symbols, or sequence machinery.

### Salvage and recovery

Choose, extract, tow, sort, or fit limited cargo. Salvage is not always produced by
shooting rocks.

### Defense, escort, and combat

Protect, pursue, survive, disable, or defeat. Objectives and targets must create
movement and decisions beyond waiting for auto-fire.

### Boss set piece

A named guardian with readable phases, physical weak points, environmental rules,
and a story consequence. A boss is not a larger health bar over the normal mission.

### Quiet character or service beat

Conversation, trade, rest, refueling, companionship, discovery, or preparation.
These remain interactive and visual but do not need danger.

## Non-flight gameplay

Not every mission happens while flying the Wayfarer.

Journey may present:

- exterior repairs on the ship,
- interior machinery and damaged compartments,
- station consoles and vault mechanisms,
- character-scale exploration,
- signal tables and navigation instruments,
- cargo handling,
- creature care or cooperation,
- conversations with spatial choices,
- and physical installation of upgrades.

A non-flight interaction still needs a clear subject, readable state, player agency,
feedback, and a persistent consequence. It cannot collapse into a form or a wall of
buttons.

## Mission contract

Define this before implementing a mission:

1. **Fantasy:** What memorable thing is the player doing?
2. **Primary verb:** What action drives most of the mission?
3. **Secondary verb:** What familiar tool supports it?
4. **Space:** Where does it happen, and what makes that place mechanically distinct?
5. **Objective:** What physical state means success?
6. **Pressure:** What creates difficulty: time, danger, precision, fuel, pursuit,
   limited attempts, changing geometry, or a meaningful choice?
7. **Visible subject:** What named person, object, threat, or reward is present?
8. **Payoff:** What does the player see happen at success?
9. **Persistence:** What changes on the ship, map, crew, or story afterward?
10. **Contrast:** How does it differ from the previous two missions?

If only the title, timer, obstacle density, and reward differ, it is not a new
mission.

## Variety rules

- Do not repeat the same primary verb in adjacent missions.
- Compare every new mission against the previous two before implementation.
- Asteroids may support a situation, but they are not the default environment.
- Do not use falling hazards as a substitute for encounter design.
- Do not create a rescue by adding a captive label to a survival mission.
- Do not create exploration by hiding a reward behind a timer.
- Do not create a puzzle with one obvious button and no state to understand.
- Do not require firing when scanning, towing, repairing, evading, or choosing is
  the more interesting action.
- Every authored destination needs at least one mechanic or interaction specific to
  its fiction.
- A chapter should include flight, non-flight interaction, a meaningful choice, a
  character beat, and a bespoke climax.

As a pacing target, no more than one of every four ordinary missions should use
asteroid destruction as its primary activity.

## Route-choice rules

A branch must represent more than the order of a checklist.

Every Pilot's Call must change at least one of:

- which mission is played,
- when or how a character is rescued,
- which reward is available,
- the state of a later mission,
- a relationship or dialogue,
- route cost or risk,
- or the tools available at the next climax.

If routes reconnect:

- show the reconnection clearly on the map,
- move the current-position marker forward,
- make the unchosen lead close, transform, or return later in a changed form,
- and explain the consequence without implying that the player traveled backward.

Do not quietly leave both branches as identical errands. Backtracking must be a
deliberate player decision with a visible route and cost.

## Rewards and discoveries

A reward must be physically earned and visibly acquired.

### Star Crystals

A crystal recovery needs:

1. a clue or signal,
2. an obstacle, puzzle, encounter, or choice,
3. the crystal visibly appearing,
4. the player physically securing it,
5. a clear audiovisual recovery moment,
6. the crystal entering the Wayfarer's collection,
7. and the cockpit, map, and log reflecting the new count.

A crystal is never just `+1` on a results screen.

### Passengers and companions

The player sees whom they are rescuing, completes a specific recovery action, sees
them come aboard, hears from them, and later sees their presence or ability affect
the ship and story.

### Upgrades and repairs

Show the damaged or replaceable part, the work being performed, and the changed
ship. Important upgrades should unlock or improve a verb, not merely increase a
number.

## Audio language

Sound identifies materials, actions, danger, and success.

- Asteroid and rock interactions use Space Mobe's procedural piano language:
  distinct notes for impacts, ricochets, destruction, and player collision.
- Scanning uses tones that communicate weaker, stronger, aligned, and locked states.
- Repair and machinery sounds communicate connection, pressure, power, and success.
- Tractor, rescue, crystal, damage, and boss events each need recognizable cues.
- Do not reuse one generic shot or impact sound for unrelated actions.

Audio feedback must correspond to visible cause and effect.

## Chapter One gameplay blueprint

### Lantern Station — service and preparation

- **Primary verb:** connect and refuel.
- Show the hose attach and the fuel enter the Wayfarer.
- Establish that services are places and actions, not reward messages.

### Scrap Belt — forward navigation and salvage

- **Primary verb:** navigate.
- Fly upward through a moving debris corridor with horizontal and vertical control.
- Scan for the crystal trail, choose openings, break only necessary debris, and
  tractor selected salvage.
- Use the asteroid piano sound language.
- Success is reaching the far side with the signal acquired, not waiting out a timer.

### Pilot's Call — consequential priority

The player chooses one mission, not two identical errands.

#### Answer the beacon

- **Primary verb:** search and rescue.
- The player triangulates Pip's signal, finds the visible pod, frees it, attaches a
  tractor beam, and brings it aboard.
- Pip joins now.
- The cache is intercepted; its crystal moves to Ogre Gate.

#### Check the cache

- **Primary verb:** decode and unlock.
- The player tunes the old signal, reroutes power through a vault mechanism, and
  physically extracts the first crystal.
- Pip's pod is intercepted; Pip becomes part of the Ogre Gate rescue.

Both choices reconnect at Repair Moon. The unchosen story thread transforms instead
of remaining as a second optional copy of the same mission.

### Repair Moon — hands-on systems work

- **Primary verb:** repair and install.
- Show the Wayfarer in a dock with visible damage and replaceable components.
- Repair arms, patch placement, cable routing, or system alignment restore the ship.
- The chosen upgrade visibly changes the Wayfarer and its available capability.

### Ogre Gate — blockade boss set piece

- **Primary verb:** disable and break through.
- Navigate a physical blockade, scan its shield anchors, disable components, and
  attack exposed weak points.
- The encounter changes based on the Pilot's Call:
  - with Pip aboard, Pip helps locate or disable the crystal lock;
  - with the cache crystal aboard, the player must rescue Pip during the blockade.
- Success visibly frees the route and resolves the transformed story thread.

### First Settlement — arrival and consequence

- **Primary verb:** arrive and connect.
- Land at a real place, meet a character, secure the crystal or rescued passenger,
  and see Chapter One's route become part of a larger map.

## Gameplay review gate

Before considering a mission complete, verify:

- Is the primary verb different from the previous mission?
- Can the player describe what they did without saying only "survived" or "shot"?
- Is the named subject visible and interactive?
- Does movement support the fantasy?
- Is there at least one decision, interpretation, or execution challenge?
- Does success happen physically on screen?
- Are sound cues specific to the action and material?
- Does the result change persistent state exactly once?
- Does the cockpit clearly show the consequence?
- Would the mission still feel different if all titles and story text were removed?

If the final answer is no, redesign the mission before polishing its presentation.
