# Moberino project instructions

## Journey work

Before planning or changing the persistent Journey game, read these files:

1. `markdown/PERSISTENT_SPACE_JOURNEY_IMPLEMENTATION_GUIDE.md`
2. `markdown/JOURNEY_VISUAL_STORY_PLAYBOOK.md`
3. `markdown/JOURNEY_GAMEPLAY_PLAYBOOK.md`

Treat their current product direction, next milestone, visual contract, and review
checklists as requirements. Do not design a Journey screen or mission from the
immediate prompt alone.

Before implementing each Journey screen or beat, establish:

- its purpose,
- its must-see subject,
- its explanatory motion,
- its single player action,
- and its persistent consequence.

Before implementing each mission, also define its primary verb, physical success
state, pressure, payoff, and contrast with the previous two missions. Do not reuse
the asteroid encounter with different labels, timers, or rewards.

Every concrete noun or claim in Journey copy must have a visible counterpart. A
generic star field is not sufficient when a destination, signal, threat, character,
reward, or state change has been named.

When user feedback reveals a reusable Journey design rule, update the relevant
visual or gameplay playbook in the same change. Keep one-off positioning or tuning
decisions in code rather than bloating the playbooks.

Preserve Pet Mobe and Space Mobe as independent games. Journey must keep isolated
runtime logic and save state. Run the Journey tests and a diff check after changes.
