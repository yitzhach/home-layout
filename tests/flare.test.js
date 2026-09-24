// The lens flare's arithmetic. It is an effect, so the tests are about the two
// ways an effect betrays itself: appearing when it should not, and sitting on
// the screen instead of moving with the camera.
import test from "node:test";
import assert from "node:assert/strict";
import { flareGhosts, flareIntensity, flareSource } from "../src/flare.js";

const centre = { x: 0, y: 0, z: 0.5 };

test("a light behind the camera throws nothing", () => {
  assert.equal(flareIntensity({ x: 0, y: 0, z: 1.4 }), 0);
  assert.deepEqual(flareGhosts({ x: 0, y: 0, z: 1.4 }), []);
});

test("brightest at the centre of frame, fading as the light leaves it", () => {
  assert.equal(flareIntensity(centre), 1);
  const edge = flareIntensity({ x: 0.95, y: 0, z: 0.5 });
  assert.ok(edge > 0 && edge < 1, "and it tapers rather than cutting at the frame edge");
  assert.ok(flareIntensity({ x: 2.4, y: 0, z: 0.5 }) === 0, "well outside the frame there is nothing");
});

test("the ghosts sit on the line from the light through the centre of frame", () => {
  const ghosts = flareGhosts({ x: 0.6, y: 0.3, z: 0.5 }, { strength: 1 });
  assert.ok(ghosts.length > 3);
  for (const g of ghosts) {
    // Collinear with the light and the origin: x/y keeps the light's own ratio.
    assert.ok(Math.abs(g.x * 0.3 - g.y * 0.6) < 1e-9, "a ghost off that line would read as a sticker on the lens");
    assert.ok(g.alpha > 0 && g.alpha <= 1);
  }
  assert.ok(ghosts.some((g) => g.x < 0), "and some land past the centre, which is what makes it a flare");
});

test("it tracks the camera: move the light, the whole chain moves", () => {
  const left = flareGhosts({ x: -0.5, y: 0.1, z: 0.5 }, { strength: 1 });
  const right = flareGhosts({ x: 0.5, y: 0.1, z: 0.5 }, { strength: 1 });
  assert.equal(left.length, right.length);
  for (let i = 0; i < left.length; i++) assert.ok(Math.abs(left[i].x + right[i].x) < 1e-9);
});

test("strength scales it and zero turns it off", () => {
  const full = flareGhosts(centre, { strength: 1 });
  const half = flareGhosts(centre, { strength: 0.5 });
  assert.ok(half[0].alpha < full[0].alpha);
  assert.deepEqual(flareGhosts(centre, { strength: 0 }), []);
});

test("ghosts stay round on a wide frame", () => {
  const wide = flareGhosts(centre, { strength: 1, aspect: 3.2 });
  assert.ok(wide[0].width < wide[0].height, "NDC is square and the canvas is not, so x is divided down");
});

test("the flare comes from the brightest spotlight, or from nothing at all", () => {
  assert.equal(flareSource([]), null);
  assert.equal(flareSource(undefined), null);
  assert.equal(flareSource([{ power: 40 }, { power: 220 }, { power: 90 }]).power, 220);
});

// Where the flare comes from. A spotlight is real and may not exist; the
// overhead source is imaginary and always does, which is the point of it.
import { OVERHEAD, FLARE_SOURCES, DEFAULT_FLARE_SOURCE, resolveFlareSource, flareOrigin } from "../src/flare.js";

test("the overhead source is 20 feet over the centre of the booth", () => {
  assert.equal(OVERHEAD.y, 240, "240 inches is 20 feet");
  assert.equal(OVERHEAD.x, 0);
  assert.equal(OVERHEAD.z, 0);
});

test("the overhead source exists in a booth with no lights at all", () => {
  assert.deepEqual(flareOrigin("overhead", []), { x: 0, y: 240, z: 0 });
  assert.deepEqual(flareOrigin("overhead", undefined), { x: 0, y: 240, z: 0 });
  assert.equal(flareOrigin("spot", []), null, "where a spotlight flare simply has no source");
});

test("a spotlight source is the brightest spotlight's own position", () => {
  const lights = [
    { x: -28, y: 91, z: 24, power: 40 },
    { x: 28, y: 91, z: 24, power: 220 },
  ];
  assert.deepEqual(flareOrigin("spot", lights), { x: 28, y: 91, z: 24 });
});

test("an unknown source falls back to one that works", () => {
  assert.equal(resolveFlareSource("sunbeam"), DEFAULT_FLARE_SOURCE);
  assert.equal(resolveFlareSource(undefined), DEFAULT_FLARE_SOURCE);
  assert.ok(FLARE_SOURCES[DEFAULT_FLARE_SOURCE], "and the default is one of the offered sources");
  assert.deepEqual(flareOrigin("sunbeam", []), { x: 0, y: 240, z: 0 }, "so a bad id still throws a flare");
});
