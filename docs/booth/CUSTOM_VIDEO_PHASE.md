# Custom video mode — phase document

Requested: *"a pop-up timeline on the Export tab where you keyframe a start
point, an end point and points in between, with per-segment speed and ramping,
fade in/out options, and an optional lens flare that tracks the camera."*

Today `src/camera-path.js` offers four fixed eased moves and nothing else. This
phase adds a fifth entry to that menu — **Custom · your own keyframes** — which
is not a move but a timeline the user builds by flying the viewport and
pressing Add keyframe.

## The contract this must not break

`src/video.js` renders through one call and one call only:

```js
samplePath(move, base, t)   // t in 0..1  ->  { position, target }
```

The encoder, the muxer, the offline frame loop, the progress reporting and the
restore-the-camera-afterwards promise all sit behind that. **None of them
change.** A custom timeline is a different implementation of the same
`(t) -> pose` function, so the whole of `recordVideo` and `previewMove` is
reused untouched apart from passing the timeline through.

That is the load-bearing design decision of this phase. Anything that needs the
recorder to know about keyframes has been designed wrong.

## What a timeline is

```js
{
  version: 1,
  seconds: 12,                       // total clip length
  keys: [                            // 2..12 of them, ordered, t ascending
    {
      id,
      t,                             // 0..1 position in the clip
      hold,                          // seconds paused on this pose
      ease: "smooth"|"in"|"out"|"linear",  // the ramp of the segment that STARTS here
      position: [x, y, z],           // world metres, captured from the viewport
      target:   [x, y, z],
    },
  ],
  fade: { in: 0.5, out: 0.5 },       // seconds; 0 disables
  flare: { on: false, strength: 0.6 },
}
```

Keys hold **absolute poses**, not offsets from the current framing. That is the
opposite of the four fixed moves, and deliberately: a fixed move is a gesture
applied to whatever you are looking at, while a keyframe is a shot you composed
and want back exactly. `samplePath` keeps its `base` argument for the fixed
moves and ignores it for a timeline.

### Why speed is expressed as time, not as a multiplier

The ask says "per-segment speed". A speed multiplier fights the clip length: set
three segments to 2x and the clip is no longer the 12 seconds it says. So the
user sets **where each key sits in time** and the panel shows the resulting
**speed read-out** (metres per second of camera travel) per segment. Same
control, and the arithmetic cannot contradict itself. Ramping — the thing that
makes a move read as a camera rather than a scrub — stays a per-segment easing
choice.

`hold` is the exception that earns its keep: a pause on a pose is what makes a
keyframed clip read as edited rather than as a continuous drift, and expressing
it as two keys at the same pose is a worse UI for the same result.

### Interpolation

Position is interpolated **in the spherical frame of the segment's own target**
— radius, azimuth (shortest way round) and polar angle — exactly as the fixed
moves are. Straight-line interpolation between two poses on opposite sides of
the booth would drive the camera through the tent. The target lerps linearly.
The same `MIN_PHI` / `MAX_PHI` / `MIN_GROUND_Y` clamps apply, for the same
reason: a frame of the camera under the floor is a frame in the file.

## Fades

A fade is not a post-process here. Each frame is rendered at a brightness
multiplier that runs 0 → 1 over the fade-in and 1 → 0 over the fade-out, and
black is drawn over the frame after tone mapping, in an overlay pass with the
renderer's own clear left alone. Scaling exposure instead was considered and
rejected: ACES does not reach black by scaling, so an "ends on black" clip would
end on a dark grey wash that reads as an encoding fault.

The envelope is pure arithmetic (`fadeAt`), so it is covered in Node and the
recorder only has to ask "how bright is frame i".

## Lens flare

Optional, off by default, and a rendering choice rather than a measurement —
which is exactly the kind of thing that a later diff cleans up, so it carries
its reason in a comment.

The flare anchors to the brightest spotlight in the scene. Each frame the light
is projected into normalised device coordinates; the flare is a chain of
additive ghosts along the line from that point through the centre of frame,
which is what a real lens does and what makes it track the camera rather than
sit on the screen. Intensity falls off as the light leaves the frame and is zero
once it is behind the camera. `src/flare.js` is that arithmetic and nothing
else; the sprites that draw it live in the scene's overlay pass beside the fade.

With no spotlights in the booth there is nothing to flare from, and the option
says so rather than silently doing nothing.

## The panel

Export → Video → Camera move → **Custom · your own keyframes** reveals an
**Edit timeline…** button, which opens a dialog (`#dialog`, the same one Help
uses). The dialog is:

- a **row per key** — its time, its hold, its easing, a speed read-out for the
  segment that follows, Go (fly the viewport to that pose), Recapture, Delete;
- **Add keyframe from this view**, which is how keys are made at all: compose in
  the viewport, press the button;
- **fade in / fade out** in seconds, and the **lens flare** toggle and strength;
- **Preview** and **Done**.

An empty timeline is seeded with two keys from the current view, so the dialog
is never a blank slate, and the first thing anyone does — press Add after
orbiting — already works.

Timeline state is **view state, not project state**, like every other video
setting: it is not saved with the booth, is not in the undo history and does not
touch schema 1. A timeline someone spent ten minutes on surviving a reload is a
fair follow-up; it is not this phase, and it is a storage decision that belongs
with the Cloudflare library in `FUTURE_BUILD.md`.

## Order of work

1. `src/timeline.js` — normalise, sample, fade envelope, speed read-out. Pure.
2. `tests/timeline.test.js` — every property that matters in Node with no GPU:
   monotonic times, clamped poses, t=0 and t=1 landing exactly on the first and
   last key, holds consuming their own time, fades reaching 0 and 1.
3. `src/flare.js` + `tests/flare.test.js` — the ghost chain and the falloff.
4. `camera-path.js` — `samplePath` accepts a timeline object where it took a
   move id. One branch, and the four fixed moves keep their exact behaviour.
5. `scene.js` — the overlay pass (fade + flare), and `previewMove` /
   `recordVideo` passing a timeline straight through.
6. `main.js` — the Custom entry, the dialog, and the wiring.
7. `tests/view-video.mjs` — the dialog opens, a key can be added, and a custom
   clip records end to end in a real browser.

## Traps found while planning

- **`frameTimes` must keep owning the frame count.** A timeline has its own
  `seconds`, and the temptation is to have it produce frames. It must not: the
  no-drift guarantee and the exact landing on t=1 live in `frameTimes`, and two
  sources of frame times is how a clip ends a frame early.
- **The preview is wall-clock and the recording is frame-indexed.** Holds and
  fades are functions of t, so both get them right for free — but only if they
  are functions of t and not of a frame index.
- **The overlay must be restored in a `finally`.** The live loop and `export()`
  share the renderer; a fade left at 0.3 after a cancelled recording is a
  viewport that looks broken.
