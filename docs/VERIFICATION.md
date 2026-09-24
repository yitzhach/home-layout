# Prototype verification

## Passed

- Production Vite build, including local font assets.
- Six core tests: inch/metre geometry, side-wall bounds, versioned backup validation, image aspect fidelity, projective photo mapping, and safe guide output.
- Eighteen browser integration checkpoints in `tests/e2e.mjs`, using headless Chromium with software WebGL:
  - Measured 3D startup with six sample panels.
  - First engineering checkpoint with an uploaded 36 × 48 image; changing thickness, wall gap, and spotlight power changed rendered pixels. Repeated at mobile viewport.
  - Six original-image uploads and side-wall numeric placement.
  - Aspect mismatch warning and explicit proportional correction.
  - Side-wall dragging, 1-inch snapping, and numeric coordinates agree.
  - One-step drag undo/redo; artwork duplication/removal.
  - Booth presets and canopy modify geometry.
  - 4096px 3D PNG export and editor selection restoration.
  - Separate photo artwork layer; corner perspective manipulation.
  - Photo lighting and 4096 × 5461 export from a portrait source.
  - All-assets backup/import restores full state.
  - Reload and actual browser close/reopen restore IndexedDB state.
  - 390 × 844 touch viewport and 820 × 1180 tablet layout; all control tabs accessible, no horizontal page overflow.
  - No uncaught browser errors in the completed integration run.
- Visual review of desktop, tablet, and mobile screenshots. A resize issue found on tablet was corrected: perspective camera distance now compensates for narrow viewport aspect ratios. Follow-up checks verify that all eight booth footprint/height corners remain inside the viewport on desktop, tablet and mobile.
- Targeted invalid-dimension and simulated storage-failure recovery checks.

## Scope of evidence

The uploaded images used in automated checks are colored, labeled test fixtures, not Isaac's actual artwork. No actual artwork source files were supplied with the handoff. The design reference PNGs are visual concepts only and are not used as the working scene.

Tests used headless Chromium and a software graphics renderer. They do not establish performance on a physical older iMac, physical iPhone, Safari, or a broad device matrix. Check those during the real trial. Clean exports use the same scene; no AI-rendered booth substitutes are involved.

## Repeat

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

`BOOTH_TEST_CHROMIUM` may point at a compatible browser executable when the standard Playwright download is unavailable. Generated screenshots, exports, and test backups go into ignored `test-results/`.

## Tent/environment update
- Seven model tests and production build pass.
- Added browser test passes for four canopy styles; ground options; neighboring booths; perspective and orthographic zoom; persistence after reload; 2048 PNG export; tablet and phone controls without horizontal overflow.
- Reviewed actual rendered tent previews. Adjusted default camera to include taller roofs and added missing minus icon.
- Scenery uses procedural textures and simplified geometry. No physical device performance certification.
