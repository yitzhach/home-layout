// Light fixtures and daylight: phase 4.
//
// A fixture belongs to a room — `room.lights`, optional like every list in
// schema 1 — at an offset from the room's centre in inches, so it moves with
// the room when the room moves and goes with it when the room is deleted. Its
// height is not stored: a ceiling light hangs from its room's ceiling, a lamp
// stands on the floor, and both follow the room's height when that changes.
//
// Daylight is one record for the house, `booth.daylight`: whether the sun is
// on, the hour, the month, the latitude and which way the plan's north points.
// The sun's position is worked out here from those, with the usual textbook
// approximation (declination from the day of the year, hour angle from solar
// noon). It is good to a degree or two, which is far finer than anyone can
// judge a patch of sunlight on a floor by.
//
// Everything in this module is pure, so the geometry and the validators are
// tested without a browser. scene.js turns the result into lights.

export const MAX_LIGHTS = 12;

/**
 * The kinds of fixture. `mount` says where it sits: from the ceiling (its
 * `drop` below it), or standing on the floor (`y` above it). `lumens` is the
 * starting output — a 60 W-equivalent bulb is about 800 — and the user can
 * change it.
 */
export const LIGHT_KINDS = {
  ceiling: { label: "Ceiling light", mount: "ceiling", drop: 4, lumens: 1600 },
  pendant: { label: "Pendant", mount: "ceiling", drop: 30, lumens: 1100 },
  recessed: { label: "Recessed downlight", mount: "ceiling", drop: 0.5, lumens: 700 },
  floor: { label: "Floor lamp", mount: "floor", y: 60, lumens: 1100 },
  table: { label: "Table lamp", mount: "floor", y: 26, lumens: 600 },
};
export const LIGHT_LIMITS = {
  lumens: [50, 6000],
  kelvin: [2200, 6500],
};
export const DEFAULT_KELVIN = 2900;

const uid = () => globalThis.crypto.randomUUID();
const fin = (n, lo, hi) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;

export const roomLights = (r) => (Array.isArray(r?.lights) ? r.lights : []);

/** A new fixture of `kind`, in the middle of its room. */
export function newLight(kind, fields = {}) {
  const k = LIGHT_KINDS[kind] ? kind : "ceiling";
  return { id: uid(), kind: k, x: 0, z: 0, lumens: LIGHT_KINDS[k].lumens, kelvin: DEFAULT_KELVIN, on: true, ...fields };
}

/**
 * Where a fixture is in the house, in inches: its offset kept inside the room
 * (a room made smaller keeps its lights, pulled in to its walls rather than
 * left hanging outside them), and its height from its mount.
 */
export function lightSpot(r, l) {
  const k = LIGHT_KINDS[l.kind] || LIGHT_KINDS.ceiling,
    hx = Math.max(0, r.width / 2 - 6),
    hz = Math.max(0, r.depth / 2 - 6),
    ox = Math.max(-hx, Math.min(hx, l.x || 0)),
    oz = Math.max(-hz, Math.min(hz, l.z || 0));
  const y = k.mount === "ceiling" ? Math.max(12, r.height - k.drop) : Math.min(k.y, r.height - 6);
  return { x: r.x + ox, y, z: r.z + oz, ox, oz };
}

/**
 * Luminous intensity in candela for three.js's physically based lights, which
 * take candela for a point light. A bare bulb spreads its lumens over the
 * whole sphere (4π sr); a downlight puts them into the half below it.
 */
export const candela = (l) => (Math.max(0, l.lumens || 0) / (4 * Math.PI)) * (l.kind === "recessed" ? 2 : 1);

export function validLights(lights) {
  if (lights === undefined) return true;
  if (!Array.isArray(lights) || lights.length > MAX_LIGHTS) return false;
  const ids = new Set();
  for (const l of lights) {
    if (!l || typeof l !== "object") return false;
    if (typeof l.id !== "string" || !l.id || l.id.length > 200 || ids.has(l.id)) return false;
    ids.add(l.id);
    if (!(l.kind in LIGHT_KINDS)) return false;
    if (!fin(l.x, -600, 600) || !fin(l.z, -600, 600)) return false;
    if (!fin(l.lumens, ...LIGHT_LIMITS.lumens) || !fin(l.kelvin, ...LIGHT_LIMITS.kelvin)) return false;
    if (l.on !== undefined && typeof l.on !== "boolean") return false;
  }
  return true;
}

// ---------------------------------------------------------------- daylight

export const DAYLIGHT_DEFAULTS = { on: false, hour: 15, month: 6, latitude: 40, north: 0 };
export const DAYLIGHT_LIMITS = {
  hour: [4, 22],
  month: [1, 12],
  latitude: [-66, 66],
  north: [0, 359],
};
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const daylightSpec = (b) => ({ ...DAYLIGHT_DEFAULTS, ...(b?.daylight && typeof b.daylight === "object" ? b.daylight : {}) });

export function validDaylight(d) {
  if (d === undefined) return true;
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  if (typeof d.on !== "boolean") return false;
  for (const k of Object.keys(DAYLIGHT_LIMITS)) if (d[k] !== undefined && !fin(d[k], ...DAYLIGHT_LIMITS[k])) return false;
  return true;
}

const RAD = Math.PI / 180;

/**
 * The sun's altitude above the horizon and its azimuth clockwise from true
 * north, both in degrees, at local solar time `hour` in the middle of
 * `month` at `latitude`. A negative altitude is night.
 */
export function sunPosition(hour, month, latitude) {
  const day = Math.round(30.44 * (month - 1) + 15),
    decl = 23.44 * Math.sin((2 * Math.PI * (284 + day)) / 365) * RAD,
    lat = latitude * RAD,
    h = 15 * (hour - 12) * RAD;
  const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h));
  // Measured from south, westward positive; turned to "from north, clockwise".
  const fromSouth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
  const az = (((fromSouth / RAD + 180) % 360) + 360) % 360;
  return { altitude: alt / RAD, azimuth: az };
}

/**
 * The unit vector from the house towards the sun in scene axes — +X east,
 * −Z the plan's north, +Y up — with `north` the compass bearing the plan's
 * north actually faces. Also its altitude, which the scene uses for the
 * sun's strength and colour.
 */
export function sunDirection(d) {
  const s = daylightSpec({ daylight: d });
  const { altitude, azimuth } = sunPosition(s.hour, s.month, s.latitude);
  const a = (azimuth - s.north) * RAD,
    e = altitude * RAD;
  return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: -Math.cos(a) * Math.cos(e), altitude };
}

/**
 * How strong and how warm the sun is at `altitude` degrees: nothing below
 * the horizon, a low orange sun near it, white and full overhead. Strength
 * is a multiplier on the scene's sun, not a physical irradiance.
 */
export function sunLook(altitude) {
  if (altitude <= 0) return { strength: 0, kelvin: 2000 };
  const t = Math.min(1, altitude / 40);
  return { strength: 0.25 + 2.75 * Math.sin((Math.min(altitude, 90) * Math.PI) / 180) ** 0.6, kelvin: Math.round(2400 + 3100 * t) };
}

/** "3:15 pm" for a fractional hour. */
export function hourLabel(hour) {
  const h = Math.floor(hour),
    m = Math.round((hour - h) * 60),
    hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
