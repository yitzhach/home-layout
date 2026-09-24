#!/usr/bin/env node
// Turns an ambientCG download into the texture set a ground surface expects.
//
//   node tools/texture-prep.mjs ~/Downloads/Concrete034_1K-JPG concrete
//
// ambientCG ships one zip per material, named like `Concrete034_1K_Color.jpg`,
// `Concrete034_1K_NormalGL.jpg`, `_Roughness`, `_AmbientOcclusion`. Unzip it
// and point this at the folder: it picks the four maps out, copies them under
// the names the app looks for, and writes the meta.json that records the
// real-world tile size, the normal-map convention and the credit.
//
// Copying, not re-encoding, is the default and the fast path: a 1K JPG from
// ambientCG is already the right size and re-compressing it would only lose
// detail. Resampling (`--size`) decodes and re-encodes, and is offered for JPEG
// sources only — for a PNG set, download the resolution you want instead.
//
// Why the tile size matters: `repeat` on the 180 m ground plane is derived from
// it, so a 2 m concrete slab and a 2 m patch of grass come out the same size as
// each other. Getting it wrong is the difference between a floor and a texture.
import { readdir, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import jpeg from "jpeg-js";

export const DEFAULTS = {
  tileMetres: 2,
  quality: 92,
  license: "CC0",
};

// slot → the patterns that name it, most preferred first. The ambientCG names
// come first; the plain ones let a hand-assembled folder work too.
const PATTERNS = {
  map: [/_color\b/i, /^color\./i],
  normalMap: [/_normalgl\b/i, /_normal\b/i, /^normal\./i, /_normaldx\b/i],
  roughnessMap: [/_roughness\b/i, /^rough(ness)?\./i],
  aoMap: [/_ambientocclusion\b/i, /_ao\b/i, /^ao\./i],
};
export const OUT_NAMES = { map: "color", normalMap: "normal", roughnessMap: "rough", aoMap: "ao" };
const IMAGE = /\.(jpe?g|png|webp)$/i;

// Which file fills which slot. Returns the chosen names plus anything left
// over, because a set missing its roughness map is worth saying out loud.
export function classify(files) {
  const images = files.filter((name) => IMAGE.test(name));
  const chosen = {};
  const used = new Set();
  for (const [slot, patterns] of Object.entries(PATTERNS))
    for (const pattern of patterns) {
      if (chosen[slot]) break;
      const match = images.find((name) => pattern.test(name) && !used.has(name));
      if (match) {
        chosen[slot] = match;
        used.add(match);
      }
    }
  return {
    chosen,
    // A DX normal map is not wrong, it just needs its green channel read the
    // other way round, which the app does through normalScale.
    normalConvention: chosen.normalMap && /_normaldx\b/i.test(chosen.normalMap) ? "DX" : "GL",
    missing: Object.keys(PATTERNS).filter((slot) => !chosen[slot]),
    ignored: images.filter((name) => !used.has(name)),
  };
}

// Area-average box filter over 8-bit RGBA, the same shape of resampling
// tools/hdri-prep.mjs does in float.
export function resizeRGBA({ data, width, height }, targetWidth) {
  const w = Math.max(1, Math.round(targetWidth));
  if (w >= width) return { data, width, height };
  const h = Math.max(1, Math.round((height * w) / width));
  const out = Buffer.alloc(w * h * 4);
  const sx = width / w,
    sy = height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy),
      y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx),
        x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = y0; j < y1; j++)
        for (let i = x0; i < x1; i++) {
          const o = (j * width + i) * 4;
          r += data[o]; g += data[o + 1]; b += data[o + 2]; a += data[o + 3];
          n++;
        }
      const o = (y * w + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { data: out, width: w, height: h };
}

export function resampleJPEG(buffer, targetWidth, quality = DEFAULTS.quality) {
  const decoded = jpeg.decode(buffer, { useTArray: true });
  const resized = resizeRGBA(decoded, targetWidth);
  return {
    buffer: Buffer.from(jpeg.encode({ data: Buffer.from(resized.data), width: resized.width, height: resized.height }, quality).data),
    width: resized.width,
    height: resized.height,
  };
}

const isJPEG = (name) => /\.jpe?g$/i.test(name);

// JPEG dimensions without decoding the whole image: walk the segment markers
// to the frame header. Enough to report the set's size and to catch a set whose
// maps were downloaded at different resolutions.
export function jpegSize(buffer) {
  let i = 2;
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) { i++; continue; }
    const marker = buffer[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

export async function prepare({
  source,
  outDir,
  size,
  tileMetres = DEFAULTS.tileMetres,
  quality = DEFAULTS.quality,
  credit = "",
  license = DEFAULTS.license,
  log = () => {},
}) {
  const entries = await readdir(source);
  const { chosen, normalConvention, missing, ignored } = classify(entries);
  if (!chosen.map) throw new Error(`${source}: no colour map found (expected something like *_Color.jpg)`);
  if (missing.length) log(`missing, and simply not applied: ${missing.join(", ")}`);
  if (ignored.length) log(`ignored: ${ignored.join(", ")}`);
  if (normalConvention === "DX") log("normal map is DirectX-handed; meta.json records it so the app can flip it");

  await mkdir(outDir, { recursive: true });
  const files = {};
  const sizes = new Set();
  for (const [slot, name] of Object.entries(chosen)) {
    const buffer = await readFile(join(source, name));
    const resampling = size && isJPEG(name);
    if (size && !resampling)
      throw new Error(`${name}: resampling is JPEG-only — download the size you want, or drop --size`);
    const out = `${OUT_NAMES[slot]}${resampling ? ".jpg" : extname(name).toLowerCase()}`;
    if (resampling) {
      const { buffer: encoded, width, height } = resampleJPEG(buffer, size, quality);
      await writeFile(join(outDir, out), encoded);
      sizes.add(`${width}x${height}`);
      log(`${out} ${width}x${height} ${(encoded.length / 1e3).toFixed(0)} kB (resampled from ${name})`);
    } else {
      await copyFile(join(source, name), join(outDir, out));
      const measured = isJPEG(name) ? jpegSize(buffer) : null;
      if (measured) sizes.add(`${measured.width}x${measured.height}`);
      log(`${out} ${measured ? `${measured.width}x${measured.height} ` : ""}${(buffer.length / 1e3).toFixed(0)} kB (copied from ${name})`);
    }
    files[slot] = out;
  }
  if (sizes.size > 1) log(`WARNING: the maps are not all the same size (${[...sizes].join(", ")})`);

  const meta = {
    tileMetres,
    files,
    normalMap: normalConvention,
    credit,
    license,
    source: basename(source),
    generated: new Date().toISOString(),
  };
  await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  log(`tile ${tileMetres} m → repeat ${(180 / tileMetres).toFixed(1)} across the ground plane`);
  return { meta, missing, ignored };
}

const USAGE = `Usage: node tools/texture-prep.mjs <ambientCG-folder> <ground-kind> [options]

  --tile <metres>   real-world size of one tile (default ${DEFAULTS.tileMetres}; ambientCG lists it)
  --size <px>       resample to this width, JPEG sources only
  --quality <1-100> re-encode quality when resampling (default ${DEFAULTS.quality})
  --credit <text>   asset name and author, recorded in meta.json
  --license <text>  asset licence (default ${DEFAULTS.license})
  --out <dir>       output directory (default public/assets/textures/<ground-kind>)

Ground kinds that take a texture set: grass, concrete, asphalt, carpet, wood.`;

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
  const [source, kind] = positional;
  if (!source || !kind) throw new Error(USAGE);
  return {
    source,
    outDir: options.out || join("public", "assets", "textures", kind),
    size: options.size === undefined ? undefined : Number(options.size),
    tileMetres: options.tile === undefined ? DEFAULTS.tileMetres : Number(options.tile),
    quality: options.quality === undefined ? DEFAULTS.quality : Number(options.quality),
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
