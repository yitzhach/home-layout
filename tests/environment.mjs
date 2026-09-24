import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:5186}});await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.BOOTH_TEST_CHROMIUM?{executablePath:process.env.BOOTH_TEST_CHROMIUM}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--single-process']});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5186');await page.waitForFunction(()=>!!window.__booth?.scene);await page.locator('[data-tab="layout"]').click();
await page.getByLabel('Ground',{exact:true}).selectOption('grass');await page.getByLabel('Horizon',{exact:true}).selectOption('park');
await fs.mkdir('docs/previews',{recursive:true});
for(const style of ['classic','peak','barrel','dome']) {await page.getByLabel('Tent style',{exact:true}).selectOption(style);await page.waitForTimeout(200);assert.equal(await page.evaluate(s=>!!window.__booth.scene.group.getObjectByName('tent-'+s),style),true);await page.locator('#scene').screenshot({path:`docs/previews/${style}.jpg`,type:'jpeg',quality:86});}
const distance=()=>page.evaluate(()=>{const s=window.__booth.scene;return s.camera.position.distanceTo(s.controls.target);});const d=await distance();await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.ok(await distance()<d);await page.getByRole('button',{name:'Zoom out',exact:true}).click();assert.ok(Math.abs(await distance()-d)<.01);
await page.locator('[data-view="plan"]').click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.ok(await page.evaluate(()=>window.__booth.scene.camera.zoom>1));await page.locator('[data-action="reset-view"]').click();
for(const ground of ['asphalt','concrete','grass'])await page.getByLabel('Ground',{exact:true}).selectOption(ground);
await page.getByLabel('Surround with other booths').check();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved'));await page.reload();await page.waitForFunction(()=>!!window.__booth?.scene);assert.equal(await page.evaluate(()=>window.__booth.project.booth.neighbors),true);assert.equal(await page.evaluate(()=>window.__booth.project.booth.tentStyle),'dome');
await page.locator('[data-tab="export"]').click();await page.getByLabel('Export image width').selectOption('2048');const dl=page.waitForEvent('download');await page.locator('[data-action="export-image"]').click();await (await dl).saveAs('test-results/environment-export.png');
for(const width of [820,390]) {await page.setViewportSize({width,height:1000});await page.locator('[data-tab="layout"]').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.screenshot({path:`test-results/environment-${width}.png`});}
assert.deepEqual(errors,[]);console.log('PASS four tent styles, grounds, neighbors, perspective/orthographic zoom, saved settings, 2048 export, mobile/tablet controls.');
}finally{await browser.close();await server.close();}
