import test from "node:test";
import assert from "node:assert/strict";
import { checklist, floorPlanSVG, inventory, priceTotal, priceValue, showPack } from "../src/showpack.js";
import { quickStart } from "../src/quickstart.js";

const work = (id, extra = {}) => ({ id, title: "Work " + id, wall: "back", face: "inside", x: 0, y: 30, w: 20, h: 30, thickness: 1, offset: 0.5, ...extra });

test("prices read the way people type them", () => {
  assert.equal(priceValue("$450"), 450);
  assert.equal(priceValue("1,200.50"), 1200.5);
  assert.equal(priceValue("£80 framed"), 80);
  assert.equal(priceValue("NFS"), null);
  assert.equal(priceValue(undefined), null);
  assert.deepEqual(priceTotal([{ price: "$100" }, { price: "250" }, { price: "on request" }, {}]), { total: 350, priced: 2, unpriced: 2 });
});

test("the inventory is this booth's work, wall by wall, left to right", () => {
  const p = quickStart({ size: "10x10" });
  p.art = [
    work("c", { wall: "right", x: 5 }),
    work("b", { x: 60 }),
    work("a", { x: 10 }),
    work("sign", { kind: "sign" }),
    work("far", { booth: "n1" }),
  ];
  assert.deepEqual(inventory(p).map((a) => a.id), ["a", "b", "c"]);
});

test("the checklist is worked out from the booth", () => {
  const fair = quickStart({ show: "artfair", size: "10x10", furniture: ["table6", "chair"] });
  fair.art = [work("1"), work("2"), work("3")];
  const groups = Object.fromEntries(checklist(fair).map((g) => [g.title, g.items]));
  assert.ok(groups.Structure.some((i) => /Canopy tent, 10 × 10 ft/.test(i.text)));
  assert.ok(groups.Structure.some((i) => i.qty === 4 && /Tent weights/.test(i.text)), "a canopy brings its weights");
  assert.ok(groups.Furniture.some((i) => i.qty === 1 && /Floor-length tablecloths/.test(i.text)), "a table brings its cloth");
  assert.ok(groups.Artwork.some((i) => i.qty === 6 && /hooks/.test(i.text)), "two hooks per work");
  assert.ok(groups["Every show"].length >= 5);

  const indoor = quickStart({ show: "artshow", size: "10x10" });
  const g2 = Object.fromEntries(checklist(indoor).map((g) => [g.title, g.items]));
  assert.ok(!g2.Structure.some((i) => /Tent/.test(i.text)), "no tent indoors");
  assert.ok(g2.Structure.some((i) => /Display panels/.test(i.text) && i.qty > 0));
  assert.ok(g2.Structure.some((i) => /Light-bar heads/.test(i.text)));
  assert.equal(g2.Artwork, undefined, "nothing hung, no artwork group");
  assert.ok(g2["Lighting and power"].some((i) => /Extension cord/.test(i.text)), "a light bar needs power");
});

test("the floor plan numbers every piece and states the footprint", () => {
  const p = quickStart({ show: "tradeshow", size: "10x20", furniture: ["table6", "chair", "bin"] });
  const svg = floorPlanSVG(p);
  assert.equal((svg.match(/<g transform="rotate/g) || []).length, 3);
  assert.match(svg, /20′ 0″ · 240″ wide/);
  assert.match(svg, /10′ 0″ · 120″ deep/);
});

test("the pack is one printable page that escapes what people typed", () => {
  const p = quickStart({ size: "10x10", furniture: ["table6"] });
  p.name = "<Fair>";
  p.art = [work("x", { title: "<b>Night</b>", price: "$300", medium: "Oil" })];
  const html = showPack(p);
  assert.match(html, /^<!doctype html>/);
  assert.ok(!html.includes("<b>Night</b>"), "titles are escaped");
  assert.match(html, /&lt;b&gt;Night&lt;\/b&gt;/);
  assert.match(html, /Listed total 300 across 1 priced work/);
  assert.match(html, /Packing and load-in/);
  assert.match(html, /Table 6′ with cloth/);
});

test("a hidden piece or wall is out of the plan and the packing list, and one shown is in", () => {
  const p = quickStart({ show: "artfair", size: "10x10", furniture: ["table6", "chair"] });
  p.booth.panels = [{ id: "w1", name: "Divider", width: 48, height: 72, x: 0, z: 0, rotation: 0 }];
  const table = p.booth.pedestals.find((x) => x.kind === "table6");
  const packed = (q) => checklist(q).flatMap((g) => g.items.map((it) => it.text)).join("\n");
  assert.match(packed(p), /Table 6′/);
  assert.match(packed(p), /Divider/);
  table.hidden = true;
  p.booth.panels[0].hidden = true;
  assert.doesNotMatch(packed(p), /Table 6′/, "a hidden table is not packed");
  assert.doesNotMatch(packed(p), /Divider/, "nor a hidden wall");
  const plan = floorPlanSVG(p);
  assert.equal((plan.match(/<text [^>]*font-weight="600">/g) || []).length, p.booth.pedestals.length - 1, "and only shown pieces are numbered on the plan");
  assert.doesNotMatch(showPack(p), /Table 6′ with cloth<\/td>/, "or listed under it");
});

test("work on a switched-off or hidden wall is out of the inventory", () => {
  const p = quickStart({ size: "10x10" });
  p.booth.walls.left.enabled = false;
  p.booth.panels = [{ id: "pz", name: "Panel", x: 0, z: 0, width: 48, height: 84, thickness: 2, rotation: 0, hidden: true }];
  p.art = [work("a"), work("off", { wall: "left" }), work("hid", { wall: "panel:pz" }), work("gone", { wall: "panel:nope" })];
  assert.deepEqual(inventory(p).map((a) => a.id), ["a"]);
  p.booth.panels[0].hidden = false;
  assert.deepEqual(inventory(p).map((a) => a.id).sort(), ["a", "hid"]);
});
