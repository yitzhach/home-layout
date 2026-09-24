// Measuring: the tape measure and the plan view's dimension lines.
//
// Pure, so the arithmetic is pinned by node tests. Everything here is in the
// booth's own units — inches, with the floor's centre at 0, X to the right and
// Z toward the entrance, the back wall at Z = −depth/2 — and the scene turns
// the answers into lines and labels.

/**
 * A length as a builder reads it off a tape: feet and inches to the nearest
 * quarter, with the plain inch figure beside it for anyone typing it into a
 * field. `88.5` reads `7′ 4½″ · 88.5″`.
 */
export function formatLength(inches) {
  if (!Number.isFinite(inches)) return "";
  const quarters = Math.round(Math.abs(inches) * 4);
  const sign = inches < 0 && quarters ? "−" : "";
  const feet = Math.floor(quarters / 48);
  const rest = quarters - feet * 48;
  const whole = Math.floor(rest / 4);
  const frac = ["", "¼", "½", "¾"][rest % 4];
  const inchPart = `${whole || !frac ? whole : ""}${frac}″`;
  const tape = feet ? `${feet}′ ${inchPart}` : inchPart;
  const plain = Number((Math.abs(inches)).toFixed(2));
  return feet ? `${sign}${tape} · ${sign}${plain}″` : `${sign}${tape}`;
}

/** Straight-line distance between two points given in metres, in inches. */
export function distanceInches(a, b, IN = 0.0254) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / IN;
}

/**
 * The footprint a rotated rectangle covers on the floor: half-extents along
 * X and Z of its axis-aligned bounding box. A pedestal turned 45° takes more
 * room than its width says, and the clearance to a wall is measured from
 * what it covers.
 */
export function footprint({ width, depth = 0, rotation = 0 }) {
  const r = (rotation * Math.PI) / 180,
    c = Math.abs(Math.cos(r)),
    s = Math.abs(Math.sin(r));
  return { hx: (width * c + depth * s) / 2, hz: (width * s + depth * c) / 2 };
}

// How far outside the footprint the overall dimension lines stand, so they
// read as dimensions and not as part of the booth.
export const DIMENSION_OFFSET = 12;

/**
 * The dimension lines the plan view draws: the booth's overall width along
 * the entrance, its depth down the right-hand side, and — for a selected
 * pedestal or free-standing wall — the clear floor from its edges to the
 * left, right and back walls, which is what someone placing a table in a
 * 10 × 10 actually needs to know.
 *
 * Each line is `{ from: {x, z}, to: {x, z}, inches, kind }`.
 * `item` is `{ x, z, width, depth, rotation }` or null.
 */
export function planDimensions(booth, item = null) {
  const W = booth.width,
    D = booth.depth,
    lines = [
      { kind: "width", from: { x: -W / 2, z: D / 2 + DIMENSION_OFFSET }, to: { x: W / 2, z: D / 2 + DIMENSION_OFFSET }, inches: W },
      { kind: "depth", from: { x: W / 2 + DIMENSION_OFFSET, z: -D / 2 }, to: { x: W / 2 + DIMENSION_OFFSET, z: D / 2 }, inches: D },
    ];
  if (!item) return lines;
  const { hx, hz } = footprint(item),
    left = item.x - hx - -W / 2,
    right = W / 2 - (item.x + hx),
    back = item.z - hz - -D / 2;
  // A clearance only means something while the item stands inside the
  // footprint; one pushed past a wall has none on that side.
  if (left > 0) lines.push({ kind: "left", from: { x: -W / 2, z: item.z }, to: { x: item.x - hx, z: item.z }, inches: left });
  if (right > 0) lines.push({ kind: "right", from: { x: item.x + hx, z: item.z }, to: { x: W / 2, z: item.z }, inches: right });
  if (back > 0) lines.push({ kind: "back", from: { x: item.x, z: -D / 2 }, to: { x: item.x, z: item.z - hz }, inches: back });
  return lines;
}
