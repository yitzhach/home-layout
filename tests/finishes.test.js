import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CEILING, DEFAULT_FLOOR, FINISH_KINDS, SURFACE_KINDS, ceilingFinish, floorFinish, tiling, validFinishes, wallFinish } from "../src/finishes.js";
import { newRoom, roomBeside, roomWalls, validRooms, wallBackRoom } from "../src/rooms.js";

test("a room with no finishes reads as oak, the house colour and a white ceiling", () => {
  const r = newRoom({ type: "living" });
  assert.deepEqual(floorFinish(r), DEFAULT_FLOOR);
  assert.deepEqual(ceilingFinish(r), DEFAULT_CEILING);
  assert.deepEqual(wallFinish(r, "n", "#123456"), { kind: "paint", color: "#123456" });
  // A bathroom starts tiled.
  assert.equal(floorFinish(newRoom({ type: "bath" })).kind, "tile");
});

test("a side's own finish beats the room's walls, which beat the house colour", () => {
  const r = newRoom({ finishes: { walls: { kind: "brick", color: "#a65a3f" }, e: { kind: "tile", color: "#ffffff" } } });
  assert.equal(wallFinish(r, "e").kind, "tile");
  assert.equal(wallFinish(r, "w").kind, "brick");
  // A finish a surface does not offer is ignored rather than drawn.
  r.finishes.floor = { kind: "brick", color: "#a65a3f" };
  assert.deepEqual(floorFinish(r), DEFAULT_FLOOR);
});

test("finishes validate, and a room carrying bad ones is refused", () => {
  assert.ok(validFinishes(undefined));
  assert.ok(validFinishes({ floor: { kind: "wood", color: "#b48a5e" }, n: { kind: "tile", color: "#eeeeee" } }));
  assert.ok(!validFinishes({ roof: { kind: "wood", color: "#b48a5e" } }));
  assert.ok(!validFinishes({ floor: { kind: "brick", color: "#b48a5e" } }), "brick is not a floor");
  assert.ok(!validFinishes({ floor: { kind: "wood", color: "brown" } }));
  assert.ok(!validFinishes([]));
  const r = newRoom();
  assert.ok(validRooms([r]));
  assert.ok(!validRooms([{ ...r, finishes: { floor: { kind: "lava", color: "#ff0000" } } }]));
  for (const [surface, kinds] of Object.entries(SURFACE_KINDS)) for (const k of kinds) assert.ok(FINISH_KINDS[k], `${surface}: ${k}`);
});

test("tiling lines up the pieces a door cuts a wall into", () => {
  const whole = tiling("tile", 120, 96, 0, 0),
    right = tiling("tile", 60, 96, 60, 0);
  assert.deepEqual(whole.repeat, [5, 4]);
  // The right-hand piece starts where the whole wall's 2.5th tile does.
  assert.deepEqual(right.offset, [2.5, 0]);
});

test("the face behind a shared wall belongs to the neighbour, and an outside wall has none", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ ...roomBeside(a, "e") });
  const p = { booth: { rooms: [a, b] } };
  const shared = roomWalls(p).find((w) => w.room === a.id && w.side === "e");
  assert.deepEqual(wallBackRoom(p, shared), { room: b, side: "w" });
  const outside = roomWalls(p).find((w) => w.room === a.id && w.side === "w");
  assert.equal(wallBackRoom(p, outside), null);
});
