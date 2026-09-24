// Wall photos (phase 3).
//
// Through the Rooms tab the living room's north wall is photographed: the
// corner editor opens on the photo, a handle is dragged, and the photo is
// used. The wall then carries the straightened picture, cut round the side's
// openings, on the face that looks into the room. Its typed size moves with
// the fields, the corners can be found by the AI Worker (played here by a
// stand-in), and it survives a reload; removing it drops its image, and undo
// brings both back.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5233 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});

// A 320×240 PNG, grey with a lighter quadrilateral: a wall seen at an angle.
function png(w = 320, h = 240) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body)); return Buffer.concat([len, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) {
      const inWall = x > 40 + y * 0.05 && x < 290 - y * 0.05 && y > 20 && y < 220;
      row.push(...(inWall ? [214, 196, 170] : [60, 60, 64]));
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5233');
  await page.waitForFunction(() => !!window.__booth?.scene);

  const drawn = () => page.evaluate(() => {
    const s = window.__booth.scene, p = window.__booth.project, r = p.booth.rooms.find((x) => x.name === 'Living room');
    const g = s.group.getObjectByName(`wall-photo:${r.id}:n`);
    const meshes = g ? g.children.filter((c) => c.isMesh) : [];
    const area = meshes.reduce((a, m) => a + m.geometry.parameters.width * m.geometry.parameters.height, 0) / (0.0254 * 0.0254);
    return { photo: r.wallPhotos?.n || null, meshes: meshes.length, area, mapped: meshes.length > 0 && meshes.every((m) => !!m.material.map), mapSize: meshes[0]?.material.map ? [meshes[0].material.map.image.width, meshes[0].material.map.image.height] : null, walls: p.assets, room: r, wallAssets: Object.values(p.assets).filter((a) => a.role === 'wall').length };
  });

  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="wallphoto-add"][data-side="n"]')]);
  await chooser.setFiles({ name: 'north.png', mimeType: 'image/png', buffer: png() });
  await page.waitForSelector('.wall-photo-source');
  let d = await drawn();
  assert.equal(d.photo, null, 'nothing is stored until the photo is used');
  assert.equal(d.wallAssets, 0);

  // Drag the top-left handle from 10%,10% to where the wall's corner is.
  const box = await page.locator('.wall-photo-source').boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.13, box.y + box.height * 0.085, { steps: 4 });
  await page.mouse.up();
  const preview = await page.locator('.wall-photo-preview').evaluate((c) => [c.width, c.height]);
  assert.ok(preview[0] > preview[1], `the preview has the wall's shape: ${preview}`);
  await page.click('[data-wp="done"]');
  await page.waitForFunction(() => window.__booth.project.booth.rooms[0].wallPhotos?.n);
  await page.waitForFunction(() => {
    const s = window.__booth.scene, r = window.__booth.project.booth.rooms[0];
    const g = s.group.getObjectByName(`wall-photo:${r.id}:n`);
    return g && g.children.length && g.children.every((m) => !!m.material.map);
  });
  d = await drawn();
  assert.ok(Math.abs(d.photo.corners[0][0] - 0.13) < 0.01 && Math.abs(d.photo.corners[0][1] - 0.085) < 0.01, `the dragged corner is stored: ${d.photo.corners[0]}`);
  assert.deepEqual([d.photo.width, d.photo.height], [d.room.width, d.room.height], 'a new photo covers the whole wall');
  assert.equal(d.wallAssets, 1, 'the photo is kept as it was taken');
  // The door into the bedroom was typed in the bedroom; it cuts this side too.
  const expected = await page.evaluate(async () => {
    const { photoPieces } = await import('/src/wallphoto.js');
    const p = window.__booth.project, r = p.booth.rooms[0];
    return photoPieces(p, r, 'n', r.wallPhotos.n).reduce((a, q) => a + q.w * q.h, 0);
  });
  assert.ok(expected < d.room.width * d.room.height, 'the living room\'s north side has an opening in it');
  assert.ok(Math.abs(d.area - expected) < 1, `the photo covers the wall less its openings: ${d.area} vs ${expected}`);
  assert.ok(d.mapped, 'every piece shows the straightened photo');
  assert.ok(d.mapSize[0] > d.mapSize[1], 'straightened to the wall\'s shape');

  // A smaller stretch: typed width and height, set in from the left.
  const f = (key) => `input[data-field="${key}"][data-scope$="|n"][data-scope^="wallphoto|"]`;
  for (const [key, v] of [['width', '96'], ['height', '60'], ['x', '12'], ['y', '18']]) {
    await page.fill(f(key), v);
    await page.press(f(key), 'Enter');
  }
  d = await drawn();
  assert.deepEqual([d.photo.width, d.photo.height, d.photo.x, d.photo.y], [96, 60, 12, 18]);
  assert.ok(d.area <= 96 * 60 + 0.5 && d.area > 0, `drawn no bigger than typed: ${d.area}`);

  // ---- Corners again, found by the AI stand-in -----------------------------
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved'));
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/ai/corners', (r) => r.fulfill({ json: { found: true, corners: [[0.14, 0.09], [0.9, 0.09], [0.88, 0.9], [0.16, 0.9]] } }));
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  d = await drawn();
  assert.deepEqual([d.photo.width, d.photo.x], [96, 12], 'survives a reload');
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.click('[data-action="wallphoto-corners"][data-side="n"]');
  await page.click('[data-wp="find"]');
  await page.waitForSelector('text=Corners found');
  await page.click('[data-wp="done"]');
  await page.waitForFunction(() => window.__booth.project.booth.rooms[0].wallPhotos.n.corners[0][0] === 0.14);
  assert.equal((await drawn()).wallAssets, 1, 'moving corners keeps the one image');

  // ---- Remove, then undo ---------------------------------------------------
  await page.click('[data-action="wallphoto-delete"][data-side="n"]');
  d = await drawn();
  assert.equal(d.photo, null);
  assert.equal(d.meshes, 0);
  assert.equal(d.wallAssets, 0, 'its image goes with it');
  await page.click('[data-action="undo"]');
  d = await drawn();
  assert.ok(d.photo && d.wallAssets === 1, 'undo brings photo and image back');

  // An opened wall hides its photo without losing it.
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.uncheck('input[data-field="wall-n"]');
  d = await drawn();
  assert.equal(d.meshes, 0);
  assert.ok(d.photo, 'kept in the record');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS wall photo: chosen, cornered by dragging, stored only on use, straightened onto the wall less its openings, resized and set in by typing, corners found by the AI stand-in, surviving a reload; removed with its image and brought back by undo; hidden while its wall is open.');
} finally {
  await browser.close();
  await server.close();
}
