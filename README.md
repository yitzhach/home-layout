# Artist OS · Booth Studio

Measured 3D art-show booth planning in the browser. Artists can arrange original artwork on interior or exterior booth walls, edit presentation details, add lighting and surroundings, and export booth images or hanging guides.

- Repository: https://github.com/yitzhach/booth-studio
- Live app: https://booth-studio.bobdylan2000.workers.dev
- Production branch: `main`
- Separate project: do not modify `yitzhach/commission`.

## Local development

Requires Node 22+.

```sh
npm ci
npm test
npm run build
npm run dev
```

Cloudflare builds from `main` using `npm run build` and `npx wrangler deploy`. Non-production branch builds are enabled. Cloudflare Access is off.

## Current behavior

- Booth sizes, back/left/right walls, free-standing interior walls you can click and drag across the floor, four tent forms, lighting and procedural/photo surroundings.
- Two booth venues. The **Art show** tool switches the booth to an indoor convention booth: seamless white pro-panel walls (144″ back, 120″ sides, 144″ tall by default), no canopy, a light bar across the front carrying nine directional heads that spot each wall, and an optional white exhibition hall with 30 ft ceilings and neighbouring booths. Booth dimensions, wall dimensions and the individual display panel (38″ by default) are all typed in inches, and the walls can be rebuilt from the panel module. See `ART_SHOW_PHASE.md`.
- The **Walls** tool holds everything that stands on the booth floor: free-standing display walls, and pedestals (44″ × 12″ × 12″ by default, solid top, for cards, a tablet or a guest book). Double-click a pedestal in the booth to pick it up, then drag it across the floor or use its sliders. Both are measured in inches from the centre of the floor.
- Environment presets light the booth from an HDRI and can supply a photographed backdrop; without those files a preset keeps the procedural surroundings. See `docs/HDRI-ASSETS.md`.
- Ground surfaces (studio, grass, concrete, asphalt, carpet, wood) use real PBR texture sets when their files are present, tiled from the surface's real-world size; otherwise the procedural canvas ground. See `docs/TEXTURE-ASSETS.md`. Your own
  top-down photographs join the same picker as a second group and are chosen
  the same way; selecting a preset always switches the floor back.
- Dragging artwork snaps to 1 inch by default; the Snap 1″ toolbar button turns it off for fine placement.
- Perspective orbit reaches ground level for low looking-up views; the floor plane, not a fixed angle, is the limit.
- Urban horizon builds a seeded three-ring skyline with textured facades, lit windows, setbacks and rooftop clutter.
- Neighbor layouts: inline, either corner, or island, with side/rear spacing.
- Original Panels is a reusable source library. Clicking or dropping creates another placement; the original remains.
- Artwork can hang on all six back/left/right interior and exterior faces.
- Double-click/tap artwork to adjust it. Drag the body to move it.
- Corner handles scale proportionally; middle-edge handles stretch width or height.
- Scale slider responds live; keyboard arrows change it in 1% steps.
- Artwork thickness, wall gap, and plain/concrete/wood/metal edge finishes with color.
- Non-destructive rotate, flip, exposure, contrast, saturation, temperature and tint.
- Image-edit preview is live; edits can be copied and pasted between placements.
- Artist signs and small artwork labels use the same wall-placement system.
- PNG exports at 2048/4096 px and printable measured hanging guides. A guide also lists any pedestals and, for an art-show booth, every light-bar fixture and what it is aimed at.
- People for scale: stylised figures at real heights — 5′6″ and 6′0″ by default, each editable — placed from Layout → People. `src/people.js`.
- Spotlight housings hide themselves under an indoor environment preset, where the hall's own track lighting is already in the picture. Lighting → Spotlight fixtures overrides it either way; the rail always stays.
- Custom video mode: a timeline of your own keyframes, each captured from the viewport, with per-keyframe time, hold and ramp, fade in and out, and an optional lens flare that tracks the camera. It renders through the same `(t) -> pose` contract the fixed moves do, so the encoder and the muxer are untouched; see `CUSTOM_VIDEO_PHASE.md`.
- MP4 video export: five eased camera moves (orbit, push in, reveal, survey, Ken Burns) at 720p/1080p/1440p and 24/30/60 fps. Frames are rendered offline and encoded with WebCodecs, so the clip runs at the chosen frame rate regardless of how fast the machine renders. H.264 where the browser encodes it — with the level derived from the frame size and rate — and VP9 in MP4 where it does not; see `src/video.js`.
- The export panel probes and states which codec the browser will use *before* rendering, and warns when it falls back to VP9, which QuickTime Player cannot open.
- Preview the move live in the viewport at its real duration, without rendering anything.
- A spherical backdrop is drawn in its own pass through a wider lens than the camera's, because field of view alone frames an image at infinity. Backdrop framing, in Layout → Surroundings, controls it. Because that wider lens compresses the same pitch, the horizon is locked to the floor by default — an on/off beside the framing controls.
- Projects autosave locally in IndexedDB; downloadable backups include original images.

## Important constraints

- Preserve the implementation; extend it rather than rebuilding.
- Original artwork data must remain unchanged. Edits are stored per placement.
- Keep optional schema-1 fields backward-compatible with existing backups.
- No backend, accounts, sync, payments or AI calls are active.
- WebGL2/hardware acceleration is required for the 3D canvas.
- Local browser storage can be cleared or evicted; users should download backups.
- Preview artwork textures are capped at 2048 px for device stability.
- 4096 export depends on the device GPU/canvas limit.
- Video export needs the WebCodecs `VideoEncoder`. Chrome, Edge and Safari 16.4+ have it; the panel says so plainly where it is missing rather than failing after a render.
- H.264 is licensed, so open Chromium builds have no H.264 *encoder* and fall back to VP9. The H.264 branch of the muxer has therefore never been produced on real hardware in this sandbox — see `HANDOFF.md`.
- The two shipped HDRI backdrops are 1024x512, because they were prepped from Poly Haven's 1K sources and `tools/hdri-prep.mjs` will not stretch a backdrop past its source. They read soft. Re-prepping from the 4K download is the fix and needs network access to polyhaven.com.
- Tent and environment models are visual approximations, not certified products.
- Photo panoramas are backdrops, not reconstructed geometry. Environment presets do light the booth from an HDRI, when its files are present.
- Limits: 200 placements, 250 assets, 25 MB/image, 200 MB imported backup.

## Architecture

- `src/main.js`: interface, actions, inspector and undo/redo.
- `src/model.js`: schema validation, geometry and wall constraints. `wallSpec()` answers for a perimeter wall and a free-standing panel alike; every wall lookup goes through it.
- `src/scene.js`: Three.js booth, artwork interaction, lighting, the backdrop pass, and image and video export.
- `src/timeline.js`, `src/flare.js`: custom camera timelines and the lens flare's arithmetic. Pure, and covered in Node.
- `src/camera-path.js`: the filmic camera moves. Pure geometry — no three.js, no DOM — so every move is covered in Node.
- `src/video.js`: the MP4 muxer and the WebCodecs encoder that feeds it. `muxMp4` is pure bytes-in, bytes-out. The H.264 level is computed from the frame size and rate against the spec's macroblock limits, not assumed.
- `src/lighting.js`: environment presets, HDRI image-based lighting and backdrops.
- `src/surfaces.js`: PBR ground texture sets, colour space, tiling and disposal.
- `src/texture-cache.js`: source/edit-keyed GPU texture reuse.
- `src/image-edit.js`: non-destructive Canvas adjustments.
- `src/edge-material.js`: procedural artwork-edge finishes.
- `src/environment.js`: tents, ground, sky, city backdrop and neighboring booths.
- `src/photo.js`: 2D booth-photo composition.
- `src/storage.js`: IndexedDB, image loading and downloads.
- `src/signage.js`: sign/label textures.
- `src/guide.js`: printable inside/outside hanging guides.
- `tools/hdri-prep.mjs`: converts an HDRI into a preset's `light.hdr`/`bg.jpg`.
- `tools/texture-prep.mjs`: converts an ambientCG download into a ground texture set.
- `tests/`: Node and browser regression checks.

## Verification

Run `npm test` (162 tests) and `npm run build` for every change. When a WebGL-capable browser is available, also run `npm run test:browser`, `npm run test:view`, and `node tests/wall-assets.mjs` — all three are green. In the cloud sandbox, prefix them with `BOOTH_TEST_CHROMIUM=/opt/pw-browsers/chromium`. Test desktop plus iPhone/iPad interaction and a 4096 export.

For a new development chat, read only `HANDOFF.md` first. Read this file when commands or architecture are needed. Read `PBR_PHASE.md` when working on HDRI lighting or PBR surfaces, `docs/HDRI-ASSETS.md` and `docs/TEXTURE-ASSETS.md` to add the asset files, and `AI_EXPORT_PHASE.md` only when implementing the paid AI export phase. `docs/ORIGINAL-HANDOFF.md` is historical reference, not current instructions.
