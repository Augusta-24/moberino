# Journey Visual and Story Playbook

This is the production language for The Wayfarer journey game. It applies to new chapters, destinations, encounters, characters, bosses, rewards, and ship systems.

The game should feel like a visual space adventure—not a dashboard with story text added to it.

## Core experience

The player is the arcade character they selected.

They are piloting the Wayfarer across a visible route to:

- recover seven stolen Star Crystals,
- rescue friends and unusual companions,
- survive bosses and hazards,
- maintain and improve the ship,
- and discover where the crystals were taken.

The player should usually understand the current situation by looking at the screen before reading anything.

## The primary rule

Show the event, then explain only what the visual cannot.

Examples:

- Show a refueling hose connect and a fuel meter fill. Do not only display “+34 fuel.”
- Show debris ahead of the ship. Do not only say “the Scrap Belt is dangerous.”
- Show two signals branch on the navigation display. Do not begin with two paragraphs describing them.
- Show a recovered crystal. Do not hide it inside a reward table.
- Show a character arrive or speak. Do not deliver every story beat through a log entry.

## Screen types

### Cockpit

The cockpit is the home screen and should resemble the panel used to fly the ship.

Keep this order:

1. Current message or ship-status warning
2. Visual route map
3. Compact ship status
4. Next destination and launch state

The cockpit must fit in one viewport without scrolling.

The route map is the main object. The player should always feel that they are somewhere on a journey.

Ship repair, upgrades, and detailed logs belong on separate screens. Do not stack every system onto the cockpit.

### Cinematic

A cinematic presents one story beat.

Every cinematic should contain:

- one clear location, discovery, arrival, or event,
- one dominant visual,
- one short headline,
- one short line of dialogue or explanation,
- and one clear `CONTINUE` action.

Cinematics never advance automatically. The player decides when they are finished looking and reading.

Do not add a Skip button. Do not make players race a timer.

If an animation must complete—such as refueling—Continue may remain unavailable until the physical action finishes. Once enabled, the screen waits indefinitely.

Cinematics should not scroll.

### Choice

Reveal the situation in a cinematic first. Ask for the decision on the next screen.

A choice screen should show:

- the decision in one short question,
- two or three large choices,
- the immediate cost,
- and one short consequence for each.

Do not repeat the full cinematic explanation. Do not bury each choice inside a paragraph or a second confirmation screen.

After selection, return to the cockpit with the destination already selected.

### Encounter briefing

Use:

- the mission or location name,
- a strong visual preview,
- the objective in one or two sentences,
- the few numbers that matter,
- controls,
- and one large start button.

Do not place decorative or redundant text above the mission title. A small label is only justified when it communicates new information such as an urgent ship warning or a named speaker.

### Combat

Combat must communicate cause and effect immediately.

Required feedback:

- weapon sound,
- impact sound,
- pickup sound,
- visible hull meter,
- red damage flash,
- hit shake,
- explicit hull-loss number,
- and persistent damage after the encounter.

Difficulty should create real steering decisions. A field with auto-fire cannot be solved by remaining mostly still.

### Ship, maintenance, and log

These may scroll when their purpose genuinely requires detail.

The ship screen is for:

- repair,
- refuel services,
- rest,
- upgrades,
- and detailed resource condition.

The log is expandable reference material. It should not be required to understand the immediate mission.

## Continue behavior

`CONTINUE` is the shared language for moving from one visual story beat to the next.

Use it for:

- the opening story,
- arrivals,
- discoveries,
- transmissions,
- character conversations,
- crystal recoveries,
- refueling completion,
- boss introductions,
- and story results.

Continue should be prominent, consistently placed near the bottom, and large enough to tap easily.

## Writing rules

Write for quick comprehension, not lore density.

- One idea per screen.
- Prefer one short sentence over a paragraph.
- Prefer concrete verbs: `repair`, `depart`, `answer`, `recover`, `follow`.
- State why something matters.
- Remove labels that merely restate the title.
- Avoid fictional system jargon unless the visual makes it obvious.
- Logs can contain extra detail; primary screens should stay pithy.

Good:

> Someone is alive.

Weak:

> A weak signal of indeterminate origin appears to be transmitting from somewhere beyond the surrounding debris field.

## Readability rules

- Never use body text below 12px.
- Important body copy should usually be 14–17px.
- Use white for readable text on dark backgrounds.
- Use yellow for objectives, warnings, costs, and important status.
- Use cyan for navigation, technology, titles, and available actions.
- Do not use dim gray for information the player needs.
- Do not truncate important copy with ellipses.
- Rewrite copy to be shorter before shrinking it.
- Keep text clear of decorative art.

## Visual composition

- The selected hero’s face must remain unobstructed.
- Place crystals, debris, effects, and props around characters—not over their faces.
- Protect title and dialogue areas with negative space or a subtle dark backing.
- Use foreground and background objects to create depth.
- Destination art should be specific to that place.
- Reuse the dark navy visual world, cyan navigation light, warm yellow objectives, and selective violet accents.

Motion should explain the event:

- a ship arrives,
- a hose connects,
- a meter fills,
- a signal locks,
- debris drifts,
- a crystal reveals itself,
- or a passenger comes aboard.

Avoid motion that exists only to keep the screen busy.

## Status language

Ship status should use reusable, consistent alerts.

- Amber: warning or attention required
- Green: ready and safe to proceed
- Red: blocked or unsafe

A blocked action must say why:

- insufficient fuel,
- critical hull,
- exhausted pilot,
- or repairs in progress.

The color and text must be driven by the same game-state rule. Never show a green Depart button when travel will fail.

## Layout rules

Cockpits, cinematics, arrivals, choice screens, and briefings should fit in one viewport without scrolling.

When space is tight:

1. shorten the copy,
2. reduce empty space,
3. simplify secondary decoration,
4. then reduce the main visual slightly.

Do not solve layout problems by making required text tiny.

Detailed maintenance and archive screens are the intentional scrolling exceptions.

## Story rhythm

The repeating journey rhythm is:

1. Cockpit shows the current route and message.
2. A destination is selected or a Pilot’s Call is made.
3. The ship departs.
4. An arrival cinematic establishes the place.
5. A character, creature, hazard, or discovery creates the next beat.
6. The player acts.
7. The result is shown visually.
8. Persistent ship and story state return to the cockpit.

Not every stop is combat. Quiet services, discoveries, conversations, repairs, and companion moments keep the journey from becoming a mission list.

## Story anchors

Keep these elements visible across the game:

- the selected arcade hero,
- the Wayfarer,
- the route and current position,
- seven Star Crystals,
- rescued friends and companions,
- persistent ship condition,
- and the next meaningful lead.

After several missions, introduce a creature companion through an authored arrival/rescue beat. The companion should become visually present aboard the ship, not only appear as a line in the log.

## Review checklist

Before considering a new screen complete, verify:

- Can the player understand what happened by looking?
- Is there only one main idea?
- Is the selected hero or relevant character visible when appropriate?
- Is all required text white, yellow, or another high-contrast semantic color?
- Is any important text truncated, gray, overlapping, or too small?
- Does the screen fit without scrolling when it should?
- Does every cinematic wait for Continue?
- Is decorative text above the title actually necessary?
- Does the action button clearly show ready, blocked, or selected state?
- If blocked, does it explain why?
- Do sound and animation match the event?
- Does the result persist and appear back in the cockpit?

