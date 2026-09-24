export const DEFAULT_IMAGE_EDITS = Object.freeze({
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
});

const finite = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function normalizeImageEdits(value = {}) {
  value = value && typeof value === "object" ? value : {};
  return {
    exposure: finite(value.exposure, -2, 2) ? value.exposure : 0,
    contrast: finite(value.contrast, -100, 100) ? value.contrast : 0,
    saturation: finite(value.saturation, -100, 100) ? value.saturation : 0,
    temperature: finite(value.temperature, -100, 100) ? value.temperature : 0,
    tint: finite(value.tint, -100, 100) ? value.tint : 0,
    rotation: [0, 90, 180, 270].includes(value.rotation) ? value.rotation : 0,
    flipX: value.flipX === true,
    flipY: value.flipY === true,
  };
}

export function validImageEdits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = normalizeImageEdits(value);
  return (
    finite(value.exposure, -2, 2) &&
    finite(value.contrast, -100, 100) &&
    finite(value.saturation, -100, 100) &&
    finite(value.temperature, -100, 100) &&
    finite(value.tint, -100, 100) &&
    e.rotation === value.rotation &&
    typeof value.flipX === "boolean" &&
    typeof value.flipY === "boolean"
  );
}

export function hasImageEdits(value) {
  const e = normalizeImageEdits(value);
  return Object.keys(DEFAULT_IMAGE_EDITS).some((key) => e[key] !== DEFAULT_IMAGE_EDITS[key]);
}

export function editedAspect(asset, value) {
  const e = normalizeImageEdits(value);
  return e.rotation % 180 ? asset.height / asset.width : asset.width / asset.height;
}

export function applyImageEdits(source, value) {
  const e = normalizeImageEdits(value);
  const sideways = e.rotation % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? source.height : source.width;
  canvas.height = sideways ? source.width : source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((e.rotation * Math.PI) / 180);
  ctx.scale(e.flipX ? -1 : 1, e.flipY ? -1 : 1);
  ctx.filter = [
    `brightness(${Math.pow(2, e.exposure) * 100}%)`,
    `contrast(${100 + e.contrast}%)`,
    `saturate(${100 + e.saturation}%)`,
  ].join(" ");
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.restore();

  if (e.temperature || e.tint) {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const warm = e.temperature * 0.55;
    const tint = e.tint * 0.38;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] + warm + Math.max(0, tint) * 0.35));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] - tint));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] - warm + Math.max(0, tint) * 0.35));
    }
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}
