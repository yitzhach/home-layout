import { chromium } from "@playwright/test";
import { createServer } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const out = path.resolve("test-results");
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5183 },
});
await server.listen();
const launch = {
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--in-process-gpu",
    "--single-process",
    "--disable-dev-shm-usage",
  ],
  ...(process.env.BOOTH_TEST_CHROMIUM
    ? { executablePath: process.env.BOOTH_TEST_CHROMIUM }
    : {}),
};
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "booth-e2e-"));
let context;
const errors = [];
const passed = [];
const pass = (name) => {
  passed.push(name);
  console.log("PASS", name);
};
try {
  context = await chromium.launchPersistentContext(profile, {
    ...launch,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  let page = await context.newPage();
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("http://127.0.0.1:5183");
  await page.waitForFunction(() => !!window.__booth?.scene);
  await page.waitForTimeout(800);
  assert.equal(await page.locator(".library .art-card").count(), 6);
  pass("3D renderer initialized with six measured sample panels");
  const fixture = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 300;
      c.height = 400;
      const x = c.getContext("2d");
      for (const [color, a, b] of [
        ["#e15741", 0, 0],
        ["#215a82", 150, 0],
        ["#e7ce8b", 0, 200],
        ["#2b4338", 150, 200],
      ]) {
        x.fillStyle = color;
        x.fillRect(a, b, 150, 200);
      }
      x.fillStyle = "white";
      x.font = "25px sans-serif";
      x.fillText("TEST · ORIGINAL", 25, 180);
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  // First engineering checkpoint: an uploaded image, measured dimensions and responsive cast shadows.
  await page
    .locator("#replace-input")
    .setInputFiles({
      name: "original-01.png",
      mimeType: "image/png",
      buffer: fixture,
    });
  await page.waitForFunction(() => !!window.__booth.project.art[0].asset);
  await page.getByLabel("Width", { exact: true }).fill("36");
  await page.getByLabel("Width", { exact: true }).press("Tab");
  await page.getByLabel("Height", { exact: true }).fill("48");
  await page.getByLabel("Height", { exact: true }).press("Tab");
  const base = await page.evaluate(async () => {
    const b = await window.__booth.scene.export(512);
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page.getByLabel("Wall gap", { exact: true }).fill("5");
  await page.getByLabel("Wall gap", { exact: true }).press("Tab");
  await page.getByLabel("Thickness", { exact: true }).fill("3");
  await page.getByLabel("Thickness", { exact: true }).press("Tab");
  const depth = await page.evaluate(async () => {
    const b = await window.__booth.scene.export(512);
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  assert.notDeepEqual(base, depth);
  await page.locator('[data-tab="lighting"]').click();
  await page
    .getByLabel("Brightness", { exact: true })
    .evaluate((el) => (el.value = "150"));
  await page.getByLabel("Brightness", { exact: true }).dispatchEvent("change");
  const lit = await page.evaluate(async () => {
    const b = await window.__booth.scene.export(512);
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  assert.notDeepEqual(depth, lit);
  pass(
    "Uploaded 36×48 image, thickness, wall gap and spotlight affect actual rendered pixels",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: path.join(out, "mobile-checkpoint.png") });
  pass("First uploaded-image checkpoint also renders at mobile viewport");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-action="clear-samples"]').click();
  await page
    .locator("#art-input")
    .setInputFiles(
      Array.from({ length: 5 }, (_, i) => ({
        name: `original-${i + 2}.png`,
        mimeType: "image/png",
        buffer: fixture,
      })),
    );
  // Uploading files originals in the library and hangs nothing. Five files
  // used to become five coplanar panels in one spot on the back wall, which
  // is what made an upload flash through its own images.
  await page.waitForFunction(
    () => Object.keys(window.__booth.project.assets).length === 6,
  );
  assert.equal(
    await page.evaluate(
      () => window.__booth.project.art.filter((a) => a.asset).length,
    ),
    1,
  );
  assert.equal(await page.locator(".library .art-card.unplaced").count(), 5);
  pass("Uploading five originals files them in the library and hangs none");
  for (let i = 0; i < 5; i++)
    await page.locator(".library .art-card.unplaced").first().click();
  await page.waitForFunction(
    () => window.__booth.project.art.filter((a) => a.asset).length === 6,
  );
  // Tapped placements never land on each other: coplanar art is the flicker.
  assert.equal(
    await page.evaluate(() => {
      const hung = window.__booth.project.art.filter((a) => a.asset);
      return new Set(hung.map((a) => [a.wall, a.face || "inside", a.x, a.y].join("/"))).size;
    }),
    6,
  );
  pass("Tapping each library original hangs it on a spot of its own");

  // ---- What an uploaded original costs -----------------------------------
  // The fixture is four coloured quadrants on purpose: red top left, blue top
  // right, pale yellow bottom left, dark green bottom right. Decoding it at
  // the wall's size rather than unpacking it whole is the change; landing it
  // the same way up is the thing that change could quietly get wrong.
  const decoded = await page.evaluate(async () => {
    const project = window.__booth.project;
    const id = project.art.find((a) => a.asset).asset;
    const texture = await window.__booth.scene.texture(id);
    const image = texture.image;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const at = (fx, fy) => [
      ...ctx.getImageData(Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1).data,
    ].slice(0, 3);
    // What ends up at the top of the wall is not simply the top of the
    // decoded image. WebGL does not apply `flipY` to an ImageBitmap, so an
    // original on its way to a texture is decoded already flipped and
    // uploaded with the flag off; the two compose to the way up it was taken.
    // `flipY` is therefore the mapping from image rows to wall rows, and
    // sampling through it is what pins the orientation end to end.
    const top = texture.flipY ? 0.15 : 0.85;
    const bottom = texture.flipY ? 0.85 : 0.15;
    return {
      size: [image.width, image.height],
      source: [project.assets[id].width, project.assets[id].height],
      flipY: texture.flipY,
      topLeft: at(0.25, top),
      topRight: at(0.75, top),
      bottomLeft: at(0.25, bottom),
      bottomRight: at(0.75, bottom),
    };
  });
  const reddest = (c) => c[0] > c[1] && c[0] > c[2];
  const bluest = (c) => c[2] > c[0] && c[2] > c[1];
  const greenest = (c) => c[1] > c[0] && c[1] > c[2];
  assert.ok(reddest(decoded.topLeft), `top left stays red, got ${decoded.topLeft}`);
  assert.ok(bluest(decoded.topRight), `top right stays blue, got ${decoded.topRight}`);
  assert.ok(reddest(decoded.bottomLeft), `bottom left stays pale yellow, got ${decoded.bottomLeft}`);
  assert.ok(greenest(decoded.bottomRight), `bottom right stays green, got ${decoded.bottomRight}`);
  assert.deepEqual(decoded.size, decoded.source, "a small original is decoded whole, never upscaled");
  // The one that was reported: every uploaded photograph came out upside
  // down once originals were decoded through createImageBitmap.
  assert.equal(decoded.flipY, false, "an unedited original is uploaded pre-flipped, with flipY off");
  pass("An uploaded original hangs the way up it was uploaded");

  // Thumbnails: the library and the inspector show these, not the originals,
  // and both are rebuilt on every click.
  const thumbs = await page.evaluate(() => {
    const assets = Object.values(window.__booth.project.assets);
    return {
      total: assets.length,
      withThumb: assets.filter((a) => a.thumb).length,
      smaller: assets.every((a) => a.thumb && a.thumb.length < a.data.length),
      inDom: [...document.querySelectorAll(".library .art-card img")].every((img) =>
        assets.some((a) => a.thumb === img.getAttribute("src")),
      ),
    };
  });
  assert.equal(thumbs.withThumb, thumbs.total, "every uploaded original carries a thumbnail");
  assert.equal(thumbs.smaller, true, "and it is smaller than the original it stands in for");
  assert.equal(thumbs.inDom, true, "and it is what the library cards point at");
  pass("Library cards show thumbnails, not the originals");

  // The undo history holds the layout, not the pictures. This was the single
  // most expensive thing the app did: every edit stringified every original,
  // and thirty-five of those are kept.
  await page.locator('[data-tab="art"]').click();
  await page.getByLabel("Left edge", { exact: true }).fill("20");
  await page.getByLabel("Left edge", { exact: true }).press("Tab");
  const historyCost = await page.evaluate(() => {
    const data = Object.values(window.__booth.project.assets)[0].data;
    return { entries: window.__booth.history.length, carriesImages: window.__booth.history.some((h) => h.structure.includes(data.slice(64, 256))) };
  });
  assert.ok(historyCost.entries > 0, "an edit is undoable");
  assert.equal(historyCost.carriesImages, false, "and its snapshot does not carry the images");
  await page.locator('[data-action="undo"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => Object.keys(window.__booth.project.assets).length), 6,
    "and undoing gives the images back with the layout");
  await page.locator('[data-action="redo"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__booth.project.art.at(-1).x), 20);
  pass("Undo carries the layout and shares the images");

  // And a save writes the layout record without them, with each original a
  // row of its own that is written once rather than after every edit.
  await page.evaluate(() => window.__booth.save());
  const stored = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("artist-os-booth-studio");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["projects", "assets"]);
          const record = tx.objectStore("projects").get("current");
          const ids = tx.objectStore("assets").getAllKeys();
          tx.oncomplete = () =>
            resolve({ inRecord: Object.keys(record.result.assets || {}).length, rows: ids.result.length });
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  assert.equal(stored.inRecord, 0, "the saved layout record carries no images");
  assert.equal(stored.rows, 6, "each original is a row of its own");
  pass("Saving writes the layout, not fifty megabytes of base64");
  await page.locator('[data-tab="art"]').click();
  await page.getByLabel("Wall location").selectOption("left-inside");
  await page.getByLabel("Left edge", { exact: true }).fill("18");
  await page.getByLabel("Left edge", { exact: true }).press("Tab");
  await page.getByLabel("Bottom edge", { exact: true }).fill("24");
  await page.getByLabel("Bottom edge", { exact: true }).press("Tab");
  assert.equal(
    await page.evaluate(() => window.__booth.project.art.at(-1).wall),
    "left",
  );
  assert.equal(
    await page.evaluate(() => window.__booth.project.art.at(-1).x),
    18,
  );
  pass("Six original uploads and exact placement on side walls");
  await page.getByLabel("Height", { exact: true }).fill("36");
  await page.getByLabel("Height", { exact: true }).press("Tab");
  assert.ok(await page.locator(".warning").count());
  await page.locator('[data-action="match-ratio"]').click();
  assert.equal(
    await page.getByLabel("Height", { exact: true }).inputValue(),
    "48",
  );
  pass("Aspect mismatch warning and explicit correction preserve 3:4 image");
  await page.locator('[data-view="left"]').click();
  await page.locator('[data-action="move"]').click();
  await page.waitForTimeout(200);
  const pos = await page.evaluate(() => {
    const s = window.__booth.scene,
      a = window.__booth.project.art.at(-1),
      obj = s.artObjects.find((o) => o.userData.artId === a.id),
      v = obj.getWorldPosition(obj.position.clone()).project(s.camera),
      r = s.renderer.domElement.getBoundingClientRect();
    return {
      x: r.x + ((v.x + 1) * r.width) / 2,
      y: r.y + ((1 - v.y) * r.height) / 2,
    };
  });
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.mouse.move(pos.x + 35, pos.y - 20, { steps: 4 });
  await page.mouse.up();
  let moved = await page.evaluate(() => window.__booth.project.art.at(-1));
  assert.notEqual(moved.x, 18);
  assert.equal(moved.x, Math.round(moved.x));
  pass("Side-wall drag agrees with numeric placement and 1-inch snapping");
  await page.locator('[data-action="undo"]').click();
  assert.equal(
    await page.evaluate(() => window.__booth.project.art.at(-1).x),
    18,
  );
  await page.locator('[data-action="redo"]').click();
  assert.equal(
    await page.evaluate(() => window.__booth.project.art.at(-1).x),
    moved.x,
  );
  pass("Drag is one undoable action; redo restores it");
  const count = await page.evaluate(() => window.__booth.project.art.length);
  await page.locator('[data-action="duplicate-art"]').click();
  assert.equal(
    await page.evaluate(() => window.__booth.project.art.length),
    count + 1,
  );
  await page.locator('[data-action="delete-art"]').click();
  assert.equal(
    await page.evaluate(() => window.__booth.project.art.length),
    count,
  );
  pass("Duplicate and remove work");
  await page.locator('[data-tab="layout"]').click();
  await page.getByLabel("Booth preset").selectOption("240");
  await page.getByText("White canopy & frame", { exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.__booth.project.booth.width),
    240,
  );
  assert.equal(
    await page.evaluate(() => window.__booth.project.booth.tent),
    true,
  );
  await page.getByText("White canopy & frame", { exact: true }).click();
  await page.getByLabel("Booth preset").selectOption("120");
  await page.locator('[data-action="reset-view"]').click();
  pass("Booth presets and canopy configure actual geometry");
  await page.locator('[data-tab="export"]').click();
  const dlPromise = page.waitForEvent("download");
  await page.locator('[data-action="export-image"]').click();
  const dl = await dlPromise;
  await dl.saveAs(path.join(out, "booth-4096.png"));
  const png = await fs.readFile(path.join(out, "booth-4096.png"));
  assert.equal(png.readUInt32BE(16), 4096);
  assert.ok(
    await page.evaluate(() => window.__booth.scene.selectionEdge.visible),
  );
  pass("4096px PNG export succeeds and restores editor selection after export");
  await page.locator('[data-action="mode-photo"]').click();
  await page
    .locator("#photo-input")
    .setInputFiles({
      name: "booth-shot.png",
      mimeType: "image/png",
      buffer: fixture,
    });
  await page.waitForFunction(() => !!window.__booth.project.photo.asset);
  await page.locator(".library [data-source]").first().click();
  await page.waitForFunction(
    () => window.__booth.project.photo.layers.length === 1,
  );
  const beforeCorner = await page.evaluate(() =>
    structuredClone(window.__booth.project.photo.layers[0].corners),
  );
  const point = await page.evaluate(() => {
    const f = window.__booth.photo,
      r = f.rect,
      b = f.canvas.getBoundingClientRect(),
      q = window.__booth.project.photo.layers[0].corners[0];
    return { x: b.x + r.x + q[0] * r.w, y: b.y + r.y + q[1] * r.h };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 15, point.y + 10, { steps: 3 });
  await page.mouse.up();
  assert.notDeepEqual(
    await page.evaluate(() => window.__booth.project.photo.layers[0].corners),
    beforeCorner,
  );
  pass(
    "Photo artwork is added separately and corner perspective dragging works",
  );
  await page.locator('[data-tab="lighting"]').click();
  await page.locator('[data-action="add-light"]').click();
  await page
    .getByLabel("Brightness", { exact: true })
    .evaluate((el) => (el.value = "0.8"));
  await page.getByLabel("Brightness", { exact: true }).dispatchEvent("change");
  assert.equal(
    await page.evaluate(() => window.__booth.project.photo.lights[0].power),
    0.8,
  );
  await page.locator('[data-tab="export"]').click();
  const photoDL = page.waitForEvent("download");
  await page.locator('[data-action="export-image"]').click();
  await (await photoDL).saveAs(path.join(out, "photo-4096.png"));
  const photoPNG = await fs.readFile(path.join(out, "photo-4096.png"));
  assert.equal(photoPNG.readUInt32BE(16), 4096);
  assert.equal(photoPNG.readUInt32BE(20), 5461);
  pass(
    "Photo light overlays and high-resolution export retain original aspect ratio",
  );
  // A free-standing panel, with art on it, must survive the round trip — the
  // whole point of adding `booth.panels` beside `booth.walls` rather than
  // widening `walls` itself.
  await page.evaluate(() => {
    window.__booth.mutate(() => {
      const p = window.__booth.project;
      p.booth.panels = [{ id: "e2e-panel", name: "Divider", width: 60, height: 84, x: 12, z: -6, rotation: 30 }];
      p.art[0].wall = "panel:e2e-panel";
      p.art[0].x = 2;
      p.art[0].y = 24;
    });
  });
  const backupDL = page.waitForEvent("download");
  await page.locator('[data-action="backup"]').click();
  await (await backupDL).saveAs(path.join(out, "roundtrip.json"));
  const backupJSON = JSON.parse(
    await fs.readFile(path.join(out, "roundtrip.json"), "utf8"),
  );
  assert.ok(
    Object.values(backupJSON.assets).every((a) =>
      a.data.startsWith("data:image/png;base64,"),
    ),
  );
  await page.getByLabel("Project name").fill("Changed project");
  await page.getByLabel("Project name").press("Tab");
  await page
    .locator("#backup-input")
    .setInputFiles(path.join(out, "roundtrip.json"));
  await page.locator("#confirm-go").click();
  assert.equal(
    await page.getByLabel("Project name").inputValue(),
    backupJSON.name,
  );
  assert.equal(
    await page.evaluate(() => window.__booth.project.photo.layers.length),
    1,
  );
  assert.deepEqual(
    await page.evaluate(() => window.__booth.project.booth.panels),
    [{ id: "e2e-panel", name: "Divider", width: 60, height: 84, x: 12, z: -6, rotation: 30 }],
  );
  assert.equal(
    await page.evaluate(() => window.__booth.project.art[0].wall),
    "panel:e2e-panel",
  );
  pass(
    "Portable backup round-trip restores original assets, photo layers, lighting and free-standing walls",
  );
  // And a backup written before panels existed still opens: strip the key the
  // way a schema-1 file from an older build has it stripped.
  const legacy = { ...backupJSON };
  legacy.booth = { ...backupJSON.booth };
  delete legacy.booth.panels;
  legacy.art = backupJSON.art.map((a) =>
    a.wall.startsWith("panel:") ? { ...a, wall: "back" } : a);
  legacy.name = "Legacy schema-1";
  await fs.writeFile(path.join(out, "legacy.json"), JSON.stringify(legacy));
  await page.locator("#backup-input").setInputFiles(path.join(out, "legacy.json"));
  await page.locator("#confirm-go").click();
  assert.equal(await page.getByLabel("Project name").inputValue(), "Legacy schema-1");
  assert.equal(await page.evaluate(() => window.__booth.project.art[0].wall), "back");
  pass("A schema-1 backup with no panels key still opens unchanged");
  await page.waitForFunction(() =>
    document.querySelector("#save-status").textContent.includes("Saved"),
  );
  const state = await page.evaluate(() =>
    JSON.stringify(window.__booth.project),
  );
  await page.reload();
  await page.waitForFunction(() => !!window.__booth);
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.__booth.project)),
    state,
  );
  pass("Reload restores complete project from IndexedDB");
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    ...launch,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  page = await context.newPage();
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("http://127.0.0.1:5183");
  await page.waitForFunction(() => !!window.__booth);
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.__booth.project)),
    state,
  );
  pass("Browser close/reopen restores images and settings");
  await page.locator('[data-action="mode-3d"]').click();
  await page.locator('[data-tab="art"]').click();
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: path.join(out, "mobile.png") });
  for (const tab of ["layout", "lighting", "export"]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page
      .locator("#inspector-content")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
  }
  pass("390×844 touch viewport exposes all tabs without page overflow");
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.locator('[data-tab="art"]').click();
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: path.join(out, "tablet.png") });
  pass("820×1180 tablet layout has no horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(out, "desktop.png") });
  assert.deepEqual(errors, []);
  pass("No uncaught browser errors");
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify({ passed, errors }, null, 2),
  );
} finally {
  await context?.close();
  await server.close();
}
