// The shape of a delivered file. The bug this answers is that both exports
// took their aspect ratio from the browser window, so these are mostly about
// one thing: a named frame ignores the viewport entirely.
import test from "node:test";
import assert from "node:assert/strict";
import { FRAMES, DEFAULT_FRAME, CUSTOM_FRAME, FRAME_MAX, FRAME_MIN, STILL_SIZES, CLIP_SIZES, even, frameSize } from "../src/framing.js";

test("this window is the default, and is the viewport's own shape", () => {
  assert.equal(DEFAULT_FRAME, "view");
  const wide = frameSize("view", { long: 1920, viewport: 2.2 });
  assert.equal(wide.width, 1920);
  assert.equal(wide.height, even(Math.round(1920 / 2.2)));
  const tall = frameSize("view", { long: 1000, viewport: 0.5 });
  assert.equal(tall.height, 1000, "the long side is the one that gets the number");
  assert.equal(tall.width, 500);
});

test("a named frame ignores the window it was chosen in", () => {
  for (const viewport of [0.4, 1, 1.4, 2.35]) {
    assert.deepEqual(
      { ...frameSize("desktop", { long: 1920, viewport }) },
      { width: 1920, height: 1080, aspect: 16 / 9, id: "desktop" },
    );
    const phone = frameSize("phone", { long: 1920, viewport });
    assert.deepEqual([phone.width, phone.height], [1080, 1920]);
    const square = frameSize("square", { long: 1080, viewport });
    assert.deepEqual([square.width, square.height], [1080, 1080]);
    const portrait = frameSize("portrait", { long: 1350, viewport });
    assert.deepEqual([portrait.width, portrait.height], [1080, 1350]);
  }
});

test("every frame comes out even on both sides, whatever it was asked for", () => {
  for (const id of Object.keys(FRAMES))
    for (const long of [...STILL_SIZES, ...CLIP_SIZES, 999, 1001])
      for (const viewport of [1.777, 1.333, 0.62, 3]) {
        const { width, height } = frameSize(id, { long, viewport, custom: { width: 1001, height: 667 } });
        assert.equal(width % 2, 0, `${id} width at ${long}`);
        assert.equal(height % 2, 0, `${id} height at ${long}`);
        assert.ok(width >= 2 && height >= 2);
      }
});

test("a custom frame is the two numbers typed, clamped and evened", () => {
  assert.deepEqual(
    [frameSize("custom", { custom: { width: 1200, height: 628 } }).width, frameSize("custom", { custom: { width: 1200, height: 628 } }).height],
    [1200, 628],
  );
  const huge = frameSize("custom", { custom: { width: 99999, height: -4 } });
  assert.equal(huge.width, FRAME_MAX);
  assert.equal(huge.height, even(FRAME_MIN));
  const nonsense = frameSize("custom", { custom: { width: "wide", height: null } });
  assert.deepEqual([nonsense.width, nonsense.height], [CUSTOM_FRAME.width, CUSTOM_FRAME.height]);
});

test("an unknown frame falls back to this window rather than throwing", () => {
  const fallback = frameSize("instagram-reels-2031", { long: 1920, viewport: 1.5 });
  assert.equal(fallback.id, DEFAULT_FRAME);
  assert.equal(fallback.width, 1920);
});

test("a viewport that has not been measured yet does not produce a zero frame", () => {
  for (const viewport of [0, NaN, undefined, -3]) {
    const { width, height } = frameSize("view", { long: 1920, viewport });
    assert.ok(width > 0 && height > 0, `viewport ${viewport}`);
  }
});
