// The booth row, in a real renderer: booths added either side stand where the
// arithmetic says, artwork hung while one of them is picked ends up on that
// booth's wall rather than this one's, and fast edit comes on and goes off
// with the gesture unless it has been locked.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5203 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});

const IN = 0.0254;
// Where a row booth's back wall actually stands, in metres.
const standX = (page, id) => page.evaluate((slot) => {
  const scene = window.__booth.scene;
  scene.group.updateMatrixWorld(true);
  const stand = scene.group.getObjectByName('row-booth-' + slot);
  return stand ? stand.matrixWorld.elements[12] : null;
}, id);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5203');
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.click('[data-tab="layout"]');

  // A new project is a row of one, and nothing extra is drawn for it.
  assert.equal(await page.evaluate(() => window.__booth.project.booth.row), undefined,
    'a booth carries no row until one is asked for');

  await page.click('[data-action="row-booth-left"]');
  await page.waitForTimeout(400);
  await page.click('[data-tab="layout"]');
  await page.fill('#row-count', '2');
  await page.click('[data-action="row-count-right"]');
  await page.waitForTimeout(500);

  const row = await page.evaluate(() => window.__booth.project.booth.row);
  assert.equal(row.slots.length, 4, 'one booth to the left and two to the right');
  const layout = await page.evaluate(() => window.__booth.project.booth.row.slots.map((s) => s.id));
  const home = row.home;
  const left = layout[0];
  assert.notEqual(left, home, 'the left-hand booth is not this one');
  // 120in booth + 24in gap = 144in to the next centre.
  assert.ok(Math.abs(await standX(page, left) - -144 * IN) < 1e-6,
    'the booth to the left stands a booth and a gap away');
  assert.ok(Math.abs(await standX(page, layout[3]) - 288 * IN) < 1e-6,
    'and the second one to the right stands two of them away');
  assert.equal(await standX(page, home), null, 'this booth is not drawn twice');

  // Hanging an original while another booth is picked puts it in that booth.
  await page.click('[data-tab="layout"]');
  await page.selectOption('[data-row-active]', left);
  await page.waitForTimeout(300);
  await page.locator('.art-card').first().click();
  await page.waitForTimeout(600);
  const hung = await page.evaluate(() => {
    const art = window.__booth.project.art;
    return art[art.length - 1];
  });
  assert.equal(hung.booth, left, 'the new placement names the booth that was picked');
  const placed = await page.evaluate((id) => {
    const scene = window.__booth.scene;
    scene.group.updateMatrixWorld(true);
    const group = scene.artGroups.get(id)?.group;
    if (!group) return null;
    const v = new (Object.getPrototypeOf(group.position).constructor)();
    group.getWorldPosition(v);
    return [v.x, v.y, v.z];
  }, hung.id);
  assert.ok(placed && placed[0] < -1, 'and it hangs over in that booth, not in this one');

  // A space pushes everything past it further out.
  await page.click('[data-tab="layout"]');
  await page.click('[data-action="row-space-left"]');
  await page.waitForTimeout(500);
  assert.ok(Math.abs(await standX(page, left) - -144 * IN) < 1e-6,
    'a space on the far side does not move the booths between it and home');

  // Removing a booth takes the artwork hung in it.
  await page.click('[data-tab="layout"]');
  await page.click(`[data-action="row-remove-${left}"]`);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate((id) => window.__booth.project.art.some((a) => a.booth === id), left),
    false, 'the work hung in a removed booth goes with it');
  assert.equal(await standX(page, left), null, 'and the booth itself is gone');

  // Fast edit: auto arms with the gesture and lets go with it.
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false, 'fast edit starts off');
  await page.evaluate(() => {
    const s = window.__booth.scene;
    s.armDraft();
  });
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true,
    'arming a work turns fast edit on');
  await page.evaluate(() => window.__booth.scene.letGoOfArt());
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false,
    'and letting go of it turns fast edit back off');

  // The lock holds it wherever it is put, in both directions.
  await page.click('[data-action="draft-lock"]');           // auto -> on
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true, 'locked on turns it on');
  await page.evaluate(() => window.__booth.scene.letGoOfArt());
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true,
    'and a lock is not undone by letting go of a work');
  await page.click('[data-action="draft-lock"]');           // on -> off
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false, 'locked off turns it off');
  await page.evaluate(() => window.__booth.scene.armDraft());
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false,
    'and a gesture cannot turn it back on while it is locked off');
  await page.click('[data-action="draft-lock"]');           // off -> auto
  assert.equal(await page.evaluate(() => window.__booth.scene.draftPolicy), 'auto',
    'a third press is back to auto');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS booth row: measured stands, artwork hung per booth, fast edit auto and locked.');
} finally {
  await browser.close();
  await server.close();
}
