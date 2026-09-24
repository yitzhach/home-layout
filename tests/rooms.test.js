import test from "node:test";
import assert from "node:assert/strict";
import {
  roomWalls, wallOpenings, wallPieces, subtract, houseExtent, roomBeside, newRoom, newOpening,
  starterRooms, validRooms, constrainRoom, findRoomWall, roomWallLabel, wallCorners, wallGaps, wallFootprint, WALL,
} from "../src/rooms.js";

const home = (rooms) => ({ booth: { rooms } });

test("a lone room stands four walls whose front faces look into it", () => {
  const r = newRoom({ x: 0, z: 0, width: 120, depth: 96 });
  const walls = roomWalls(home([r]));
  assert.equal(walls.length, 4);
  const by = Object.fromEntries(walls.map((w) => [w.side, w]));
  assert.deepEqual([by.n.width, by.s.width, by.e.width, by.w.width], [120, 120, 96, 96]);
  assert.deepEqual([by.n.x, by.n.z], [0, -48]);
  assert.deepEqual([by.e.x, by.e.z], [60, 0]);
  // Front normal of a frame turned r degrees is (sin r, cos r): into the room.
  for (const w of walls) {
    const r = (w.rotation * Math.PI) / 180, nx = Math.sin(r), nz = Math.cos(r);
    assert.ok(nx * (0 - w.x) + nz * (0 - w.z) > 0, `${w.side} faces the room`);
  }
});

test("a wall two rooms share is one wall, owned by the first", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ ...roomBeside(a, "e") });
  const walls = roomWalls(home([a, b]));
  assert.equal(walls.length, 7, "eight sides, one shared");
  assert.ok(walls.some((w) => w.room === a.id && w.side === "e"));
  assert.ok(!walls.some((w) => w.room === b.id && w.side === "w"));
});

test("a partly shared wall keeps only the part nobody owns", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ x: 120, z: 30, width: 120, depth: 180 }); // west side z -60..120, a's east -60..60
  const bw = roomWalls(home([a, b])).filter((w) => w.room === b.id && w.side === "w");
  assert.equal(bw.length, 1);
  assert.equal(bw[0].width, 60);
  assert.equal(bw[0].z, 90);
});

test("an open side removes the shared wall whichever room opened it", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ ...roomBeside(a, "e"), open: ["w"] });
  const walls = roomWalls(home([a, b]));
  assert.equal(walls.length, 6);
  assert.ok(!walls.some((w) => w.room === a.id && w.side === "e"));
});

test("a door typed in the second room cuts the first room's wall, swinging the right way", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ ...roomBeside(a, "e") });
  b.openings = [newOpening("door", { side: "w", x: 10, width: 30, swing: "in" })];
  const p = home([a, b]);
  const wall = roomWalls(p).find((w) => w.room === a.id && w.side === "e");
  const cuts = wallOpenings(p, wall);
  assert.equal(cuts.length, 1);
  // b's west wall runs from z=+60 northward; a's east wall from z=-60 southward.
  assert.equal(cuts[0].x, 120 - 40);
  assert.equal(b.x - b.width / 2, 60 + WALL, "the second room stands a wall away");
  assert.equal(cuts[0].width, 30);
  assert.equal(cuts[0].into, -1, "into b is away from a's front face");
});

test("wall pieces are the wall minus its openings, with sill and lintel", () => {
  const rects = wallPieces(120, 96, [{ x: 10, width: 30, sill: 0, height: 80 }, { x: 60, width: 40, sill: 30, height: 40 }]);
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.equal(area, 120 * 96 - 30 * 80 - 40 * 40);
  for (const r of rects) assert.ok(r.w > 0 && r.h > 0);
  assert.deepEqual(wallPieces(100, 90), [{ x: 0, y: 0, w: 100, h: 90 }]);
});

test("subtract leaves what is not cut", () => {
  assert.deepEqual(subtract(0, 100, [[20, 40], [60, 200]]), [[0, 20], [40, 60]]);
  assert.deepEqual(subtract(0, 100, [[-5, 105]]), []);
});

test("the starter floor is valid, has doors and windows, and its footprint holds it", () => {
  const rooms = starterRooms();
  assert.ok(validRooms(rooms));
  const p = home(rooms);
  const walls = roomWalls(p);
  const all = walls.flatMap((w) => wallOpenings(p, w));
  assert.ok(all.some((o) => o.kind === "door"));
  assert.ok(all.some((o) => o.kind === "window"));
  assert.ok(all.some((o) => o.kind === "arch"));
  // Every opening lands on exactly one wall.
  const ids = rooms.flatMap((r) => r.openings.map((o) => o.id));
  for (const id of ids) assert.equal(all.filter((o) => o.id === id).length, 1, "opening " + id);
  const ext = houseExtent(rooms);
  for (const w of walls) {
    assert.ok(Math.abs(w.x) <= ext.width / 2 && Math.abs(w.z) <= ext.depth / 2);
  }
  assert.match(roomWallLabel(p, walls[0].key), /Living room · North wall/);
  assert.ok(findRoomWall(p, walls[0].key));
});

test("validation refuses bad rooms and constrain pulls openings inside the wall", () => {
  assert.ok(validRooms(undefined));
  assert.ok(!validRooms([{ id: "a:b", name: "x", x: 0, z: 0, width: 100, depth: 100, height: 96 }]));
  assert.ok(!validRooms([{ id: "a", name: "x", x: 0, z: 0, width: 10, depth: 100, height: 96 }]));
  const r = constrainRoom(newRoom({ width: 60, openings: [newOpening("window", { side: "n", x: 50, width: 40, sill: 90 })] }));
  const o = r.openings[0];
  assert.ok(o.x + o.width <= 60);
  assert.ok(o.sill + o.height <= r.height);
});

test("a room resized keeps the edge it shares with its neighbour", async () => {
  const { resizeRoom } = await import("../src/rooms.js");
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const east = newRoom({ ...roomBeside(a, "e") });
  const grown = resizeRoom([a, east], east, "width", 168);
  assert.equal(grown.x - grown.width / 2, 60 + WALL, "west edge stays on the shared wall");
  const west = newRoom({ ...roomBeside(a, "w") });
  const g2 = resizeRoom([a, west], west, "width", 168);
  assert.equal(g2.x + g2.width / 2, -60 - WALL, "east edge stays on the shared wall");
  const alone = resizeRoom([a], a, "depth", 150);
  assert.equal(alone.z - alone.depth / 2, -60, "a lone room grows from its north-west corner");
});

test("walls stand behind their room's edge, a stud wall thick", () => {
  const r = newRoom({ x: 0, z: 0, width: 120, depth: 96 });
  const by = Object.fromEntries(roomWalls(home([r])).map((w) => [w.side, wallFootprint(w)]));
  assert.deepEqual(by.n, { x0: -60, x1: 60, z0: -48 - WALL, z1: -48 });
  assert.deepEqual(by.e, { x0: 60, x1: 60 + WALL, z0: -48, z1: 48 });
  assert.deepEqual(by.s, { x0: -60, x1: 60, z0: 48, z1: 48 + WALL });
  assert.deepEqual(by.w, { x0: -60 - WALL, x1: -60, z0: -48, z1: 48 });
});

test("a lone room's four outside corners are closed, and nothing else", () => {
  const r = newRoom({ x: 0, z: 0, width: 120, depth: 96 });
  const c = wallCorners(home([r]));
  assert.equal(c.length, 4);
  for (const q of c) {
    assert.equal(q.x1 - q.x0, WALL);
    assert.equal(q.z1 - q.z0, WALL);
    assert.equal(q.height, r.height);
    assert.ok(Math.abs(Math.abs(q.x0 + q.x1) / 2 - (60 + WALL / 2)) < 1e-9);
  }
});

test("two rooms a wall apart share the wall and the floor under it", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ ...roomBeside(a, "e") });
  const p = home([a, b]);
  const shared = roomWalls(p).filter((w) => w.room === a.id && w.side === "e");
  assert.equal(shared.length, 1);
  const f = wallFootprint(shared[0]);
  assert.equal(f.x1, b.x - b.width / 2, "the wall's far face is the neighbour's edge");
  assert.deepEqual(wallGaps(p).map((g) => [g.x0, g.x1, g.z0, g.z1]), [[60, 60 + WALL, -60, 60]]);
  // Four outer corners plus the two where the shared wall meets the outside.
  assert.equal(wallCorners(p).length, 6);
  b.open = ["w"];
  assert.equal(wallGaps(p).length, 1, "an open plan keeps its floor");
});

test("rooms saved touching, before walls were thick, still share one wall", () => {
  const a = newRoom({ x: 0, z: 0, width: 120, depth: 120 });
  const b = newRoom({ x: 120, z: 0, width: 120, depth: 120 });
  const walls = roomWalls(home([a, b]));
  assert.equal(walls.length, 7);
  assert.equal(wallGaps(home([a, b])).length, 0);
});
