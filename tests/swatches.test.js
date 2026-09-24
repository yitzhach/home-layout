// The saved palette and the Previous button. Small list arithmetic, but it is
// the kind that goes wrong quietly: a palette that grows past its seven slots,
// or a Previous button that offers the colour already showing.
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SWATCHES, isColor, readPalette, savePalette, removeSwatch, rememberColor, previousColor } from "../src/swatches.js";

test("only six-digit hex colours are colours", () => {
  assert.ok(isColor("#B7A68B"));
  for (const bad of ["#fff", "red", "rgb(1,2,3)", "", null, 7, "#ggghhh"]) assert.equal(isColor(bad), false, String(bad));
});

test("a palette holds seven and drops the oldest", () => {
  let palette = [];
  for (let i = 0; i < 10; i++) palette = savePalette(palette, `#0000${i}${i}`);
  assert.equal(palette.length, MAX_SWATCHES);
  assert.equal(palette[0], "#000099", "newest first");
  assert.ok(!palette.includes("#000000"), "and the first three are gone");
});

test("saving a colour already in the palette moves it rather than duplicating it", () => {
  const palette = savePalette(savePalette(["#111111", "#222222"], "#333333"), "#222222");
  assert.deepEqual(palette, ["#222222", "#333333", "#111111"]);
});

test("a stored palette from somewhere else is read defensively", () => {
  assert.deepEqual(readPalette(["#ABCDEF", "nonsense", "#abcdef", null, "#123456"]), ["#abcdef", "#123456"]);
  assert.deepEqual(readPalette("not a list"), []);
  assert.equal(readPalette(new Array(40).fill("#010101")).length, 1);
});

test("forgetting a swatch takes out that one and nothing else", () => {
  assert.deepEqual(removeSwatch(["#111111", "#222222"], "#222222"), ["#111111"]);
  assert.deepEqual(removeSwatch(["#111111"], "#999999"), ["#111111"]);
});

test("previous is the colour before the one showing, per control", () => {
  let history = {};
  history = rememberColor(history, "art|edgeColor", "#111111");
  history = rememberColor(history, "art|edgeColor", "#222222");
  assert.equal(previousColor(history, "art|edgeColor", "#222222"), "#111111");
  // A different control has its own history and offers nothing yet.
  assert.equal(previousColor(history, "booth|color", "#222222"), null);
  // The colour showing is never offered as the one to go back to.
  assert.equal(previousColor({ "a|b": ["#333333"] }, "a|b", "#333333"), null);
});

test("holding a colour twice in a row does not erase what came before it", () => {
  let history = rememberColor(rememberColor({}, "k", "#111111"), "k", "#222222");
  history = rememberColor(history, "k", "#222222");
  assert.equal(previousColor(history, "k", "#222222"), "#111111");
});
