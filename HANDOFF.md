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
- **State: the fork.** The code is still the booth app, renamed. Phase 1
  below is what turns it into a house.

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

1. Strip the cut features; the rooms model (`project.rooms`); doors, windows,
   archways and stairs; a new schema 1 for homes.
2. Furniture set and materials per wall, floor and ceiling.
3. Wall photo, manual four-corner straightening.
4. Fixtures and daylight.
5. The AI Worker: wall mapping and material help.
