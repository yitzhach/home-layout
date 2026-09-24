// The shadows a hung work throws onto the wall behind it — Photoshop's drop
// shadow, twice.
//
// Two things asked for the same mechanism first. One was a drop shadow with
// controls; the other was the wall gap: artwork stood off the wall on a
// batten, which was only visible if you put your eye along the wall, because
// nothing in the picture said the work was floating. A real spotlight does
// cast that shadow, but only when one happens to be aimed across the work, and
// it is gone the moment the light bar is diffused into a wash — which is
// exactly the lighting an art-show booth is composed in. So the shadow here is
// drawn, not lit, and it is in every export, because it is part of the
// drawing.
//
// The first version had three sliders of its own (darker, further, softer)
// and sized the shadow from each work's wall gap. Looked at on a real
// machine, the ask was for it to work the way Photoshop's does — Opacity,
// Angle with Use Global Light, Distance, Spread and Size — and for a second
// one underneath it, "for the drop shadow under the piece and to the side, so
// a stronger drop shadow can be created onto the wall", each with an eye. So:
//
// - **behind** is the soft shadow every work has had since the drop shadow
//   existed, now on Photoshop's five controls.
// - **under** is the stronger one thrown down and across. Off until its eye
//   is switched on, so a booth saved before it existed looks as it did.
//
// Distance and Size are inches on the wall, not pixels: this is a measured
// booth, and an inch is the same inch at every export size. The defaults are
// the owner's own Photoshop settings (31%, 125°, 10 px, 4%, 16 px) read at 20
// px to the inch. They are absolute, the way Photoshop's are — no longer
// scaled by the wall gap, which is set per work and now says only where the
// work stands.
//
// Pure. The shape is exact rather than approximated by a blurred canvas: a
// rectangle blurred by a Gaussian is separable, so its alpha at any point is
// the product of two error functions. scene.js draws that in a shader
// (SHADOW_GLSL below), which keeps a small shadow crisp in a 4096 px export
// and builds no textures at all; `shadowAlpha` is the same arithmetic in
// JavaScript, which is how tests/dropshadow.test.js checks the shader's maths
// in Node.

/** The two shadows, in the order they are drawn and listed. */
export const SHADOW_KINDS = ["behind", "under"];
/** Where each is stored on the booth. Both optional, so schema 1 holds. */
export const SHADOW_FIELD = { behind: "shadowBehind", under: "shadowUnder" };
/** Photoshop's global light, shared by every shadow that uses it. Degrees. */
export const SHADOW_ANGLE = 125;
/** The furthest a shadow is thrown, and the widest its soft edge, in inches. */
export const SHADOW_MAX = 12;
/**
 * The defaults. Angle is where the light comes from, counterclockwise from
 * three o'clock, so 125° is a light above and to the left and a shadow down
 * and to the right — Photoshop's convention, on purpose.
 */
export const SHADOWS = {
  behind: { on: true, opacity: 31, angle: SHADOW_ANGLE, global: true, distance: 0.5, spread: 4, size: 0.8 },
  under: { on: false, opacity: 55, angle: SHADOW_ANGLE, global: true, distance: 1.5, spread: 10, size: 2.5 },
};
/**
 * The first version's record, `booth.dropShadow`, which every booth saved
 * between 2026-09-22 and this change carries. Still read, never written.
 */
export const DROP_SHADOW = { on: true, darkness: 40, distance: 45, softness: 55 };
// Below this the edge is sharper than a pixel of any export, and the maths
// would divide by zero at 0.
const MIN_SIGMA = 0.01;

const clamp = (n, lo, hi, fallback) => {
  const v = Number(n);
  return n !== null && n !== "" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};
/** An angle in (-180, 180], the range Photoshop's dial reads in. */
export const normalAngle = (deg) => {
  const v = ((Number(deg) % 360) + 360) % 360;
  return v > 180 ? v - 360 : v;
};
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/** The one angle every shadow using the global light shares. */
export const globalAngle = (booth = {}) =>
  Number.isFinite(Number(booth?.shadowAngle)) && booth?.shadowAngle !== null
    ? normalAngle(booth.shadowAngle)
    : SHADOW_ANGLE;

/**
 * The first version's three sliders, read as Photoshop's five.
 *
 * Every booth made since the drop shadow existed stored the defaults, so a
 * record still at the defaults is one nobody chose, and it takes today's
 * defaults — otherwise every existing booth would keep the look this change
 * was asked for to replace. A record someone did move keeps its look, read at
 * the 0.75″ wall gap the sample panels ship with (the old shadow scaled with
 * each work's gap). Only `on` carries over either way.
 */
export function fromLegacy(old = {}) {
  const on = old?.on === undefined ? DROP_SHADOW.on : !!old.on;
  const darkness = clamp(old?.darkness, 0, 100, DROP_SHADOW.darkness),
    distance = clamp(old?.distance, 0, 100, DROP_SHADOW.distance),
    softness = clamp(old?.softness, 0, 100, DROP_SHADOW.softness);
  if (darkness === DROP_SHADOW.darkness && distance === DROP_SHADOW.distance && softness === DROP_SHADOW.softness)
    return { ...SHADOWS.behind, on };
  // The old arithmetic at a 0.75″ gap (plus its 0.35″ floor): thrown down
  // and 0.45 of that across, blurred over roughly 3.2 of its padding unit,
  // and darkness at 0.81 of itself once its own softening was taken off.
  const gap = 1.1;
  const thrown = gap * (0.35 + 2.15 * (distance / 100)) * Math.hypot(1, 0.45);
  const blur = 0.12 + gap * (0.15 + 2.4 * (softness / 100));
  return {
    on,
    opacity: Math.round(darkness * 0.81),
    angle: 114,
    global: false,
    distance: round(Math.min(SHADOW_MAX, thrown), 2),
    spread: 0,
    size: round(Math.min(SHADOW_MAX, 3.2 * blur), 2),
  };
}

/**
 * One shadow's settings, with every absent field at its default and the
 * angle resolved: a shadow using the global light answers with the global
 * angle, which is what its dial shows and what it draws with.
 */
export function shadowSpec(booth = {}, kind = "behind") {
  const defaults = SHADOWS[kind] || SHADOWS.behind;
  let s = booth?.[SHADOW_FIELD[kind]];
  if (!s && kind === "behind" && booth?.dropShadow) s = fromLegacy(booth.dropShadow);
  if (!s || typeof s !== "object") s = {};
  const global = s.global === undefined ? defaults.global : !!s.global;
  return {
    on: s.on === undefined ? defaults.on : !!s.on,
    opacity: clamp(s.opacity, 0, 100, defaults.opacity),
    angle: global ? globalAngle(booth) : normalAngle(clamp(s.angle, -360, 360, defaults.angle)),
    global,
    distance: clamp(s.distance, 0, SHADOW_MAX, defaults.distance),
    spread: clamp(s.spread, 0, 100, defaults.spread),
    size: clamp(s.size, 0, SHADOW_MAX, defaults.size),
  };
}

/**
 * Where one work's shadow falls and what shape it is, in inches in the wall's
 * own frame, relative to the centre of the work: `dx` right, `dy` up.
 *
 * Photoshop's Spread is the share of Size that is choked solid before the
 * rest is blurred: 0% is all blur, 100% a hard edge Size wider than the
 * layer. The blur is taken as a Gaussian whose soft edge runs about ±Size
 * around the matte's edge (σ = radius / 2), which is how Photoshop's Size
 * reads. The plane carries three deviations of margin past the matte — past
 * that the shadow is under 0.15% — so it is never cut off square.
 */
export function shadowPlan(spec, art) {
  const w = Math.max(0.25, Number(art.w) || 0),
    h = Math.max(0.25, Number(art.h) || 0);
  const rad = (spec.angle * Math.PI) / 180;
  const choke = (spec.size * spec.spread) / 100;
  const sigma = Math.max(MIN_SIGMA, (spec.size - choke) / 2);
  const halfW = w / 2 + choke,
    halfH = h / 2 + choke;
  const margin = 3 * sigma;
  return {
    on: spec.on && spec.opacity > 0,
    // Away from the light.
    dx: -Math.cos(rad) * spec.distance,
    dy: -Math.sin(rad) * spec.distance,
    halfW,
    halfH,
    sigma,
    width: 2 * (halfW + margin),
    height: 2 * (halfH + margin),
    opacity: spec.opacity / 100,
  };
}

// erf, Abramowitz & Stegun 7.1.27. Within 5e-4 everywhere, which is well
// under one step of an 8-bit alpha channel.
const A = [0.278393, 0.230389, 0.000972, 0.078108];
export function erf(x) {
  const a = Math.abs(x);
  let d = 1 + a * (A[0] + a * (A[1] + a * (A[2] + a * A[3])));
  d *= d;
  d *= d;
  return Math.sign(x) * (1 - 1 / d);
}
/** The shadow's alpha at (x, y) inches from the centre of its plane, 0..1, before opacity. */
export function shadowAlpha(plan, x, y) {
  const k = Math.SQRT1_2 / plan.sigma;
  const edge = (p, half) => 0.5 * (erf((p + half) * k) - erf((p - half) * k));
  return edge(x, plan.halfW) * edge(y, plan.halfH);
}
/**
 * The same two functions for the fragment shader, prepended to three's own
 * MeshBasicMaterial source by scene.js. Positions and sizes arrive in metres;
 * the arithmetic does not care which unit, only that all three share one.
 * (`half` is reserved in GLSL ES, hence `extent`.)
 */
export const SHADOW_GLSL = `
uniform vec2 shadowExtent;
uniform float shadowSigma;
varying vec2 vShadowPos;
vec2 shadowErf(vec2 x) {
  vec2 a = abs(x);
  vec2 d = 1.0 + a * (${A[0]} + a * (${A[1]} + a * (${A[2]} + a * ${A[3]})));
  d *= d;
  d *= d;
  return sign(x) * (1.0 - 1.0 / d);
}
float shadowBox(vec2 p, vec2 extent, float sigma) {
  float k = 0.70710678 / sigma;
  vec2 edge = 0.5 * (shadowErf((p + extent) * k) - shadowErf((p - extent) * k));
  return edge.x * edge.y;
}
`;
