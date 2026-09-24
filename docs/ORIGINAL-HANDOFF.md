# Artist OS Booth Studio — Master Build Prompt

## Task and current state
Build a focused, working browser-accessible prototype of **Artist OS Booth Studio**. Act as a senior product designer and 3D graphics engineer. This handoff is self-contained; no previous conversation is required.

The prior work consists of product planning and four generated interface concepts. No Booth Studio implementation has been created in this conversation. Build only this tool for the first run. Do not modify the separate Commission Studio app or assume an existing repository is the target. If a relevant existing Booth Studio project is supplied, inspect its guide and implementation before making changes.

First provide a short implementation specification and chosen technical approach, then proceed with the prototype and verification. Resolve routine decisions autonomously. Do not stop after a plan. Follow the environment's applicable build and hosting instructions and deliver a testable preview when available. Do not invent a successful deployment.

## Approved design direction
The user specifically chose **image 2 (mobile editor)** and **image 3 (desktop editor)**. These are the primary visual references:

![Approved mobile editor](references/02-mobile-editor-PRIMARY.png)

![Approved desktop editor](references/03-desktop-editor-PRIMARY.png)

The two additional images are secondary lighting-workflow inspiration:

![Desktop lighting inspiration](references/01-desktop-lighting-secondary.png)

![Mobile lighting inspiration](references/04-mobile-lighting-secondary.png)

Inspect the actual images before designing. Use graphite/black surfaces, restrained Swiss-modern typography, crisp dividers, subtle translucency and blue selection accents. The feel is polished native desktop/iOS creative software. Avoid generic SaaS dashboards, oversized cards and bright gradients.

Desktop: left artwork library, large central interactive 3D scene, right contextual inspector, compact top toolbar and view selector. Mobile: large scene with touch-friendly contextual bottom sheet; Artwork, Layout, Lighting and Export navigation. Tablet should adapt fluidly. Preserve the viewport when opening controls. Use a shared Artist OS shell with Booth Studio as the only active application. Future-suite navigation may be omitted or clearly inactive.

Treat images as aesthetic references, not literal functional specifications. Generated names, measurements, booth branding and artwork are illustrative. Do not copy invented identities or slogans. Remove redundant navigation and any controls that contradict artwork fidelity, such as casually flipping a painting. No fake controls pretending to work.

## Product goal
Let professional artists build a measured art-show booth, place their own artwork at real scale, preview lighting and shadows, compare arrangements, and export useful installation information. Support desktop and mobile web first, keeping the design suitable for a later app. Do not build a native app in this first iteration.

This is specialized professional 3D software inspired by relevant Blender, 3ds Max and SketchUp workflows, not a promise of full feature parity. The measured scene is authoritative.

## Non-negotiable artwork fidelity
- Use original uploaded JPG/PNG images as textures on measured objects. Never generate, repaint, enhance, replace or reinterpret the artwork.
- Preserve image proportions and content. If image aspect ratio conflicts with physical dimensions, explain the mismatch and offer an explicit correction instead of silently stretching/cropping.
- Keep source images separate from any reversible crop or perspective correction. Advanced preparation may be deferred.
- Derive perspective, occlusion, placement and cast shadows from real scene geometry.
- Model artwork thickness and its offset from the wall; these must visibly affect shadows.
- A single photograph does not provide true surface relief. Do not claim physically accurate internal plaster-ridge shadows from one photo. Additional supplied geometry/surface maps are a later feature.
- Photographs may contain baked-in lighting. Do not promise perfect relighting or exact display color.

## First release: required workflow
Choose booth → configure walls/tent → upload art → set dimensions → place/align → adjust lighting → save/reopen → export.

### Booth and geometry
- Presets: 10 × 10 ft and 10 × 20 ft. Structure the model for later 10 × 12 ft and custom sizes.
- Three configurable modular fabric-covered display walls, with width/height and neutral finish controls.
- Optional simple white canopy with visible structural elements; account for the difference between footprint and usable interior.
- Sensible default wall heights, editable and clearly labeled.
- Scene scale must be consistent. Choose one internal unit and convert display units reliably.
- Avoid clipping paintings through walls or placing them beyond wall boundaries without a visible warning.

### Artwork and editing
- Multiple JPG/PNG uploads, thumbnail library, title, width, height, thickness and wall offset.
- Place on back and side walls with correct orientation.
- Select, drag along wall plane, set exact coordinates, snap, align, duplicate and delete.
- Numeric editing is available on mobile as an alternative to dragging.
- Define placement reference points explicitly (e.g. left edge and bottom edge, measured from wall origin).
- Undo/redo for meaningful edits; selection and controls should be predictable.
- Keep uploaded art recognizable and proportional in thumbnails, scene, saved project and exports.

### Cameras
- Orbit, pan and zoom, with sensible limits and touch gestures.
- Perspective, straight-on wall and overhead plan views.
- Separate object manipulation from camera gestures to prevent accidental movement.
- Use plausible camera settings; avoid exaggerating booth size with extreme wide angles.

### Lighting
- Adjustable ambient illumination and a limited set of movable/aimable spotlights.
- Brightness and color-temperature controls, plus simple neutral/daylight and warm lighting presets.
- Render believable shadows from art panels and frames/edges where modeled, walls and tent elements.
- Light changes should affect the actual scene; exports should use the same scene.
- Prioritize stable responsive editing. Offer a higher-quality export if feasible without undermining older-device usability.

### Persistence and export
- Autosave project and image assets locally on the same browser/device; show accurate save status and handle storage failures.
- Reopen after a reload and browser close. Do not imply cross-device sync.
- Download and import a portable project backup that includes referenced artwork assets, not just broken local URLs.
- Export a clean booth image without selection handles or editor chrome.
- Export a basic dimensioned plan or wall hanging guide with clear measurement references; a modest useful version is sufficient.
- Save layout alternatives through duplicate project/layout if practical.

## First engineering checkpoint
Before polishing the full UI, prove this vertical slice: one uploaded image on one measured wall, numeric artwork size and thickness, wall offset, an adjustable light and a visibly responsive cast shadow. Verify on desktop and a mobile-sized viewport. Then expand to the complete booth workflow.

## Technical choices
Select a maintained browser 3D stack capable of real geometry, textured artwork, cameras and shadow rendering. Explain the choice briefly and verify current official documentation as required by the environment. Do not substitute an AI booth image or static background for the interactive scene.

Keep the renderer, scene/project data, image asset storage and UI sufficiently separated to allow future inventory integration. Use stable IDs, a versioned project format and explicit units. Avoid unnecessary backend infrastructure for the first trial. No accounts, payments or production data integrations.

Test responsive behavior with older desktop hardware and phones in mind. Use configurable quality, sensible texture memory limits and clear fallbacks if 3D support is unavailable. Preserve original artwork assets even if preview textures are resized for performance.

## AI: later, optional
Do not require an API key or implement paid AI calls in the first release. Keep any AI UI omitted or clearly marked unavailable.

Future AI scene editing could translate requests such as “space these three pieces six inches apart” or “make the lighting warmer” into validated, undoable scene changes. Future image effects must be separate, labeled derivatives retaining the original mathematical render. Never rely on a generative prompt to guarantee artwork or geometry preservation.

## Future scope — not first-release requirements
- Custom footprints including 10 × 12; corner/end booths, extra partitions and storage areas.
- More detailed tents, equipment libraries, materials, frames, sculpture and pedestals.
- Grouping, layers, object locks, advanced modeling, richer lighting and camera tools.
- Accurate relief from supplied surface maps or 3D models.
- Packing lists, advanced wall guides, interactive sharing and cloud sync.
- Artist OS inventory/commissions integration.
- Organizer templates with event-specific dimensional constraints; automated checks must not imply structural certification.
- Juror review with neutral lighting, standard views, optional anonymity and clearly labeled digital renders. Organizers decide whether renders are acceptable. A render is not proof of an installed booth. Check artwork/signage for identifying content in an anonymous workflow.

## Acceptance criteria
1. Six uploaded works can be placed on multiple walls in a 10 × 10 booth at entered dimensions.
2. A 36 × 48 inch artwork has the correct physical proportions relative to a measured wall; alternate camera angles preserve geometry.
3. Editing thickness, wall offset or a light position produces corresponding changes in cast shadows.
4. Dragging and numeric positioning agree, including on side walls. Alignment and snapping are reproducible.
5. Original artwork content is preserved; no silent distortion, generated substitutions or flipped art.
6. Desktop and mobile layouts are usable with no obscured essential controls or horizontal page overflow.
7. Save/reopen restores artwork images, transforms, booth settings and lighting. Backup round-trip works.
8. Export reflects the actual scene and omits editing handles. Dimensioned guides use documented reference points.
9. Undo/redo works for core edits. Invalid dimensions and failed uploads/storage show understandable messages.
10. Production build succeeds and meaningful interaction/persistence checks pass. Report limitations candidly.

## Delivery
Deliver the runnable prototype, preview URL if available, source project as supported by the environment, and a concise README explaining setup, data storage, controls, verification and remaining limits. Include a brief continuation note for the next session. Do not claim photorealism, mobile performance or browser compatibility beyond what was actually checked.

The user wants a focused real-world trial: upload six actual works, arrange a booth, adjust lights, save/reopen and export. Prioritize this complete experience over extra features.
