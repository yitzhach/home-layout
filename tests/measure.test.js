import test from "node:test";
import assert from "node:assert/strict";
import { DIMENSION_OFFSET, distanceInches, footprint, formatLength, planDimensions } from "../src/measure.js";

test("a length reads the way a tape does", () => {
  assert.equal(formatLength(0), "0″");
  assert.equal(formatLength(5), "5″");
  assert.equal(formatLength(0.5), "½″");
  assert.equal(formatLength(11.75), "11¾″");
  assert.equal(formatLength(12), "1′ 0″ · 12″");
  assert.equal(formatLength(88.5), "7′ 4½″ · 88.5″");
  assert.equal(formatLength(120), "10′ 0″ · 120″");
  assert.equal(formatLength(119.9), "10′ 0″ · 119.9″", "rounds to the nearest quarter on the tape, keeps the typed figure");
  assert.equal(formatLength(-3.25), "−3¼″");
  assert.equal(formatLength(NaN), "");
});

test("distance is measured in inches between points in metres", () => {
  const IN = 0.0254;
  assert.ok(Math.abs(distanceInches({ x: 0, y: 0, z: 0 }, { x: 120 * IN, y: 0, z: 0 }) - 120) < 1e-9);
  assert.ok(Math.abs(distanceInches({ x: 0, y: 0, z: 0 }, { x: 3 * IN, y: 4 * IN, z: 0 }) - 5) < 1e-9);
});

test("a turned item covers more floor than its width says", () => {
  assert.deepEqual(footprint({ width: 12, depth: 12, rotation: 0 }), { hx: 6, hz: 6 });
  const turned = footprint({ width: 12, depth: 12, rotation: 45 });
  assert.ok(Math.abs(turned.hx - 6 * Math.SQRT2) < 1e-9);
  const quarter = footprint({ width: 72, depth: 30, rotation: 90 });
  assert.ok(Math.abs(quarter.hx - 15) < 1e-9 && Math.abs(quarter.hz - 36) < 1e-9);
});

test("the plan shows the booth's overall size outside the footprint", () => {
  const lines = planDimensions({ width: 120, depth: 96 });
  assert.equal(lines.length, 2);
  const [w, d] = lines;
  assert.equal(w.inches, 120);
  assert.equal(w.from.z, 48 + DIMENSION_OFFSET, "the width stands in front of the entrance");
  assert.equal(d.inches, 96);
  assert.equal(d.from.x, 60 + DIMENSION_OFFSET);
});

test("a selected item shows its clear floor to three walls", () => {
  const lines = planDimensions({ width: 120, depth: 120 }, { x: 30, z: 20, width: 24, depth: 12, rotation: 0 });
  const by = Object.fromEntries(lines.map((l) => [l.kind, l]));
  assert.equal(by.left.inches, 30 - 12 + 60, "from the left wall to its left edge");
  assert.equal(by.right.inches, 60 - (30 + 12));
  assert.equal(by.back.inches, 20 - 6 + 60, "from the back wall to its back edge");
  assert.equal(by.left.from.x, -60);
  assert.equal(by.back.from.z, -60);
});

test("an item pushed against a wall has no clearance on that side", () => {
  const kinds = planDimensions({ width: 120, depth: 120 }, { x: 54, z: 0, width: 12, depth: 12 }).map((l) => l.kind);
  assert.ok(!kinds.includes("right"));
  assert.ok(kinds.includes("left"));
});
