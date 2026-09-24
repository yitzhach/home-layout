// Lights and daylight (phase 4).
//
// Through the Rooms tab a pendant goes into the living room and a floor lamp
// beside it; each is a point light at the right height with a fixture drawn
// round it, a lamp switched off keeps its shape and loses its light, and both
// survive a reload. Daylight turned on makes the one directional light the
// sun — from the south-east in the morning, the west in the evening, gone at
// night — and makes the ceilings cast shadows; turned off, the house is lit
// from above as before.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5231 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5231');
  await page.waitForFunction(() => !!window.__booth?.scene);

  const drawn = () => page.evaluate(() => {
    const s = window.__booth.scene, b = window.__booth.project.booth, IN = 0.0254;
    const lights = [];
    s.group.traverse((o) => {
      if (!o.name?.startsWith('room-light:')) return;
      const bulb = o.children.find((c) => c.isPointLight);
      lights.push({ id: o.userData.light, room: o.userData.room, y: o.position.y / IN, x: o.position.x / IN, meshes: o.children.filter((c) => c.isMesh).length, light: bulb ? { intensity: bulb.intensity, distance: bulb.distance, shadow: bulb.castShadow } : null });
    });
    const sun = s.group.getObjectByName('daylight-sun');
    const dirs = [];
    s.group.traverse((o) => { if (o.isDirectionalLight) dirs.push(o); });
    const ceilings = b.rooms.map((r) => s.group.getObjectByName('room-ceiling:' + r.id).castShadow);
    return { lights, sun: sun ? { x: sun.position.x, y: sun.position.y, z: sun.position.z, intensity: sun.intensity, altitude: sun.userData.altitude } : null, dirs: dirs.length, ceilings, rooms: b.rooms };
  });

  let d = await drawn();
  assert.equal(d.lights.length, 0, 'the starter floor has no fixtures');
  assert.equal(d.sun, null, 'and no sun');
  assert.ok(d.ceilings.every((c) => !c), 'ceilings cast nothing without the sun');

  // ---- A pendant and a floor lamp in the living room ----------------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.click('[data-action="light-add"][data-kind="pendant"]');
  await page.click('[data-action="light-add"][data-kind="floor"]');
  d = await drawn();
  const living = d.rooms.find((r) => r.name === 'Living room');
  assert.equal(d.lights.length, 2);
  const [pendant, lamp] = d.lights;
  assert.ok(Math.abs(pendant.y - (living.height - 30)) < 0.01, `pendant hangs 30″ below the ceiling, at ${pendant.y}`);
  assert.ok(Math.abs(lamp.y - 60) < 0.01, 'a floor lamp shade at 60″');
  assert.ok(pendant.meshes >= 3 && lamp.meshes >= 3, 'each has a fixture drawn');
  assert.ok(pendant.light && pendant.light.intensity > 50 && !pendant.light.shadow, 'a lit pendant, casting no shadow');
  assert.ok(pendant.light.distance > 0, 'its reach is bounded');

  // Move the lamp and switch it off.
  const lampInput = (field) => `input[data-field="${field}"][data-scope$="${lamp.id}"]`;
  await page.fill(lampInput('x'), '60');
  await page.press(lampInput('x'), 'Enter');
  await page.uncheck(lampInput('on'));
  d = await drawn();
  const lamp2 = d.lights.find((l) => l.id === lamp.id);
  assert.ok(Math.abs(lamp2.x - (living.x + 60)) < 0.01, `the lamp moved 60″ east of centre, at ${lamp2.x}`);
  assert.equal(lamp2.light, null, 'off: no light');
  assert.ok(lamp2.meshes >= 3, 'but still its shape');

  // ---- Daylight ----------------------------------------------------------
  await page.check('input[data-field="on"][data-scope="daylight"]');
  const setHour = (h) => page.locator('input[data-field="hour"][data-scope="daylight"]').evaluate((el, h) => { el.value = String(h); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, h);
  await setHour(9);
  d = await drawn();
  assert.ok(d.sun, 'the sun is up');
  assert.equal(d.dirs, 1, 'the sun replaces the fill light, not joins it');
  assert.ok(d.sun.x > 0 && d.sun.z > 0 && d.sun.y > 0, `morning sun south-east and above: ${JSON.stringify(d.sun)}`);
  assert.ok(d.ceilings.every((c) => c), 'ceilings cast shadows in daylight');
  const morning = d.sun.intensity;
  await setHour(18);
  d = await drawn();
  assert.ok(d.sun.x < 0, 'evening sun in the west');
  await setHour(12);
  d = await drawn();
  assert.ok(d.sun.intensity > morning, 'noon is stronger than nine');
  await setHour(21.5);
  d = await drawn();
  assert.equal(d.sun.intensity, 0, 'no sun after dark');
  assert.ok(await page.locator('text=9:30 pm').count(), 'the time is shown');

  // ---- Survives a reload; off puts the house back -------------------------
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved'));
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  d = await drawn();
  assert.equal(d.lights.length, 2);
  assert.equal(d.lights.find((l) => l.id === lamp.id).light, null, 'the lamp is still off');
  assert.ok(d.sun && d.sun.altitude < 0, 'still night');
  await page.click('[data-tab="rooms"]');
  await page.uncheck('input[data-field="on"][data-scope="daylight"]');
  d = await drawn();
  assert.equal(d.sun, null);
  assert.ok(d.ceilings.every((c) => !c));
  await page.click('[data-action="undo"]');
  d = await drawn();
  assert.ok(d.sun, 'undo turns the sun back on');

  // ---- Removing a fixture; deleting a room takes its fixtures -------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.click(`[data-action="light-delete"][data-light="${pendant.id}"]`);
  d = await drawn();
  assert.deepEqual(d.lights.map((l) => l.id), [lamp.id]);

  // ---- AI material help, with the Worker played by a stand-in -------------
  // The dev server has no /api, so first: AI not set up is a toast, nothing more.
  // A real 8×8 PNG, built here so the test carries no binary file.
  const png = (() => {
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body)); return Buffer.concat([len, body, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
    const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill([90, 61, 43]).flat()])));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  })();
  const choose = async (kind) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`[data-action="ai-match"][data-kind="${kind}"]`)]);
    await chooser.setFiles({ name: 'floor.png', mimeType: 'image/png', buffer: png });
  };
  await choose('floor');
  await page.waitForSelector('text=AI is not set up on this site yet.');
  const sent = [];
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/ai/material', (r) => { sent.push(r.request().postDataJSON()); r.fulfill({ json: { label: 'Wide walnut', finish: 'walnut', color: '#5a3d2b', roughness: 0.5 } }); });
  // Status is asked once per page; a reload asks again.
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await choose('floor');
  await page.waitForFunction(() => window.__booth.project.booth.rooms[0].finish?.floor === 'walnut');
  let fin = await page.evaluate(() => window.__booth.project.booth.rooms[0].finish);
  assert.equal(fin.floorColor, '#5a3d2b', 'the floor takes the photo\'s colour');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'floor');
  assert.equal(sent[0].mediaType, 'image/jpeg', 'sent as a JPEG');
  assert.ok(sent[0].image.length > 20 && !sent[0].image.startsWith('data:'), 'bare base64');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await choose('wall');
  await page.waitForFunction(() => window.__booth.project.booth.rooms[0].finish?.walls === '#5a3d2b');
  assert.equal(sent[1].kind, 'wall');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS lights: a pendant and a floor lamp at their heights with fixtures drawn, a lamp moved and switched off, the sun south-east at nine, west at six, strongest at noon and gone at night, ceilings shading only in daylight, all surviving a reload and undo; AI material help off without the Worker, and with it a photo sent as a JPEG setting a floor and a wall paint.');
} finally {
  await browser.close();
  await server.close();
}
