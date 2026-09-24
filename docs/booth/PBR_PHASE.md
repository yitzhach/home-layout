# Photoreal Phase — HDRI lighting + PBR surfaces

Read this file (and `HANDOFF` only if you need project-wide context) before
starting any photoreal work. It is written so a fresh chat can pick up one
phase without re-reading the codebase.

## Goal
Blender-grade realism in the existing three.js app: image-based lighting from
HDRIs, photoreal backgrounds, and real PBR texture sets for ground/tent/walls.
Artwork colour fidelity must survive it.

## Hard constraints discovered (do not re-derive)
- **Agent sessions cannot download assets.** The egress proxy blocks
  `polyhaven.com`, `api.polyhaven.com` and `ambientcg.com` (CONNECT 403).
  The user downloads and uploads/commits every binary. `registry.npmjs.org`
  *is* reachable, so devDependencies can be installed.
- **No image tooling in the sandbox**: no ffmpeg, ImageMagick, cwebp, oiiotool,
  imageio. Conversion needs a Node script (see Phase 1) or the user's Mac.
- **A 4K `.exr` is ~24 MB and is not shippable.** Split the job:
  - *lighting*: 1K `.hdr` (~1–3 MB) → PMREM → `scene.environment`
  - *visible backdrop*: 2K/4K tonemapped `.jpg`/`.webp` (~0.5–2 MB) →
    `scene.background` as an equirect texture
  One 4K HDR for both is the naive route and costs ~10× the bytes.
- Workers assets cap at 25 MiB per file; the repo should not become an asset
  store. If total assets pass ~50 MB, move them to R2 and load by URL.
- Deployment: only a push to `main` reaches production (see HANDOFF).

## What already exists (reuse, do not rebuild)
- `src/scene.js`: `ACESFilmicToneMapping`, exposure `1.15`, PCFSoft shadows
  with `autoUpdate=false` (call `renderer.shadowMap.needsUpdate = true` after
  any light/material swap).
- `src/scene.js:~194`: `booth.surroundAsset` already sets `scene.background`
  to a user 360 image with `backgroundRotation` from `booth.surroundRotation`.
  **HDRI backdrops should extend this path, not replace it.**
- `src/environment.js`: `groundTexture(kind)` builds procedural canvas ground
  (`grass|concrete|asphalt`) and the seeded city skyline. These stay as the
  zero-download fallback when an asset is absent.
- `src/texture-cache.js`: `TextureCache` is keyed on `(id, edits)` for artwork
  placements. Environment textures need their own small cache/dispose path;
  do not force them through this one.
- Ground is a 180 m plane at `y = -0.045`; booth units are inches (`IN`).

## Phases

### Phase 1 — IBL plumbing, no assets — **DONE**
Shipped in `src/lighting.js` + wiring. What exists now:
- `ENV_PRESETS` (`studio`, `tradeshow`, `artfair`, `home`), `EnvironmentLighting`
  (PMREM, revision-guarded swaps, disposal), `artEnvIntensity`.
- Layout → Surroundings gains **Environment** and **Artwork colour** selects;
  `booth.envPreset` / `booth.artFidelity`, both defaulted, so old backups load.
- Picking a preset also moves `ground` and `horizon` to its defaults.
- `requireAsset()` HEADs every asset first: a missing file is answered with
  index.html and a 200 by both vite and the Worker, and RGBELoader throws from
  inside its own callback on that HTML. Do not remove this guard.
- Artwork fidelity is `envMapIntensity` 0/1, not MeshBasicMaterial: Basic would
  also discard the lighting studio's spotlights.
- Tests: `tests/lighting.test.js` (10 node tests), `tests/view-lighting.mjs`
  (browser; now part of `npm run test:view`).

Original scope, for reference:
- `src/lighting.js` (new): PMREM generator, `applyEnvironment(scene, source)`,
  dispose of the previous env RT on every swap.
- Preset registry `{ id, label, hdri, background, ground, exposure,
  envIntensity }`; a `studio` preset that uses the current procedural look so
  nothing regresses when assets are missing.
- Per-preset `renderer.toneMappingExposure` and `scene.environmentIntensity`.
- **Artwork fidelity toggle**: "accurate colour" (artwork material ignores IBL
  — `MeshBasicMaterial`, or Standard with `envMapIntensity: 0`) vs "scene
  lighting". Default to accurate; this is the product's whole point.
- Tests: preset resolution, fallback when an asset 404s, exposure applied,
  no env leak across swaps. Must pass with zero binary assets present.

### Phase 2 — HDRI backdrops — **DONE** (code; assets still to supply)
Everything that can be built without downloading a binary is shipped and
tested. **The only thing left is the user dropping real HDRIs into
`public/assets/hdri/<preset>/` — see `docs/HDRI-ASSETS.md`.** Until then every
preset still falls back to the procedural sky, exactly as in Phase 1.

What exists now:
- `tools/hdri-prep.mjs`: `node tools/hdri-prep.mjs <source.hdr|.exr> <preset>`
  → `light.hdr` (1K RGBE, run-length encoded by hand), `bg.jpg` and
  `meta.json`. Reads `.hdr`/`.exr` through three's loaders in Node, area-average
  downsample, no native dependencies (`jpeg-js`, not `sharp` — pure JS installs
  reliably in the sandbox and only the encoder was ever needed).
- `docs/HDRI-ASSETS.md` and `public/assets/hdri/README.md`: what to download
  from Poly Haven, where it goes, the size budget.
- `presetPaths()` gained `meta`; the backdrop's rotation and headroom are wired.
- Tests: `tests/hdri-prep.test.js` (14 node tests, including an RGBE round-trip
  back through three's own loader), `tests/view-hdri.mjs` (browser, generates
  fixture assets with the tool and drives the full path with assets present —
  the one thing `view-lighting.mjs` structurally cannot cover). Added to
  `npm run test:view`.

Discovered here, do not re-derive:
- **three tone-maps `scene.background`.** The background shaders include
  `<tonemapping_fragment>`, so an already tone-mapped JPEG — which is what any
  ordinary image viewer wants, and what a downloaded backdrop JPG is — goes
  through ACES twice and reads flat. `hdri-prep` therefore writes *linear* radiance divided by a measured
  headroom `K`, records `K` in `meta.json`, and the app multiplies it back
  through `scene.backgroundIntensity` — which the shader applies *before* tone
  mapping, so the division cancels exactly. No `meta.json` ⇒ `K = 1` ⇒ the
  ordinary double-tone-mapped backdrop. Never "fix" this by pre-tone-mapping.
- **`RGBELoader` is deprecated in three r180** and warns on every construction.
  `HDRLoader` is the same parser under a new name; the app uses it.
- **`apply()` used to reload on every `update()`.** Harmless with no assets (a
  404 HEAD), a stall once real ones exist: PMREM on every slider tick. It now
  short-circuits an unchanged preset and just re-seats the background, which
  `environment()` overwrites on each update.
- Reset `backgroundRotation`/`backgroundIntensity` *before* the loaders run,
  not after: the cached path applies rotation synchronously and a later reset
  would wipe it.
- The rotation control is shown for `surroundAsset || preset.hdri`, so a preset
  backdrop turns with the same field a user panorama uses.
- three's `EXRExporter` → `EXRLoader` round-trip only agrees with itself under
  `ZIPS`; the exporter's default `ZIP` does not read back. That is a test-fixture
  detail — real Poly Haven EXRs go through the loader, which is fine.
- `tests/e2e.mjs` was red before any of this, for stale selectors. Repaired in
  Phase 3 along with `tests/wall-assets.mjs`; both are green now.
- The sandbox's Chromium (1194) is older than the pinned Playwright wants, so
  every browser test needs `BOOTH_TEST_CHROMIUM=/opt/pw-browsers/chromium`.

Original scope, for reference:
- User supplies per preset, from polyhaven.com (CC0):
  `light.hdr` at **1K** and `bg.jpg` at **2K or 4K**.
  Sample already uploaded: `industrial_pipe_and_valve_01` (4K EXR) — re-download
  at 1K HDR rather than converting it.
- Layout: `public/assets/hdri/<preset>/light.hdr`, `.../bg.jpg`.
- `RGBELoader` → PMREM → `scene.environment`; separate `TextureLoader` for
  `bg.jpg` with `EquirectangularReflectionMapping` + `SRGBColorSpace` →
  `scene.background`. Keep `backgroundRotation` wired to `surroundRotation`.
- Optional tool `tools/hdri-prep.mjs` if the user wants to convert their own
  EXRs in-repo: three's `EXRLoader` parses the buffer in Node, downsample,
  write RGBE `.hdr` by hand, encode the JPEG with `sharp` (devDependency).
- Presets to start: `tradeshow` (warehouse/studio), `artfair` (park/urban),
  `home` (interior).

### Phase 3 — PBR ground — **DONE** (code; assets still to supply)
Same shape as Phase 2: everything buildable without downloading a binary is
shipped and tested. **What is left is dropping ambientCG sets into
`public/assets/textures/<kind>/` — see `docs/TEXTURE-ASSETS.md`.**

What exists now:
- `src/surfaces.js`: `SURFACE_SETS`, `SurfaceTextures` (load, cache, apply,
  dispose), `repeatFor()`. Colour is the only sRGB map; normal/rough/ao stay
  linear; every map shares one repeat and anisotropy; `uv1` is added to the
  ground geometry when an `aoMap` is bound.
- `tools/texture-prep.mjs`: points at an unzipped ambientCG folder, picks the
  four maps out by their own naming, **copies** them (no re-encode, no quality
  loss) under `color/normal/rough/ao`, and writes `meta.json` with the tile
  size, the normal convention and the credit. `--size` resamples, JPEG only.
- Ground kinds `carpet` and `wood` added (model enum widened — adding values
  keeps old backups valid). Trade show halls are carpeted; the option was
  missing.
- `docs/TEXTURE-ASSETS.md`.
- Tests: `tests/surfaces.test.js` (15), `tests/texture-prep.test.js` (16),
  `tests/view-textures.mjs` (browser, generates a real set and drives the real
  ground mesh). All three suites in `npm test` / `npm run test:view`.

Decisions worth keeping:
- **JPG, not WebP.** The phase notes called for WebP, but nothing in the sandbox
  can encode it (no native tooling, and a pure-JS encoder is not worth writing),
  while ambientCG ships JPG directly. A 1K-JPG set is 1–2 MB, which fits the
  budget with room to spare. `meta.json` names the files, so a `.webp` set
  converted on the user's Mac drops in without a code change.
- **Tile size lives in `meta.json`, not in the UI.** `repeat` is computed as
  `180 / tileMetres`, so surfaces stay the same scale as each other. The
  existing "Ground tile size" control stays a user-upload feature; exposing it
  for PBR sets would invite exactly the mistake the physical size prevents.
- A DX normal map is flipped with `normalScale.y = -1` rather than rejected or
  re-encoded. That is the entire DX→GL conversion, and it is free.
- The cache owns its maps and sets `material.userData.ownedMap = false`, because
  `disposeGroup()` in `scene.js` disposes a material's `map` when that flag is
  set — and these outlive every rebuild.

Original scope, for reference:
- ambientCG (CC0), 1K or 2K, **NormalGL not NormalDX**, converted to WebP:
  `Concrete034`, `Asphalt026`, `Grass004`, `Carpet013`, `WoodFloor051`,
  `Fabric063`, `Bricks075`.
- `public/assets/textures/<name>/{color,normal,rough,ao}.webp`.
- Material factory: only `map` gets `SRGBColorSpace`; normal/rough/ao stay
  linear. `aoMap` needs a `uv1` attribute or it silently does nothing.
- `repeat` derived from real-world tile size (a 2 m tile on the 180 m plane is
  `repeat.set(90, 90)`) — compute it, do not hardcode per surface.
- Anisotropy from `renderer.capabilities.getMaxAnisotropy()` (already used for
  artwork in `scene.js`).
- Dispose every map on preset swap.

### Phase 4 — Tent, walls, polish
- **PBR canvas on the tent fabric is done.** `public/assets/textures/canvas/`
  textures the roof and valances, replacing the procedural `fabricWeave` bump
  when the files are there; `docs/TEXTURE-ASSETS.md` says which asset to get.
  What made it work is worth keeping in mind for the walls:
  - Tent geometry now lays its **UVs out in metres**, not 0..1. Every panel is
    a different real size — a roof is ~3 m across, a valance 12 inches deep —
    so 0..1 UVs stretched one weave ten times further on the valance than on
    the roof. In metres, `repeatFor(tileMetres, 1)` is the whole conversion,
    which is the same rule the ground uses with a span of 180 instead of 1.
  - `surface()` marks its meshes `userData.fabric`, which is how scene.js
    finds the panels and leaves the steel frame alone.
  - The procedural weave moved to 4 repeats per metre to match, so the
    asset-free tent looks as it did but with a consistent weave everywhere.
- Still to do: brick/plaster options for the `home` preset walls.
- Contact-shadow / shadow-bias tuning under IBL; verify the 2048/4096 export
  path still renders the env and background correctly.
- Reuse `src/surfaces.js` rather than writing a second material factory: it
  already loads, caches, colour-spaces and disposes a set. **The two things
  that needed adding first are done.** `SurfaceTextures` now caches per id and
  hands each consumer its own clones:
  - `load(id, consumer)` and `applyTo(mesh, set, {consumer, planeMetres})`.
    `GROUND_CONSUMER` is the ground; name the tent something else and it gets
    its own `repeat` over the same upload, because clones share a `source`.
  - Loading is what claims a set, not applying it. A load that lands after the
    user has moved on would otherwise cache a set nothing ever binds — there is
    a test for exactly that race.
  - A set lives while at least one consumer claims it, so `release(consumer)`
    is how a consumer leaves: the studio floor and a user's own ground
    photograph both go through it. Forget that call and the set stays on the
    GPU with nothing drawing it.
  - Sets are still evicted the moment nobody holds them, so swapping ground
    kinds back and forth reloads, exactly as before. If that becomes annoying,
    a bounded idle cache is the change — it was left out deliberately, since
    five sets of four 1K maps is real memory on a phone.
- Tiling repetition on the 180 m ground plane is visible at a low camera. If it
  bothers you before the tent does, that is the polish to do first.

### Phase 5 — Budget and licensing
- Resolution tiers: 1K env + 2K bg on mobile, 2K/4K on desktop; lazy-load
  assets on first use of a preset, never at boot.
- `CREDITS.md` listing every Poly Haven / ambientCG asset pulled (both CC0, no
  attribution required, but keep the record).
- Measure: first-paint bytes must not regress for the default studio preset.

## Working rules for this phase
- One phase per chat. Start by reading this file only.
- Never commit an asset over ~4 MB without saying so in the commit message.
- Keep the procedural fallback working: the app must run with `public/assets`
  empty.
- Do not alter stored original image data (project-wide rule).
