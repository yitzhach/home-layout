// Drawing the floor materials of finishes.js.
//
// Each material is a small canvas pattern, drawn once per material and colour
// and shared by every floor that uses it; a floor takes a clone so it can set
// its own repeat, the way surfaces.js hands out ground sets. The patterns are
// deliberately plain — boards with a grain line, grouted tile, a veined stone
// — because they are there to read as what the floor is from across a room,
// and to be replaced by a real photograph when one is supplied.
//
// A photograph for a material lives at `assets/materials/<id>/color.jpg`.
// Whether it is there is asked once per session with a HEAD request, since
// both the dev server and the Worker answer a missing file with the app shell
// and a 200; until the answer comes back, and whenever it is no, the
// procedural pattern is what is drawn.
import * as T from "three";
import { FLOOR_FINISHES } from "./finishes.js";

const SIZE = 256;
const cache = new Map();

// A tiny seeded generator, so a floor looks the same on every rebuild.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function paint(g, pattern, color) {
  const r = rng(pattern.length * 97 + parseInt(color.slice(1), 16));
  g.fillStyle = color;
  g.fillRect(0, 0, SIZE, SIZE);
  if (pattern === "boards") {
    // Six boards across one repeat, butt joints staggered along each.
    const bw = SIZE / 6;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = shade(color, (r() - 0.5) * 0.12);
      g.fillRect(i * bw, 0, bw, SIZE);
      g.strokeStyle = shade(color, -0.06);
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const x = i * bw + 4 + r() * (bw - 8);
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 6, SIZE / 3, x + (r() - 0.5) * 6, (2 * SIZE) / 3, x, SIZE);
        g.stroke();
      }
      g.fillStyle = shade(color, -0.22);
      g.fillRect(i * bw, 0, 1.5, SIZE);
      const joint = (i * 0.37 + r() * 0.2) % 1;
      g.fillRect(i * bw, joint * SIZE, bw, 1.5);
    }
  } else if (pattern === "herringbone") {
    const u = SIZE / 8;
    for (let y = -2; y < 10; y++)
      for (let x = -2; x < 10; x++) {
        g.save();
        g.translate(x * u * 2 + (y % 2) * u, y * u);
        g.rotate(((x + y) % 2 ? 1 : -1) * Math.PI / 4);
        g.fillStyle = shade(color, (r() - 0.5) * 0.14);
        g.fillRect(0, 0, u * 2, u * 0.7);
        g.strokeStyle = shade(color, -0.2);
        g.strokeRect(0, 0, u * 2, u * 0.7);
        g.restore();
      }
  } else if (pattern === "tile" || pattern === "mosaic" || pattern === "checker") {
    const n = pattern === "mosaic" ? 6 : 2,
      t = SIZE / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = pattern === "checker" && (x + y) % 2 ? "#26282b" : shade(color, (r() - 0.5) * 0.05);
        g.fillRect(x * t, y * t, t, t);
      }
    g.fillStyle = pattern === "checker" ? "#8c8a86" : shade(color, -0.16);
    const grout = pattern === "mosaic" ? 2 : 3;
    for (let i = 0; i <= n; i++) {
      g.fillRect(i * t - grout / 2, 0, grout, SIZE);
      g.fillRect(0, i * t - grout / 2, SIZE, grout);
    }
  } else if (pattern === "marble") {
    g.lineCap = "round";
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = shade(color, -0.1 - r() * 0.12);
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      let x = r() * SIZE,
        y = 0;
      g.moveTo(x, y);
      while (y < SIZE) {
        x += (r() - 0.5) * 30;
        y += 12 + r() * 20;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = shade(color, -0.1);
    g.fillRect(0, 0, SIZE, 1);
    g.fillRect(0, 0, 1, SIZE);
  } else if (pattern === "speckle") {
    for (let k = 0; k < 2600; k++) {
      g.fillStyle = shade(color, (r() - 0.5) * 0.18);
      g.fillRect(r() * SIZE, r() * SIZE, 1.5, 1.5);
    }
  }
}

/** The shared procedural texture of one material in one colour. */
export function floorTexture(id, color) {
  const key = id + color;
  if (cache.has(key)) return cache.get(key);
  const spec = FLOOR_FINISHES[id] || FLOOR_FINISHES.oak;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  paint(c.getContext("2d"), spec.pattern, color);
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// id → Promise<Texture|null>: a supplied photograph, asked for once.
const photos = new Map();
export function floorPhoto(id) {
  if (!FLOOR_FINISHES[id]) return Promise.resolve(null);
  if (!photos.has(id)) {
    const url = `assets/materials/${id}/color.jpg`;
    photos.set(
      id,
      fetch(url, { method: "HEAD" })
        .then((res) => {
          if (!res.ok || (res.headers.get("content-type") || "").includes("text/html")) return null;
          return new T.TextureLoader().loadAsync(url).then((t) => {
            t.wrapS = t.wrapT = T.RepeatWrapping;
            t.colorSpace = T.SRGBColorSpace;
            t.anisotropy = 8;
            return t;
          });
        })
        .catch(() => null),
    );
  }
  return photos.get(id);
}
