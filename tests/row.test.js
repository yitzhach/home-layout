import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GAP, DEFAULT_SPACE, MAX_SLOTS,
  addBooths, addSpace, artSlot, boothSlots, hasRow, normalizeRow,
  removeSlot, rowLayout, setSpaceWidth, slotOffset,
} from "../src/row.js";
import { blankProject, validateProject, openSpot } from "../src/model.js";

const booth = (row) => ({ width: 120, depth: 120, row });

test("a booth with no row of its own is a row of one, and it is home", () => {
  const row = normalizeRow({ width: 120 });
  assert.equal(row.slots.length, 1);
  assert.equal(row.slots[0].kind, "booth");
  assert.equal(row.home, row.slots[0].id);
  assert.equal(row.gap, DEFAULT_GAP);
  assert.equal(hasRow({ width: 120 }), false);
  // The home booth is the origin the scene already draws around.
  assert.deepEqual(rowLayout({ width: 120 }).map((s) => s.x), [0]);
});

test("booths added to a side stand a booth plus a gap apart", () => {
  const b = booth();
  const left = booth(addBooths(b, "left", 2));
  assert.deepEqual(rowLayout(left).map((s) => s.x), [-288, -144, 0]);
  const right = booth(addBooths(b, "right", 3));
  assert.deepEqual(rowLayout(right).map((s) => s.x), [0, 144, 288, 432]);
  // Home is still at the origin however long the row grows either way.
  assert.equal(rowLayout(right).find((s) => s.home).x, 0);
});

test("a space is a gap in the aisle and moves everything past it", () => {
  let b = booth(addBooths(booth(), "left", 1));
  b = booth(addSpace(b, "left", 60));
  const layout = rowLayout(b);
  assert.deepEqual(layout.map((s) => s.kind), ["space", "booth", "booth"]);
  // The neighbour is a booth-width and a gap away; the space then stands its
  // own width and one more gap beyond that.
  assert.equal(layout[1].x, -144);
  assert.equal(layout[0].x, -144 - 60 / 2 - DEFAULT_GAP - 120 / 2);
  assert.equal(rowLayout(booth(setSpaceWidth(b, layout[0].id, 96)))[0].width, 96);
});

test("home cannot be removed and a removed booth is gone from the row", () => {
  const row = addBooths(booth(), "right", 1);
  const other = row.slots.find((s) => s.id !== row.home);
  assert.equal(removeSlot(booth(row), row.home).slots.length, 2);
  assert.equal(removeSlot(booth(row), other.id).slots.length, 1);
});

test("a row stops at its limit rather than growing without one", () => {
  const b = booth(addBooths(booth(), "right", MAX_SLOTS + 20));
  assert.equal(normalizeRow(b).slots.length, MAX_SLOTS);
  assert.equal(normalizeRow(booth(addSpace(b, "right"))).slots.length, MAX_SLOTS);
});

test("artwork naming no booth hangs in this one", () => {
  const b = booth(addBooths(booth(), "left", 1));
  const other = boothSlots(b).find((s) => !s.home);
  assert.equal(artSlot(b, {}).home, true);
  assert.equal(artSlot(b, { booth: other.id }).id, other.id);
  assert.equal(slotOffset(b, other.id), -144);
  assert.equal(slotOffset(b, "not-a-slot"), 0);
});

test("a row of booths validates, and a slot that names no kind does not", () => {
  const p = blankProject();
  p.booth.row = addBooths(p.booth, "left", 2);
  validateProject(p);
  const other = boothSlots(p.booth).find((s) => !s.home);
  const work = {
    id: "w1", title: "Work", wall: "back", x: 10, y: 30, w: 24, h: 24,
    thickness: 1.5, offset: 0.75, booth: other.id,
  };
  p.art = [work];
  validateProject(p);
  // A work cannot name a booth the row does not hold.
  work.booth = "somewhere-else";
  assert.throws(() => validateProject(p));
  p.art = [];
  p.booth.row = { home: "home", slots: [{ id: "home" }] };
  assert.throws(() => validateProject(p));
});

test("the same spot in two booths is not an overlap", () => {
  const p = blankProject();
  p.booth.row = addBooths(p.booth, "right", 1);
  const other = boothSlots(p.booth).find((s) => !s.home);
  const a = { id: "a", wall: "back", x: 10, y: 30, w: 24, h: 24 };
  p.art = [a];
  // Home is taken, so a second work at home moves along the wall...
  assert.notEqual(openSpot(p, { ...a, id: "b" }).x, 10);
  // ...and the same spot in the booth next door is simply free.
  assert.deepEqual(
    [openSpot(p, { ...a, id: "c", booth: other.id }).x, openSpot(p, { ...a, id: "c", booth: other.id }).y],
    [10, 30],
  );
});

test("the aisle either side is left to the row once one is drawn", () => {
  const p = blankProject();
  p.booth.neighbors = true;
  assert.equal(normalizeRow(p.booth).slots.length, 1);
  p.booth.row = addBooths(p.booth, "left", 1);
  validateProject(p);
  assert.equal(hasRow(p.booth), true);
});

test("a space carries a width and a booth does not", () => {
  const row = addSpace(booth(), "right");
  const space = row.slots.find((s) => s.kind === "space");
  assert.equal(space.width, DEFAULT_SPACE);
  assert.equal(normalizeRow(booth(row)).slots.find((s) => s.kind === "booth").width, undefined);
});
