// Covers the environment presets in a real browser: every preset must render
// and keep the procedural surroundings whether or not its HDRI is committed,
// and leave uploaded artwork colour untouched by image-based lighting.
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
// Presets light from an HDRI only when its file is actually committed; with
// public/assets empty every one of them must still fall back procedurally.
const hasHdri=p=>existsSync(new URL(`../public/assets/hdri/${p}/light.hdr`,import.meta.url));
const server=await createServer({server:{host:'127.0.0.1',port:5190}});
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.BOOTH_TEST_CHROMIUM?{executablePath:process.env.BOOTH_TEST_CHROMIUM}:{}),
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--single-process','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.goto('http://127.0.0.1:5190');
 await page.waitForFunction(()=>!!window.__booth?.scene);

 // The control exists and offers every preset.
 await page.click('[data-tab="layout"]');
 const options=await page.$$eval('select[aria-label="Environment"] option',o=>o.map(x=>x.value));
 assert.deepEqual(options,['studio','tradeshow','warehouse','artfair','home'],'all presets offered');

 // Selecting an asset-backed preset with no assets on disk must not throw and
 // must not strip the procedural backdrop the horizon setting supplies.
 for (const preset of options.slice(1)) {
  await page.selectOption('select[aria-label="Environment"]',preset);
  await page.waitForTimeout(150);
  // The HDRI loads and is filtered asynchronously, so a preset that ships one
  // needs waiting for rather than a fixed pause. A timeout here falls through
  // to the assertion below, which names the preset.
  if (hasHdri(preset)) await page.waitForFunction(
    ()=>!!window.__booth.scene.scene.environment,{timeout:20000}).catch(()=>{});
  const state=await page.evaluate(()=>{
    const s=window.__booth.scene.scene;
    return {env:!!s.environment,background:!!s.background,exposure:window.__booth.scene.renderer.toneMappingExposure};
  });
  assert.equal(state.env,hasHdri(preset),
    `${preset}: environment map present exactly when its HDRI is`);
  assert.equal(state.background,true,`${preset}: keeps a visible backdrop`);
  assert.ok(state.exposure>0,`${preset}: exposure applied`);
 }

 // The preset moves ground and horizon with it.
 await page.selectOption('select[aria-label="Environment"]','artfair');
 await page.waitForTimeout(150);
 assert.deepEqual(await page.evaluate(()=>{
   const b=window.__booth.project.booth; return [b.ground,b.horizon];
 }),['grass','open'],'a preset carries its own surroundings');

 // Artwork fidelity: accurate colour must keep the environment out of the
 // artwork's shading, scene lighting must let it in.
 await page.selectOption('select[aria-label="Artwork colour"]','scene');
 await page.waitForTimeout(150);
 const lit=await page.evaluate(()=>{
   const s=window.__booth.scene; return [...s.artGroups.values()].map(g=>g.plane.material.envMapIntensity);
 });
 await page.selectOption('select[aria-label="Artwork colour"]','accurate');
 await page.waitForTimeout(150);
 const accurate=await page.evaluate(()=>{
   const s=window.__booth.scene; return [...s.artGroups.values()].map(g=>g.plane.material.envMapIntensity);
 });
 assert.ok(lit.every(v=>v===1),'scene lighting exposes artwork to the environment');
 assert.ok(accurate.every(v=>v===0),'accurate colour shields artwork from the environment');

 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS environment presets fall back cleanly; artwork fidelity toggles.');
} finally {
 await browser.close();
 await server.close();
}
