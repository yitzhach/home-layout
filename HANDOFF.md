# Home Layout — handoff

Start a new chat with **this file only**. It is written to be enough on its own.

Artist OS Home Layout: measured 3D planning of a home's interior in the
browser. Forked on 2026-09-24 from `yitzhach/booth-studio` at commit a0d7311
(the art-show booth planner) with a fresh git history. Everything the booth
app learned — its rules, its tests, its hard-won bugs — is in
`docs/booth/BOOTH-HANDOFF.md` and still applies to the code that came across.

## Now

- Repo: https://github.com/yitzhach/home-layout. `main` is production through
  Cloudflare's Git integration (Worker `home-layout`); merging is deploying.
- **State: phase 2 is built — furniture and finishes.** A first visit opens
  a starter floor (living room, kitchen, bedroom, bathroom) seen from above
  like a doll's house; rooms take furniture from a home set and a finish for
  their floor, walls and ceiling. Phase 1 (the house) and phase 2 are the
  next two sections. Phase 2 was built on the branch
  `claude/happy-feynman-bn9m07` and reaches production when merged to `main`.
- `wrangler.jsonc` carries `build.command: "npm run build"`: Cloudflare's Git
  integration runs only `npx wrangler deploy`, and without it the first deploy
  failed for want of `dist/`.

## Phase 1 — what was built and how it fits

- **Rooms are `booth.rooms`**, optional like every list in schema 1:
  `{ id, name, type, x, z, width, depth, height, open: [sides], openings: [] }`,
  inches, X/Z the room's centre. `src/rooms.js` is all of it and is pure;
  `validRooms` is its validator. The internal record is still called `booth`
  everywhere — renaming it would touch every file and every test for nothing
  a user sees; read "booth" as "the floor".
- **Walls are derived, never stored.** `roomWalls(p)` works them out from the
  rooms: four sides each, a stretch two rooms share built once (owned by the
  room earlier in the list), and no wall at all where either room has that
  side in `open`. Each is a *virtual panel* — `{ x, z, width, height,
  rotation }` like a free-standing panel — with a key
  `room:<room id>:<side>:<piece>`, so `wallKeys`, `wallSpec`, `wallLabel`,
  `wallFrame` and art placement needed one branch each and nothing else.
  Sides are compass points: north is −Z (the old back), south +Z. Every
  wall's front face looks into its own room.
- **Walls are 4½″ thick and stand outside their room** (`WALL` in rooms.js:
  2×4 studs and ½″ drywall each side). A room's width and depth are its clear
  inside measurements; a wall's front face — and so its art frame — is on the
  room's edge and its body is behind it. Two rooms side by side stand one
  wall apart: `roomBeside` leaves the gap and `sameLine` counts opposite
  sides up to a wall's thickness apart as two faces of one wall. Rooms saved
  touching (before walls had a thickness) still share one wall; the
  neighbour just loses 4½″. `wallCorners` finds the square each corner leaves
  outside both walls and the scene stands a post there; a stub no longer than
  the wall is thick (a T-junction) is folded into one. `wallGaps` lays floor
  under the walls between rooms and through a side opened up.
- **Openings** (door, window, arch) belong to a room and a side, at `x` inches
  from the side's left end seen from inside. `wallOpenings(p, wall)` collects
  every room's openings that lie on a wall's line — so a door typed in either
  room cuts the one shared wall — and says which way a door swings relative
  to that wall's front. `wallPieces` turns a wall and its holes into solid
  rectangles; `scene.buildRoomWall` stands those, the casings, a glazed pane
  and sill per window, a door leaf open at its `angle` and, editor-only, the
  swing arc for Plan view. A work that overlaps an opening gets a warning
  (`boundWarning`).
- **The footprint follows the rooms.** `booth.width/depth` is set by
  `houseExtent` after every room edit (`settleRooms` in main.js), so
  everything that clamps to the footprint — furniture, panels — still works.
  The schema's footprint limit went from 360″ to 1200″, positions to ±600″.
- **Resizing** keeps the edge a room shares with a neighbour (`resizeRoom`);
  adding a room beside another (`roomBeside`) shares that whole wall and puts
  a door in it. Deleting a room, or opening a wall, takes down any art on the
  walls that went.
- **Homes vs the booth.** `blankProject()` is unchanged — the base schema 1
  and what the old unit tests measure. `homeProject()` / `demoHome()` build a
  house on it: perimeter walls off, starter rooms, no spotlights, room floors
  finished per room (`scene.buildRoomFloors`, see Phase 2). In development only,
  `?fixture=booth` starts from the old demo booth, and every inherited
  browser suite loads with it so they keep testing the shared engine.
- **Stairs** are furniture (`kind: "stairs"`, straight flight, 7¾″ risers),
  with their own size limits through `furnitureLimits(kind)`.
- **Cut:** the hall planner, power sheet and show pack in phase 1; in phase 2
  the rest of the booth engine went too — `row.js`, `lightbar.js`,
  `quickstart.js`, the art-show venue (`applyVenue`, the panel module), the
  exhibition hall, the canopy tent and the neighbouring booths. Backups that
  carry their fields (`venue`, `row`, `artShow`, `lightBar`, `hall`, `tent`)
  still validate against the limits they were written to and simply are not
  drawn. `blankProject()` still writes `tent: false`, because the schema-1
  validator requires it.
- **Suites cut with their features:** `view-hall`, `view-showpack`,
  `view-artshow`, `view-row`, `view-quickstart`, and in phase 2 the unit
  tests `row`, `artshow` and `quickstart` (templates moved to
  `tests/templates.test.js`).
- **Tests:** `tests/rooms.test.js` (geometry, sharing, openings, resize,
  wall thickness, corners, validation) and `tests/view-rooms.mjs` (the
  starter floor, adding, resizing, a window, opening a wall, reload, delete
  and undo, the camera following the house, tapping a floor, stairs).
- **Rough edges fixed in phase 2:** walls are real 4½″ walls; corners are
  closed; tapping a room's floor opens the Rooms tab on it
  (`scene.pickRoom`, `scene.onSelectRoom`); the camera steps back or in with
  the house (`scene.refit`, called from `settleRooms`); the user-visible
  "booth" strings are gone (Photo mode is a room photo, the library's booth
  assets are "Signs and labels", exports say home). The internal names —
  `p.booth`, `BoothScene`, the `artist-os-booth-studio` IndexedDB and the
  `booth.*` localStorage keys — stay: renaming them would lose people's saved
  work for nothing they see.
- **Still rough:** free-standing panels take no openings; a tap on a room
  wall (not its floor) does not select the room.

## Phase 2 — furniture and finishes

- **Furniture is the home set** (`FURNITURE` in model.js, drawn by
  `src/furniture.js`): sofa, armchair, coffee table, TV on a media console,
  bookcase, rug, dining table, chair, queen bed, nightstand, dresser, desk,
  kitchen counter, wall cabinets, refrigerator, range, bathroom vanity,
  toilet, bathtub, plus the screen on a stand, pedestal, box and stairs. Each
  names the `room` the picker groups it under. The booth's tables, stool,
  print bin, gridwall and banner are marked `booth: true`: still valid and
  drawn for an old backup, offered only on the booth fixture (no rooms).
  `MAX_PEDESTALS` went from 24 to 120.
- **Placement:** a new piece goes into the room open in the Rooms tab. A
  piece marked `wall: true` (bed, counter, bookcase, sofa…) goes against
  that room's north wall with its back (−Z) to it, a second one beside the
  first; anything else goes in the middle. Front is +Z for every piece.
  Your own .glb (Walls → 3D models) lands in the selected room too.
- **Clearance** now checks a home's walls (`wallFootprint`), only against
  pieces in a room the wall faces — a wall in the next room is behind another
  wall. A piece with a `layer` (a rug `under`, wall cabinets `over`) never
  counts as standing in anything.
- **Finishes** (`src/finishes.js`, pure): a room's optional
  `finishes: { floor, walls, ceiling, n, e, s, w }`, each `{ kind, color }`.
  `walls` is the whole room and a side overrides it. Missing reads as the
  defaults: oak floor (tile in a kitchen, bathroom or laundry), the house's
  wall colour (`booth.color`, which also paints the outside of the house),
  a white ceiling. Kinds: paint, wood planks, tile, stone, carpet, concrete,
  brick, wood panelling; `SURFACE_KINDS` says which a floor, wall or ceiling
  offers. `validRooms` validates them.
- **Each face of a wall is finished from its own room**: the owner's finish
  on the front, the neighbour's (`wallBackRoom`) or the house colour on the
  back. The slab's box faces carry separate materials, and a pattern's
  offset is laid from each face's own left end so the pieces a door cuts a
  wall into line up.
- **Patterns** are drawn procedurally (`src/finish-textures.js`: planks with
  joints, tile and grout, running-bond brick, veined stone, speckled carpet
  and concrete) at the tile size `FINISH_KINDS` gives. When the owner puts
  photographs in `public/assets/textures/finish-<kind>/` (`color.jpg`,
  optionally `normal.jpg`, `rough.jpg`, and a `meta.json` with `tileMetres`),
  `scene.upgradeFinishes` swaps them in. With a folder empty the set is
  asked for once per page load and the drawn pattern stays. These are the surfaces the owner said they would
  supply images for.
- **Ceilings** are a downward-facing plane per room at its height: seen from
  inside a room or in Walk, culled from above so the doll's-house view still
  looks in. They cast no shadow.
- **Rooms → Finishes** is the UI: floor, walls and ceiling each a kind and a
  colour (choosing a kind starts at its usual colour), and "One wall
  differently" per side.
- **Start a new home** is a dialog: the starter floor, an empty floor, or a
  saved template (`src/templates.js`, per browser, rooms, furniture and
  finishes without the art or images).
- **Tests:** `tests/finishes.test.js`, `tests/templates.test.js`, additions
  to `furniture.test.js` and `clearance.test.js`, and `tests/view-home.mjs`
  (the grouped picker, a bed against the north wall, a rug under a sofa,
  floor, wall and per-side finishes, a shared wall finished from each side,
  ceilings facing down, reload, a new empty home).

## What the owner decided (2026-09-24)

- **Scope:** one whole floor of connected rooms per project. More storeys
  later. Rooms are rectangles plus free walls (L-shapes and nooks come from
  free walls), because that reuses the booth's wall code.
- **Uses:** art on real walls, furniture layout, finishes and materials, and
  staging or renovation. It must be easy to use, with a paid Pro tier.
- **Openings:** doors (swing arcs in Plan), windows (sill height, daylight),
  archways, and stairs as an object — all adjustable.
- **Wall photo:** the user photographs a real wall, taps its four corners and
  types its width; the photo is straightened onto the 3D wall so art can be
  hung on it to scale. Manual first (works offline); AI assist later.
- **AI:** later, through a Cloudflare Worker that holds the owner's API key
  as a secret, rate-limited per browser (there are no accounts). It will find
  wall corners and name materials. Claude cannot generate images, so a
  tileable texture from a photo is made locally (crop and blend the edges),
  with AI only labelling and estimating colour and roughness.
- **Pro:** gated in code through `src/tier.js` as now, everything unlocked
  until payment is decided — confirmed again for phase 2: leave it all
  unlocked, no new gates. Proposed split, not yet confirmed: Lite = rooms,
  openings, basic furniture, paint and floor colours, one wall photo; Pro =
  more wall photos, uploaded textures, lighting and daylight, elevations,
  underlay, clearance, .glb, video, AI.
- **Cut from the booth:** tent and canopy, neighbours, hall planner, power
  sheet, show pack, booth row. **Kept:** video and timeline, as a Pro
  walkthrough.
- **Furniture:** a procedural set (bed, sofa, chair, table, desk, counters,
  cabinets, shelves, rug, TV) plus the user's own .glb.
- **Surfaces the owner will supply images for:** walls, floors, ceilings,
  tile, counters, cabinets. The app must still run with `public/assets` empty.
- **Lighting:** placeable fixtures plus sun through windows with a
  time-of-day slider.
- **Units:** stored in inches as before; a display toggle for metric.
- **Name:** "Artist OS Home Layout". Pushed straight to `main`, phase by phase.

## Next — the phases, each deployable

1. ~~Strip the cut features; rooms; doors, windows, archways, stairs.~~ Done.
2. ~~Furniture set and materials per wall, floor and ceiling.~~ Done, with
   4½″ walls, closed corners, tap-a-floor, camera refit, the booth strings and
   the dormant booth engine removed. Needs the owner's eye on a real screen:
   the procedural patterns, the furniture shapes, and whether ceilings should
   also show in the perspective view from inside a room.
3. Wall photo, manual four-corner straightening.
4. Fixtures and daylight.
5. The AI Worker: wall mapping and material help.
