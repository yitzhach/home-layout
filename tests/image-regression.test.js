import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TextureCache } from "../src/texture-cache.js";
import { normalizeImageEdits, hasImageEdits, DEFAULT_IMAGE_EDITS } from "../src/image-edit.js";

test("null and omitted edits preserve unedited images", () => {
  for (const edits of [null, undefined, {}]) {
    assert.deepEqual(normalizeImageEdits(edits), DEFAULT_IMAGE_EDITS);
    assert.equal(hasImageEdits(edits), false);
  }
});

test("unedited image texture loads with the default null adjustment argument", async () => {
  const source = readFileSync(new URL("../src/scene.js", import.meta.url), "utf8");
  const method = source.slice(source.indexOf("  async texture("), source.indexOf("  update(p,"));
  class TextureStub {
    listeners = [];
    constructor(image) { this.image = image; }
    addEventListener(name, fn) { this.listeners.push([name, fn]); }
  }
  // The asset's own recorded size is what decides the decode size, so the
  // stub is handed the same three arguments the real decoder is.
  const asked = [];
  const decodeAt = async (data, width, height, maxEdge, options) => {
    asked.push({ data, width, height, maxEdge, options });
    return { data, width, height };
  };
  // The unedited path decodes for upload, so the source comes back already
  // flipped and the texture must not flip it a second time.
  const make = new Function("decodeAt", "isPreflipped", "T", "hasImageEdits", "ART_TEXTURE_MAX",
    "return {" + method + "};");
  const scene = make(decodeAt, () => true, { Texture: TextureStub, SRGBColorSpace: "srgb" }, hasImageEdits, 2048);
  scene.textureCache = new TextureCache();
  scene.p = { assets: { original: { data: "data:image/png;base64,test", width: 4000, height: 3000 } } };
  scene.renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
  const texture = await scene.texture("original");
  assert.equal(texture.image.data, scene.p.assets.original.data);
  assert.equal(texture.needsUpdate, true);
  // Decoded at the wall's size rather than the original's: an unpacked 12
  // megapixel bitmap is the cost this was written to stop paying.
  assert.deepEqual(asked, [{ data: "data:image/png;base64,test", width: 4000, height: 3000, maxEdge: 2048, options: { upload: true } }]);
  // Upside-down uploads: WebGL does not apply flipY to an ImageBitmap, so a
  // source the decoder already flipped is uploaded with the flag off.
  assert.equal(texture.flipY, false);
  // A cache hit decodes nothing at all.
  assert.equal(await scene.texture("original"), texture);
  assert.equal(asked.length, 1);
  // An ImageBitmap's pixels live outside the JavaScript heap, so the texture
  // hands them back when it is disposed rather than waiting to be collected.
  assert.deepEqual(texture.listeners.map(([name]) => name), ["dispose"]);
  let closed = false;
  texture.image.close = () => (closed = true);
  texture.listeners[0][1]();
  assert.equal(closed, true);
});

test("artwork transforms reuse scene objects without disposing textures", () => {
  const source = readFileSync(new URL("../src/scene.js", import.meta.url), "utf8");
  const method = source.slice(source.indexOf("  updateArtwork("), source.indexOf("  setView("));
  const scene = new Function("IN", "return {" + method + "};")(0.0254);
  let position, scale;
  const group = { position: { set: (...v) => position = v }, scale: { set: (...v) => scale = v } };
  scene.artGroups = new Map([["art", { group, initial: { w: 20, h: 30, thickness: 1 } }]]);
  scene.renderer = { shadowMap: {} };
  // Shadows are refreshed through touchShadows, once a drawn frame; this
  // method is extracted on its own, so it is stubbed.
  let shadowTouches = 0;
  scene.touchShadows = () => shadowTouches++;
  scene.updateArtwork({ id: "art", x: 10, y: 20, w: 40, h: 60, thickness: 1, offset: 1 });
  assert.deepEqual(scale, [2, 2, 1]);
  assert.equal(position[0], 30 * 0.0254);
  assert.equal(scene.artGroups.get("art").group, group);
  assert.equal(shadowTouches, 1, "a move asks for shadows once, and does not set the flag itself");
});

test("image editor uses the browser Image loader, not the imported icon", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const imports = source.slice(source.indexOf("import {"), source.indexOf('} from "lucide"'));
  assert.match(imports, /Image as ImageIcon/);
  assert.doesNotMatch(imports, /\n\s*Image,/);
  // `new Image()` lives in image-source.js now, and that module imports no
  // icons at all — which is the whole of what this guard was ever about.
  const decoder = readFileSync(new URL("../src/image-source.js", import.meta.url), "utf8");
  assert.doesNotMatch(decoder, /lucide/);
});

test("the image editor decodes at the size it shows, not the original's", async () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const preview = source.slice(source.indexOf("  function drawImageEditorPreview"), source.indexOf("  function editRange"));
  let draws = 0;
  const ctx = { drawImage: () => draws++, fillRect() {} };
  const canvas = { width: 600, height: 400, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 600, height: 400 }) };
  const document = { querySelector: s => s === "#image-editor" ? { open: true } : canvas,
    createElement: () => ({ getContext: () => ctx }) };
  const asked = [];
  const decodeAt = async (data, width, height, maxEdge) => {
    asked.push({ data, width, height, maxEdge });
    return { width: 600, height: 400 };
  };
  const run = new Function("document", "decodeAt", "applyImageEdits", "p", "devicePixelRatio",
    "let editPreviewRevision=0; const editPreviewSources=new WeakMap(); const toast=()=>{};" +
    preview + "; return drawImageEditorPreview;");
  run(document, decodeAt, s => s, { assets: { a: { data: "fixture", width: 6000, height: 4000 } } }, 1)({ asset: "a" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(asked, [{ data: "fixture", width: 6000, height: 4000, maxEdge: 720 }],
    "a 24 megapixel original is not unpacked whole for a 600 px dialog");
  assert.equal(draws, 1, "the edited image is drawn into the visible preview");
});
