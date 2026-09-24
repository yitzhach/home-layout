// Saved views, tags and walk mode: the rules, pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { EYE_HEIGHT, MAX_VIEWS, TAGS, newView, tagShown, validViews, walkStart, walkStep } from "../src/views.js";
import { blankProject, validateProject } from "../src/model.js";

const pose = { position: [1, 1.6, 4], target: [0, 1.2, 0] };

test("a saved view is a named pose, and names do not repeat", () => {
  const a = newView(pose, "a");
  assert.equal(a.name, "View 1");
  assert.deepEqual(a.position, pose.position);
  const b = newView(pose, "b", [a, { ...a, id: "x", name: "View 2" }]);
  assert.equal(b.name, "View 3");
});

test("views are optional in schema 1 and checked when present", () => {
  const p = blankProject();
  assert.doesNotThrow(() => validateProject(p), "a booth with no views opens");
  p.views = [newView(pose, "a")];
  assert.doesNotThrow(() => validateProject(p));
  for (const bad of [
    "views",
    [{ ...newView(pose, "a"), position: [1, 2] }],
    [{ ...newView(pose, "a"), target: [0, NaN, 0] }],
    [newView(pose, "a"), newView(pose, "a")],
    Array.from({ length: MAX_VIEWS + 1 }, (_, i) => newView(pose, "v" + i)),
  ]) {
    const q = blankProject();
    q.views = bad;
    assert.throws(() => validateProject(q), /not a valid Booth Studio/);
  }
  assert.equal(validViews(undefined), true);
});

test("tags: absent from the hidden set means shown, and an untagged object is always shown", () => {
  const hidden = new Set(["art"]);
  assert.equal(tagShown(hidden, "art"), false);
  assert.equal(tagShown(hidden, "people"), true);
  assert.equal(tagShown(hidden, undefined), true);
  assert.ok(Object.keys(TAGS).length >= 6);
});

test("walk starts in the aisle at a visitor's eye height, facing the booth", () => {
  const start = walkStart({ width: 120, depth: 120 });
  assert.ok(Math.abs(start.position[1] - EYE_HEIGHT * 0.0254) < 1e-9);
  assert.ok(start.position[2] > 60 * 0.0254, "in front of the booth");
  assert.ok(start.target[2] < start.position[2], "looking in");
});

test("a step moves along the floor and keeps the view direction", () => {
  const up = { position: [0, 1.5, 3], target: [0, 1.6, 2.99] }; // looking slightly up
  const f = walkStep(up, 1, 0, 12);
  assert.ok(Math.abs(f.position[2] - (3 - 12 * 0.0254)) < 1e-9, "a foot toward the booth");
  assert.equal(f.position[1], 1.5, "never off the floor, whatever the head does");
  assert.ok(Math.abs(f.target[2] - f.position[2] - (up.target[2] - up.position[2])) < 1e-9, "target moves with it");
  const r = walkStep(up, 0, 1, 12);
  assert.ok(r.position[0] > 0, "right is +X when facing into the booth");
  const back = walkStep(f, -1, 0, 12);
  assert.ok(Math.abs(back.position[2] - 3) < 1e-9, "and back again");
});
