// The art-show light bar: one bar across the front of the booth carrying
// directional heads, each one spotting a section of one wall.
//
// These are scenery, not entries in `p.lights`. Nine fixtures would fill that
// four-light list twice over, and none of the nine is a thing anyone wants to
// aim by hand: where a head points is a consequence of the booth's own
// measurements. So the bar is described by five numbers and the fixtures are
// derived from them — which also makes the arithmetic a pure function this
// file can hand to Node, rather than something only a renderer can answer.
import { DIFFUSION_MAX, LIGHT_BAR, lightBarSpec, wallSpec } from "./model.js";
// The walls a fixture can be assigned to, left to right along the bar, so the
// heads fan outward from the middle instead of crossing over each other.
const WALL_ORDER = ["left", "back", "right"];
// How far inside the booth's front edge the bar hangs, in inches. Far enough
// in that a head aimed at the back wall clears the valance of the booth in
// front; near enough the entrance that the side walls are lit from the front
// rather than raked from directly above.
export const BAR_INSET = 8;
// How far in from each end of the bar the outermost head sits, in inches.
const END_MARGIN = 5;
/** The fraction of a wall's height a head is aimed at. Eye level on a 96" wall. */
const AIM_HEIGHT = 0.58;
/**
 * How the fixtures are shared out between the three walls. The back wall is
 * the one a visitor faces, so it takes the remainder: nine heads is 3/3/3,
 * eight is 3 back and 2 a side, seven is 3/2/2.
 */
export function fixtureShare(count, walls = WALL_ORDER) {
  const n = Math.max(0, Math.round(count));
  const share = Object.fromEntries(walls.map((w) => [w, Math.floor(n / walls.length)]));
  let extra = n - Object.values(share).reduce((a, b) => a + b, 0);
  // Remainders go to the back wall first, then the left, then the right.
  for (const wall of ["back", "left", "right"]) {
    if (extra <= 0) break;
    if (wall in share) { share[wall] += 1; extra -= 1; }
  }
  return share;
}
/**
 * Where a wall's fixtures are aimed: `n` points evenly spread across the
 * wall's face, in booth inches. The wall's own width is used rather than the
 * footprint, because a wall may be narrower than the side it stands on.
 */
function targets(p, key, n) {
  const spec = wallSpec(p, key);
  if (!spec || !spec.enabled || n <= 0) return [];
  const b = p.booth, y = spec.height * AIM_HEIGHT;
  const out = [];
  for (let i = 0; i < n; i++) {
    // Centres of n equal sections, so no head is aimed at a wall's edge.
    const along = ((i + 0.5) / n) * spec.width;
    if (key === "back") out.push({ x: -spec.width / 2 + along, y, z: -b.depth / 2 });
    // A side wall's frame runs from the entrance toward the back, so the
    // first section is the one nearest the front — which is also the one the
    // outermost head on that side of the bar can reach without crossing over.
    if (key === "left") out.push({ x: -b.width / 2, y, z: b.depth / 2 - along });
    if (key === "right") out.push({ x: b.width / 2, y, z: -b.depth / 2 + along });
  }
  // The right wall's sections run back-to-front along the bar, so its heads
  // read left to right like every other group.
  return key === "right" ? out.reverse() : out;
}
/**
 * Every fixture on the bar: where its head hangs and what it is aimed at, in
 * booth inches, ordered left to right along the bar. A wall that is hidden
 * takes no fixtures, and its share is not handed to another wall — nine heads
 * on a two-walled booth would be nine heads nobody hung.
 */
export function lightBarFixtures(p) {
  const bar = lightBarSpec(p.booth);
  if (!bar.on) return [];
  const b = p.booth;
  const share = fixtureShare(bar.count);
  const aims = [];
  for (const wall of WALL_ORDER)
    for (const target of targets(p, wall, share[wall])) aims.push({ wall, target });
  if (!aims.length) return [];
  const span = Math.max(0, b.width - END_MARGIN * 2);
  const z = b.depth / 2 - BAR_INSET;
  return aims.map(({ wall, target }, i) => ({
    wall,
    // One head per slot, evenly along the bar. With a single fixture the slot
    // is the middle of the bar rather than its left end.
    x: aims.length === 1 ? 0 : -span / 2 + (span * i) / (aims.length - 1),
    y: bar.height,
    z,
    tx: target.x,
    ty: target.y,
    tz: target.z,
    power: bar.power,
    kelvin: bar.kelvin,
  }));
}
/** The bar itself: a rail across the booth, in inches. */
export function lightBarRail(p) {
  const bar = lightBarSpec(p.booth), b = p.booth;
  return { width: b.width, y: bar.height, z: b.depth / 2 - BAR_INSET, on: bar.on };
}

/** Linear blend, for reading the optics table below as "bare … frosted". */
const mix = (a, b, t) => a + (b - a) * t;
/**
 * The slider's value, clamped and defaulted in one place. Both readers below
 * need it and they disagreed once already: a clamp written twice is a clamp
 * that will be widened once.
 */
const diffusion = (bar) =>
  Math.min(DIFFUSION_MAX, Math.max(0, bar.diffusion ?? LIGHT_BAR.diffusion));
/**
 * What `diffusion` means to a renderer, as one pure function so the numbers
 * can be read in Node and so there is one place to argue with them.
 *
 * Four things make a nine-head bar read harsh, and diffusion softens all four
 * together, because turning any one of them alone just trades one artefact for
 * another — a wider cone on its own is merely a bigger hot pool, and a lifted
 * shadow on its own is a flat wall with a hard-edged puddle on it:
 *
 * - **Cone angle.** A 22° beam paints a pool with a visible rim. Opening it to
 *   ~39° makes neighbouring heads overlap, and overlapping pools are a wash.
 * - **Penumbra.** The fraction of the cone spent fading out. At 0.98 there is
 *   no rim left to see at all.
 * - **Shadow intensity.** `LightShadow.intensity` scales how dark a shadow
 *   goes without touching the light itself. This is the literal answer to
 *   "less harsh shadows": a diffuser does not remove a shadow, it fills it.
 * - **Bounce.** White walls in a white hall throw a lot of light back. Without
 *   it, everything the beams miss goes black, which reads harsher than the
 *   beams themselves.
 *
 * `power` is scaled down as the cone opens because a wider cone lights more of
 * the booth from the same fixture, so a bar left at 60 gets brighter as it is
 * softened — and "softer" that arrives brighter reads as a failed slider.
 */
export function lightBarOptics(bar) {
  const d = diffusion(bar);
  // Below 1 this is the original table, untouched, because a booth saved at
  // 0.7 has to light exactly as it did the day it was saved.
  if (d <= 1)
    return {
      angle: mix(Math.PI / 8, Math.PI / 4.5, d),
      penumbra: mix(0.45, 0.98, d),
      shadowIntensity: mix(1, 0.32, d),
      // A grazing wide cone lights a wall at a shallow angle, where a shadow map
      // self-shadows into stripes. More normal bias is the cost of the wider cone.
      normalBias: mix(0.004, 0.014, d),
      powerScale: mix(1, 0.68, d),
    };
  // Above 1 the levers keep moving in the same directions, from exactly the
  // values the first half ends on, so the curve has no step in it at d = 1.
  const t = (d - 1) / (DIFFUSION_MAX - 1);
  return {
    // 40° to 60°. Not wider: three's own limit is 90°, but a cone past about
    // 60 no longer falls off across the wall it is aimed at, and a wall washer
    // that lights the whole booth evenly is a ceiling light, not a wall wash.
    angle: mix(Math.PI / 4.5, Math.PI / 3, t),
    // 1 is the whole cone spent fading. There is no rim at any distance.
    penumbra: mix(0.98, 1, t),
    // Not 0. A shadow that disappears entirely takes the contact with it and
    // every pedestal starts floating; 0.08 is a held-onto hint of a footprint.
    shadowIntensity: mix(0.32, 0.08, t),
    normalBias: mix(0.014, 0.02, t),
    // The cone's area roughly doubles again over this half, so the fixtures
    // come down by about the same proportion they did over the first half —
    // for the same reason: softer must not arrive brighter.
    powerScale: mix(0.68, 0.46, t),
  };
}
/**
 * The bounce fill that stands in for a white hall's walls: a hemisphere light
 * at the bar's own colour temperature. It is proportional to how much light
 * the bar is actually putting out, so turning the fixtures down dims the
 * bounce with them rather than leaving a flat grey haze behind.
 */
export function lightBarBounce(p) {
  const bar = lightBarSpec(p.booth);
  const d = diffusion(bar);
  if (!bar.on || d <= 0) return 0;
  const output = (bar.count * bar.power) / (LIGHT_BAR.count * LIGHT_BAR.power);
  // The ceiling on the bounce rises with the slider rather than being one
  // number, because past 1 the bounce is the point: that is what "the room is
  // doing the lighting" means. It is still 0.6 at d = 1 and below, so a bright
  // bar on an already-composed booth keeps the haze it was composed against —
  // the cap is the only thing here a wide bar could ever reach.
  const cap = 0.6 + 0.25 * Math.min(1, Math.max(0, (d - 1) / (DIFFUSION_MAX - 1)));
  return Math.min(cap, d * 0.5 * output);
}
