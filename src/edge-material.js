import * as T from "three";

// Neutral procedural maps keep the chosen pigment independent of the texture.
const maps = new Map();
/**
 * `color` is passed in rather than read off the placement, because a booth can
 * hold one universal edge colour for every work in it. `edgeColorOf()` in
 * model.js is the one place that decides which of the two is showing.
 */
export function edgeMaterial(art, color) {
  const kind = art.edgeTexture || "plain";
  const material = new T.MeshStandardMaterial({
    color: color || art.edgeColor || "#b7a68b",
    roughness: kind === "metal" ? .32 : kind === "wood" ? .72 : .92,
    metalness: kind === "metal" ? .8 : 0,
  });
  if (kind === "plain") return material;
  if (!maps.has(kind)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const noise = ((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1 + 1) % 1;
      const grain = Math.sin(y * .65 + Math.sin(x * .024) * 3);
      const v = kind === "wood" ? 205 + grain * 32 + noise * 14
        : kind === "metal" ? 218 + Math.sin(y * 3.7) * 18 + noise * 10
        : 195 + noise * 55;
      const i = (y * 256 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const map = new T.CanvasTexture(canvas);
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.colorSpace = T.SRGBColorSpace;
    maps.set(kind, map);
  }
  material.map = maps.get(kind);
  material.bumpMap = material.map;
  material.bumpScale = kind === "concrete" ? .002 : .0006;
  return material;
}
