// Lite and Pro: one table, one question. See src/tier.js.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TIER, PRO_ACTIONS, PRO_FEATURES, TIER_KEY, actionFeature, can, readTier, resolveTier, writeTier } from "../src/tier.js";

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), data };
};

test("Pro is the default, at the owner's word", () => {
  assert.equal(DEFAULT_TIER, "pro");
  assert.equal(readTier(memory()), "pro");
  assert.equal(resolveTier("nonsense"), "pro");
});

test("Pro can use everything; Lite cannot use a Pro feature", () => {
  for (const feature of Object.keys(PRO_FEATURES)) {
    assert.equal(can("pro", feature), true, feature);
    assert.equal(can("lite", feature), false, feature);
  }
});

test("a feature nobody listed is everyone's", () => {
  for (const feature of ["snap", "savedViews", "tags", "walk", "png", undefined, ""]) {
    assert.equal(can("lite", feature), true, String(feature));
  }
});

test("every gated action names a feature that exists", () => {
  for (const [action, feature] of Object.entries(PRO_ACTIONS)) {
    assert.ok(feature in PRO_FEATURES, `${action} → ${feature}`);
    assert.equal(actionFeature(action), feature);
  }
  assert.equal(actionFeature("undo"), null);
});

test("the tier is remembered per browser, and storage failing costs only the memory", () => {
  const store = memory();
  assert.equal(writeTier("lite", store), true);
  assert.equal(store.data[TIER_KEY], "lite");
  assert.equal(readTier(store), "lite");
  writeTier("bogus", store);
  assert.equal(readTier(store), "pro", "an unknown tier is written as the default");
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readTier(broken), "pro");
  assert.equal(writeTier("lite", broken), false);
});
