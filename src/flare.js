// A lens flare that tracks the camera.
//
// Optional, off by default, and a rendering choice rather than a measurement —
// which is exactly the kind of thing a later diff "cleans up", so the reasons
// are here rather than in a commit message.
//
// A real flare is the light source scattering off the elements inside a lens,
// so the ghosts land on the line from the light through the centre of frame,
// mirrored to the far side. That is what makes it track: pan away from the
// light and the chain sweeps across frame on its own. Sprites pinned near the
// light would sit on the screen instead, which is what a flare drawn by hand
// always looks like.
//
// Pure arithmetic in normalised device coordinates, no three.js and no DOM, so
// tests/flare.test.js covers it in Node with no GPU. The scene turns the
// numbers below into additive sprites in its overlay pass.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Where each ghost sits along the light-to-centre line, how big it is relative
// to the frame, and how bright. Offset 0 is the light itself; a negative offset
// is the far side of frame, which is where the biggest, faintest ghosts belong.
// Hand-tuned by looking at a render: evenly spaced ghosts read as a string of
// beads rather than as glass.
const GHOSTS = [
  { offset: 1, scale: 0.26, alpha: 0.55, warm: 1 },
  { offset: 0.62, scale: 0.075, alpha: 0.3, warm: 0.85 },
  { offset: 0.3, scale: 0.05, alpha: 0.22, warm: 0.6 },
  { offset: -0.15, scale: 0.11, alpha: 0.17, warm: 0.35 },
  { offset: -0.48, scale: 0.065, alpha: 0.22, warm: 0.5 },
  { offset: -0.85, scale: 0.17, alpha: 0.13, warm: 0.2 },
  { offset: -1.25, scale: 0.09, alpha: 0.1, warm: 0.7 },
];

/**
 * How bright the flare is for a light at `ndc` — x and y in -1..1, z < 1 while
 * the light is in front of the camera.
 *
 * Zero behind the camera, because a flare from a light behind the lens is the
 * single clearest sign that an effect was bolted on. It fades out as the light
 * leaves the frame rather than cutting, since a hard edge at the frame boundary
 * flickers on any move that grazes it.
 */
export function flareIntensity(ndc, { falloff = 0.55 } = {}) {
  if (!ndc || ndc.z >= 1) return 0;
  const distance = Math.hypot(ndc.x, ndc.y);
  // 1 at the centre of frame, tapering to 0 at `1 + falloff` — a little outside
  // the frame, so a light just off the edge still throws something.
  return clamp(1 - (distance - 1 + falloff) / falloff, 0, 1) ** 0.8;
}

/**
 * The ghost chain for a light at `ndc`, as positions in the same -1..1 space.
 *
 * `strength` is the user's slider; `aspect` keeps the ghosts round on a wide
 * frame, since NDC is square and the canvas is not.
 */
export function flareGhosts(ndc, { strength = 0.6, aspect = 1.6 } = {}) {
  const intensity = flareIntensity(ndc) * clamp(strength, 0, 1);
  if (intensity <= 0) return [];
  return GHOSTS.map((g) => ({
    // offset 1 is the light, 0 is the centre of frame, negative is past it.
    x: ndc.x * g.offset,
    y: ndc.y * g.offset,
    // Round on screen: NDC x spans the wider edge, so a ghost's x radius is its
    // y radius divided by the aspect ratio.
    width: (g.scale * intensity) / Math.max(0.01, aspect / 1.6),
    height: g.scale * intensity,
    alpha: clamp(g.alpha * intensity, 0, 1),
    warm: g.warm,
  })).filter((g) => g.alpha > 0.002);
}

/**
 * Picks the light a flare should come from: the brightest one, since a flare
 * from the dimmest reads as a bug. Returns null when the booth has no lights,
 * which is what lets the panel say so rather than silently doing nothing.
 */
export function flareSource(lights) {
  if (!Array.isArray(lights) || !lights.length) return null;
  return lights.reduce((best, l) => ((l?.power ?? 0) > (best?.power ?? -1) ? l : best), null) || null;
}

// The unseen source: 20 feet over the centre of the booth, standing in for the
// sun or a hall's high bay. Nothing is drawn there and nothing is lit by it —
// it exists only to say where the flare comes from, which is why it can sit in
// a booth with no spotlights at all and why it does not touch the render's
// exposure. Inches, like every other measurement in this app.
export const OVERHEAD = { x: 0, y: 240, z: 0 };
export const FLARE_SOURCES = {
  overhead: "Overhead · unseen light 20 ft up",
  spot: "Brightest spotlight",
};
export const DEFAULT_FLARE_SOURCE = "overhead";
export const resolveFlareSource = (id) => (FLARE_SOURCES[id] ? id : DEFAULT_FLARE_SOURCE);

/**
 * Where the flare comes from, in inches, for either kind of source. Returns
 * null only when a spotlight was asked for and there is none — the overhead
 * source is always there, which is the point of it.
 */
export function flareOrigin(source, lights) {
  if (resolveFlareSource(source) === "overhead") return { ...OVERHEAD };
  const light = flareSource(lights);
  return light ? { x: light.x, y: light.y, z: light.z } : null;
}
