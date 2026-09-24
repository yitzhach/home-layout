// Align and distribute: several works on one wall, lined up in one press.
//
// Pure, in the terms of src/arrange.js: a placement is its left edge `x` and
// bottom edge `y` in inches on its wall, `w` × `h` its size. Every function
// returns `{ id: { x } }` or `{ id: { y } }` — only the coordinate it moves —
// so the caller constrains and writes back exactly what changed.

export const ALIGN_MODES = {
  left: "Align left edges",
  center: "Align centres",
  right: "Align right edges",
  top: "Align tops",
  middle: "Align middles",
  bottom: "Align bottoms",
};

/**
 * Line works up on one edge or centre of the box they make together — the
 * way Illustrator and SketchUp both do it, so the works that already sit on
 * that line stay put.
 */
export function alignWorks(works, mode) {
  if (works.length < 2 || !ALIGN_MODES[mode]) return {};
  const left = Math.min(...works.map((a) => a.x));
  const right = Math.max(...works.map((a) => a.x + a.w));
  const bottom = Math.min(...works.map((a) => a.y));
  const top = Math.max(...works.map((a) => a.y + a.h));
  const out = {};
  for (const a of works) {
    if (mode === "left") out[a.id] = { x: left };
    if (mode === "right") out[a.id] = { x: right - a.w };
    if (mode === "center") out[a.id] = { x: (left + right) / 2 - a.w / 2 };
    if (mode === "bottom") out[a.id] = { y: bottom };
    if (mode === "top") out[a.id] = { y: top - a.h };
    if (mode === "middle") out[a.id] = { y: (bottom + top) / 2 - a.h / 2 };
    for (const k of Object.keys(out[a.id])) out[a.id][k] = round(out[a.id][k]);
  }
  return out;
}

/**
 * Equal gaps between the works, keeping the two outermost where they are:
 * distributing is about the space between, not about moving the ends. Needs
 * three works — with two there is only one gap and nothing to equalise.
 */
export function distributeWorks(works, axis = "x") {
  if (works.length < 3) return {};
  const pos = axis === "x" ? "x" : "y",
    size = axis === "x" ? "w" : "h";
  const sorted = [...works].sort((a, b) => a[pos] + a[size] / 2 - (b[pos] + b[size] / 2));
  const first = sorted[0],
    last = sorted[sorted.length - 1];
  const span = last[pos] + last[size] - first[pos];
  const total = sorted.reduce((sum, a) => sum + a[size], 0);
  const gap = (span - total) / (sorted.length - 1);
  const out = {};
  let at = first[pos];
  for (const a of sorted) {
    out[a.id] = { [pos]: round(at) };
    at += a[size] + gap;
  }
  return out;
}

const round = (n) => Math.round(n * 100) / 100;
