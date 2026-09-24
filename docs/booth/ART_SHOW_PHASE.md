# The indoor art-show booth — built

Requested:

> An indoor Art Show/convention booth option. White walls — default 144 inches
> tall, back wall 144 inches wide, side walls 120 inches long. No seams on
> these walls. No tent, but a light bar going across with directional lights,
> spotting each wall, nine fixtures in total. An option to be surrounded by
> other similar booths in a white exhibition hall with 30 foot ceilings. An
> input section for the individual panel — default 38 inch wide panels,
> increased or decreased in width and height. Custom input of total booth
> dimensions. A pedestal with selectable dimensions, 44 tall by 12 by 12 with
> a solid top, moved around the booth by double-clicking. A separate tool for
> all of these, and for the free-standing wall, so one tab is not such a long
> list.

**Done.** Two new inspector tabs: **Art show** and **Walls**. This file is the
record of what was decided and why.

## A venue, not a second app

The obvious way to add an indoor booth is a second set of everything. That
would have been two of each wall, two footprints, two lighting models — and
every existing feature (artwork, the hanging guide, backups, video export)
taught about both.

Instead there is one booth with a `venue`:

```js
booth.venue = "outdoor" | "artshow"   // absent means "outdoor"
```

Everything downstream is the booth it already was. Artwork still hangs on
`back` / `left` / `right`; the guide, the exports, the free-standing walls and
the backups never learn that an art show exists. What the venue changes is
what the scene draws and which defaults the switch writes.

`applyVenue(p, venue)` is that switch, and it writes the whole set at once:
footprint, the three walls, the finish, the canopy, the light bar and the hall.
A half-switched booth — 12ft walls under a pop-up canopy — is not a booth
anyone is planning, so the switch does not leave one lying around. Every number
it writes stays editable afterwards; that is what "custom booth dimensions"
means here, and the Art show tool types all three of them.

Art already hanging is re-`constrain`ed to the walls it now has, and panels and
pedestals are pulled back inside the new footprint. A switch that quietly left
a 40″ work hanging 10″ off the end of a wall would be worse than one that
refused.

## Schema 1 is unchanged, again

Four optional keys and one optional list, beside the record rather than inside
it, the same shape `booth.panels` took:

```js
booth.venue     = "outdoor" | "artshow"
booth.artShow   = { width, height, linked }        // the individual panel
booth.lightBar  = { on, height, count, power, kelvin }
booth.hall      = { on, ceiling, showCeiling }
booth.pedestals = [{ id, name, width, depth, height, x, z, rotation, color }]
```

Every one of them is `undefined` in a backup written before this release, and
`undefined` means the defaults. `artShowPanel(b)`, `lightBarSpec(b)` and
`hallSpec(b)` are the three functions that say so, and nothing reads those
records directly. A test opens a project with all five keys deleted and checks
it is still the outdoor booth it was.

Nothing widened. `a.wall` was not touched: nothing hangs on a pedestal, and an
art-show wall is the same `back`/`left`/`right` an outdoor wall is.

## Decisions worth keeping

- **"No seams" is a measurement, not a finish.** The outdoor pop-up draws a
  seam post every 30″, a foot under each and a cap rail along the top, because
  that is what it is made of. An art-show wall is one continuous surface, so
  the scene skips all three for the whole wall rather than offering a "hide
  seams" switch. A pro-panel wall does not have seams to hide.
- **The light bar is scenery, not spotlights.** Nine fixtures would fill the
  four-light list twice over, and not one of the nine is a light anyone wants
  to aim by hand: where a head points is a consequence of the booth's own
  measurements. So the bar is five numbers, and `lightBarFixtures(p)` derives
  the heads from them — which also makes the arithmetic a pure function Node
  can test without a renderer.
- **A hidden wall takes no fixtures, and its share is not handed on.** Nine
  heads on a two-walled booth would be nine heads nobody hung. Six is the
  honest answer, and the panel says which wall got what.
- **The heads fan outward rather than crossing.** Left-wall heads sit at the
  left of the bar and take the front sections of that wall; the right mirrors
  it; the back wall takes the middle. Beams that cross read as a mistake in a
  render even when the arithmetic is right.
- **Nine shadow maps at half size.** A hand-placed spotlight gets 1024; a wall
  washer gets 512. Nine shadow passes is the cost of the feature, and a wash
  is a soft edge with nothing in it to see.
- **The hall is five planes, and the ceiling is off by default.** A convention
  hall at booth scale is a floor, some far walls and — barely — a ceiling.
  Thirty feet up is almost always out of frame, and drawing it puts a grey
  wash over everything, so `showCeiling` is its own switch and starts off. The
  hall has no floor of its own: `environment-ground` is already a 180 m plane
  the ground-texture machinery owns, and a second floor just beneath it is a
  plane nobody ever sees.
- **Indoors, the neighbours are walls.** `neighborPlacements` is unchanged —
  the same spacing, the same layouts — but an art-show neighbour is three
  white panels rather than a canopy, because a hall full of pop-up tents is
  not what standing in a hall looks like.
- **The panel module does not own the walls.** The requested defaults are a
  144″ back wall and a 38″ panel, and 144 is not a multiple of 38. Forcing
  consistency would have meant refusing one of the two numbers that were
  asked for. So the walls keep their own authoritative width, the module is
  what they can be *rebuilt* from, and the panel section reads out how many
  panels each wall currently is. `Rebuild walls from this panel` is a button,
  and `linked` is a checkbox for anyone who wants the walls to follow every
  keystroke.
- **A rebuild snaps each wall to the whole number of panels it is nearest to
  now**, not to the count it had at the old width — so it leaves the booth
  about the size it already was rather than shrinking it every time the panel
  gets narrower. The footprint follows the walls, because a wall wider than
  the booth is not a plan.
- **A pedestal is not a wall.** It mirrors a free-standing wall's placement,
  selection and drag exactly — the same floor plane, the same 1″ snap, the
  same "a first click selects, only a selected one drags" rule — but it is not
  in `booth.panels`, has no face, hangs nothing, and is not in the Location
  dropdown. Two callbacks of its own rather than a `kind` argument every
  existing caller would have to start passing.
- **Double-click picks a pedestal up**, as asked, and a single click selects it
  the same way a wall is selected. Both routes end at the same selection, so
  neither is a special case to remember.
- **The top is a separate slab.** A solid top is the point of the thing, and a
  proud reveal on every side is what stops it reading as a plain extruded box.
- **Two tools, not one long tab.** The Art show tool holds the venue, the
  footprint, the walls, the panel module, the light bar and the hall. The
  Walls tool holds the free-standing walls — moved out of Layout, where they
  had been sitting under everything else — and the pedestals. Clicking either
  kind in the booth opens the Walls tool on it, rather than Layout.
- **One selection at a time.** Artwork, a free-standing wall and a pedestal are
  three selections with one inspector between them, so selecting any one lets
  go of the other two. Holding two would leave a slider pointing at something
  nobody is looking at.
- **Layout says so when the booth is an art show.** Its Footprint section still
  carries the outdoor preset and the canopy checkbox, and either would quietly
  turn an art-show booth back into a pop-up, so it now warns and points at the
  right tool rather than being disabled into a dead end.

## What is not covered

Nobody has looked at any of this on real hardware. The measurements are pinned
by tests that read the meshes' world matrices back, so *where* things stand is
not a guess, and the nine spotlights are checked against the arithmetic that
placed them. What needs eyes:

- **Whether a nine-head wall wash reads as an art-show booth.** The fixture
  brightness (60) and the 3500K default are judgement calls made without a
  render. The cone is no longer one: **Diffusion** now owns it, so this is a
  slider to drag rather than a constant to edit (see below).
- **Whether the hall reads as a hall** rather than as a grey room, and whether
  turning the ceiling on is ever worth it.
- **Whether a seamless 144″ white wall reads as a pro-panel wall.** With the
  fabric finish off it is a flat colour; `wallFinish: "fabric"` still works on
  an art-show booth and may be the better default once someone has looked.
- **Whether nine shadow-casting spots are affordable** on a real machine. If
  not, the honest fix is to drop `castShadow` on the wall washers rather than
  to cut their number.
- **Whether 0.7 is the right default diffusion.** It is the one number in the
  softening pass that was chosen rather than derived, and the slider exists
  precisely so it can be answered by eye.

## Diffusion — the softening pass

The first report from a pair of eyes was that the bar read harsh: hot pools
with hard rims, and a stack of crossing shadows behind every pedestal. That is
what nine bare point sources aimed at three walls will always do, and it is not
what an art fair looks like, where each head carries a frost or a barn-door
diffuser and the hall's white walls throw most of the light back.

So `lightBar.diffusion` (0..1, default 0.7) was added, and `lightBarOptics()`
in `src/lightbar.js` is the one place that says what it means. It moves five
things at once, because moving any one alone trades one artefact for another —
a wider cone on its own is just a bigger hot pool, and a lifted shadow on its
own is a flat wall with a hard-edged puddle on it:

| | diffusion 0 | diffusion 1 |
| - | - | - |
| cone angle | 22.5° | 40° |
| penumbra | 0.45 | 0.98 |
| `shadow.intensity` | 1 | 0.32 |
| `shadow.normalBias` | 0.004 | 0.014 |
| power scale | 1 | 0.68 |

Four notes on why each is there:

- **`LightShadow.intensity`** (three r165+) scales how dark a shadow goes
  without touching the light that cast it. That is the literal answer to "less
  harsh shadows", and it is better than dropping `castShadow`, which would make
  art and pedestals float.
- **The power scale** exists because a wider cone lights more of the booth from
  the same fixture. Without it, a bar left at 60 gets *brighter* as it is
  softened, and a softness slider that arrives brighter reads as broken.
- **The normal bias climbs with the cone** because a wide beam meets a wall at
  a shallow angle, where a 512px shadow map self-shadows into stripes.
- **`lightBarBounce()`** adds a hemisphere fill at the bar's own colour
  temperature, standing in for the white hall. It is scaled by the bar's actual
  output (`count × power`), so turning the fixtures down dims the bounce with
  them instead of leaving a flat grey haze behind, and it is zero at diffusion
  0, at `power: 0`, and with the bar off.

Diffusion 0 reproduces the original lighting exactly, which is what the
browser test asserts after dragging the slider to zero — the softening is a
setting, not a replacement. `diffusion` is a sixth optional key on an optional
object, so a backup written before it existed reads as 0.7 like everything
else, and `tests/artshow.test.js` pins that too.
