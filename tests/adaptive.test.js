import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_LADDER, FrameBudget, GAP_MS, SAMPLE_FRAMES, SLOW_FRAME_MS, startScale, stepDown } from "../src/adaptive.js";

test("auto walks down one rung at a time and stops at one fragment per pixel", () => {
  assert.equal(stepDown(3), 2);
  assert.equal(stepDown(2), 1.5);
  assert.equal(stepDown(1.5), 1);
  assert.equal(stepDown(1), 1, "never below 1");
  assert.equal(stepDown(1.25), 1, "an off-ladder scale still lands on a rung");
  assert.deepEqual(AUTO_LADDER, [...AUTO_LADDER].sort((a, b) => b - a));
});

test("auto starts where Balanced always rendered", () => {
  assert.equal(startScale(1), 2, "a 1x monitor at Balanced's supersampling");
  assert.equal(startScale(2), 2);
  assert.equal(startScale(3), 3);
  assert.equal(startScale(undefined), 2);
});

test("a rung measured on this display is where the next visit starts", () => {
  assert.equal(startScale(1, { dpr: 1, scale: 1.5 }), 1.5);
  assert.equal(startScale(2, { dpr: 1, scale: 1 }), 2, "another display is another amount of work");
  assert.equal(startScale(1, { dpr: 1, scale: 7 }), 2, "a stored value off the ladder is not trusted");
  assert.equal(startScale(1, { dpr: 1, scale: 3 }), 2, "and never starts sharper than Balanced");
  assert.equal(startScale(1, null), 2);
});

test("a window of slow frames is one verdict", () => {
  const budget = new FrameBudget();
  let verdicts = 0;
  for (let i = 0; i < SAMPLE_FRAMES * 3; i++) if (budget.sample(SLOW_FRAME_MS + 10)) verdicts++;
  assert.equal(verdicts, 3);
});

test("fast frames, one hitch and idle gaps are not slow", () => {
  const budget = new FrameBudget();
  for (let i = 0; i < SAMPLE_FRAMES - 1; i++) assert.equal(budget.sample(16.7), false);
  assert.equal(budget.sample(200), false, "the median ignores a single long frame");
  for (let i = 0; i < SAMPLE_FRAMES * 2; i++) assert.equal(budget.sample(GAP_MS + 1), false, "a gap is not a frame");
  assert.equal(budget.samples.length, 0);
  for (const bad of [0, -5, NaN, undefined]) assert.equal(budget.sample(bad), false);
});

test("reset forgets a half-measured window", () => {
  const budget = new FrameBudget();
  for (let i = 0; i < SAMPLE_FRAMES - 1; i++) budget.sample(40);
  budget.reset();
  assert.equal(budget.sample(40), false);
  assert.equal(budget.samples.length, 1);
});
