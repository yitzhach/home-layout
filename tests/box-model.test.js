// Draw-a-box and .glb models: what schema 1 accepts.
import test from "node:test";
import assert from "node:assert/strict";
import { BOX_LIMITS, FURNITURE, MAX_MODELS, blankProject, validateProject } from "../src/model.js";

const box = (over = {}) => ({ id: "b", name: "Box 1", kind: "box", x: 0, z: 0, width: 48, depth: 24, height: 12, rotation: 0, ...over });

test("a drawn box may be a stage: bigger than any piece of furniture", () => {
  assert.ok(FURNITURE.box);
  const p = blankProject();
  p.booth.pedestals = [box({ width: 240, depth: 120, height: 8 })];
  assert.doesNotThrow(() => validateProject(p));
  p.booth.pedestals = [box({ height: 2 })];
  assert.doesNotThrow(() => validateProject(p), "a 2″ riser");
  for (const bad of [{ width: BOX_LIMITS.width[1] + 1 }, { height: 0 }, { depth: "big" }]) {
    const q = blankProject();
    q.booth.pedestals = [box(bad)];
    assert.throws(() => validateProject(q), /not a valid Booth Studio/);
  }
  // Furniture keeps its own limits: a 240″ table is still refused.
  const q = blankProject();
  q.booth.pedestals = [box({ kind: "table6", width: 240 })];
  assert.throws(() => validateProject(q), /not a valid Booth Studio/);
});

const glb = "data:model/gltf-binary;base64,Z2xURgIAAAA=";
test("a model names a model asset in the backup", () => {
  const p = blankProject();
  p.assets.m = { name: "vase.glb", width: 1, height: 1, role: "model", data: glb };
  p.booth.models = [{ id: "a", asset: "m", name: "Vase", height: 30, x: 0, z: 0, rotation: 0 }];
  assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(p))));
  for (const bad of [
    { ...p.booth.models[0], asset: "nope" },
    { ...p.booth.models[0], height: 0 },
    { ...p.booth.models[0], x: 1e5 },
  ]) {
    const q = structuredClone(p);
    q.booth.models = [bad];
    assert.throws(() => validateProject(q), /not a valid Booth Studio/);
  }
  const many = structuredClone(p);
  many.booth.models = Array.from({ length: MAX_MODELS + 1 }, (_, i) => ({ ...p.booth.models[0], id: "m" + i }));
  assert.throws(() => validateProject(many), /not a valid Booth Studio/);
});

test("a model asset must be glTF, and an image asset must still be an image", () => {
  const p = blankProject();
  p.assets.m = { name: "x.glb", width: 1, height: 1, role: "model", data: "data:image/png;base64,AA" };
  assert.throws(() => validateProject(p), /not a valid Booth Studio/);
  const q = blankProject();
  q.assets.i = { name: "x.png", width: 1, height: 1, role: "artwork", data: glb };
  assert.throws(() => validateProject(q), /not a valid Booth Studio/);
});
