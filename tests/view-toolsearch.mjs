// Tool search in a real browser: typing a tool's name lists where it is,
// Enter opens the tab it lives in with the control focused, a toolbar tool
// found is used, and nothing typed in the box reaches the booth.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5216 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5216');
  await page.waitForFunction(() => !!window.__booth?.scene);
  const before = await page.evaluate(() => JSON.stringify(window.__booth.project));

  // "/" from the page jumps to the box.
  await page.click('.viewport-bottom .zoom-label');
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tool-search', '/ focuses the box');

  // A query lists matches with where each one lives.
  await page.keyboard.type('ambient');
  const first = page.locator('#tool-results li').first();
  assert.match(await first.textContent(), /Ambient illumination.*Lighting/, 'the list names the tool and its tab');

  // Enter opens that tab with the slider focused.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.inspector-tabs [data-tab="lighting"].active').count(), 'Lighting opened');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'ambient', 'its control focused');
  assert.ok(await page.locator('#tool-results').isHidden(), 'and the list closed');

  // Several matches: arrow down picks the next one.
  await page.click('#tool-search');
  await page.keyboard.type('shadow');
  const count = await page.locator('#tool-results li[data-hit]').count();
  assert.ok(count > 1, `"shadow" gives a list (${count})`);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#tool-results li.active').getAttribute('data-hit'), '1');
  await page.keyboard.press('Escape');
  assert.equal(await page.inputValue('#tool-search'), '', 'Escape clears');
  await page.keyboard.press('Escape');

  // A click on a result works too, and a toolbar tool found is used.
  await page.click('#tool-search');
  await page.keyboard.type('measure');
  await page.locator('#tool-results li', { hasText: 'Toolbar' }).first().click();
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.__booth.scene.measure.on), 'Measure switched on');
  await page.keyboard.press('Escape');

  // Nothing matching says so.
  await page.click('#tool-search');
  await page.keyboard.type('zzqx');
  assert.match(await page.locator('#tool-results').textContent(), /Nothing called/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // A tool in another tab, by a word of its section.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('show pack');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.inspector-tabs [data-tab="export"].active').count(), 'Export opened');

  const after = await page.evaluate(() => JSON.stringify({ ...window.__booth.project }));
  assert.equal(after, before, 'searching changed nothing in the booth');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS tool search: lists matches, opens the tab with the control focused, uses a toolbar tool, and leaves the booth alone.');
} finally {
  await browser.close();
  await server.close();
}
