// The hall planner and the power and rentals sheet: the arithmetic, pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_HALL_BOOTHS, boothOf, hallCSV, hallHTML, hallLayout, hallSize, hallTotals, newHall, validHall } from "../src/hall.js";
import { CIRCUIT_WATTS, WATTS, powerHTML, powerLines, powerTotals, rentalLines } from "../src/power.js";
import { blankProject, validateProject } from "../src/model.js";

test("a new plan is two back-to-back rows of eight, numbered from 101", () => {
  const h = newHall();
  const layout = hallLayout(h);
  assert.equal(layout.length, 16);
  assert.deepEqual(layout.slice(0, 3).map((b) => b.number), [101, 102, 103]);
  assert.equal(layout[8].number, 109);
  // Back to back: row 2 starts where row 1 ends, with no aisle between.
  assert.equal(layout[8].y, layout[0].y + h.boothDepth);
  assert.equal(layout[8].faces, "back");
  const size = hallSize(h);
  assert.equal(size.width, h.aisle * 2 + 8 * h.boothWidth);
  assert.equal(size.depth, h.aisle * 2 + 2 * h.boothDepth);
});

test("rows that are not back to back each get an aisle", () => {
  const h = { ...newHall(), backToBack: false, rows: 3 };
  const layout = hallLayout(h);
  const ys = [...new Set(layout.map((b) => b.y))];
  assert.deepEqual(ys, [h.aisle, h.aisle * 2 + h.boothDepth, h.aisle * 3 + h.boothDepth * 2]);
});

test("totals count statuses, money and floor", () => {
  const h = newHall();
  h.price = 500;
  h.booths = { 101: { status: "sold", name: "Ada Pottery" }, 102: { status: "held" }, 103: { status: "sold", price: 750 } };
  const t = hallTotals(h);
  assert.deepEqual([t.booths, t.sold, t.held, t.open], [16, 2, 1, 13]);
  assert.equal(t.soldValue, 1250);
  assert.equal(t.heldValue, 500);
  assert.equal(t.sqft, 1600);
  assert.equal(boothOf(h, 104).status, "open");
});

test("the CSV quotes what it has to", () => {
  const h = newHall();
  h.booths = { 101: { status: "sold", name: 'Smith, "Studio"' } };
  const csv = hallCSV(h).split("\n");
  assert.equal(csv[0], "Booth,Row,Size (ft),Status,Exhibitor,Price,Note");
  assert.equal(csv[1], '101,1,10 x 10,Sold,"Smith, ""Studio""",,');
  assert.equal(csv.length, 18);
  assert.match(hallHTML(h, "Spring Fair"), /Spring Fair · Hall map/);
});

test("a hall plan is optional in schema 1 and checked when present", () => {
  const p = blankProject();
  assert.doesNotThrow(() => validateProject(p));
  p.hall = newHall();
  p.hall.booths = { 101: { status: "sold", name: "A", price: 400 } };
  p.hall.mine = 101;
  assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(p))));
  for (const bad of [
    { ...newHall(), rows: 0 },
    { ...newHall(), rows: 40, perRow: 60 },
    { ...newHall(), booths: { 101: { status: "gone" } } },
    { ...newHall(), booths: { abc: {} } },
    { ...newHall(), aisle: 12 },
  ])
    assert.equal(validHall(bad), false, JSON.stringify(bad).slice(0, 60));
  assert.ok(40 * 60 > MAX_HALL_BOOTHS);
});

test("power: every load, amps at 120 V and circuits at 80%", () => {
  const p = blankProject();
  p.lights = [{ id: "a", x: 0, y: 90, z: 0, tx: 0, ty: 50, tz: -50, power: 80, kelvin: 4000 }, { id: "b", x: 0, y: 90, z: 0, tx: 0, ty: 50, tz: -50, power: 80, kelvin: 4000, on: false }];
  p.booth.pedestals = [{ id: "t", kind: "tv", x: 0, z: 0, width: 44, depth: 20, height: 72, rotation: 0 }];
  const lines = powerLines(p, { outlets: 2 });
  assert.deepEqual(lines.map((l) => [l.count, l.watts]), [[1, WATTS.spot], [1, WATTS.screen], [2, WATTS.outlet]], "a hidden light draws nothing");
  const t = powerTotals(lines);
  assert.equal(t.watts, 15 + 120 + 300);
  assert.equal(t.circuits, 1);
  assert.equal(powerTotals([{ count: 1, watts: CIRCUIT_WATTS + 1 }]).circuits, 2);
  assert.equal(powerTotals([]).circuits, 0);
});

test("rentals: the floor's furniture by kind, and carpet for the booth", () => {
  const p = blankProject();
  p.booth.pedestals = [
    { id: "a", kind: "chair", x: 0, z: 0, width: 18, depth: 18, height: 33, rotation: 0 },
    { id: "b", kind: "chair", x: 20, z: 0, width: 18, depth: 18, height: 33, rotation: 0 },
    { id: "c", kind: "table6", x: 0, z: 30, width: 72, depth: 30, height: 30, rotation: 0, hidden: true },
  ];
  const lines = rentalLines(p);
  assert.deepEqual(lines.find((l) => /Chair/.test(l.label)), { label: "Chair", count: 2, unit: "each" });
  assert.equal(lines.some((l) => /table/.test(l.label)), false, "a hidden piece is not rented");
  assert.equal(lines.find((l) => l.label === "Carpet").count, 100);
  assert.match(powerHTML(p), /order \d+ circuit/);
});
