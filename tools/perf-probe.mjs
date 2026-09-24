// Measures what an edit costs on this machine, in a real browser: a full
// scene rebuild, a library redraw and an inspector redraw, for the default
// booth and the art-show booth. Not a test — numbers to compare before and
// after a change. BOOTH_TEST_CHROMIUM=/opt/pw-browsers/chromium node tools/perf-probe.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5231 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
const measure = (page) => page.evaluate(async () => {
  const b = window.__booth, scene = b.scene, n = 10;
  const time = (fn) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t) / n).toFixed(1); };
  const frame = () => { scene.renderer.shadowMap.needsUpdate = true; scene.renderFrame(); scene.renderer.getContext().finish(); };
  return {
    rebuildMs: time(() => { scene.update(b.project, null); frame(); }),
    frameMs: time(frame),
    edit: b.timeEdit ? time(b.timeEdit) : null,
    drawCalls: scene.renderer.info.render.calls,
    meshes: (() => { let m = 0; scene.group.traverse((o) => { if (o.isMesh) m++; }); return m; })(),
  };
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:5231');
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.waitForTimeout(1500);
  console.log('default ', JSON.stringify(await measure(page)));
  await page.click('[data-tab="show"]');
  await page.getByLabel('Venue').selectOption('artshow');
  await page.waitForTimeout(1500);
  console.log('artshow ', JSON.stringify(await measure(page)));
  const panels = await page.evaluate(() => {
    const t = (sel) => { const el = document.querySelector(sel); const s = performance.now(); for (let i = 0; i < 10; i++) el.click(); return +((performance.now() - s) / 10).toFixed(1); };
    return { tabSwitchMs: t('[data-tab="layout"]') };
  });
  console.log('panels  ', JSON.stringify(panels));
} finally {
  await browser.close();
  await server.close();
}
