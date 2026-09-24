import test from "node:test";
import assert from "node:assert/strict";
import { FOOTPRINTS, SHOWS, STARTERS, fromTemplate, quickStart, templateOf } from "../src/quickstart.js";
import { furnitureKind, isArtShow, validateProject } from "../src/model.js";

test("every show at every size is a valid booth of that size", () => {
  for (const show of Object.keys(SHOWS))
    for (const [size, fp] of Object.entries(FOOTPRINTS)) {
      const p = quickStart({ show, size, furniture: STARTERS });
      validateProject(p);
      assert.equal(p.booth.width, fp.width, `${show} ${size} width`);
      assert.equal(p.booth.depth, fp.depth, `${show} ${size} depth`);
      assert.equal(p.booth.walls.back.width, fp.width);
      assert.equal(p.booth.walls.left.width, fp.depth);
      assert.equal(p.art.length, 0, "a quick start hangs nothing");
      for (const ped of p.booth.pedestals) {
        assert.ok(Math.abs(ped.x) <= fp.width / 2 && Math.abs(ped.z) <= fp.depth / 2, `${show} ${size}: ${ped.name} stands inside`);
      }
    }
});

test("the show decides venue, canopy and surroundings", () => {
  const fair = quickStart({ show: "artfair" });
  assert.equal(fair.booth.venue, "outdoor");
  assert.equal(fair.booth.tent, true);
  assert.equal(fair.booth.envPreset, "artfair");
  const indoor = quickStart({ show: "artshow" });
  assert.ok(isArtShow(indoor));
  assert.equal(indoor.booth.tent, false);
  assert.equal(indoor.booth.lightBar.on, true);
  const trade = quickStart({ show: "tradeshow" });
  assert.equal(trade.booth.venue, "outdoor");
  assert.equal(trade.booth.tent, false);
  assert.equal(trade.booth.envPreset, "tradeshow");
});

test("starter furniture arrives as its kinds, and unknown answers fall back", () => {
  const p = quickStart({ show: "nonsense", size: "99x99", furniture: ["table6", "chair", "sofa"] });
  assert.equal(p.booth.width, 120);
  assert.equal(p.booth.venue, "outdoor");
  assert.deepEqual(p.booth.pedestals.map(furnitureKind), ["table6", "chair"]);
  assert.match(p.name, /10 × 10 ft art fair booth/);
  assert.equal(quickStart({ name: "  Main St Fair  " }).name, "Main St Fair");
});

test("a template keeps the booth and drops the work and its images", () => {
  const p = quickStart({ show: "artshow", size: "10x20", furniture: ["table6"] });
  p.art = [{ id: "a" }];
  p.booth.surroundAsset = "img1";
  p.booth.ground = "upload:img2";
  p.booth.groundPreset = "carpet";
  const t = templateOf(p, "Convention 10x20");
  assert.equal(t.label, "Convention 10x20");
  assert.equal(t.booth.surroundAsset, undefined);
  assert.equal(t.booth.ground, "carpet", "a photographed floor falls back to its preset");
  const q = fromTemplate(t, "Next show");
  validateProject(q);
  assert.equal(q.name, "Next show");
  assert.equal(q.art.length, 0);
  assert.equal(q.booth.width, 240);
  assert.ok(isArtShow(q));
  assert.equal(q.booth.pedestals.length, 1);
  assert.ok(JSON.stringify(t).length < 20000, "small enough for localStorage");
});
