// What a click costs, what a slider does, and what an art-show booth looks
// like in a photographed environment. All three were reported from a real
// machine: selecting a work was slow to show its handles, dragging was not
// smooth, and an indoor booth put a white band across the hall behind it.
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

// revision counts scene rebuilds: update() disposes the group and increments
// it. It is the measure that matters here — a rebuild is the expensive thing,
// and a click must not cause one.
const revision = (page) => page.evaluate(() => window.__booth.scene.revision);
const handles = (page) => page.evaluate(() => window.__booth.scene.resizeHandles.length);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5198');
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.waitForTimeout(400);

  // ---- Selecting costs no rebuild ---------------------------------------
  const first = await page.evaluate(() => window.__booth.project.art[1].id);
  const before = await revision(page);
  await page.evaluate((id) => window.__booth.scene.onSelect(id), first);
  await page.waitForTimeout(250);
  assert.equal(await revision(page), before, 'selecting a work rebuilds nothing');
  assert.equal(await page.evaluate(() => window.__booth.project.art.find((a) => a.id === window.__booth.scene.selected)?.id), first);
  assert.ok(await page.evaluate(() => !!window.__booth.scene.selectionEdge), 'the selected work is outlined');
  assert.equal(await handles(page), 0, 'a plain selection has no scale handles');

  // Double-clicking arms the transform: the eight handles appear, still with
  // no rebuild. This is the gesture that was reported as slow.
  await page.evaluate((id) => {
    const s = window.__booth.scene;
    s.scaleId = id;
    s.setSelection(id, null, null);
  }, first);
  assert.equal(await revision(page), before, 'arming the handles rebuilds nothing');
  assert.equal(await handles(page), 8, 'eight scale handles');
  assert.ok(await page.evaluate(() => window.__booth.scene.resizeHandles.every((h) => h.parent)),
    'every handle is in the scene, not orphaned');

  // Selecting away disposes the outline and the handles rather than stacking
  // a second set on the next click.
  const second = await page.evaluate(() => window.__booth.project.art[0].id);
  await page.evaluate((id) => window.__booth.scene.onSelect(id), second);
  await page.waitForTimeout(200);
  assert.equal(await handles(page), 0, 'the previous work\'s handles are gone');
  assert.equal(await page.evaluate(() => window.__booth.scene.selectionObjects.length), 1,
    'one outline, not one per click');
  assert.equal(await revision(page), before, 'and still no rebuild');

  // ---- The artwork position sliders -------------------------------------
  await page.click('[data-tab="art"]');
  const slider = page.locator('input[aria-label="Slide left / right slider"]');
  assert.equal(await slider.count(), 1, 'the selected work has a left/right slider');
  const startX = await page.evaluate((id) => window.__booth.project.art.find((a) => a.id === id).x, second);
  // fill() on a range dispatches input and then change, which is one
  // gesture — the same shape as a drag: many inputs, one change at the end.
  await slider.fill(String(Math.round(startX + 12)));
  await page.waitForTimeout(150);
  const moved = await page.evaluate((id) => window.__booth.project.art.find((a) => a.id === id), second);
  assert.ok(Math.abs(moved.x - (startX + 12)) < 0.6, `the slider moves the work: ${startX} -> ${moved.x}`);
  // The number field beside it is the same edit, so it has to follow.
  assert.ok(Math.abs(Number(await page.locator('input[data-scope="art"][data-field="x"]').inputValue()) - moved.x) < 0.01,
    'the typed field follows the slider');
  // A slider gesture is one undo step, and it does not rebuild the scene.
  assert.equal(await revision(page), before, 'a slider move rebuilds nothing');
  // Undo from the page rather than from inside the input, the way a hand on
  // a mouse would: the keydown handler ignores keys typed into a field.
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  assert.ok(Math.abs(await page.evaluate((id) => window.__booth.project.art.find((a) => a.id === id).x, second) - startX) < 0.01,
    'one undo returns the work to where the gesture started');

  // The vertical slider is bounded by the wall, not by the schema's 360.
  const up = page.locator('input[aria-label="Slide up / down slider"]');
  assert.equal(await up.count(), 1);
  assert.ok(Number(await up.getAttribute('max')) <= 144, 'the travel is the wall, not 360 inches');

  // ---- An art-show booth in a photographed environment ------------------
  await page.click('[data-tab="show"]');
  await page.getByLabel('Venue').selectOption('artshow');
  await page.waitForTimeout(700);
  assert.ok(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('exhibition-hall')),
    'an art-show booth opens in its own hall');

  await page.click('[data-tab="layout"]');

  // Trade show is a white exhibition hall and shows no photograph, so an
  // art-show booth in it keeps its own hall: these are the same room. It used
  // to carry the burnt-warehouse HDRI, which put brick and girders behind
  // seamless white walls and then switched the hall off on top of that.
  await page.selectOption('select[aria-label="Environment"]', 'tradeshow');
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.hall.on), true,
    'trade show is a hall, not a photograph, so the hall stays');
  assert.ok(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('exhibition-hall')),
    'and its white walls are still standing');
  assert.equal(await page.evaluate(() => window.__booth.project.booth.ground), 'studio',
    'on the texture-free neutral floor, not a concrete photograph');

  // The warehouse is where the photograph went, and there the hall does come
  // off: its back wall would cut across the picture as a white band.
  await page.selectOption('select[aria-label="Environment"]', 'warehouse');
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.hall.on), false,
    'choosing a photographed environment switches the hall off');
  assert.equal(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('exhibition-hall')), false,
    'and its white walls are out of the frame');
  // The booth itself is untouched: this is the room, not the booth.
  assert.equal(await page.evaluate(() => window.__booth.project.booth.venue), 'artshow');
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.on), true,
    'the light bar is still overhead');
  assert.ok(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('light-bar')));

  // And it comes back from the Layout panel, where the environment was chosen.
  const hallToggle = page.locator('input[data-scope="hall"][data-field="on"]').first();
  assert.equal(await hallToggle.count(), 1, 'the hall is switchable where the environment is');
  await hallToggle.check();
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(() => !!window.__booth.scene.group.getObjectByName('exhibition-hall')),
    'the hall comes back on request');

  // ---- The light bar is adjustable from Lighting ------------------------
  await page.click('[data-tab="lighting"]');
  const diffusion = page.locator('input[data-scope="lightBar"][data-field="diffusion"]');
  const power = page.locator('input[data-scope="lightBar"][data-field="power"]');
  assert.equal(await diffusion.count(), 1, 'diffusion is in the Lighting tool too');
  assert.equal(await power.count(), 1, 'and so is the bar\'s brightness');

  // The two ranges, both reported from a real monitor: 70 was called "beyond
  // bright", 60 was still much too hot, and the old maximum diffusion of 1 was
  // still harsh. Brightness is now a percentage of a bar judged to read right,
  // so the slider is 0..100 and the middle of it is the default.
  assert.equal(await power.getAttribute('max'), '100', 'brightness is a percentage, not a stored unit');
  assert.equal(await power.getAttribute('step'), '1', 'and moves in steps small enough to judge');
  assert.equal(await power.inputValue(), '50', 'and a fresh booth opens in the middle of it');
  assert.equal(await diffusion.getAttribute('max'), '3', 'diffusion reaches past the old ceiling of 1');

  // The stored unit underneath is the light's own power and never the slider
  // point: 50 on the slider is 8 stored units, which is what the renderer
  // reads. Get this backwards and a booth opens 6x too bright.
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.power), 8);
  await power.fill('64');
  await power.dispatchEvent('change');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.power), 64 * 0.16);
  await power.fill('50');
  await power.dispatchEvent('change');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.power), 8);

  // Past the old ceiling, and it sticks: this is the value that could not be
  // reached at all before.
  await diffusion.fill('2.5');
  await diffusion.dispatchEvent('change');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.diffusion), 2.5);
  await diffusion.fill('0');
  await diffusion.dispatchEvent('change');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.diffusion), 0);

  // A booth saved brighter than the slider offers widens its own slider rather
  // than being quietly dragged down the moment the panel is drawn. This is the
  // schema-1 case: 0..300 is still a project and must still be editable.
  await page.evaluate(() => { window.__booth.project.booth.lightBar.power = 150; });
  // Leaving the tab and coming back is what redraws the inspector, which is
  // the moment a slider would clamp a value it thinks is out of range.
  await page.click('[data-tab="art"]');
  await page.click('[data-tab="lighting"]');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('input[data-scope="lightBar"][data-field="power"]').getAttribute('max'), String(Math.ceil(150 / 0.16)),
    'an older, brighter bar keeps its value and widens its slider');
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.power), 150,
    'and is not clamped by being looked at');
  // And it says so, with the one drag back rather than a number to work out.
  assert.equal(await page.locator('[data-action="bar-default"]').count(), 1,
    'a bar stored above the scale offers the way back to the default');
  await page.click('[data-action="bar-default"]');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__booth.project.booth.lightBar.power), 8,
    'which sets the stored unit, not the slider point');
  assert.equal(await page.locator('input[data-scope="lightBar"][data-field="power"]').getAttribute('max'), '100',
    'and the slider goes back to the scale it belongs on');

  // ---- Drawing on demand, and auto preview quality ----------------------
  // An untouched booth draws nothing: the same picture sixty times a second
  // is what kept a slow machine's GPU pinned while nobody was using it.
  const idle = await page.evaluate(async () => {
    const view = window.__booth.scene;
    const frames = () => new Promise((r) => { let n = 10; const tick = () => (--n ? requestAnimationFrame(tick) : r()); requestAnimationFrame(tick); });
    // Whatever the last click scheduled lands first. main.js resizes the
    // viewport a frame after every render(), and swiftshader can take over a
    // second to hand out that frame — so resetting the clock before it had
    // landed let its invalidate start the heartbeat inside the window being
    // measured, and this failed two runs in three on an unchanged main.
    await frames();
    view.framesOwed = 0;
    view.touchedAt = -Infinity;
    await frames();
    const first = view.renderer.info.render.frame;
    await frames();
    const still = view.renderer.info.render.frame;
    document.querySelector('#inspector-content').dispatchEvent(new Event('input', { bubbles: true }));
    await frames();
    return { idle: still - first, touched: view.renderer.info.render.frame - still };
  });
  assert.equal(idle.idle, 0, 'an idle booth draws no frames');
  assert.ok(idle.touched > 0, 'and any input on the page draws one');

  // A rebuild reuses the booth's shader programs. Disposing the old materials
  // before the new ones drew threw them all away and recompiled every one on
  // the next frame: most of what an edit cost.
  const programs = await page.evaluate(async () => {
    const b = window.__booth, view = b.scene;
    const settle = async () => { await new Promise((r) => setTimeout(r, 1300)); view.renderFrame(); };
    await settle();
    const ids = () => view.renderer.info.programs.map((p) => p.id + ':' + p.name).sort().join();
    const before = ids();
    view.update(b.project, view.selected, view.selectedPanel, view.selectedPedestal);
    view.renderFrame();
    view.update(b.project, view.selected, view.selectedPanel, view.selectedPedestal);
    view.update(b.project, view.selected, view.selectedPanel, view.selectedPedestal);
    await settle();
    return { before, after: ids(), retired: view.retired };
  });
  assert.ok(programs.before.length > 0);
  assert.equal(programs.after, programs.before, 'a rebuild compiles no new shaders and deletes none');
  assert.equal(programs.retired.length, 0, 'and the old booth is released once the new one has drawn');

  // Icons are written as finished SVG, not placeholders converted after
  // every redraw.
  const iconState = await page.evaluate(() => ({
    svgs: document.querySelectorAll('svg.lucide path, svg.lucide circle, svg.lucide rect, svg.lucide line').length,
    placeholders: document.querySelectorAll('i[data-lucide]').length,
  }));
  assert.ok(iconState.svgs > 20, 'the icons are drawn');
  assert.equal(iconState.placeholders, 0, 'and none is left as a placeholder');

  assert.equal(await page.evaluate(() => window.__booth.scene.quality), 'auto', 'preview quality defaults to Auto');
  const adapted = await page.evaluate(() => {
    const view = window.__booth.scene;
    const before = view.renderer.getPixelRatio();
    for (let i = 0; i < 30; i++) view.adapt(60);
    return { before, after: view.renderer.getPixelRatio(), saved: JSON.parse(localStorage.getItem('booth.view')).autoScale };
  });
  assert.equal(adapted.before, 2, 'Auto starts at Balanced');
  assert.equal(adapted.after, 1.5, 'and one slow window is one rung down');
  assert.deepEqual(adapted.saved, { dpr: 1, scale: 1.5 }, 'remembered for this display');
  assert.match(await page.locator('#toast').textContent(), /Preview detail lowered/, 'and said once');
  await page.reload();
  await page.waitForFunction(() => window.__booth?.scene);
  assert.equal(await page.evaluate(() => window.__booth.scene.renderer.getPixelRatio()), 1.5, 'the next visit starts where this one settled');
  // Asked on the real machine: "what preview quality are we looking at? I
  // don't see where the level is visible." The menu under the viewport says.
  assert.match(await page.locator('#quality-quick option:checked').textContent(), /Auto · now 1\.5×/,
    'the menu under the viewport names the rung Auto settled on');
  assert.equal(await page.locator('#quality-now').textContent(), 'softer', 'and the factor it is drawing at');
  await page.selectOption('#quality-quick', '3');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__booth.scene.renderer.getPixelRatio()), 3, 'picking High detail there draws at 3×');
  assert.equal(await page.locator('#quality-now').textContent(), 'sharpest');
  await page.click('[data-tab="export"]');
  await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#quality'), '3', 'and the Export menu agrees');
  await page.click('[data-action="draft"]');
  await page.waitForTimeout(200);
  assert.match(await page.locator('#quality-now').textContent(), /fast edit/, 'fast edit says it is fast edit');
  await page.click('[data-action="draft"]');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#quality-now').textContent(), 'sharpest', 'and stops saying so');
  await page.selectOption('#quality-quick', 'auto');
  await page.waitForTimeout(200);
  await page.evaluate(() => { localStorage.removeItem('booth.view'); });
  await page.reload();
  await page.waitForFunction(() => window.__booth?.scene);

  // ---- Fast edit: the quality escape hatch ------------------------------
  // The honest answer to "a drag still stutters": nine shadow-casting heads
  // and a supersampled buffer, both dropped for the length of an edit.
  const shadowsOn = () => page.evaluate(() => window.__booth.scene.renderer.shadowMap.enabled);
  const ratio = () => page.evaluate(() => window.__booth.scene.renderer.getPixelRatio());

  assert.equal(await shadowsOn(), true, 'a fresh session opens at full quality');
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false);
  const fullRatio = await ratio();

  await page.click('[data-action="draft"]');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true);
  assert.equal(await shadowsOn(), false, 'fast edit drops the nine shadow passes');
  assert.equal(await ratio(), 1, 'and renders one fragment per pixel');
  assert.ok(await page.evaluate(() => document.querySelector('[data-action="draft"]').classList.contains('active')),
    'and the button says so');

  // The booth itself is untouched. This is a view setting: it is not in the
  // project, so it cannot reach a backup, the undo history or schema 1.
  assert.equal(await page.evaluate(() => 'draft' in window.__booth.project), false,
    'fast edit is not project data');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__booth.project).includes('"draft"')), false);

  // An export is a delivered file and never a draft one, whatever the viewport
  // is set to. The shadows have to be back before the frame is read.
  const duringExport = await page.evaluate(async () => {
    const scene = window.__booth.scene;
    let seen = null;
    const real = scene.renderFrame.bind(scene);
    scene.renderFrame = () => { seen ??= scene.renderer.shadowMap.enabled; return real(); };
    try { await scene.export(1024); } finally { scene.renderFrame = real; }
    return seen;
  });
  assert.equal(duringExport, true, 'an export renders with its shadows even from fast edit');
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true,
    'and hands fast edit back afterwards');

  await page.click('[data-action="draft"]');
  await page.waitForTimeout(400);
  assert.equal(await shadowsOn(), true, 'full quality comes back');
  assert.equal(await ratio(), fullRatio, 'at the supersampling it had before');
  assert.ok(!(await page.evaluate(() => document.querySelector('[data-action="draft"]').classList.contains('active'))),
    'and the button stops claiming otherwise');

  // ---- Fast edit costs nothing to reach ---------------------------------
  // A toggle is a view setting, so it must not rebuild the scene. It used to
  // go through render(), which rebuilds every wall, texture and light and
  // redraws the library and the whole inspector — the control whose job is to
  // make the app faster cost a pause of its own on the way in.
  const beforeToggle = await revision(page);
  await page.click('[data-action="draft"]');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true);
  assert.equal(await revision(page), beforeToggle, 'turning fast edit on rebuilds nothing');
  await page.click('[data-action="draft"]');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false);
  assert.equal(await revision(page), beforeToggle, 'and neither does turning it off');

  // Layout carries the same switch, where someone arranging a booth is
  // already looking. The two controls drive one flag and stay in step.
  await page.click('[data-tab="layout"]');
  await page.waitForTimeout(200);
  await page.check('[data-draft]');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true,
    'the Layout switch turns fast edit on');
  assert.ok(await page.evaluate(() => document.querySelector('[data-action="draft"]').classList.contains('active')),
    'and the toolbar button follows it');
  await page.click('[data-action="draft"]');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('[data-draft]').checked), false,
    'and the toolbar button turns the Layout switch back off');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__booth.project).includes('"draft"')), false,
    'neither control puts anything in the project');

  // ---- Double-tapping artwork arms fast edit with the handles ------------
  // Double-tapping is how the move-and-scale handles come up, and handles are
  // the start of a drag. The gesture that says "I am arranging this" is the
  // one that should drop the shadows for it.
  const artPoint = async (id) => page.evaluate((artId) => {
    const scene = window.__booth.scene;
    scene.group.updateMatrixWorld(true);
    const mesh = scene.artObjects.find((o) => o.userData.artId === artId);
    const v = mesh.getWorldPosition(mesh.position.clone()).project(scene.camera);
    const r = scene.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  }, id);
  const [ax, ay] = await artPoint(first);
  await page.mouse.dblclick(ax, ay);
  await page.waitForTimeout(400);
  assert.ok((await handles(page)) > 0, 'double-tapping artwork arms its scale handles');
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), true,
    'and comes into fast edit with them');
  assert.ok(await page.evaluate(() => document.querySelector('[data-action="draft"]').classList.contains('active')),
    'and the toolbar button says so');
  await page.evaluate(() => window.__booth.scene.setDraft(false));

  // Leaving draft has two obligations, and both are consumed by the very next
  // frame — so they are read inside one synchronous evaluate, before the loop
  // can run. Timing either of these against wall clock is how you write a test
  // that passes on a slow machine and fails on a fast one.
  const leaving = await page.evaluate(() => {
    const scene = window.__booth.scene;
    const lit = [];
    scene.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) lit.push(o.material); });
    const before = lit.map((m) => m.version);
    scene.setDraft(true);
    scene.setDraft(false);
    return {
      queued: scene.renderer.shadowMap.needsUpdate,
      recompiled: lit.some((m, i) => m.version > before[i]),
    };
  });
  // Stale shadow maps would come back as the shapes the booth had when fast
  // edit was switched on, which is worse than having none.
  assert.equal(leaving.queued, true, 'the shadow maps are queued to be redrawn, not left stale');
  // Whether a material samples a shadow map is compiled into its program. Miss
  // this and the shadows never come back, however the renderer is configured.
  assert.equal(leaving.recompiled, true, 'and the materials are rebuilt to sample them again');

  // ---- With fast edit off, a dragged work's cast shadow goes with it ------
  // Reported: "the shadow behind an image stays in the original space until
  // you release it". The shadow maps were held still for the whole gesture.
  // They are refreshed on every drawn frame of a drag now, so the count of
  // real shadow passes has to climb while the button is still down.
  await page.evaluate(() => window.__booth.scene.setDraftPolicy('off'));
  const [bx, by] = await artPoint(first);
  await page.mouse.dblclick(bx, by);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__booth.scene.draft), false,
    'locked off, arming a work keeps full quality');
  await page.evaluate(() => {
    const map = window.__booth.scene.renderer.shadowMap;
    const real = map.render.bind(map);
    window.__shadowPasses = 0;
    map.render = (...args) => {
      if (map.enabled && (map.autoUpdate || map.needsUpdate)) window.__shadowPasses++;
      return real(...args);
    };
    window.__restoreShadowMap = () => { map.render = real; };
  });
  const dragFromX = await page.evaluate((id) => window.__booth.project.art.find((a) => a.id === id).x, first);
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__shadowPasses = 0; });
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(bx + i * 8, by);
    await page.waitForTimeout(80);
  }
  const midDrag = await page.evaluate((id) => ({
    passes: window.__shadowPasses,
    x: window.__booth.project.art.find((a) => a.id === id).x,
  }), first);
  await page.mouse.up();
  await page.evaluate(() => window.__restoreShadowMap());
  assert.ok(midDrag.x !== dragFromX, 'the work moved while the button was down');
  assert.ok(midDrag.passes >= 3,
    `the shadow maps were redrawn during the drag, not only on release (${midDrag.passes} passes)`);
  await page.evaluate(() => window.__booth.scene.setDraftPolicy('auto'));

  // In fast edit the shadow maps are switched off, and three only clears a
  // requested refresh when it draws one. The loop read that stuck flag as a
  // frame owed on every tick, so one moved piece in fast edit kept the
  // viewport drawing flat out until fast edit ended.
  const draftIdle = await page.evaluate(async () => {
    const view = window.__booth.scene;
    const frames = () => new Promise((r) => { let n = 10; const tick = () => (--n ? requestAnimationFrame(tick) : r()); requestAnimationFrame(tick); });
    view.setDraft(true);
    view.touchShadows();
    await frames();
    view.framesOwed = 0;
    view.touchedAt = -Infinity;
    const first = view.renderer.info.render.frame;
    await frames();
    const drawn = view.renderer.info.render.frame - first;
    view.setDraft(false);
    return drawn;
  });
  assert.equal(draftIdle, 0, 'a moved piece in fast edit does not keep the viewport drawing');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS selecting rebuilds nothing, artwork sliders, hall off in a photographed environment, light bar ranges, fast edit.');
} finally {
  await browser.close();
  await server.close();
}
