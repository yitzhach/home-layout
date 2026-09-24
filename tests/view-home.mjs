// A home furnished and finished: the furniture picker offers the home set by
// room, a piece that stands against a wall goes against the selected room's
// north wall, a rug lies under the sofa without a clearance complaint, each
// room's floor, walls and ceiling take a finish of their own — a shared wall
// finished from each side separately — and Start a new home opens an empty
// floor as well as the starter one.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5218 } });
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
  // The owner's photograph of tile, served as if it were in
  // public/assets/textures/finish-tile/: an 8×8 JPEG, so the test can tell
  // it from the 256px drawn pattern. Every other finish has no files.
  const photo = jpeg.encode({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 200) }, 90).data;
  await page.route('**/assets/textures/finish-*/**', (route) => {
    const url = route.request().url();
    if (url.includes('/finish-tile/color.jpg')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: photo });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
  });
  await page.goto('http://127.0.0.1:5218');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // A tiled floor wears the photograph once it has loaded, tinted to the
  // colour chosen for it; a kind with no files keeps its drawn pattern.
  await page.waitForFunction(() => {
    const b = window.__booth.project.booth, k = b.rooms.find((r) => r.name === 'Kitchen');
    return window.__booth.scene.group.getObjectByName('room-floor:' + k.id)?.material.map?.image?.width === 8;
  }, null, { timeout: 10000 });
  const tint = await page.evaluate(() => {
    const b = window.__booth.project.booth, k = b.rooms.find((r) => r.name === 'Kitchen');
    return window.__booth.scene.group.getObjectByName('room-floor:' + k.id).material.color.getHexString();
  });
  assert.notEqual(tint, 'ffffff', 'the kitchen\'s tile colour tints the photograph');

  // ---- Furniture ---------------------------------------------------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Bedroom")');
  await page.click('[data-tab="walls"]');
  const groups = await page.evaluate(() => [...document.querySelectorAll('#furniture-kind optgroup')].map((g) => g.label));
  assert.deepEqual(groups, ['Living', 'Dining', 'Bedroom', 'Office', 'Kitchen', 'Bath', 'Other'], 'the picker is grouped by room');
  const kinds = await page.evaluate(() => [...document.querySelectorAll('#furniture-kind option')].map((o) => o.value));
  for (const k of ['bed', 'sofa', 'chair', 'dining', 'desk', 'counter', 'wallcab', 'bookcase', 'rug', 'media']) assert.ok(kinds.includes(k), `offers ${k}`);
  for (const k of ['table6', 'bin', 'gridwall', 'banner']) assert.ok(!kinds.includes(k), `a home is not offered the booth's ${k}`);

  await page.selectOption('#furniture-kind', 'bed');
  await page.click('[data-action="add-pedestal"]');
  const placed = await page.evaluate(() => {
    const b = window.__booth.project.booth, bed = b.pedestals.at(-1), room = b.rooms.find((r) => r.name === 'Bedroom');
    return { bed, north: room.z - room.depth / 2, x0: room.x - room.width / 2, x1: room.x + room.width / 2 };
  });
  assert.equal(placed.bed.kind, 'bed');
  assert.equal(placed.bed.z - placed.bed.depth / 2, placed.north, 'the headboard is against the north wall');
  assert.ok(placed.bed.x - placed.bed.width / 2 >= placed.x0 && placed.bed.x + placed.bed.width / 2 <= placed.x1, 'inside the room');
  assert.equal(placed.bed.room, undefined, 'the catalogue fields stay out of the record');
  const parts = await page.evaluate((id) => window.__booth.scene.pedestalObjects.filter((m) => m.userData.pedestal === id).length, placed.bed.id);
  assert.ok(parts >= 5, `the bed is drawn as a bed (${parts} parts)`);

  // A rug under a sofa is not "standing in" it.
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.click('[data-tab="walls"]');
  for (const k of ['sofa', 'rug']) {
    await page.selectOption('#furniture-kind', k);
    await page.click('[data-action="add-pedestal"]');
  }
  const overlaps = await page.evaluate(async () => {
    const { checkClearance } = await import('/src/clearance.js');
    const b = window.__booth.project.booth, rug = b.pedestals.find((x) => x.kind === 'rug'), sofa = b.pedestals.find((x) => x.kind === 'sofa');
    rug.x = sofa.x; rug.z = sofa.z;
    return checkClearance(window.__booth.project).filter((i) => i.kind === 'overlap' && i.ids.includes('pedestal:' + rug.id)).length;
  });
  assert.equal(overlaps, 0, 'a rug lies under the sofa');

  // ---- Finishes ----------------------------------------------------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.getByLabel('Living room floor finish').selectOption('tile');
  const floor = await page.evaluate(() => {
    const b = window.__booth.project.booth, r = b.rooms.find((x) => x.name === 'Living room');
    const m = window.__booth.scene.group.getObjectByName('room-floor:' + r.id).material;
    return { finish: r.finishes.floor, map: !!m.map, repeat: m.map && [m.map.repeat.x, m.map.repeat.y], width: r.width, depth: r.depth };
  });
  assert.equal(floor.finish.kind, 'tile');
  assert.ok(floor.map, 'the floor is drawn tiled');
  assert.ok(Math.abs(floor.repeat[0] - floor.width / 24) < 1e-6 && Math.abs(floor.repeat[1] - floor.depth / 24) < 1e-6, `at 24″ per tile of the pattern (${floor.repeat})`);

  // Brick walls in the living room: its own faces change, the kitchen's face
  // of the wall they share does not.
  await page.getByLabel('Living room walls finish').selectOption('brick');
  const faces = await page.evaluate(() => {
    const b = window.__booth.project.booth, r = b.rooms.find((x) => x.name === 'Living room');
    const shared = window.__booth.scene.wallObjects.find((m) => m.userData.wall.startsWith(`room:${r.id}:e:`));
    return { front: !!shared.material[4].map, back: !!shared.material[5].map, backColor: shared.material[5].color.getHexString() };
  });
  assert.ok(faces.front, 'the living room face is brick');
  assert.ok(!faces.back, 'the kitchen face is still paint');
  assert.equal('#' + faces.backColor, await page.evaluate(() => window.__booth.project.booth.color));

  // One wall differently: the north wall tiled.
  await page.locator('.finish-sides summary').click();
  await page.getByLabel('Living room north wall finish').selectOption('tile');
  const north = await page.evaluate(() => window.__booth.project.booth.rooms.find((x) => x.name === 'Living room').finishes);
  assert.equal(north.n.kind, 'tile');
  assert.equal(north.walls.kind, 'brick');
  await page.getByLabel('Living room north wall finish').selectOption('');
  assert.equal(await page.evaluate(() => window.__booth.project.booth.rooms.find((x) => x.name === 'Living room').finishes.n), undefined, '"Same as the walls" takes it away');

  // Ceilings face down: seen from inside a room, not from above.
  const ceiling = await page.evaluate(() => {
    const b = window.__booth.project.booth, r = b.rooms[0];
    const c = window.__booth.scene.group.getObjectByName('room-ceiling:' + r.id);
    c.updateMatrixWorld(true);
    const n = c.getWorldDirection(c.position.clone());
    return { y: c.position.y, h: r.height * 0.0254, ny: n.y };
  });
  assert.ok(Math.abs(ceiling.y - ceiling.h) < 0.01, 'at the room height');
  assert.ok(ceiling.ny < -0.99, 'facing down');

  // Survives a reload.
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved'));
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.rooms[0].finishes.floor.kind), 'tile');

  // ---- Start a new home --------------------------------------------------
  await page.click('[data-tab="layout"]');
  await page.click('[data-action="new-project"]');
  await page.selectOption('#qs-template', 'empty');
  await page.uncheck('#qs-backup');
  await page.fill('#qs-name', 'Blank slate');
  await page.click('[data-action="qs-go"]');
  const fresh = await page.evaluate(() => ({ name: window.__booth.project.name, rooms: window.__booth.project.booth.rooms.length }));
  assert.deepEqual(fresh, { name: 'Blank slate', rooms: 0 });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS a home furnished and finished: the picker offers the home set by room, a bed goes against the north wall, a rug lies under the sofa, floors, walls and ceilings take finishes room by room and face by face, a photographed finish replaces the drawn one, they survive a reload, and a new home can start empty.');
} finally {
  await browser.close();
  await server.close();
}
