// Quick start: a finished booth from four answers — what kind of show, what
// size, which furniture, and a name — instead of an empty booth and the
// Layout tab. Everything it writes is an ordinary default the inspector can
// change afterwards; it goes through the same `applyVenue` the venue switch
// uses, so a quick-started booth is indistinguishable from one set up by hand.
//
// Also the user's own templates: a booth saved without its artwork or
// images, kept in this browser, that a quick start can begin from instead.
import { FURNITURE, GROUND_KINDS, applyVenue, blankProject, constrainPedestal, uid } from "./model.js";

export const SHOWS = {
  artfair: { label: "Outdoor art fair · canopy tent", venue: "outdoor", tent: true, envPreset: "artfair" },
  artshow: { label: "Indoor art show · panel walls and light bar", venue: "artshow" },
  tradeshow: { label: "Trade show · exhibition hall, no canopy", venue: "outdoor", tent: false, envPreset: "tradeshow" },
};

// Footprints in inches, width along the entrance then depth.
export const FOOTPRINTS = {
  "10x10": { label: "10 × 10 ft", width: 120, depth: 120 },
  "10x15": { label: "10 × 15 ft", width: 180, depth: 120 },
  "10x20": { label: "10 × 20 ft", width: 240, depth: 120 },
  "8x10": { label: "8 × 10 ft", width: 120, depth: 96 },
  "20x20": { label: "20 × 20 ft", width: 240, depth: 240 },
};

// Where each starter piece stands, as fractions of the footprint from its
// centre (X right, Z toward the entrance), and which way it faces.
const STARTER_PLACES = {
  table6: { fx: 0.18, fz: 0.3, rotation: 0 },
  chair: { fx: 0.18, fz: 0.05, rotation: 180 },
  bin: { fx: -0.28, fz: 0.32, rotation: 0 },
  banner: { fx: -0.42, fz: 0.42, rotation: 0 },
  pedestal: { fx: 0.4, fz: 0.36, rotation: 0 },
  gridwall: { fx: 0, fz: -0.05, rotation: 0 },
};
export const STARTERS = Object.keys(STARTER_PLACES);

/**
 * Build the booth. `show` and `size` are keys of SHOWS and FOOTPRINTS,
 * `furniture` a list of STARTERS, `name` the project's name. Unknown keys
 * fall back to the first of each, so a stale choice never throws.
 */
export function quickStart({ show = "artfair", size = "10x10", furniture = [], name } = {}) {
  const spec = SHOWS[show] || SHOWS.artfair;
  const fp = FOOTPRINTS[size] || FOOTPRINTS["10x10"];
  const p = blankProject();
  p.art = [];
  applyVenue(p, spec.venue);
  const b = p.booth;
  b.width = fp.width;
  b.depth = fp.depth;
  b.walls.back = { ...b.walls.back, width: fp.width };
  b.walls.left = { ...b.walls.left, width: fp.depth };
  b.walls.right = { ...b.walls.right, width: fp.depth };
  if (spec.venue === "outdoor") {
    b.tent = spec.tent;
    b.envPreset = spec.envPreset;
  }
  b.pedestals = [];
  for (const kind of furniture) {
    const place = STARTER_PLACES[kind];
    if (!place || !FURNITURE[kind]) continue;
    const { label, ...size } = FURNITURE[kind];
    b.pedestals.push(
      constrainPedestal(p, {
        id: uid(),
        name: label,
        ...size,
        ...(kind === "pedestal" ? {} : { kind }),
        x: Math.round(place.fx * fp.width),
        z: Math.round(place.fz * fp.depth),
        rotation: place.rotation,
      }),
    );
  }
  if (name && String(name).trim()) p.name = String(name).trim().slice(0, 120);
  else p.name = `${fp.label} ${spec.venue === "artshow" ? "art show" : show === "tradeshow" ? "trade show" : "art fair"} booth`;
  return p;
}

/**
 * A template is the booth and its lighting without the work: no artwork, no
 * images, no photo composition. Small enough to keep in localStorage, and
 * the part of a booth that is the same show after show.
 */
export function templateOf(p, label) {
  const booth = structuredClone(p.booth);
  // Anything that points at an uploaded image goes: the images stay with the
  // project they belong to. A photographed floor falls back to its preset.
  delete booth.surroundAsset;
  delete booth.groundAsset;
  if (!GROUND_KINDS.includes(booth.ground)) booth.ground = GROUND_KINDS.includes(booth.groundPreset) ? booth.groundPreset : undefined;
  if (booth.ground === undefined) delete booth.ground;
  return {
    id: uid(),
    label: String(label || p.name || "My booth").trim().slice(0, 80) || "My booth",
    booth,
    lights: structuredClone(p.lights || []),
    ambient: p.ambient,
  };
}

/** A new project standing in a saved template's booth. */
export function fromTemplate(t, name) {
  const p = blankProject();
  p.art = [];
  p.booth = { ...p.booth, ...structuredClone(t.booth) };
  if (Array.isArray(t.lights)) p.lights = structuredClone(t.lights);
  if (Number.isFinite(t.ambient)) p.ambient = t.ambient;
  p.name = String(name || t.label).trim().slice(0, 120) || "My booth";
  return p;
}
