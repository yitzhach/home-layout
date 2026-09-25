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
- **State: all five phases are built — the house, its furniture and
  finishes, wall photos, lights and daylight, and the AI Worker.** A first
  visit opens a starter floor (living room, kitchen, bedroom, bathroom) seen
  from above like a doll's house, each room floored as its kind usually is.
  The details are the sections below.
- **The AI is off on the live site until the owner sets the key**:
  `npx wrangler secret put ANTHROPIC_API_KEY` (or the Worker's Settings →
  Variables and Secrets in the Cloudflare dashboard). Until then every AI
  button says "AI is not set up on this site yet" and nothing else changes.
- `wrangler.jsonc` carries `build.command: "npm run build"`: Cloudflare's Git
  integration runs only `npx wrangler deploy`, and without it the first deploy
  failed for want of `dist/`. Since phase 5 it also names a Worker script,
  `worker/index.js`, which answers `/api/*` and hands everything else to the
  static assets (`run_worker_first`), and a rate-limiting binding `AI_LIMIT`.

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
  outside; free-standing panels take no openings. Three were fixed on
  2026-09-25: clicking a room's floor now selects it and opens Rooms on it
  (`scene.onSelectRoom`, asked only when the click found no work, wall or
  piece, and a wall in front of the floor still wins); the camera refits
  when the house grows (`settleRooms` sets `refitOwed`, `refreshScene`
  re-applies the current view; shrinking leaves the view alone); and the
  visible "booth" wording in the live UI now says home, room or project.
  The dormant booth panels (art show, booth row, venue, light bar, quick
  start) keep their booth wording, as do internal names (`p.booth`,
  `BoothScene`, `window.__booth`, storage keys) — the stored ones cannot be
  renamed without breaking older backups and saved settings, and the rest are
  not worth the churn.

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

## Phase 3 — wall photos

- **A wall photo is `room.wallPhotos[side]`**, optional: `{ asset, corners,
  x, y, width, height }`. `src/wallphoto.js` is all of it and is pure;
  `validWallPhotos` is called from `validateProject` with the project's
  assets, so a record whose image is missing is refused. `asset` is an
  ordinary image asset with the new role `"wall"` (so the Artwork library
  leaves it out), holding the photo **as taken**; `corners` are fractions of
  it (top-left, top-right, bottom-right, bottom-left, either winding, convex —
  `goodCorners`); `x`/`y`/`width`/`height` are the real inches of the
  stretch of wall the corners mark, from the side's left end (seen from
  inside) and the floor. A new photo covers the whole side, floor to ceiling.
- **Keyed by side, not wall piece.** The side is what someone photographs,
  whichever room owns the slab on that line. `photoPieces` builds the side as
  a virtual wall (`sideWall`), takes its openings from `wallOpenings` —
  typed in either room — and returns the photo's rectangle cut into the solid
  pieces left, each with its part of the photo as u/v ranges. A side that is
  opened up draws no photo but keeps the record (`allWallPhotos` filters).
- **Straightening happens when the wall is drawn**, not when it is stored, so
  the corners can be moved again with nothing lost: `straighten` maps every
  output pixel back through `homography` (model.js, the booth Photo mode's)
  and samples bilinearly, on a plain RGBA array; `straightSize` makes it the
  typed shape, 1024px on the long side at most and never more pixels than the
  photo had across the wall. The scene (`buildWallPhotos`, from
  `buildRoomFloors`) reads the source at ≤2048px, caches the texture by photo
  and corners (`straightCache`), and lays each piece 2 mm in front of the
  wall face in the side's own frame (`placePanelFrame`) — behind any art,
  which hangs in front of the frame at its own depth.
- **UI:** Rooms tab → a room → Wall photos: "Photograph the north wall" (per
  side) chooses a JPG/PNG and opens the corner editor
  (`src/wallphoto-editor.js`, in `#dialog`): the photo with four draggable
  handles (mouse or touch), the straightened preview beside it redrawn as
  they move, a warning and a disabled "Use this photo" while the corners
  cross, Reset, and — when AI is allowed — "Find the corners · AI", which
  calls the phase 5 `/api/ai/corners` route and moves the handles for the
  user to check. **Nothing is stored until "Use this photo".** Each photo
  then has its real width, height and position fields, Corners to edit
  again, and Remove, which drops its image unless another photo uses it
  (deleting the room does the same); undo restores both.
- **Tier:** nothing is gated. The proposed split gives Lite one wall photo;
  counting them is not built. The AI corner button follows the `ai` feature.
- **Tests:** `tests/wallphoto.test.js` (a known quadrilateral straightened
  back to a full rectangle; sizes; corner checks; cutting round a window with
  per-piece u/v; validation) and `tests/view-wallphoto.mjs` (choose, drag a
  handle, nothing stored before use, drawn less its openings — including the
  bedroom's door on the shared wall — typed size, reload, AI corners from a
  stand-in, remove and undo, hidden while the wall is open).
- **Rough edges:** the photo is straightened only for perspective — lens
  barrel distortion from a wide phone lens is not corrected, so long straight
  edges may bow a little; the photo is not relit (it carries the light it was
  taken in, and the scene's light falls on it again); a side longer than one
  photo needs one photo stretched across it — no stitching; judged by no one's
  eye yet.

## Phase 4 — light fixtures and daylight

- **Fixtures are `room.lights`**, optional: `[{ id, kind, x, z, lumens,
  kelvin, on }]`, at most 12 a room. `src/fixtures.js` is all of it and is
  pure; `validLights` is called from `validateProject`. `x`/`z` are inches
  from the room's centre, so a fixture moves with its room and is deleted
  with it; `lightSpot` clamps it inside the room (6″ from the walls) so a room
  made smaller keeps its lights. Height is not stored: a ceiling kind hangs
  its `drop` below the room's ceiling, a lamp stands at its kind's `y`.
  Kinds: ceiling (flush), pendant (30″ drop), recessed downlight, floor lamp
  (60″), table lamp (26″). Not `booth.fixtures` — that name was already the
  booth's spotlight-housing display mode.
- **In the scene** (`scene.buildRoomLights`, called from `buildRoomFloors`)
  each fixture is a group `room-light:<id>` with its shape and, when on, a
  `PointLight` in candela (`lumens / 4π`, doubled for a downlight), decay 2,
  its reach cut at ¾ of its room's diagonal. **No fixture casts a shadow** —
  six extra renders per light — so light does leak faintly through a wall
  into the next room; the cut-off reach is what keeps that small. A fixture
  switched off keeps its shape and loses its light and glow.
- **Daylight is `booth.daylight`**, optional: `{ on, hour, month, latitude,
  north }` (`validDaylight`; `daylightSpec` fills defaults: 3 pm, June, 40°,
  north 0). `sunPosition` is the textbook approximation — declination from
  the day of the year, hour angle from solar noon, solar time, no equation of
  time — good to a degree or two. `north` is the compass bearing the plan's
  top really faces. With daylight on, the scene's one directional light
  becomes the sun (`daylight-sun`), placed from `sunDirection`, weak and warm
  near the horizon, gone below it (`sunLook`), the hemisphere ambient drops,
  and **ceilings cast shadows**, so a room is lit through its windows and by
  its fixtures. Off, the house is lit evenly from above as in phase 2.
- **UI:** Rooms tab → a room → Lights (add each kind, place, output, colour,
  on/off, remove); and Daylight at the bottom of the tab for the whole house
  (on/off, time-of-day slider, month, latitude, north).
- **Tier:** `light-add` is the Pro feature `lighting`; daylight is a field
  and not gated. Everything is still unlocked (`DEFAULT_TIER = "pro"`).
- **Tests:** `tests/fixtures.test.js` (sun geometry against noon-due-south,
  east in the morning, midsummer higher than midwinter; plan rotation;
  placement and clamping; validation) and `tests/view-lights.mjs` (adding,
  moving and switching off fixtures; the sun at 9, 12, 18 and after dark;
  ceilings shading only in daylight; reload and undo).
- **Rough edges:** the brightness numbers are physically reasoned but unjudged
  by eye — no session can look at a render; there is no bloom, so a bulb is a
  bright material, not a glare; the sky and background do not change with the
  hour; fixtures cannot be dragged in the scene, only typed; wall sconces and
  track lights are not kinds yet.

## Phase 5 — the AI Worker

- **`worker/index.js`** is the Worker's script. `/api/*` runs it first; every
  other path goes to `env.ASSETS` exactly as before. Routes:
  `GET /api/ai/status` → `{ enabled }` (whether the key is set);
  `POST /api/ai/material` `{ image, mediaType, kind: floor|wall }` →
  `{ label, finish, color, roughness }`, `finish` one of `FLOOR_FINISHES` or
  null; `POST /api/ai/corners` `{ image, mediaType }` → `{ found, corners }`,
  four `[x, y]` fractions TL, TR, BR, BL, called by the wall photo corner
  editor's "Find the corners · AI" button.
- **The call:** the official `@anthropic-ai/sdk` (a dependency; wrangler
  bundles it), model `claude-opus-5`, structured output
  (`output_config.format` JSON schema), effort low, and server-side refusal
  fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
  Answers are cleaned (`cleanMaterial`, `cleanCorners`) before they reach the
  app — an unknown finish becomes null, a bad colour null, corners clamped.
- **Guards, in order, all before anything is spent:** 404 for other paths,
  405 for other methods, 403 when an `Origin` header is not this site, 503
  without the key, 413/400 for a body too big or not a base64 JPEG/PNG/WebP
  under 1.5 MB, then the rate limit — `AI_LIMIT`, 6 a minute, counted
  separately for the address (`cf-connecting-ip`) and the browser's random
  id (`x-browser-id`, kept in localStorage as `home.browserId`); either
  exhausted is 429. The limit's `namespace_id` in wrangler.jsonc is an
  arbitrary number, unique within the account.
- **The browser side is `src/ai.js`:** asks status once per page, shrinks the
  photo to 1024px JPEG, posts, and returns `{ value }` or `{ error }` — never
  throws. The dev server has no `/api`, so under `npm run dev` AI reads as not
  set up; `wrangler dev` with a `.dev.vars` holding the key runs it for real.
- **UI:** Rooms tab → a room → Finishes: "Match paint to a photo · AI" sets
  the room's wall paint; "Match floor to a photo · AI" sets the floor
  material and tint. Both are the Pro feature `ai`.
- **Tests:** `tests/worker.test.js` (the Worker with stand-ins for Anthropic
  and the limiter: status, static fall-through, the request sent, every
  guard, both routes, refusal, garbled and failed calls) and
  `tests/ai.test.js`; `view-lights.mjs` drives both buttons against a mocked
  `/api`. **No session has made a real call**: the key is the owner's.
- **Not built:** a tileable texture from a photo (crop and blend, made in the
  browser — Claude cannot make images); roughness from the model is returned
  but not applied (floors take their finish's roughness); a daily cap per
  browser (the binding only counts 10 s or 60 s windows).

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
3. ~~Wall photo, manual four-corner straightening.~~ Done, with the AI
   corner finder wired in; the owner should try it on the live site with a
   real phone photo of a real wall.
4. ~~Fixtures and daylight.~~ Done; the owner should judge on the live site
   how bright fixtures and the sun look, and whether rooms are too dark from
   the doll's-house view with daylight on.
5. ~~The AI Worker: wall mapping and material help.~~ Done except the key:
   the owner runs `npx wrangler secret put ANTHROPIC_API_KEY`, then tries
   "Match floor to a photo" and a wall photo's "Find the corners" on the
   live site.

Phase 1's cheap rough edges (room select by floor click, camera refit,
"booth" wording) were done on 2026-09-25; `tests/view-rooms.mjs` covers the
first two.

After the five phases, what is open is the owner's to choose: payment for
Pro and the final Lite/Pro split (then counting wall photos for Lite), more
storeys, and the rough edges listed under each phase above.
