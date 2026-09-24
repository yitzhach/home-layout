// Covers the PBR ground with texture files actually present. The node tests
// check the rules in isolation; this checks that the maps reach the real
// ground mesh in a real renderer, at the right repeat, without disturbing the
// booth or the artwork.
//
// Fixtures are generated here into a temporary public directory. NOTE: this
// vite server ignores the inline publicDir and serves the repository's own
// public/assets, so the sets exercised below are the committed ones — the
// temporary copy is written but not served. Nothing here writes to the
// repository, which is what the arrangement was protecting.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';

// Distinguishable maps: a checker for colour, a flat +Z normal, mid roughness
// and clear occlusion, so a map bound to the wrong slot shows up as a value.
function swatch(size, pixel) {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = (y * size + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  return Buffer.from(jpeg.encode({ data, width: size, height: size }, 90).data);
}

const root = new URL('..', import.meta.url).pathname;
const publicDir = await mkdtemp(join(tmpdir(), 'booth-public-'));
const setDir = join(publicDir, 'assets', 'textures', 'concrete');
await cp(join(root, 'public'), publicDir, { recursive: true });
await mkdir(setDir, { recursive: true });
await writeFile(join(setDir, 'color.jpg'), swatch(64, (x, y) => ((x >> 3) + (y >> 3)) % 2 ? [190, 186, 176] : [120, 118, 112]));
await writeFile(join(setDir, 'normal.jpg'), swatch(64, () => [128, 128, 255]));
await writeFile(join(setDir, 'rough.jpg'), swatch(64, () => [160, 160, 160]));
await writeFile(join(setDir, 'ao.jpg'), swatch(64, (x, y) => (x + y) % 16 < 8 ? [255, 255, 255] : [180, 180, 180]));
await writeFile(join(setDir, 'meta.json'), JSON.stringify({ tileMetres: 2, normalMap: 'GL', credit: 'synthetic fixture' }));

// The tent's canvas, at a 1 m tile. Its UVs are in metres, so this must come
// out at repeat 1 while the 2 m ground set on its 180 m plane comes out at 90 —
// the same rule, told the real size of what it is covering.
const canvasDir = join(publicDir, 'assets', 'textures', 'canvas');
await mkdir(canvasDir, { recursive: true });
await writeFile(join(canvasDir, 'color.jpg'), swatch(64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? [245, 243, 236] : [228, 226, 218]));
await writeFile(join(canvasDir, 'normal.jpg'), swatch(64, () => [128, 128, 255]));
await writeFile(join(canvasDir, 'meta.json'), JSON.stringify({ tileMetres: 1, normalMap: 'GL', credit: 'synthetic fixture' }));

const server = await createServer({ root, publicDir, server: { host: '127.0.0.1', port: 5192 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
const groundState = (page) => page.evaluate(() => {
  const floor = window.__booth.scene.group.getObjectByName('environment-ground');
  const m = floor.material;
  const name = (t) => (t ? { repeat: t.repeat.x, colorSpace: t.colorSpace, wrap: t.wrapS, anisotropy: t.anisotropy } : null);
  return {
    color: m.color.getHexString(),
    bump: !!m.bumpMap,
    map: name(m.map),
    normal: name(m.normalMap),
    rough: name(m.roughnessMap),
    ao: name(m.aoMap),
    normalScale: m.normalMap ? [m.normalScale.x, m.normalScale.y] : null,
    uv1: !!floor.geometry.attributes.uv1,
  };
});
// The tent's fabric panels, the meshes makeTent marks; the frame must be left
// alone. Reported with the UV range, which is what carries the real size.
const tentState = (page) => page.evaluate(() => {
  const panels = [], frame = [];
  window.__booth.scene.group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.userData?.fabric) {
      const uv = o.geometry.attributes.uv.array;
      let u = 0, v = 0;
      for (let i = 0; i < uv.length; i += 2) { u = Math.max(u, uv[i]); v = Math.max(v, uv[i + 1]); }
      panels.push({
        map: o.material.map ? { repeat: o.material.map.repeat.x, colorSpace: o.material.map.colorSpace } : null,
        normal: !!o.material.normalMap,
        bump: !!o.material.bumpMap,
        color: o.material.color.getHexString(),
        u, v,
      });
    } else if (o.material.metalness > 0.5) frame.push({ map: !!o.material.map });
  });
  return { panels, frame };
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5192');
  await page.waitForFunction(() => !!window.__booth?.scene);
  assert.equal((await page.request.head('http://127.0.0.1:5192/assets/textures/concrete/color.jpg')).status(), 200);

  await page.click('[data-tab="layout"]');

  // Grass ships a real set, so it must bind one. This used to assert the
  // opposite — the procedural fallback — and passed only because the real
  // load had not landed inside a 300 ms wait; it came good the moment
  // selecting stopped rebuilding the scene. The genuine no-files fallback is
  // the studio floor further down, which ships no set at all.
  assert.equal((await page.request.head('http://127.0.0.1:5192/assets/textures/grass/color.jpg')).status(), 200);
  await page.selectOption('select[aria-label="Ground"]', 'grass');
  await page.waitForFunction(() => !!window.__booth.scene.group.getObjectByName('environment-ground').material.normalMap, null, { timeout: 15000 });
  const grass = await groundState(page);
  assert.equal(grass.bump, false, 'the procedural bump would fight a real normal map');
  assert.equal(grass.map.repeat, 90, 'a 2 m tile repeats 90 times across 180 m');

  // Concrete has files, so the real set must land on the real mesh.
  await page.selectOption('select[aria-label="Ground"]', 'concrete');
  await page.waitForFunction(() => !!window.__booth.scene.group.getObjectByName('environment-ground').material.normalMap, null, { timeout: 15000 });
  const concrete = await groundState(page);
  assert.equal(concrete.color, 'ffffff', 'a photographed surface is not tinted');
  assert.equal(concrete.bump, false, 'the procedural bump would fight the normal map');
  assert.deepEqual(concrete.normalScale, [1, 1], 'a GL normal map is used as-is');
  assert.equal(concrete.uv1, true, 'the occlusion map has the UV channel it reads');
  for (const slot of ['map', 'normal', 'rough', 'ao']) {
    assert.ok(concrete[slot], `${slot} is bound`);
    assert.equal(concrete[slot].repeat, 90, `${slot}: a 2 m tile repeats 90 times across 180 m`);
    assert.equal(concrete[slot].wrap, 1000, `${slot}: RepeatWrapping`);
    assert.ok(concrete[slot].anisotropy > 1, `${slot}: anisotropic filtering at grazing angles`);
  }
  assert.equal(concrete.map.colorSpace, 'srgb', 'colour is sRGB');
  for (const slot of ['normal', 'rough', 'ao'])
    assert.equal(concrete[slot].colorSpace, '', `${slot} stays linear`);

  // An unrelated edit rebuilds the whole scene; the maps must survive it.
  await page.fill('input[aria-label="Wall height"]', '84');
  await page.locator('input[aria-label="Wall height"]').dispatchEvent('change');
  // Waiting for the rebuilt mesh rather than for a fixed 400ms: the maps are
  // re-applied from a promise, and a loaded machine misses that deadline.
  await page.waitForFunction(() => {
    const floor = window.__booth.scene.group.getObjectByName('environment-ground');
    return !!(floor && floor.material.map && floor.material.normalMap);
  }, null, { timeout: 15000 });
  const rebuilt = await groundState(page);
  assert.ok(rebuilt.map && rebuilt.normal, 'the set survives a scene rebuild');
  assert.equal(rebuilt.map.repeat, 90, 'repeat survives a scene rebuild');

  // Going back to a texture-free floor must release it cleanly.
  await page.selectOption('select[aria-label="Ground"]', 'studio');
  await page.waitForTimeout(400);
  const studio = await groundState(page);
  assert.equal(studio.map, null, 'the studio floor has no texture set');
  assert.equal(studio.normal, null);

  // ---- The tent canvas ---------------------------------------------------
  await page.check('input[data-field="tent"]');
  await page.waitForFunction(() => {
    let found = false;
    window.__booth.scene.group.traverse((o) => { if (o.userData?.fabric && o.material.map) found = true; });
    return found;
  }, null, { timeout: 15000 });
  const tent = await tentState(page);
  assert.ok(tent.panels.length >= 5, 'a roof and four valances at least');
  for (const panel of tent.panels) {
    assert.ok(panel.map, 'every fabric panel is textured');
    assert.equal(panel.map.repeat, 1, 'a 1 m tile over UVs in metres repeats once per metre');
    assert.equal(panel.map.colorSpace, 'srgb', 'canvas colour is sRGB');
    assert.equal(panel.color, 'ffffff', 'a photographed canvas is not tinted');
    assert.equal(panel.bump, false, 'the procedural weave would fight the normal map');
    assert.ok(panel.normal, 'the canvas normal map is applied');
  }
  // UVs in metres are the whole mechanism, and the valance is what proves it:
  // a 10 ft panel three metres wide and twelve inches deep must carry UVs of
  // about 3 by 0.3, not 1 by 1. With 0..1 UVs the weave on it would be
  // stretched ten times further down than across.
  assert.ok(tent.panels.some((p) => p.u > 2 && p.v > 2), 'the roof spans its real width and depth');
  const valance = tent.panels.filter((p) => p.v < 1);
  assert.ok(valance.length >= 4, 'four valances, each far shallower than it is wide');
  for (const p of valance) {
    assert.ok(p.v > 0.2 && p.v < 0.5, `a 12" valance is about 0.3 m deep, got ${p.v}`);
    assert.ok(p.u > 2, 'and as wide as the booth');
  }
  assert.ok(tent.frame.length > 0, 'the frame was found');
  assert.ok(tent.frame.every((f) => !f.map), 'the steel frame keeps its metal');

  // And the fallback: with the files gone, the procedural weave comes back.
  await page.uncheck('input[data-field="tent"]');
  await rm(canvasDir, { recursive: true, force: true });
  await page.check('input[data-field="tent"]');
  await page.waitForTimeout(600);
  const bare = await tentState(page);
  assert.ok(bare.panels.length >= 5, 'the tent still builds');
  assert.ok(bare.panels.every((p) => !p.map), 'no canvas texture without files');
  assert.ok(bare.panels.every((p) => p.bump), 'the procedural weave is still there');

  // ---- The fabric wall finish --------------------------------------------
  // A pro-panel wall takes the weave from the carpet set but never its colour:
  // this is a tool for judging artwork against a finish the user chose, so the
  // colour they picked has to survive.
  const walls = () => page.evaluate(() => {
    const out = [];
    window.__booth.scene.group.traverse((o) => {
      if (!o.userData?.wall) return;
      const m = o.material;
      out.push({
        wall: o.userData.wall, color: m.color.getHexString(),
        map: !!m.map, normal: !!m.normalMap, rough: !!m.roughnessMap,
        scale: m.normalMap ? m.normalScale.x : null,
        repeat: m.normalMap ? [m.normalMap.repeat.x, m.normalMap.repeat.y] : null,
      });
    });
    return out;
  });
  await page.selectOption('select[aria-label="Panel surface"]', 'fabric');
  await page.waitForFunction(() => {
    let ok = false;
    window.__booth.scene.group.traverse((o) => { if (o.userData?.wall && o.material.normalMap) ok = true; });
    return ok;
  }, null, { timeout: 15000 });
  const fabric = await walls();
  assert.equal(fabric.length, 3, 'three panels');
  for (const w of fabric) {
    assert.equal(w.color, '45474a', `${w.wall}: the chosen colour survives the finish`);
    assert.equal(w.map, false, `${w.wall}: the carpet's own colour is not taken`);
    assert.ok(w.normal && w.rough, `${w.wall}: weave and sheen are`);
    assert.equal(w.scale, 0.6, `${w.wall}: relief follows the weave-depth default`);
    // A panel is wider than it is tall, so one repeat would stretch the weave.
    assert.ok(w.repeat[0] > w.repeat[1], `${w.wall}: repeat is per axis, not square`);
  }

  await page.fill('input[aria-label="Weave depth"]', '20');
  await page.locator('input[aria-label="Weave depth"]').dispatchEvent('change');
  await page.waitForFunction(() => {
    let scale = null;
    window.__booth.scene.group.traverse((o) => { if (o.userData?.wall && o.material.normalMap) scale = o.material.normalScale.x; });
    return scale !== null && Math.abs(scale - 0.2) < 1e-6;
  }, null, { timeout: 15000 });

  await page.selectOption('select[aria-label="Panel surface"]', 'smooth');
  await page.waitForTimeout(600);
  const smooth = await walls();
  assert.ok(smooth.every((w) => !w.normal && !w.rough), 'smooth panels carry no weave');
  assert.ok(smooth.every((w) => w.color === '45474a'), 'and still the chosen colour');
  assert.equal(await page.evaluate(() => window.__booth.scene.surfaces.claims.size), 0,
    'every wall hands its set back');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS PBR ground, tent canvas and fabric walls: colour space, per-axis repeat, UVs in metres, weave depth, fallback.');
} finally {
  await browser.close();
  await server.close();
  await rm(publicDir, { recursive: true, force: true });
}
