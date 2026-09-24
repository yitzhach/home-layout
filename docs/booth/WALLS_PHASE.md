# Free-standing walls — built

Requested: *"add another wall or two if needed and be able to place them in the
booth, and then hang art on that section."*

**Done.** Layout → Free-standing walls. Add one, type its width, height,
position and rotation in inches, and hang art on either face through the usual
Location dropdown. This file is now the record of what was decided and why,
not a plan.

## The constraint that shaped it

The three walls were never a list. They are a fixed record — `booth.walls.back`,
`.left`, `.right` — and artwork names its wall by that key. Widening that record
would have changed the meaning of every saved project, and schema-1 backup
compatibility is one of the rules that must not break: a backup written
yesterday has to open unchanged today.

So `booth.walls` was left exactly as it is, and a separate optional list was
added beside it:

```js
booth.panels = [{ id, name, width, height, x, z, rotation }]
```

- Absent in every older backup, so those load untouched. `validateProject`
  treats `undefined` as "none", the same treatment `groundAsset` gets.
- `a.wall` **widened** from `"back"|"left"|"right"` to also accept
  `"panel:<id>"`. Old values keep their meaning exactly; a key naming a panel
  that is not in `booth.panels` is rejected, so a backup cannot describe art
  hanging on nothing.
- A panel id may not contain a colon, or `"panel:<id>"` would be ambiguous.

`tests/e2e.mjs` round-trips a project with a panel through a downloaded backup,
and then opens a backup with the `panels` key stripped — the two halves of the
compatibility promise, checked in a real browser.

## `wallSpec()` is the whole generalisation

Six places assumed three fixed walls. Rather than teach each of them about
panels, one function in `model.js` answers "what am I measuring against":

```js
wallSpec(p, key) -> { enabled, width, height, panel? } | null
```

`constrain`, `boundWarning`, `scalePanel`, the scene build, the drag handler
and the hanging guide all go through it, and `wallKeys(p)` is the list they
iterate. A key whose panel has been deleted returns `null`, and every caller
treats that the way it already treated a hidden wall — nothing throws.

## Decisions worth keeping

- **A panel's X/Z is the centre of its slab, not its face.** A perimeter wall's
  frame plane sits on the footprint line, so its slab hangs just outside it.
  A free-standing wall has no line to sit on and is used from both sides, so
  the frame is pushed forward by `WALL_SLAB_OFFSET` and the typed position is
  where the wall actually is. `tests/view-panels.mjs` reads the mesh's world
  matrix back and pins this.
- **Deleting a panel moves its art to the back wall** and says so in a toast.
  Silently deleting someone's placement is the kind of thing that loses trust,
  and the alternative — refusing to delete a panel with art on it — makes the
  user do the moving by hand for no gain.
- **A panel is a wall, so everything else came along free.** Same mesh, same
  `userData.wall`, same `frames[key]` and `frames[key + "-outside"]`. The
  fabric finish, drag-to-place, drop-from-library, the 4096 export and the
  hanging guide all work on panels without knowing they exist. Each panel is
  its own surfaces consumer, `wall:panel:<id>`, because it is a different width
  from the perimeter walls and so needs its own texture repeat.
- **`surfaces.releaseMatching()` exists because a deleted panel is a leak.**
  The per-consumer cache is claimed by key; a panel that goes away without
  releasing would hold its texture set alive for the rest of the session. The
  build loop now releases every `wall:` consumer that is not in the current
  wall list.
- **`focusWall` frames a panel from its own face.** There is no fixed elevation
  to switch to — a panel stands anywhere at any angle — so "View wall face"
  keeps the perspective camera and aims it down the panel's normal, the way an
  exterior face was already framed.
- **A panel keeps its own height.** Changing the booth's Wall height sets all
  three perimeter walls; a free-standing wall is a separate piece of kit and is
  not swept along with them.
- **Position was typed before it could be dragged.** This is a measured tool
  and a typed inch is the thing being measured, so the first cut was numbers
  only. Dragging came second, and did not replace them — see below.
- **The hanging guide names where a panel stands.** A builder can read a
  perimeter wall's position off the footprint; a free-standing wall's position
  is part of the measurement, so its section carries the X, Z and rotation, and
  its two faces are called front and back rather than inside and outside.
- **Eight panels is the limit**, and a panel does not affect `booth.width` or
  `booth.depth`, so the neighbouring-booths layout is untouched.

## Second pass: click and drag, and a slider per axis

Requested: *"can we make the free standing walls clickable? when selected you
can move them with the mouse (x and z) and let's add a slider for x and z."*

**Done.** Click a free-standing wall in the booth to select it; drag it across
the floor; or pull the left/right and front/back sliders in Layout. The typed
X and Z fields are still there and still authoritative — a drag writes the
same two numbers, and all three controls show one value.

- **A first click selects; only a selected wall drags.** The Move tool drags
  one straight away, the same exception artwork gets. Without this, every
  click on a panel on the way to orbiting the booth would shove it across the
  floor, and a booth's dividers are the largest click targets in the scene.
- **Artwork wins the pick.** Walls and art are raycast in one pass, so a work
  hanging on a panel is what a click on that work selects. Clicking a picture
  has never meant "pick up the wall behind it".
- **A drag is measured on the floor plane**, not on the wall's own face. X and
  Z are the two numbers being edited and the floor is the plane a plan view
  measures them in, so the drag reads the same from any orbit. The grab keeps
  its offset, so a wall does not snap its centre to the cursor.
- **A drag stops at the footprint.** `constrainPanel()` clamps to
  `panelRange()` — the booth's own half width and depth. The stored schema
  still allows ±360 and is unchanged, which is what lets a typed or imported
  position outside the booth keep its meaning; a slider whose value is already
  outside the footprint widens to hold it rather than yanking it back the
  moment the panel is drawn.
- **`scene.movePanel()` restands one wall without a rebuild.** `update()`
  disposes and rebuilds the whole scene, which is far too much for every pixel
  of a drag. The exterior frame, the posts and the art on both faces are all
  children of the panel's own frame, so moving that one group moves the lot —
  and `placePanelFrame()` is now the single piece of arithmetic the build and
  the drag both go through, so a dragged wall lands exactly where typing the
  same numbers would have put it.
- **One checkpoint per gesture.** A slider takes its undo step on the first
  `input` and the rest of the gesture rides on it, the way the artwork scale
  slider already did; the `change` that follows closes the gesture out instead
  of falling through to the generic field handler, which would checkpoint the
  finished position and leave undo pointing at the wrong thing.
- **Selecting a wall and selecting artwork are exclusive.** They are two
  selections with one inspector between them; holding both would leave the
  sliders pointing at a wall nobody is looking at. Clicking a wall opens
  Layout and scrolls its controls into view; clicking anything else lets go.
- **The selected wall is outlined in the same blue as selected artwork**, and
  its Layout block is marked to match, so the thing the sliders move and the
  thing the outline is around are visibly one thing.

## What is not covered

Nobody has looked at a booth with free-standing walls in it on real hardware.
The geometry is pinned by a test that reads the world matrix back, so *where*
a panel stands is not a guess — but whether a 72″ divider at the centre of a
10 × 10 booth reads as useful, and whether the fabric weave at a panel's width
looks right, are judgements that need eyes.
