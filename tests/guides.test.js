// Smart guides and align/distribute: the arithmetic, pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { SNAP_RANGE, smartSnap } from "../src/guides.js";
import { alignWorks, distributeWorks } from "../src/align.js";

const wall = { width: 120, height: 96 };
const work = (id, x, y, w = 20, h = 20) => ({ id, x, y, w, h });

test("an edge within range of another work's edge snaps to it and says so", () => {
  const b = work("b", 50, 30);
  const s = smartSnap(work("a", 51.5, 5), [b], wall);
  assert.equal(s.x, 50, "left edges line up");
  assert.ok(s.guides.some((g) => g.axis === "x" && g.at === 50 && g.kind === "work"));
});

test("out of range, nothing moves and nothing is drawn", () => {
  const s = smartSnap(work("a", 10, 5), [work("b", 50, 70)], wall);
  assert.deepEqual([s.x, s.y], [10, 5]);
  assert.equal(s.guides.length + s.gaps.length, 0);
  assert.ok(SNAP_RANGE >= 1 && SNAP_RANGE <= 3);
});

test("the wall's centre is a target", () => {
  const s = smartSnap(work("a", 49, 5), [], wall);
  assert.equal(s.x, 50, "centre of a 20″ work on the centre of a 120″ wall");
  assert.equal(s.guides[0].kind, "wall");
});

test("the hang line snaps a centre, never an edge", () => {
  const s = smartSnap(work("a", 5, 49), [], wall);
  assert.equal(s.y, 50, "centre at 60″");
  assert.equal(s.guides.find((g) => g.axis === "y").kind, "hang");
  const top = smartSnap(work("a", 5, 39.5), [], wall);
  assert.equal(top.y, 39.5, "a top edge near 60″ is not pulled to it");
});

test("equal gaps between two neighbours win and are labelled", () => {
  const left = work("l", 0, 40), right = work("r", 100, 40);
  // Room between them is 80″; a 20″ work splits it into two 30″ gaps at x = 50.
  const s = smartSnap(work("a", 48.8, 40), [left, right], wall);
  assert.equal(s.x, 50);
  assert.equal(s.gaps.length, 2);
  assert.deepEqual(s.gaps.map((g) => g.inches), [30, 30]);
});

test("align lines works up on the edge of the box they make", () => {
  const works = [work("a", 10, 10), work("b", 40, 30, 30, 10), work("c", 80, 5, 10, 40)];
  assert.deepEqual(alignWorks(works, "left"), { a: { x: 10 }, b: { x: 10 }, c: { x: 10 } });
  assert.deepEqual(alignWorks(works, "right"), { a: { x: 70 }, b: { x: 60 }, c: { x: 80 } });
  assert.deepEqual(alignWorks(works, "top"), { a: { y: 25 }, b: { y: 35 }, c: { y: 5 } });
  assert.deepEqual(alignWorks(works, "bottom"), { a: { y: 5 }, b: { y: 5 }, c: { y: 5 } });
  const mid = alignWorks(works, "middle");
  for (const w of works) assert.equal(mid[w.id].y + w.h / 2, 25);
  const centre = alignWorks(works, "center");
  for (const w of works) assert.equal(centre[w.id].x + w.w / 2, 50);
  assert.deepEqual(alignWorks([works[0]], "left"), {}, "one work has nothing to line up with");
});

test("distribute keeps the ends and evens the gaps", () => {
  const works = [work("a", 0, 0, 10), work("b", 15, 0, 20), work("c", 90, 0, 10)];
  const out = distributeWorks(works, "x");
  assert.equal(out.a.x, 0);
  assert.equal(out.c.x, 90);
  // Span 100, widths 40, so two gaps of 30.
  assert.equal(out.b.x, 40);
  assert.deepEqual(distributeWorks(works.slice(0, 2), "x"), {}, "two works have one gap");
  const up = distributeWorks([work("a", 0, 0, 10, 10), work("b", 0, 50, 10, 10), work("c", 0, 12, 10, 10)], "y");
  assert.equal(up.c.y, 25);
});
