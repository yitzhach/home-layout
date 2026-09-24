import test from "node:test";
import assert from "node:assert/strict";
import { HANG_LINE, hangAt, nudge, sameWall, spaceEvenly } from "../src/arrange.js";

const wall = { width: 120, height: 96 };

test("works spread with equal gaps, in the order they already hang", () => {
  const works = [
    { id: "b", x: 70, w: 20 },
    { id: "a", x: 5, w: 30 },
    { id: "c", x: 90, w: 10 },
  ];
  const xs = spaceEvenly(works, wall);
  // 60″ of work on a 120″ wall: four gaps of 15″.
  assert.deepEqual(xs, { a: 15, b: 60, c: 95 });
});

test("too much work for the wall packs edge to edge rather than overlapping", () => {
  const xs = spaceEvenly([{ id: "a", x: 0, w: 80 }, { id: "b", x: 50, w: 80 }], wall);
  assert.deepEqual(xs, { a: 0, b: 80 });
});

test("one work centres", () => {
  assert.deepEqual(spaceEvenly([{ id: "a", x: 3, w: 40 }], wall), { a: 40 });
});

test("the hang line puts every centre at 60 inches", () => {
  const ys = hangAt([{ id: "a", h: 30 }, { id: "b", h: 12 }], wall);
  assert.equal(HANG_LINE, 60);
  assert.deepEqual(ys, { a: 45, b: 54 });
});

test("the hang line never pushes a work off its wall", () => {
  assert.deepEqual(hangAt([{ id: "tall", h: 90 }], wall), { tall: 6 }, "clamped to the wall top");
  assert.deepEqual(hangAt([{ id: "huge", h: 120 }], wall), { huge: 0 });
  assert.deepEqual(hangAt([{ id: "low", h: 20 }], { width: 60, height: 40 }), { low: 20 });
});

test("sameWall keeps to one wall, one face and one booth", () => {
  const list = [
    { id: 1, wall: "back" },
    { id: 2, wall: "back", face: "inside" },
    { id: 3, wall: "back", face: "outside" },
    { id: 4, wall: "left" },
    { id: 5, wall: "back", booth: "n1" },
  ];
  assert.deepEqual(sameWall(list, { wall: "back" }).map((a) => a.id), [1, 2]);
  assert.deepEqual(sameWall(list, { wall: "back", booth: "n1" }).map((a) => a.id), [5]);
});

test("arrow keys nudge an inch, or a foot with Shift", () => {
  assert.deepEqual(nudge("ArrowLeft", false), [-1, 0]);
  assert.deepEqual(nudge("ArrowUp", true), [0, 12]);
  assert.equal(nudge("a", false), null);
});
