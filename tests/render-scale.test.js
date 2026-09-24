import test from "node:test";
import assert from "node:assert/strict";

// renderScale lives in scene.js, which imports three and touches the DOM at
// module scope, so the rule is restated here rather than imported. It is four
// lines; what matters is that it is pinned, because the bug it fixes is
// invisible in code review and obvious on screen.
const renderScale = (devicePixelRatio, quality = 2) =>
  Math.min(Math.max(devicePixelRatio || 1, quality), 3);

// The original was Math.min(devicePixelRatio, quality). On the 1x monitor most
// desktops have, that renders at 1 however high the quality setting goes, and
// a white tent roof against a dark backdrop stair-steps. Asking for quality is
// asking to supersample, not to raise a ceiling that the display then lowers.
test("quality supersamples a 1x display rather than capping at it", () => {
  assert.equal(renderScale(1, 2), 2, "a 1x monitor still renders at 2x");
  assert.equal(renderScale(1, 3), 3);
  assert.equal(renderScale(1, 1), 1, "the efficient setting stays at 1");
});

test("a dense display is never rendered below its own density", () => {
  assert.equal(renderScale(2, 1), 2, "efficient does not blur a retina screen");
  assert.equal(renderScale(3, 2), 3);
});

// The cost is per pixel, and 4x devicePixelRatio on a phone is 16x the
// fragments for detail no one can resolve.
test("the scale is capped so a dense phone is not asked for 9x the fragments", () => {
  assert.equal(renderScale(4, 3), 3);
  assert.equal(renderScale(2, 3), 3);
});

test("a missing or zero devicePixelRatio falls back rather than blanking", () => {
  assert.equal(renderScale(undefined, 2), 2);
  assert.equal(renderScale(0, 2), 2);
});
