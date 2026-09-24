// Saved views, tags and walk mode, in a real browser.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5200 } });
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
  await page.goto('http://127.0.0.1:5200');
  await page.waitForFunction(() => !!window.__booth?.scene);
  const pose = () => page.evaluate(() => window.__booth.scene.pose());
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

  // ---- Saved views ------------------------------------------------------
  await page.click('[data-tab="layout"]');
  await page.evaluate(() => window.__booth.scene.applyPose({ position: [1.5, 1.4, 3.2], target: [0, 1.1, -0.5] }));
  const saved = await pose();
  await page.click('[data-action="view-save"]');
  let views = await page.evaluate(() => window.__booth.project.views);
  assert.equal(views.length, 1, 'Save this view adds one');
  assert.ok(near(views[0].position, saved.position), 'with the camera as it was');
  assert.equal(await page.locator('.saved-view-pick').isVisible(), true, 'the View menu appears under the booth');

  await page.fill(`input[data-view-name="${views[0].id}"]`, 'Aisle approach');
  await page.press(`input[data-view-name="${views[0].id}"]`, 'Enter');
  await page.waitForTimeout(150);
  views = await page.evaluate(() => window.__booth.project.views);
  assert.equal(views[0].name, 'Aisle approach', 'renamed in the list');

  await page.click('[data-view="plan"]');
  await page.waitForTimeout(200);
  await page.selectOption('#saved-view', views[0].id);
  await page.waitForTimeout(200);
  assert.ok(near((await pose()).position, saved.position), 'the View menu goes back to it');

  // It is saved with the booth.
  await page.evaluate(() => window.__booth.save());
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  assert.equal((await page.evaluate(() => window.__booth.project.views))[0].name, 'Aisle approach', 'and survives a reload');

  // Export all: one PNG per view.
  await page.click('[data-tab="layout"]');
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.click('[data-action="views-export"]');
  await page.waitForFunction(() => /exported/.test(document.querySelector('#toast').textContent), null, { timeout: 60000 });
  assert.equal(downloads.length, 1, 'one PNG per saved view');
  assert.match(downloads[0], /Aisle-approach\.png$/);

  // ---- Tags ---------------------------------------------------------------
  const drawn = (tag) => page.evaluate((tag) => {
    let shown = 0, hidden = 0;
    window.__booth.scene.group.traverse((o) => {
      if (o.userData?.tag !== tag) return;
      o.traverse((m) => { if (m.isMesh) (m.layers.mask & 1 ? shown++ : hidden++); });
    });
    return { shown, hidden };
  }, tag);
  const before = await drawn('art');
  assert.ok(before.shown > 0, 'artwork is tagged');
  await page.uncheck('input[data-tag="art"]');
  await page.waitForTimeout(200);
  const off = await drawn('art');
  assert.equal(off.shown, 0, 'hiding the Artwork tag takes every work out of the picture');
  assert.ok(off.hidden >= before.shown);
  const picked = await page.evaluate(() => {
    const s = window.__booth.scene;
    s.pointer.set(0, 0);
    s.ray.setFromCamera(s.pointer, s.camera);
    return s.pickArt();
  });
  assert.equal(picked, null, 'and a hidden work cannot be clicked');
  // A rebuild keeps the tag hidden.
  await page.evaluate(() => window.__booth.mutate(() => {}));
  await page.waitForTimeout(200);
  assert.equal((await drawn('art')).shown, 0, 'through a rebuild');
  await page.check('input[data-tag="art"]');
  await page.waitForTimeout(200);
  assert.equal((await drawn('art')).hidden, 0, 'and back on, it is all there');

  // ---- Walk mode --------------------------------------------------------
  await page.evaluate(() => document.activeElement?.blur());
  await page.click('.toolbar [data-action="walk"]');
  assert.equal(await page.evaluate(() => window.__booth.walking), true);
  let p0 = await pose();
  assert.ok(Math.abs(p0.position[1] - 62 * 0.0254) < 1e-3, 'at eye height');
  assert.ok(await page.locator('.walk-pad').isVisible(), 'with a pad for touch');
  await page.keyboard.press('w');
  let p1 = await pose();
  assert.ok(p1.position[2] < p0.position[2] - 0.1, 'W walks toward the booth');
  assert.equal(p1.position[1], p0.position[1], 'on the floor');
  await page.click('.walk-pad [data-walk="right"]');
  const p2 = await pose();
  assert.ok(p2.position[0] > p1.position[0], 'the pad steps sideways');
  // Arrow keys walk rather than nudging the selected work.
  const art0 = await page.evaluate(() => JSON.stringify(window.__booth.project.art));
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__booth.project.art)), art0, 'arrows walk, they do not nudge');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__booth.walking), false, 'Esc stops walking');
  assert.equal(await page.evaluate(() => window.__booth.scene.controls.enableZoom), true, 'and the controls come back');
  assert.ok(await page.locator('.walk-pad').isHidden());

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS saved views save, rename, return, survive a reload and export one PNG each; a hidden tag leaves the picture and the pick through a rebuild; walk mode stands at eye height, steps by key and pad, and Esc hands the controls back.');
} finally {
  await browser.close();
  await server.close();
}
