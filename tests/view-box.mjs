// Batch D in a real browser: a box drawn on the floor and pulled up, the
// booth exported as .glb, and that very file brought back in as a model.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5202 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5202');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // ---- Draw a box ---------------------------------------------------------
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(300);
  // Screen pixels of a floor point, in booth inches.
  const floorAt = (x, z) => page.evaluate(([x, z]) => {
    const s = window.__booth.scene;
    const v = new (s.camera.position.constructor)(x * 0.0254, 0, z * 0.0254).project(s.camera);
    const r = s.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, [x, z]);
  await page.click('.toolbar [data-action="draw-box"]');
  assert.ok(await page.evaluate(() => !!window.__booth.scene.drawingBox), 'the Box tool is armed');
  const a = await floorAt(-30, -10), b = await floorAt(18, 14);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  assert.ok(await page.evaluate(() => !!window.__booth.scene.boxPreview), 'the footprint is drawn while dragging');
  await page.mouse.up();
  await page.waitForTimeout(200);
  const drawn = await page.evaluate(() => window.__booth.project.booth.pedestals?.find((x) => x.kind === 'box'));
  assert.ok(drawn, 'letting go makes a box');
  assert.ok(Math.abs(drawn.width - 48) <= 1 && Math.abs(drawn.depth - 24) <= 1, `48 × 24 as drawn (${drawn.width} × ${drawn.depth})`);
  assert.ok(Math.abs(drawn.x - -6) <= 1 && Math.abs(drawn.z - 2) <= 1, `centred where it was drawn (${drawn.x}, ${drawn.z})`);
  assert.equal(drawn.height, 12, 'twelve inches high to start');
  assert.equal(await page.evaluate(() => window.__booth.scene.drawingBox), null, 'the tool puts itself away');
  assert.equal(await page.evaluate(() => window.__booth.selectedPedestal), drawn.id, 'and the box is selected');

  // Pull it up.
  const pull = page.locator(`input[type="range"][data-scope="pedestal-${drawn.id}"][data-field="height"]`);
  await pull.fill('30');
  await pull.dispatchEvent('change');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate((id) => window.__booth.project.booth.pedestals.find((x) => x.id === id).height, drawn.id), 30, 'Pull up raises it');
  const top = await page.evaluate((id) => {
    const g = window.__booth.scene.pedestalFrames[id];
    const box = new (window.__booth.scene.camera.position.constructor)();
    let max = 0;
    g.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); o.updateWorldMatrix(true, false); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); max = Math.max(max, b.max.y); } });
    return max;
  }, drawn.id);
  assert.ok(Math.abs(top - 30 * 0.0254) < 0.005, `and the geometry is 30″ tall (${(top / 0.0254).toFixed(2)}″)`);

  // ---- Export .glb, then bring it back in as a model -----------------------
  await page.click('[data-view="perspective"]');
  await page.click('[data-tab="export"]');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-action="export-glb"]')]);
  assert.match(dl.suggestedFilename(), /\.glb$/);
  const file = await dl.path();
  const bytes = await fs.readFile(file);
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF', 'a binary glTF');
  assert.ok(bytes.length > 2000, `with the booth in it (${bytes.length} bytes)`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.ok(json.meshes?.length > 5, `${json.meshes?.length} meshes`);
  assert.ok(!JSON.stringify(json.nodes).includes('underlay') && !(json.extensionsUsed || []).includes('KHR_lights_punctual'), 'no lights or planning aids');

  await page.click('[data-tab="walls"]');
  await page.setInputFiles('#model-input', { name: 'booth-copy.glb', mimeType: 'model/gltf-binary', buffer: bytes });
  await page.waitForFunction(() => (window.__booth.project.booth.models || []).length === 1);
  const model = await page.evaluate(() => window.__booth.project.booth.models[0]);
  assert.equal(model.height, 36, 'a model arrives at 36″');
  await page.waitForFunction((id) => !!window.__booth.scene.modelFrames?.[id], model.id, { timeout: 30000 });
  const tall = await page.evaluate((id) => {
    const s = window.__booth.scene;
    const g = s.modelFrames[id];
    g.updateWorldMatrix(true, true);
    const V = s.camera.position.constructor;
    let min = Infinity, max = -Infinity;
    g.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); min = Math.min(min, b.min.y); max = Math.max(max, b.max.y); } });
    return { min, max };
  }, model.id);
  assert.ok(Math.abs(tall.min) < 0.005, `stood on the floor (${tall.min.toFixed(4)} m)`);
  assert.ok(Math.abs(tall.max - 36 * 0.0254) < 0.01, `and 36″ tall (${(tall.max / 0.0254).toFixed(2)}″)`);

  // It is saved with the booth and reopens.
  await page.evaluate(() => window.__booth.save());
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  assert.equal((await page.evaluate(() => window.__booth.project.booth.models || [])).length, 1, 'the model survives a reload');
  await page.waitForFunction(() => Object.keys(window.__booth.scene.modelFrames || {}).length === 1, null, { timeout: 30000 });

  // Removing it removes its file.
  await page.click('[data-tab="walls"]');
  await page.click(`[data-action="delete-model-${model.id}"]`);
  assert.equal(await page.evaluate(() => Object.values(window.__booth.project.assets).some((x) => x.role === 'model')), false, 'the file goes with it');

  // ---- Lite -------------------------------------------------------------
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'lite');
  await page.click('.toolbar [data-action="draw-box"]');
  assert.equal(await page.evaluate(() => !!window.__booth.scene.drawingBox), false, 'Lite cannot draw a box');
  await page.click('[data-tab="walls"]');
  assert.equal(await page.locator('[data-pro-lock="glb"]').count(), 1, 'models are Pro');
  assert.equal(await page.locator('#furniture-kind option[value="box"]').count(), 0, 'and the box is not on the furniture list');
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'pro');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS a box drawn on the floor lands at its drawn size, pulls up to 30″ in geometry, the booth exports as a real .glb, that file comes back as a model stood on the floor at 36″, survives a reload, leaves with its file, and Lite has none of it.');
} finally {
  await browser.close();
  await server.close();
}
