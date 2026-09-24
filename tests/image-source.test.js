// The decode size arithmetic. What it is for is written in image-source.js:
// an original is stored whole because a backup has to hand it back whole, and
// nothing on screen ever wants it at that size.
import test from "node:test";
import assert from "node:assert/strict";
import { decodeAt, fitWithin, isPreflipped } from "../src/image-source.js";

test("an image already small enough is never enlarged", () => {
  assert.deepEqual(fitWithin(800, 600, 2048), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(2048, 2048, 2048), { width: 2048, height: 2048 });
  assert.deepEqual(fitWithin(17, 3, 256), { width: 17, height: 3 });
});

test("a large image is fitted by its longest side, keeping its proportions", () => {
  assert.deepEqual(fitWithin(6000, 4000, 2048), { width: 2048, height: 1365 });
  assert.deepEqual(fitWithin(4000, 6000, 2048), { width: 1365, height: 2048 });
  // A library thumbnail off a 24 megapixel photograph: about 40,000 pixels
  // instead of 24 million, which is the whole point of having one.
  const thumb = fitWithin(6000, 4000, 256);
  assert.deepEqual(thumb, { width: 256, height: 171 });
  assert.ok(thumb.width * thumb.height < 50000);
});

test("a degenerate size gives back something drawable rather than nothing", () => {
  // A panorama 30000 across and one pixel tall still has to come back at
  // least one pixel tall, or the canvas it is drawn into throws.
  assert.deepEqual(fitWithin(30000, 1, 2048), { width: 2048, height: 1 });
  assert.deepEqual(fitWithin(0, 0, 2048), { width: 1, height: 1 });
  assert.deepEqual(fitWithin(800, 600, 0), { width: 800, height: 600 });
});

test("a source decoded for upload comes back flipped and says so", async () => {
  // WebGL does not apply `texture.flipY` to an ImageBitmap the way it does to
  // an `<img>` or a canvas, which hung every uploaded photograph upside down.
  // The decoder is asked for the flip instead, and the caller is told.
  const asked = [];
  const bitmaps = [];
  globalThis.createImageBitmap = async (_blob, options) => {
    asked.push(options);
    const bitmap = { width: options.resizeWidth, height: options.resizeHeight };
    bitmaps.push(bitmap);
    return bitmap;
  };
  globalThis.fetch = async () => ({ blob: async () => ({}) });
  try {
    const plain = await decodeAt("data:image/png;base64,AA", 400, 200, 100);
    assert.equal(asked.at(-1).imageOrientation, undefined);
    assert.equal(isPreflipped(plain), false);
    const upload = await decodeAt("data:image/png;base64,AA", 400, 200, 100, { upload: true });
    assert.equal(asked.at(-1).imageOrientation, "flipY");
    assert.equal(isPreflipped(upload), true);
    assert.equal(isPreflipped(null), false);
  } finally {
    delete globalThis.createImageBitmap;
    delete globalThis.fetch;
  }
});
