// The house: rooms, the walls they share, and the openings cut into them.
//
// A first visit opens the starter floor. Its walls are built from the rooms —
// one wall where two rooms meet — with doors, windows and an archway cut into
// them, and the sample works hang on the living room's walls. Through the
// Rooms tab a room is added beside another (sharing its wall, with a door),
// resized from the shared edge, given a window, opened up and deleted, and
// every step survives a reload or comes back with undo.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5217 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5217');
  await page.waitForFunction(() => !!window.__booth?.scene);

  const state = () => page.evaluate(() => {
    const s = window.__booth.scene, b = window.__booth.project.booth;
    const walls = new Set(s.wallObjects.map((m) => m.userData.wall));
    let arcs = 0, leaves = 0;
    s.group.traverse((o) => {
      if (o.isLine && o.userData.editorOnly && o.geometry.attributes.position.count === 25) arcs++;
      if (o.userData.tag === 'doors') leaves++;
    });
    return { rooms: b.rooms.map((r) => ({ id: r.id, name: r.name, x: r.x, width: r.width, open: r.open, openings: r.openings.length })), walls: [...walls], arcs, leaves, width: b.width, art: window.__booth.project.art.map((a) => a.wall) };
  });

  let s = await state();
  assert.deepEqual(s.rooms.map((r) => r.name), ['Living room', 'Kitchen', 'Bedroom', 'Bathroom'], 'a first visit opens the starter floor');
  assert.ok(s.walls.every((k) => k.startsWith('room:')), 'every wall is a room wall');
  // 16 sides; living/kitchen, living/bedroom and bedroom/bath share one each,
  // and the bathroom's south wall is split between living room and kitchen.
  assert.equal(s.walls.length, 12, 'shared walls are built once');
  assert.equal(s.leaves, 3, 'three doors stand open');
  assert.equal(s.arcs, 3, 'and each draws its swing for Plan view');
  assert.ok(s.art.length === 3 && s.art.every((k) => s.walls.includes(k)), 'the sample works hang on room walls');
  assert.equal(await page.evaluate(() => window.__booth.scene.camera.position.y > 5), true, 'a house is looked into from above');

  // ---- Add a room beside the kitchen -------------------------------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Kitchen")');
  await page.selectOption('#new-room-type', 'dining');
  const cameraBefore = await page.evaluate(() => window.__booth.scene.camera.position.y);
  await page.click('[data-action="room-add"][data-side="e"]');
  s = await state();
  const dining = s.rooms.at(-1);
  assert.ok(await page.evaluate(() => window.__booth.scene.camera.position.y) > cameraBefore + 0.1,
    'a house that grows is framed again, so the new room is in view');

  // ---- Clicking a room's floor selects that room -------------------------
  await page.click('[data-tab="art"]');
  const at = await page.evaluate((id) => {
    const s = window.__booth.scene, floor = s.group.getObjectByName('room-floor:' + id);
    s.group.updateMatrixWorld(true);
    // The far half of the floor, which the camera sees over the near wall.
    const v = floor.getWorldPosition(floor.position.clone());
    v.z -= floor.geometry.parameters.depth * 0.3;
    v.project(s.camera);
    const r = s.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, dining.id);
  await page.mouse.click(at.x, at.y);
  await page.waitForSelector('[data-action="room-select"].active:has-text("Dining room")');
  assert.equal(dining.name, 'Dining room');
  assert.equal(dining.openings, 1, 'a new room comes with a door into it');
  assert.equal(s.walls.length, 15, 'three new walls; the shared one is the kitchen\'s');
  assert.equal(s.leaves, 4);
  const kitchen = s.rooms.find((r) => r.name === 'Kitchen');
  const kitchenEast = kitchen.x + kitchen.width / 2;
  assert.equal(dining.x - dining.width / 2, kitchenEast, 'it stands against the kitchen');

  // Grown from the shared edge, not the centre.
  const width = page.getByLabel('Dining room Width', { exact: true });
  await width.fill('180');
  await width.dispatchEvent('change');
  s = await state();
  const grown = s.rooms.at(-1);
  assert.equal(grown.width, 180);
  assert.equal(grown.x - grown.width / 2, kitchenEast, 'the wall it shares stays put');
  assert.ok(s.width >= 2 * (grown.x + 90), 'the floor grows to hold it');

  // A window, placed on the east wall.
  await page.click('[data-action="opening-add"][data-kind="window"]');
  const side = page.getByLabel('Window wall').last();
  await side.selectOption('e');
  s = await state();
  assert.equal(s.rooms.at(-1).openings, 2);
  const glass = await page.evaluate(() => {
    let n = 0;
    window.__booth.scene.group.traverse((o) => { if (o.material?.isMeshPhysicalMaterial && o.material.transmission > 0) n++; });
    return n;
  });
  assert.ok(glass >= 6, `windows are glazed (${glass})`);

  // Opened up to the kitchen: the shared wall goes, whichever room opens it.
  await page.getByLabel(/West wall/).uncheck();
  s = await state();
  assert.deepEqual(s.rooms.at(-1).open, ['w']);
  // The kitchen is 24″ deeper than the dining room, so that much of its east
  // wall still stands; the stretch the two rooms share is gone.
  const kitchenEastWalls = await page.evaluate(() => {
    const b = window.__booth.project.booth, k = b.rooms.find((r) => r.name === 'Kitchen');
    return window.__booth.scene.wallObjects.filter((m) => m.userData.wall.startsWith(`room:${k.id}:e:`)).map((m) => m.userData.wall);
  });
  assert.equal(new Set(kitchenEastWalls).size, 1, 'one piece of the kitchen east wall');
  assert.equal(await page.evaluate((key) => window.__booth.scene.wallObjects.filter((m) => m.userData.wall === key).reduce((w, m) => w + m.geometry.parameters.width, 0), kitchenEastWalls[0]) < 0.62, true, 'and it is only the 24″ stub');
  assert.equal(s.leaves, 3, 'and the door that was in it is gone with it');

  // Survives a reload.
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved'));
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  s = await state();
  assert.equal(s.rooms.length, 5);
  assert.equal(s.rooms.at(-1).width, 180);
  assert.equal(s.walls.length, 15);

  // Deleting a room takes its art down with its walls; undo brings both back.
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.click('[data-action="room-delete"]');
  await page.click('#confirm-go');
  s = await state();
  assert.equal(s.rooms.length, 4);
  assert.equal(s.art.length, 0, 'the living room\'s works came down with it');
  await page.click('[data-action="undo"]');
  s = await state();
  assert.equal(s.rooms.length, 5);
  assert.equal(s.art.length, 3, 'undo hangs them again');

  // Plan view: the floor plan.
  await page.locator('[data-view="plan"]').click();
  assert.equal(await page.evaluate(() => window.__booth.scene.camera.isOrthographicCamera), true);

  // Stairs are a floor piece like any other.
  await page.click('[data-tab="walls"]');
  await page.selectOption('#furniture-kind', 'stairs');
  await page.click('[data-action="add-pedestal"]');
  const stairs = await page.evaluate(() => window.__booth.project.booth.pedestals.at(-1));
  assert.equal(stairs.kind, 'stairs');
  assert.equal(stairs.height, 108);
  assert.equal(stairs.limits, undefined, 'the kind\'s limits are not copied into the record');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS the starter floor builds shared walls once with doors, windows and an archway cut in; a room added beside another shares its wall and gets a door, grows from that wall, takes a window, opens up, survives a reload, and comes back with undo after a delete; the view refits as the house grows; clicking a room floor selects it; stairs are furniture.');
} finally {
  await browser.close();
  await server.close();
}
