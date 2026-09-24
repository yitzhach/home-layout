// The show pack in a real browser: a price typed in the Artwork tool reaches
// the downloaded pack, with the floor plan and the checklist for this booth.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5215 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5215');
  await page.waitForFunction(() => !!window.__booth?.scene);

  // A table and a chair on the floor.
  await page.click('[data-tab="walls"]');
  await page.selectOption('#furniture-kind', 'table6');
  await page.click('[data-action="add-pedestal"]');
  await page.waitForTimeout(150);

  // A price and a medium on the first work.
  const first = await page.evaluate(() => window.__booth.project.art.find((a) => (a.kind || 'art') === 'art'));
  await page.evaluate((id) => window.__booth.scene.onSelect(id), first.id);
  await page.click('[data-tab="art"]');
  const price = page.locator('input[data-scope="art"][data-field="price"]');
  await price.fill('$1,250');
  await price.press('Tab');
  const medium = page.locator('input[data-scope="art"][data-field="medium"]');
  await medium.fill('Oil on linen');
  await medium.press('Tab');
  await page.waitForTimeout(200);
  const saved = await page.evaluate((id) => window.__booth.project.art.find((a) => a.id === id), first.id);
  assert.equal(saved.price, '$1,250');
  assert.equal(saved.medium, 'Oil on linen');

  await page.click('[data-tab="export"]');
  const download = page.waitForEvent('download');
  await page.click('[data-action="show-pack"]');
  const file = await download;
  assert.match(file.suggestedFilename(), /-show-pack\.html$/);
  const html = await readFile(await file.path(), 'utf8');
  assert.match(html, /<svg[^>]*aria-label="Floor plan"/, 'the floor plan');
  assert.match(html, /Table 6′ with cloth/, 'the furniture');
  assert.match(html, /\$1,250/, 'the price as typed');
  assert.match(html, /Oil on linen/);
  assert.match(html, /Listed total 1,250/, 'and totalled');
  assert.match(html, /Floor-length tablecloths/, 'the checklist knows about the table');
  assert.match(html, /Hanging hooks or hangers/);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS show pack: a typed price and medium reach the downloaded pack with its floor plan and checklist.');
} finally {
  await browser.close();
  await server.close();
}
