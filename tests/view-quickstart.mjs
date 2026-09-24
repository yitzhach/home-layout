// Quick start in a real browser: the form builds the booth it describes,
// a saved template comes back as the same booth without the work, and a
// template can be forgotten.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5214 } });
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
  await page.goto('http://127.0.0.1:5214');
  await page.waitForFunction(() => !!window.__booth?.scene);
  const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__booth.project)));

  // --- A 10 × 20 indoor art show with a table, a chair and a bin.
  await page.click('[data-tab="layout"]');
  await page.click('[data-action="quick-start"]');
  assert.ok(await page.locator('#dialog[open] #quick-start').count(), 'the form opens');
  await page.fill('#qs-name', 'Spring Convention');
  await page.selectOption('#qs-show', 'artshow');
  await page.selectOption('#qs-size', '10x20');
  await page.check('[data-starter="bin"]');
  const download = page.waitForEvent('download');
  await page.click('[data-action="qs-go"]');
  await download;
  await page.waitForTimeout(400);
  let p = await project();
  assert.equal(p.name, 'Spring Convention');
  assert.equal(p.booth.venue, 'artshow');
  assert.equal(p.booth.width, 240);
  assert.equal(p.booth.depth, 120);
  assert.deepEqual(p.booth.pedestals.map((x) => x.kind ?? 'pedestal').sort(), ['bin', 'chair', 'table6']);
  assert.equal(p.art.length, 0, 'nothing hung');
  assert.equal(await page.locator('#dialog[open]').count(), 0, 'the form closes');
  assert.ok(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('light-bar')), 'the scene is the new booth');

  // --- Save it as a template, change the booth, start again from the template.
  await page.click('[data-tab="layout"]');
  await page.click('[data-action="save-template"]');
  assert.match(await page.locator('#toast').textContent(), /Saved “Spring Convention” as a template/);
  await page.click('[data-action="quick-start"]');
  await page.selectOption('#qs-show', 'artfair');
  await page.selectOption('#qs-size', '10x10');
  await page.uncheck('#qs-backup');
  await page.click('[data-action="qs-go"]');
  await page.waitForTimeout(300);
  p = await project();
  assert.equal(p.booth.venue, 'outdoor');
  assert.equal(p.booth.tent, true, 'an art fair has its canopy');
  assert.equal(p.booth.width, 120);

  await page.click('[data-tab="layout"]');
  await page.click('[data-action="quick-start"]');
  const options = await page.locator('#qs-template option').allTextContents();
  assert.ok(options.some((o) => o.includes('Spring Convention')), `the template is offered: ${options}`);
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('booth.templates'))[0].id);
  await page.selectOption('#qs-template', id);
  assert.equal(await page.evaluate(() => document.querySelector('#qs-fresh').disabled), true, 'a template replaces the questions');
  await page.fill('#qs-name', 'Autumn Convention');
  await page.uncheck('#qs-backup');
  await page.click('[data-action="qs-go"]');
  await page.waitForTimeout(300);
  p = await project();
  assert.equal(p.name, 'Autumn Convention');
  assert.equal(p.booth.venue, 'artshow', 'the template brings its venue back');
  assert.equal(p.booth.width, 240);
  assert.equal(p.booth.pedestals.length, 3, 'and its furniture');

  // --- Forget it.
  await page.click('[data-tab="layout"]');
  await page.click('[data-action="quick-start"]');
  await page.click(`[data-action="qs-forget-${id}"]`);
  assert.equal(await page.locator('#qs-template').count(), 0, 'no templates left to offer');
  await page.click('[data-action="qs-cancel"]');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS quick start: builds the booth described, saves and restores a template without the work, forgets it.');
} finally {
  await browser.close();
  await server.close();
}
