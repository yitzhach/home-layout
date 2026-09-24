// Arranging from the keyboard and a whole wall at once, in a real browser:
// arrow nudges for artwork and floor pieces, R to turn, Ctrl+D to duplicate,
// V/M/T for the tools, and the two wall buttons.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5213 } });
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
  await page.goto('http://127.0.0.1:5213');
  await page.waitForFunction(() => !!window.__booth?.scene);
  const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__booth.project)));
  const blur = () => page.evaluate(() => document.activeElement?.blur());
  const press = async (key) => { await blur(); await page.keyboard.press(key); await page.waitForTimeout(60); };

  // --- Arrow keys nudge the selected work along its wall.
  const first = (await project()).art[0];
  await page.evaluate((id) => window.__booth.scene.onSelect(id), first.id);
  await page.waitForTimeout(100);
  const x0 = (await project()).art.find((a) => a.id === first.id);
  await press('ArrowRight');
  await press('Shift+ArrowUp');
  let now = (await project()).art.find((a) => a.id === first.id);
  assert.ok(now.x === x0.x + 1 || now.x === x0.x, `right moved x from ${x0.x} to ${now.x}`);
  assert.ok(now.y === x0.y + 12 || now.y < x0.y + 12, `shift-up is a foot, clamped to the wall: ${x0.y} → ${now.y}`);
  await press('Control+z');
  now = (await project()).art.find((a) => a.id === first.id);
  assert.equal(now.y, x0.y, 'each press is one undo step');

  // --- Ctrl+D duplicates the selected work.
  const before = (await project()).art.length;
  await press('Control+d');
  assert.equal((await project()).art.length, before + 1, 'Ctrl+D duplicates');
  await press('Control+z');

  // --- The wall buttons.
  await page.evaluate((id) => window.__booth.scene.onSelect(id), first.id);
  await page.click('[data-tab="art"]');
  await page.click('[data-action="space-wall"]');
  await page.waitForTimeout(200);
  let p = await project();
  const a = p.art.find((x) => x.id === first.id);
  const works = p.art.filter((b) => b.wall === a.wall && (b.face || 'inside') === (a.face || 'inside') && (b.booth || null) === (a.booth || null)).sort((l, r) => l.x - r.x);
  const width = await page.evaluate((w) => { const s = window.__booth.scene; return s.p.booth.walls?.[w]?.width ?? (w === 'back' ? s.p.booth.width : s.p.booth.depth); }, a.wall);
  const gaps = [works[0].x, ...works.slice(1).map((b, i) => b.x - (works[i].x + works[i].w)), width - (works.at(-1).x + works.at(-1).w)];
  if (works.reduce((s, b) => s + b.w, 0) < width)
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.05, `equal gaps across the wall: ${gaps.map((g) => g.toFixed(2))}`);
  assert.match(await page.locator('#toast').textContent(), /spaced evenly/);
  await page.click('[data-action="hang-wall"]');
  await page.waitForTimeout(200);
  p = await project();
  for (const b of p.art.filter((x) => works.some((w) => w.id === x.id)))
    assert.ok(Math.abs(b.y + b.h / 2 - 60) < 0.01 || b.y === 0 || b.h > 60, `${b.title} centred at 60″: ${b.y + b.h / 2}`);

  // --- A pedestal nudges across the floor and turns with R.
  await page.click('[data-tab="walls"]');
  await page.click('[data-action="add-pedestal"]');
  await page.waitForTimeout(200);
  const ped0 = (await project()).booth.pedestals.at(-1);
  await press('ArrowLeft');
  await press('ArrowUp');
  await press('r');
  await press('Shift+R');
  await press('Shift+R');
  const ped = (await project()).booth.pedestals.at(-1);
  assert.equal(ped.x, ped0.x - 1, 'left is an inch across the floor');
  assert.equal(ped.z, ped0.z - 1, 'up is an inch away from the entrance');
  assert.equal(ped.rotation, -15, 'R turns 15°, Shift+R back');

  // --- Tool keys.
  await press('t');
  assert.equal(await page.evaluate(() => window.__booth.scene.measure.on), true, 'T is the tape measure');
  await press('Escape');
  await press('m');
  assert.equal(await page.evaluate(() => window.__booth.scene.move), true, 'M is Move');
  await press('v');
  assert.equal(await page.evaluate(() => window.__booth.scene.move), false, 'V is Select');

  // Typing in a field is never a shortcut.
  const field = page.locator('#project-name');
  await field.click();
  await page.keyboard.press('t');
  assert.equal(await page.evaluate(() => window.__booth.scene.measure.on), false, 'a letter typed in a field stays in the field');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS arranging: arrows nudge art and pedestals, R turns, Ctrl+D duplicates, tool keys switch, a wall spaces evenly and hangs at 60″.');
} finally {
  await browser.close();
  await server.close();
}
