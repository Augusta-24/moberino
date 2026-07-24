# Moberino project instructions

## Journey work

Before planning or changing the persistent Journey game, read these files:

1. `markdown/PERSISTENT_SPACE_JOURNEY_IMPLEMENTATION_GUIDE.md`
2. `markdown/JOURNEY_VISUAL_STORY_PLAYBOOK.md`

Treat their current product direction, next milestone, visual contract, and review
checklist as requirements. Do not design a Journey screen from the immediate prompt
alone.

Before implementing each Journey screen or beat, establish:

- its purpose,
- its must-see subject,
- its explanatory motion,
- its single player action,
- and its persistent consequence.

Every concrete noun or claim in Journey copy must have a visible counterpart. A
generic star field is not sufficient when a destination, signal, threat, character,
reward, or state change has been named.

When user feedback reveals a reusable Journey design rule, update the visual story
playbook in the same change. Keep one-off positioning or tuning decisions in code
rather than bloating the playbook.

Preserve Pet Mobe and Space Mobe as independent games. Journey must keep isolated
runtime logic and save state. Run the Journey tests and a diff check after changes.
