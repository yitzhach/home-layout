// Batch C in a real browser: the floor plan underlay scaled from the tape,
// clearance checks listed and drawn in Plan view, and elevations to scale.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5201 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5201');
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.click('[data-tab="layout"]');

  // ---- Floor plan underlay ----------------------------------------------
  await page.setInputFiles('#underlay-input', new URL('../public/assets/people/man.png', import.meta.url).pathname);
  await page.waitForFunction(() => !!window.__booth.project.booth.underlay);
  const u0 = await page.evaluate(() => window.__booth.project.booth.underlay);
  assert.equal(u0.on, true);
  assert.equal(await page.evaluate(() => window.__booth.scene.view), 'plan', 'adding a plan switches to Plan view');
  await page.waitForFunction(() => !!window.__booth.scene.group.getObjectByName('underlay'), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__booth.scene.group.getObjectByName('underlay').userData.editorOnly), true,
    'the plan is a planning aid, never in an export');
  assert.equal(await page.evaluate(() => Object.values(window.__booth.project.assets).some((a) => a.role === 'underlay')), true);
  assert.equal(await page.locator('.art-card', { hasText: 'man' }).count(), 0, 'the plan is not offered as artwork');

  // Tape a metre on it and say it is really two: the plan doubles.
  await page.evaluate(() => {
    const s = window.__booth.scene;
    const V = s.camera.position.constructor;
    s.setMeasuring(true);
    s.measure.points = [new V(0, 0, 0), new V(1, 0, 0)];
    s.onMeasure(1 / 0.0254);
  });
  await page.waitForTimeout(100);
  assert.match(await page.textContent('#inspector-content'), /The tape reads/, 'the panel reads the tape');
  await page.fill('#underlay-real', String(2 / 0.0254));
  await page.click('[data-action="underlay-scale"]');
  const u1 = await page.evaluate(() => window.__booth.project.booth.underlay);
  assert.ok(Math.abs(u1.width - u0.width * 2) < 0.05, `the plan is scaled to match (${u0.width} → ${u1.width})`);
  // A booth with a plan in it is saved and reopens with it — the image's
  // role is one the backup validator knows.
  await page.evaluate(() => window.__booth.save());
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  assert.equal(Math.round((await page.evaluate(() => window.__booth.project.booth.underlay))?.width || 0), Math.round(u1.width),
    'the plan survives a reload');
  await page.click('[data-tab="layout"]');

  // ---- Clearance ----------------------------------------------------------
  await page.evaluate(() => window.__booth.mutate(() => {
    const b = window.__booth.project.booth;
    b.pedestals = [
      { id: 'p1', name: 'Plinth A', x: -20, z: 0, width: 24, depth: 24, height: 36, rotation: 0 },
      { id: 'p2', name: 'Plinth B', x: 20, z: 0, width: 24, depth: 24, height: 36, rotation: 0 },
    ];
  }));
  await page.click('[data-tab="layout"]');
  const listed = await page.locator('.clearance-list li').allTextContents();
  assert.ok(listed.some((t) => /16″ between Plinth A and Plinth B/.test(t)), `the tight gap is listed: ${listed.join(' | ')}`);
  const red = await page.evaluate(() => {
    const s = window.__booth.scene;
    s.setView('plan');
    let n = 0;
    s.guides.traverse((o) => { if (o.isLineSegments && o.material.color.getHexString() === 'ff4d4d') n += o.geometry.attributes.position.count / 2; });
    return { n, notes: s.annotations.filter((a) => a.kind === 'clearance').length };
  });
  assert.ok(red.n >= 1 && red.notes >= 1, 'Plan view draws the tight gaps in red, with their width');
  await page.locator('.clearance-list li', { hasText: 'Plinth A and Plinth B' }).locator('button').click();
  assert.ok(['p1', 'p2'].includes(await page.evaluate(() => window.__booth.selectedPedestal)), 'Show selects the piece');

  // ---- Elevations -------------------------------------------------------
  await page.click('[data-tab="export"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="elevations"]')]);
  const html = await fs.readFile(await dl.path(), 'utf8');
  assert.match(dl.suggestedFilename(), /elevations\.html$/);
  assert.match(html, /<svg[^>]*width="[\d.]+in"/, 'drawn in physical inches');
  assert.match(html, /= 1′-0″/, 'with its scale named');
  assert.match(html, /Floor plan/);
  assert.match(html, /stroke-dasharray/, 'the tight gap is on the printed plan');

  // ---- Lite ---------------------------------------------------------------
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'lite');
  for (const f of ['underlay', 'clearance'])
    assert.equal(await page.locator(`[data-pro-lock="${f}"]`).count(), 1, `${f} is Pro`);
  assert.equal(await page.evaluate(() => window.__booth.scene.clearance.length), 0, 'and Lite draws no red lines');
  await page.click('[data-tab="export"]');
  assert.equal(await page.locator('[data-pro-lock="elevations"]').count(), 1, 'elevations are Pro');
  await page.click('[data-tab="layout"]');
  await page.selectOption('select[data-tier]', 'pro');

  // Removing the plan removes its image too.
  await page.click('[data-action="remove-underlay"]');
  assert.equal(await page.evaluate(() => window.__booth.project.booth.underlay), undefined);
  assert.equal(await page.evaluate(() => Object.values(window.__booth.project.assets).some((a) => a.role === 'underlay')), false);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS the floor plan underlay lies under the booth, scales from the tape and leaves with its image; clearance lists and draws a tight gap and Show selects it; elevations download to scale; all three are Pro.');
} finally {
  await browser.close();
  await server.close();
}
