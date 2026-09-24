import test from "node:test";
import assert from "node:assert/strict";
import { dedupe, fold, rankTools } from "../src/toolsearch.js";

const entries = [
  { label: "Target height", where: "Lighting · Spotlights" },
  { label: "Height", where: "Layout · Footprint" },
  { label: "Brightness", where: "Lighting · Spotlights" },
  { label: "Brightness", where: "Lighting · Light bar" },
  { label: "Angle", where: "Lighting · Drop shadow" },
  { label: "Download show pack", where: "Export · Show pack" },
  { label: "Measure", where: "Toolbar" },
];

test("a query folds case, accents and punctuation", () => {
  assert.equal(fold("  Café–Lighting!  "), "cafe lighting");
});

test("an empty query lists nothing", () => {
  assert.deepEqual(rankTools(entries, "  "), []);
});

test("the shorter, exact label wins", () => {
  assert.deepEqual(rankTools(entries, "height").map((x) => x.label), ["Height", "Target height"]);
});

test("every word has to match, in the label or where it lives", () => {
  assert.deepEqual(rankTools(entries, "shadow angle").map((x) => x.label), ["Angle"]);
  assert.deepEqual(rankTools(entries, "light bar bright").map((x) => x.where), ["Lighting · Light bar"]);
  assert.deepEqual(rankTools(entries, "angle pack"), []);
});

test("a prefix finds the tool as it is typed", () => {
  assert.equal(rankTools(entries, "meas")[0].label, "Measure");
  assert.equal(rankTools(entries, "show")[0].label, "Download show pack");
});

test("the list is capped", () => {
  assert.equal(rankTools(entries, "i", 2).length, 2);
});

test("the same label twice in one place is one entry", () => {
  const list = dedupe([...entries, { label: "height", where: "Layout · Footprint" }, { label: " ", where: "x" }]);
  assert.equal(list.length, entries.length);
});
