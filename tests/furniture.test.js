// Furniture is a pedestal with a kind: these pin that every kind is a valid
// pedestal, that an unknown kind is refused, and that a pedestal saved
// before kinds existed is still a pedestal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FURNITURE, MAX_PEDESTALS, PEDESTAL, blankProject, furnitureKind, furnitureLimits, validateProject } from "../src/model.js";

const piece = (kind, extra = {}) => {
  const { label, ...size } = FURNITURE[kind];
  return { id: kind, name: label, ...size, ...(kind === "pedestal" ? {} : { kind }), x: 0, z: 0, rotation: 0, ...extra };
};

test("every kind of furniture validates at its own size", () => {
  const p = blankProject();
  p.booth.pedestals = Object.keys(FURNITURE).map((k) => piece(k));
  assert.ok(p.booth.pedestals.length <= MAX_PEDESTALS);
  validateProject(p);
});

test("an unknown kind is refused, and a kind-less pedestal is a pedestal", () => {
  const p = blankProject();
  p.booth.pedestals = [piece("table6", { kind: "hammock" })];
  assert.throws(() => validateProject(p));
  p.booth.pedestals = [piece("table6", { kind: "__proto__" })];
  assert.throws(() => validateProject(p), "only the listed kinds, not anything an object happens to carry");
  assert.equal(furnitureKind({ ...PEDESTAL }), "pedestal");
  assert.equal(furnitureKind({ kind: "table8" }), "table8");
  assert.equal(furnitureKind({ kind: "nonsense" }), "pedestal");
});

test("the pedestal default is unchanged", () => {
  const { label, ...size } = FURNITURE.pedestal;
  assert.deepEqual(size, PEDESTAL);
  assert.equal(label, "Pedestal");
});

test("sizes are the ones a show supplies", () => {
  assert.equal(FURNITURE.table6.width, 72);
  assert.equal(FURNITURE.table8.width, 96);
  assert.equal(FURNITURE.table6.height, 30);
  assert.equal(FURNITURE.table6.depth, 30);
  for (const [k, f] of Object.entries(FURNITURE)) {
    // Each kind within its own limits; every booth kind shares the furniture
    // limits the schema has always had. The box, the stairs and the home set
    // carry their own.
    const lim = furnitureLimits(k);
    for (const d of ["width", "depth", "height"])
      assert.ok(f[d] >= lim[d][0] && f[d] <= lim[d][1], `${k} ${d} fits the schema`);
    if (k !== "box" && !f.limits) assert.deepEqual(lim, { width: [4, 96], depth: [4, 96], height: [6, 96] });
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
  }
});
