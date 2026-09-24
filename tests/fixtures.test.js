// Light fixtures and daylight (phase 4). These pin the sun's geometry against
// what anyone can check by standing outside — noon due south and highest in
// June, sunrise in the east — and that schema 1 takes the new records only in
// the shapes it knows, and still loads a project that has none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homeProject, validateProject } from "../src/model.js";
import { newRoom } from "../src/rooms.js";
import { LIGHT_KINDS, candela, daylightSpec, hourLabel, lightSpot, newLight, sunDirection, sunLook, sunPosition, validDaylight, validLights } from "../src/fixtures.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} not within ${tol} of ${b}`);

test("noon is due south, highest at midsummer, at 90° − latitude + declination", () => {
  const june = sunPosition(12, 6, 40),
    dec = sunPosition(12, 12, 40);
  near(june.azimuth, 180, 0.5, "June noon azimuth");
  near(june.altitude, 90 - 40 + 23.3, 1.5, "June noon altitude");
  near(dec.altitude, 90 - 40 - 23.3, 1.5, "December noon altitude");
  assert.ok(june.altitude > dec.altitude);
});

test("morning sun is in the east, evening in the west, midnight below the horizon", () => {
  const am = sunPosition(8, 3, 40),
    pm = sunPosition(16, 3, 40);
  assert.ok(am.azimuth > 90 && am.azimuth < 180, `morning ${am.azimuth}`);
  assert.ok(pm.azimuth > 180 && pm.azimuth < 270, `evening ${pm.azimuth}`);
  near(am.altitude, pm.altitude, 0.01, "symmetric about noon");
  assert.ok(sunPosition(0, 6, 40).altitude < 0);
  assert.ok(sunPosition(4.5, 12, 40).altitude < 0, "no sun at half past four in December");
});

test("the sun's direction follows the plan's north", () => {
  const noon = sunDirection({ on: true, hour: 12, month: 6, latitude: 40, north: 0 });
  // Due south is +Z on the plan.
  near(noon.x, 0, 1e-6, "no east–west at noon");
  assert.ok(noon.z > 0 && noon.y > 0);
  near(Math.hypot(noon.x, noon.y, noon.z), 1, 1e-9, "unit vector");
  // Turn the plan so its top faces east: true south is then to the plan's
  // right, +X, as it is for anyone facing east.
  const turned = sunDirection({ on: true, hour: 12, month: 6, latitude: 40, north: 90 });
  assert.ok(turned.x > 0.1, `south on a plan facing east is +X, got ${turned.x}`);
  near(turned.z, 0, 1e-6, "and not along Z");
});

test("the sun is weak and warm near the horizon, gone at night", () => {
  assert.equal(sunLook(-5).strength, 0);
  const low = sunLook(5),
    high = sunLook(60);
  assert.ok(low.strength < high.strength);
  assert.ok(low.kelvin < high.kelvin);
  assert.equal(hourLabel(15.25), "3:15 pm");
  assert.equal(hourLabel(12), "12:00 pm");
  assert.equal(hourLabel(6.5), "6:30 am");
});

test("a fixture hangs from its room's ceiling or stands on its floor, inside the room", () => {
  const r = newRoom({ x: 100, z: -50, width: 120, depth: 96, height: 108 });
  const pendant = newLight("pendant"),
    lamp = newLight("table", { x: 500, z: -500 });
  const hang = lightSpot(r, pendant);
  assert.deepEqual([hang.x, hang.z], [100, -50]);
  assert.equal(hang.y, 108 - LIGHT_KINDS.pendant.drop);
  const stand = lightSpot(r, lamp);
  assert.equal(stand.y, LIGHT_KINDS.table.y);
  assert.equal(stand.x, 100 + 54, "pulled in to 6″ from the east wall");
  assert.equal(stand.z, -50 - 42);
  assert.ok(candela(newLight("recessed")) > candela(newLight("recessed", { kind: "ceiling", lumens: 700 })), "a downlight aims its lumens");
});

test("schema 1 takes lights and daylight in their own shapes only", () => {
  const p = homeProject();
  validateProject(p);
  const r = p.booth.rooms[0];
  r.lights = [newLight("ceiling"), newLight("floor", { x: 30, on: false })];
  p.booth.daylight = { ...daylightSpec(p.booth), on: true, hour: 9.5 };
  validateProject(structuredClone(p));
  for (const bad of [
    [{ ...newLight("ceiling"), kind: "laser" }],
    [{ ...newLight("ceiling"), lumens: 1e6 }],
    [{ ...newLight("ceiling"), kelvin: 1000 }],
    [{ ...newLight("ceiling"), on: "yes" }],
    Array.from({ length: 13 }, () => newLight("ceiling")),
  ]) {
    assert.equal(validLights(bad), false);
    const q = structuredClone(p);
    q.booth.rooms[0].lights = bad;
    assert.throws(() => validateProject(q));
  }
  const dup = newLight("ceiling");
  assert.equal(validLights([dup, dup]), false);
  for (const bad of [{ hour: 12 }, { on: true, hour: 30 }, { on: true, month: 13 }, { on: true, latitude: 80 }, [], null])
    assert.equal(validDaylight(bad), false, JSON.stringify(bad));
  assert.equal(validDaylight(undefined), true);
  assert.equal(validDaylight({ on: false }), true);
});
