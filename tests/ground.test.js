import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUND_KINDS,
  GROUND_UPLOAD,
  adoptGroundAsset,
  blankProject,
  groundKind,
  groundLibrary,
  groundUpload,
  removeGroundUpload,
  selectGround,
  validateProject,
} from "../src/model.js";

const photo = (name) => ({
  data: "data:image/png;base64,AAAA",
  width: 512,
  height: 512,
  name,
  role: "ground",
});
// A project carrying one uploaded ground, the way an older backup wrote it:
// the asset in the library and its id in the single `groundAsset` slot.
function legacyProject() {
  const p = blankProject();
  p.booth.ground = "grass";
  p.assets.floor = photo("warehouse-floor.jpg");
  p.booth.groundAsset = "floor";
  delete p.booth.groundPreset;
  return p;
}

test("presets and uploads are one list: choosing either switches the floor", () => {
  const p = blankProject();
  p.assets.floor = photo("floor.jpg");
  selectGround(p, "grass");
  assert.equal(groundKind(p), "grass");
  assert.equal(groundUpload(p), null);
  selectGround(p, GROUND_UPLOAD + "floor");
  assert.equal(groundUpload(p), "floor");
  assert.equal(groundKind(p), null);
  // The report this replaces: with an upload showing, picking a preset did
  // nothing at all. It now switches the floor like any other entry.
  selectGround(p, "concrete");
  assert.equal(groundUpload(p), null);
  assert.equal(groundKind(p), "concrete");
});

test("the library is the uploaded grounds, named, and never the artwork", () => {
  const p = blankProject();
  p.assets.floor = photo("stone floor.jpg");
  p.assets.painting = { ...photo("painting.jpg"), role: "artwork" };
  assert.deepEqual(groundLibrary(p), [{ id: "floor", name: "stone floor.jpg" }]);
});

test("an unknown or deleted upload id falls back rather than leaving no floor", () => {
  const p = blankProject();
  p.booth.ground = GROUND_UPLOAD + "gone";
  p.booth.groundPreset = "wood";
  assert.equal(groundUpload(p), null);
  assert.equal(groundKind(p), "wood");
  selectGround(p, GROUND_UPLOAD + "still-gone");
  assert.equal(p.booth.ground, GROUND_UPLOAD + "gone");
  selectGround(p, "not-a-kind");
  assert.equal(p.booth.ground, GROUND_UPLOAD + "gone");
});

test("deleting an upload removes the entry and returns to the last preset", () => {
  const p = blankProject();
  selectGround(p, "asphalt");
  p.assets.floor = photo("floor.jpg");
  selectGround(p, GROUND_UPLOAD + "floor");
  removeGroundUpload(p, "floor");
  assert.equal(p.assets.floor, undefined);
  assert.deepEqual(groundLibrary(p), []);
  assert.equal(groundKind(p), "asphalt");
});

test("deleting an upload keeps the image while a placement still uses it", () => {
  const p = blankProject();
  p.assets.floor = photo("floor.jpg");
  selectGround(p, GROUND_UPLOAD + "floor");
  p.art.push({ id: "a1", asset: "floor" });
  removeGroundUpload(p, "floor");
  assert.ok(p.assets.floor, "an image another placement shows is not deleted");
  assert.equal(groundKind(p), "studio");
});

test("an older backup's single ground override becomes the first library entry", () => {
  const migrated = adoptGroundAsset(legacyProject());
  assert.equal(groundUpload(migrated), "floor");
  assert.equal(migrated.booth.groundAsset, null);
  // The kind it was saved with is what removing the photograph comes back to.
  assert.equal(migrated.booth.groundPreset, "grass");
  assert.deepEqual(groundLibrary(migrated), [
    { id: "floor", name: "warehouse-floor.jpg" },
  ]);
  removeGroundUpload(migrated, "floor");
  assert.equal(groundKind(migrated), "grass");
});

test("an older backup keeps its floor even unmigrated, and opening one migrates it", () => {
  // The scene reads groundUpload directly, so a project handed straight to it
  // shows the photograph it was saved with.
  assert.equal(groundUpload(legacyProject()), "floor");
  const opened = validateProject(legacyProject());
  assert.equal(opened.booth.ground, GROUND_UPLOAD + "floor");
  assert.equal(opened.booth.groundAsset, null);
});

test("the widened ground enum accepts a kind or a present upload, nothing else", () => {
  for (const kind of GROUND_KINDS) {
    const p = blankProject();
    p.booth.ground = kind;
    assert.equal(validateProject(p).booth.ground, kind);
  }
  const p = blankProject();
  p.assets.floor = photo("floor.jpg");
  p.booth.ground = GROUND_UPLOAD + "floor";
  assert.equal(validateProject(p).booth.ground, GROUND_UPLOAD + "floor");
  for (const bad of [GROUND_UPLOAD + "missing", "upload", "marble", 3]) {
    const project = blankProject();
    project.booth.ground = bad;
    assert.throws(() => validateProject(project));
  }
  const preset = blankProject();
  preset.booth.groundPreset = "marble";
  assert.throws(() => validateProject(preset));
});

test("a backup written before groundPreset existed still opens", () => {
  const p = blankProject();
  delete p.booth.groundPreset;
  assert.equal(validateProject(p).booth.groundPreset, undefined);
  assert.equal(groundKind(p), "studio");
});
