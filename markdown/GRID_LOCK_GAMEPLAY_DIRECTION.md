# Grid Lock Gameplay Direction

This note records the intended progression of Grid Lock. It is design direction,
not a current implementation plan or a commitment to build every mechanic now.

## World Progression

1. **Classic Grid** — learn that every conduit must connect from the source to
   each endpoint with no loose ends.
2. **Sliding Grid** — introduce position as a second concern. The board keeps
   Grid Lock's rotation rules but includes a small number of empty cells so
   selected adjacent pieces can slide into them.
3. **Obstacles** — learn to route around permanent constraints.
4. **Multiple Systems** — learn to plan across more than one power source or
   endpoint system.
5. **Advanced Tiles** — combine the established ideas into mastery puzzles.

## Progression and Replayability

Grid Lock progression unlocks rules, difficulty recipes, and mechanics rather
than a finite set of handcrafted boards. A level is a replayable generator
recipe: playing it again produces a new board within the same rules.

This supports two player motivations at the same time:

- **Progression:** unlock the next level, world, or mechanic.
- **Replayability:** play another puzzle using a favourite world or ruleset.

Future world data should therefore define board size, difficulty, generation
rules, targets, and enabled mechanics. It should never require a stored board
layout for normal progression play.

## Deferred Seeded Challenges

A daily or shared challenge can later use the existing generator with a fixed
seed so every player receives the same board. This is intentionally deferred
until world recipes and progression are stable.

## Sliding Grid Principle

Sliding Pieces is intended for World 2, not a late-game feature. It should read
as the same Grid Lock board with one new realization: a conduit may be correctly
rotated but be in the wrong position.

- Use one empty cell initially.
- Start with a declared 2×2 movement bay on a 5×5 board. Its lighter-gray
  substrate, not a tile-color state, explains which conduits can move.
- Let only conduits inside that bay swap with an adjacent empty cell.
- Keep the rest of the grid visually normal; do not decorate every fixed tile.
- Tap rotates. Dragging or swiping a bay conduit toward the adjacent empty cell
  moves it. Add a guided first-level tutorial once the movement presentation is
  final; do not leave persistent arrows or status marks on the board.
- Preserve tile rotation and the existing conduit-validation rules.
- Avoid turning the entire board into a conventional sliding puzzle.
- Reserve locked or immovable pieces as a later extension of this world.

The player question should become: “Is this conduit facing the wrong way, or is
it in the wrong place?”

## Architecture Consequence

World modifiers must describe mechanics without owning UI. Sliding Grid will
need an `empty` cell type, movable/locked tile capabilities, movement rules, and
validation that operates on the tile currently occupying each cell. The generator,
validator, map progression, and UI should remain separate modules.

## Obstacle Principle

Obstacles are permanent, generated blocked cells. They remove a location from
the conduit graph; they are not tiles to rotate, move, or power. A generator
must protect the source and endpoints, then accept an obstacle layout only when
every remaining conduit cell is still connected to the source. This preserves
the core promise: the player is solving a constrained Grid Lock puzzle, never
recovering from an unwinnable generated board.

Obstacle layouts must also produce a route detour; random scattered holes that
merely reduce the active board do not qualify as World 3 content. World 3 keeps
World 2's one-empty-cell 2×2 movement bay, uses a larger board to retain puzzle
scope, and adds visibly locked conduits. Locked conduits are generated in their
solved orientation, cannot rotate or slide, and act as route anchors rather
than hidden failure states.

## World 2 Recipe Curve

World 2 keeps one rule set for all ten replayable recipes: a 5×5 board until
the final two recipes, one empty cell, and one 2×2 lighter-gray movement bay.
The bay never changes position during a run, but its configured location changes
between levels. This keeps the positional decision bounded while changing its
relationship to the source, bolts, and denser surrounding routes.

1. **Open Bay** through **Bay Relay** establish the centered bay.
2. **High Relay** through **Circuit Position** move that same bay around a 5×5
   grid and increase generator density.
3. **Array Shift** and **Sliding Master** expand only the surrounding board to
   6×6; the movable area remains a single 2×2 bay.
