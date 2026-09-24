// Finishes: each room's paint, feature wall, floor and ceiling.
//
// The starter floor opens with each room in the floor its kind usually has
// and a ceiling that faces down only. Through the Rooms tab the living room
// is painted with a chip, given a feature wall, floored in walnut and tinted,
// and every change is on the right face of the right wall, survives a reload
// and comes back with undo.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5219 } });
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
  await page.goto('http://127.0.0.1:5219');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // What the scene drew: each floor's material and colour, each ceiling, and
  // the front and back paint of every room wall slab.
  const drawn = () => page.evaluate(() => {
    const s = window.__booth.scene, b = window.__booth.project.booth;
    const floors = {}, ceilings = {};
    for (const r of b.rooms) {
      const f = s.group.getObjectByName('room-floor:' + r.id), c = s.group.getObjectByName('room-ceiling:' + r.id);
      floors[r.name] = { finish: f.userData.finish, map: !!f.material.map };
      ceilings[r.name] = c ? { color: '#' + c.material.color.getHexString(), side: c.material.side, faceDown: Math.abs(c.rotation.x - Math.PI / 2) < 1e-6, shadow: c.castShadow } : null;
    }
    const walls = {};
    for (const m of s.wallObjects) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      walls[m.userData.wall] ??= { front: '#' + mats[4 % mats.length].color.getHexString(), back: '#' + mats[5 % mats.length].color.getHexString() };
    }
    return { floors, ceilings, walls, rooms: b.rooms, color: b.color };
  });
  const wallKey = (d, name, side) => {
    const r = d.rooms.find((x) => x.name === name);
    return Object.keys(d.walls).find((k) => k.startsWith(`room:${r.id}:${side}:`));
  };

  let d = await drawn();
  assert.deepEqual(Object.fromEntries(Object.entries(d.floors).map(([k, v]) => [k, v.finish])), { 'Living room': 'oak', Kitchen: 'tile', Bedroom: 'carpet', Bathroom: 'tile-small' }, 'each room starts in its usual floor');
  assert.ok(Object.values(d.floors).every((f) => f.map), 'every floor is drawn from a pattern, with public/assets empty');
  assert.ok(Object.values(d.ceilings).every((c) => c && c.faceDown && c.side === 0 && !c.shadow), 'every room has a ceiling that faces down, one-sided, casting nothing');
  assert.ok(Object.values(d.walls).every((w) => w.front === d.color && w.back === d.color), 'unpainted, every face is the house colour');

  // ---- Paint the living room with a chip ----------------------------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.click('[data-finish="walls"][data-value="#c9d3c4"]');
  d = await drawn();
  const shared = wallKey(d, 'Living room', 'e');
  assert.ok(shared, 'the living room owns the wall it shares with the kitchen');
  assert.equal(d.walls[shared].front, '#c9d3c4', 'the living room side of the shared wall is sage');
  assert.equal(d.walls[shared].back, d.color, 'the kitchen side is not');
  assert.equal(d.walls[wallKey(d, 'Living room', 'w')].front, '#c9d3c4');

  // A feature wall: the west wall its own colour.
  await page.selectOption('[data-field="finish-side-mode-w"]', 'own');
  const west = page.locator('input[data-field="finish-side-w"]');
  await west.evaluate((el) => { el.value = '#b7765a'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  d = await drawn();
  assert.equal(d.walls[wallKey(d, 'Living room', 'w')].front, '#b7765a', 'the feature wall');
  assert.equal(d.walls[wallKey(d, 'Living room', 'n')]?.front ?? '#c9d3c4', '#c9d3c4', 'the others keep the room paint');

  // The kitchen paints its own face of the shared wall.
  await page.click('[data-action="room-select"]:has-text("Kitchen")');
  await page.click('[data-finish="walls"][data-value="#45474a"]');
  d = await drawn();
  assert.deepEqual(d.walls[shared], { front: '#c9d3c4', back: '#45474a' }, 'one slab, two rooms, two paints');

  // ---- Floor: walnut, then tinted ----------------------------------------
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.selectOption('[data-field="finish-floor"]', 'walnut');
  d = await drawn();
  assert.equal(d.floors['Living room'].finish, 'walnut');
  await page.locator('input[data-field="finish-floorColor"]').evaluate((el) => { el.value = '#402a1c'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  let living = await page.evaluate(() => window.__booth.project.booth.rooms[0].finish);
  assert.deepEqual(living, { walls: '#c9d3c4', sides: { w: '#b7765a' }, floor: 'walnut', floorColor: '#402a1c' });

  // Ceiling colour.
  await page.locator('input[data-field="finish-ceiling"]').evaluate((el) => { el.value = '#fdf1dc'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  d = await drawn();
  assert.equal(d.ceilings['Living room'].color, '#fdf1dc');

  // ---- Survives a reload; undo takes a step back --------------------------
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved'));
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  d = await drawn();
  assert.equal(d.floors['Living room'].finish, 'walnut');
  assert.deepEqual(d.walls[shared], { front: '#c9d3c4', back: '#45474a' });
  assert.equal(d.ceilings['Living room'].color, '#fdf1dc');

  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Living room")');
  await page.selectOption('[data-field="finish-side-mode-w"]', 'room');
  d = await drawn();
  assert.equal(d.walls[wallKey(d, 'Living room', 'w')].front, '#c9d3c4', 'back to the room paint');
  await page.click('[data-action="undo"]');
  d = await drawn();
  assert.equal(d.walls[wallKey(d, 'Living room', 'w')].front, '#b7765a', 'undo brings the feature wall back');

  // ---- A new room gets its kind's floor ----------------------------------
  await page.click('[data-tab="rooms"]');
  await page.click('[data-action="room-select"]:has-text("Kitchen")');
  await page.selectOption('#new-room-type', 'laundry');
  await page.click('[data-action="room-add"][data-side="e"]');
  d = await drawn();
  assert.equal(d.floors.Laundry.finish, 'vinyl');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS finishes: starter rooms floored by kind with one-sided ceilings; a room painted by chip, a feature wall, each face of a shared wall painted by its own room, a floor material and tint and a ceiling colour, all surviving a reload and undo; a new room takes its kind\'s floor.');
} finally {
  await browser.close();
  await server.close();
}
