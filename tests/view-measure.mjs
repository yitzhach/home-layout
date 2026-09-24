// Measuring in a real browser: the plan view's dimension lines and the tape
// measure. The node tests pin the arithmetic; this checks that the lines and
// labels reach the page, follow the selection, and that two clicks on the
// floor read back the distance between them.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5211 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
const IN = 0.0254;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5211');
  await page.waitForFunction(() => !!window.__booth?.scene);
  const notes = () => page.evaluate(() => [...document.querySelectorAll('.scene-label-note')].filter((n) => !n.hidden).map((n) => ({ kind: n.className, text: n.textContent })));

  assert.equal((await notes()).length, 0, 'the perspective view carries no dimension labels');

  // --- Plan view: the booth's overall width and depth.
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(300);
  const booth = await page.evaluate(() => window.__booth.project.booth);
  let labels = await notes();
  assert.equal(labels.length, 2, 'width and depth');
  assert.ok(labels.some((l) => l.kind.includes('width') && l.text.includes(booth.width + '″')), `the width reads ${booth.width}″: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((l) => l.kind.includes('depth') && l.text.includes(booth.depth + '″')));

  // --- A selected pedestal adds its clearances to the walls.
  await page.click('[data-tab="walls"]');
  await page.click('[data-action="add-pedestal"]');
  await page.waitForTimeout(400);
  const ped = await page.evaluate(() => window.__booth.project.booth.pedestals.at(-1));
  labels = await notes();
  const back = labels.find((l) => l.kind.includes('back'));
  assert.ok(back, `a back clearance is shown: ${JSON.stringify(labels)}`);
  assert.ok(back.text.startsWith(String(Math.floor((ped.z - ped.depth / 2 + booth.depth / 2) / 12)) + '′'), `back clearance ${back.text}`);
  assert.ok(labels.some((l) => l.kind.includes('left')), 'and a left one');
  // Dragging it moves the clearances with it.
  await page.evaluate((id) => {
    const b = window.__booth;
    const moved = { ...b.project.booth.pedestals.find((x) => x.id === id), x: 0, z: 0 };
    b.scene.movePedestal(moved);
  }, ped.id);
  await page.waitForTimeout(100);
  labels = await notes();
  const left = labels.find((l) => l.kind.includes('left'));
  const expectLeft = booth.width / 2 - ped.width / 2;
  assert.ok(left.text.includes(expectLeft + '″') || left.text.startsWith(expectLeft + '″'), `left clearance follows the drag: ${left.text}, want ${expectLeft}″`);
  const lines = await page.evaluate(() => {
    const g = window.__booth.scene.group.getObjectByName('guides');
    let n = 0;
    g?.traverse((o) => { if (o.isLineSegments) n += o.geometry.attributes.position.count / 2; });
    return n;
  });
  assert.equal(lines, labels.length, 'one drawn line per label');

  // --- The tape measure: two clicks on open floor, sixty inches apart.
  await page.click('[data-action="measure"]');
  assert.ok(await page.evaluate(() => window.__booth.scene.measure.on));
  assert.match(await page.locator('#gesture-hint').textContent(), /Measure: click where the tape starts/);
  const at = (x, z) => page.evaluate(([x, z]) => {
    const s = window.__booth.scene, T = s.camera.position.constructor;
    s.camera.updateMatrixWorld();
    const v = new T(x, 0, z).project(s.camera), r = s.renderer.domElement.getBoundingClientRect();
    return [r.x + ((v.x + 1) * r.width) / 2, r.y + ((1 - v.y) * r.height) / 2];
  }, [x, z]);
  // Just inside the entrance, where nothing stands (the pedestal was moved
  // to the centre above).
  const z = (booth.depth / 2 - 6) * IN;
  const [ax, ay] = await at(-30 * IN, z);
  const [bx, by] = await at(30 * IN, z);
  await page.mouse.click(ax, ay);
  assert.equal(await page.evaluate(() => window.__booth.scene.measure.points.length), 1);
  await page.mouse.click(bx, by);
  await page.waitForTimeout(100);
  const tape = (await notes()).find((l) => l.kind.includes('tape'));
  assert.ok(tape, 'the tape shows its reading');
  assert.equal(tape.text, '5′ 0″ · 60″', 'sixty inches, snapped to the inch');
  assert.match(await page.locator('#gesture-hint').textContent(), /Measured 5′ 0″/);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.pedestals.at(-1).x), 0,
    'measuring selects and moves nothing');
  // A third click starts a new tape.
  await page.mouse.click(ax, ay);
  assert.equal(await page.evaluate(() => window.__booth.scene.measure.points.length), 1);
  await page.waitForTimeout(100);
  assert.ok(!(await notes()).some((l) => l.kind.includes('tape')));

  // Escape puts the tape away.
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__booth.scene.measure.on), false);
  assert.equal(await page.evaluate(() => window.__booth.scene.measure.points.length), 0);
  assert.match(await page.locator('#gesture-hint').textContent(), /Drag to orbit/);

  // The labels are the page's, not the picture's: an export never shows the lines.
  const exported = await page.evaluate(async () => {
    const s = window.__booth.scene, real = s.renderFrame.bind(s);
    let visible = null;
    s.renderFrame = () => { visible ??= s.group.getObjectByName('guides').children.some((o) => o.visible); return real(); };
    try { await s.export(1024); } finally { s.renderFrame = real; }
    return visible;
  });
  assert.equal(exported, false, 'dimension lines are hidden in an export');

  // Back to perspective: the labels go with the plan.
  await page.click('[data-view="perspective"]');
  await page.waitForTimeout(200);
  assert.equal((await notes()).length, 0);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS measuring: plan dimensions follow the booth and the selection, the tape reads 60″, Escape puts it away, exports stay clean.');
} finally {
  await browser.close();
  await server.close();
}
