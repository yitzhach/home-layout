// The drawn drop shadows. Photoshop's five controls have to do what they do
// in Photoshop, the shape the shader draws is checked here in its JavaScript
// twin, and a booth saved with the first version's three sliders has to open
// looking the way it was left.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DROP_SHADOW,
  SHADOWS,
  SHADOW_ANGLE,
  SHADOW_GLSL,
  SHADOW_MAX,
  erf,
  fromLegacy,
  globalAngle,
  normalAngle,
  shadowAlpha,
  shadowPlan,
  shadowSpec,
} from "../src/dropshadow.js";

const art = (over = {}) => ({ w: 36, h: 48, offset: 0.75, thickness: 1.5, ...over });
const spec = (over = {}, kind = "behind") =>
  shadowSpec({ [kind === "behind" ? "shadowBehind" : "shadowUnder"]: { ...SHADOWS[kind], global: false, ...over } }, kind);

test("a booth that has never heard of drop shadows gets the defaults", () => {
  assert.deepEqual(shadowSpec({}, "behind"), SHADOWS.behind);
  assert.deepEqual(shadowSpec({}, "under"), SHADOWS.under);
  assert.deepEqual(shadowSpec(undefined), shadowSpec({}));
  // The behind shadow is on and the second one waits for its eye, so a booth
  // saved before the second existed looks exactly as it did.
  assert.equal(SHADOWS.behind.on, true);
  assert.equal(SHADOWS.under.on, false);
  // The owner's Photoshop settings, 31% / 125° / 10 px / 4% / 16 px, at 20 px to the inch.
  assert.deepEqual(
    [SHADOWS.behind.opacity, SHADOWS.behind.angle, SHADOWS.behind.distance, SHADOWS.behind.spread, SHADOWS.behind.size],
    [31, 125, 0.5, 4, 0.8],
  );
  // A stored value out of range is clamped rather than believed.
  assert.equal(shadowSpec({ shadowBehind: { opacity: 4000 } }).opacity, 100);
  assert.equal(shadowSpec({ shadowBehind: { size: 99 } }).size, SHADOW_MAX);
  assert.equal(shadowSpec({ shadowBehind: { opacity: "dark" } }).opacity, SHADOWS.behind.opacity);
  assert.equal(shadowSpec({ shadowBehind: { opacity: null } }).opacity, SHADOWS.behind.opacity);
});

test("the angle is where the light comes from, measured the way Photoshop measures it", () => {
  // 125°: a light above and to the left throws the shadow down and right.
  const ps = shadowPlan(spec({ angle: 125, distance: 2 }), art());
  assert.ok(ps.dx > 0 && ps.dy < 0);
  assert.ok(Math.abs(Math.hypot(ps.dx, ps.dy) - 2) < 1e-9, "distance is the length of the throw");
  // 90° is straight overhead: the shadow drops and does not drift.
  const top = shadowPlan(spec({ angle: 90, distance: 1 }), art());
  assert.ok(Math.abs(top.dx) < 1e-9 && Math.abs(top.dy + 1) < 1e-9);
  // 0° is a light at three o'clock, so the shadow falls to the left.
  const right = shadowPlan(spec({ angle: 0, distance: 1 }), art());
  assert.ok(Math.abs(right.dx + 1) < 1e-9 && Math.abs(right.dy) < 1e-9);
  assert.equal(normalAngle(270), -90);
  assert.equal(normalAngle(-180), 180);
  assert.equal(normalAngle(125), 125);
});

test("use global light: one angle for every shadow that asks for it", () => {
  const booth = {
    shadowAngle: 60,
    shadowBehind: { global: true, angle: 10 },
    shadowUnder: { global: false, angle: 10 },
  };
  assert.equal(shadowSpec(booth, "behind").angle, 60, "global follows the booth's light");
  assert.equal(shadowSpec(booth, "under").angle, 10, "a local angle is its own");
  assert.equal(globalAngle({}), SHADOW_ANGLE);
  assert.equal(globalAngle({ shadowAngle: 400 }), 40);
});

test("opacity is how much of the shadow there is, and 0 or the eye is none", () => {
  assert.equal(shadowPlan(spec({ opacity: 31 }), art()).opacity, 0.31);
  assert.equal(shadowPlan(spec({ opacity: 0 }), art()).on, false);
  assert.equal(shadowPlan(spec({ on: false }), art()).on, false);
});

test("size is the soft edge and spread is how much of it is choked solid", () => {
  const soft = shadowPlan(spec({ size: 2, spread: 0 }), art());
  const half = shadowPlan(spec({ size: 2, spread: 50 }), art());
  const hard = shadowPlan(spec({ size: 2, spread: 100 }), art());
  assert.ok(soft.sigma > half.sigma && half.sigma > hard.sigma);
  assert.equal(soft.halfW, 18, "spread 0 leaves the matte the work's own size");
  assert.equal(half.halfW, 19, "spread 50 widens it by half of size");
  assert.equal(hard.halfW, 20, "and spread 100 by all of it, with a hard edge");
  // At the matte's edge a Gaussian-blurred shadow is half strength.
  assert.ok(Math.abs(shadowAlpha(soft, 18, 0) - 0.5) < 0.002);
  assert.ok(shadowAlpha(soft, 0, 0) > 0.99, "solid in the middle");
  assert.ok(shadowAlpha(hard, 19.9, 0) > 0.95 && shadowAlpha(hard, 20.1, 0) < 0.05, "and hard means hard");
});

test("the plane always holds the whole shadow, so nothing is cut off square", () => {
  for (const size of [0, 0.8, 3, 12])
    for (const spread of [0, 40, 100])
      for (const [w, h] of [[6, 6], [36, 48], [120, 96]]) {
        const plan = shadowPlan(spec({ size, spread }), art({ w, h }));
        const alpha = shadowAlpha(plan, plan.width / 2, 0);
        assert.ok(alpha < 0.002, `edge of the plane is clear (${alpha}) at size ${size}, spread ${spread}`);
        assert.ok(plan.width >= w && plan.height >= h);
        assert.ok(plan.sigma > 0, "never a zero deviation");
      }
});

test("the shader's error function is the tested one", () => {
  // Abramowitz & Stegun's bound, against a few exact values.
  for (const [x, exact] of [[0, 0], [0.5, 0.5204999], [1, 0.8427008], [2, 0.9953223], [-1, -0.8427008]])
    assert.ok(Math.abs(erf(x) - exact) < 5e-4, `erf(${x})`);
  // Same constants in both copies, so the picture is what the tests check.
  for (const c of ["0.278393", "0.230389", "0.000972", "0.078108", "0.70710678"]) assert.ok(SHADOW_GLSL.includes(c), c);
  assert.ok(!/\bhalf\b/.test(SHADOW_GLSL), "`half` is reserved in GLSL ES");
});

test("a booth saved with the first version's three sliders still opens as it was left", () => {
  // Untouched — every booth made since the shadow existed stored these — takes today's look.
  assert.deepEqual(fromLegacy({ ...DROP_SHADOW }), SHADOWS.behind);
  assert.deepEqual(shadowSpec({ dropShadow: { ...DROP_SHADOW } }, "behind"), SHADOWS.behind);
  // Switched off stays off.
  assert.equal(shadowSpec({ dropShadow: { ...DROP_SHADOW, on: false } }, "behind").on, false);
  // Moved sliders keep their meaning: darker is more opaque, further throws
  // further, softer is a wider edge — and the old fixed direction, down and right.
  const dark = fromLegacy({ darkness: 90, distance: 45, softness: 55 });
  const far = fromLegacy({ darkness: 40, distance: 100, softness: 55 });
  const soft = fromLegacy({ darkness: 40, distance: 45, softness: 100 });
  const base = fromLegacy({ darkness: 41, distance: 45, softness: 55 });
  assert.ok(dark.opacity > base.opacity);
  assert.ok(far.distance > base.distance);
  assert.ok(soft.size > base.size);
  assert.equal(base.global, false);
  assert.equal(base.angle, 114);
  for (const s of [dark, far, soft]) assert.ok(s.distance <= SHADOW_MAX && s.size <= SHADOW_MAX);
  // The new record wins once one exists, and the legacy one never reaches the second shadow.
  assert.equal(shadowSpec({ dropShadow: { darkness: 90 }, shadowBehind: { opacity: 12 } }).opacity, 12);
  assert.deepEqual(shadowSpec({ dropShadow: { darkness: 90 } }, "under"), SHADOWS.under);
});
