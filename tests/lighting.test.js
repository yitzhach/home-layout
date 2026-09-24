import test from "node:test";
import assert from "node:assert/strict";
import {
  ENV_PRESETS,
  DEFAULT_PRESET,
  DEFAULT_FIDELITY,
  EnvironmentLighting,
  artEnvIntensity,
  presetPaths,
  resolvePreset,
} from "../src/lighting.js";

const fakeScene = () => ({
  environment: null,
  background: "procedural",
  fog: {},
  environmentIntensity: 1,
  backgroundIntensity: 1,
  backgroundRotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
});
const fakeRenderer = () => ({ toneMappingExposure: 0 });
const disposable = (name) => ({ name, disposed: false, dispose() { this.disposed = true; } });
const fakePMREM = () => ({
  disposed: false,
  fromEquirectangular(source) { return { texture: { source: source.name }, disposed: false, dispose() { this.disposed = true; } }; },
  dispose() { this.disposed = true; },
});
// meta.json is optional — a hand-dropped backdrop has none — so most tests
// answer it the way a missing file does.
const noMeta = () => Promise.reject(new Error("404"));

// The app must run with public/assets empty, so an unknown or asset-free
// preset has to degrade to the procedural environment rather than fail.
test("unknown presets fall back to the default", () => {
  assert.equal(resolvePreset("nonsense").id, DEFAULT_PRESET);
  assert.equal(resolvePreset(undefined).id, DEFAULT_PRESET);
  assert.equal(resolvePreset("artfair").id, "artfair");
});

test("every preset declares a ground, horizon and exposure", () => {
  for (const [id, preset] of Object.entries(ENV_PRESETS)) {
    assert.ok(preset.label, `${id} label`);
    assert.ok(preset.ground && preset.horizon, `${id} surroundings`);
    assert.ok(preset.exposure > 0 && preset.exposure < 3, `${id} exposure`);
  }
  assert.equal(ENV_PRESETS[DEFAULT_PRESET].hdri, null, "default preset needs no assets");
});

test("preset paths split lighting from the visible backdrop", () => {
  assert.equal(presetPaths(resolvePreset(DEFAULT_PRESET)), null);
  const paths = presetPaths(resolvePreset("warehouse"));
  assert.match(paths.light, /\.hdr$/);
  assert.match(paths.background, /\.jpg$/);
  assert.match(paths.meta, /meta\.json$/);
  assert.notEqual(paths.light, paths.background);
});

test("accurate colour keeps the environment out of artwork shading", () => {
  assert.equal(artEnvIntensity(DEFAULT_FIDELITY), 0);
  assert.equal(artEnvIntensity("accurate"), 0);
  assert.equal(artEnvIntensity("scene"), 1);
});

test("an asset-free preset applies exposure and leaves the backdrop alone", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, { makePMREM: fakePMREM, loadMeta: noMeta });
  const result = await lighting.apply(scene, DEFAULT_PRESET);
  assert.equal(result.environment, false);
  assert.equal(scene.environment, null);
  assert.equal(scene.background, "procedural");
  assert.equal(renderer.toneMappingExposure, ENV_PRESETS[DEFAULT_PRESET].exposure);
});

test("a failed asset load leaves the procedural environment intact", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: noMeta,
    loadHDR: () => Promise.reject(new Error("404")),
    loadBackground: () => Promise.reject(new Error("404")),
  });
  const result = await lighting.apply(scene, "warehouse");
  assert.equal(result.environment, false);
  assert.equal(scene.environment, null);
  assert.equal(scene.background, "procedural");
  assert.equal(renderer.toneMappingExposure, ENV_PRESETS.warehouse.exposure);
});

test("a loaded preset sets environment and background", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: noMeta,
    loadHDR: () => Promise.resolve(disposable("hdr")),
    loadBackground: () => Promise.resolve(disposable("bg")),
  });
  const result = await lighting.apply(scene, "artfair");
  assert.equal(result.environment, true);
  assert.equal(scene.environment.source, "hdr");
  assert.equal(scene.background.name, "bg");
  assert.equal(scene.fog, null);
  assert.equal(scene.environmentIntensity, ENV_PRESETS.artfair.envIntensity);
});

test("a user panorama outranks the preset backdrop", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: noMeta,
    loadHDR: () => Promise.resolve(disposable("hdr")),
    loadBackground: () => { throw new Error("must not load a backdrop"); },
  });
  const result = await lighting.apply(scene, "artfair", { background: false });
  assert.equal(result.environment, true);
  assert.equal(scene.background, "procedural");
});

// Every update() rebuilds the scene, so swapping presets repeatedly must not
// accumulate render targets on the GPU.
test("swapping presets disposes the previous environment", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: noMeta,
    loadHDR: () => Promise.resolve(disposable("hdr")),
    loadBackground: () => Promise.resolve(disposable("bg")),
  });
  await lighting.apply(scene, "artfair");
  const first = lighting.target, firstBackdrop = lighting.backdrop;
  await lighting.apply(scene, "home");
  assert.equal(first.disposed, true);
  assert.equal(firstBackdrop.disposed, true);
  assert.equal(lighting.target.disposed, false);
  lighting.dispose();
  assert.equal(scene.environment.source, "hdr");
  assert.equal(lighting.pmrem, null);
});

test("a superseded load is discarded rather than applied late", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  let release;
  const slow = new Promise((resolve) => (release = resolve));
  let call = 0;
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: noMeta,
    loadHDR: () => (++call === 1 ? slow.then(() => disposable("stale")) : Promise.resolve(disposable("fresh"))),
    loadBackground: () => Promise.resolve(disposable("bg")),
  });
  const first = lighting.apply(scene, "artfair");
  await lighting.apply(scene, "home");
  release();
  const stale = await first;
  assert.equal(stale.stale, true);
  assert.equal(scene.environment.source, "fresh");
});

// Phase 2: the backdrop turns with the same control as a user panorama, and
// arrives divided by the headroom tools/hdri-prep.mjs measured.
test("the preset backdrop takes the panorama rotation", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: noMeta,
    loadHDR: () => Promise.resolve(disposable("hdr")),
    loadBackground: () => Promise.resolve(disposable("bg")),
  });
  await lighting.apply(scene, "artfair", { rotation: 90 });
  assert.equal(scene.backgroundRotation.y.toFixed(6), (Math.PI / 2).toFixed(6));
  assert.equal(scene.backgroundRotation.x, 0);
  assert.equal(scene.backgroundRotation.z, 0);
});

test("backdrop headroom comes back through backgroundIntensity", async () => {
  const load = (meta) => {
    const scene = fakeScene();
    const lighting = new EnvironmentLighting(fakeRenderer(), {
      makePMREM: fakePMREM,
      loadMeta: () => Promise.resolve(meta),
      loadHDR: () => Promise.resolve(disposable("hdr")),
      loadBackground: () => Promise.resolve(disposable("bg")),
    });
    return lighting.apply(scene, "artfair").then((result) => ({ scene, result }));
  };
  assert.equal((await load({ backgroundIntensity: 6.25 })).scene.backgroundIntensity, 6.25);
  // A backdrop the user dropped in by hand carries no metadata, and a broken
  // file must not black the sky out either.
  assert.equal((await load(null)).scene.backgroundIntensity, 1);
  assert.equal((await load({ backgroundIntensity: 0 })).scene.backgroundIntensity, 1);
  assert.equal((await load({ backgroundIntensity: "bright" })).scene.backgroundIntensity, 1);
});

test("an asset-free preset clears any headroom left by the last one", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: () => Promise.resolve({ backgroundIntensity: 8 }),
    loadHDR: () => Promise.resolve(disposable("hdr")),
    loadBackground: () => Promise.resolve(disposable("bg")),
  });
  await lighting.apply(scene, "artfair");
  assert.equal(scene.backgroundIntensity, 8);
  await lighting.apply(scene, DEFAULT_PRESET);
  assert.equal(scene.backgroundIntensity, 1);
});

// update() runs on every edit. Re-filtering a 1K HDRI through PMREM on each
// one would stall a slider drag, so an unchanged preset must reuse what it has.
test("re-applying the same preset reuses the loaded environment", async () => {
  const scene = fakeScene(), renderer = fakeRenderer();
  let loads = 0;
  const lighting = new EnvironmentLighting(renderer, {
    makePMREM: fakePMREM,
    loadMeta: () => Promise.resolve({ backgroundIntensity: 4 }),
    loadHDR: () => { loads++; return Promise.resolve(disposable("hdr")); },
    loadBackground: () => Promise.resolve(disposable("bg")),
  });
  await lighting.apply(scene, "artfair", { rotation: 0 });
  const target = lighting.target, backdrop = lighting.backdrop;
  // The procedural environment rewrites these on every update, so the cached
  // path still has to put the preset's own back.
  scene.background = "procedural";
  scene.environment = null;
  scene.fog = {};
  const again = await lighting.apply(scene, "artfair", { rotation: 45 });
  assert.equal(loads, 1, "no second fetch for an unchanged preset");
  assert.equal(again.cached, true);
  assert.equal(lighting.target, target, "the filtered environment survives");
  assert.equal(scene.environment.source, "hdr");
  assert.equal(scene.background, backdrop);
  assert.equal(scene.backgroundIntensity, 4);
  assert.equal(scene.backgroundRotation.y.toFixed(6), (Math.PI / 4).toFixed(6));
  assert.equal(scene.fog, null);
  // Uploading a panorama changes what is being asked for, so it must reload.
  await lighting.apply(scene, "artfair", { background: false });
  assert.equal(loads, 2);
});
