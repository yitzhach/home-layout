// Clearance checks and elevations to scale: the geometry, pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { ACCESSIBLE, checkClearance, corners, gapBetween, overlaps } from "../src/clearance.js";
import { SCALES, elevation, elevationsHTML, fitScale, planSheet } from "../src/elevations.js";
import { blankProject, validateProject } from "../src/model.js";

const ped = (id, x, z, width = 24, depth = 24, rotation = 0) => ({ id, name: id, x, z, width, depth, height: 36, rotation });

test("corners turn the way three turns a group", () => {
  const c = corners(0, 0, 20, 10, 90);
  // Turned 90°, a 20 × 10 rectangle covers 10 across X and 20 along Z.
  const xs = c.map((v) => v[0]), zs = c.map((v) => v[1]);
  assert.ok(Math.abs(Math.max(...xs) - 5) < 1e-9 && Math.abs(Math.max(...zs) - 10) < 1e-9);
});

test("overlap and gap between rectangles", () => {
  const a = corners(0, 0, 20, 20), b = corners(30, 0, 20, 20), c = corners(15, 0, 20, 20);
  assert.equal(overlaps(a, b), false);
  assert.equal(overlaps(a, c), true);
  assert.equal(gapBetween(a, b).inches, 10);
  const turned = corners(40, 0, 20, 20, 45);
  assert.ok(Math.abs(gapBetween(a, turned).inches - (30 - 10 * Math.SQRT2)) < 1e-9, "a turned piece is measured from its corner");
});

test("a booth with room to walk is all clear", () => {
  const p = blankProject();
  // A 24″ pedestal in the middle of a 10 × 10: 48″ to every wall.
  p.booth.pedestals = [ped("a", 0, 0)];
  assert.deepEqual(checkClearance(p).filter((x) => x.kind !== "art-overlap"), []);
  // Two, 36″ apart and 30″ from the side walls: tight only at the walls.
  p.booth.pedestals = [ped("a", -24, 0, 12), ped("b", 24, 0, 12)];
  assert.ok(checkClearance(p).every((x) => !(x.ids.includes("pedestal:a") && x.ids.includes("pedestal:b"))), "exactly 36″ between them is enough");
});

test("a tight gap, an overlap and a piece outside the booth are each reported", () => {
  const p = blankProject();
  p.booth.pedestals = [ped("a", -20, 0), ped("b", 20, 0), ped("c", 20, 10), ped("d", 0, p.booth.depth / 2 + 5)];
  const issues = checkClearance(p);
  const kinds = issues.map((x) => x.kind);
  assert.ok(kinds.includes("overlap"), "b and c stand in each other");
  assert.ok(kinds.includes("outside"), "d pokes into the aisle");
  const tight = issues.find((x) => x.kind === "tight" && x.ids.includes("pedestal:a") && x.ids.includes("pedestal:b"));
  assert.ok(tight, "a and b have 16″ between them");
  assert.equal(tight.inches, 16);
  assert.ok(tight.inches < ACCESSIBLE);
  assert.equal(issues[0].level, "problem", "problems come first");
});

test("a piece pushed against a wall is meant, not tight", () => {
  const p = blankProject();
  // Flush against the back wall.
  p.booth.pedestals = [ped("a", 0, -p.booth.depth / 2 + 12)];
  assert.deepEqual(checkClearance(p).filter((x) => x.ids.includes("pedestal:a")), []);
  // 10″ off it is a gap nobody can walk through.
  p.booth.pedestals = [ped("a", 0, -p.booth.depth / 2 + 22)];
  assert.ok(checkClearance(p).some((x) => x.kind === "tight" && x.ids.includes("wall:back")));
});

test("works hung over each other are reported", () => {
  const p = blankProject();
  p.art = [
    { id: "x", title: "One", wall: "back", face: "inside", x: 10, y: 40, w: 20, h: 20, thickness: 1, offset: 0 },
    { id: "y", title: "Two", wall: "back", face: "inside", x: 25, y: 45, w: 20, h: 20, thickness: 1, offset: 0 },
  ];
  assert.ok(checkClearance(p).some((x) => x.kind === "art-overlap"));
});

test("scales: the largest that fits the sheet", () => {
  assert.equal(fitScale(96, 60).ratio, 12, "an 8 ft wall fits at 1″ = 1′");
  assert.equal(fitScale(144, 96).ratio, 16);
  assert.equal(fitScale(240, 96).ratio, 48);
  assert.equal(fitScale(1e6, 1e6), SCALES.at(-1), "anything too big takes the smallest");
});

test("an elevation is drawn in real inches at its scale, with every work and its centre line", () => {
  const p = blankProject();
  p.art = [{ id: "x", title: "Harbour", wall: "back", face: "inside", x: 10, y: 50, w: 20, h: 20, thickness: 1, offset: 0 }];
  const sheet = elevation(p, "back", "inside");
  const m = sheet.html.match(/<svg[^>]* width="([\d.]+)in"[^>]* viewBox="[-\d. ]+ ([\d.]+) [\d.]+"/);
  assert.ok(m, "sized in physical inches");
  assert.ok(Math.abs(Number(m[1]) * sheet.scale.ratio - Number(m[2])) < 0.01, "paper inches × scale = real inches");
  assert.match(sheet.html, /Harbour/);
  assert.match(sheet.html, /CL 5′ 0″/, "centre line at 60″");
  assert.match(planSheet(p).html, /Floor plan/);
  const all = elevationsHTML(p);
  assert.match(all, /Print at 100%/);
  assert.ok((all.match(/class="sheet"/g) || []).length >= 4, "plan plus the three inside faces");
});

test("the underlay is optional and must name an image in the backup", () => {
  const p = blankProject();
  assert.doesNotThrow(() => validateProject(p));
  p.assets.plan = { name: "plan.png", width: 1000, height: 800, data: "data:image/png;base64,AA" };
  p.booth.underlay = { asset: "plan", width: 1200, x: 0, z: 0, rotation: 0, opacity: 0.6, on: true };
  assert.doesNotThrow(() => validateProject(p));
  for (const bad of [{ ...p.booth.underlay, asset: "missing" }, { ...p.booth.underlay, opacity: 2 }, { ...p.booth.underlay, width: 1 }, "plan"]) {
    const q = structuredClone(p);
    q.booth.underlay = bad;
    assert.throws(() => validateProject(q), /not a valid Booth Studio/);
  }
});

test("a floor plan's image carries its own role, and a booth with one reopens", () => {
  const p = blankProject();
  p.assets.plan = { name: "plan.png", width: 1000, height: 800, role: "underlay", data: "data:image/png;base64,AA" };
  p.booth.underlay = { asset: "plan", width: 1200, x: 0, z: 0, rotation: 0, opacity: 0.6, on: true };
  assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(p))));
});
