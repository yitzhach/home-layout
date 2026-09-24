// Furniture is a pedestal with a kind: these pin that every kind is a valid
// pedestal, that an unknown kind is refused, and that a pedestal saved
// before kinds existed is still a pedestal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FURNITURE, MAX_PEDESTALS, PEDESTAL, blankProject, furnitureKind, validateProject } from "../src/model.js";

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
  p.booth.pedestals = [piece("table6", { kind: "sofa" })];
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
    assert.ok(f.width >= 4 && f.width <= 96, `${k} width fits the schema`);
    assert.ok(f.depth >= 4 && f.depth <= 96, `${k} depth fits the schema`);
    assert.ok(f.height >= 6 && f.height <= 96, `${k} height fits the schema`);
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
  }
});
