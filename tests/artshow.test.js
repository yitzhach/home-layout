// The art-show booth: its venue switch, its panel module, its pedestals and
// the schema promise that none of it breaks a backup written before it
// existed. The renderer is tests/view-artshow.mjs; this is the arithmetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ART_SHOW,
  DIFFUSION_MAX,
  MAX_PEDESTALS,
  OUTDOOR,
  PEDESTAL,
  applyVenue,
  artShowPanel,
  blankProject,
  constrainPedestal,
  hallSpec,
  isArtShow,
  LIGHT_BAR,
  LIGHT_BAR_POWER_SLIDER_MAX,
  LIGHT_BAR_POWER_STEP,
  lightBarSpec,
  panelCount,
  relinkArtShowWalls,
  uid,
  validateProject,
} from "../src/model.js";
import { fixtureShare, lightBarBounce, lightBarFixtures, lightBarOptics } from "../src/lightbar.js";

const artShow = () => applyVenue(blankProject(), "artshow");

test("a new project is the outdoor booth it has always been", () => {
  const p = blankProject();
  assert.equal(isArtShow(p), false);
  assert.equal(p.booth.width, OUTDOOR.width);
  assert.equal(p.booth.walls.back.height, OUTDOOR.wallHeight);
  assert.deepEqual(p.booth.pedestals, []);
});

test("the art-show venue is the booth that was asked for", () => {
  const p = artShow();
  assert.equal(p.booth.venue, "artshow");
  assert.equal(p.booth.walls.back.width, 144, "144in back wall");
  assert.equal(p.booth.walls.left.width, 120, "120in side walls");
  assert.equal(p.booth.walls.right.width, 120);
  for (const wall of ["back", "left", "right"])
    assert.equal(p.booth.walls[wall].height, 144, wall + " wall is 144in tall");
  assert.equal(p.booth.tent, false, "no canopy indoors");
  assert.equal(p.booth.color, ART_SHOW.color, "white walls");
  assert.equal(lightBarSpec(p.booth).on, true, "the light bar is on");
  assert.equal(lightBarSpec(p.booth).count, 9, "nine fixtures");
  assert.equal(hallSpec(p.booth).on, true, "standing in a hall");
  assert.equal(hallSpec(p.booth).ceiling, 360, "30 foot ceilings");
  assert.equal(hallSpec(p.booth).showCeiling, false, "which is not drawn by default");
  validateProject(p);
});

test("switching back to the outdoor booth leaves nothing of the art show", () => {
  const p = applyVenue(artShow(), "outdoor");
  assert.equal(p.booth.width, OUTDOOR.width);
  assert.equal(p.booth.walls.back.height, OUTDOOR.wallHeight);
  assert.equal(lightBarSpec(p.booth).on, false);
  assert.equal(hallSpec(p.booth).on, false);
  validateProject(p);
});

test("a venue switch keeps artwork on its wall and inside it", () => {
  const p = artShow();
  p.art.push({ id: uid(), asset: null, title: "Tall", wall: "back", x: 100, y: 120,
    w: 40, h: 20, thickness: 1.5, offset: 0.75 });
  applyVenue(p, "outdoor");
  const a = p.art.at(-1);
  assert.equal(a.wall, "back", "it is still on the back wall");
  assert.ok(a.x + a.w <= p.booth.walls.back.width + 1e-9, "and no longer hangs off it");
  assert.ok(a.y + a.h <= p.booth.walls.back.height + 1e-9);
  validateProject(p);
});

test("the individual panel defaults to 38 inches and counts out each wall", () => {
  const p = artShow();
  assert.equal(artShowPanel(p.booth).width, 38);
  // 144 / 38 is 3.79: the nearest whole number of panels, not a fraction.
  assert.equal(panelCount(p, "back"), 4);
  assert.equal(panelCount(p, "left"), 3);
});

test("rebuilding from the panel module snaps each wall to whole panels", () => {
  const p = artShow();
  p.booth.artShow = { ...artShowPanel(p.booth), width: 30, height: 96 };
  relinkArtShowWalls(p);
  // Each wall keeps the number of 30in panels it is nearest to — 144 is 4.8
  // of them, so five — rather than the count it had at the old width. A
  // rebuild is meant to leave the booth about the size it already was.
  assert.equal(p.booth.walls.back.width, 150, "5 panels of 30in");
  assert.equal(p.booth.walls.left.width, 120, "4 panels of 30in");
  assert.equal(p.booth.walls.back.height, 96);
  assert.equal(p.booth.width, 150, "the footprint follows the back wall");
  assert.equal(p.booth.depth, 120, "and the depth follows a side wall");
  validateProject(p);
});

test("a wider panel cannot push a wall past the schema's limit", () => {
  const p = artShow();
  p.booth.artShow = { ...artShowPanel(p.booth), width: 200 };
  relinkArtShowWalls(p);
  for (const wall of ["back", "left", "right"])
    assert.ok(p.booth.walls[wall].width <= 360);
  validateProject(p);
});

test("nine fixtures are shared three to a wall, and remainders go to the back", () => {
  assert.deepEqual(fixtureShare(9), { left: 3, back: 3, right: 3 });
  assert.deepEqual(fixtureShare(8), { left: 3, back: 3, right: 2 });
  assert.deepEqual(fixtureShare(7), { left: 2, back: 3, right: 2 });
  assert.deepEqual(fixtureShare(1), { left: 0, back: 1, right: 0 });
});

test("every fixture hangs on the bar and is aimed at its own wall", () => {
  const p = artShow();
  const fixtures = lightBarFixtures(p);
  assert.equal(fixtures.length, 9);
  const bar = lightBarSpec(p.booth);
  for (const f of fixtures) {
    assert.equal(f.y, bar.height, "every head hangs at the bar's height");
    assert.ok(f.z > 0, "the bar is at the front of the booth");
    assert.ok(Math.abs(f.x) <= p.booth.width / 2, "and no head hangs off its end");
    if (f.wall === "back") assert.equal(f.tz, -p.booth.depth / 2);
    if (f.wall === "left") assert.equal(f.tx, -p.booth.width / 2);
    if (f.wall === "right") assert.equal(f.tx, p.booth.width / 2);
    assert.ok(f.ty > 0 && f.ty < p.booth.walls.back.height, "aimed at the wall's face");
  }
  // Left to right along the bar, and never two heads in one place.
  const xs = fixtures.map((f) => f.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.equal(new Set(xs).size, xs.length);
});

test("a hidden wall is given no fixtures, and its share is not handed on", () => {
  const p = artShow();
  p.booth.walls.left.enabled = false;
  const fixtures = lightBarFixtures(p);
  assert.equal(fixtures.filter((f) => f.wall === "left").length, 0);
  assert.equal(fixtures.length, 6, "six heads, not nine crowded onto two walls");
});

test("a bar that is off hangs nothing", () => {
  const p = artShow();
  p.booth.lightBar = { ...lightBarSpec(p.booth), on: false };
  assert.deepEqual(lightBarFixtures(p), []);
});

test("a pedestal is 44 by 12 by 12 with a solid top", () => {
  assert.deepEqual(PEDESTAL, { width: 12, depth: 12, height: 44, color: PEDESTAL.color });
});

test("a pedestal is pulled back inside the footprint, the way a panel is", () => {
  const p = artShow();
  const ped = constrainPedestal(p, { id: "a", ...PEDESTAL, x: 400, z: -400, rotation: 0 });
  assert.equal(ped.x, p.booth.width / 2);
  assert.equal(ped.z, -p.booth.depth / 2);
});

test("pedestals validate, and there is a limit", () => {
  const p = artShow();
  p.booth.pedestals = [{ id: "one", name: "Cards", ...PEDESTAL, x: 10, z: 10, rotation: 15 }];
  validateProject(p);
  p.booth.pedestals = Array.from({ length: MAX_PEDESTALS + 1 }, (_, i) => ({
    id: "p" + i, ...PEDESTAL, x: 0, z: 0, rotation: 0,
  }));
  assert.throws(() => validateProject(p));
  p.booth.pedestals = [{ id: "dup", ...PEDESTAL, x: 0, z: 0, rotation: 0 },
    { id: "dup", ...PEDESTAL, x: 0, z: 0, rotation: 0 }];
  assert.throws(() => validateProject(p), "two pedestals may not share an id");
  p.booth.pedestals = [{ id: "bad", ...PEDESTAL, height: 400, x: 0, z: 0, rotation: 0 }];
  assert.throws(() => validateProject(p), "a 400in pedestal is not a pedestal");
});

test("a backup written before any of this still opens", () => {
  // Exactly the shape a schema-1 backup had: no venue, no artShow, no
  // lightBar, no hall, no pedestals — and, as before, no panels either.
  const p = blankProject();
  for (const key of ["venue", "artShow", "lightBar", "hall", "pedestals", "panels"])
    delete p.booth[key];
  validateProject(p);
  assert.equal(isArtShow(p), false, "it is the outdoor booth it was");
  assert.equal(artShowPanel(p.booth).width, 38, "and reads the defaults for the rest");
  assert.equal(lightBarSpec(p.booth).on, true);
  assert.equal(hallSpec(p.booth).on, false);
  assert.deepEqual(lightBarFixtures(p).length, 9, "a light bar it never asked for is not drawn");
});

test("a booth is not both venues: an unknown venue is refused", () => {
  const p = blankProject();
  p.booth.venue = "gallery";
  assert.throws(() => validateProject(p));
});

test("diffusion softens every lever at once, and 0 is the bare source", () => {
  const bare = lightBarOptics({ ...LIGHT_BAR, diffusion: 0 });
  const soft = lightBarOptics({ ...LIGHT_BAR, diffusion: 1 });
  assert.ok(soft.angle > bare.angle, "a frosted head throws a wider cone");
  assert.ok(soft.penumbra > bare.penumbra, "and fades further out over its rim");
  assert.ok(
    soft.shadowIntensity < bare.shadowIntensity,
    "and fills its shadow rather than stacking a ninth hard one",
  );
  assert.ok(soft.normalBias > bare.normalBias, "a grazing wide cone needs more bias");
  assert.ok(
    soft.powerScale < bare.powerScale,
    "a wider cone lights more from the same fixture, so softer must not arrive brighter",
  );
  assert.equal(bare.shadowIntensity, 1, "diffusion 0 leaves the shadow untouched");
  assert.equal(bare.powerScale, 1, "diffusion 0 leaves the typed brightness alone");
  assert.ok(bare.angle >= Math.PI / 8 - 1e-9, "and is still a wall washer, not a floodlight");
});

test("the bar's default is diffused, and a backup written before it reads soft too", () => {
  assert.ok(LIGHT_BAR.diffusion > 0, "a bar out of the box is not a bare source");
  const p = artShow();
  // A schema-1 backup has no `diffusion` at all; the default must fill in.
  delete p.booth.lightBar.diffusion;
  assert.deepEqual(
    lightBarOptics(lightBarSpec(p.booth)),
    lightBarOptics(LIGHT_BAR),
    "an older backup is lit exactly as a new booth is",
  );
  validateProject(p);
});

test("the bounce tracks the bar's own output and stops when it does", () => {
  const p = artShow();
  const full = lightBarBounce(p);
  assert.ok(full > 0, "a diffused bar throws bounce off the hall");
  p.booth.lightBar = { ...lightBarSpec(p.booth), power: 0 };
  assert.equal(lightBarBounce(p), 0, "fixtures at zero leave no haze behind");
  p.booth.lightBar = { ...lightBarSpec(p.booth), power: 60, diffusion: 0 };
  assert.equal(lightBarBounce(p), 0, "a bare source is a bare source");
  p.booth.lightBar = { ...lightBarSpec(p.booth), diffusion: 0.7, on: false };
  assert.equal(lightBarBounce(p), 0, "no bar, no bounce");
});

test("diffusion outside 0..DIFFUSION_MAX is not a project", () => {
  const p = artShow();
  p.booth.lightBar = { ...lightBarSpec(p.booth), diffusion: DIFFUSION_MAX + 0.01 };
  assert.throws(() => validateProject(p));
  p.booth.lightBar = { ...lightBarSpec(p.booth), diffusion: -0.01 };
  assert.throws(() => validateProject(p));
  // The range was widened from 1 to 3 rather than moved. A booth saved at the
  // old maximum is still a project, which is the whole point of widening.
  p.booth.lightBar = { ...lightBarSpec(p.booth), diffusion: 1 };
  validateProject(p);
  p.booth.lightBar = { ...lightBarSpec(p.booth), diffusion: DIFFUSION_MAX };
  validateProject(p);
});

// The reason the optics curve is piecewise. Someone composed a booth against
// the lighting that 0.7 produced; widening the slider must not relight it.
test("widening the scale did not move anything underneath 1", () => {
  // These are the values the 0..1 table produced before the scale was widened,
  // written out as literals on purpose: checking the curve against itself
  // would pass no matter what the curve became.
  const before = {
    0: { angle: Math.PI / 8, penumbra: 0.45, shadowIntensity: 1, normalBias: 0.004, powerScale: 1 },
    0.5: { angle: 0.5454154, penumbra: 0.715, shadowIntensity: 0.66, normalBias: 0.009, powerScale: 0.84 },
    0.7: { angle: 0.6065019, penumbra: 0.821, shadowIntensity: 0.524, normalBias: 0.011, powerScale: 0.776 },
    1: { angle: Math.PI / 4.5, penumbra: 0.98, shadowIntensity: 0.32, normalBias: 0.014, powerScale: 0.68 },
  };
  for (const [d, want] of Object.entries(before)) {
    const got = lightBarOptics({ ...LIGHT_BAR, diffusion: +d });
    for (const key of Object.keys(want))
      assert.ok(
        Math.abs(got[key] - want[key]) < 5e-4,
        `diffusion ${d}: ${key} was ${want[key]} and is now ${got[key]}`,
      );
  }
});

test("past 1 the levers keep going the same way, with no step at the join", () => {
  const at = (d) => lightBarOptics({ ...LIGHT_BAR, diffusion: d });
  // Continuity: the two halves meet, rather than the slider jumping as it
  // crosses the old maximum.
  const join = at(1), justPast = at(1.0001);
  for (const key of ["angle", "penumbra", "shadowIntensity", "normalBias", "powerScale"])
    assert.ok(Math.abs(join[key] - justPast[key]) < 1e-3, `${key} steps at the join`);

  // Monotonic the whole way, in the direction each lever softens.
  let prev = at(0);
  for (let d = 0.1; d <= DIFFUSION_MAX + 1e-9; d += 0.1) {
    const now = at(d);
    assert.ok(now.angle >= prev.angle, `angle narrows at ${d}`);
    assert.ok(now.penumbra >= prev.penumbra, `penumbra sharpens at ${d}`);
    assert.ok(now.shadowIntensity <= prev.shadowIntensity, `shadow darkens at ${d}`);
    assert.ok(now.powerScale <= prev.powerScale, `softer arrives brighter at ${d}`);
    prev = now;
  }

  const top = at(DIFFUSION_MAX);
  assert.ok(top.penumbra <= 1, "penumbra is a fraction of the cone");
  assert.ok(top.angle < Math.PI / 2, "a spotlight's cone is still a cone");
  assert.ok(
    top.shadowIntensity > 0,
    "the last of the contact shadow is held on to: at 0 every pedestal floats",
  );
  // Clamped, not wrapped: a backup that somehow carries more is lit like 3.
  assert.deepEqual(at(DIFFUSION_MAX + 5), top, "above the top of the scale is the top of the scale");
  assert.deepEqual(at(-5), at(0), "below the bottom is the bottom");
});

test("the bounce ceiling rises past 1 and is unchanged below it", () => {
  const p = artShow();
  const bounceAt = (diffusion, power = 300) => {
    p.booth.lightBar = { ...lightBarSpec(p.booth), diffusion, power };
    return lightBarBounce(p);
  };
  // A bright bar is the only thing that ever reaches the cap, so it is the
  // only thing that can show the cap moved. At and below 1 it is still 0.6.
  assert.equal(bounceAt(1), 0.6, "the old ceiling still holds at the old maximum");
  assert.equal(bounceAt(0.7), 0.6, "and below it");
  assert.ok(bounceAt(DIFFUSION_MAX) > 0.6, "past 1 the room is allowed to do more of the work");
});

// Switching venue also switches the surroundings. An HDRI of a warehouse or an
// outdoor fair behind a seamless white indoor booth is one venue's light and
// another's walls, and it reads exactly as wrong as it is.
test("an art-show booth opens in the neutral studio environment", () => {
  const p = blankProject();
  p.booth.envPreset = "warehouse";
  p.booth.ground = "grass";
  p.booth.horizon = "park";
  applyVenue(p, "artshow");
  assert.equal(p.booth.envPreset, "studio");
  assert.equal(p.booth.ground, "studio");
  assert.equal(p.booth.horizon, "studio");
  assert.doesNotThrow(() => validateProject(p));
});

test("but the environment stays editable afterwards, and going back outdoors leaves it alone", () => {
  const p = blankProject();
  applyVenue(p, "artshow");
  p.booth.envPreset = "warehouse";
  assert.doesNotThrow(() => validateProject(p), "a photographed hall is still a legal choice indoors");
  applyVenue(p, "outdoor");
  assert.equal(p.booth.envPreset, "warehouse", "leaving the art show does not reach into the picker");
});

test("fixture brightness is a percentage of a bar that reads right", () => {
  // The slider is 0..100 and the middle of it is the default. That is the
  // whole promise: 50 is what a new booth opens at, 100 is twice it, and the
  // stored unit underneath is the light's own power.
  assert.equal(LIGHT_BAR_POWER_SLIDER_MAX, 100);
  assert.equal((LIGHT_BAR_POWER_SLIDER_MAX / 2) * LIGHT_BAR_POWER_STEP, LIGHT_BAR.power);
  assert.equal(LIGHT_BAR.power, 8);
  assert.equal(LIGHT_BAR_POWER_SLIDER_MAX * LIGHT_BAR_POWER_STEP, 16);
  // The stored range is untouched and stays untouched: a backup saved at the
  // old default, or at anything else the schema ever accepted, still opens.
  for (const power of [0, 8, 60, 70, 300]) {
    const p = artShow();
    p.booth.lightBar = { ...lightBarSpec(p.booth), power };
    assert.equal(validateProject(p).booth.lightBar.power, power);
  }
  const p = artShow();
  p.booth.lightBar = { ...lightBarSpec(p.booth), power: 300.01 };
  assert.throws(() => validateProject(p));
});
