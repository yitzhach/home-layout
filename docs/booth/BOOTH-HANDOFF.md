# Booth Studio — handoff

Start a new chat with **this file only**. It is written to be enough on its own.

Artist OS Booth Studio: measured 3D art-show booth planning in the browser.
Extend it; do not rebuild it.

## Now

- `CLAUDE.md` is loaded automatically at the start of every session. It holds
  the owner's standing instruction — **reports in chat are extremely concise,
  grammar sacrificed for concision, abbreviations and symbols welcome** — and
  the rules that bite. It does not need to be asked for again. That rule is
  about chat only: code comments, commit messages and this file stay in full
  prose, because a cold session has nothing else to read.
- Repo: https://github.com/yitzhach/booth-studio
- Production: https://booth-studio.bobdylan2000.workers.dev
- `main` is deployed. Every other branch is preview-only.
- **Last deploy: 2026-09-24 — roadmap batch E, the last of the roadmap**
  (the hall planner and the power and rentals sheet — the first bullet
  below), after batches C and D, A and B, the roadmap's base and the cut-out
  people, all the same day. **The roadmap proposed on 2026-09-24 is built.**
  Before that, **2026-09-23, three times.** First the ten speed-and-planning
  improvements, then — the same day, after the owner's first look on the real
  machine — the second round: the drag shadow, the fast-edit redraw leak, the
  cheaper click, Photoshop drop shadows, hide instead of delete, and the
  Preview menu under the viewport (both bullets below). Then the third round:
  the owner's answers to that round, and tool search (the bullet below). **Nothing is sitting
  unmerged.** Before that, 2026-09-19 — the art-show booth and its neutral defaults,
  the pedestals, the Walls tool, the light-bar diffusion slider, the backdrop
  pole limit, people for scale, indoor fixture hiding, the Ken Burns move, the
  Video tab with its batch list and the overhead lens flare are all on `main`
  and live.
- **Merged and deployed 2026-09-19, later the same day:** the ground library,
  selection without a rebuild, the drag smoothing, the artwork position
  sliders, the hall switching off in a photographed environment, and the
  light bar's controls repeated in Lighting. Nothing is sitting unmerged on a
  branch. **Check `window.BOOTH_BUILD` against the commit before believing a
  fix did not ship** — a Cloudflare build takes a few minutes, and a merge has
  twice been reported as not working while the build was still running.
- **2026-09-24, roadmap batch E: the hall planner, and the power and
  rentals sheet. Pushed to `main`.** Both Pro (`hall`, `power`).
  1. **The hall planner** — for a promoter or an event company selling a
     whole show. A new inspector tab, **Hall** (the eighth; they scroll on a
     phone). **Start a hall plan** makes two back-to-back rows of eight
     10 × 10s on 10′ aisles, numbered from 101; the Layout section types rows,
     booths per row, booth width and depth, aisle width, back-to-back pairs,
     the first number and a default price, up to 1,200 booths (whichever of
     rows and booths-per-row was just typed wins). The map is an SVG in the
     panel: tap a booth — or focus it and press Enter — to set its status
     (open / held / sold, coloured), exhibitor, price and note, or mark it as
     **your** booth (outlined pink). Totals count sold, held and open and add
     up sold and held money. **Download hall map** is a printable page with
     the map, a legend, the totals and every booth; **Exhibitor list (CSV)**
     opens in any spreadsheet. The plan is the whole show, not this booth, so
     it is saved beside it as the optional **`p.hall`** — `{ rows, perRow,
     boothWidth, boothDepth, aisle, backToBack, start, price, mine?, booths:
     { "<number>": { status?, name?, price?, note? } } }` — validated by
     `validHall`. Deleting it asks first and is one undo step. `src/hall.js`,
     pure. Not done: booths of mixed sizes, corner/island blocks, and linking
     a hall booth to its own 3D booth — the obvious next steps if promoters
     use it.
  2. **Power and rentals** — Export → Power and rentals says what to order
     from the show's service desk (**watts, amps at 120 V, circuits of 15 A
     at the 80% continuous rule**) and downloads a printable sheet: every
     load (visible spotlights at 15 W, light-bar heads at 12 W, screens at
     120 W, and the typed number of general outlets at 150 W), then every
     floor piece to rent by kind with carpet for the booth's area, price
     columns left blank. The wattages are typical LED figures, printed beside
     each line and said to be assumptions. `src/power.js`, pure; `WATTS` is
     where they live.
  `tests/hall-power.test.js`; `tests/view-hall.mjs` sells a booth, grows the
  hall against its ceiling, downloads the map and the CSV, reloads, reads
  the power total and the sheet, checks both are Pro and undoes a delete.
- **2026-09-24, roadmap batch D: draw-a-box, and 3D models in and out.
  Pushed to `main`.** All Pro (`box`, `glb`).
  1. **Draw a box.** Toolbar → **Box**: press on the floor, drag out a
     footprint (a pink outline with its size follows the pointer, whole
     inches with Snap on), let go. It becomes a floor piece of the new
     furniture kind **`box`** — a plain block at exactly its measurements,
     12″ high to start, selected, with a **Pull up** slider beside its Height
     in the Walls tool. A riser, a plinth, a stage, a custom counter. Esc puts
     the tool away; a click without a drag draws nothing. A box is a pedestal
     record like any other furniture (`booth.pedestals`, `kind: "box"`), so it
     drags, turns, hides, nudges, lands in the show pack and is checked for
     clearance with no new code; its limits are wider than furniture's
     (`BOX_LIMITS`: up to 360″ across, 144″ high) so it can be a stage.
     `setDrawingBox` / `boxFrom` / `showBoxPreview` in scene.js.
  2. **Export the booth as `.glb`.** Export → 3D model: the booth, the work
     with its images, the furniture, the figures and any imported models, in
     metres, through three's GLTFExporter (loaded on first use). Left out:
     surroundings, the ground, lights, the drawn drop shadows, the underlay,
     anything editor-only and anything a hidden tag has taken out
     (`exportGLB` hides them for the write and puts them back). Opens in
     Blender and AR viewers; SketchUp needs its glTF importer. A cut-out
     figure is a flat picture there, facing the way its rotation says.
  3. **Import a `.glb` model.** Walls → 3D models → **Import .glb model**: a
     sculpture, a custom display, a scan. It is checked for the `glTF` magic
     bytes, kept in the booth as an asset of the new role **`model`**
     (`data:model/gltf-binary;base64,…`, up to 28 MB) and placed through the
     new optional **`booth.models`** list — `{ id, asset, name, height, x, z,
     rotation, hidden? }`, up to 8 (`MAX_MODELS`). It is scaled uniformly so
     its tallest point is the typed height (36″ to start), centred on its X/Z
     and stood on the floor, so the file's own units never matter. Sliders
     and typed numbers place it; it has an eye and a remove, and removing the
     last placement of a file removes the file. It is not draggable in the
     viewport yet. `buildModels` / `parseModel` in scene.js; GLTFLoader loads
     on first use.
  `tests/box-model.test.js`; `tests/view-box.mjs` draws a box with the mouse,
  pulls it up and reads the geometry back, exports the booth, checks the
  bytes are glTF with meshes and no lights, then imports that same file as a
  model and checks it stands on the floor at 36″ and survives a reload.
- **2026-09-24, roadmap batch C: floor plan underlay, clearance checks,
  elevations to scale. Pushed to `main`.** All Pro (`underlay`, `clearance`,
  `elevations`).
  1. **Floor plan underlay.** Layout → Floor plan underlay → **Add floor
     plan image** (JPG or PNG — a screenshot of a PDF plan is fine; PDFs
     themselves would need pdf.js and were not taken on). It lies on the
     floor under everything, half see-through, editor-only so it never
     reaches an export, and the view switches to Plan. **Scaling it**: pick
     up the tape (T), measure something on the plan whose real length is
     known, type that length and press **Scale plan** — the plan is scaled
     about the tape's start, so the measured point stays put. Then opacity,
     X/Z, rotation and on/off place it. Stored as the optional
     **`booth.underlay`** `{ asset, width, x, z, rotation, opacity, on }`,
     its image an asset of the new role **`underlay`** that never shows in
     the artwork library; removing the plan removes the image.
     `buildUnderlay` in scene.js. **Found and fixed on the way:** the
     backup validator only knew four asset roles, so a booth with a plan
     would have failed to reopen — `underlay` and `model` are now allowed,
     and `tests/clearance.test.js` pins a round trip.
  2. **Clearance checks.** Layout → Clearance checks lists, worst first:
     floor pieces standing in each other or in a wall, a piece poking out of
     the footprint, works hung over each other, and every gap narrower than
     **36″ (the accessible route width)** between two pieces or a piece and a
     wall. Gaps under 4″ are taken as a piece pushed against something on
     purpose. **Show** selects the piece and switches to Plan view, where
     each tight gap is a red line with its width. `src/clearance.js` is the
     geometry, pure — rectangles turned the way three turns a group,
     separating-axis overlap, exact polygon gaps — and `scene.clearance`
     carries the tight gaps to `refreshGuides`. Lite draws none.
  3. **Elevations to scale.** Export → Elevations to scale downloads one
     printable page: a floor plan and every wall face with work on it (every
     enabled inside face regardless), each at the largest standard
     architectural scale that fits a landscape Letter sheet — 1″, ¾″, ½″ or
     ¼″ to the foot (`fitScale`) — with the chain of gaps along the floor,
     overall width and height, each work numbered with its centre line, a 1′
     scale bar, and the plan's tight gaps in dashed red. SVGs are sized in
     physical inches, so a print at 100% measures true. `src/elevations.js`,
     pure. The hanging guide is unchanged: it is the table of numbers, this
     is the drawing.
  `tests/clearance.test.js`; `tests/view-plan.mjs` uploads a plan, scales it
  from a taped metre, reloads, lists and draws a tight gap, downloads the
  elevations and checks all three are locked in Lite.
- **2026-09-24, roadmap batch B: saved views, tags, walk mode. Pushed to
  `main`.** All three are Lite. `src/views.js` holds the rules, pure.
  1. **Saved views** — SketchUp's Scenes. Layout → Saved views: **Save this
     view** keeps the camera as a named pose (up to 12, `MAX_VIEWS`); each row
     renames in place, goes back to it, replaces it with the current camera
     or deletes it. A **View** menu appears under the booth, beside Zoom, as
     soon as there is one. **Export all as PNG** renders every view at the
     Export tab's size and frame, one file each, named after the view, and
     puts the camera back. Views belong to the booth, so they are saved in it
     as the optional `p.views`, validated by `validViews` from
     `validateProject`; every older backup simply has none.
  2. **Tags** — visibility groups: Artwork, Pedestals and furniture,
     Free-standing walls, People, Light fixtures, Surroundings. Layout → Tags
     unticks a group out of the viewport, every export and the pick. The
     scene marks each built object's `userData.tag` and `applyTags()` moves a
     hidden one's meshes to **layer 1**, which the camera, the shadow cameras
     and the raycaster all ignore — so a hidden work casts nothing and cannot
     be clicked. Lights are never moved: Light fixtures hides housings and the
     bar, not the light. **Not saved** — a booth reopening with its art
     switched off by a forgotten tick is the wrong failure — and kept through
     rebuilds (`update()` ends in `applyTags()`).
  3. **Walk mode** — toolbar **Walk** (or W). The camera stands in the aisle
     at a 5′6″ visitor's eye height (62″, `EYE_HEIGHT`) looking in; W/S or
     ↑/↓ step forward and back, A/D or ←/→ sideways, 6″ a press and 2′ with
     Shift, always along the floor whatever the head is doing; drag to look
     round. On touch a four-arrow pad appears in the viewport with **Done**.
     Esc, Done, any fixed view or a saved view ends it and hands the orbit
     controls back exactly as they were. The trick is the orbit controls
     orbiting a target a centimetre ahead (`startWalk` / `walk` / `stopWalk`
     in scene.js), so there is no second camera controller to keep in step.
  `tests/views.test.js`, `tests/view-views.mjs` (which also checks the one
  PNG per view and that a hidden work cannot be picked). **Not seen on real
  hardware**: whether 6″ steps feel right, whether drag-to-look wants to be
  inverted (it is set to feel like turning your head, `rotateSpeed` −0.35).
- **2026-09-24, roadmap batch A: smart guides, and several works at once.
  Pushed to `main`.**
  1. **Smart guides** — SketchUp's inference, for a work dragged along its
     wall. With Snap on, an edge or centre that comes within 2″
     (`SNAP_RANGE`) of another work's edge or centre on the same face of the
     same wall, the wall's centre or edges, or — for a centre only — the 60″
     hang line jumps to it, and a pink line is drawn through what it
     matched. Between two neighbours it also finds the spot that leaves
     **equal gaps** either side and labels both gaps in inches. Alt holds the
     guides off for that drag and leaves the plain 1″ grid. `src/guides.js`
     is the arithmetic, pure; `scene.showSnap()` draws it in the wall's own
     frame (editor-only lines, DOM labels in `snapNotes`, so neither reaches
     an export) and clears it on pointer-up. Lite, like the rest of Snap.
  2. **A multiple selection.** Shift-click adds a work to the selection or
     takes it out; on a phone, Artwork → Placement → **Select several** makes
     every tap do that until **Done selecting**. `picked` in main.js is the
     set, including the primary `selected` work, which keeps the handles and
     the inspector; the others are outlined in violet (`scene.also`). View
     state only: never saved, never in the history. Arrow keys move the lot
     together, Delete removes the lot, the status bar counts them.
  3. **Align and distribute (Pro).** The Artwork panel shows **N works
     selected** with Align left edges / centres / right edges / tops /
     middles / bottoms and Distribute across / up — the Illustrator and
     SketchUp rule: aligned to the box the works make together, and
     distributing keeps the two outermost where they are. Only the works on
     the same face of the same wall as the primary one move; the rest are
     named in the toast. `src/align.js`, pure. In Lite the buttons are the
     Pro lock; the selection itself is everyone's.
  Not done, and the obvious next refinements: a box-drag (marquee)
  selection, which fights orbiting for the same gesture; guides for floor
  pieces dragged across the floor; and a saved group ("my triptych") that
  moves as one. `tests/guides.test.js`, `tests/view-guides.mjs`.
- **2026-09-24: the roadmap, agreed, and its base — Lite / Pro and the phone
  layout. Pushed straight to `main` at the owner's word.** The owner's
  instruction: "go ahead with the base first (pro version up and going —
  will make it a separate plan later). If this tests green, move to A–E.
  Test each tool. If green continue. Update handoff after each new tool."
  The roadmap is item 2 of Next, and **its tools land in batches A–E, one
  commit and one push to `main` each, with this file updated every time**, so
  a session that stops mid-roadmap leaves `main` green and this file true.
  1. **`src/tier.js` is the whole of Lite and Pro.** `PRO_FEATURES` is the one
     table of what is Pro (booth row, show pack, hanging guide, video export,
     templates, and the roadmap's align/distribute, floor plan underlay,
     clearance checks, elevations, draw-a-box, 3D model import/export, hall
     planner and power sheet); anything not in it is everyone's. `can(tier,
     feature)` is the only question asked. `PRO_ACTIONS` maps `data-action`
     names to features, and the click handler in main.js refuses a Pro action
     in Lite at that one gate with a toast, whatever drew the button.
  2. **Pro is the default**, at the owner's word. The tier is a view setting
     in `localStorage["booth.tier"]`, switched at Layout → Project → Plan —
     never in a backup, never in schema 1. **How Pro is unlocked is not
     decided**: there is no backend to check a purchase against, so it will
     be an honour-system switch or a signed key checked in the browser, and
     that is the owner's "separate plan". A Lite browser opening a Pro booth
     draws all of it; it only cannot add to or export the Pro parts.
  3. **In Lite a Pro section is replaced by its lock** (`proLock` / `gated`
     in main.js): the name, a gold Pro badge and **Switch to Pro**. The
     section's controls are not drawn at all, so nothing is half-usable.
     Every roadmap tool is gated through `gated()` and `PRO_ACTIONS` from the
     day it lands.
  4. **The phone layout.** At 390 px the toolbar and the seven inspector tabs
     overflowed — Photo, Export and the Export tab were cut off. Both now
     scroll sideways (scrollbars hidden), tabs stack icon over label, and the
     inspector's inputs, selects and buttons are at least 40 px tall. A
     **sheet handle** above the panel folds it down to its tab bar so the
     booth gets the screen; choosing any tab unfolds it (`setSheet`). Not
     remembered — it is a gesture of the moment. The tool-search input is
     16 px on a phone, which stops iOS zooming the page when it is focused.
  5. The icons `video`, `user-round` and `sliders-horizontal` were used and
     never imported, so the Video tab, Add woman / Add man and Edit timeline
     showed no icon. They are imported now, with the ones the roadmap tools
     will need.
  `tests/tier.test.js` holds the table; `tests/view-tier.mjs` switches to
  Lite and back, smuggles a Pro button into the page to prove the gate, and
  checks the phone layout: no sideways scroll, every tab reachable, the fold
  giving the viewport its height.
- **2026-09-24: people are the owner's cut-out pictures. Pushed straight to
  `main` at the owner's word.** Two PNGs with transparent backgrounds, supplied
  in chat — a black silhouette of a man, and a posterised woman in colour
  ("the female one is for woman") — are `public/assets/people/man.png` and
  `woman.png`, and Layout → People → Add woman / Add man now draws them.
  - **A figure is one plane that turns to face the camera**, the way
    SketchUp's face-me people and architects' entourage work, so it never
    shows its edge. The turn is written into `matrixWorld` in the mesh's
    `onBeforeRender` (`makeCutout` in `src/people.js`), so it follows every
    camera that draws it — the viewport, exports, video, and each light's
    shadow camera, which is why the shadow is always the whole silhouette.
    Nothing else sees the turn: the figure's position, `rotation` and every
    test reading them are untouched.
  - **The typed height is still the height.** The picture's own box (the
    figure inside its transparent margin, measured off the alpha channel) is
    in `PEOPLE[kind].cutout` and mapped onto the plane's UVs, so the top of
    the hair is the typed height and the soles are on the floor.
    `tests/view-people.mjs` reads both heights back in metres and checks each
    plane faces the camera.
  - **A figure's facing now only mirrors the picture.** Both pictures look to
    the viewer's left; when a figure's rotation points to the viewer's right
    the picture flips, so two figures turned to face each other do. The
    rotation field is otherwise inert for a cut-out — a picture cannot show
    its back.
  - **Alpha test, not blending**, so the figures need no sorting against the
    artwork and cast a correct shadow. Lit like everything else
    (MeshStandardMaterial, roughness 1), so a dim booth dims them too.
  - **The mannequin is the fallback.** The app must run with `public/assets`
    empty: a missing picture leaves the grey mannequin, silently. The scene
    loads each kind's picture once (`cutoutFor` / `loadCutout`), shares it
    across figures and rebuilds, and swaps mannequins for pictures when it
    lands; the test reloads with the pictures refused and checks for the
    mannequin. Schema untouched — the pictures are assets, not data.
  - **Where the pictures came from is the owner's to know.** They arrived in
    chat with no source; `public/third-party-licenses.txt` says nothing about
    them.
- **2026-09-23, third round: the owner's answers, and tool search. Pushed
  straight to `main` at the owner's word.** The answers to Next item 1, as a
  quick question sheet: a drag with fast edit off is a "slight stutter, but
  decent"; the drop-shadow mapping and the second shadow's defaults are both
  right; the angle dial feels like Photoshop's; hidden and switched-off walls'
  art should leave the inventory; the Preview readout should say sharp /
  softer; Auto settles sensibly; nothing waits for the mouse; the light bar's
  shadows are not missed in the preview. What changed:
  1. **A drag refreshes the shadow maps every other drawn frame.**
     `touchShadows` alternates while `this.drag` is set; a skipped refresh is
     owed (`shadowsOwed`) and paid by the next frame without a move and by
     pointer-up, so the shadow is at most one frame behind and a drag always
     ends on true shadows. This is the lever the previous round named, not a
     return to holding the maps until release.
  2. **The inventory leaves out work on a switched-off perimeter wall, a
     hidden free-standing wall, or a panel that no longer exists**
     (`onShownWall` in `src/showpack.js`), which is what the booth shows.
  3. **The readout beside the Preview menu says sharpest / sharp / softer /
     softest** instead of "drawing at 2×"; the factor moved to its tooltip.
     The menu's own options still name their rungs ("Balanced, 2×").
  4. **Tool search, in the header** — asked for as "a search box: you can
     search a tool name and it opens the tool or gives a list of options".
     Type a name; the list shows each match with the tab and section it lives
     in; Enter or a click opens that tab, scrolls to the control, focuses it
     and flashes it. A toolbar or view button found is pressed, because it is
     a tool in itself; a button in the inspector is only focused, because
     "Remove" found is not "Remove" meant. `/` or Ctrl/⌘-K jumps to the box.
     The index is read from `inspectorHTML()` for every tab at the moment the
     box is focused — `renderInspector()` was split so the markup can be built
     without drawing it — so a control added to a panel is findable without
     touching a list, and one the current booth does not show is not offered.
     `src/toolsearch.js` is the ranking, pure; `tests/view-toolsearch.mjs`
     drives it.
- **2026-09-23, second round: the first report from the real machine, and
  what it asked for. Merged and deployed 2026-09-23** from
  `claude/gifted-ramanujan-jgr1cy`, at the owner's word. The report, in order:
  "Speed — much better. If there is still room to improve, keep improving";
  "what preview quality are we looking at, and where is it visible?"; a hide
  button for furniture and anything added; the drop shadow lingering in the
  old place during a drag; the drop shadow to work like Photoshop's (a
  screenshot of its dialog: Opacity 31%, Angle 125° with Use Global Light,
  Distance 10 px, Spread 4%, Size 16 px); and a second, stronger shadow under
  and to the side, both with an eye. One commit each:
  1. **A dragged work's cast shadow follows it.** `touchShadows` held the
     shadow maps still for the whole of a drag and refreshed them on release
     — from when every pointer event re-rendered nine casting heads. With
     fast edit off that left the work's real cast shadow on the wall where it
     had been. A drag is applied once per drawn frame now, and the bar casts
     only at High detail, so a drag simply refreshes the maps every frame.
     `settleShadows` and `shadowsStale` are gone.
  2. **Fast edit no longer draws flat out.** Found on the way: three clears
     `shadowMap.needsUpdate` only when it actually redraws a map, so with the
     maps off (fast edit) or no light casting, one moved piece left the flag
     up and `tick()` read it as a frame owed on every turn — continuous
     drawing, in the mode meant for a slow machine, until fast edit ended.
     This was on `main`. `tick()` now drops the flag after each frame.
  3. **A click no longer draws the booth inside its handler.**
     `applySelection()` ended in `renderFrame()`, from before on-demand
     drawing: three renders per click, the first blocking the inspector.
     Frames per selection 3.3 → 2.4, per edit 3.5 → 3.1, an edit's
     synchronous handler 78 → 10 ms (swiftshader; ratios, not milliseconds).
  4. **Photoshop's drop shadow, twice.** Lighting → **Drop shadow · behind
     the work** and **Second shadow · under & to the side**, each Opacity,
     Angle (a dial you drag, the degrees typed, and **Use global light**),
     Distance, Spread and Size, slider plus typed number, with an eye in the
     heading. Distance and Size are **inches on the wall**; the defaults are
     the screenshot's numbers at 20 px to the inch (31%, 125°, 0.5″, 4%,
     0.8″). The second defaults to 55%, 1.5″, 10%, 2.5″ and is **off** until
     its eye is on, so no existing booth changes unasked. The shape is exact
     — a Gaussian-blurred rectangle is the product of two error functions —
     and drawn in a MeshBasicMaterial hook (`SHADOW_GLSL`, `shadowMaterial`),
     so there are no canvases, it is crisp at 4096 px, and every shadow
     shares one program. Sliders move the shadows live with no rebuild and
     one undo step per gesture (`setShadowLive`, `scene.updateShadows`).
     **The shadow no longer scales with each work's wall gap** — Photoshop's
     are absolute, and that is what was asked for; the Artwork panel says so.
  5. **Hide instead of delete.** An eye beside every pedestal or piece of
     furniture, free-standing wall and figure. `hidden: true` on the record,
     read through `isShown()` in model.js: not built, not in exports, not
     pickable, not on the show pack's plan or packing list or the hanging
     guide's pedestal table. A hidden panel reads as a switched-off wall
     (`wallSpec().enabled`), so its art goes with it.
  6. **Preview quality is visible where the picture is.** The status bar
     under the viewport has the same menu Export always had, Auto's option
     names its rung ("Auto · now Balanced, 2×"), and beside it is the factor
     actually drawn at — not always the setting: fast edit draws 1× with no
     shadows, and on a Retina display Efficient still draws at the display's
     own 2×. **The answer to the question as asked:** when not editing and
     not in fast edit, the preview is whatever that menu says — Auto by
     default, starting at Balanced (2× supersampling) and stepping down
     3 → 2 → 1.5 → 1 only if frames are measured slow, remembered per display.
- **Merged and deployed 2026-09-23: speed on a slow machine, then the
  planning tools.** Asked for as "top 10 improvements — it lags, especially on
  a slower PC; make it usable for trade shows, art shows and artists, with
  some SketchUp functionality but easier". Ten items, each tested before the
  next, one commit each on `claude/magical-hopper-xmabcm`, merged together:
  1. **The viewport draws on demand.** `startLoop` used to render every
     animation frame forever; an idle booth kept a 2014 GPU pinned and the
     inspector sluggish. `tick()` now draws only when `invalidate()` has been
     called, the controls are still moving, a shadow map is stale, or — as a
     net — once a second for 15 s after the last change. `watchForChanges()`
     is the whole list of what invalidates: any input event on the page, the
     scene methods that change the picture (wrapped once, by name), every
     asynchronous load (`texture`, `surfaces.load`, `lighting.apply`) on
     settling, and the controls' change event. **If something changes the
     picture and does not show until you move the mouse, it is missing from
     that list.** A 50 ms timer (`KICK_MS`) draws an asked-for frame if the
     browser has not handed out an animation frame by then; see Things
     learned.
  2. **Preview quality → Auto**, the new default, remembered per browser in
     `booth.view` (`quality`, `autoScale`). It starts at Balanced's
     supersampling and steps down a rung (3 → 2 → 1.5 → 1) each time 30
     back-to-back frames have a median over 28 ms, says so once in a toast,
     and remembers the rung for that display (keyed on devicePixelRatio). It
     never steps back up by itself; picking Auto again restarts it.
     `src/adaptive.js` is the rule, pure. Preview quality was not remembered
     at all before this.
  3. **A rebuild keeps its shaders.** `disposeGroup()` used to dispose the
     old booth before the new one drew, and three deletes a program when its
     last material goes — so every edit recompiled every shader. Profiled:
     385 ms → 70–85 ms per edit for the default booth, 365 ms → 9 ms for the
     art-show booth. The old group now waits in `this.retired` until the new
     one has drawn and every load it started has settled (`this.loading`),
     at most three groups, at most 10 s. `tools/perf-probe.mjs` prints the
     numbers; view-responsive pins that a rebuild compiles nothing.
  4. **A click is cheaper.** Icons are finished SVG strings (`icon()` in
     main.js), not lucide placeholders rebuilt after every redraw; `render()`
     no longer forces a page layout by resizing the canvas mid-edit (it waits
     a frame), and `resize()` skips `setSize` when nothing changed, because
     writing a canvas size reallocates its buffer even when it is the same.
  5. **The light bar's nine heads cast shadows live only at High detail.**
     Exports and recordings turn them on (`setBarShadows`), the way they
     already undo fast edit — so a delivered file is exactly what it was.
     The fill light still grounds every pedestal in the preview.
  6. **Measuring.** Plan view draws the booth's width and depth and, for a
     selected pedestal or free-standing wall, its clear floor to the left,
     right and back walls. Toolbar → **Measure** (or T) is a tape: click,
     click, read feet-and-inches on the tape and in the status bar; Esc puts
     it away. `src/measure.js` is the arithmetic; lines are editor-only
     LineSegments and labels are DOM (`.scene-labels`), so neither reaches a
     file.
  7. **Furniture.** A pedestal may carry an optional `kind`: 6′ and 8′
     tables in cloths, counter, chair, stool, print bin, gridwall, banner
     stand, screen. Same list, drag, sliders and rotation as a pedestal;
     the Walls tool adds any of them. `MAX_PEDESTALS` 8 → 24. Shapes in
     `src/furniture.js`, stylised like the figures.
  8. **Keyboard and whole-wall arranging.** Arrows nudge 1″ (Shift 1′) —
     art along its wall, floor pieces across the floor; R / Shift+R turn
     15°; Ctrl/⌘+D duplicates; V/M/T pick Select/Move/Measure. Artwork →
     Placement gains **Space this wall evenly** and **Hang this wall at
     60″** (every work on that face of that wall). `src/arrange.js`.
  9. **Quick start** (Layout → Project): show type, size, starter furniture
     and a name build a booth through `applyVenue`; **Save this booth as a
     template** keeps booth, lights and furniture without art or images in
     `localStorage["booth.templates"]` (12 max) and Quick start offers them.
     `src/quickstart.js`.
  10. **Show pack** (Export): one printable HTML with a numbered floor plan
     and clearances, the inventory of work with size, medium and price, and
     a packing/load-in checklist derived from the booth (a canopy brings its
     weights, a table its cloth, each work two hooks). Artwork gains Medium
     and Price fields for it — `price` and `medium` were already optional
     strings in schema 1, used by wall labels. `src/showpack.js`.
- **Merged and deployed 2026-09-22:** exports in a frame
  you choose, careful rendering for video, the drawn drop shadow that finally
  makes a wall gap visible, an eye beside every spotlight, a universal edge
  colour, a seven-colour palette with a Previous button, and the edge finish
  the next work inherits. The bullets below are that work.
- **An export has a shape now, and it is not the browser window's.** Both the
  PNG and the MP4 took their aspect ratio from the viewport, so a file came
  out whatever size the window happened to be — reported as "it exports at the
  same dimensions I have the viewing window at". Export → Frame and Video →
  Frame now offer **This window** (the default, and bit-identical to the old
  behaviour), **Desktop · widescreen 16:9**, **Phone · vertical 9:16**,
  **Instagram · square 1:1**, **Instagram · portrait 4:5** and **Custom size**,
  with the still's size now given as pixels **on the long side** so a vertical
  frame is 1080 × 1920 rather than 1920 × 3413.
  - `src/framing.js` is the whole of it and is pure: `frameSize(id, {long,
    viewport, custom})` answers for a still and for a clip alike, which is what
    keeps the two from drifting apart. Both sides always come out even, because
    H.264 encodes in macroblocks.
  - A frame that is not the window's shape shows more or less at the sides:
    the camera keeps its vertical field of view and the width follows the
    ratio. `export()` sets `camera.aspect` and restores it in the same
    `finally` as everything else — a camera left disagreeing with the canvas is
    what a stretched export looks like.
  - The frame is a **view setting**, remembered per browser in `booth.view`
    beside the fast-edit lock. It says where a file is going, not anything
    about the booth, so it is not in the backup and not in schema 1. A queued
    batch clip keeps the frame it was queued with, the way it already kept its
    own timeline.
  - Photo mode keeps taking a width: a photograph has a shape of its own and a
    frame there would crop or letterbox someone's own picture.
- **Careful rendering, for the glitches on export.** Video → **Careful
  rendering** (on by default) draws each frame a second time after yielding to
  the browser, then captures it. A frame read straight after the draw call that
  produced it can still carry the previous frame's backdrop, shadow map or a
  texture that had not finished uploading, which is exactly what a glitched
  clip looks like. It roughly doubles the encode; off is the setting for a
  machine that keeps up. `settleFrame` in `recordMp4` is the mechanism, and a
  still is now drawn twice for the same reason — one frame with no second
  chance.
- **Hung work throws a shadow, and a wall gap is finally visible.**
  *(Superseded by the second 2026-09-23 round above: the three sliders became
  Photoshop's five, the canvas became a shader, and the shadow stopped
  scaling with the gap. `booth.dropShadow` is still validated and read — at
  its defaults it takes the new look, moved sliders carry over through
  `fromLegacy`. What follows is the first version, kept as the record.)* The gap
  could only be seen by putting your eye along the wall and looking down it,
  because nothing in the picture said the work was floating — and the light
  that would cast that shadow is often a diffused wash with no direction left
  in it. So the shadow is **drawn, not lit**: a soft dark card on the wall
  behind each work, sized from that work's own wall gap.
  - Lighting → **Drop shadow**: darker/lighter, further/closer, softer/harder,
    each 0..100, and an on/off. `src/dropshadow.js` is pure and holds all the
    arithmetic; `scene.artShadow()` turns a plan into one plane whose canvas is
    cached by shape, so twenty works do not build twenty textures.
  - `booth.dropShadow` is optional, so an older backup opens with the defaults
    — the picture it was saved as, plus the shadow it would have had.
  - It is scenery, like the light bar's housings, so it is in every export.
- **A spotlight can be hidden instead of deleted.** An eye beside each light in
  Lighting → Spotlights. Deleting was the only way to take a light out of a
  composition and it threw away the aim that took longest to set. `l.on` is
  optional and absent means showing, which is what every light in every older
  backup means; a hidden light is not built at all, and a lens flare will not
  come from one.
- **One edge colour for the whole booth, if you want it.** Artwork →
  **Universal edge colour for every work** switches `booth.edgeUniversal` on
  and `booth.edgeColor` answers for every placement. It is a rule, not a
  rewrite: each work keeps its own `edgeColor` and gets it back when the switch
  goes off. **Paint every work this colour** is the other thing someone might
  mean, and writes the colour into the works themselves. `edgeColorOf()` in
  `src/model.js` is the one place that decides which of the two is showing, and
  the hanging guide prints it.
- **The last edge finish is what the next work starts with.** The edge colour,
  the edge material and the thickness of the last work you set are carried to
  the next original hung on a wall — per browser, like the palette, and only
  ever a starting value.
- **Seven saved colours and a Previous button, under every colour swatch.** The
  operating system's own colour window cannot be added to, so the palette sits
  in the panel directly beneath the swatch: up to seven saved colours (`+`
  saves, shift-click forgets), and **Previous**, which is the colour that
  control held before the one it holds now. `src/swatches.js` is the list
  arithmetic; both the palette and the per-control history are per browser and
  never enter a backup.
- **Merged and deployed 2026-09-21:** fast edit mode, the light bar's two
  widened ranges, trade show as a white hall with the warehouse split out as
  its own preset, a hide switch and placement/scale sliders for the figures,
  and neighbouring booths that match this booth's size and face the right way.
  All five came from looking at the live site. Every suite was green before
  the merge: 218 Node tests, all eleven view suites, the browser suite and
  `wall-assets`.
- **Merged and deployed 2026-09-21, later the same day:** the booth row,
  fast edit's auto/on/off lock, and the fix for uploaded photographs hanging
  upside down. All three are the four bullets immediately below.
- **Uploaded photographs are the right way up again.** Decoding an original
  through `createImageBitmap` — which is what made a booth full of uploads
  affordable — hung every one of them upside down, because WebGL does not
  apply `texture.flipY` to an ImageBitmap the way it does to an `<img>` or a
  canvas. The decoder is asked for the flip instead:
  `decodeAt(..., { upload: true })` passes `imageOrientation: "flipY"` and
  records the result in a WeakSet, and `isPreflipped(src)` is what tells
  `scene.texture()` to leave `flipY` off so it is not flipped twice. An
  **edited** image is decoded the ordinary way up and flipped by the texture
  as before: rotating a pre-flipped image turns the wrong way, and the edits
  are applied on a canvas. `tests/image-source.test.js` and
  `tests/image-regression.test.js` pin both halves.
- **Fast edit has a lock, and otherwise follows the gesture.** Auto — the
  default — arms fast edit when a work's handles are armed and drops it again
  the moment you click away from that work, which is the behaviour that was
  asked for: it lasts exactly as long as the arranging. The button beside
  Fast edit in the toolbar cycles **Auto → On → Off**; On and Off hold it
  there and no gesture moves it. `scene.setDraftPolicy`, `armDraft`,
  `releaseDraft` and `letGoOfArt` in `src/scene.js` are the whole mechanism;
  the policy is remembered in `localStorage` per browser, because it is a
  judgement about a machine rather than about a booth. It is also a dropdown
  in Layout → Drawing speed. Still a view setting: not in the backup, not in
  the undo history, not in schema 1.
- **A booth is one of a row now.** Layout → **Booth row**: `+1 booth` either
  side, a typed number and `Add typed number` for ten at once, `+ space` for a
  gap in the aisle with its own width, a gap setting between slots, and a
  list of the slots with what is hung in each. **Pick a booth under “Hang new
  artwork in” and the next original goes into that booth** — or drag one
  straight onto its wall, which says which booth as well as which wall.
  Selecting a work that hangs in another booth moves the picker to it, and
  Artwork → Placement → Booth moves a work between booths.
  - `src/row.js` is the model: a row is a list of slots, each a booth or a
    space, exactly one of them home, and `rowLayout()` is the one place that
    answers where each one stands — in inches along X from the centre of the
    home booth, which is the origin the scene already draws around.
  - **Every booth in a row is this booth's size**, deliberately. The walls,
    their heights and the panel module are one set of measurements in this
    project, so a work hung in a row booth is measured against the same
    `booth.walls` as one hung at home and needs no new arithmetic and no new
    validation. A row of differently-sized booths would need a booth to be a
    document of its own, and that is a different feature.
  - `booth.row` and `art.booth` are both optional, so every older backup
    loads as the single booth it described. Removing a booth removes the
    artwork hung in it — the alternative is works on walls nobody draws.
  - The decorative booths either side (Surroundings → Surround with other
    booths) are left out while a row is drawn, so the aisle is only the one
    that was laid out. The one *behind* stays: a row says nothing about what
    backs onto it.
  - The hanging guide is this booth's build sheet and excludes the rest of
    the row, which is why `hangingGuide` filters on `!a.booth`.
- **Merged and deployed 2026-09-21, earlier the same day:** uploading files an
  original instead of hanging it, fixture brightness as a percentage, fast
  edit arming itself on a double-tap, and the four things that made a booth
  full of uploaded photographs slow. All four came from a 2014 iMac in Chrome
  and from a phone; the four bullets below are that work. **Nothing is sitting
  unmerged on a branch.**
- **Uploading files an original; tapping one hangs it.** Choosing several
  images at once used to hang every one of them on the back wall at the same
  x and y. Coplanar artwork has no depth order, so the wall flashed through
  all of them — and nothing had been asked for. `upload()` now adds assets and
  no placements; the library already listed an original with no placement, so
  this was a deletion rather than a mode. Tapping a library card hangs it
  (`addCatalogPlacement`, which was already wired), dragging one onto a wall
  still drops it where you point, and `openSpot()` in `src/model.js` keeps a
  new placement off one that is already there: right along the row, then down
  a row, then up, and an honest overlap rather than a refusal if the wall is
  genuinely full.
- **Fixture brightness is a percentage, 0..100, default 50.** The stored unit
  is still the light's own power and the schema still accepts 0..300 — the
  slider carries a scale instead. `LIGHT_BAR_POWER_STEP` (0.16) is how many
  stored units one slider point is worth, `range()` takes it as its ninth
  argument and writes `data-scale`, and the change handler multiplies by it in
  the one place a control's value becomes a number. 50 is 8 stored units,
  which is where the bar was judged to read right; the old default of 60 was
  called much too hot. A booth carrying 60 reads 375 here and widens its own
  slider to reach it, and offers `Set brightness to 50` rather than having its
  stored value rewritten behind its owner's back.
- **Fast edit arms itself, and costs nothing to reach.** Double-tapping
  artwork arms its move-and-scale handles, and handles are the start of a
  drag, so that gesture now turns fast edit on (`activateTransform` in
  `src/scene.js`). It is also a switch in Layout → Drawing speed, where
  someone arranging a booth is already looking. Toggling it no longer calls
  `render()`: that rebuilt every wall, texture and light and redrew the
  library and the whole inspector, so the control whose job is to make the app
  faster cost a pause of its own on the way in. `setDraft()` and `syncTools()`
  in `src/main.js`; `tests/view-responsive.mjs` pins that a toggle leaves
  `scene.revision` alone.
- **An uploaded original costs what it should now.** Four separate things, all
  of them the same mistake — treating a 25 MB base64 string as though it were
  free:
  - **The undo history and every save stringified them.** `checkpoint()` ran
    `JSON.stringify(p)` on each edit, and thirty-five of those are kept. A
    booth with a dozen 20-megapixel photographs carries fifty-odd megabytes of
    base64, so each nudge of a slider built a fifty-megabyte string. `snapshot()`
    / `fromSnapshot()` in `src/main.js` stringify the layout and carry the
    assets by reference — a shallow copy of the map, which is a few string
    references whatever the strings weigh. An original is never edited, which
    is what makes sharing them safe.
  - **Every re-render pointed a dozen `<img>` tags at the originals.** A click
    redraws the library and the inspector. Each asset now carries an optional
    `thumb`, a ~15 KB JPEG made at import (`thumbnailOf` in `src/storage.js`),
    and `artThumb()` shows that. Assets from before it existed are backfilled
    one at a time after the first frame — derived data, so no checkpoint and
    nothing in the undo history.
  - **Textures decoded the whole original and then shrank it on a canvas.**
    `decodeAt()` in the new `src/image-source.js` hands `createImageBitmap`
    the target size, so the browser's own decoder does it off the main thread;
    the old path is still there for anything that will not. The image editor's
    720 px preview goes through it too. No `imageOrientation` is asked for, so
    the result is the way up an `<img>` gave and `flipY` stays at three's
    default — `tests/e2e.mjs` samples the four quadrants of the fixture to
    hold that.
  - **IndexedDB was handed the whole project 350 ms after every edit.**
    `src/storage.js` now keeps the layout and the images in two object stores:
    the layout is one small record, each original is a row written when it
    arrives and not again. A stamp of role, thumbnail length and data length
    is what decides "changed" without comparing megabytes. Backups are
    untouched — a `.booth.json` is still one document with its images inside,
    which is what makes it portable and what schema 1 promises.
- The photoreal phase (`PBR_PHASE.md`) is done through Phase 4: HDRI lighting,
  PBR ground surfaces, the tent canvas and a fabric wall finish. Assets are
  committed and live. `public/assets` is 28 MB of a ~50 MB budget.
- **The ground is one list with two groups.** Layout → Surroundings → Ground
  now holds **Preset grounds** (the six shipped PBR kinds) and **Your
  photographs** (uploads, each named) in one picker, and selecting either
  switches the floor. This removes the upload-outranks-preset behaviour that
  was reported three times as a broken dropdown: there is no override and
  nothing to remove before a preset works. `booth.ground` holds a kind or
  `"upload:<asset id>"`; an older backup's `booth.groundAsset` is read as the
  first entry of the library and never dropped. `GROUND_LIBRARY_PHASE.md`.
- **Selecting a work rebuilds nothing.** It used to go through `render()`,
  which disposes and rebuilds the whole scene — every wall, every texture, the
  HDRI — to draw one blue outline, which is why the handles were slow to
  appear on a double-click. `applySelection()` in `src/scene.js` draws the
  outline and the eight handles, and is the one path both the rebuild and a
  plain click use; `renderSelection()` in `src/main.js` is what a click costs
  now. `tests/view-responsive.mjs` pins it against `scene.revision`, the
  rebuild counter — if a future change makes selecting rebuild again, that
  test fails rather than the app merely feeling slow.
- **A drag is one move per frame, and shadows wait for the end of it.** Nine
  shadow-casting heads over an art-show booth were re-rendered on every
  pointer event, several times per displayed frame. Moves are now applied once
  per frame from the render loop (`flushDrag`) and shadows are refreshed when
  the gesture ends (`touchShadows` / `settleShadows`). Shadows are therefore
  frozen mid-drag, deliberately.
- **Artwork can be placed with a slider.** Artwork → Placement: Slide
  left / right and Slide up / down beside the two edge fields. The travel is
  the wall less the work's own size, so the end of the slider is the work
  flush with the edge. One undo step per gesture, through `constrain()` and
  `updateArtwork()` — the same edit as typing the number.
- **An art-show booth no longer stands in its own hall in a photographed
  environment.** The hall's white walls used to cut across the photograph as
  a band at mid-height. Choosing any environment but the neutral studio now
  switches the hall off, and the toggle is repeated in Layout beside the
  environment picker. The booth, its walls, its light bar and the panel
  module are untouched: this is the room, not the booth. It is a default, not
  a lock — tick it again and the hall comes back.
- **The light bar is adjustable from the Lighting tool too.** Brightness,
  temperature and diffusion are mirrored there, because that is where someone
  looks for lighting; they are the same settings as in Art show, not a second
  set. How many heads and how high stay in Art show.
- **Video export is done.** Four eased camera moves, a live preview, and an MP4
  written by hand. `src/camera-path.js`, `src/video.js`,
  `scene.previewMove()` and `scene.recordVideo()`.
- **The backdrop is drawn in its own pass**, through a lens wider than the
  camera's, so the surroundings can be pulled back without a wide-angle booth.
- **Five fixed camera moves**, including **Ken Burns · slow drift** — a very
  slow push with a touch of drift, for framing one piece rather than the room.
- **Video has its own tab.** Inspector → **Video**: the move, the clip length,
  the frame rate, the resolution, the preview, the MP4 button, the timeline and
  a **batch list** — queue several clips and render them in one go, each
  keeping the settings it was queued with (including a frozen copy of its
  timeline). The Export tab still carries the same video controls beside the
  PNG and the guide; they are the same settings, not a second set. A single
  export and a batch run through one loop, `runClips()`, so they cannot drift
  apart.
- **The lens flare can come from an unseen overhead light.** Timeline → Lens
  flare → Comes from: **Overhead** (the default) is an imaginary source 20 ft
  over the centre of the booth, standing in for the sun or a hall's high bay —
  nothing is drawn there and nothing is lit by it, so it works in a booth with
  no spotlights at all. **Brightest spotlight** is the old behaviour, and is
  offered but disabled when there are no spotlights. `OVERHEAD` and
  `flareOrigin()` in `src/flare.js`.
- **Custom video mode is done.** Export → Video → Camera move → **Custom** opens
  a non-modal timeline: compose a shot in the viewport, press Add keyframe,
  orbit, repeat. Per-keyframe time, hold and ramp, fade in/out, and an optional
  lens flare that tracks the camera. `src/timeline.js`, `src/flare.js`, the
  overlay pass in `scene.js`, and `CUSTOM_VIDEO_PHASE.md` for the reasoning.
  The recorder, the encoder and the muxer are unchanged: a timeline is another
  implementation of the same `samplePath(move, base, t)` contract.
- **The backdrop is locked to the horizon**, on by default, with an on/off in
  Layout → Surroundings → Backdrop. The backdrop's wider lens compresses the
  same pitch, so the photographed horizon used to slide against the floor as
  the camera tilted; `lockedPitch` in `src/scene.js` over-rotates the backdrop
  camera by the ratio of the two lenses' tangents. Pitch only — scaling yaw the
  same way would spin the backdrop nearly twice in a full orbit.
- **The backdrop lens is bounded by the pole, not by the framing slider.**
  `BACKDROP_EDGE_LIMIT` (52°) caps how far from the horizon the backdrop's
  frame edge may land, and `safeBackdropFov()` narrows the lens per frame to
  respect it. This was a real reported artifact: at 25% framing and a 12°
  tilt the lens reached 135°, the top of the frame sampled the equirectangular
  pole, and the render came back as radial smear across the upper half. Tilt
  far enough and the backdrop stops widening and falls back to the camera's own
  lens, which never shears. The lens and the horizon lock settle together in
  two passes, so the limit cannot silently switch the lock off.
- **An art-show booth opens neutral.** The venue switch now also sets the
  environment preset to the neutral studio, alongside the studio floor and
  horizon it already set: a photographed warehouse behind a seamless white
  indoor booth is one venue's light on another's walls. All three stay
  editable afterwards — it is a default, not a lock.
- **Spotlight housings hide themselves indoors.** Under `tradeshow`,
  `warehouse` or `home`
  the hall's own track lighting is already in frame, so the booth's fixtures
  are clutter hanging in mid-air. Lighting → Spotlight fixtures: Auto (the
  default), Always show, Never show. The rail above the booth always stays;
  only the housings go, and the light itself is unchanged. An art-show booth
  counts as indoors whatever the environment picker says, because it has its
  own light bar overhead.
- **People for scale.** Layout → People: add a woman (5′6″) or a man (6′0″),
  up to six, each with editable height, position and facing. `src/people.js`
  builds them; they are stylised on purpose, and excluded from the hanging
  guide.
- **The backdrop is aimed from the Layout panel.** Layout → Surroundings →
  Backdrop: a zoom slider with -/+/reset buttons, plus pan (horizontal) and
  tilt (vertical). `+`/`-` on the keyboard zoom the viewport camera.
- **The indoor art-show booth is done.** Two new inspector tabs. **Art show**
  switches `booth.venue` to `"artshow"`: seamless white walls (144″ back, 120″
  sides, 144″ tall), no canopy, a light bar across the front with nine
  directional heads spotting the three walls, and a white exhibition hall with
  30 ft ceilings around it. Booth dimensions, wall dimensions and the
  individual display panel (38″ default) are all typed in inches; `Rebuild
  walls from this panel` snaps the walls to whole panels. **Walls** holds the
  free-standing walls — moved out of Layout — and the new pedestals (44 × 12 ×
  12 by default, solid top, double-click in the booth to pick one up and drag
  it). `src/lightbar.js` derives the nine fixtures from the booth's own
  measurements; `ART_SHOW_PHASE.md` is the record of what was decided.
- **The light bar is diffused**, after the first look reported it as harsh.
  Art show → Light bar → **Diffusion** (0..1, default 0.7) opens the beams
  until they overlap into a wash, fades their rims, fills their shadows
  instead of stacking nine hard ones, trims the fixtures back as they widen,
  and adds a bounce fill standing in for the white hall. `lightBarOptics()`
  and `lightBarBounce()` in `src/lightbar.js` are the whole of it, both pure.
  **Diffusion 0 reproduces the old lighting exactly** — it is a setting, not
  a replacement — and the browser test asserts that after dragging it to zero.
- **Free-standing interior walls are done.** Layout → Free-standing walls: add
  a panel, type its width, height, X/Z position and rotation in inches, and
  hang art on either face through the usual Location dropdown. `booth.panels`
  is a separate optional list beside `booth.walls`, so every older backup still
  loads; `wallSpec()` in `src/model.js` is the one place that answers "what am
  I measuring against" for a perimeter wall and a panel alike.
  `WALLS_PHASE.md` is now the record of what was decided.

## Next

1. **The cut-out people, by eye.** Do they read right in the booth — size
   against the walls, the woman's colours under the booth's light, the black
   silhouette against a dark wall? Is mirroring on facing welcome, or should
   the picture never flip? A cut-out seen from high overhead (Plan view) is a
   picture lying at an angle; if that reads wrong, Plan could draw a floor
   marker instead. More kinds (a child, a group, a wheelchair user) are a
   picture each plus a `PEOPLE` entry with its measured box.
1. **The roadmap, built 2026-09-24 — now it wants eyes.** Base, A, B, C, D
   and E are all on `main` (see Now). Every tool is tested in a real
   browser here; none has been used on the real machine or a real phone.
   In rough order of what to look at:
   - **The phone**: the scrolling toolbar and tabs, the fold handle, the
     walk pad, Select several. Is anything still out of thumb's reach?
   - **Smart guides**: is 2″ the right pull? Too sticky → lower
     `SNAP_RANGE`; too weak → raise it.
   - **Walk mode**: step size (6″, 2′ with Shift) and whether drag-to-look
     should be inverted.
   - **Clearance**: is 36″ the right line for art shows, or noisy? Are the
     outside-the-footprint and 4″ "pushed against" rules right?
   - **Elevations**: print one at 100% and check the 1′ bar with a ruler.
   - **.glb**: open an export in Blender or an AR viewer, and bring in a
     real model; the scale-to-height rule assumes the model stands upright.
   - **Hall planner and power sheet**: do promoters want mixed booth sizes,
     islands and corner booths? Are the wattages what shows ask for?
   **The Pro unlock itself is the owner's separate plan** — see the base
   bullet in Now; `src/tier.js` is the one place it plugs in. What was
   proposed, for the record: The tool
   ideas, in priority order: snap and smart guides; a floor-plan underlay
   scaled by two clicks; saved views; multi-select with align and
   distribute; tags (visibility groups); walk mode; a draw-a-box / pull-up
   tool; elevations printed to scale; a hall planner of numbered booths;
   clearance checks; a power and rentals sheet; `.glb` import and export.
   Proposed route: first a small capability layer (`src/tier.js`: one
   `can(feature)` check, a lite/pro switch stored per browser, a lock badge
   on pro controls) and a mobile pass over the existing panels, then the
   tools in batches of two or three per session, each gated through `can()`
   from the day it lands. Local-first rules out real licensing: without a
   backend, pro can only be an honour-system unlock or a signed key checked
   in the browser, and that decision is the owner's.
1. **Tool search and the third round, on the real machine.** Does the
   search find what you type, by the name you would type? Its words come from
   the panels' own headings, labels and buttons, so a tool called something
   other than what people call it is a label worth renaming, or a synonym
   worth adding in `rankTools`. Is a slight stutter still there with shadows
   refreshed every other frame? Past this, the next lever is a smaller shadow
   map during a drag. Three labels are shared by several controls in one
   section (each perimeter wall's Width and Height, under Display walls): the
   search lists one of each and opens the first.
1. **The 2026-09-23 work on the real machine, and the round that answered
   it.** *Answered 2026-09-23 — see the third-round bullet in Now; kept here
   for its reasoning.* The first report is in: **speed "much better"**, and five asks,
   all answered and **deployed the same day** (see Now). **Check
   `window.BOOTH_BUILD` shows `main`'s tip before judging any of it** — a
   Cloudflare build takes a few minutes. Then, on the real machine:
   - **Is a drag with fast edit off still smooth?** It is the one cost this
     round added: the shadow maps now refresh every drawn frame of a drag so
     the cast shadow follows the work (1024² per spotlight and the fill, 512²
     per bar head at High detail). If it stutters, fast edit is still the
     answer, and the next lever is refreshing every other frame, not holding
     them until release again — that is the bug that was reported.
   - **The drop shadows, by eye.** Is the Photoshop mapping right — 20 px to
     the inch, so the screenshot's 10 px / 16 px became 0.5″ / 0.8″? At
     whole-booth zoom that shadow is subtle; up close it reads. Are the second
     shadow's defaults (55%, 1.5″, 10%, 2.5″) "stronger" in the way that was
     meant? Every number is a slider; `SHADOWS` in `src/dropshadow.js` is
     where the defaults live, and a booth nobody has tuned follows them.
   - **Does the angle dial feel like Photoshop's?** Drag round it, or focus it
     and use the arrows (Shift for 15°). Use Global Light ties both shadows to
     `booth.shadowAngle`; switching it off keeps the current angle as the
     shadow's own, which is Photoshop's rule.
   - **Hide.** A hidden free-standing wall takes its art out of the picture,
     and the show pack's **inventory still lists that art** — the same as a
     switched-off perimeter wall always has. If a hidden wall's work should
     drop out of the inventory too, that is a one-line filter in
     `inventory()`, and it should probably apply to switched-off walls as
     well. Artwork itself has no eye yet; it was not asked for, and hiding a
     work raises the same inventory question.
   - **The Preview menu in the status bar**: is it where you would look, and
     does "drawing at 2×" mean anything to someone who is not a graphics
     programmer? It could say "sharp / softer" instead.
   - Still open from the first round: **does Auto settle somewhere
     sensible?** (raise `SLOW_FRAME_MS` if it lands on 1 where Balanced looked
     fine; the menu now shows the rung, so this is readable at a glance);
     **does anything fail to appear until the mouse moves?** (missing from
     `watchForChanges()`; look after a 15 s pause); **are the light bar's
     shadows missed in the preview?**; and **the furniture shapes, sizes,
     `STARTER_PLACES` and the show pack's checklist** — all judgement.
1. **Nobody has looked at any of the 2026-09-21 finishing work.** All of it is
   on `main`. Judgements that need a browser and a pair of eyes:
   - ~~The drop shadow's three defaults~~ — answered on the real machine:
     it was asked to work like Photoshop's, and now does. See item 1.
   - **Whether a vertical or square export frames the booth usefully.** The
     camera keeps its vertical field of view and the width follows the ratio,
     so a 9:16 clip shows the walls and loses the aisle. If a vertical frame
     wants a wider view, that is a zoom before exporting — or an argument for
     the frame adjusting the lens, which was deliberately not done, because a
     lens that changes with the frame means the preview is not the export.
   - **Whether careful rendering actually fixes the glitches**, and whether
     doubling the render is a price worth paying by default on a 2014 iMac.
     It is a checkbox; off is one click.
   - Whether seven swatches and Previous are the right two controls, and
     whether shift-click is discoverable enough for forgetting one. The
     tooltip says so and nothing else does.
   - Whether the edge finish being inherited by the next work is welcome or
     surprising. It is the last one *set*, which is not the same as the last
     one hung.
2. **Look at the art-show booth on the live site and set Diffusion.** This is
   the first thing to do and it needs a human, not a session: no agent can
   load production. Open Art show, and judge in this order —
   - **Diffusion** (Light bar, default 1.5 on a 0..3 scale) is the one number
     in the softening pass that was chosen rather than derived. It was 0.7 on
     a 0..1 scale, was judged still harsh at its old maximum, and the scale
     was widened rather than moved: **0..1 is bit-identical to what it always
     was**, so a booth composed against 0.7 lights exactly as it did. Past 1
     the hall takes over — cones opened until they stop reading as cones, and
     the bounce off white walls doing the lighting. Still harsh at 1.5? Drag
     it up; 3 is the top. Flat and washed out? Drag it down. 0 restores the
     original hard lighting exactly, so the slider is safe to explore. If 3 is
     still not enough, the next lever is the bounce cap in `lightBarBounce`,
     not more cone.
   - **Fixture brightness** is the next judgement call, and it has been
     recalibrated twice. 70 was reported as "beyond bright" and 60 — the old
     default — was then reported as much too hot, so the slider is now a
     percentage: 0..100 in steps of 1, where 50 is the default and is 8 stored
     units, and 100 is twice that. The schema still accepts 0..300 and always
     will. A booth composed before this reads 375 and widens its own slider;
     `Set brightness to 50` under the slider is the one drag back. **3500K**
     is the other judgement call.
   - Whether nine shadow-casting spots are affordable on your machine. If not,
     the honest fix is dropping `castShadow` on the washers, not cutting their
     number — with diffusion up, their shadows are mostly fill anyway.
   - Whether the hall reads as a hall, and whether a seamless white wall wants
     the fabric finish on (`wallFinish: "fabric"` works on an art-show booth).
   `ART_SHOW_PHASE.md` says which knob to turn first for each.
3. **Two reports could not be reproduced, and need numbers from the machine
   that saw them.** "Ground textures — grass, concrete — do not show up, just
   the background" and "the tent frame showed but not the fabric". On `main`,
   in a real browser here, all six ground kinds load, bind and render
   distinctly (grass comes out green in a screenshot) and every tent style
   draws its canvas. The third report from the same round — the backdrop
   filling the top of the frame as a smear — **was** reproduced and is fixed;
   see the pole limit above. For the other two, get `window.BOOTH_ASSETS` and
   `window.BOOTH_BUILD` from the browser seeing it before touching code. Of
   the two known causes, an uploaded ground photograph outranking the ground
   kind **can no longer happen** — presets and uploads are one list now. That
   leaves a stale deploy, which is not visible from the repository and looks
   exactly like a broken dropdown.
4. **The two shipped backdrops are 1024×512 and read soft.** This is the one
   open bug with a known fix. Both were prepped from Poly Haven's **1K** HDRI,
   and `tools/hdri-prep.mjs` will not stretch a backdrop past its source. Re-prep
   from the **4K** download and the softness goes:
   ```sh
   node tools/hdri-prep.mjs ~/Downloads/burnt_warehouse_4k.exr warehouse \
     --credit "Burnt Warehouse (Poly Haven)"
   ```
   **No agent session can do this** — polyhaven.com is refused by the sandbox
   egress proxy, as is the workers.dev production host. It needs a human with a
   browser. `docs/HDRI-ASSETS.md` is step by step.
5. **H.264 output is unverified on real hardware.** Open Chromium builds ship no
   H.264 *encoder*, so every sandbox run exercises the VP9 fallback instead.
   That does prove the whole encoder-to-muxer pipeline with real encoder bytes,
   and mp4box.js validated the container — but nobody has opened an
   `avc1`/`avcC` file from Chrome or Safari in QuickTime. If a clip will not
   play, start here.
6. **Unverified on real hardware** — things no one has confirmed by eye,
   because no agent session can load the live site:
   - **Nobody has looked at the Video tab, a batch export or the overhead
     lens flare.** The batch list is covered in a real browser (queue two
     clips, check each keeps its own settings, remove one, clear the list) and
     the overhead flare is checked to throw in a booth with no spotlights, but
     where the flare's ghosts fall over a real render, and whether a batch of
     four 1080p clips is a reasonable wait on a real machine, are judgements.
   - **Nobody has looked at a figure standing in a booth**, at the backdrop
     zoomed wide after the pole limit landed, or at a Ken Burns clip. The
     figures' heights are pinned in metres by a test that reads the meshes
     back, and the pole limit is pinned against the arithmetic it comes from,
     so those are not guesses; how a stylised mannequin reads beside real
     artwork, and whether 52° is the right place to stop widening, are
     judgements made on renders in a sandbox.
   - **Nobody has looked at an art-show booth.** See item 2 — it is the whole
     of that item. The measurements are pinned by tests that read the meshes
     back and the nine spotlights are checked against the arithmetic that
     placed them, so nothing there is a guess; what is left is all judgement.
   - **Nobody has looked at a booth with free-standing walls in it.** Where a
     panel stands is pinned by a test that reads the mesh's world matrix back,
     so that is not a guess, and a click-and-drag in a real browser is covered
     by `tests/view-panels.mjs`. Whether a 72″ divider at the centre of a
     10 × 10 booth reads as useful, whether the fabric weave looks right at a
     panel's width, and whether dragging a wall *feels* right — the
     select-then-drag rule, the floor-plane grab, the 1″ snap — are judgements
     that need a hand on a mouse. Rotating a panel by dragging is the obvious
     next refinement and was deliberately left out: it needs a handle of its
     own, and a wall that spins when you meant to slide it is worse than a
     typed angle.
   - The custom timeline and the lens flare are covered by tests in a real
     browser, but nobody has *looked* at a keyframed clip. The flare's ghost
     spacing, its warmth ramp and the fade lengths are judgement calls made
     without a render; they are the first things to adjust if it reads wrong.
   - Whether the backdrop horizon lock looks right through a full orbit. The
     arithmetic is exact at the centre of frame and approximate across it, and
     approximate is a thing you see, not a thing a test catches.
   - Are the four ground tile sizes really 2 m? They were recorded at the
     tool's default, not read off the ambientCG pages. Wrong tile size makes a
     floor read as a picture of a floor.
   - Does the wall weave look right? It tiles at the carpet's real size, about
     1.5 repeats across a 10 ft panel, which may be coarse for a pro-panel.
     `WALL_SET` in `src/surfaces.js` points at `carpet`; pointing it at
     `canvas` is a one-line change to a finer weave.
   - Is the tent weave visible? Its relief is exaggerated 3x (`TENT_WEAVE`)
     because a true-depth weave on a white roof washes out.
7. **A `home` HDRI** is still missing — an interior with windows on one side.
   That preset falls back procedurally until someone downloads one.
8. **Nobody has looked at the four things in the earlier 2026-09-21 merge.**
   All of them are answers to reports from a real browser; none has been seen
   there since:
   - Whether uploading and then tapping reads as obviously as it should. The
     upload toast says the files went to the library and the card says "Tap to
     hang it", but the gesture is new and the old one hung things for you.
   - Whether 50 is right for fixture brightness now that the slider means
     something different, and whether the `Set brightness to 50` note under an
     old booth's stretched slider reads as an offer rather than a warning.
   - Whether fast edit arming itself on a double-tap is welcome or startling.
     It is the start of a drag, so it should be invisible — but the shadows go
     as it comes on, and that is a visible change nobody asked for in that
     moment.
   - **Whether any of the speed work is enough on the 2014 iMac.** Everything
     measured is in the tests; what is not known is how it feels. See item 10.
9. **Nobody has looked at the ground picker or the artwork sliders.**
   Both are on `main` and live. Whether two labelled groups in one dropdown
   read as obviously as intended; whether "Delete this ground photograph"
   sounds like a delete rather than a deselect; and whether the placement
   sliders have useful travel on a 10 ft wall. All judgements on a live site.

   **Nor at anything in the 2026-09-21 merge** — see Now. Specifically: whether trade
   show now reads as the white hall it is meant to be; whether the warehouse
   is worth keeping as its own preset at 1024px (see item 3 — it is the soft
   one); whether the figures' new sliders have useful travel, given they reach
   four feet past the booth on purpose so a visitor can stand in the aisle;
   whether a row of same-size neighbours reads better than the old fixed
   10 x 10 ones; and whether the fast edit toggle is worth its place in the
   toolbar. That last one is half answered: it is now automatic on a
   double-tap and also a switch in Layout, and the toolbar button stays.
10. **Is it actually faster now?** Reported still slow on a 2014 iMac in
   Chrome — and, tellingly, **fast with the sample panels and slow with
   uploaded photographs**. That last part was the diagnosis: four separate
   places treated a 25 MB base64 original as free. The undo history and every
   save stringified all of them on every edit, every re-render of the library
   and the inspector pointed `<img>` tags at them, textures decoded them whole
   before shrinking them, and IndexedDB was handed the lot 350 ms after each
   edit. All four are fixed on the branch — see Now — and **Fast edit** is
   still there on top of that, now arming itself on a double-tap and no longer
   costing a full re-render to switch on.

   What is **not** yet known is whether it is enough on that iMac, or on a
   phone. If a drag still stutters with fast edit on, the remaining candidates,
   in order: the backdrop's second pass (deliberately left alone, because
   skipping it reframes the hall mid-gesture and a picture that moves under
   your hand is worse than a slow one), then the figures, then dropping
   `castShadow` on the light-bar washers permanently rather than only in fast
   edit. Below that: a click still rebuilds the library and the inspector as
   HTML strings, which is now cheap but not free, and `Export → Preview
   quality → Efficient` is worth trying on a 2014 machine.
11. **Nobody has looked at a booth row, at the fast edit lock, or at an
   uploaded photograph the right way up.** All three are on `main`. Judgements
   waiting on a live site:
   - Whether a row of booths reads as an aisle at the default 24″ gap, and
     whether `+1 booth` / a typed ten / `+ space` is the right set of three
     controls or one too many.
   - Whether picking the booth under “Hang new artwork in” is obvious enough,
     given the artwork lands somewhere the camera may not be pointing. The
     toast names the booth; the camera does not move to it, deliberately —
     but moving it there is the obvious next refinement if it reads as
     nothing having happened.
   - Whether auto fast edit is welcome. It now goes off as well as on, so the
     shadows come back the moment you click away from a work — a visible
     change nobody asked for in that moment, which is exactly what the lock
     is for.
   - **Whether uploaded photographs are the right way up.** The fix is pinned
     by tests at both ends, but the bug itself was invisible to every test in
     this repository until it was reported, and only a real browser sampling
     a real JPEG can say it is gone. This is the first thing to check.
   - A row booth is drawn plain: three walls, this booth's colour, no light
     bar, no seam posts, no fabric weave. Whether that reads as a neighbour
     or as an unfinished version of your own booth is a judgement.
12. **Figures are stylised mannequins.** No faces, no clothing, mid-grey. If
   they need to read as a crowd rather than as scale references, that is a
   different asset and a different phase.

Free-standing walls — placement, art on both faces, and now click-and-drag
with sliders — custom video mode with its keyframe timeline, fades and
tracking lens flare, the Ken Burns move, people for scale, and the indoor
art-show booth are **done** and are no longer on this list; see Now.

## Diagnosing "the texture isn't showing"

This came up twice and was guessed at twice. Do not guess a third time.

**`window.BOOTH_ASSETS`** works in production and records, per texture set,
whether it loaded and what it found. `window.BOOTH_BUILD` gives the deployed
commit. `window.__booth` is dev-only.

Two real causes were found, and one of them no longer exists:

- ~~**An uploaded ground photograph outranks the Ground kind entirely.**~~
  **Fixed.** Presets and uploads are two groups of one picker, so a preset
  always switches the floor and there is nothing to remove first. An older
  backup's upload opens as the first entry of the library. If a report from
  before this shipped mentions Remove ground texture, that is why.
- **A ground kind whose files are missing** falls back to the procedural
  surface silently. That is by design; `BOOTH_ASSETS` is how you tell that
  apart from a bug.

Ruled out, so do not re-investigate: Cloudflare Workers serves the assets
correctly, checked with `wrangler dev --local`. The build output contains all
37 asset files.

**Also ruled out, 2026-09-18.** "Grass does nothing, the floor stays cement"
was reported again and chased to the end this time. On `main`, against the
committed assets, all six ground kinds load, claim, bind and **render
distinctly** — grass comes out green in a screenshot. `BOOTH_ASSETS` reported
every set `loaded` with all four maps at a 2 m tile, and HEAD on every
`color.jpg` returned 200 `image/jpeg`. The selector, the loader and the
renderer are not the bug. If it recurs it is state or staleness on that
browser, so get **`window.BOOTH_ASSETS` and `window.BOOTH_BUILD` from the
machine seeing it** before touching code. The remaining known cause is a stale
deploy, which looks exactly like this and is not visible from the repository;
the other one, an uploaded ground photo outranking the kind, was removed when
the picker became one list.

## Diagnosing "the video won't play"

- **Ask which codec it used.** The export panel states it before rendering and
  the toast repeats it afterwards. VP9 in MP4 is the fallback for a browser
  with no H.264 encoder; it plays in Chrome, Edge and VLC and **QuickTime
  Player cannot open it at all**. That is the most likely answer, and the app
  now warns rather than handing over a file that looks broken.
- **If it says H.264 and still will not play**, the container is the suspect.
  `muxMp4` takes the encoder's own `decoderConfig.description` verbatim as the
  `avcC` payload, and the H.264 branch has never been produced on real
  hardware here. `tests/video.test.js` parses the file back; use mp4box.js for
  an opinion this repository did not write.
- **The H.264 level is computed from the frame size and rate** (`h264Level`).
  It used to be hard-coded at 4.0, which cannot carry 1440p at any rate or
  1080p at 60 — a stream that exceeds its declared level is out of spec and a
  strict decoder may refuse it. If you add a size or a frame rate, the test
  "every offered size and frame rate declares a level it does not exceed"
  covers you.

## Deployment

| Push target | Cloudflare result |
| - | - |
| `main` | **production** |
| any other branch | preview only |

- Merging to `main` is the deploy. There is no other step, and **there is no
  GitHub Actions workflow** — it is Cloudflare's Git integration alone.
- **The dashboard uploader cannot deploy this project** and will say so: it is
  a Vite app with a `wrangler.jsonc`, so it needs a build. Do not fight it.
- `wrangler deploy` with no credentials opens a browser login and hangs forever
  in a headless session. Needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
  and `CI=true`. Merging is easier.
- Account `8e38cda861b39784706d53545a0a435f`, worker `booth-studio`.
- The footer reads `v0.1.0 · <time> UTC · <commit>`, hidden under the mobile
  breakpoint — use `window.BOOTH_BUILD` on a phone. **Check it before
  believing a fix did not ship**: a merge was reported as not working twice,
  and both times the build simply had not finished.

## Testing

```sh
npm ci
npm test                 # 343 Node tests
npm run build
npm run test:view        # 25 suites: city, lighting, HDRI, textures, ground library, video, timeline, people, panels, responsiveness, art show, booth row, finishing, measuring, furniture, arranging, quick start, show pack, tool search, tier, guides, views, plan, box, hall
BOOTH_TEST_CHROMIUM=/opt/pw-browsers/chromium node tools/perf-probe.mjs   # what an edit costs, before/after numbers
npm run test:browser     # 25 end-to-end checks
BOOTH_TEST_CHROMIUM=/opt/pw-browsers/chromium node tests/wall-assets.mjs
```

The sandbox has WebGL via swiftshader, but the pinned Playwright expects a
newer Chromium than is installed, so pass the browser explicitly:

```sh
BOOTH_TEST_CHROMIUM=/opt/pw-browsers/chromium npm run test:view
```

**Never verify through a pipe.** A pipeline's exit status is the last command's,
so `npm test | grep PASS` exits 0 even when the suite fails. This has already
hidden a failure once. Run each suite directly.

The same trap wears a second costume, and it has now caught someone too:
`npm run test:view > log; echo $?; grep PASS log` reports the **grep's** exit
status, not the suite's, so a run that died halfway reads as a pass because
the log it left behind still had PASS lines in it from the suites that ran
before the failure. Print the suite's own `$?` immediately after it and read
*that* number. Count the PASS lines as well: eleven suites means eleven.

**Do not edit `src/` while a view suite is running.** The suites drive a live
vite dev server, so saving a module hot-reloads the page mid-assertion and the
run dies on `window.__booth` being undefined. That is not a flake and not a
regression — it is the editor and the test sharing one server.

**And do not run two browser suites at once.** The sandbox has four cores and
swiftshader draws on all of them: with a second suite running, a 4096 px PNG
export or a 3× frame passes Playwright's 30 s timeout and the suite fails
with a `TimeoutError` that is not a bug — found on 2026-09-24, where
view-responsive and e2e both failed that way and both passed alone. The way
to keep working while the whole chain runs (it takes about 25 minutes now) is
a snapshot: `git worktree add ../bs-test HEAD`, `cp -al node_modules
../bs-test/` (hard links — a symlink puts the fonts outside vite's allow
list), run the chain there in the background, and edit here without running
anything else in a browser until it is done.

## Rules that are easy to break

- **The live loop draws on demand.** Anything new that changes the picture
  must reach `invalidate()` — through a wrapped scene method, an input event,
  or a load `watchForChanges()` knows about. Otherwise it shows up late.
  And do not draw synchronously to make up for it: `applySelection()` did,
  and it was a third render per click.
- **A piece someone adds is hidden with `hidden: true`, never a new list.**
  Pedestals, furniture, free-standing walls and figures all carry it and are
  read through `isShown()`. Anything new that draws, packs, measures or lists
  them filters on it; a panel gets it for free through `wallSpec().enabled`.
- **Do not dispose a material in the booth group before its replacement has
  drawn.** That is what `this.retired` is for; disposing early recompiles
  every shader and was most of what an edit cost.
- Preserve schema-1 backup compatibility. Optional fields and widened enums are
  fine; changed meaning is not. `booth.panels` and the widened `a.wall` are the
  worked example; `WALLS_PHASE.md` explains how it was kept. The art-show
  booth added five more optional keys — `venue`, `artShow`, `lightBar`, `hall`
  and `pedestals` — the same way, and `lightBar.diffusion` later became a
  sixth, nested inside one of them. `artShowPanel()` / `lightBarSpec()` /
  `hallSpec()` are the only things that read any of them, so `undefined` means
  the defaults everywhere. The ground library then widened `booth.ground` from
  an enum of kinds to "a kind **or** `upload:<asset id>`" and added one
  optional key, `groundPreset` — a widened enum and an optional field, the two
  moves that are allowed. `booth.groundAsset` still opens and still shows its
  floor; `adoptGroundAsset()` reads it as the first library entry rather than
  dropping it.
- **Never narrow a stored range; widen the slider instead.** The schema is a
  promise to backups already on disk, so `finite(l.power, 0, 300)` stays 0..300
  even though the Fixture brightness slider now offers 0..70. A value past what
  the slider offers widens that slider for the one booth carrying it, rather
  than being clamped the moment the panel is drawn. `panelSlider`, `artSlider`,
  `personSlider` and `lightBarLevels` all make this move; it is the pattern.
  Widening a stored range — `diffusion` from 0..1 to 0..3 — is allowed, and is
  only safe because the old stretch of the curve was left bit-identical.
- **A view setting must never reach an export.** Fast edit, preview quality and
  the selection outlines are all about this machine, not about the booth.
  `export()` and `recordMp4()` each put full quality back before they draw a
  frame and restore it in a `finally`. A PNG with the shadows missing because
  of how someone's laptop felt that afternoon is not a booth drawing.
- **Never alter stored original image data.** Edits belong to placements.
  `asset.thumb` is the one derived thing an asset carries, and it is optional,
  regenerable and never read in place of `asset.data` by an export, a backup
  or the hanging guide. It is also what makes sharing assets by reference
  between undo snapshots safe: if an original could be edited in place, a
  snapshot naming it would not describe the project it came from.
- **Keep the images out of anything that runs per edit.** The undo history,
  the debounced save and the IndexedDB write all used to copy every uploaded
  original. `snapshot()` / `fromSnapshot()` in `src/main.js` and the two
  object stores in `src/storage.js` are how each of them stopped. A new
  per-edit copy of `p` should go through `snapshot()` rather than
  `JSON.stringify` or `structuredClone`.
- The city skyline must stay **seeded**, never `Math.random`: it rebuilds on
  every `update()` and would reshuffle on each edit. `tests/view-city.mjs`
  guards this.
- The app must run with `public/assets` empty. Every path falls back to
  procedural; keep it that way.
- Local-first: no accounts, backend, payments, sync or live AI calls.
- Do not modify the separate `yitzhach/commission` repo.

## Things learned the hard way

- **The whole `npm run test:view` chain now runs past ten minutes in the
  sandbox**, longer than one shell call may take, so a timeout there is a
  timeout, not a failure. Run the chain with the longest timeout, see which
  suite it stopped in, and run that one and the rest one by one, reading each
  exit status. And the test Chromium is launched `--single-process`, which
  allows one browser context: a probe that wants several viewport widths
  resizes one page (`setViewportSize`) rather than opening a context per size.

- **three leaves `shadowMap.needsUpdate` up when it does not draw a map** —
  with `shadowMap.enabled` false (fast edit), or with no light casting.
  Anything that reads the flag as "a frame is owed" then draws forever;
  `tick()` did, from the day on-demand drawing landed until 2026-09-23, and
  only in fast edit, which is why nobody saw it. It is cleared after every
  frame now. Test for this class of bug by counting
  `renderer.info.render.frame` over a quiet window, not by timing.
- **The idle-frames check in view-responsive failed two runs in three on an
  unchanged `main`.** `render()` in main.js resizes the viewport one
  animation frame after every edit, swiftshader can take over a second to
  hand out that frame, and its `invalidate` started the 15 s heartbeat inside
  the measured window. The check now lets it land first. If an idle check
  flakes, find the late invalidate (wrap `invalidate` and log a stack) before
  touching the loop.
- **`half` is a reserved word in GLSL ES.** A uniform or argument named
  `half` compiles on some drivers and not others; the drop-shadow shader says
  `extent`, and a node test refuses the word.

- **Headless Chromium hands an idle page about three animation frames a
  second.** Once the loop stopped drawing continuously, a change could wait
  ~400 ms for its frame here, and a camera preview's first frame could miss
  a one-second move entirely. Real browsers fire rAF at the display rate, but
  the loop now has a 50 ms timer behind every asked-for frame and a preview
  draws its first frame immediately. A test that reads a label or a pixel
  straight after a change still wants a short wait.
- **`this.frames` in scene.js is the map of wall frames** (`frameKey`), not a
  counter. The on-demand loop's counter is `framesOwed`; naming it `frames`
  broke every drag and was only caught by the e2e suite.
- **`tests/image-regression.test.js` slices scene.js from `updateArtwork(` to
  `setView(`** and evaluates the text. A method added between those two
  breaks it with a SyntaxError; put new methods elsewhere.

- **`tests/e2e.mjs` fails in this sandbox at the 4096 px PNG, and it fails on
  `main` too.** It waits 30 seconds for the download; a 4096 px render under
  swiftshader was measured at 27-31 seconds on `main` and 27-29 on the branch
  that added the export frames, so the suite is a coin flip on this machine
  and neither number is a regression. The other fifteen checks pass before
  it. **Measure both sides before believing this one** — a worktree at
  `origin/main` and the same probe is ten minutes and settles it — and raise
  that one wait if it becomes tiresome. It is the same class of flake
  `tests/environment.mjs` already carries, for the same reason.
- **A readback flushes the GPU; a captured video frame does not.** A still
  drawn twice "to be safe" cost a second 28-second render for nothing,
  because `canvas.toBlob` reads the pixels back and a readback waits for
  everything the GPU still owed. A video frame handed to `VideoEncoder` has
  no such barrier, which is why careful rendering belongs to the recorder and
  not to the PNG. Knowing which operation synchronises is the difference
  between a fix and a doubled bill.
- **An export that inherits the window's shape is not an export size.** Both
  the PNG and the MP4 read their aspect ratio off the canvas, and the code
  said so plainly — "height follows width, from the viewport" — which reads
  like fidelity to what was composed and is actually the browser window
  deciding what a delivered file is. The fix is not a resize afterwards: a
  16:9 file cropped to 9:16 has the booth cut out of it. The frame has to be
  chosen before the frame is drawn, and the camera set up for it.
- **A frame that is not the canvas's needs the camera told.** `setSize` alone
  stretches the picture, because `camera.aspect` still describes the old
  shape. It is set beside the size and restored in the same `finally`, which
  is the same rule the draft mode and the pixel ratio already follow there.
- **What is on the GPU when you read the canvas is not what you asked for one
  line earlier.** Rendering is asynchronous, so a frame captured immediately
  after its draw call can still carry the previous frame's backdrop pass,
  shadow map or a texture that finished uploading a moment too late. That is
  what "glitches on export" was. Drawing it twice with a yield between is the
  cheap, honest fix; it costs double and it is a setting for that reason.
- **A shadow that is lit is not a shadow you control.** The wall gap was
  invisible head-on because the thing that would cast it — a raking spotlight
  — is often diffused into a wash with no direction left in it, and because
  nine shadow maps cannot be spent on one batten. Drawing it as a card on the
  wall makes it three sliders instead of a lighting setup, puts it in every
  export, and costs one transparent plane per work.
- **Hiding is not deleting, and the difference is the aim.** A spotlight's
  position and target are the slowest thing in the app to get right, and
  deleting was the only way to take one out of a picture. One optional
  boolean, absent meaning showing, buys the whole feature and keeps every
  older backup.
- **A universal setting should be a rule, not a rewrite.** Painting every
  work's `edgeColor` on the way in would be a one-way door: switching the
  option off afterwards could not put back what each work carried. So the
  booth's colour answers for every work while the switch is on, each
  placement keeps its own, and the rewrite is a separate button that says
  what it does.
- **The system colour picker is a closed window.** Nothing can be added
  inside `<input type="color">`'s panel, so "save a colour in the picker"
  becomes a row of swatches under it. Worth knowing before designing around
  the native control.
- **A spherical backdrop is framed by field of view alone.** Moving the camera
  cannot pull it back, because the background is a lookup by view direction. So
  "the backdrop is too zoomed in" and "the backdrop is blurry" are one bug: a
  62 degree view of a 1024px equirectangular image puts about 176 source pixels
  across the whole canvas. It is now drawn in a pass of its own through a wider
  lens. That pass borrows `scene.background` into an empty scene rather than
  using a hand-written fullscreen shader, which is what keeps tone mapping and
  colour space identical to a one-pass render — and it puts `scene.background`
  back in a `finally`, because the live loop and `export()` both read it.
- **Never capture video from a live canvas.** `MediaRecorder` timestamps frames
  by wall clock, so a clip is only correct if every frame renders inside its
  33 ms. This booth does not, and the file comes out stuttering or in slow
  motion — the machine's performance baked into the artwork. Frames are
  rendered offline and given exact presentation times instead. The *preview*
  is deliberately the opposite: driven by wall clock, because a preview should
  take the seconds it claims even if it drops frames doing it.
- **Chromium is not Chrome for codecs.** H.264 is licensed, so open Chromium
  builds have no H.264 encoder. That is why there is a VP9-in-MP4 fallback, and
  why the browser suite can test the real pipeline at all.
- **A muxer is right or it produces a file nothing opens, with no middle
  ground.** `tests/video.test.js` parses its own output back and requires every
  box's children to fill it exactly. mp4box.js then caught what that missed: a
  `vpcC` three bytes short, because VP9's colour description is not optional.
  Validate against a parser you did not write.
- **`isConfigSupported` can hand back a config with fields dropped.** Losing
  `avc.format` would silently produce Annex B samples the muxer cannot wrap, so
  the returned config is merged over ours, never substituted for it.
- **UVs on tent panels are in metres, not 0..1.** A roof is ~3 m across and a
  valance 12 inches deep; with 0..1 UVs one weave is stretched ten times
  further on the valance. `repeatFor(tileMetres, 1)` is then the whole
  conversion. Walls use the same idea per axis, since a panel is wider than it
  is tall.
- **`SurfaceTextures` caches per id and clones per consumer.** `repeat` lives on
  the texture, so two surfaces sharing one texture object fight over scale.
  Clones share their image source, so a second consumer is a few objects, not a
  second upload. Loading claims a set; `release(consumer)` is how one leaves.
- **Quality is a supersampling factor, not a ceiling.** `min(devicePixelRatio,
  quality)` renders at 1x on the 1x monitor most desktops have, and edges
  stair-step however high the setting. `tests/render-scale.test.js` pins it.
- **What shears an equirectangular backdrop is the frame edge, not the lens.**
  The zoom floor was judged on a level camera, which is half the rule: the edge
  sits at |pitch| + fov/2, so a 135 degree backdrop lens is fine looking
  straight out and catastrophic tilted 12 degrees down — the top of the frame
  lands in the pole, where a whole row of pixels is one point, and the render
  comes back as radial smear. `BACKDROP_EDGE_LIMIT` states the rule where it
  lives, as an angle from the horizon, and the lens is narrowed per frame to
  respect it. A framing percentage on its own cannot prevent this, because it
  does not know the tilt.
- **The backdrop zoom floor is 25%, and 15% was tried and rejected.** Lower
  framing means a wider lens, and past about 25 an equirectangular lookup
  shears: the hall ceiling smears into radial streaks. The floor is a judgement
  made by looking at a render, which is exactly the kind of thing a later diff
  will "clean up" — `BACKDROP_FRAMING_MIN` carries the reason.
- **`backgroundRotation` is a YXZ Euler on purpose.** Pan and tilt are two
  axes of one tripod head; under three's default XYZ order a pan applied after
  a tilt rolls the image, and a rolled panorama reads as the entire hall
  leaning over. `tests/view-hdri.mjs` pins the order and asserts roll stays 0.
- **Figures are lit by the same spotlights as the artwork, so they were made
  darker than the walls.** A figure lighter than the panels blows out under a
  spotlight into a white post, and a white post beside a painting competes with
  it. Mid-grey, flattened front to back, with daylight between the legs: that
  gap is the whole difference between a person and a bollard at any distance.
- **A drag and a typed number must be one edit, through one function.** A
  panel's frame placement is three lines of trigonometry; having the drag
  carry its own copy would mean a dragged wall landing somewhere a typed wall
  would not. `placePanelFrame()` is called by the scene build and by
  `movePanel()`, and `tests/view-panels.mjs` drags a panel and then reads the
  mesh's world matrix against the number the drag stored.
- **Rebuilding the scene per pixel of a drag is not an option.** `update()`
  disposes and rebuilds everything. Artwork already had `updateArtwork()` for
  this; a panel got `movePanel()`, which is cheap only because everything a
  panel carries — its exterior frame, its posts, the art on both faces — is a
  child of the panel's own frame group.
- **A click target that big needs a first click that does nothing.** Selecting
  on the first click and dragging only once selected is what keeps a free-
  standing wall from being shoved across the floor by someone reaching for an
  orbit. The Move tool is the deliberate exception.
- **One lookup function is cheaper than six generalisations.** Three fixed
  walls were assumed in six places. Rather than teach each about panels,
  `wallSpec(p, key)` answers "what am I measuring against" for either kind and
  returns `null` for a wall that is gone — which every caller already knew how
  to treat, because it looks like a hidden wall.
- **A per-consumer texture cache leaks when a consumer can be deleted.** Walls
  claim their set under `wall:<key>`, and the three perimeter walls are
  forever. A panel is not, so `surfaces.releaseMatching()` now hands back every
  `wall:` claim that is not in the current wall list on each rebuild.
- **A test that passes because the app was slow will fail when it gets
  faster.** `tests/view-textures.mjs` asserted that the grass floor keeps its
  procedural canvas "without files" — but grass ships files, and the
  assertion only held because the real set had not finished loading inside a
  300 ms wait. Making selection stop rebuilding the scene freed the main
  thread and the load landed in time, so a correctness improvement read as a
  regression. It now asserts that grass binds its own set. Before believing a
  browser failure, check whether the assertion was true for the reason it
  claims.
- **That suite's temporary `publicDir` is not served.** Its header said
  fixtures came from a temp directory and the repository's `public/assets`
  was untouched. The second half is true; the first is not — this vite server
  ignores the inline `publicDir` and serves the committed assets, so the sets
  those tests exercise are the real ones. Harmless, now written down, and the
  reason the grass case could not simply be "delete the files".
- **The video suites' preview flakiness was fixed, not re-run.** They read the
  camera 220-250 ms after starting a preview and asserted it had moved; under
  swiftshader the first frame can take most of a second, so the read landed
  before the move began. They now sample from inside the preview's own
  progress callback, which only fires once a frame is drawn. If you write a
  browser assertion timed against wall clock in this repo, expect it to fail
  here at random — time it against something the renderer did instead.
- **`tests/environment.mjs` is still flaky in this sandbox**, and it is not a
  regression to chase. All three
  Its assertions are timed against wall clock — a 4096px export must finish
  inside 30s — and swiftshader is slow enough to miss that at random. Re-run
  before believing it.
- **Figures are in the exports, whatever `people.js` used to say.** Its comment
  claimed they were hidden from the PNG and the video "the way the grid and
  handles are", but `export()` and `recordMp4()` hide `isLineSegments` and
  `userData.editorOnly`, and a figure is neither — it carries `userData.person`
  and nothing reads it. That is the right behaviour, since a scale reference
  earns its keep in a render, but it means **Layout -> People -> Show the
  figures is the only way to take one out of an export**. The comment now says
  so. A comment describing behaviour is worth checking against the code that
  implements it before you rely on it.
- **Toggling `shadowMap.enabled` under a built scene does nothing on its own.**
  Whether a material samples a shadow map is compiled into its program, so the
  booth goes on drawing the shadows it was compiled with, and switching them
  back on leaves them missing. Every material needs `needsUpdate` on the way in
  and on the way out. One recompile on a button press is a hitch nobody minds;
  the bug is thinking it is free, and doing it per frame.
- **A preset id is not a preset property.** The rule switching an art-show
  booth's hall off in a photographed environment was written `value !==
  "studio"`, which was correct for exactly as long as studio was the only
  preset without an HDRI. The moment trade show became a white hall of its own,
  a booth standing in a white hall had its white hall switched off. Ask the
  preset what it *is* — `preset.hdri` — not which one it happens to be.
- **The folder name was the only thing that said "trade show".** The
  burnt-warehouse HDRI lived in `assets/hdri/tradeshow/` and its own
  `meta.json` had said *Burnt Warehouse* since the day it was generated. Brick
  and girders behind seamless white art-show walls was reported as a bug in the
  booth; it was a bug in a directory name. If an asset carries provenance, read
  it before trusting the path it sits at.
- **A neighbour booth is this booth's size.** Three hardcoded 120-inch shells
  meant a 10 x 20 stand was measured against 10 x 10 neighbours, and — because
  the gap is measured to the neighbour's centre — a booth of any other depth
  also put them at the wrong distance. The one behind is turned 180 degrees:
  it opens onto the next aisle, so what you see over your own back wall is the
  back of a booth, not the inside of one.
- **A test literal must come from the old code, not from your head.** The
  piecewise diffusion curve is pinned by writing out the values the 0..1 table
  produced *before* it was widened. Two of those were computed by hand and one
  was wrong by 0.02 radians, which the test caught on its first run — which is
  the point: checking a curve against itself would have passed whatever the
  curve became.
- **A 25 MB string is not free, and `JSON.stringify` will not say so.** The
  undo history stringified the whole project on every edit, `p.assets` holds
  every uploaded original as base64, and thirty-five entries are kept. Nothing
  about that is visible in the line that does it — `history.push(JSON.stringify(p))`
  reads like bookkeeping. It was the most expensive thing the app did, it cost
  exactly what someone's own artwork weighed, and it is why a booth of sample
  panels always felt quick while a booth of photographs did not. When a
  structure holds both a layout and its payload, say which one you are
  copying.
- **Decode to the size you are about to draw.** An `<img>` handed a data URL
  unpacks the whole thing — 100 megapixels, if that is what was uploaded —
  and shrinking it afterwards on a 2D canvas has already paid for the bitmap
  you threw away. `createImageBitmap(blob, { resizeWidth, resizeHeight })`
  does it inside the decoder and off the main thread. The catch is
  orientation: ask for `imageOrientation` and you must also set
  `texture.flipY`, and getting that pair wrong turns every artwork upside
  down. Ask for neither and it matches what an `<img>` gave.
- **An asset store is not a schema change; an asset *order* is.** Splitting
  IndexedDB into a layout record and one row per image made a reload
  reassemble `p.assets` in the store's key order rather than the order they
  were added — and the ground picker lists uploaded floors in exactly that
  order. The test that caught it compares `JSON.stringify(project)` across a
  reload, which is worth keeping for that reason alone: it fails on things
  nobody thought were observable. The order is stored beside the layout and
  spent on the way in, so the project itself never carries a key schema 1 has
  not heard of.
- **A slider does not have to be the number underneath it.** Fixture
  brightness is a percentage where 50 is a bar that reads right; the stored
  unit is a light's power and the schema still accepts 0..300. `data-scale`
  on the input is the whole mechanism, converted where a control's value
  becomes a number — one place, so nothing downstream ever sees a slider
  point. The temptation is to rescale the stored values instead, which would
  be a changed meaning and would relight every booth already saved.
- **The tent weave is exaggerated 3x** over its literal depth. A true-depth
  weave on a white, brightly lit, tone-mapped roof is invisible. That is a
  rendering choice, not a measurement, and it is commented as one.

## Read map

- `README.md` — commands, architecture, stable behavior.
- `PBR_PHASE.md` — HDRI lighting and PBR surfaces, and what each phase found.
- `WALLS_PHASE.md` — free-standing interior walls: the schema-compatibility
  problem and every decision taken around it.
- `ART_SHOW_PHASE.md` — the indoor art-show booth: the venue switch, why the
  light bar is scenery rather than spotlights, why the panel module does not
  own the walls, and what still needs eyes.
- `src/camera-path.js`, `src/video.js` — the camera moves and the MP4 writer.
  Both carry their reasoning in comments; neither needs a phase document.
- `CUSTOM_VIDEO_PHASE.md` — custom video mode: the keyframe model, why speed is
  expressed as time, and why the fade is drawn rather than exposed.
- `src/timeline.js`, `src/flare.js` — the keyframe sampler and the flare's
  arithmetic. Both pure, both covered in Node.
- `src/people.js` — the figures, their canon proportions and their defaults.
- `applySelection()` / `renderSelection()` — what a click costs, in
  `src/scene.js` and `src/main.js`. Read both before making selection do
  anything more; they exist to keep a rebuild out of a click.
- `GROUND_LIBRARY_PHASE.md` — presets and uploaded grounds as one list: the
  widened `booth.ground`, why the library is a filter over the assets rather
  than a second list, and how an older backup's override is adopted.
- `src/framing.js` — the shape of a delivered file: one pure function that
  answers for a still and a clip alike, and why the camera is told about it.
- `src/dropshadow.js` — the two drawn drop shadows on Photoshop's five
  controls, the exact blurred-rectangle maths (and its GLSL twin), and how
  the first version's `booth.dropShadow` is still read. `shadowMaterial` /
  `placeShadow` / `updateShadows` in `src/scene.js` draw them.
- `src/swatches.js` — the seven saved colours and the Previous button.
- `src/adaptive.js` — Auto preview quality's rule. `startLoop` / `tick` /
  `invalidate` / `watchForChanges` in `src/scene.js` are the on-demand loop;
  `disposeGroup` / `releaseRetired` keep shaders across a rebuild.
- `src/measure.js` — tape and plan-dimension arithmetic; `refreshGuides` and
  `placeAnnotations` in `src/scene.js` draw them.
- `src/furniture.js` — the furniture shapes; `FURNITURE` in `src/model.js`
  is the list and its default sizes.
- `src/arrange.js` — even spacing, the 60″ hang line, arrow nudges.
- `src/quickstart.js` — Quick start and user templates.
- `src/showpack.js` — the show pack: floor plan, inventory, checklist.
- `src/toolsearch.js` — tool search's ranking; the index is built in main.js
  from each tab's `inspectorHTML()`.
- `src/tier.js` — Lite and Pro: the one table of Pro features and `can()`.
  `gated` / `proLock` and the action gate in `src/main.js` use it.
- `src/hall.js` — the hall planner (layout, totals, map, CSV);
  `src/power.js` — the power and rentals sheet.
- `src/clearance.js` — clearance geometry; `src/elevations.js` — the
  to-scale drawings. `buildUnderlay`, `buildModels`, `exportGLB` and the Box
  tool (`setDrawingBox`) are in `src/scene.js`.
- `src/views.js` — saved views, tags and walk mode's rules; `applyTags` and
  `startWalk` / `walk` / `stopWalk` in `src/scene.js` do the work.
- `src/guides.js` — smart guides' snapping arithmetic; `showSnap` in
  `src/scene.js` draws it. `src/align.js` — align and distribute.
- `FUTURE_BUILD.md` — requested, deliberately not started. Currently empty.
- `docs/HDRI-ASSETS.md`, `docs/TEXTURE-ASSETS.md` — adding asset files.
- `AI_EXPORT_PHASE.md` — only for AI-export implementation.
- `docs/ORIGINAL-HANDOFF.md` — historical; ignore unless you need old
  requirements.
