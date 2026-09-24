// Export framing: the shape of a delivered file, separate from its size.
//
// Both exports used to take their aspect ratio from the viewport — "height
// follows width, from the canvas" — which meant a PNG or an MP4 came out
// whatever shape the browser window happened to be that afternoon. A booth
// drawing that goes to a jury, a phone or Instagram has a shape it is
// expected in, and resizing a 2100 x 1160 file afterwards either letterboxes
// it or crops the booth out of it.
//
// So a frame is chosen, not inherited. "This window" is still here and is
// still the default, because someone who has composed a shot in the viewport
// means that shot; everything else states its ratio and the render is set up
// for it, camera included.
//
// Pure: nothing here touches the renderer or the DOM, which is what lets
// tests/framing.test.js check every preset's arithmetic in Node.

/**
 * The offered frames. `aspect` is width / height; `null` means "whatever the
 * viewport is", which is resolved at render time. `long` is the long edge in
 * pixels a preset is naturally delivered at — 1920 for a 16:9 desktop file,
 * 1080 for the vertical and square social frames, which is what those
 * platforms accept without re-encoding.
 */
export const FRAMES = {
  view: { label: "This window · current shape", aspect: null, long: 1920 },
  desktop: { label: "Desktop · widescreen 16:9", aspect: 16 / 9, long: 1920 },
  phone: { label: "Phone · vertical 9:16", aspect: 9 / 16, long: 1920 },
  square: { label: "Instagram · square 1:1", aspect: 1, long: 1080 },
  portrait: { label: "Instagram · portrait 4:5", aspect: 4 / 5, long: 1350 },
  custom: { label: "Custom size", aspect: null, long: 1920 },
};
export const DEFAULT_FRAME = "view";
export const CUSTOM_FRAME = { width: 1920, height: 1080 };
/** The widest and narrowest a custom frame may be, per side, in pixels. */
export const FRAME_MIN = 64;
export const FRAME_MAX = 8192;

// `null` and `""` both become 0 through Number(), which is a finite number and
// would clamp to the minimum side — a 64px export nobody asked for. A missing
// value is missing, so it takes the default rather than the floor.
const clampSide = (n, fallback) => {
  if (n === null || n === undefined || n === "") return fallback;
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(FRAME_MIN, Math.min(FRAME_MAX, v)) : fallback;
};

/** An even number, because H.264 encodes in 16x16 macroblocks over even sides. */
export const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The pixel size of one exported frame.
 *
 * `long` is how big the file should be along its longer side — the existing
 * "2048 px wide" and "1080p" settings, generalised, so a vertical phone frame
 * at 1920 is 1080 x 1920 rather than 1920 x 3413. `viewport` is the aspect the
 * window happens to be, and is only consulted by the frames that say they
 * want it.
 *
 * Sides are forced even for both kinds of export: a PNG does not care, but
 * one function answering both is how the two cannot drift apart.
 */
export function frameSize(id, { long, viewport = 16 / 9, custom } = {}) {
  const frame = FRAMES[id] ? { id, ...FRAMES[id] } : { id: DEFAULT_FRAME, ...FRAMES[DEFAULT_FRAME] };
  if (frame.id === "custom") {
    const width = clampSide(custom?.width, CUSTOM_FRAME.width),
      height = clampSide(custom?.height, CUSTOM_FRAME.height);
    return { width: even(width), height: even(height), aspect: width / height, id: frame.id };
  }
  const aspect = frame.aspect ?? (Number.isFinite(viewport) && viewport > 0 ? viewport : 16 / 9);
  const side = Math.max(FRAME_MIN, Math.min(FRAME_MAX, Math.round(Number(long) || frame.long)));
  // The long edge is the one that gets the number asked for, so a 9:16 phone
  // frame at "1920" is 1920 tall. A square frame is both.
  const width = aspect >= 1 ? side : Math.round(side * aspect);
  const height = aspect >= 1 ? Math.round(side / aspect) : side;
  return { width: even(width), height: even(height), aspect, id: frame.id };
}

/** What the size select offers for a still. The long edge, in pixels. */
export const STILL_SIZES = [1080, 1440, 2048, 3072, 4096];
/** What the video size select offers. Keeps the old 720/1080/1440 numbers. */
export const CLIP_SIZES = [720, 1080, 1440];
