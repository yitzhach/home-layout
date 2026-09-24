// Smart guides: SketchUp's inference, for a work dragged along its wall.
//
// While a work is dragged with Snap on, its edges and centre look for
// something worth lining up with — another work's edge or centre on the same
// wall, the wall's own centre and edges, the 60″ hang line — and, within
// `SNAP_RANGE`, jump to it. It also looks for the spot that leaves equal gaps
// to the neighbours either side. What it snapped to comes back as guide lines
// and gap readouts for the scene to draw, so the reason the work jumped is on
// screen while it happens.
//
// Pure: a placement is the left edge `x` and bottom edge `y` in inches on its
// wall with `w` × `h` its size, and a wall is `{ width, height }` — the same
// terms as src/arrange.js. The scene turns the answer into lines.
import { HANG_LINE } from "./arrange.js";

/** How close, in inches, an edge has to come before it snaps. */
export const SNAP_RANGE = 2;

const EPS = 1e-6;

/** The best snap on one axis, or null: the smallest move within range. */
function bestSnap(anchors, targets, range) {
  let best = null;
  for (const anchor of anchors)
    for (const target of targets) {
      const delta = target.at - anchor.at;
      if (Math.abs(delta) > range + EPS) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta) - EPS) best = { delta, anchor, target };
    }
  return best;
}

/**
 * Snap a dragged work to the works around it and to its wall.
 *
 * `a` is where the drag has put the work, `others` the works on the same face
 * of the same wall (not including `a`), `wall` that wall's size. Returns the
 * snapped `{ x, y }`, the `guides` to draw — each `{ axis, at, from, to }` in
 * wall inches, a vertical line at `x = at` for axis "x" — and the `gaps` to
 * label, each `{ from, to, at, inches }` along x at height `at`.
 */
export function smartSnap(a, others, wall, range = SNAP_RANGE) {
  const ownX = [
    { at: a.x, name: "left" },
    { at: a.x + a.w / 2, name: "centre" },
    { at: a.x + a.w, name: "right" },
  ];
  const ownY = [
    { at: a.y, name: "bottom" },
    { at: a.y + a.h / 2, name: "middle" },
    { at: a.y + a.h, name: "top" },
  ];
  const targetsX = [
    { at: wall.width / 2, from: 0, to: wall.height, kind: "wall" },
    { at: 0, from: 0, to: wall.height, kind: "wall" },
    { at: wall.width, from: 0, to: wall.height, kind: "wall" },
  ];
  const targetsY = [];
  for (const b of others) {
    const span = [Math.min(a.y, b.y), Math.max(a.y + a.h, b.y + b.h)];
    for (const at of [b.x, b.x + b.w / 2, b.x + b.w]) targetsX.push({ at, from: span[0], to: span[1], kind: "work" });
    const across = [Math.min(a.x, b.x), Math.max(a.x + a.w, b.x + b.w)];
    for (const at of [b.y, b.y + b.h / 2, b.y + b.h]) targetsY.push({ at, from: across[0], to: across[1], kind: "work" });
  }

  // Equal gaps: the neighbours either side on this wall, by where their
  // edges fall, and the spot that splits the space between them evenly.
  const left = others.filter((b) => b.x + b.w <= a.x + a.w / 2).sort((p, q) => q.x + q.w - (p.x + p.w))[0];
  const right = others.filter((b) => b.x >= a.x + a.w / 2).sort((p, q) => p.x - q.x)[0];
  let equal = null;
  if (left && right) {
    const room = right.x - (left.x + left.w) - a.w;
    if (room >= 0) {
      const x = left.x + left.w + room / 2;
      if (Math.abs(x - a.x) <= range + EPS) equal = { delta: x - a.x, gap: room / 2 };
    }
  }

  let x = a.x;
  const guides = [];
  const gaps = [];
  const sx = bestSnap(ownX, targetsX, range);
  if (equal && (!sx || Math.abs(equal.delta) <= Math.abs(sx.delta) + EPS)) {
    x = a.x + equal.delta;
    const at = Math.max(a.y, left.y, right.y) > Math.min(a.y + a.h, left.y + left.h, right.y + right.h)
      ? a.y + a.h / 2
      : (Math.max(a.y, left.y, right.y) + Math.min(a.y + a.h, left.y + left.h, right.y + right.h)) / 2;
    gaps.push({ from: left.x + left.w, to: x, at, inches: round(equal.gap) });
    gaps.push({ from: x + a.w, to: right.x, at, inches: round(equal.gap) });
  } else if (sx) {
    x = a.x + sx.delta;
    guides.push({ axis: "x", at: sx.target.at, from: sx.target.from, to: sx.target.to, kind: sx.target.kind });
  }

  let y = a.y;
  // The hang line is a centre, never an edge: a work's top on 60″ is not
  // hung at 60″.
  const hang = { at: HANG_LINE, from: 0, to: wall.width, kind: "hang" };
  const sy = bestSnap(ownY, targetsY, range);
  const toHang = Math.abs(HANG_LINE - (a.y + a.h / 2)) <= range + EPS ? HANG_LINE - (a.y + a.h / 2) : null;
  if (toHang !== null && (!sy || Math.abs(toHang) <= Math.abs(sy.delta) + EPS)) {
    y = a.y + toHang;
    guides.push({ axis: "y", ...hang });
  } else if (sy) {
    y = a.y + sy.delta;
    guides.push({ axis: "y", at: sy.target.at, from: sy.target.from, to: sy.target.to, kind: sy.target.kind });
  }
  return { x: round(x), y: round(y), guides, gaps };
}

const round = (n) => Math.round(n * 100) / 100;
