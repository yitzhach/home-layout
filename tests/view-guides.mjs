// Smart guides and a multiple selection, in a real browser.
//
// A work dragged with the Move tool snaps its edges to another work's and
// shows the pink guide while it does; Alt holds the guides off; the guide
// goes when the drag ends. Shift-click builds a selection that Align lines
// up, arrow keys move together, and Lite shows align as Pro.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5199 } });
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
  await page.goto('http://127.0.0.1:5199');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // Two works on the back wall, nothing else, seen straight on.
  await page.evaluate(() => {
    const b = window.__booth;
    b.mutate(() => {
      const keep = b.project.art.slice(0, 2);
      keep[0] = { ...keep[0], wall: 'back', face: 'inside', booth: undefined, x: 10, y: 20, w: 20, h: 20 };
      keep[1] = { ...keep[1], wall: 'back', face: 'inside', booth: undefined, x: 70, y: 40, w: 20, h: 20 };
      b.project.art = keep;
    });
  });
  await page.click('[data-view="back"]');
  await page.waitForTimeout(400);
  const [A, B] = await page.evaluate(() => window.__booth.project.art.map((a) => a.id));

  // Screen pixels of a point on a work's wall, in wall inches.
  const screenAt = (id, x, y) => page.evaluate(([id, x, y]) => {
    const s = window.__booth.scene;
    const a = s.p.art.find((w) => w.id === id);
    const frame = s.artFrame(a);
    frame.updateWorldMatrix(true, false);
    const v = frame.localToWorld(new (s.camera.position.constructor)(x * 0.0254, y * 0.0254, 0.05)).project(s.camera);
    const r = s.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, [id, x, y]);
  const art = (id) => page.evaluate((id) => ({ ...window.__booth.project.art.find((a) => a.id === id) }), id);

  // ---- Smart guides ------------------------------------------------------
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('m');
  const grab = await screenAt(A, 20, 30);
  // 20.7″ up puts A's bottom at 40.7: within range of B's bottom at 40.
  const to = await screenAt(A, 20, 50.7);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.waitForTimeout(250);
  const during = await page.evaluate(() => ({
    snap: window.__booth.scene.lastSnap,
    lines: !!window.__booth.scene.snapGuides,
  }));
  assert.ok(during.lines && during.snap, 'a guide is drawn while the edge is in range');
  await page.mouse.up();
  await page.waitForTimeout(200);
  let a = await art(A);
  assert.equal(a.y, 40, `the bottom edge snapped to B's (landed at ${a.y})`);
  assert.equal(await page.evaluate(() => window.__booth.scene.snapGuides), null, 'the guide goes with the drag');

  // Alt: the plain 1″ grid, no inference.
  const grab2 = await screenAt(A, 20, 50);
  const to2 = await screenAt(A, 20, 49.3 + 10);
  await page.keyboard.down('Alt');
  await page.mouse.move(grab2.x, grab2.y);
  await page.mouse.down();
  await page.mouse.move(to2.x, to2.y, { steps: 6 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  a = await art(A);
  assert.notEqual(a.y, 40, 'with Alt held the work moves off the guide');
  assert.equal(a.y, Math.round(a.y), 'but stays on the 1″ grid');

  // ---- Multiple selection -----------------------------------------------
  await page.keyboard.press('v');
  const centreOf = async (id) => { const w = await art(id); return screenAt(id, w.x + w.w / 2, w.y + w.h / 2); };
  let pt = await centreOf(A);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(450);
  pt = await centreOf(B);
  await page.keyboard.down('Shift');
  await page.mouse.click(pt.x, pt.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  assert.deepEqual((await page.evaluate(() => window.__booth.picked)).sort(), [A, B].sort(), 'Shift-click builds a selection of two');
  assert.match(await page.textContent('#selection-status'), /2 works selected/);
  await page.click('[data-tab="art"]');
  assert.ok(await page.locator('.multi-select').count(), 'the Artwork panel shows the selection');

  await page.click('[data-action="align-bottom"]');
  await page.waitForTimeout(200);
  const [a2, b2] = [await art(A), await art(B)];
  assert.equal(a2.y, b2.y, 'Align bottoms lines them up');
  assert.equal(a2.y, Math.min(a.y, 40), 'on the lower of the two');

  const xs = [a2.x, b2.x];
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  assert.deepEqual([(await art(A)).x, (await art(B)).x], xs.map((x) => x + 1), 'an arrow moves them together');

  // Select several, for a screen with no Shift key.
  await page.click('[data-action="clear-multi"]');
  assert.deepEqual(await page.evaluate(() => window.__booth.picked), [], 'Clear selection empties it');
  await page.click('[data-action="multi-mode"]');
  pt = await centreOf(A);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(450);
  assert.equal((await page.evaluate(() => window.__booth.picked)).length, 2, 'in Select several a tap adds');
  await page.click('[data-action="multi-mode"]');

  // Lite: the align buttons are Pro.
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'lite');
  await page.click('[data-tab="art"]');
  assert.equal(await page.locator('[data-pro-lock="align"]').count(), 1, 'align is locked in Lite');
  assert.equal(await page.locator('[data-action="align-left"]').count(), 0);
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'pro');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS smart guides snap a dragged edge to its neighbour and draw the guide, Alt holds them off, Shift-click and Select several build a selection that aligns and nudges together, and align is Pro.');
} finally {
  await browser.close();
  await server.close();
}
