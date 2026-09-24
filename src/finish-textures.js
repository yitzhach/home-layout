// The patterns finishes are drawn with when no photograph of them is on disk.
//
// One canvas per kind and colour, drawn once and shared: a tile of the pattern
// in the chosen colour — planks with their joints and a little grain, tiles
// with their grout, a running bond of brick — at the size `FINISH_KINDS` gives
// its tile. Every surface that uses it takes a clone, because `repeat` lives
// on the texture and each wall piece is its own size (see src/surfaces.js for
// the same rule on the ground).
//
// Deliberately quiet. These are there to say "tile" or "oak" at a glance under
// the art, not to compete with it; the owner's own photographs of real
// surfaces replace them when the files are there.
import * as T from "three";

const cache = new Map();
const SIZE = 256;

/** A seeded random, so the same finish draws the same grain every time. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

function draw(kind, color) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d"),
    rand = rng(kind.length * 7919 + parseInt(color.slice(1), 16));
  g.fillStyle = color;
  g.fillRect(0, 0, SIZE, SIZE);
  const speckle = (n, amount, size = 2) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(color, (rand() - 0.5) * amount);
      g.fillRect(rand() * SIZE, rand() * SIZE, size, size);
    }
  };
  if (kind === "wood" || kind === "panel") {
    // Planks 6″ wide on a 48″ tile (32px), each its own tone, with grain
    // lines and staggered end joints; panelling runs the same boards upright.
    const boards = 8,
      bw = SIZE / boards;
    for (let i = 0; i < boards; i++) {
      g.fillStyle = shade(color, (rand() - 0.5) * 0.18);
      g.fillRect(0, i * bw, SIZE, bw);
      g.strokeStyle = shade(color, -0.12);
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const y = i * bw + 3 + rand() * (bw - 6);
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= SIZE; x += 32) g.lineTo(x, y + (rand() - 0.5) * 2);
        g.globalAlpha = 0.35;
        g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = shade(color, -0.35);
      g.fillRect(0, i * bw, SIZE, 1.5);
      if (kind === "wood") g.fillRect(((i * 3) % 4) * (SIZE / 4) + rand() * 20, i * bw, 2, bw);
    }
    if (kind === "panel") {
      // Turn the boards upright: panelling runs floor to ceiling.
      const u = document.createElement("canvas");
      u.width = u.height = SIZE;
      const ug = u.getContext("2d");
      ug.translate(SIZE / 2, SIZE / 2);
      ug.rotate(Math.PI / 2);
      ug.drawImage(c, -SIZE / 2, -SIZE / 2);
      return u;
    }
  } else if (kind === "tile") {
    // 12″ tiles on a 24″ tile: two by two, 1/8″ grout.
    const n = 2,
      t = SIZE / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = shade(color, (rand() - 0.5) * 0.06);
        g.fillRect(i * t, j * t, t, t);
      }
    speckle(400, 0.06);
    g.fillStyle = shade(color, -0.22);
    for (let i = 0; i < n; i++) {
      g.fillRect(i * t, 0, 3, SIZE);
      g.fillRect(0, i * t, SIZE, 3);
    }
  } else if (kind === "stone") {
    // Large slabs, 24″ × 48″, with soft veining.
    speckle(1400, 0.14, 3);
    g.strokeStyle = shade(color, -0.2);
    g.globalAlpha = 0.25;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      let x = rand() * SIZE,
        y = 0;
      g.moveTo(x, y);
      while (y < SIZE) g.lineTo((x += (rand() - 0.5) * 30), (y += 16));
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = shade(color, -0.25);
    g.fillRect(0, 0, SIZE, 2);
    g.fillRect(0, SIZE / 2, SIZE, 2);
    g.fillRect(0, 0, 2, SIZE);
  } else if (kind === "carpet") {
    speckle(9000, 0.22, 1.5);
  } else if (kind === "concrete") {
    speckle(5000, 0.12, 2);
    speckle(200, 0.2, 5);
  } else if (kind === "brick") {
    // 8″ × 2⅔″ brick with ⅜″ mortar, running bond: 4 courses of 4 on 32″.
    const courses = 12,
      ch = SIZE / courses,
      bw = SIZE / 4;
    g.fillStyle = shade(color, 0.55);
    g.fillRect(0, 0, SIZE, SIZE);
    for (let r = 0; r < courses; r++)
      for (let i = -1; i < 5; i++) {
        g.fillStyle = shade(color, (rand() - 0.5) * 0.25);
        const x = i * bw + (r % 2 ? bw / 2 : 0);
        g.fillRect(x + 2, r * ch + 2, bw - 4, ch - 4);
      }
  } else {
    // Paint: a faint roller texture, nothing more.
    speckle(1200, 0.03, 2);
  }
  return c;
}

/** The procedural texture for a kind in a colour. Shared; clone before setting repeat. */
export function finishTexture(kind, color) {
  const key = kind + color;
  if (!cache.has(key)) {
    const tex = new T.CanvasTexture(draw(kind, color));
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(key, tex);
  }
  return cache.get(key);
}
