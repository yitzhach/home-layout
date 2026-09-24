// The art-show booth in a real renderer. The node tests pin the arithmetic;
// this checks that the venue switch reaches the scene: seamless walls, nine
// spotlights hung on a bar, a hall around the booth, and a pedestal that can
// be picked up and dragged across the floor.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5197 } });
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
  await page.goto('http://127.0.0.1:5197');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // --- The venue switch.
  await page.click('[data-tab="show"]');
  await page.getByLabel('Venue').selectOption('artshow');
  await page.waitForTimeout(600);
  const booth = await page.evaluate(() => window.__booth.project.booth);
  assert.equal(booth.venue, 'artshow');
  assert.equal(booth.walls.back.width, 144, 'the back wall is 144in');
  assert.equal(booth.walls.left.width, 120, 'the side walls are 120in');
  assert.equal(booth.walls.back.height, 144, 'and all of them are 144in tall');
  assert.equal(booth.tent, false, 'no canopy indoors');

  // --- Seamless walls: the slabs are there, the seam posts are not.
  const walls = await page.evaluate(() => {
    const scene = window.__booth.scene;
    scene.group.updateMatrixWorld(true);
    const slabs = scene.wallObjects.map((o) => o.userData.wall);
    // Every box in the group that is not a wall slab and stands as tall as a
    // wall would be a seam post. The outdoor booth has one every 30 inches.
    let posts = 0;
    scene.group.traverse((o) => {
      const box = o.geometry?.parameters;
      if (!box || o.userData.wall || o.userData.artId) return;
      if (box.width && box.width < 0.02 && box.height > 1) posts += 1;
    });
    return { slabs, posts };
  });
  assert.deepEqual(walls.slabs.sort(), ['back', 'left', 'right'], 'three wall slabs');
  assert.equal(walls.posts, 0, 'an art-show wall has no seam posts in it');

  // --- The light bar: nine spotlights, each aimed at a wall, plus the rail.
  const bar = await page.evaluate(() => {
    const scene = window.__booth.scene;
    const rail = scene.group.getObjectByName('light-bar');
    if (!rail) return null;
    const spots = [];
    let bounce = null;
    rail.traverse((o) => {
      if (o.isHemisphereLight) bounce = o.intensity;
      if (o.isSpotLight) spots.push({
        pos: [o.position.x, o.position.y, o.position.z],
        target: [o.target.position.x, o.target.position.y, o.target.position.z],
        angle: o.angle,
        penumbra: o.penumbra,
        intensity: o.intensity,
        shadowIntensity: o.shadow.intensity,
      });
    });
    return { spots, bounce, expected: window.__booth.fixtures };
  });
  // The brightness this booth is actually carrying, so the assertions below
  // are about the bar rather than about whatever the default happens to be.
  const typed = await page.evaluate(() => window.__booth.project.booth.lightBar.power);
  assert.ok(bar, 'the bar is in the scene');
  assert.equal(bar.spots.length, 9, 'nine directional fixtures');
  assert.equal(bar.expected.length, 9, 'and the booth says there should be nine');
  for (let i = 0; i < 9; i++) {
    const f = bar.expected[i];
    assert.ok(Math.abs(bar.spots[i].pos[0] - f.x * IN) < 1e-6, `fixture ${i + 1} hangs where the bar says`);
    assert.ok(Math.abs(bar.spots[i].pos[1] - f.y * IN) < 1e-6);
    assert.ok(Math.abs(bar.spots[i].target[0] - f.tx * IN) < 1e-6, `fixture ${i + 1} is aimed where the wall is`);
    assert.ok(Math.abs(bar.spots[i].target[2] - f.tz * IN) < 1e-6);
  }

  // --- Diffusion: the softening has to reach the renderer, not just the model.
  // The default bar is diffused, so every head must arrive wider, softer-edged
  // and filling its shadow rather than stacking a ninth hard one.
  for (const spot of bar.spots) {
    assert.ok(spot.angle > Math.PI / 8, 'a diffused head opens wider than a bare washer');
    assert.ok(spot.penumbra > 0.8, 'and spends most of its cone fading out');
    assert.ok(spot.shadowIntensity < 0.6, 'and fills its shadow rather than cutting one');
    assert.ok(spot.intensity < typed, 'and is trimmed back, so softer does not arrive brighter');
  }
  assert.ok(bar.bounce > 0, 'the white hall bounces the bar back at itself');

  // --- Bar shadows: the live viewport's biggest per-pixel cost, left off below
  // High detail and put back for every delivered file.
  const barShadows = () => page.evaluate(() => {
    const out = [];
    window.__booth.scene.group.getObjectByName('light-bar').traverse((o) => { if (o.isSpotLight) out.push(o.castShadow); });
    return out;
  });
  assert.ok((await barShadows()).every((on) => !on), 'the live viewport does not draw nine bar shadows by default');
  const exported = await page.evaluate(async () => {
    const scene = window.__booth.scene;
    let seen = null;
    const real = scene.renderFrame.bind(scene);
    scene.renderFrame = () => {
      if (seen === null) { seen = []; scene.group.getObjectByName('light-bar').traverse((o) => { if (o.isSpotLight) seen.push(o.castShadow); }); }
      return real();
    };
    try { await scene.export(1024); } finally { scene.renderFrame = real; }
    return seen;
  });
  assert.equal(exported.length, 9);
  assert.ok(exported.every(Boolean), 'an export draws every bar shadow');
  assert.ok((await barShadows()).every((on) => !on), 'and the viewport goes back to going without');
  await page.evaluate(() => window.__booth.scene.setQuality(3));
  assert.ok((await barShadows()).every(Boolean), 'High detail draws them live');
  await page.evaluate(() => window.__booth.scene.update(window.__booth.project, null));
  assert.ok((await barShadows()).every(Boolean), 'and a rebuilt bar keeps them');
  await page.evaluate(() => window.__booth.scene.setQuality('auto'));
  assert.ok((await barShadows()).every((on) => !on));

  // Turning diffusion off must put the bare source back, bounce and all — and
  // hand the light exactly the brightness that was typed. 12 rather than the
  // default, so this cannot pass by comparing the default to itself: the
  // slider shows a percentage now, but the stored unit is still the light's
  // own power and it reaches the renderer untouched.
  await page.evaluate(() => {
    const b = window.__booth.project.booth;
    b.lightBar = { ...b.lightBar, diffusion: 0, power: 12 };
    window.__booth.scene.update(window.__booth.project);
  });
  const bare = await page.evaluate(() => {
    const rail = window.__booth.scene.group.getObjectByName('light-bar');
    const spots = [];
    let bounce = 0;
    rail.traverse((o) => {
      if (o.isHemisphereLight) bounce = o.intensity;
      if (o.isSpotLight) spots.push([o.angle, o.penumbra, o.shadow.intensity, o.intensity]);
    });
    return { spots, bounce };
  });
  assert.equal(bare.bounce, 0, 'a bare source leaves no bounce behind');
  for (const [angle, , shadowIntensity, intensity] of bare.spots) {
    assert.ok(Math.abs(angle - Math.PI / 8) < 1e-6, 'diffusion 0 is the original wall washer');
    assert.equal(shadowIntensity, 1, 'and cuts a full-strength shadow again');
    assert.ok(Math.abs(intensity - 12) < 1e-6, 'and burns the brightness the user typed');
  }
  // Back to a diffused bar at the brightness this booth opened with, so the
  // hall assertions below read a booth in its default state.
  await page.evaluate((power) => {
    const b = window.__booth.project.booth;
    b.lightBar = { ...b.lightBar, diffusion: 0.7, power };
    window.__booth.scene.update(window.__booth.project);
  }, typed);

  // --- The exhibition hall.
  assert.ok(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('exhibition-hall')),
    'the booth stands in an exhibition hall');
  await page.getByLabel('Hall ceiling height').fill('240');
  await page.getByLabel('Hall ceiling height').dispatchEvent('change');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.hall.ceiling), 240,
    'the ceiling height is typed in inches');

  // --- Custom booth dimensions.
  await page.getByLabel('Booth width').fill('200');
  await page.getByLabel('Booth width').dispatchEvent('change');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.width), 200,
    'the whole footprint is typed, not chosen from a list');

  // --- The individual panel, and rebuilding the walls from it.
  await page.getByLabel('Panel width').fill('30');
  await page.getByLabel('Panel width').dispatchEvent('change');
  await page.locator('[data-action="relink-walls"]').click();
  await page.waitForTimeout(500);
  const rebuilt = await page.evaluate(() => window.__booth.project.booth.walls);
  assert.equal(rebuilt.back.width % 30, 0, 'the back wall is a whole number of 30in panels');
  assert.equal(rebuilt.left.width % 30, 0, 'and so is a side wall');

  // --- A pedestal: added, measured, and dragged across the floor.
  await page.click('[data-tab="walls"]');
  await page.locator('[data-action="add-pedestal"]').click();
  await page.waitForTimeout(500);
  const ped = await page.evaluate(() => window.__booth.project.booth.pedestals[0]);
  assert.equal(ped.height, 44, '44in tall');
  assert.equal(ped.width, 12, '12in wide');
  assert.equal(ped.depth, 12, '12in deep');
  assert.equal(await page.evaluate(() => window.__booth.selectedPedestal), ped.id,
    'a new pedestal arrives selected, ready to be moved');

  // Where its column stands, read back off the mesh.
  const pedestalState = () => page.evaluate(() => {
    const scene = window.__booth.scene;
    scene.group.updateMatrixWorld(true);
    const mesh = scene.pedestalObjects[0];
    const m = mesh.matrixWorld.elements, box = mesh.geometry.parameters;
    return { centre: [m[12], m[13], m[14]], width: box.width, height: box.height };
  });
  await page.getByLabel('Pedestal 1 Position X').fill('-20');
  await page.getByLabel('Pedestal 1 Position X').dispatchEvent('change');
  await page.getByLabel('Pedestal 1 Position Z').fill('12');
  await page.getByLabel('Pedestal 1 Position Z').dispatchEvent('change');
  await page.waitForTimeout(500);
  let stood = await pedestalState();
  assert.ok(Math.abs(stood.centre[0] - -20 * IN) < 1e-6, 'X is where it was typed');
  assert.ok(Math.abs(stood.centre[2] - 12 * IN) < 1e-6, 'Z is where it was typed');
  assert.ok(Math.abs(stood.width - 12 * IN) < 1e-6, 'and it is as wide as it says');

  // Drag it. A selected pedestal follows the pointer, the way a wall does.
  const screenPoint = async () => page.evaluate(() => {
    const scene = window.__booth.scene;
    scene.group.updateMatrixWorld(true);
    const mesh = scene.pedestalObjects[0];
    const v = mesh.localToWorld(new (mesh.position.constructor)(0, 0, 0));
    v.project(scene.camera);
    const r = scene.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  });
  const [px, py] = await screenPoint();
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 120, py + 30, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await page.evaluate(() => window.__booth.project.booth.pedestals[0]);
  assert.ok(Math.abs(dragged.x - -20) > 1 || Math.abs(dragged.z - 12) > 1,
    'dragging a selected pedestal moves it across the floor');
  assert.equal(dragged.x, Math.round(dragged.x), 'a snapped drag lands on whole inches');
  const half = await page.evaluate(() => window.__booth.project.booth.width / 2);
  assert.ok(Math.abs(dragged.x) <= half, 'and it stops at the footprint');
  stood = await pedestalState();
  assert.ok(Math.abs(stood.centre[0] - dragged.x * IN) < 1e-6,
    'the mesh stands where the drag says, without a scene rebuild to put it there');
  assert.equal(Number(await page.getByLabel('Pedestal 1 Position X').inputValue()), dragged.x,
    'and the typed field follows the drag');

  // Removing it takes its meshes with it.
  await page.locator('[data-action^="delete-pedestal-"]').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__booth.scene.pedestalObjects.length), 0,
    'a removed pedestal leaves nothing behind');

  // --- Back to the outdoor booth, with the seam posts returning.
  await page.click('[data-tab="show"]');
  await page.getByLabel('Venue').selectOption('outdoor');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.width), 120);
  assert.equal(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('light-bar')), false,
    'the outdoor booth has no light bar');
  assert.equal(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('exhibition-hall')), false,
    'and no hall around it');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS art show booth: seamless walls, nine-head light bar, hall, and a pedestal you can drag.');
} finally {
  await browser.close();
  await server.close();
}
