// Room finishes: paint per room and per side, a floor material, a ceiling.
// These pin that a room with no finish draws as it always did, that a shared
// wall is painted on each face by the room it looks into, and that schema 1
// still refuses anything it does not know.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FURNITURE, homeProject, validateProject } from "../src/model.js";
import { roomWalls, newRoom, roomBeside } from "../src/rooms.js";
import { DEFAULT_FLOOR, FLOOR_FINISHES, ceilingColor, floorColor, floorFinish, roomBehind, setFinish, sideColor, validFinish, wallFaces } from "../src/finishes.js";

test("a room with no finish is the house's wall colour, oak and white", () => {
  const p = homeProject();
  const r = newRoom();
  assert.equal(sideColor(p, r, "n"), p.booth.color);
  assert.equal(floorFinish(r), DEFAULT_FLOOR);
  assert.equal(floorColor(r), FLOOR_FINISHES.oak.color);
  assert.equal(ceilingColor(r), "#f7f6f2");
});

test("the starter floor gives kitchen and bathroom tile, bedroom carpet", () => {
  const p = homeProject();
  const byType = Object.fromEntries(p.booth.rooms.map((r) => [r.type, floorFinish(r)]));
  assert.deepEqual(byType, { living: "oak", kitchen: "tile", bedroom: "carpet", bath: "tile-small" });
  validateProject(p);
});

test("a shared wall is painted on each face by the room it looks into", () => {
  const p = homeProject();
  const [living, kitchen] = p.booth.rooms;
  living.finish = { walls: "#c9d3c4" };
  kitchen.finish = { walls: "#b7765a", sides: { w: "#45474a" } };
  const shared = roomWalls(p).find((w) => w.room === living.id && w.side === "e");
  assert.ok(shared, "living room owns the wall it shares with the kitchen");
  assert.equal(roomBehind(p, shared).room.id, kitchen.id);
  assert.deepEqual(wallFaces(p, shared), { front: "#c9d3c4", back: "#45474a" }, "kitchen's own west-wall colour wins over its room paint");
  const outside = roomWalls(p).find((w) => w.room === living.id && w.side === "w");
  assert.equal(roomBehind(p, outside), null);
  assert.deepEqual(wallFaces(p, outside), { front: "#c9d3c4", back: p.booth.color });
});

test("setFinish sets, clears and leaves no empty record behind", () => {
  let r = newRoom();
  r.finish = setFinish(r, "walls", "#C9D3C4");
  assert.deepEqual(r.finish, { walls: "#c9d3c4" });
  r.finish = setFinish(r, "side-n", "#45474a");
  assert.deepEqual(r.finish.sides, { n: "#45474a" });
  r.finish = setFinish(r, "floor", "walnut");
  r.finish = setFinish(r, "floorColor", "#333333");
  r.finish = setFinish(r, "floor", "marble");
  assert.equal(r.finish.floorColor, undefined, "a new material starts in its own colour");
  r.finish = setFinish(r, "side-n", undefined);
  r.finish = setFinish(r, "walls", "");
  r.finish = setFinish(r, "floor", "");
  assert.equal(r.finish, undefined);
  r.finish = setFinish(r, "floor", "lava");
  assert.equal(r.finish, undefined, "an unknown material is ignored");
});

test("schema 1 refuses a finish it does not know", () => {
  assert.ok(validFinish(undefined));
  assert.ok(validFinish({ walls: "#ffffff", sides: { e: "#000000" }, floor: "tile", floorColor: "#123456", ceiling: "#eeeeee" }));
  for (const bad of [null, [], { walls: "red" }, { floor: "lava" }, { floor: "__proto__" }, { sides: { up: "#ffffff" } }, { sides: [] }, { gloss: 1 }])
    assert.equal(validFinish(bad), false, JSON.stringify(bad));
  const p = homeProject();
  p.booth.rooms[0].finish = { walls: "red" };
  assert.throws(() => validateProject(p));
  p.booth.rooms[0].finish = { walls: "#aabbcc" };
  validateProject(p);
  delete p.booth.rooms[0].finish;
  validateProject(p);
});

test("the home set: every piece has limits that hold its own default", () => {
  for (const k of ["bed", "sofa", "armchair", "dining", "coffee", "desk", "cabinet", "wallcab", "shelves", "dresser", "nightstand", "rug"]) {
    const f = FURNITURE[k];
    assert.ok(f, k);
    for (const d of ["width", "depth", "height"]) assert.ok(f[d] >= f.limits[d][0] && f[d] <= f.limits[d][1], `${k} ${d}`);
  }
});
