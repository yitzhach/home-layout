// The finishing controls in a real renderer: the drawn drop shadow, a hidden
// spotlight, the universal edge colour, the saved palette and the export
// frame. Every one of them was asked for after looking at a booth, so what
// these check is that each control reaches the scene rather than only the
// project — a setting that changes a number and not a picture is the failure
// mode all five share.
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

const shadows = (page, kind = 'behind') =>
  page.evaluate((k) => {
    const out = [];
    window.__booth.scene.group.traverse((o) => {
      if (o.userData.artShadow && o.userData.shadowKind === k)
        out.push({ id: o.userData.artShadow, opacity: o.material.opacity, y: o.position.y, x: o.position.x, visible: o.visible,
          sigma: o.material.userData.shadow.shadowSigma.value });
    });
    return out;
  }, kind);
const revision = (page) => page.evaluate(() => window.__booth.scene.revision);
// Drag a live shadow slider the way a hand does: input events, then the change.
const drag = async (page, scope, key, value) => {
  const el = page.locator(`input[type=range][data-scope="${scope}"][data-field="${key}"]`);
  await el.evaluate((node, v) => {
    node.value = String(v);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  return el;
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5203');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // --- A shadow behind every hung work, on by default; the second one off.
  const placed = await page.evaluate(() => window.__booth.project.art.length);
  const first = await shadows(page);
  assert.equal(first.length, placed, 'every hung work has a shadow behind it');
  assert.ok(first.every((s) => s.opacity > 0 && s.y < 0 && s.x > 0),
    'each one is visible and falls down and right, the way a 125° light throws it');
  assert.deepEqual(await shadows(page, 'under'), [], 'the second shadow waits for its eye');

  // --- Photoshop's controls, live: dragging moves the shadow without a rebuild.
  await page.click('[data-tab="lighting"]');
  await page.waitForTimeout(300);
  for (const label of ['Drop shadow opacity', 'Drop shadow distance', 'Drop shadow spread', 'Drop shadow size', 'Drop shadow angle value'])
    assert.equal(await page.getByLabel(label, { exact: true }).count(), 1, `${label} is offered`);
  assert.equal(await page.getByLabel('Drop shadow angle dial').count(), 1, 'and the angle has its dial');
  const built = await revision(page);
  const undoDepth = await page.evaluate(() => window.__booth.history.length);
  await drag(page, 'shadowBehind', 'opacity', 60);
  await drag(page, 'shadowBehind', 'opacity', 80);
  let live = await shadows(page);
  assert.ok(Math.abs(live[0].opacity - 0.8) < 1e-9, 'opacity is the opacity');
  assert.equal(await page.inputValue('input[type=number][data-scope="shadowBehind"][data-field="opacity"]'), '80',
    'and the typed number follows the slider');
  await drag(page, 'shadowBehind', 'distance', 4);
  live = await shadows(page);
  assert.ok(Math.abs(live[0].y) > Math.abs(first[0].y) * 4, 'distance throws it further');
  await drag(page, 'shadowBehind', 'size', 5);
  assert.ok((await shadows(page))[0].sigma > first[0].sigma * 4, 'size widens the soft edge');
  assert.equal(await revision(page), built, 'none of that rebuilt the booth');
  await page.locator('input[type=range][data-scope="shadowBehind"][data-field="size"]').dispatchEvent('change');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__booth.history.length), undoDepth + 1,
    'and the whole gesture is one undo step');

  // The angle, typed: 0° is a light at three o'clock, so the shadow goes left.
  const angle = page.getByLabel('Drop shadow angle value', { exact: true });
  await angle.fill('0');
  await angle.dispatchEvent('change');
  await page.waitForTimeout(200);
  live = await shadows(page);
  assert.ok(live[0].x < 0 && Math.abs(live[0].y) < 1e-6, 'the angle is where the light comes from');

  // --- The second shadow: its eye, and the global light turning both.
  await page.click('[data-shadow-eye="under"]');
  await page.waitForTimeout(500);
  const under = await shadows(page, 'under');
  assert.equal(under.length, placed, 'the eye brings a second shadow in behind every work');
  assert.ok(under.every((s) => s.x < 0), 'and it shares the global light the first one just moved');
  await page.getByLabel('Under shadow angle value', { exact: true }).fill('90');
  await page.getByLabel('Under shadow angle value', { exact: true }).dispatchEvent('change');
  await page.waitForTimeout(300);
  live = await shadows(page);
  assert.ok(Math.abs(live[0].x) < 1e-6 && live[0].y < 0, 'turning one turns every shadow using the global light');
  assert.equal(await page.inputValue('input[type=number][data-scope="shadowBehind"][data-field="angle"]'), '90',
    'and the other dial follows');
  await page.locator('input[type=checkbox][data-scope="shadowUnder"][data-field="global"]').uncheck();
  await page.waitForTimeout(400);
  await page.getByLabel('Under shadow angle value', { exact: true }).fill('180');
  await page.getByLabel('Under shadow angle value', { exact: true }).dispatchEvent('change');
  await page.waitForTimeout(300);
  assert.ok((await shadows(page, 'under'))[0].x > 0 && Math.abs((await shadows(page))[0].x) < 1e-6,
    'with global light off, a shadow turns on its own');

  // --- The eye hides without forgetting.
  await page.click('[data-shadow-eye="behind"]');
  await page.waitForTimeout(400);
  assert.deepEqual(await shadows(page), [], 'hiding the first shadow leaves nothing of it behind');
  assert.equal(await page.evaluate(() => window.__booth.project.booth.shadowBehind.opacity), 80, 'and keeps its settings');
  await page.click('[data-shadow-eye="behind"]');
  await page.waitForTimeout(400);
  assert.equal((await shadows(page)).length, placed, 'and the eye brings it back');
  await page.click('[data-shadow-eye="under"]');
  await page.waitForTimeout(400);

  // --- The dial: dragged round, it points at the pointer.
  const dial = await page.locator('[data-dial="shadowBehind"]').boundingBox();
  await page.mouse.move(dial.x + dial.width / 2, dial.y + dial.height / 2 - 12);
  await page.mouse.down();
  await page.mouse.move(dial.x + dial.width / 2 - 12, dial.y + dial.height / 2, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.inputValue('input[type=number][data-scope="shadowBehind"][data-field="angle"]'), '180',
    'dragged to nine o\'clock, the dial reads 180°');

  // --- A booth saved with the first version's sliders opens as it was left.
  await page.evaluate(() => window.__booth.mutate(() => {
    const b = window.__booth.project.booth;
    delete b.shadowBehind;
    delete b.shadowAngle;
    b.dropShadow = { on: true, darkness: 90, distance: 45, softness: 55 };
  }));
  await page.waitForTimeout(500);
  live = await shadows(page);
  assert.ok(Math.abs(live[0].opacity - 0.73) < 1e-9, 'its darkness is read as opacity');
  assert.ok(live[0].x > 0 && live[0].y < 0, 'and it still falls down and right');
  await page.evaluate(() => window.__booth.mutate(() => {
    delete window.__booth.project.booth.dropShadow;
  }));
  await page.waitForTimeout(400);

  // --- Hiding a spotlight rather than deleting it.
  const lit = await page.evaluate(() => {
    let spots = 0;
    window.__booth.scene.group.traverse((o) => {
      if (o.isSpotLight) spots += 1;
    });
    return spots;
  });
  await page.locator('[data-light-eye="0"]').click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    let spots = 0;
    window.__booth.scene.group.traverse((o) => {
      if (o.isSpotLight) spots += 1;
    });
    return { spots, lights: window.__booth.project.lights.length, aim: window.__booth.project.lights[0] };
  });
  assert.equal(after.spots, lit - 1, 'the hidden spotlight is not built');
  assert.equal(after.lights, 2, 'but it is still in the list');
  assert.equal(after.aim.on, false);
  assert.ok(Number.isFinite(after.aim.tx) && after.aim.power > 0, 'with its aim and its power kept');
  await page.locator('[data-light-eye="0"]').click();
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => {
      let spots = 0;
      window.__booth.scene.group.traverse((o) => { if (o.isSpotLight) spots += 1; });
      return spots;
    }),
    lit,
    'and the eye puts it back',
  );

  // --- The universal edge colour, and the palette under the swatch.
  await page.evaluate(() => window.__booth.mutate(() => (window.__booth.project.art[0].edgeColor = '#112233')));
  await page.click('[data-tab="art"]');
  await page.getByLabel('Universal edge colour for every work').check();
  const universal = page.locator('input[type=color][data-field="edgeColor"][data-scope="booth"]');
  await page.waitForTimeout(300);
  await universal.fill('#aa3322');
  await universal.dispatchEvent('change');
  await page.waitForTimeout(600);
  const painted = await page.evaluate(() => {
    const out = [];
    window.__booth.scene.group.traverse((o) => {
      // The box is the work's edges; the plane in front of it is the image.
      if (o.userData.artId && o.geometry?.type === 'BoxGeometry') out.push('#' + o.material.color.getHexString());
    });
    return out;
  });
  assert.ok(painted.length > 1 && painted.every((c) => c === '#aa3322'), `every work takes the universal colour, got ${painted.join(' ')}`);
  assert.equal(
    await page.evaluate(() => window.__booth.project.art[0].edgeColor),
    '#112233',
    'without any work being rewritten',
  );

  // Saving that colour fills a palette slot, and the slot sets the colour back.
  await page.locator('[data-action="swatch-save"]').first().click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('[data-swatch="#aa3322"]').count(), 'the saved colour is offered as a swatch');
  await universal.fill('#224488');
  await universal.dispatchEvent('change');
  await page.waitForTimeout(400);
  await page.locator('[data-swatch="#aa3322"]').first().click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.edgeColor), '#aa3322', 'and clicking it puts that colour back');
  // Previous is now the colour it held before this one.
  assert.ok(await page.locator('.swatch-previous').count(), 'and Previous offers the colour before it');

  // --- The export frame: a chosen shape, not the browser window's.
  await page.click('[data-tab="export"]');
  await page.getByLabel('Export frame').selectOption('phone');
  await page.waitForTimeout(300);
  const shot = await page.evaluate(async () => {
    const scene = window.__booth.scene;
    const blob = await scene.export(1920, { frame: 'phone' });
    const bitmap = await createImageBitmap(blob);
    const canvas = scene.renderer.domElement;
    return { width: bitmap.width, height: bitmap.height, canvasAspect: canvas.width / canvas.height, aspect: scene.camera.aspect };
  });
  assert.deepEqual([shot.width, shot.height], [1080, 1920], 'a vertical export is 1080 x 1920 in a landscape window');
  assert.ok(shot.canvasAspect > 1, 'the window itself is still landscape');
  assert.ok(Math.abs(shot.aspect - shot.canvasAspect) < 0.01, 'and the camera is handed back the viewport it had');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS finishing: Photoshop drop shadows, hidden spotlights, universal edges, saved palette, export frame.');
} finally {
  await browser.close();
  await server.close();
}
