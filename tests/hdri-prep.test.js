import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DataTexture, FloatType, HalfFloatType, RGBAFormat } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRExporter, ZIPS_COMPRESSION } from "three/addons/exporters/EXRExporter.js";
import jpeg from "jpeg-js";
import {
  DEFAULTS,
  downsample,
  encodeBackdrop,
  encodeRadiance,
  headroom,
  parseArgs,
  parseSource,
  prepare,
} from "../tools/hdri-prep.mjs";

// A synthetic equirect: a horizontal radiance ramp, a constant band down the
// middle rows (so run-length encoding has something to compress) and a row of
// bright spikes standing in for a sun.
function testImage(width = 64, height = 32) {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const band = y >= height / 2 && y < height / 2 + 4;
      data[o] = band ? 0.5 : (x / width) * 3;
      data[o + 1] = band ? 0.5 : y / height;
      data[o + 2] = band ? 0.5 : y === 2 && x % 9 === 0 ? 40 : 0.2;
      data[o + 3] = 1;
    }
  return { width, height, data };
}

const readBack = (hdr) => {
  const loader = new HDRLoader();
  loader.type = FloatType;
  return loader.parse(hdr.buffer.slice(hdr.byteOffset, hdr.byteOffset + hdr.byteLength));
};

test("an .hdr written here reads back as the radiance that went in", () => {
  const image = testImage();
  const back = readBack(encodeRadiance(image));
  assert.equal(back.width, image.width);
  assert.equal(back.height, image.height);
  // RGBE shares one exponent across a pixel's three channels, so a channel's
  // absolute error is bounded by the brightest channel, not by its own value.
  let worst = 0;
  for (let i = 0; i < image.width * image.height; i++) {
    const peak = Math.max(image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]);
    for (let c = 0; c < 3; c++)
      worst = Math.max(worst, Math.abs(image.data[i * 4 + c] - back.data[i * 4 + c]) / Math.max(peak, 1e-6));
  }
  assert.ok(worst < 0.01, `worst shared-exponent error ${worst}`);
});

test("run-length encoding beats writing the scanlines flat", () => {
  const image = testImage(256, 128);
  const bytes = encodeRadiance(image).length;
  assert.ok(bytes < image.width * image.height * 4, `${bytes} bytes is no better than flat`);
  // The constant band must actually collapse rather than merely not grow.
  assert.ok(bytes < image.width * image.height * 3.6, `${bytes} bytes: runs are not collapsing`);
});

// Scanlines narrower than 8 pixels cannot carry the RLE marker at all, so the
// writer has to fall back to flat scanlines that the loader still reads.
test("a scanline too narrow to encode is written flat and still parses", () => {
  const image = testImage(4, 2);
  const back = readBack(encodeRadiance(image));
  assert.equal(back.width, 4);
  assert.equal(back.height, 2);
  assert.ok(Math.abs(back.data[4] - image.data[4]) < 0.05);
});

test("downsampling halves by area and keeps the 2:1 shape", () => {
  const image = testImage(64, 32);
  const small = downsample(image, 32);
  assert.deepEqual([small.width, small.height], [32, 16]);
  // Each target pixel is the mean of the four source pixels it covers.
  const mean = (o) => (image.data[o] + image.data[o + 4] + image.data[o + 64 * 4] + image.data[o + 64 * 4 + 4]) / 4;
  assert.ok(Math.abs(small.data[0] - mean(0)) < 1e-6);
  assert.ok(Math.abs(small.data[4] - mean(8)) < 1e-6);
});

test("downsampling never upsamples", () => {
  const image = testImage(32, 16);
  const same = downsample(image, 2048);
  assert.deepEqual([same.width, same.height], [32, 16]);
  assert.notEqual(same.data, image.data, "the source buffer is not handed out");
});

test("headroom measures the bright end without chasing the sun", () => {
  const image = testImage();
  const k = headroom(image);
  assert.ok(k > 1, "a scene brighter than white needs headroom");
  assert.ok(k < 40, "the spikes are meant to clip, not to set the scale");
  assert.ok(k <= DEFAULTS.maxHeadroom);
});

test("a scene no brighter than white needs no headroom", () => {
  const dim = { width: 16, height: 8, data: new Float32Array(16 * 8 * 4).fill(0.3) };
  assert.equal(headroom(dim), 1);
});

// The backdrop is stored divided by the headroom and multiplied back in the
// shader, so the division has to be exactly undone by the number in meta.json.
test("the backdrop encodes linear radiance over the headroom", () => {
  const k = 4;
  const value = 2.0; // two stops over white, well inside the headroom
  const flat = { width: 16, height: 8, data: new Float32Array(16 * 8 * 4).fill(value) };
  const decoded = jpeg.decode(encodeBackdrop(flat, { headroom: k, quality: 95 }));
  assert.deepEqual([decoded.width, decoded.height], [16, 8]);
  const srgb = decoded.data[0] / 255;
  const linear = srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  assert.ok(Math.abs(linear * k - value) < 0.05, `round-tripped ${linear * k} instead of ${value}`);
});

test("a source that is not 2:1 is refused", async () => {
  const square = encodeRadiance({ width: 16, height: 16, data: new Float32Array(16 * 16 * 4).fill(0.5) });
  await assert.rejects(() => parseSource("square.hdr", square), /2:1/);
});

test("parseSource reads back an .hdr", async () => {
  const image = testImage();
  const parsed = await parseSource("ramp.hdr", encodeRadiance(image));
  assert.deepEqual([parsed.width, parsed.height], [image.width, image.height]);
  assert.ok(parsed.data instanceof Float32Array);
});

// three's own EXR round-trip only agrees with itself on ZIPS; the default ZIP
// path in EXRExporter does not read back through EXRLoader. Real EXRs from
// Poly Haven go through the loader, which is the half of this the app needs.
test("parseSource reads a half-float EXR as floats", async () => {
  const image = testImage(16, 8);
  const texture = new DataTexture(image.data, image.width, image.height, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  const exr = await new EXRExporter().parse(texture, { type: HalfFloatType, compression: ZIPS_COMPRESSION });
  const parsed = await parseSource("ramp.exr", Buffer.from(exr));
  assert.deepEqual([parsed.width, parsed.height], [16, 8]);
  assert.ok(Math.abs(parsed.data[4] - image.data[4]) < 0.01);
});

test("prepare writes the two files and the metadata beside them", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "hdri-prep-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "source.hdr");
  await writeFile(source, encodeRadiance(testImage(256, 128)));

  const { meta } = await prepare({ source, outDir: dir, lightWidth: 64, backgroundWidth: 128, credit: "Test HDRI" });

  const light = readBack(await readFile(join(dir, "light.hdr")));
  assert.deepEqual([light.width, light.height], [64, 32]);
  const backdrop = jpeg.decode(await readFile(join(dir, "bg.jpg")));
  assert.deepEqual([backdrop.width, backdrop.height], [128, 64]);

  const written = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
  assert.deepEqual(written, meta);
  assert.equal(written.credit, "Test HDRI");
  assert.equal(written.license, DEFAULTS.license);
  assert.ok(written.backgroundIntensity >= 1);
  assert.deepEqual(written.light, { width: 64, height: 32 });
});

test("prepare will not stretch a backdrop past its source", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "hdri-prep-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "source.hdr");
  await writeFile(source, encodeRadiance(testImage(64, 32)));
  const { meta } = await prepare({ source, outDir: dir, lightWidth: 32, backgroundWidth: 4096 });
  assert.deepEqual(meta.background.width, 64);
});

test("the command line defaults to the preset's asset directory", () => {
  const args = parseArgs(["hall.exr", "warehouse"]);
  assert.equal(args.source, "hall.exr");
  assert.equal(args.outDir, join("public", "assets", "hdri", "warehouse"));
  assert.equal(args.lightWidth, DEFAULTS.lightWidth);
  assert.equal(args.backgroundWidth, DEFAULTS.backgroundWidth);
  const custom = parseArgs(["hall.exr", "home", "--bg", "4096", "--quality", "70", "--out", "/tmp/x"]);
  assert.equal(custom.backgroundWidth, 4096);
  assert.equal(custom.quality, 70);
  assert.equal(custom.outDir, "/tmp/x");
  assert.throws(() => parseArgs(["hall.exr"]), /Usage/);
  assert.throws(() => parseArgs(["hall.exr", "home", "--bg"]), /--bg needs a value/);
});
