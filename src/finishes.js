// Finishes: what each room's floor, walls and ceiling are made of.
//
// A room carries its finishes in an optional `finishes` record:
//
//   { floor: { kind, color }, walls: { kind, color }, ceiling: { kind, color },
//     n: { kind, color }, e: …, s: …, w: … }
//
// `walls` is the whole room; a side (n/e/s/w) overrides it for that one wall.
// Every part is optional, and a missing one reads as the defaults below, so a
// room saved before finishes existed looks exactly as it did — oak floor, the
// house's wall colour, a white ceiling — and schema 1 is untouched.
//
// A wall between two rooms has two faces, and each is painted from its own
// side: the kitchen's west finish is the kitchen face of the wall, the dining
// room's east finish the other face of the same wall. The outside of the house
// is the house's wall colour.
//
// A kind is a surface — a colour, and a pattern drawn over it. Each kind names
// a texture set on disk (`public/assets/textures/<set>/`) the owner can supply
// photographs for; with the folder empty the pattern is drawn procedurally
// (src/finish-textures.js) and the app never needs a file to start.
//
// Pure. The scene turns these into materials.

/** How each kind looks, and the real size one tile of its pattern covers, in inches. */
export const FINISH_KINDS = {
  paint: { label: "Paint", tile: 48, roughness: 0.92, set: null },
  wood: { label: "Wood planks", tile: 48, roughness: 0.62, set: "finish-wood" },
  tile: { label: "Tile", tile: 24, roughness: 0.35, set: "finish-tile" },
  stone: { label: "Stone", tile: 48, roughness: 0.5, set: "finish-stone" },
  carpet: { label: "Carpet", tile: 24, roughness: 0.98, set: "finish-carpet" },
  concrete: { label: "Concrete", tile: 72, roughness: 0.85, set: "finish-concrete" },
  brick: { label: "Brick", tile: 32, roughness: 0.9, set: "finish-brick" },
  panel: { label: "Wood panelling", tile: 48, roughness: 0.6, set: "finish-panel" },
};

/** Which kinds each surface offers. */
export const SURFACE_KINDS = {
  floor: ["wood", "tile", "stone", "carpet", "concrete", "paint"],
  walls: ["paint", "tile", "brick", "panel", "wood", "stone", "concrete"],
  ceiling: ["paint", "wood", "panel", "concrete"],
};
export const SURFACE_NAMES = { floor: "Floor", walls: "Walls", ceiling: "Ceiling" };

/** A good first colour per kind, so choosing Tile does not leave a brown floor tiled. */
export const KIND_COLORS = {
  paint: "#eeebe4",
  wood: "#b48a5e",
  tile: "#e8e6e1",
  stone: "#c9c3b8",
  carpet: "#8f8a80",
  concrete: "#a9a8a3",
  brick: "#a65a3f",
  panel: "#9b7650",
};

/** What a room with no finishes of its own is. */
export const DEFAULT_FLOOR = { kind: "wood", color: "#b48a5e" };
export const DEFAULT_CEILING = { kind: "paint", color: "#f7f6f2" };

/** Room types whose floor starts as something other than oak. */
const TYPE_FLOORS = {
  bath: { kind: "tile", color: "#e8e6e1" },
  laundry: { kind: "tile", color: "#dcd9d2" },
  kitchen: { kind: "tile", color: "#d8d3c8" },
};

const HEX = /^#[0-9a-f]{6}$/i;
const PARTS = ["floor", "walls", "ceiling", "n", "e", "s", "w"];

const clean = (f, surface) =>
  f && FINISH_KINDS[f.kind] && SURFACE_KINDS[surface].includes(f.kind) && HEX.test(f.color || "") ? f : null;

/** A room's floor finish. */
export const floorFinish = (room) => clean(room?.finishes?.floor, "floor") || TYPE_FLOORS[room?.type] || DEFAULT_FLOOR;
/** A room's ceiling finish. */
export const ceilingFinish = (room) => clean(room?.finishes?.ceiling, "ceiling") || DEFAULT_CEILING;
/**
 * One of a room's walls, seen from inside the room: the side's own finish if
 * it has one, else the room's walls, else paint in the house's wall colour.
 */
export const wallFinish = (room, side, houseColor = KIND_COLORS.paint) =>
  clean(room?.finishes?.[side], "walls") ||
  clean(room?.finishes?.walls, "walls") || { kind: "paint", color: HEX.test(houseColor || "") ? houseColor : KIND_COLORS.paint };

/** Whether a stored finishes record is one schema 1 accepts. Absent is fine. */
export function validFinishes(f) {
  if (f === undefined) return true;
  if (!f || typeof f !== "object" || Array.isArray(f)) return false;
  for (const [k, v] of Object.entries(f)) {
    if (!PARTS.includes(k)) return false;
    if (!v || typeof v !== "object") return false;
    const surface = k === "floor" || k === "ceiling" ? k : "walls";
    if (!SURFACE_KINDS[surface].includes(v.kind)) return false;
    if (typeof v.color !== "string" || !HEX.test(v.color)) return false;
  }
  return true;
}

/**
 * The repeat and offset that lay a kind's pattern over a rectangle `w` × `h`
 * inches whose corner sits `x`, `y` inches into the surface, so the pieces a
 * door cuts a wall into still line up as one tiled wall.
 */
export function tiling(kind, w, h, x = 0, y = 0) {
  const tile = FINISH_KINDS[kind]?.tile || 48;
  return { repeat: [w / tile, h / tile], offset: [x / tile, y / tile] };
}
