// Wall photos (phase 3): a photographed wall straightened from its four
// corners and laid on a room's side at the size typed. These pin the pixel
// mapping — a known quadrilateral comes back as the rectangle it was — the
// cutting of the photo round doors and windows, and that schema 1 takes the
// record only whole.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homeProject, validateProject } from "../src/model.js";
import { newOpening, newRoom, roomEdge } from "../src/rooms.js";
import { DEFAULT_CORNERS, goodCorners, newWallPhoto, photoPieces, straightSize, straighten, validWallPhotos } from "../src/wallphoto.js";

// A 100×80 source, black, with a white quadrilateral whose corners are known:
// the "wall" in the photo, seen at an angle.
function photo() {
  const w = 100, h = 80, px = new Uint8ClampedArray(w * h * 4);
  const q = [[20, 10], [85, 18], [80, 70], [15, 62]];
  const inside = (x, y) => {
    let r = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [ax, ay] = q[i], [bx, by] = q[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) r = !r;
    }
    return r;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = inside(x + 0.5, y + 0.5) ? 255 : 0, o = (y * w + x) * 4;
    px[o] = px[o + 1] = px[o + 2] = v;
    px[o + 3] = 255;
  }
  return { px, w, h, corners: q.map(([x, y]) => [x / (w - 1), y / (h - 1)]) };
}

test("straightening a quadrilateral gives back the whole rectangle it was", () => {
  const { px, w, h, corners } = photo();
  const out = straighten(px, w, h, corners, 40, 30);
  assert.equal(out.length, 40 * 30 * 4);
  let white = 0;
  // Away from the very edge, where sampling blends with the black outside.
  for (let j = 2; j < 28; j++) for (let i = 2; i < 38; i++) if (out[(j * 40 + i) * 4] > 200) white++;
  assert.equal(white, 36 * 26, "every inner pixel of the output is wall");
  // Corners taken wider than the wall pull in the black round it.
  const wide = straighten(px, w, h, [[0, 0], [1, 0], [1, 1], [0, 1]], 40, 30);
  assert.ok(wide[0] < 50, "the photo's own corner is outside the wall");
});

test("the straightened picture takes the typed shape and never enlarges", () => {
  const ph = { corners: DEFAULT_CORNERS, width: 144, height: 96 };
  assert.deepEqual(straightSize(ph, 4000, 3000), { width: 1024, height: 683 });
  const small = straightSize(ph, 200, 150);
  assert.equal(small.width, 160, "no more pixels than the photo had across the wall");
  assert.deepEqual(straightSize({ ...ph, width: 48, height: 96 }, 4000, 3000), { width: 512, height: 1024 });
});

test("corners must be four points in the photo making a convex shape", () => {
  assert.ok(goodCorners(DEFAULT_CORNERS));
  assert.ok(goodCorners([...DEFAULT_CORNERS].reverse()), "either winding");
  assert.equal(goodCorners([[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]]), false, "a bow tie");
  assert.equal(goodCorners([[0, 0], [1, 0], [1, 1.2], [0, 1]]), false, "off the photo");
  assert.equal(goodCorners(DEFAULT_CORNERS.slice(0, 3)), false);
});

test("the photo is cut round the doors and windows on its side, from either room", () => {
  const p = homeProject();
  const r = newRoom({ x: 0, z: 0, width: 120, depth: 120, height: 96 });
  p.booth.rooms = [r];
  r.openings = [newOpening("window", { side: "n", x: 40, width: 30, height: 40, sill: 30 })];
  const ph = newWallPhoto(r, "n", "a");
  assert.deepEqual([ph.width, ph.height], [120, 96]);
  const pieces = photoPieces(p, r, "n", ph);
  // Left strip, under the sill, over the head, right strip.
  assert.equal(pieces.length, 4);
  const area = pieces.reduce((s, q) => s + q.w * q.h, 0);
  assert.equal(area, 120 * 96 - 30 * 40, "everything but the window");
  const under = pieces.find((q) => q.x === 40 && q.y === 0);
  assert.deepEqual([under.u0, under.u1, under.v0, under.v1], [40 / 120, 70 / 120, 0, 30 / 96], "each piece shows its own part of the photo");
  // A smaller photo set in the wall clips to the side and keeps its UVs.
  const part = photoPieces(p, r, "n", { ...ph, x: 100, y: 10, width: 48, height: 40 });
  assert.equal(part.length, 1);
  assert.deepEqual([part[0].x, part[0].w, part[0].u1], [100, 20, 20 / 48]);
});

test("schema 1 takes a wall photo only whole, and only with its photo", () => {
  const p = homeProject();
  const r = p.booth.rooms[0];
  p.assets.wp = { data: "data:image/jpeg;base64,AAAA", width: 400, height: 300, name: "wall.jpg", role: "wall" };
  r.wallPhotos = { n: newWallPhoto(r, "n", "wp") };
  validateProject(structuredClone(p));
  for (const bad of [
    { n: { ...r.wallPhotos.n, asset: "gone" } },
    { up: r.wallPhotos.n },
    { n: { ...r.wallPhotos.n, corners: [[0, 0]] } },
    { n: { ...r.wallPhotos.n, width: 2 } },
    { n: { ...r.wallPhotos.n, height: 500 } },
    [],
  ]) {
    assert.equal(validWallPhotos(bad, p.assets), false, JSON.stringify(bad).slice(0, 60));
    const q = structuredClone(p);
    q.booth.rooms[0].wallPhotos = bad;
    assert.throws(() => validateProject(q));
  }
  assert.equal(roomEdge(r, "n").length, r.wallPhotos.n.width);
});
