// Batch E in a real browser: the hall planner and the power and rentals sheet.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5203 } });
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
  await page.goto('http://127.0.0.1:5203');
  await page.waitForFunction(() => !!window.__booth?.scene);
  const hall = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__booth.project.hall ?? null)));

  // ---- Hall planner -------------------------------------------------------
  await page.click('[data-tab="hall"]');
  await page.click('[data-action="hall-start"]');
  assert.equal((await hall()).rows, 2, 'a plan starts');
  assert.equal(await page.locator('[data-hall-booth]').count(), 16, 'sixteen booths on the map');

  await page.locator('[data-hall-booth="103"]').click();
  assert.equal(await page.evaluate(() => window.__booth.hallSelected), 103, 'tapping a booth selects it');
  await page.selectOption('select[data-scope="hallbooth"][data-field="status"]', 'sold');
  await page.fill('input[data-scope="hallbooth"][data-field="name"]', 'Ada Pottery');
  await page.press('input[data-scope="hallbooth"][data-field="name"]', 'Enter');
  await page.waitForTimeout(150);
  let h = await hall();
  assert.deepEqual([h.booths[103].status, h.booths[103].name], ['sold', 'Ada Pottery'], 'status and exhibitor are kept');
  assert.match(await page.textContent('.hall-totals'), /1 sold/);
  assert.match(await page.locator('[data-hall-booth="103"]').innerHTML(), /Ada Pottery/, 'the map shows the exhibitor');
  await page.click('[data-action="hall-mine"]');
  assert.equal((await hall()).mine, 103, 'and which booth is yours');

  // The layout: more rows, and the 1,200-booth ceiling holds.
  await page.fill('input[data-scope="hallplan"][data-field="rows"]', '4');
  await page.press('input[data-scope="hallplan"][data-field="rows"]', 'Enter');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-hall-booth]').count(), 32, 'four rows of eight');
  await page.fill('input[data-scope="hallplan"][data-field="perRow"]', '60');
  await page.press('input[data-scope="hallplan"][data-field="perRow"]', 'Enter');
  await page.fill('input[data-scope="hallplan"][data-field="rows"]', '40');
  await page.press('input[data-scope="hallplan"][data-field="rows"]', 'Enter');
  await page.waitForTimeout(200);
  h = await hall();
  assert.ok(h.rows * h.perRow <= 1200, `never past 1,200 booths (${h.rows} × ${h.perRow})`);
  await page.fill('input[data-scope="hallplan"][data-field="rows"]', '2');
  await page.press('input[data-scope="hallplan"][data-field="rows"]', 'Enter');
  await page.fill('input[data-scope="hallplan"][data-field="perRow"]', '8');
  await page.press('input[data-scope="hallplan"][data-field="perRow"]', 'Enter');
  await page.waitForTimeout(150);

  const [map] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="hall-map"]')]);
  const mapHTML = await fs.readFile(await map.path(), 'utf8');
  assert.match(mapHTML, /Hall map/);
  assert.match(mapHTML, /Ada Pottery/);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="hall-csv"]')]);
  const csvText = await fs.readFile(await csv.path(), 'utf8');
  assert.match(csvText, /^Booth,Row/);
  assert.match(csvText, /103,1,10 x 10,Sold,Ada Pottery/);

  // Saved with the project.
  await page.evaluate(() => window.__booth.save());
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  assert.equal((await hall()).booths[103].name, 'Ada Pottery', 'the plan survives a reload');

  // ---- Power and rentals ------------------------------------------------
  await page.click('[data-tab="export"]');
  assert.match(await page.textContent('#inspector-content'), /\d+ W · [\d.]+ A · \d+ circuit/, 'the Export tab says what to order');
  await page.fill('#power-outlets', '3');
  await page.press('#power-outlets', 'Enter');
  await page.waitForTimeout(100);
  const [sheet] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="power-sheet"]')]);
  const sheetHTML = await fs.readFile(await sheet.path(), 'utf8');
  assert.match(sheetHTML, /Power and rentals/);
  assert.match(sheetHTML, /Outlets[^<]*<\/td><td class="num">3</, 'with the outlets typed');
  assert.match(sheetHTML, /Carpet/);

  // ---- Lite ---------------------------------------------------------------
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'lite');
  await page.click('[data-tab="hall"]');
  assert.equal(await page.locator('[data-pro-lock="hall"]').count(), 1, 'the hall planner is Pro');
  await page.click('[data-tab="export"]');
  assert.equal(await page.locator('[data-pro-lock="power"]').count(), 1, 'the power sheet is Pro');
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'pro');

  // Delete asks first, and undo brings it back.
  await page.click('[data-tab="hall"]');
  await page.click('[data-action="hall-delete"]');
  await page.click('#confirm-go');
  assert.equal(await hall(), null, 'deleted');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+z');
  assert.equal((await hall())?.booths?.[103]?.name, 'Ada Pottery', 'and undo brings it back');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS the hall planner starts a plan, sells a booth to a named exhibitor, marks your own, grows within 1,200 booths, prints a map and a CSV and survives a reload; the power sheet counts what to order; both are Pro; deleting a plan is undoable.');
} finally {
  await browser.close();
  await server.close();
}
