import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import {
  DEFAULTS,
  OUT_NAMES,
  classify,
  jpegSize,
  parseArgs,
  prepare,
  resizeRGBA,
  resampleJPEG,
} from "../tools/texture-prep.mjs";

const swatch = (width, height, shade = 128) => {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = shade;
    data[i * 4 + 1] = (i % width) & 0xff;
    data[i * 4 + 2] = 255 - shade;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
};
const jpegOf = (width, height, shade) => Buffer.from(jpeg.encode(swatch(width, height, shade), 92).data);

// An unzipped ambientCG folder, named exactly the way they name them.
async function ambientCGFolder(t, { normal = "NormalGL", extras = [], size = 64 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "acg-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = [
    `Concrete034_1K_Color.jpg`,
    `Concrete034_1K_${normal}.jpg`,
    `Concrete034_1K_Roughness.jpg`,
    `Concrete034_1K_AmbientOcclusion.jpg`,
    ...extras,
  ];
  for (const name of files) await writeFile(join(dir, name), jpegOf(size, size, 128));
  return dir;
}

test("ambientCG's own file names map onto the four slots", () => {
  const { chosen, missing, normalConvention } = classify([
    "Concrete034_1K_Color.jpg",
    "Concrete034_1K_NormalGL.jpg",
    "Concrete034_1K_Roughness.jpg",
    "Concrete034_1K_AmbientOcclusion.jpg",
    "Concrete034_1K_Displacement.jpg",
    "Concrete034.usdc",
  ]);
  assert.equal(chosen.map, "Concrete034_1K_Color.jpg");
  assert.equal(chosen.normalMap, "Concrete034_1K_NormalGL.jpg");
  assert.equal(chosen.roughnessMap, "Concrete034_1K_Roughness.jpg");
  assert.equal(chosen.aoMap, "Concrete034_1K_AmbientOcclusion.jpg");
  assert.deepEqual(missing, []);
  assert.equal(normalConvention, "GL");
});

test("a hand-assembled folder works too", () => {
  const { chosen, missing } = classify(["color.png", "normal.png", "rough.png", "ao.png", "notes.txt"]);
  assert.equal(chosen.map, "color.png");
  assert.equal(chosen.roughnessMap, "rough.png");
  assert.deepEqual(missing, []);
});

// The phase notes warn about this one: DX and GL look identical in a thumbnail
// and light the surface from opposite sides.
test("a DirectX normal map is detected rather than passed off as GL", () => {
  assert.equal(classify(["x_Color.jpg", "x_NormalDX.jpg"]).normalConvention, "DX");
  assert.equal(classify(["x_Color.jpg", "x_NormalGL.jpg"]).normalConvention, "GL");
  // Both present: prefer the one the app wants.
  const both = classify(["x_Color.jpg", "x_NormalDX.jpg", "x_NormalGL.jpg"]);
  assert.equal(both.chosen.normalMap, "x_NormalGL.jpg");
  assert.equal(both.normalConvention, "GL");
});

test("an incomplete set is reported, not rejected", () => {
  const { chosen, missing } = classify(["Grass004_1K_Color.jpg"]);
  assert.equal(chosen.map, "Grass004_1K_Color.jpg");
  assert.deepEqual(missing.sort(), ["aoMap", "normalMap", "roughnessMap"]);
});

test("one file is never used for two slots", () => {
  const { chosen } = classify(["Thing_Color.jpg", "Thing_Normal.jpg"]);
  assert.equal(chosen.map, "Thing_Color.jpg");
  assert.equal(chosen.normalMap, "Thing_Normal.jpg");
  assert.notEqual(chosen.map, chosen.normalMap);
});

test("resizing averages down and keeps the aspect ratio", () => {
  const small = resizeRGBA(swatch(64, 32), 16);
  assert.deepEqual([small.width, small.height], [16, 8]);
  assert.equal(resizeRGBA(swatch(32, 32), 64).width, 32, "never upsamples");
});

test("jpegSize reads dimensions without decoding", () => {
  assert.deepEqual(jpegSize(jpegOf(48, 24)), { width: 48, height: 24 });
  assert.equal(jpegSize(Buffer.from([0xff, 0xd8, 0x00])), null);
});

test("resampling a JPEG produces a smaller decodable JPEG", () => {
  const { buffer, width, height } = resampleJPEG(jpegOf(128, 128), 32);
  assert.deepEqual([width, height], [32, 32]);
  const decoded = jpeg.decode(buffer);
  assert.deepEqual([decoded.width, decoded.height], [32, 32]);
});

test("prepare copies the set under the names the app looks for", async (t) => {
  const source = await ambientCGFolder(t);
  const out = await mkdtemp(join(tmpdir(), "set-"));
  t.after(() => rm(out, { recursive: true, force: true }));

  const { meta, missing } = await prepare({ source, outDir: out, tileMetres: 2, credit: "Concrete034 (ambientCG)" });

  assert.deepEqual(missing, []);
  const written = (await readdir(out)).sort();
  assert.deepEqual(written, ["ao.jpg", "color.jpg", "meta.json", "normal.jpg", "rough.jpg"]);
  assert.deepEqual(meta.files, { map: "color.jpg", normalMap: "normal.jpg", roughnessMap: "rough.jpg", aoMap: "ao.jpg" });
  assert.equal(meta.tileMetres, 2);
  assert.equal(meta.normalMap, "GL");
  assert.equal(meta.credit, "Concrete034 (ambientCG)");
  assert.equal(meta.license, DEFAULTS.license);
  assert.deepEqual(JSON.parse(await readFile(join(out, "meta.json"), "utf8")), meta);
  // Copying, not re-encoding: the bytes must be identical to the download.
  assert.deepEqual(await readFile(join(out, "color.jpg")), await readFile(join(source, "Concrete034_1K_Color.jpg")));
});

test("prepare records a DX normal map so the app can flip it", async (t) => {
  const source = await ambientCGFolder(t, { normal: "NormalDX" });
  const out = await mkdtemp(join(tmpdir(), "set-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const { meta } = await prepare({ source, outDir: out });
  assert.equal(meta.normalMap, "DX");
});

test("prepare resamples when asked and keeps the extension honest", async (t) => {
  const source = await ambientCGFolder(t, { size: 128 });
  const out = await mkdtemp(join(tmpdir(), "set-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await prepare({ source, outDir: out, size: 32 });
  assert.deepEqual(jpegSize(await readFile(join(out, "color.jpg"))), { width: 32, height: 32 });
});

test("prepare refuses to resample what it cannot decode", async (t) => {
  const source = await mkdtemp(join(tmpdir(), "acg-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  await writeFile(join(source, "Grass004_1K_Color.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await assert.rejects(() => prepare({ source, outDir: source, size: 512 }), /JPEG-only/);
});

test("a folder with no colour map is refused outright", async (t) => {
  const source = await mkdtemp(join(tmpdir(), "acg-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  await writeFile(join(source, "Concrete034_1K_Roughness.jpg"), jpegOf(16, 16));
  await assert.rejects(() => prepare({ source, outDir: source }), /no colour map/);
});

test("a mixed-resolution set is called out", async (t) => {
  const source = await mkdtemp(join(tmpdir(), "acg-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  await writeFile(join(source, "X_1K_Color.jpg"), jpegOf(64, 64));
  await writeFile(join(source, "X_2K_NormalGL.jpg"), jpegOf(128, 128));
  const out = join(source, "out");
  await mkdir(out, { recursive: true });
  const lines = [];
  await prepare({ source, outDir: out, log: (line) => lines.push(line) });
  assert.ok(lines.some((line) => /not all the same size/.test(line)), lines.join("\n"));
});

test("the command line defaults to the ground kind's directory", () => {
  const args = parseArgs(["~/Downloads/Concrete034_1K-JPG", "concrete"]);
  assert.equal(args.outDir, join("public", "assets", "textures", "concrete"));
  assert.equal(args.tileMetres, DEFAULTS.tileMetres);
  assert.equal(args.size, undefined, "copying is the default, not resampling");
  const custom = parseArgs(["src", "grass", "--tile", "4", "--size", "1024", "--out", "/tmp/g"]);
  assert.equal(custom.tileMetres, 4);
  assert.equal(custom.size, 1024);
  assert.equal(custom.outDir, "/tmp/g");
  assert.throws(() => parseArgs(["only-one"]), /Usage/);
  assert.throws(() => parseArgs(["src", "grass", "--tile"]), /--tile needs a value/);
});

test("the slot names the tool writes are the ones the app reads", async () => {
  const { MAP_FILES } = await import("../src/surfaces.js");
  for (const [slot, file] of Object.entries(MAP_FILES))
    assert.equal(file, `${OUT_NAMES[slot]}.jpg`, `${slot} default file name`);
});
