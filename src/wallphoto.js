// Wall photos: phase 3.
//
// Someone photographs a real wall, taps its four corners in the photo and
// types how wide (and how tall) that stretch of wall really is. The photo is
// straightened — the quadrilateral the four taps make is mapped back to a
// rectangle — and laid on the room's wall at that size, so art hung on the
// wall is seen against the real one, to scale.
//
// A wall photo belongs to a room and a side, `room.wallPhotos[side]`, optional
// like every record in schema 1:
//   { asset, corners: [[x, y] ×4], x, y, width, height }
// `asset` is an ordinary image asset (role "wall") holding the photo as it
// was taken; `corners` are fractions of its width and height, top-left,
// top-right, bottom-right, bottom-left; `x`/`y` put the rectangle's
// bottom-left on the side, in inches from its left end (seen from inside) and
// from the floor; `width`/`height` are the inches the user typed. The original
// is kept and the straightening is done when the wall is drawn, so the corners
// can be moved again later without having lost anything.
//
// Keyed by side, not by wall piece: the room's side is what someone stands in
// front of and photographs, whichever room happens to own the wall slab on
// that line. The photo is drawn on the face that looks into this room, and
// doors, windows and archways on that line — typed in either room — cut it.
//
// Everything here is pure; the one function that touches pixels works on a
// plain RGBA array, so the straightening is tested without a browser.
import { homography, convex } from "./model.js";
import { SIDES, homeRooms, roomEdge, wallOpenings, wallPieces } from "./rooms.js";

export const WALL_PHOTO_MAX = 1024;
export const DEFAULT_CORNERS = [
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
];

const fin = (n, lo, hi) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;

export const wallPhotos = (r) => (r?.wallPhotos && typeof r.wallPhotos === "object" && !Array.isArray(r.wallPhotos) ? r.wallPhotos : {});

/** A new wall photo covering the whole side, floor to ceiling. */
export function newWallPhoto(r, side, asset, fields = {}) {
  return { asset, corners: DEFAULT_CORNERS.map((c) => [...c]), x: 0, y: 0, width: roomEdge(r, side).length, height: r.height, ...fields };
}

/**
 * The corners are usable: four points inside the photo making a convex
 * quadrilateral, in order round it. Either winding is accepted — a photo
 * shows the wall the way up it was taken.
 */
export function goodCorners(q) {
  if (!Array.isArray(q) || q.length !== 4) return false;
  if (!q.every((c) => Array.isArray(c) && c.length === 2 && c.every((n) => fin(n, 0, 1)))) return false;
  return convex(q) || convex([...q].reverse());
}

export function validWallPhotos(wp, assets = {}) {
  if (wp === undefined) return true;
  if (!wp || typeof wp !== "object" || Array.isArray(wp)) return false;
  for (const [side, ph] of Object.entries(wp)) {
    if (!SIDES.includes(side) || !ph || typeof ph !== "object") return false;
    if (typeof ph.asset !== "string" || !assets[ph.asset]) return false;
    if (!goodCorners(ph.corners)) return false;
    if (!fin(ph.x, 0, 1200) || !fin(ph.y, 0, 240) || !fin(ph.width, 6, 1200) || !fin(ph.height, 6, 240)) return false;
  }
  return true;
}

/** A room's side as the virtual wall `wallOpenings` measures against. */
export function sideWall(r, side) {
  const e = roomEdge(r, side);
  return { axis: e.axis, at: e.at, origin: e.origin, dir: e.dir, width: e.length, height: r.height, rotation: e.rotation };
}

/**
 * Where on the side the photo is drawn: its rectangle clipped to the side,
 * cut into the solid pieces the side's openings leave, each with the part of
 * the photo it shows as u0..u1, v0..v1 (0 at the rectangle's left and bottom).
 * Inches, in the side's own frame: x from its left end seen from inside, y up
 * from the floor.
 */
export function photoPieces(p, r, side, ph) {
  const wall = sideWall(r, side);
  const x0 = Math.max(0, ph.x),
    y0 = Math.max(0, ph.y),
    x1 = Math.min(wall.width, ph.x + ph.width),
    y1 = Math.min(wall.height, ph.y + ph.height);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return [];
  const out = [];
  for (const s of wallPieces(wall.width, wall.height, wallOpenings(p, wall))) {
    const a = Math.max(x0, s.x),
      b = Math.min(x1, s.x + s.w),
      c = Math.max(y0, s.y),
      d = Math.min(y1, s.y + s.h);
    if (b - a < 0.25 || d - c < 0.25) continue;
    out.push({
      x: a,
      y: c,
      w: b - a,
      h: d - c,
      u0: (a - ph.x) / ph.width,
      u1: (b - ph.x) / ph.width,
      v0: (c - ph.y) / ph.height,
      v1: (d - ph.y) / ph.height,
    });
  }
  return out;
}

/** Every room's photos that are drawn, for the scene. */
export const allWallPhotos = (p) =>
  homeRooms(p).flatMap((r) =>
    Object.entries(wallPhotos(r))
      // A side opened up has no wall to hang a photo on; the photo stays in
      // the record and comes back if the wall does.
      .filter(([side]) => !(r.open || []).includes(side))
      .map(([side, ph]) => ({ room: r, side, photo: ph })),
  );

/**
 * The size the straightened picture is made at: the real rectangle's shape,
 * its longer side WALL_PHOTO_MAX pixels, but never more pixels across the
 * photo's own corners than the photo had — enlarging only blurs.
 */
export function straightSize(ph, srcW, srcH, max = WALL_PHOTO_MAX) {
  const q = ph.corners.map(([x, y]) => [x * srcW, y * srcH]);
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const across = Math.max(len(q[0], q[1]), len(q[3], q[2]), len(q[0], q[3]), len(q[1], q[2]));
  const long = Math.max(16, Math.min(max, Math.round(across)));
  const ratio = ph.width / ph.height;
  return ratio >= 1 ? { width: long, height: Math.max(1, Math.round(long / ratio)) } : { width: Math.max(1, Math.round(long * ratio)), height: long };
}

/**
 * Straighten: for every pixel of the `ow`×`oh` output, where it falls in the
 * source through the corners' homography, sampled bilinearly. `src` is RGBA
 * (an ImageData's `data`), the output is a new Uint8ClampedArray, top row
 * first as a canvas wants it.
 */
export function straighten(src, sw, sh, corners, ow, oh) {
  const f = homography(corners.map(([x, y]) => [x * (sw - 1), y * (sh - 1)]));
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let j = 0; j < oh; j++) {
    const v = oh === 1 ? 0.5 : j / (oh - 1);
    for (let i = 0; i < ow; i++) {
      const u = ow === 1 ? 0.5 : i / (ow - 1);
      let [x, y] = f(u, v);
      x = Math.max(0, Math.min(sw - 1, x));
      y = Math.max(0, Math.min(sh - 1, y));
      const x0 = Math.floor(x),
        y0 = Math.floor(y),
        x1 = Math.min(sw - 1, x0 + 1),
        y1 = Math.min(sh - 1, y0 + 1),
        fx = x - x0,
        fy = y - y0;
      const o = (j * ow + i) * 4,
        a = (y0 * sw + x0) * 4,
        b = (y0 * sw + x1) * 4,
        c = (y1 * sw + x0) * 4,
        d = (y1 * sw + x1) * 4;
      for (let k = 0; k < 4; k++)
        out[o + k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[c + k] * (1 - fx) + src[d + k] * fx) * fy;
    }
  }
  return out;
}
