// Covers the low looking-up orbit range and the layered city backdrop.
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:5189}});
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.BOOTH_TEST_CHROMIUM?{executablePath:process.env.BOOTH_TEST_CHROMIUM}:{}),
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--single-process','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5189');
 await page.waitForFunction(()=>!!window.__booth?.scene);

 // The orbit camera drops below the booth's focus for a looking-up view,
 // rather than stopping level with the target as it did before.
 assert.deepEqual(await page.evaluate(()=>{
   const s=window.__booth.scene;
   s.controls.target.set(0,1.5,0); s.camera.position.set(0,.2,3);
   s.clampToGround(); s.controls.update();
   return [s.controls.maxPolarAngle>Math.PI/2, s.camera.position.y>.1];
 }),[true,true],'a low camera must be allowed below target height');

 // Orbiting hard past the limit still cannot put the eye under the floor.
 assert.equal(await page.evaluate(()=>{
   const s=window.__booth.scene;
   s.controls.target.set(0,1.5,0); s.camera.position.set(0,-4,1);
   for(let i=0;i<120;i++){s.clampToGround();s.controls.update();}
   return s.camera.position.y>=.1;
 }),true,'the ground plane must stop the descent');

 // Closer in, the limit opens up further: the eye slides along the ground.
 assert.equal(await page.evaluate(()=>{
   const s=window.__booth.scene, at=(r)=>{
     s.controls.target.set(0,1.5,0);
     s.camera.position.set(0,1.5,r); s.clampToGround();
     return s.controls.maxPolarAngle;
   };
   return at(2)>at(9);
 }),true,'a nearer camera may tilt lower than a distant one');

 await page.locator('[data-tab="layout"]').click();
 await page.getByLabel('Horizon',{exact:true}).selectOption('urban');
 await page.waitForFunction(()=>!!window.__booth.scene.group.getObjectByName('city'));
 const city=()=>page.evaluate(()=>{
   const c=window.__booth.scene.group.getObjectByName('city');
   const shell=c.children.find(m=>Array.isArray(m.material));
   return {
     count:c.children.length,
     shadowFree:c.children.every(m=>!m.castShadow&&!m.receiveShadow),
     textured:!!(shell.material[0].map&&shell.material[0].emissiveMap),
     tallest:Math.max(...c.children.map(m=>m.position.y)),
     layout:c.children.slice(0,16).map(m=>[+m.position.x.toFixed(4),+m.position.z.toFixed(4)]),
   };
 });
 const first=await city();
 assert.ok(first.count>40,`expected a dense skyline, got ${first.count} pieces`);
 assert.ok(first.textured,'facades must carry the window map and lit-window emissive map');
 assert.ok(first.shadowFree,'distant backdrop must stay out of the shadow passes');
 assert.ok(first.tallest>12,`expected towers above 12m, tallest was ${first.tallest}`);

 // The skyline is seeded, so editing the booth must not reshuffle it.
 await page.evaluate(()=>window.__booth.mutate(()=>{}));
 await page.waitForFunction(()=>!!window.__booth.scene.group.getObjectByName('city'));
 const second=await city();
 assert.deepEqual(second.layout,first.layout,'the city must be deterministic across rebuilds');
 assert.equal(second.count,first.count);

 // Outdoor settings get the gradient sky and haze-matched fog.
 assert.deepEqual(await page.evaluate(()=>{
   const s=window.__booth.scene.scene;
   return [s.background.isTexture===true, !!s.fog];
 }),[true,true],'urban horizon needs a sky texture and fog');

 assert.deepEqual(errors,[]);
 console.log('PASS low looking-up orbit range, ground clamp, layered deterministic city backdrop, gradient sky.');
}finally{await browser.close();await server.close();}
