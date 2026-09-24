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
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5192/?fixture=booth');
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
  await page.click('[data-tab="layout"]');
  await page.click('[aria-label="Wall colour #f7f5f0"]');
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

  // (The tent canvas and the fabric pro-panel wall were cut from Home Layout;
  // their sections of this suite went with them.)

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS PBR ground: colour space, repeat, anisotropy, survives a rebuild, fallback.');
} finally {
  await browser.close();
  await server.close();
  await rm(publicDir, { recursive: true, force: true });
}
