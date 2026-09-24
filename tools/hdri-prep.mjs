#!/usr/bin/env node
// Turns one high-resolution HDRI into the two files an environment preset
// needs, plus the metadata that keeps the backdrop's brightness honest.
//
//   node tools/hdri-prep.mjs <source.hdr|source.exr> <preset>
//
// Why two files: `light.hdr` (1K) only ever feeds PMREM, so it can be small
// without anyone seeing it, while `bg.jpg` (2K/4K) is what the camera looks
// at. One 4K .hdr doing both jobs costs roughly ten times the bytes — see
// PBR_PHASE.md. Poly Haven publishes both, so this tool is for converting an
// HDRI you already have; downloading the 1K .hdr and the 2K .jpg directly is
// still the shortest path.
//
// About the headroom in meta.json: three.js tone-maps `scene.background` with
// the same ACES curve it applies to the booth, so a backdrop that is already
// tone-mapped gets tone-mapped twice and goes flat. This tool instead writes
// *linear* radiance divided by a headroom factor K, and the app multiplies it
// back through `scene.backgroundIntensity`. The renderer's single ACES pass
// then lands on the same image a renderer would produce from the full HDRI.
// A hand-dropped Poly Haven .jpg has no meta.json, K is 1, and the result is
// the ordinary tone-mapped-twice backdrop — dimmer, but never broken.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { FloatType } from "three";
import jpeg from "jpeg-js";

export const DEFAULTS = {
  lightWidth: 1024,
  // The backdrop is the one asset the camera magnifies, so it gets the width
  // and the quality. 4096 is what a 4K source should produce; a smaller source
  // still caps at its own width, loudly. Quality 92 rather than 88 because
  // `backgroundIntensity` multiplies the backdrop's radiance — 16x for the
  // trade show hall — and multiplies its quantization steps with it.
  backgroundWidth: 4096,
  quality: 92,
  percentile: 0.995,
  maxHeadroom: 16,
  license: "CC0",
};

// Equirectangular sources are 2:1. Anything else would still convert, but it
// would wrap onto the sphere wrongly, so it is worth refusing early.
const checkEquirect = (image, label) => {
  if (Math.abs(image.width / image.height - 2) > 0.01)
    throw new Error(`${label} is ${image.width}x${image.height}; an equirectangular HDRI must be 2:1`);
  return image;
};

export async function parseSource(name, buffer) {
  const ext = extname(name).toLowerCase();
  const array = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const module =
    ext === ".exr"
      ? await import("three/addons/loaders/EXRLoader.js")
      : await import("three/addons/loaders/HDRLoader.js");
  const loader = ext === ".exr" ? new module.EXRLoader() : new module.HDRLoader();
  // Both loaders default to half floats; the arithmetic below wants real ones.
  loader.type = FloatType;
  const texData = loader.parse(array);
  const data = texData.data instanceof Float32Array ? texData.data : Float32Array.from(texData.data);
  if (data.length !== texData.width * texData.height * 4)
    throw new Error(`${name}: expected RGBA float data, got ${data.length} values for ${texData.width}x${texData.height}`);
  return checkEquirect({ width: texData.width, height: texData.height, data }, name);
}

// Area-average box filter over the source pixels each target pixel covers.
// It handles non-halving ratios, which matters because a 2K backdrop is often
// asked of a 4096- or 3072-wide source.
export function downsample(image, targetWidth) {
  const width = Math.max(2, Math.round(targetWidth));
  if (width >= image.width) return { ...image, data: Float32Array.from(image.data) };
  const height = Math.max(1, Math.round(width / 2));
  const out = new Float32Array(width * height * 4);
  const sx = image.width / width,
    sy = image.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy),
      y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx),
        x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil((x + 1) * sx)));
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let j = y0; j < y1; j++)
        for (let i = x0; i < x1; i++) {
          const o = (j * image.width + i) * 4;
          r += image.data[o];
          g += image.data[o + 1];
          b += image.data[o + 2];
          n++;
        }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 1;
    }
  }
  return { width, height, data: out };
}

// Radiance RGBE: one shared exponent per pixel, so a 1K sphere of real
// radiance costs four bytes a pixel instead of sixteen.
const encodePixel = (r, g, b, out, o) => {
  const v = Math.max(r, g, b);
  if (!(v > 1e-32)) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  const e = Math.max(-127, Math.min(127, Math.ceil(Math.log2(v))));
  const scale = 256 * Math.pow(2, -e);
  out[o] = Math.min(255, Math.floor(r * scale));
  out[o + 1] = Math.min(255, Math.floor(g * scale));
  out[o + 2] = Math.min(255, Math.floor(b * scale));
  out[o + 3] = e + 128;
};

// Adaptive run-length encoding, ported from Radiance's own fwritecolrs: runs
// of four or more repeat as a count byte plus a value, everything else is
// written literally. Scanlines outside 8..0x7fff cannot be encoded at all,
// which is why the flat branch stays.
function encodeScanline(channel, width, out) {
  let cur = 0;
  while (cur < width) {
    let begRun = cur,
      runCount = 0,
      oldRunCount = 0;
    while (runCount < 4 && begRun < width) {
      begRun += runCount;
      oldRunCount = runCount;
      runCount = 1;
      while (begRun + runCount < width && runCount < 127 && channel[begRun] === channel[begRun + runCount]) runCount++;
    }
    if (oldRunCount > 1 && oldRunCount === begRun - cur) {
      out.push(128 + oldRunCount, channel[cur]);
      cur = begRun;
    }
    while (cur < begRun) {
      const literal = Math.min(128, begRun - cur);
      out.push(literal);
      out.copy(channel, cur, literal);
      cur += literal;
    }
    if (runCount >= 4) {
      out.push(128 + runCount, channel[begRun]);
      cur += runCount;
    }
  }
}

// A 4K light map is 33 MB of scanlines; a plain JS array of that many numbers
// costs several times what the bytes do, so grow a typed buffer instead.
function byteSink(capacity) {
  let data = new Uint8Array(capacity),
    length = 0;
  const room = (n) => {
    if (length + n <= data.length) return;
    const bigger = new Uint8Array(Math.max(data.length * 2, length + n));
    bigger.set(data.subarray(0, length));
    data = bigger;
  };
  return {
    push(...values) {
      room(values.length);
      for (const value of values) data[length++] = value;
    },
    copy(source, from, count) {
      room(count);
      data.set(source.subarray(from, from + count), length);
      length += count;
    },
    get bytes() {
      return data.subarray(0, length);
    },
  };
}

export function encodeRadiance(image, { exposure = 1 } = {}) {
  const { width, height, data } = image;
  const header = Buffer.from(
    `#?RADIANCE\n# Written by booth-studio tools/hdri-prep.mjs\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=${exposure.toFixed(6)}\n\n-Y ${height} +X ${width}\n`,
    "ascii",
  );
  const rle = width >= 8 && width <= 0x7fff;
  const out = byteSink(width * height * 4);
  const row = new Uint8Array(width * 4);
  const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      encodePixel(data[o], data[o + 1], data[o + 2], row, x * 4);
    }
    if (!rle) {
      out.copy(row, 0, row.length);
      continue;
    }
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) channels[c][x] = row[x * 4 + c];
    out.push(2, 2, (width >> 8) & 0xff, width & 0xff);
    for (const channel of channels) encodeScanline(channel, width, out);
  }
  return Buffer.concat([header, Buffer.from(out.bytes)]);
}

// How much brighter than white the scene gets. Sampling rather than sorting
// every pixel keeps a 4K source cheap; the sun is meant to clip, the sky is
// not, so a high percentile rather than the maximum.
export function headroom(image, { percentile = DEFAULTS.percentile, max = DEFAULTS.maxHeadroom } = {}) {
  const pixels = image.width * image.height;
  const step = Math.max(1, Math.floor(pixels / 200000));
  const samples = [];
  for (let i = 0; i < pixels; i += step) {
    const o = i * 4;
    samples.push(Math.max(image.data[o], image.data[o + 1], image.data[o + 2]));
  }
  samples.sort((a, b) => a - b);
  const value = samples[Math.min(samples.length - 1, Math.floor(samples.length * percentile))] || 0;
  return Math.min(max, Math.max(1, Math.round(value * 100) / 100));
}

const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function encodeBackdrop(image, { headroom: k = 1, quality = DEFAULTS.quality } = {}) {
  const { width, height, data } = image;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) {
      const linear = Math.min(1, Math.max(0, data[i * 4 + c] / k));
      rgba[i * 4 + c] = Math.round(toSRGB(linear) * 255);
    }
    rgba[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data: rgba, width, height }, quality).data);
}

export async function prepare({
  source,
  outDir,
  lightWidth = DEFAULTS.lightWidth,
  backgroundWidth = DEFAULTS.backgroundWidth,
  quality = DEFAULTS.quality,
  headroom: forcedHeadroom,
  credit = "",
  license = DEFAULTS.license,
  log = () => {},
}) {
  const image = await parseSource(source, await readFile(source));
  log(`source ${basename(source)} ${image.width}x${image.height}`);

  const light = downsample(image, lightWidth);
  const hdr = encodeRadiance(light);

  // Upsampling a backdrop invents detail it never had; cap at the source. This
  // cap is how the shipped backdrops ended up at 1024px: both were prepped from
  // Poly Haven's 1K .hdr, the cap quietly took effect, and the result is a
  // panorama the camera magnifies about eightfold. The warning is loud because
  // the consequence is only visible on screen, long after the tool has run.
  const bgWidth = Math.min(backgroundWidth, image.width);
  if (bgWidth < backgroundWidth)
    log(
      `WARNING backdrop capped at the source width (${bgWidth}px, asked for ${backgroundWidth}px).\n` +
        `        A spherical backdrop is magnified by the camera's field of view: at ${bgWidth}px\n` +
        `        only ${Math.round((bgWidth * 62) / 360)}px of it span the whole canvas, so it will read as soft.\n` +
        `        Prep from the 4K HDR or EXR instead of the 1K one.`,
    );
  const backdrop = downsample(image, bgWidth);
  const k = forcedHeadroom ?? headroom(image);
  const jpg = encodeBackdrop(backdrop, { headroom: k, quality });

  const meta = {
    backgroundIntensity: k,
    source: basename(source),
    credit,
    license,
    light: { width: light.width, height: light.height },
    background: { width: backdrop.width, height: backdrop.height, quality },
    generated: new Date().toISOString(),
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "light.hdr"), hdr);
  await writeFile(join(outDir, "bg.jpg"), jpg);
  await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
  log(`light.hdr ${light.width}x${light.height} ${mb(hdr.length)}`);
  log(`bg.jpg    ${backdrop.width}x${backdrop.height} ${mb(jpg.length)} (headroom ${k})`);
  return { meta, bytes: { light: hdr.length, background: jpg.length } };
}

const USAGE = `Usage: node tools/hdri-prep.mjs <source.hdr|source.exr> <preset> [options]

  --light <px>      width of light.hdr           (default ${DEFAULTS.lightWidth})
  --bg <px>         width of bg.jpg              (default ${DEFAULTS.backgroundWidth})
  --quality <1-100> JPEG quality                 (default ${DEFAULTS.quality})
  --headroom <n>    override the measured backdrop headroom
  --credit <text>   asset name and author, recorded in meta.json
  --license <text>  asset licence                (default ${DEFAULTS.license})
  --out <dir>       output directory             (default public/assets/hdri/<preset>)

Presets that take assets: warehouse, artfair, home.`;

export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const value = argv[++i];
    if (value === undefined) throw new Error(`--${key} needs a value`);
    options[key] = value;
  }
  const [source, preset] = positional;
  if (!source || !preset) throw new Error(USAGE);
  const number = (key, fallback) => (options[key] === undefined ? fallback : Number(options[key]));
  return {
    source,
    outDir: options.out || join("public", "assets", "hdri", preset),
    lightWidth: number("light", DEFAULTS.lightWidth),
    backgroundWidth: number("bg", DEFAULTS.backgroundWidth),
    quality: number("quality", DEFAULTS.quality),
    headroom: options.headroom === undefined ? undefined : Number(options.headroom),
    credit: options.credit || "",
    license: options.license || DEFAULTS.license,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await prepare({ ...parseArgs(process.argv.slice(2)), log: (line) => console.log(line) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
