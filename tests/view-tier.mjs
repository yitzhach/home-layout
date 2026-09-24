// Lite and Pro in the page, and the phone layout.
//
// In Lite a Pro section is replaced by its lock, and a Pro action that
// somehow still fires — here, through a button put back by hand — says why
// and does nothing. On a 390 px phone the page never scrolls sideways, every
// inspector tab can be reached, and the sheet handle folds the panel away so
// the booth gets the screen.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5198 } });
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
  await page.goto('http://127.0.0.1:5198');
  await page.waitForFunction(() => !!window.__booth?.scene);

  assert.equal(await page.evaluate(() => window.__booth.tier), 'pro', 'a new browser is Pro');
  await page.click('[data-tab="export"]');
  assert.equal(await page.locator('[data-action="show-pack"]').count(), 1, 'Pro shows the show pack');
  assert.equal(await page.locator('[data-pro-lock]').count(), 0, 'and no locks');

  // ---- Lite -------------------------------------------------------------
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'lite');
  assert.equal(await page.evaluate(() => window.__booth.tier), 'lite');
  assert.equal(await page.evaluate(() => localStorage.getItem('booth.tier')), 'lite', 'remembered per browser');
  assert.equal(await page.locator('[data-pro-lock="row"]').count(), 1, 'the booth row is locked in Lite');
  assert.equal(await page.locator('[data-action="row-booth-left"]').count(), 0, 'and its controls are not drawn');
  assert.equal(await page.locator('[data-action="save-template"]').count(), 0, 'templates are Pro');

  await page.click('[data-tab="export"]');
  for (const f of ['video', 'showPack', 'guide'])
    assert.equal(await page.locator(`[data-pro-lock="${f}"]`).count(), 1, `${f} is locked in Lite`);
  assert.equal(await page.locator('[data-action="export-image"]').count(), 1, 'PNG export is everyone\'s');

  // A Pro action that fires anyway is refused at the one gate.
  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.dataset.action = 'show-pack';
    b.id = 'smuggled';
    document.body.append(b);
  });
  await page.click('#smuggled');
  await page.waitForTimeout(300);
  assert.equal(downloads.length, 0, 'no show pack downloads in Lite');
  assert.match(await page.textContent('#toast'), /Pro/, 'and the toast says why');

  await page.evaluate(() => document.querySelector('#smuggled')?.remove());
  // Switch to Pro from the lock itself.
  await page.locator('[data-pro-lock="showPack"] [data-action="tier-pro"]').click();
  assert.equal(await page.evaluate(() => window.__booth.tier), 'pro');
  assert.equal(await page.locator('[data-action="show-pack"]').count(), 1, 'Pro again: the show pack is back');

  // ---- The phone --------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `no sideways scroll on a phone (${overflow}px over)`);
  for (const t of ['art', 'layout', 'show', 'walls', 'lighting', 'video', 'export']) {
    const tabButton = page.locator(`[data-tab="${t}"]`);
    await tabButton.scrollIntoViewIfNeeded();
    await tabButton.click();
    assert.ok(await page.locator(`[data-tab="${t}"].active`).count(), `the ${t} tab can be reached on a phone`);
  }
  const exportTop = page.locator('.toolbar [data-action="export-tab"]');
  await exportTop.scrollIntoViewIfNeeded();
  assert.ok(await exportTop.isVisible(), 'the toolbar scrolls to its last button');

  const sceneHeight = () => page.evaluate(() => document.querySelector('#scene').getBoundingClientRect().height);
  const before = await sceneHeight();
  await page.click('.sheet-toggle');
  await page.waitForTimeout(300);
  const folded = await sceneHeight();
  assert.ok(folded > before + 150, `folding the panel gives the booth the screen (${before} → ${folded})`);
  assert.equal(await page.locator('#inspector-content').isVisible(), false, 'the panel is folded');
  await page.click('[data-tab="layout"]');
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#inspector-content').isVisible(), 'choosing a tab unfolds it');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS Lite locks the Pro sections and refuses Pro actions at one gate, Pro is the default and comes back from the lock; on a phone nothing scrolls sideways, every tab is reachable and the panel folds away.');
} finally {
  await browser.close();
  await server.close();
}
