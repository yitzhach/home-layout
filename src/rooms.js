// Rooms: the house as a set of rectangles on one floor.
//
// A room is a measured rectangle — its centre X/Z and its width and depth, in
// inches, like everything else here — and its walls are derived from it rather
// than stored. That keeps a room one record the user edits, and it means two
// rooms side by side can never disagree about where the wall between them is:
// there is only one wall, worked out here.
//
// Why derived walls are keyed and not stored: every placement of art names the
// wall it hangs on. A room wall's key is `room:<room id>:<side>:<piece>`, so a
// work hung in the kitchen stays on the kitchen's north wall when the kitchen
// is resized, and a wall that no longer exists (a room deleted, a side opened
// up) reads exactly the way a hidden perimeter wall always has.
//
// The walls meet the rest of the app as "virtual panels" — the same
// { x, z, width, height, rotation } a free-standing panel has — so the
// scene stands them with the same function a panel uses, and art hangs on
// them with no new code.
//
// Sides are compass points on the plan: north is the back of the floor (−Z),
// south the front (+Z, where the booth's entrance was), west −X, east +X. Every
// wall's front face looks into its own room, so "inside" is always the room.
//
// Openings — doors, windows, archways — belong to a room and a side, at an
// offset along that side measured from its left end as seen from inside the
// room. A wall between two rooms is cut by the openings of either room, so a
// door typed in the kitchen's west wall is the same hole as seen from the
// dining room, whichever of the two rooms owns the wall.

export const SIDES = ["n", "e", "s", "w"];
export const SIDE_NAMES = { n: "North", e: "East", s: "South", w: "West" };
export const ROOM_PREFIX = "room:";
export const MAX_ROOMS = 24;
export const MAX_OPENINGS = 12;
/** Inches. Wide enough for a large open-plan room and a 100 ft floor. */
export const ROOM_LIMITS = {
  width: [36, 600],
  depth: [36, 600],
  height: [72, 240],
  x: [-600, 600],
  z: [-600, 600],
};
/** Where two edges count as the same line, in inches. */
const SNAP = 0.5;
/**
 * A wall's thickness, in inches: 2×4 studs (3½″) with ½″ drywall on both
 * faces. A room's width and depth are its clear inside measurements, the ones
 * a tape across the room gives, so every wall stands *outside* its room: its
 * front face on the room's edge and its body behind it. Two rooms side by side
 * therefore stand one wall apart — `roomBeside` leaves the gap and the shared
 * wall fills it. Rooms saved touching (before walls had a thickness) still
 * share their wall; the neighbour simply loses the wall's depth.
 */
export const WALL = 4.5;
export const OPENING_KINDS = {
  door: { label: "Door", width: 32, height: 80, sill: 0 },
  window: { label: "Window", width: 36, height: 48, sill: 30 },
  arch: { label: "Archway", width: 48, height: 84, sill: 0 },
};
export const OPENING_LIMITS = {
  width: [12, 240],
  height: [12, 144],
  sill: [0, 120],
  x: [0, 600],
  angle: [0, 180],
};
/** How far a new door stands open, in degrees. Open enough to read as a door. */
export const DOOR_ANGLE = 70;
export const ROOM_TYPES = {
  living: "Living room",
  kitchen: "Kitchen",
  dining: "Dining room",
  bedroom: "Bedroom",
  bath: "Bathroom",
  office: "Office",
  hall: "Hallway",
  closet: "Closet",
  laundry: "Laundry",
  other: "Room",
};

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
const uid = () => globalThis.crypto.randomUUID();

export const homeRooms = (p) => p.booth.rooms || [];
export const findRoom = (p, id) => homeRooms(p).find((r) => r.id === id) || null;

export function newRoom(fields = {}) {
  const type = fields.type || "other";
  return {
    id: uid(),
    name: ROOM_TYPES[type] || "Room",
    type,
    x: 0,
    z: 0,
    width: 144,
    depth: 144,
    height: 96,
    open: [],
    openings: [],
    ...fields,
  };
}

export function newOpening(kind, fields = {}) {
  const k = OPENING_KINDS[kind] || OPENING_KINDS.door;
  return {
    id: uid(),
    kind: OPENING_KINDS[kind] ? kind : "door",
    side: "s",
    x: 24,
    width: k.width,
    height: k.height,
    sill: k.sill,
    ...(kind === "door" ? { hinge: "left", swing: "in", angle: DOOR_ANGLE } : {}),
    ...fields,
  };
}

/** The four corners' extent of a room, in inches. */
export const roomBox = (r) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
});

/**
 * One side of a room as a line on the plan: which axis it lies along, where
 * that line is, the interval it covers, and the frame the wall stands in —
 * its left end as seen from inside, the direction it runs, and its rotation
 * (degrees, three's convention, the way a panel's is typed).
 */
export function roomEdge(r, side) {
  const e = edgeOf(r, side);
  return e && { side, ...e };
}
function edgeOf(r, side) {
  const b = roomBox(r);
  switch (side) {
    case "n":
      return { axis: "x", at: b.z0, lo: b.x0, hi: b.x1, length: r.width, origin: { x: b.x0, z: b.z0 }, dir: { x: 1, z: 0 }, rotation: 0 };
    case "s":
      return { axis: "x", at: b.z1, lo: b.x0, hi: b.x1, length: r.width, origin: { x: b.x1, z: b.z1 }, dir: { x: -1, z: 0 }, rotation: 180 };
    case "w":
      return { axis: "z", at: b.x0, lo: b.z0, hi: b.z1, length: r.depth, origin: { x: b.x0, z: b.z1 }, dir: { x: 0, z: -1 }, rotation: 90 };
    case "e":
      return { axis: "z", at: b.x1, lo: b.z0, hi: b.z1, length: r.depth, origin: { x: b.x1, z: b.z0 }, dir: { x: 0, z: 1 }, rotation: -90 };
  }
  return null;
}

/** Take the intervals in `cuts` out of [lo, hi]. Returns what is left, in order. */
export function subtract(lo, hi, cuts) {
  let left = [[lo, hi]];
  for (const [a, b] of cuts) {
    const next = [];
    for (const [c, d] of left) {
      if (b <= c + 1e-6 || a >= d - 1e-6) {
        next.push([c, d]);
        continue;
      }
      if (a > c + 1e-6) next.push([c, a]);
      if (b < d - 1e-6) next.push([b, d]);
    }
    left = next;
  }
  // A sliver under an inch is a rounding remainder, not a wall.
  return left.filter(([a, b]) => b - a >= 1);
}

const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };
/** +1 when a side's outward direction is +X or +Z, −1 otherwise. */
const OUTWARD = { n: -1, s: 1, e: 1, w: -1 };
/**
 * Whether two room edges are two faces of the same wall: the same line (a
 * room saved touching its neighbour, or two rooms overlapping), or opposite
 * sides standing up to one wall's thickness apart, the second behind the first.
 */
export function sameLine(e, f) {
  if (e.axis !== f.axis) return false;
  if (Math.abs(e.at - f.at) <= SNAP) return true;
  if (OPPOSITE[e.side] !== f.side) return false;
  const gap = (f.at - e.at) * OUTWARD[e.side];
  return gap >= -SNAP && gap <= WALL + SNAP;
}
const overlapOf = (e, f) => [Math.max(e.lo, f.lo), Math.min(e.hi, f.hi)];

/**
 * Every wall the rooms stand, each as a virtual panel with its key.
 *
 * A stretch of line shared by two rooms is one wall, owned by whichever room
 * comes first in the list, and there is no wall on it at all if either room
 * has that side open — "open to the kitchen" is a statement about the gap, not
 * about one side of it. The owner's front face looks into the owner's room.
 */
export function roomWalls(p) {
  const rooms = homeRooms(p);
  const edges = rooms.flatMap((r, index) =>
    SIDES.map((side) => ({ room: r, index, side, open: (r.open || []).includes(side), ...roomEdge(r, side) })),
  );
  const walls = [];
  for (const e of edges) {
    if (e.open) continue;
    const others = edges.filter((f) => f.room !== e.room && sameLine(e, f));
    // Spans an earlier room already owns, and spans any room has opened up.
    const cuts = others
      .filter((f) => f.index < e.index || f.open)
      .map((f) => overlapOf(e, f))
      .filter(([a, b]) => b > a);
    // A stretch no longer than a wall is thick is the end of the wall behind
    // a neighbour's: a corner, which `wallCorners` closes, not a wall to hang on.
    const pieces = subtract(e.lo, e.hi, cuts).filter(([a, b]) => b - a > WALL + SNAP);
    pieces.forEach(([a, b], piece) => {
      // Distances along the wall's own direction, from its left end.
      const along = (v) => (e.dir.x + e.dir.z > 0 ? v - e.lo : e.hi - v);
      const s0 = Math.min(along(a), along(b)),
        s1 = Math.max(along(a), along(b));
      const width = s1 - s0,
        mid = (s0 + s1) / 2;
      walls.push({
        key: `${ROOM_PREFIX}${e.room.id}:${e.side}:${piece}`,
        room: e.room.id,
        side: e.side,
        piece,
        x: e.origin.x + e.dir.x * mid,
        z: e.origin.z + e.dir.z * mid,
        width,
        height: e.room.height,
        rotation: e.rotation,
        origin: { x: e.origin.x + e.dir.x * s0, z: e.origin.z + e.dir.z * s0 },
        dir: e.dir,
        axis: e.axis,
        at: e.at,
      });
    });
  }
  return walls;
}

export const isRoomKey = (key) => typeof key === "string" && key.startsWith(ROOM_PREFIX);
export const findRoomWall = (p, key) =>
  isRoomKey(key) ? roomWalls(p).find((w) => w.key === key) || null : null;

export function roomWallLabel(p, key) {
  const w = findRoomWall(p, key);
  if (!w) return "";
  const r = findRoom(p, w.room),
    count = roomWalls(p).filter((x) => x.room === w.room && x.side === w.side).length;
  return `${r.name} · ${SIDE_NAMES[w.side]} wall${count > 1 ? ` ${w.piece + 1}` : ""}`;
}

/**
 * The openings that cut one wall, in that wall's own frame: x from its left
 * end, clipped to it. A wall between two rooms collects the openings of both.
 * `into` is +1 when a door on it swings toward the wall's front face and −1
 * when toward its back, worked out from the room the door was typed in.
 */
export function wallOpenings(p, wall) {
  const out = [];
  if (!wall) return out;
  for (const r of homeRooms(p)) {
    for (const o of r.openings || []) {
      const e = roomEdge(r, o.side);
      if (!e || !sameLine(wall, e)) continue;
      // The opening's two ends on the plan, then on this wall.
      const p0 = { x: e.origin.x + e.dir.x * o.x, z: e.origin.z + e.dir.z * o.x },
        p1 = { x: e.origin.x + e.dir.x * (o.x + o.width), z: e.origin.z + e.dir.z * (o.x + o.width) };
      const local = (q) => (q.x - wall.origin.x) * wall.dir.x + (q.z - wall.origin.z) * wall.dir.z;
      let a = local(p0),
        b = local(p1);
      const flipped = a > b;
      if (flipped) [a, b] = [b, a];
      const x0 = Math.max(0, a),
        x1 = Math.min(wall.width, b);
      if (x1 - x0 < 1) continue;
      // Same room and same direction: the door's own sense carries over.
      const sameFace = e.dir.x === wall.dir.x && e.dir.z === wall.dir.z;
      const inward = (o.swing || "in") === "in";
      const hingeLeft = (o.hinge || "left") === "left";
      out.push({
        id: o.id,
        room: r.id,
        kind: o.kind,
        x: x0,
        width: x1 - x0,
        sill: o.kind === "window" ? o.sill || 0 : 0,
        height: Math.min(o.height, wall.height - (o.kind === "window" ? o.sill || 0 : 0)),
        into: (inward ? 1 : -1) * (sameFace ? 1 : -1),
        // A hinge on the left seen from inside the typing room is on the
        // right seen from the other face.
        hingeLeft: flipped ? !hingeLeft : hingeLeft,
        angle: o.angle ?? DOOR_ANGLE,
      });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

/**
 * A wall with holes in it, as the solid rectangles that are left: full-height
 * strips between the openings, the piece under each window's sill and the
 * lintel over every opening. Overlapping openings are trimmed to the one
 * before, so the rectangles never overlap and never leave a sliver.
 */
export function wallPieces(width, height, openings = []) {
  const rects = [];
  let cursor = 0;
  for (const o of [...openings].sort((a, b) => a.x - b.x)) {
    const x0 = Math.max(cursor, Math.min(width, o.x)),
      x1 = Math.max(x0, Math.min(width, o.x + o.width));
    if (x1 - x0 < 1e-6) continue;
    if (x0 > cursor) rects.push({ x: cursor, y: 0, w: x0 - cursor, h: height });
    const sill = Math.max(0, Math.min(height, o.sill || 0)),
      top = Math.max(sill, Math.min(height, sill + o.height));
    if (sill > 0) rects.push({ x: x0, y: 0, w: x1 - x0, h: sill });
    if (top < height) rects.push({ x: x0, y: top, w: x1 - x0, h: height - top });
    cursor = x1;
  }
  if (cursor < width) rects.push({ x: cursor, y: 0, w: width - cursor, h: height });
  return rects;
}

/**
 * A wall's footprint on the plan: the rectangle from its front face on the
 * room's edge back through its thickness, in inches.
 */
export function wallFootprint(w, t = WALL) {
  const r = (w.rotation * Math.PI) / 180,
    back = { x: -Math.round(Math.sin(r)), z: -Math.round(Math.cos(r)) };
  const a = w.origin,
    b = { x: a.x + w.dir.x * w.width, z: a.z + w.dir.z * w.width };
  const xs = [a.x, b.x, a.x + back.x * t, b.x + back.x * t],
    zs = [a.z, b.z, a.z + back.z * t, b.z + back.z * t];
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
const area = (a, b) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
const grow = (a, d) => ({ x0: a.x0 - d, x1: a.x1 + d, z0: a.z0 - d, z1: a.z1 + d });

/**
 * The squares that close a house's corners. Each wall stands behind its own
 * room's edge and runs exactly that edge's length, so where two walls meet at
 * a corner the thickness-by-thickness square outside both is nobody's. Each
 * one is found here — a square past the end of a wall that no wall already
 * covers and that a wall running the other way touches — and is stood by the
 * scene as a plain post, which no art hangs on.
 */
export function wallCorners(p, t = WALL) {
  const walls = roomWalls(p).map((w) => ({ w, f: wallFootprint(w, t) }));
  const out = new Map();
  for (const { w, f } of walls) {
    const ends = w.axis === "x" ? [[f.x0 - t, f.x0], [f.x1, f.x1 + t]] : [[f.z0 - t, f.z0], [f.z1, f.z1 + t]];
    for (const [lo, hi] of ends) {
      const sq = w.axis === "x" ? { x0: lo, x1: hi, z0: f.z0, z1: f.z1 } : { x0: f.x0, x1: f.x1, z0: lo, z1: hi };
      if (walls.some((o) => area(o.f, sq) > 0.01)) continue;
      const meets = walls.filter((o) => o.w.axis !== w.axis && area(o.f, grow(sq, SNAP)) > 0.01);
      if (!meets.length) continue;
      const key = `${Math.round(sq.x0 * 2)},${Math.round(sq.z0 * 2)}`;
      const height = Math.min(w.height, ...meets.map((o) => o.w.height));
      if (!out.has(key) || out.get(key).height < height) out.set(key, { ...sq, height });
    }
  }
  return [...out.values()];
}

/**
 * The strips of floor between rooms that stand a wall apart: under the wall
 * they share, and — where one of them has opened that side — the floor the
 * missing wall would have stood on, so an open plan has no gap in it.
 */
export function wallGaps(p) {
  const rooms = homeRooms(p),
    out = [];
  rooms.forEach((a, i) =>
    ["e", "s"].forEach((side) => {
      const e = roomEdge(a, side);
      rooms.forEach((b, j) => {
        if (i === j) return;
        const f = roomEdge(b, OPPOSITE[side]);
        const gap = (f.at - e.at) * OUTWARD[side];
        if (!sameLine(e, f) || gap <= SNAP) return;
        const [lo, hi] = overlapOf(e, f);
        if (hi - lo < 1) return;
        out.push(e.axis === "z" ? { x0: e.at, x1: f.at, z0: lo, z1: hi, room: a.id } : { x0: lo, x1: hi, z0: e.at, z1: f.at, room: a.id });
      });
    }),
  );
  return out;
}

/**
 * The floor a set of rooms needs, as the footprint the rest of the app
 * measures against: centred on the origin, as the booth always was, and big
 * enough to hold every room with a foot to spare.
 */
export function houseExtent(rooms, min = 120) {
  let x = min / 2,
    z = min / 2;
  for (const r of rooms) {
    const b = roomBox(r);
    x = Math.max(x, Math.abs(b.x0), Math.abs(b.x1));
    z = Math.max(z, Math.abs(b.z0), Math.abs(b.z1));
  }
  return { width: Math.min(1200, Math.ceil(2 * x + 24)), depth: Math.min(1200, Math.ceil(2 * z + 24)) };
}

/**
 * Where a new room goes when it is added beside `from` on `side`: one wall's
 * thickness away, sharing that whole wall, lined up with its near end, so the
 * wall between them is drawn once and both rooms keep their inside size.
 */
export function roomBeside(from, side, size = {}) {
  const width = size.width ?? from.width,
    depth = size.depth ?? from.depth;
  const b = roomBox(from);
  if (side === "e") return { x: b.x1 + WALL + width / 2, z: b.z0 + depth / 2, width, depth };
  if (side === "w") return { x: b.x0 - WALL - width / 2, z: b.z0 + depth / 2, width, depth };
  if (side === "n") return { x: b.x0 + width / 2, z: b.z0 - WALL - depth / 2, width, depth };
  return { x: b.x0 + width / 2, z: b.z1 + WALL + depth / 2, width, depth };
}

/**
 * A room resized from a typed width or depth. The edge that meets another
 * room stays put, so a room grows away from its neighbour rather than into
 * it; with neighbours on both sides or neither, the north-west corner stays,
 * the way a drawn rectangle grows from the corner it was started at.
 */
export function resizeRoom(rooms, r, key, value) {
  const touches = (side) => {
    const e = roomEdge(r, side);
    return rooms.some((o) => o !== r && o.id !== r.id && SIDES.some((sd) => {
      const f = roomEdge(o, sd);
      return sameLine(e, f) && Math.min(e.hi, f.hi) - Math.max(e.lo, f.lo) > 1;
    }));
  };
  const b = roomBox(r);
  if (key === "width") {
    const keepEast = touches("e") && !touches("w");
    return { ...r, width: value, x: keepEast ? b.x1 - value / 2 : b.x0 + value / 2 };
  }
  if (key === "depth") {
    const keepSouth = touches("s") && !touches("n");
    return { ...r, depth: value, z: keepSouth ? b.z1 - value / 2 : b.z0 + value / 2 };
  }
  return { ...r, [key]: value };
}
/** A room's measurements pulled inside their limits, and its openings inside its walls. */
export function constrainRoom(r) {
  const out = { ...r };
  for (const k of ["width", "depth", "height", "x", "z"]) out[k] = clamp(Number(out[k]) || 0, ROOM_LIMITS[k]);
  out.openings = (r.openings || []).map((o) => constrainOpening(out, o));
  return out;
}
export function constrainOpening(r, o) {
  const e = roomEdge(r, o.side) || roomEdge(r, "s");
  const out = { ...o };
  out.width = clamp(o.width, [OPENING_LIMITS.width[0], Math.max(OPENING_LIMITS.width[0], e.length)]);
  out.x = clamp(o.x, [0, Math.max(0, e.length - out.width)]);
  out.sill = o.kind === "window" ? clamp(o.sill || 0, [0, Math.max(0, r.height - 12)]) : 0;
  out.height = clamp(o.height, [OPENING_LIMITS.height[0], Math.max(OPENING_LIMITS.height[0], r.height - out.sill)]);
  if (o.kind === "door") out.angle = clamp(o.angle ?? DOOR_ANGLE, OPENING_LIMITS.angle);
  return out;
}

/** The rooms of a backup, checked the way the rest of schema 1 is. */
export function validRooms(rooms) {
  if (rooms === undefined) return true;
  if (!Array.isArray(rooms) || rooms.length > MAX_ROOMS) return false;
  const fin = (n, [lo, hi]) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  const ids = new Set();
  for (const r of rooms) {
    if (!r || typeof r !== "object") return false;
    if (typeof r.id !== "string" || !r.id || r.id.length > 200 || r.id.includes(":") || ids.has(r.id)) return false;
    ids.add(r.id);
    if (typeof r.name !== "string" || r.name.length > 120) return false;
    if (r.type !== undefined && !(r.type in ROOM_TYPES)) return false;
    for (const k of ["width", "depth", "height", "x", "z"]) if (!fin(r[k], ROOM_LIMITS[k])) return false;
    if (r.open !== undefined && (!Array.isArray(r.open) || r.open.some((s) => !SIDES.includes(s)))) return false;
    if (r.openings !== undefined) {
      if (!Array.isArray(r.openings) || r.openings.length > MAX_OPENINGS) return false;
      const oids = new Set();
      for (const o of r.openings) {
        if (!o || typeof o.id !== "string" || !o.id || o.id.length > 200 || oids.has(o.id)) return false;
        oids.add(o.id);
        if (!(o.kind in OPENING_KINDS) || !SIDES.includes(o.side)) return false;
        for (const k of ["width", "height", "x"]) if (!fin(o[k], OPENING_LIMITS[k])) return false;
        if (o.sill !== undefined && !fin(o.sill, OPENING_LIMITS.sill)) return false;
        if (o.angle !== undefined && !fin(o.angle, OPENING_LIMITS.angle)) return false;
        if (o.hinge !== undefined && !["left", "right"].includes(o.hinge)) return false;
        if (o.swing !== undefined && !["in", "out"].includes(o.swing)) return false;
      }
    }
  }
  return true;
}

/**
 * A starter floor: living room, kitchen and bedroom in a row with a bathroom
 * behind the bedroom, doors between them and windows on the outside walls.
 * Enough to be a house at first sight and small enough to change.
 */
export function starterRooms() {
  const living = newRoom({ type: "living", name: "Living room", x: -84, z: 0, width: 192, depth: 168 });
  const kitchen = newRoom({ type: "kitchen", name: "Kitchen", ...roomBeside(living, "e", { width: 144 }) });
  const bedroom = newRoom({ type: "bedroom", name: "Bedroom", ...roomBeside(living, "n", { width: 144, depth: 144 }) });
  const bath = newRoom({ type: "bath", name: "Bathroom", ...roomBeside(bedroom, "e", { width: 96, depth: 144 }) });
  living.openings = [
    newOpening("door", { side: "s", x: 24, swing: "in" }),
    newOpening("window", { side: "s", x: 96, width: 60 }),
    newOpening("window", { side: "w", x: 48, width: 48 }),
  ];
  // Open plan between living room and kitchen: an archway rather than a door.
  kitchen.openings = [
    newOpening("arch", { side: "w", x: 40, width: 60 }),
    newOpening("window", { side: "e", x: 48, width: 48 }),
  ];
  bedroom.openings = [
    newOpening("door", { side: "s", x: 90, hinge: "right" }),
    newOpening("window", { side: "n", x: 42, width: 60 }),
  ];
  bath.openings = [newOpening("door", { side: "w", x: 58, width: 28 }), newOpening("window", { side: "n", x: 30, width: 30, height: 24, sill: 54 })];
  return [living, kitchen, bedroom, bath];
}
