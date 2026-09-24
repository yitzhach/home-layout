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
- **State: phases 1 and 2 are built — the house, its furniture and its
  finishes.** A first visit opens a starter floor (living room, kitchen,
  bedroom, bathroom) seen from above like a doll's house, each room floored
  as its kind usually is. The details are the next two sections.
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
  in plain oak (`scene.buildRoomFloors`). In development only,
  `?fixture=booth` starts from the old demo booth, and every inherited
  browser suite loads with it so they keep testing the shared engine.
- **Stairs** are furniture (`kind: "stairs"`, straight flight, 7¾″ risers),
  with their own size limits through `furnitureLimits(kind)`.
- **Cut:** the hall planner, power sheet and show pack (modules and tests
  deleted); the Art show tab, tent, neighbours and booth-row controls are
  gone from the UI. Their engine code — `row.js`, `applyVenue`, the tent in
  `environment.js`, the light bar — is still in the tree, dormant for a home
  and still exercised by the booth fixture. Removing it is a cleanup for
  later, not a feature.
- **Suites cut with their features:** `view-hall`, `view-showpack`,
  `view-artshow`, `view-row`, `view-quickstart` (the booth quick start's
  button is gone; `quickstart.js` is dormant), and the tent/fabric sections of
  `view-textures` and the art-show sections of `view-responsive`.
- **Tests:** `tests/rooms.test.js` (geometry, sharing, openings, resize,
  validation) and `tests/view-rooms.mjs` (the starter floor, adding, resizing,
  a window, opening a wall, reload, delete and undo, stairs).
- **Known rough edges, not yet done:** walls are the booth's 2.2″ slab, not a
  real 4½″ stud wall (art hangs relative to that slab — thickening it means
  moving the exterior frame too); corners of a room leave a small notch
  outside; free-standing panels take no openings; clicking a room's floor
  does not select it; the camera does not refit when the house grows (Reset
  view does); many strings still say "booth" (library "Booth assets", Photo
  mode's "booth photo").

## Phase 2 — furniture and finishes

- **Finishes are `room.finish`**, optional, and every part of it optional:
  `{ walls, sides: { n|e|s|w }, floor, floorColor, ceiling }`. `src/finishes.js`
  is all of it and is pure; `validFinish` is its validator, called from
  `validateProject` next to `validRooms` (not from rooms.js, which finishes.js
  imports). A room with no finish draws exactly as phase 1 did. `setFinish`
  is the one writer: clearing a part deletes it, and a finish back at every
  default disappears, so undo and backups never carry empty records.
- **Walls are paint.** A room colour, and a colour of its own for any side
  (the feature wall; "Same as the room" clears it). A derived wall is one slab
  with two faces: `wallFaces(p, wall)` paints the front (+Z, into the owning
  room) from the owner and the back from `roomBehind` — the room whose
  opposite side lies on the same line over the wall's midpoint — or the
  house's `booth.color` when it is an outside face. `scene.buildRoomWall`
  gives each slab a six-material array (BoxGeometry's groups: ±x, ±y, +z, −z).
  `booth.color` is now "the house's wall colour": outside faces and every room
  without paint of its own.
- **Floors are a material** from `FLOOR_FINISHES` (oak, light oak, walnut,
  herringbone, 12″ tile, mosaic, checkerboard, marble, slate, concrete,
  carpet, vinyl), each with a real repeat size in inches and a roughness, and
  an optional `floorColor` tint. A new room of a kind in `TYPE_FLOORS` starts
  in that floor (kitchen tile, bath mosaic, bedroom carpet, laundry vinyl);
  choosing a material drops the tint. `src/finish-textures.js` draws each as a
  small canvas pattern, cached per material and colour, cloned per floor for
  its repeat. **Owner-supplied photographs** go at
  `public/assets/materials/<id>/color.jpg` (the finish ids above); one HEAD
  request per material per session decides, and with the folder empty the
  pattern is what is drawn.
- **Ceilings** are a plane per room at its height, facing down and
  single-sided, casting no shadow: culled from the doll's-house view above,
  there from eye height and in Walk. `ceiling` colour, default `#f7f6f2`.
- **Furniture:** twelve home kinds in `FURNITURE` — bed, sofa, armchair,
  dining table, coffee table, desk, kitchen base and wall cabinets, bookshelf,
  dresser, nightstand, rug — each with its own `limits`, all facing +Z with
  their backs at −Z. Shapes in `src/furniture.js`. The picker groups them
  (`FURNITURE_GROUPS` in main.js), home pieces first; the booth kinds are
  still listed under Display. A new piece lands in the middle of the room
  open in the Rooms tab. `MAX_PEDESTALS` went from 24 to 80.
- **Tier:** nothing here is gated. Paint, floor materials and the furniture
  set are Lite in the proposed split; uploaded textures (Pro) are not built.
- **Tests:** `tests/finishes.test.js` and `tests/view-finishes.mjs`;
  `view-furniture` now adds and measures all 24 kinds.
- **Rough edges:** no user-uploaded wall or floor textures yet; tile, counter
  and cabinet surfaces are colours rather than materials (the cabinet's
  counter top is a fixed stone grey); the rug sits on the room floor but
  furniture does not know which room it is in; patterns are unjudged by eye —
  no session can look at a render.

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
  until payment is decided. Proposed split, not yet confirmed: Lite = rooms,
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
2. ~~Furniture set and materials per wall, floor and ceiling.~~ Done; the
   owner should look at the floor patterns and furniture on the live site,
   and supply photographs under `public/assets/materials/<id>/color.jpg`.
3. Wall photo, manual four-corner straightening.
4. Fixtures and daylight.
5. The AI Worker: wall mapping and material help.
