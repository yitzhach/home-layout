// The ground picker, in a real browser: presets and uploaded photographs as
// two groups of one list. What this is really guarding is the report that
// produced it — with a photograph uploaded, choosing a preset appeared to do
// nothing, because the upload lived in a slot of its own and outranked the
// kind. Selecting across the groups here must change the floor every time.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';

const root = new URL('..', import.meta.url).pathname;
// A small distinguishable photograph: what an uploaded ground actually is.
const photo = (() => {
  const size = 64, data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4, dark = ((x >> 3) + (y >> 3)) % 2;
      data[o] = dark ? 40 : 200; data[o + 1] = dark ? 90 : 60; data[o + 2] = 40; data[o + 3] = 255;
    }
  return Buffer.from(jpeg.encode({ data, width: size, height: size }, 90).data);
})();

const server = await createServer({ root, server: { host: '127.0.0.1', port: 5196 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});

// `ownedMap` is what tells the two kinds of floor apart: the texture cache
// lends a preset's maps to the material and marks them not owned, while an
// uploaded photograph's map is built for this material and owned by it.
const floorState = (page) => page.evaluate(() => {
  const floor = window.__booth.scene.group.getObjectByName('environment-ground');
  const m = floor.material;
  return { map: !!m.map, owned: !!m.userData.ownedMap, bump: !!m.bumpMap, color: m.color.getHexString() };
});
const options = (page) => page.evaluate(() => {
  const select = document.querySelector('select[aria-label="Ground"]');
  return [...select.querySelectorAll('optgroup')].map((g) => ({
    label: g.label,
    values: [...g.querySelectorAll('option')].map((o) => o.value),
    labels: [...g.querySelectorAll('option')].map((o) => o.textContent),
  }));
});
const ground = (page) => page.evaluate(() => window.__booth.project.booth.ground);

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5196');
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.click('[data-tab="layout"]');

  // Before any upload: one group, the shipped kinds.
  let groups = await options(page);
  assert.equal(groups.length, 1, 'only the presets until something is uploaded');
  assert.equal(groups[0].label, 'Preset grounds');
  assert.deepEqual(groups[0].values, ['studio', 'grass', 'concrete', 'asphalt', 'carpet', 'wood']);

  await page.selectOption('select[aria-label="Ground"]', 'grass');
  await page.waitForTimeout(400);
  assert.equal(await ground(page), 'grass');

  // Upload a photograph. It joins the list under its own name and is chosen.
  await page.setInputFiles('#ground-input', { name: 'my-floor.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.waitForFunction(() => {
    const m = window.__booth.scene.group.getObjectByName('environment-ground').material;
    return !!m.map && !!m.userData.ownedMap;
  }, null, { timeout: 15000 });
  groups = await options(page);
  assert.equal(groups.length, 2, 'the library is a second group in the same picker');
  assert.equal(groups[1].label, 'Your photographs');
  assert.deepEqual(groups[1].labels, ['my-floor'], 'the entry is named, not anonymous');
  const uploadValue = groups[1].values[0];
  assert.ok(uploadValue.startsWith('upload:'), 'an upload is a value of the same picker');
  assert.equal(await ground(page), uploadValue, 'uploading selects the new entry');
  const uploaded = await floorState(page);
  assert.ok(uploaded.map && uploaded.owned, 'the photograph is on the floor');
  assert.equal(uploaded.color, 'ffffff', 'a photographed floor is not tinted');

  // The bug this replaces: a preset must switch the floor with an upload
  // showing, and must not need anything removed first.
  await page.selectOption('select[aria-label="Ground"]', 'concrete');
  await page.waitForFunction(() => {
    const m = window.__booth.scene.group.getObjectByName('environment-ground').material;
    return !m.userData.ownedMap;
  }, null, { timeout: 15000 });
  assert.equal(await ground(page), 'concrete', 'the preset is the selection now');
  assert.equal((await floorState(page)).owned, false, 'the photograph is off the floor');
  assert.equal((await options(page)).length, 2, 'and it is still in the library');

  // Back the other way, from the same list.
  await page.selectOption('select[aria-label="Ground"]', uploadValue);
  await page.waitForFunction(() => window.__booth.scene.group.getObjectByName('environment-ground').material.userData.ownedMap, null, { timeout: 15000 });
  assert.equal(await ground(page), uploadValue);

  // The tile size belongs to the photograph, and only appears with one chosen.
  assert.equal(await page.locator('input[aria-label="Ground tile size"]').count(), 1);

  // Deleting the entry removes it from the library and falls back to the last
  // preset chosen — concrete, not the studio default.
  await page.click('[data-action="remove-ground-upload"]');
  await page.waitForFunction(() => !window.__booth.scene.group.getObjectByName('environment-ground').material.userData.ownedMap, null, { timeout: 15000 });
  assert.equal(await ground(page), 'concrete', 'the floor returns to the last preset');
  assert.equal((await options(page)).length, 1, 'the library entry is gone');
  assert.equal(await page.locator('input[aria-label="Ground tile size"]').count(), 0);
  assert.equal(await page.evaluate(() => Object.values(window.__booth.project.assets).filter((a) => a.role === 'ground').length), 0, 'and so is its image');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('view-ground-library: OK');
} finally {
  await browser.close();
  await server.close();
}
