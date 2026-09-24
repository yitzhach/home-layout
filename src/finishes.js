// Finishes: what each room's walls, floor and ceiling are made of.
//
// A room may carry an optional `finish` record:
//
//   { walls: "#hex", sides: { n: "#hex", … }, floor: "<floor id>",
//     floorColor: "#hex", ceiling: "#hex" }
//
// Every part of it is optional, and so is the record itself, which is what
// keeps schema 1 true: a room saved before finishes existed has none and is
// drawn exactly as it was — walls in the house's one wall colour
// (`booth.color`), an oak floor, a white ceiling.
//
// Walls are paint: a colour for the whole room, and a colour for any one side
// that should differ (the feature wall). A wall two rooms share is one slab
// with two faces, and each face is painted by the room it looks into — the
// owner's front face by the owner, the back face by whichever room lies behind
// it. An outside face takes the house's wall colour.
//
// Floors are a material from a short list rather than a colour, because what
// a floor is made of — boards, tile, stone, carpet — is the thing being
// chosen. Each material is drawn procedurally so the app runs with
// `public/assets` empty; when the owner supplies a photograph for one at
// `assets/materials/<id>/color.jpg` it is used instead (see
// finish-textures.js). `floorColor` tints the material, which is how the
// same oak is drawn pale or dark.
//
// This module is pure: no three, no DOM. finish-textures.js draws.

import { SIDES, homeRooms, roomEdge } from "./rooms.js";

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (c) => typeof c === "string" && HEX.test(c);

/**
 * The floor materials. `color` is the base the pattern is drawn in and what a
 * tint replaces; `tile` is the real size of one repeat, in inches, so a board
 * is a board's width and a tile a tile's at any room size; `roughness` is
 * what the light sees.
 */
export const FLOOR_FINISHES = {
  oak: { label: "Oak boards", color: "#b48a5e", pattern: "boards", tile: 48, roughness: 0.6 },
  "light-oak": { label: "Light oak boards", color: "#d2b48a", pattern: "boards", tile: 48, roughness: 0.6 },
  walnut: { label: "Walnut boards", color: "#6e4c33", pattern: "boards", tile: 48, roughness: 0.55 },
  herringbone: { label: "Herringbone oak", color: "#b8905f", pattern: "herringbone", tile: 24, roughness: 0.6 },
  tile: { label: "Ceramic tile 12″", color: "#e4e1db", pattern: "tile", tile: 24, roughness: 0.35 },
  "tile-small": { label: "Mosaic tile 2″", color: "#f1f1ee", pattern: "mosaic", tile: 12, roughness: 0.3 },
  checker: { label: "Checkerboard tile", color: "#f2f0ea", pattern: "checker", tile: 24, roughness: 0.35 },
  marble: { label: "Marble", color: "#ebe8e3", pattern: "marble", tile: 48, roughness: 0.2 },
  slate: { label: "Slate", color: "#595c5f", pattern: "tile", tile: 32, roughness: 0.75 },
  concrete: { label: "Polished concrete", color: "#a9a7a2", pattern: "speckle", tile: 48, roughness: 0.45 },
  carpet: { label: "Carpet", color: "#b9b2a6", pattern: "speckle", tile: 24, roughness: 0.98 },
  vinyl: { label: "Sheet vinyl", color: "#d8d2c6", pattern: "plain", tile: 48, roughness: 0.5 },
};
export const DEFAULT_FLOOR = "oak";

/** Floors a new room of each kind starts with, where oak would be wrong. */
export const TYPE_FLOORS = {
  kitchen: "tile",
  bath: "tile-small",
  laundry: "vinyl",
  bedroom: "carpet",
};

/** Paint presets offered beside the colour picker. Named, because paint is. */
export const PAINTS = {
  "#eeebe4": "Warm white",
  "#f7f5f0": "Chalk",
  "#e6dccb": "Linen",
  "#d9d4c7": "Greige",
  "#c9d3c4": "Sage",
  "#b8c7d3": "Mist blue",
  "#8c9aa6": "Slate blue",
  "#6f7d63": "Olive",
  "#b7765a": "Terracotta",
  "#45474a": "Charcoal",
};
export const DEFAULT_CEILING = "#f7f6f2";

const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };

export const roomFinish = (r) => (r?.finish && typeof r.finish === "object" ? r.finish : {});

/** The floor material a room is drawn in. */
export function floorFinish(r) {
  const id = roomFinish(r).floor;
  return FLOOR_FINISHES[id] ? id : DEFAULT_FLOOR;
}
/** The colour a floor is drawn in: its tint, else its material's own. */
export const floorColor = (r) => {
  const tint = roomFinish(r).floorColor;
  return isHex(tint) ? tint : FLOOR_FINISHES[floorFinish(r)].color;
};
export const ceilingColor = (r) => {
  const c = roomFinish(r).ceiling;
  return isHex(c) ? c : DEFAULT_CEILING;
};

/** The paint on one side of a room, falling back to the room's, then the house's. */
export function sideColor(p, r, side) {
  const f = roomFinish(r);
  if (isHex(f.sides?.[side])) return f.sides[side];
  if (isHex(f.walls)) return f.walls;
  return p.booth.color;
}

/**
 * The room on the other face of a derived wall: one whose opposite side lies
 * on the same line and covers the wall's midpoint. Null for an outside wall.
 */
export function roomBehind(p, wall) {
  if (!wall) return null;
  const opp = OPPOSITE[wall.side],
    mid = wall.axis === "x" ? wall.x : wall.z;
  for (const r of homeRooms(p)) {
    if (r.id === wall.room) continue;
    const e = roomEdge(r, opp);
    if (Math.abs(e.at - wall.at) <= 0.5 && mid > e.lo + 1e-6 && mid < e.hi - 1e-6) return { room: r, side: opp };
  }
  return null;
}

/**
 * The two faces of a room wall: `front` looks into the owning room, `back`
 * into the room behind it, or outside.
 */
export function wallFaces(p, wall) {
  const owner = homeRooms(p).find((r) => r.id === wall?.room);
  const front = owner ? sideColor(p, owner, wall.side) : p.booth.color;
  const behind = roomBehind(p, wall);
  const back = behind ? sideColor(p, behind.room, behind.side) : p.booth.color;
  return { front, back };
}

/** A new room's finish: the floor its kind usually has, nothing else set. */
export const starterFinish = (type) => (TYPE_FLOORS[type] ? { floor: TYPE_FLOORS[type] } : undefined);

/** A room's `finish`, checked the way the rest of schema 1 is. */
export function validFinish(f) {
  if (f === undefined) return true;
  if (!f || typeof f !== "object" || Array.isArray(f)) return false;
  for (const k of Object.keys(f)) if (!["walls", "sides", "floor", "floorColor", "ceiling"].includes(k)) return false;
  for (const k of ["walls", "floorColor", "ceiling"]) if (f[k] !== undefined && !isHex(f[k])) return false;
  if (f.floor !== undefined && !Object.hasOwn(FLOOR_FINISHES, f.floor)) return false;
  if (f.sides !== undefined) {
    if (!f.sides || typeof f.sides !== "object" || Array.isArray(f.sides)) return false;
    for (const [k, v] of Object.entries(f.sides)) if (!SIDES.includes(k) || !isHex(v)) return false;
  }
  return true;
}

/**
 * Set one part of a room's finish, returning the new record. `undefined` or
 * an empty value clears that part, so "same as the room" is a real choice
 * and a finish that has gone back to every default disappears.
 */
export function setFinish(r, key, value) {
  const f = structuredClone(roomFinish(r));
  const clear = value === undefined || value === null || value === "";
  if (key.startsWith("side-")) {
    const side = key.slice(5);
    if (!SIDES.includes(side)) return r.finish;
    f.sides = { ...(f.sides || {}) };
    if (clear) delete f.sides[side];
    else f.sides[side] = String(value).toLowerCase();
    if (!Object.keys(f.sides).length) delete f.sides;
  } else if (["walls", "floor", "floorColor", "ceiling"].includes(key)) {
    if (clear) delete f[key];
    else f[key] = key === "floor" ? String(value) : String(value).toLowerCase();
    // A new material starts in its own colour, not the last one's tint.
    if (key === "floor") delete f.floorColor;
  } else return r.finish;
  if (!validFinish(f)) return r.finish;
  return Object.keys(f).length ? f : undefined;
}
