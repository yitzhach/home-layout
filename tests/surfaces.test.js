import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  GROUND_CONSUMER,
  GROUND_METRES,
  MAP_FILES,
  SURFACE_SETS,
  SurfaceTextures,
  repeatFor,
  surfacePaths,
} from "../src/surfaces.js";

const fakeRenderer = () => ({ capabilities: { getMaxAnisotropy: () => 16 } });
const fakeTexture = (name) => ({
  name,
  colorSpace: T.SRGBColorSpace,
  wrapS: T.ClampToEdgeWrapping,
  wrapT: T.ClampToEdgeWrapping,
  anisotropy: 1,
  repeat: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; }, setScalar(v) { this.x = this.y = v; } },
  disposed: false,
  dispose() { this.disposed = true; },
  // Real clones share their image source and carry their own repeat, which is
  // the whole reason two consumers can hold one set.
  clone() { const r = this.repeat; return { ...this, repeat: { ...r, set: r.set, setScalar: r.setScalar }, source: this, clone() { return fakeTexture(name); } }; },
});
// A stand-in for the rebuilt ground mesh: a real material would work, but the
// rules under test are about which slots get set, not about shading.
const fakeMesh = () => ({
  geometry: { attributes: { uv: { name: "uv" } }, setAttribute(key, value) { this.attributes[key] = value; } },
  material: {
    color: { value: null, set(v) { this.value = v; } },
    normalScale: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } },
    bumpMap: { name: "procedural" },
    userData: {},
    needsUpdate: false,
  },
});
const loaders = (present = Object.keys(MAP_FILES), meta = null) => ({
  loadTexture: (url) => {
    const slot = Object.keys(MAP_FILES).find((key) => url.endsWith(MAP_FILES[key]));
    return present.includes(slot) ? Promise.resolve(fakeTexture(slot)) : Promise.reject(new Error("404"));
  },
  loadMeta: () => (meta ? Promise.resolve(meta) : Promise.reject(new Error("404"))),
});

test("every surface set declares a real-world tile size", () => {
  for (const [id, set] of Object.entries(SURFACE_SETS)) {
    assert.ok(set.label, `${id} label`);
    assert.ok(set.tileMetres > 0 && set.tileMetres < 20, `${id} tile size`);
  }
});

// The whole point of deriving repeat: a 2 m tile is 2 m whatever it is a
// picture of, so surfaces stay the same scale as each other.
test("repeat is derived from the tile size, not hardcoded", () => {
  assert.equal(repeatFor(2), 90);
  assert.equal(repeatFor(1), 180);
  assert.equal(repeatFor(4), 45);
  assert.equal(repeatFor(2, 360), 180);
  // A missing or nonsense tile size must not divide by zero and blank the floor.
  assert.ok(Number.isFinite(repeatFor(0)));
  assert.ok(Number.isFinite(repeatFor(undefined)));
});

test("paths are named after the ground kind and include metadata", () => {
  assert.equal(surfacePaths("studio"), null);
  const paths = surfacePaths("concrete");
  assert.equal(paths.map, "assets/textures/concrete/color.jpg");
  assert.equal(paths.normalMap, "assets/textures/concrete/normal.jpg");
  assert.match(paths.meta, /meta\.json$/);
  // meta.json may rename the files; the app must follow it.
  const renamed = surfacePaths("concrete", { ...MAP_FILES, map: "color.webp" });
  assert.equal(renamed.map, "assets/textures/concrete/color.webp");
});

test("a ground kind with no files falls back rather than failing", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders([]));
  assert.equal(await surfaces.load("concrete"), null);
  assert.equal(await surfaces.load("studio"), null);
  assert.equal(surfaces.sets.size, 0);
});

test("a colour map alone is enough; the rest are optional", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders(["map"]));
  const set = await surfaces.load("grass");
  assert.ok(set.maps.map);
  assert.equal(set.maps.normalMap, undefined);
  assert.equal(set.maps.roughnessMap, undefined);
});

// Decoding a normal or roughness map through a gamma curve is the classic
// silent PBR bug: it looks "nearly right" and every angle is wrong.
test("only the colour map is sRGB", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const set = await surfaces.load("concrete");
  assert.equal(set.maps.map.colorSpace, T.SRGBColorSpace);
  for (const slot of ["normalMap", "roughnessMap", "aoMap"])
    assert.equal(set.maps[slot].colorSpace, T.NoColorSpace, `${slot} must stay linear`);
});

test("every map repeats and filters the same way", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const set = await surfaces.load("concrete");
  const mesh = fakeMesh();
  assert.equal(surfaces.applyTo(mesh, set), true);
  for (const slot of Object.keys(set.maps)) {
    const texture = mesh.material[slot];
    assert.ok(texture, `${slot} is bound to the material`);
    assert.equal(texture.wrapS, T.RepeatWrapping, `${slot} wrapS`);
    assert.equal(texture.wrapT, T.RepeatWrapping, `${slot} wrapT`);
    assert.equal(texture.anisotropy, 8, `${slot} anisotropy`);
    assert.equal(texture.repeat.x, repeatFor(set.tileMetres), `${slot} repeat`);
    assert.equal(texture.source, set.maps[slot], `${slot} shares the loaded map's source`);
  }
});

test("meta.json can override the tile size", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders(undefined, { tileMetres: 4 }));
  const set = await surfaces.load("wood");
  assert.equal(set.tileMetres, 4);
  const mesh = fakeMesh();
  surfaces.applyTo(mesh, set);
  assert.equal(mesh.material.map.repeat.x, 45);
});

test("applying a set drops the procedural tint and bump", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const mesh = fakeMesh();
  surfaces.applyTo(mesh, await surfaces.load("asphalt"));
  assert.equal(mesh.material.color.value, "#ffffff", "a photograph must not be tinted");
  assert.equal(mesh.material.bumpMap, null, "the procedural bump would fight the normal map");
  assert.equal(mesh.material.userData.ownedMap, false, "the cache owns these maps, not the mesh");
});

// aoMap reads UV channel 1, which PlaneGeometry does not have.
test("an occlusion map gets the second UV channel it reads from", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const mesh = fakeMesh();
  surfaces.applyTo(mesh, await surfaces.load("carpet"));
  assert.equal(mesh.geometry.attributes.uv1, mesh.geometry.attributes.uv);
});

test("a DirectX normal map is flipped rather than refused", async () => {
  const gl = new SurfaceTextures(fakeRenderer(), loaders(undefined, { normalMap: "GL" }));
  const glMesh = fakeMesh();
  gl.applyTo(glMesh, await gl.load("concrete"));
  assert.deepEqual([glMesh.material.normalScale.x, glMesh.material.normalScale.y], [1, 1]);

  const dx = new SurfaceTextures(fakeRenderer(), loaders(undefined, { normalMap: "DX" }));
  const dxMesh = fakeMesh();
  dx.applyTo(dxMesh, await dx.load("concrete"));
  assert.deepEqual([dxMesh.material.normalScale.x, dxMesh.material.normalScale.y], [1, -1]);
});

// update() runs on every edit and rebuilds the ground mesh each time.
test("an unchanged ground kind reuses its maps", async () => {
  let loads = 0;
  const base = loaders();
  const surfaces = new SurfaceTextures(fakeRenderer(), {
    ...base,
    loadTexture: (url) => { loads++; return base.loadTexture(url); },
  });
  const first = await surfaces.load("grass");
  const again = await surfaces.load("grass");
  assert.equal(again, first);
  assert.equal(loads, 4, "one fetch per map, once");
  // A new material on the rebuilt mesh still gets the cached maps.
  const mesh = fakeMesh();
  assert.equal(surfaces.applyTo(mesh, again), true);
  assert.equal(mesh.material.map.source, first.maps.map);
});

test("swapping ground kinds releases the previous maps", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const grass = await surfaces.load("grass");
  const concrete = await surfaces.load("concrete");
  assert.ok(Object.values(grass.maps).every((t) => t.disposed), "grass maps released");
  assert.ok(Object.values(concrete.maps).every((t) => !t.disposed), "concrete maps kept");
  // The studio floor has no set at all, and must not leave one on the GPU.
  await surfaces.load("studio");
  assert.equal(surfaces.sets.size, 0);
  assert.ok(Object.values(concrete.maps).every((t) => t.disposed), "concrete maps released");
});

test("applying nothing is a no-op, not a crash", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders([]));
  assert.equal(surfaces.applyTo(fakeMesh(), null), false);
  assert.equal(surfaces.applyTo(null, { maps: { map: fakeTexture("map") } }), false);
});

test("the ground plane the app builds is the one repeat assumes", () => {
  assert.equal(GROUND_METRES, 180);
});

// The reason for per-consumer clones. A tent panel tiles far more finely than
// a 180 m floor, and `repeat` lives on the texture: one shared object and
// whichever rebuilt last would set the scale for both.
test("two consumers share one set without fighting over its scale", async () => {
  let loads = 0;
  const base = loaders();
  const surfaces = new SurfaceTextures(fakeRenderer(), {
    ...base,
    loadTexture: (url) => { loads++; return base.loadTexture(url); },
  });
  const ground = await surfaces.load("carpet", GROUND_CONSUMER);
  const tent = await surfaces.load("carpet", "tent");
  assert.equal(tent, ground, "one set, loaded once");
  assert.equal(loads, 4, "the second consumer costs no fetch");

  const floor = fakeMesh(), panel = fakeMesh();
  surfaces.applyTo(floor, ground);
  surfaces.applyTo(panel, tent, { planeMetres: 3, consumer: "tent" });
  assert.equal(floor.material.map.repeat.x, repeatFor(ground.tileMetres));
  assert.equal(panel.material.map.repeat.x, repeatFor(tent.tileMetres, 3));
  assert.notEqual(floor.material.map, panel.material.map, "each consumer binds its own copy");
  assert.equal(floor.material.map.source, panel.material.map.source, "sharing one upload");
});

test("a set outlives one consumer letting go and dies with the last", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const set = await surfaces.load("wood", GROUND_CONSUMER);
  await surfaces.load("wood", "tent");
  const floor = fakeMesh(), panel = fakeMesh();
  surfaces.applyTo(floor, set);
  surfaces.applyTo(panel, set, { consumer: "tent" });

  surfaces.release(GROUND_CONSUMER);
  assert.ok(floor.material.map.disposed, "the ground's copy goes");
  assert.ok(!panel.material.map.disposed, "the tent's copy stays");
  assert.ok(Object.values(set.maps).every((t) => !t.disposed), "the set is still in use");

  surfaces.release("tent");
  assert.ok(panel.material.map.disposed, "the last copy goes");
  assert.ok(Object.values(set.maps).every((t) => t.disposed), "and the set with it");
  assert.equal(surfaces.sets.size, 0);
});

// A consumer switching away must not strand the set it was holding, however
// the switch happens: the studio floor has no set at all, and the user's own
// ground photograph outranks one.
test("releasing is what frees a set, whichever way a consumer leaves", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const grass = await surfaces.load("grass");
  surfaces.applyTo(fakeMesh(), grass);
  surfaces.release(GROUND_CONSUMER);
  assert.ok(Object.values(grass.maps).every((t) => t.disposed));
  assert.equal(surfaces.sets.size, 0);
  // Releasing twice, or a consumer that never held anything, is a no-op.
  surfaces.release(GROUND_CONSUMER);
  surfaces.release("nobody");
});

// update() fires on every edit, so two loads of different kinds can be in the
// air at once. The one the user ended on must be the one left holding a set.
test("a load that lands late does not strand a set on the GPU", async () => {
  const base = loaders();
  const gates = {};
  const surfaces = new SurfaceTextures(fakeRenderer(), {
    ...base,
    loadTexture: (url) => {
      const id = url.split("/")[2];
      return new Promise((resolve, reject) => {
        (gates[id] ||= []).push(() => base.loadTexture(url).then(resolve, reject));
      });
    },
  });
  // load() reads meta.json before it asks for a single map, so each set's
  // loaders only exist a few microtasks in.
  const opened = async (id) => {
    for (let i = 0; i < 50 && (gates[id]?.length || 0) < 4; i++) await Promise.resolve();
    gates[id].forEach((open) => open());
  };
  const slow = surfaces.load("grass");
  const fast = surfaces.load("concrete");
  await opened("concrete");
  const concrete = await fast;
  await opened("grass");
  const grass = await slow;
  // Grass is what the ground ended up claiming, because it answered last.
  assert.equal(surfaces.sets.size, 1);
  assert.ok(Object.values(grass.maps).every((t) => !t.disposed), "the last answer is held");
  assert.ok(Object.values(concrete.maps).every((t) => t.disposed), "the overtaken one is freed");
});

test("dispose drops every set and every consumer's copies", async () => {
  const surfaces = new SurfaceTextures(fakeRenderer(), loaders());
  const carpet = await surfaces.load("carpet", GROUND_CONSUMER);
  const wood = await surfaces.load("wood", "tent");
  const floor = fakeMesh(), panel = fakeMesh();
  surfaces.applyTo(floor, carpet);
  surfaces.applyTo(panel, wood, { consumer: "tent" });
  surfaces.dispose();
  for (const set of [carpet, wood])
    assert.ok(Object.values(set.maps).every((t) => t.disposed), `${set.id} released`);
  assert.ok(floor.material.map.disposed && panel.material.map.disposed, "copies released");
  assert.equal(surfaces.sets.size, 0);
  assert.equal(surfaces.claims.size, 0);
});

// Falling back is not the same as keeping what you had: a kind whose files are
// missing shows the procedural surface, so the set the consumer was holding is
// no longer on screen and must not stay on the GPU.
test("a kind with no files releases what the consumer was holding", async () => {
  const present = new Set(["wood"]);
  const base = loaders();
  const surfaces = new SurfaceTextures(fakeRenderer(), {
    ...base,
    loadTexture: (url) => (present.has(url.split("/")[2]) ? base.loadTexture(url) : Promise.reject(new Error("404"))),
    loadMeta: () => Promise.reject(new Error("404")),
  });
  const wood = await surfaces.load("wood");
  surfaces.applyTo(fakeMesh(), wood);
  assert.equal(surfaces.sets.size, 1);

  assert.equal(await surfaces.load("carpet"), null, "carpet has no files");
  assert.equal(surfaces.sets.size, 0, "the wood set does not outlive the switch");
  assert.equal(surfaces.claims.size, 0);
  assert.ok(Object.values(wood.maps).every((t) => t.disposed), "wood maps released");
});
