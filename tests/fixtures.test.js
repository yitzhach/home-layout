// Which environments hide the spotlight housings, and why the rail stays.
import test from "node:test";
import assert from "node:assert/strict";
import { isIndoor, showFixtures, FIXTURE_MODES, DEFAULT_FIXTURES, ENV_PRESETS } from "../src/lighting.js";
import { blankProject, validateProject } from "../src/model.js";

test("indoors is the presets with a roof over them", () => {
  assert.equal(isIndoor("tradeshow"), true);
  // Trade show stopped being a photograph and stayed a room: it is still a
  // hall with its own overhead lighting, so the housings still hide.
  assert.equal(isIndoor("warehouse"), true);
  assert.equal(isIndoor("home"), true);
  assert.equal(isIndoor("artfair"), false, "an outdoor art fair has no hall lighting to borrow");
  assert.equal(isIndoor("studio"), false);
  assert.equal(isIndoor(undefined), false, "the default preset is the neutral studio");
  for (const id of Object.keys(ENV_PRESETS)) assert.equal(typeof isIndoor(id), "boolean");
});

test("auto hides the housings indoors and shows them everywhere else", () => {
  assert.equal(showFixtures("auto", "tradeshow"), false);
  assert.equal(showFixtures("auto", "home"), false);
  assert.equal(showFixtures("auto", "artfair"), true);
  assert.equal(showFixtures("auto", "studio"), true);
  assert.equal(showFixtures(undefined, "tradeshow"), false, "and auto is the default");
});

test("always and never are absolute, whatever the environment", () => {
  for (const preset of Object.keys(ENV_PRESETS)) {
    assert.equal(showFixtures("always", preset), true);
    assert.equal(showFixtures("never", preset), false);
  }
});

test("the setting is stored, bounded, and optional", () => {
  assert.ok(FIXTURE_MODES[DEFAULT_FIXTURES], "the default is one of the offered modes");
  const p = blankProject();
  assert.equal(p.booth.fixtures, DEFAULT_FIXTURES);
  for (const mode of Object.keys(FIXTURE_MODES)) {
    p.booth.fixtures = mode;
    assert.doesNotThrow(() => validateProject(p));
  }
  p.booth.fixtures = "sometimes";
  assert.throws(() => validateProject(p), /not a valid Booth Studio/);
});

// An art-show booth is indoors whatever the environment picker says: it stands
// in its own white hall with a light bar overhead, which is the thing the
// housings would be duplicating.
test("the art-show venue counts as indoors on its own", () => {
  assert.equal(isIndoor("studio", "artshow"), true);
  assert.equal(isIndoor("artfair", "artshow"), true);
  assert.equal(isIndoor("studio", "outdoor"), false);
  assert.equal(showFixtures("auto", "studio", "artshow"), false, "so auto hides the housings there");
  assert.equal(showFixtures("always", "studio", "artshow"), true, "and Always show still overrides it");
});
