import test from "node:test";
import assert from "node:assert/strict";
import { fromTemplate, templateOf } from "../src/templates.js";
import { homeProject, validateProject } from "../src/model.js";

test("a template keeps the floor and drops the work and its images", () => {
  const p = homeProject();
  p.art = [{ id: "a" }];
  p.booth.surroundAsset = "img1";
  p.booth.ground = "upload:img2";
  p.booth.groundPreset = "carpet";
  p.booth.pedestals = [{ id: "s", kind: "sofa", width: 84, depth: 36, height: 34, x: 0, z: 0, rotation: 0 }];
  p.booth.rooms[0].finishes = { floor: { kind: "tile", color: "#e8e6e1" } };
  const t = templateOf(p, "Maple Street");
  assert.equal(t.label, "Maple Street");
  assert.equal(t.booth.surroundAsset, undefined);
  assert.equal(t.booth.ground, "carpet", "a photographed floor falls back to its preset");
  const q = fromTemplate(t, "Next house");
  validateProject(q);
  assert.equal(q.name, "Next house");
  assert.equal(q.art.length, 0);
  assert.equal(q.booth.rooms.length, 4, "the rooms come across");
  assert.equal(q.booth.rooms[0].finishes.floor.kind, "tile", "with their finishes");
  assert.equal(q.booth.pedestals.length, 1, "and the furniture");
  assert.ok(JSON.stringify(t).length < 20000, "small enough for localStorage");
});
