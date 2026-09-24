// Clearance checks: the booth read the way a fire marshal and a visitor in a
// wheelchair would read it.
//
// Pure. Everything is in inches on the floor plan: X right of the centre of
// the floor, Z toward the entrance — the frame pedestals, panels and lights
// already use. A floor piece is a rectangle turned about its centre; a
// perimeter wall is a thin one along its edge of the booth.
//
// What it reports, each as `{ kind, level, text, ids, from, to, inches }`
// (`from` / `to` are the two nearest points of a gap, for the plan to draw):
// - **overlap**: two floor pieces, or a piece and a wall, standing in each
//   other. Always a problem.
// - **outside**: a floor piece poking past the booth's footprint into the
//   aisle or the next booth.
// - **tight**: a gap between two things that a person would have to walk
//   through, narrower than `ACCESSIBLE` (36″, the accessible route width).
//   Gaps under `TOUCHING` are taken as deliberate — a table pushed against a
//   wall is not a walkway — and are not reported.
// - **art-overlap**: two works hung over each other on the same face of the
//   same wall.
import { boothPanels, boothPedestals, isShown, wallSpec } from "./model.js";
import { sameWall } from "./arrange.js";

/** The accessible route width, in inches (ADA 403.5.1). */
export const ACCESSIBLE = 36;
/** A gap narrower than this is a piece pushed against something, on purpose. */
export const TOUCHING = 4;
/** The thickness a perimeter wall or a free-standing panel is checked at. */
const WALL = 3;

/** The four corners of a rectangle `w` × `d` centred on (x, z), turned `deg`. */
export function corners(x, z, w, d, deg = 0) {
  const r = (deg * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  // Turned the way three turns a group about +Y seen from above: a positive
  // angle takes +X toward -Z.
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** Whether two convex polygons overlap by more than `eps`: separating axes. */
export function overlaps(a, b, eps = 0.01) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      const axis = [q[1] - p[1], p[0] - q[0]];
      const len = Math.hypot(...axis) || 1;
      const n = [axis[0] / len, axis[1] / len];
      const pa = a.map((v) => dot(v, n)),
        pb = b.map((v) => dot(v, n));
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  return true;
}

/** The nearest point on segment p–q to point v. */
function nearestOnSegment(v, p, q) {
  const d = [q[0] - p[0], q[1] - p[1]];
  const t = Math.max(0, Math.min(1, ((v[0] - p[0]) * d[0] + (v[1] - p[1]) * d[1]) / (dot(d, d) || 1)));
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/**
 * The gap between two convex polygons that do not overlap, and the two
 * points it runs between. Vertex-to-edge both ways is exact for polygons.
 */
export function gapBetween(a, b) {
  let best = { inches: Infinity, from: null, to: null };
  for (const [one, two, flip] of [[a, b, false], [b, a, true]])
    for (const v of one)
      for (let i = 0; i < two.length; i++) {
        const n = nearestOnSegment(v, two[i], two[(i + 1) % two.length]);
        const d = Math.hypot(v[0] - n[0], v[1] - n[1]);
        if (d < best.inches) best = { inches: d, from: flip ? n : v, to: flip ? v : n };
      }
  return best;
}

/** Everything that stands on the floor, as named polygons. */
export function floorPieces(p) {
  const b = p.booth;
  const pieces = [];
  boothPedestals(p)
    .filter(isShown)
    .forEach((ped, i) =>
      pieces.push({
        id: "pedestal:" + ped.id,
        name: ped.name || "Pedestal " + (i + 1),
        kind: "piece",
        poly: corners(ped.x, ped.z, ped.width, ped.depth, ped.rotation || 0),
      }),
    );
  boothPanels(p)
    .filter(isShown)
    .forEach((panel, i) =>
      pieces.push({
        id: "panel:" + panel.id,
        name: panel.name || "Panel " + (i + 1),
        kind: "panel",
        poly: corners(panel.x, panel.z, panel.width, WALL, panel.rotation || 0),
      }),
    );
  // The perimeter walls, each standing along its own edge of the footprint.
  const W = b.width,
    D = b.depth;
  const back = wallSpec(p, "back"),
    left = wallSpec(p, "left"),
    right = wallSpec(p, "right");
  // Each wall runs from where scene.wallFrame stands it: the back wall from
  // the left corner, the left wall from the front, the right from the back.
  // Checked just outside the footprint's edge, so a piece standing flush
  // against a wall — inside the booth, as constrainPedestal keeps it — is
  // touching it rather than standing in it.
  if (back?.enabled) pieces.push({ id: "wall:back", name: "Back wall", kind: "wall", poly: corners(-W / 2 + back.width / 2, -D / 2 - WALL / 2, back.width, WALL) });
  if (left?.enabled) pieces.push({ id: "wall:left", name: "Left wall", kind: "wall", poly: corners(-W / 2 - WALL / 2, D / 2 - left.width / 2, WALL, left.width) });
  if (right?.enabled) pieces.push({ id: "wall:right", name: "Right wall", kind: "wall", poly: corners(W / 2 + WALL / 2, -D / 2 + right.width / 2, WALL, right.width) });
  return pieces;
}

const round = (n) => Math.round(n * 10) / 10;

/** Every clearance problem in the booth, worst first. */
export function checkClearance(p, { accessible = ACCESSIBLE } = {}) {
  const out = [];
  const pieces = floorPieces(p);
  const W = p.booth.width / 2,
    D = p.booth.depth / 2;
  for (const piece of pieces) {
    if (piece.kind === "wall") continue;
    const past = Math.max(...piece.poly.map(([x, z]) => Math.max(x - W, -W - x, z - D, -D - z)));
    if (past > 0.5)
      out.push({
        kind: "outside",
        level: "problem",
        ids: [piece.id],
        inches: round(past),
        text: `${piece.name} stands ${round(past)}″ outside the booth's footprint.`,
      });
  }
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i],
        b = pieces[j];
      if (a.kind === "wall" && b.kind === "wall") continue;
      if (overlaps(a.poly, b.poly)) {
        out.push({ kind: "overlap", level: "problem", ids: [a.id, b.id], inches: 0, text: `${a.name} and ${b.name} stand in each other.` });
        continue;
      }
      const gap = gapBetween(a.poly, b.poly);
      if (gap.inches >= TOUCHING && gap.inches < accessible)
        out.push({
          kind: "tight",
          level: "warning",
          ids: [a.id, b.id],
          inches: round(gap.inches),
          from: gap.from,
          to: gap.to,
          text: `${round(gap.inches)}″ between ${a.name} and ${b.name}: narrower than the ${accessible}″ a wheelchair needs.`,
        });
    }
  const seen = new Set();
  for (const a of p.art) {
    if (a.kind === "label") continue;
    for (const b of sameWall(p.art, a)) {
      if (b.id === a.id || b.kind === "label" || seen.has(b.id)) continue;
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > 0.25 && overlapY > 0.25)
        out.push({ kind: "art-overlap", level: "problem", ids: ["art:" + a.id, "art:" + b.id], inches: 0, text: `“${a.title}” and “${b.title}” hang over each other.` });
    }
    seen.add(a.id);
  }
  const rank = { problem: 0, warning: 1 };
  return out.sort((x, y) => rank[x.level] - rank[y.level] || x.inches - y.inches);
}
