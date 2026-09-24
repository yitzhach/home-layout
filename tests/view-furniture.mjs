// Furniture in a real browser: every kind can be added from the Walls tool,
// is drawn inside the booth at the size typed for it, picks and drags like a
// pedestal, and survives a reload as the thing it was.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5212 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
const IN = 0.0254;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5212');
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.click('[data-tab="walls"]');
  const kinds = await page.evaluate(() => [...document.querySelectorAll('#furniture-kind option')].map((o) => o.value));
  assert.ok(kinds.length >= 10, `the picker offers every kind: ${kinds}`);

  for (const kind of kinds) {
    await page.selectOption('#furniture-kind', kind);
    await page.click('[data-action="add-pedestal"]');
    await page.waitForTimeout(150);
  }
  const list = await page.evaluate(() => window.__booth.project.booth.pedestals);
  assert.equal(list.length, kinds.length, 'one of each');
  const booth = await page.evaluate(() => window.__booth.project.booth);
  for (const [i, kind] of kinds.entries()) {
    const ped = list[i];
    assert.equal(ped.kind ?? 'pedestal', kind, `${kind} is stored as its kind`);
    assert.ok(Math.abs(ped.x) <= booth.width / 2 && Math.abs(ped.z) <= booth.depth / 2, `${kind} lands inside the booth`);
  }
  assert.equal(list[0].kind, undefined, 'a plain pedestal is stored exactly as before, with no kind');

  // Drawn at the size typed: the group's bounds match width, depth and height.
  const bounds = await page.evaluate(() => {
    const s = window.__booth.scene, T = s.camera.position.constructor;
    s.group.updateMatrixWorld(true);
    return window.__booth.project.booth.pedestals.map((ped) => {
      const g = s.group.getObjectByName('pedestal:' + ped.id);
      g.rotation.y = 0;
      g.updateMatrixWorld(true);
      let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], meshes = 0, pickable = 0;
      g.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        if (s.pedestalObjects.includes(o) && o.userData.pedestal === ped.id) pickable++;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (const corner of [[b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.min.y, b.min.z]]) {
          const v = new T(...corner).applyMatrix4(o.matrixWorld);
          for (const k of [0, 1, 2]) { min[k] = Math.min(min[k], v.getComponent(k)); max[k] = Math.max(max[k], v.getComponent(k)); }
        }
      });
      return { kind: ped.kind || 'pedestal', ped, size: [max[0] - min[0], max[1], max[2] - min[2]], meshes, pickable };
    });
  });
  for (const b of bounds) {
    assert.ok(b.meshes >= 1 && b.pickable === b.meshes, `${b.kind}: every part picks the piece (${b.pickable}/${b.meshes})`);
    assert.ok(Math.abs(b.size[0] - b.ped.width * IN) < 0.04, `${b.kind} is ${b.ped.width}″ wide, drawn ${(b.size[0] / IN).toFixed(1)}″`);
    assert.ok(Math.abs(b.size[1] - b.ped.height * IN) < 0.04, `${b.kind} is ${b.ped.height}″ tall, drawn ${(b.size[1] / IN).toFixed(1)}″`);
    assert.ok(b.size[2] <= b.ped.depth * IN + 0.04, `${b.kind} stays inside its ${b.ped.depth}″ depth, drawn ${(b.size[2] / IN).toFixed(1)}″`);
  }

  // Typing a size rebuilds the piece at it.
  const table = list.find((x) => x.kind === 'table8');
  await page.evaluate((id) => { window.__booth.scene.onSelectPedestal(id); }, table.id);
  await page.waitForTimeout(200);
  const width = page.locator(`input[data-scope="pedestal-${table.id}"][data-field="width"]`).first();
  await width.fill('60');
  await width.press('Tab');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate((id) => window.__booth.project.booth.pedestals.find((x) => x.id === id).width, table.id), 60);

  // It survives a reload as the thing it was.
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => !!window.__booth?.scene);
  const reloaded = await page.evaluate(() => window.__booth.project.booth.pedestals.map((x) => x.kind ?? 'pedestal'));
  assert.deepEqual(reloaded, kinds, 'every kind reloads as itself');

  // ---- Hide rather than delete ------------------------------------------
  // Asked for as "a hide button for the furniture, and any item that is
  // added — a new wall, etc. — so you don't need to delete it". Hidden is out
  // of the picture and back in one click, with its size and place kept.
  await page.click('[data-tab="walls"]');
  await page.waitForTimeout(200);
  const drawnPiece = (id) => page.evaluate((key) => {
    const s = window.__booth.scene;
    return { group: !!s.group.getObjectByName('pedestal:' + key), picks: s.pedestalObjects.filter((o) => o.userData.pedestal === key).length };
  }, id);
  const hidden = list.find((x) => x.kind === 'table8');
  const before = await page.evaluate((id) => window.__booth.project.booth.pedestals.find((x) => x.id === id), hidden.id);
  await page.click(`[data-hide="pedestal"][data-hide-id="${hidden.id}"]`);
  await page.waitForTimeout(400);
  assert.deepEqual(await drawnPiece(hidden.id), { group: false, picks: 0 }, 'a hidden piece is out of the picture and cannot be picked');
  const kept = await page.evaluate((id) => window.__booth.project.booth.pedestals.find((x) => x.id === id), hidden.id);
  assert.equal(kept.hidden, true, 'and is kept in the booth, marked hidden');
  assert.deepEqual({ ...kept, hidden: undefined }, { ...before, hidden: undefined }, 'with its size and place unchanged');
  assert.equal(await page.locator(`.wall-setting.is-hidden[data-pedestal="${hidden.id}"]`).count(), 1, 'its controls say so');
  await page.click(`[data-hide="pedestal"][data-hide-id="${hidden.id}"]`);
  await page.waitForTimeout(400);
  assert.equal((await drawnPiece(hidden.id)).group, true, 'the eye brings it back');
  assert.equal(await page.evaluate((id) => 'hidden' in window.__booth.project.booth.pedestals.find((x) => x.id === id), hidden.id), false,
    'and shown leaves no flag behind, the way every older backup reads');

  // A free-standing wall: hiding it takes the art hung on it along with it.
  await page.click('[data-action="add-panel"]');
  await page.waitForTimeout(400);
  const panelId = await page.evaluate(() => window.__booth.project.booth.panels[0].id);
  const artId = await page.evaluate((id) => {
    const b = window.__booth;
    const a = b.project.art[0];
    b.mutate(() => Object.assign(a, { wall: 'panel:' + id, face: 'inside', x: 2, y: 20 }));
    return a.id;
  }, panelId);
  await page.waitForTimeout(400);
  const drawnPanel = () => page.evaluate(([key, art]) => {
    const s = window.__booth.scene;
    return { wall: s.wallObjects.some((o) => o.userData.wall === 'panel:' + key), art: s.artObjects.some((o) => o.userData.artId === art) };
  }, [panelId, artId]);
  assert.deepEqual(await drawnPanel(), { wall: true, art: true });
  await page.click(`[data-hide="panel"][data-hide-id="${panelId}"]`);
  await page.waitForTimeout(400);
  assert.deepEqual(await drawnPanel(), { wall: false, art: false }, 'a hidden wall takes its art out of the picture with it');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  assert.deepEqual(await drawnPanel(), { wall: true, art: true }, 'and undo brings both back');

  // A figure, from Layout.
  await page.click('[data-tab="layout"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="add-woman"]');
  await page.waitForTimeout(400);
  const personId = await page.evaluate(() => window.__booth.project.booth.people.at(-1).id);
  await page.click(`[data-hide="person"][data-hide-id="${personId}"]`);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate((id) => !!window.__booth.scene.personFrames[id], personId), false, 'a hidden figure is not drawn');
  await page.click(`[data-hide="person"][data-hide-id="${personId}"]`);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate((id) => !!window.__booth.scene.personFrames[id], personId), true, 'and comes back');

  assert.deepEqual(errors, [], 'no page errors');
  console.log(`PASS furniture: ${kinds.length} kinds added, drawn at their sizes, pickable, resized by typing, reloaded, and hidden without being deleted.`);
} finally {
  await browser.close();
  await server.close();
}
