import { validViews } from "./views.js";
import { editedAspect, validImageEdits } from "./image-edit.js";
import { SHADOW_FIELD, SHADOW_MAX, shadowSpec } from "./dropshadow.js";
import { hasRow, normalizeRow, rowLayout, MAX_SLOTS, MIN_SPACE, MAX_SPACE, MAX_GAP } from "./row.js";
export const IN = 0.0254;
export const uid = () => globalThis.crypto.randomUUID();
export function blankProject() {
  return {
    schema: 1,
    units: "inches",
    id: uid(),
    name: "Spring booth",
    mode: "3d",
    booth: {
      width: 120,
      depth: 120,
      height: 96,
      tent: false,
      tentStyle: "classic",
      // Which kind of show this booth is for. "outdoor" is the pop-up canopy
      // this app has always drawn; "artshow" is an indoor convention booth:
      // seamless white pro-panel walls, a light bar instead of a canopy, and
      // an exhibition hall around it. Optional, so a schema-1 backup written
      // before it existed loads as the outdoor booth it was.
      venue: "outdoor",
      // The floor: either a shipped kind or "upload:<asset id>", one choice
      // from one list. See GROUND_KINDS below for why it holds both.
      ground: "studio",
      // The kind to come back to when an uploaded ground is deleted. Optional,
      // and only ever a preset kind.
      groundPreset: "studio",
      horizon: "studio",
      neighbors: false,
      neighborLayout: "inline",
      neighborGap: 24,
      neighborRear: false,
      rearGap: 24,
      color: "#45474a",
      // Panel finish. "smooth" is the printed vinyl this has always drawn;
      // "fabric" puts a woven relief over the same colour, the way a fabric
      // pro-panel wall looks. wallTexture is how far up that relief is turned.
      wallFinish: "smooth",
      wallTexture: 60,
      // How wide a lens the spherical backdrop is drawn through, as a
      // percentage of the camera's own. 100 matches the camera; lower pulls the
      // environment back and reduces the magnification a 1K panorama suffers.
      // See BACKDROP_FRAMING in scene.js.
      backdropFraming: 65,
      // Vertical aim of the spherical backdrop, in degrees. Pan is
      // surroundRotation; this is the other axis of the same tripod head.
      // Positive lifts the horizon into frame. Optional, so a schema-1 backup
      // written before it existed still loads.
      backdropTilt: 0,
      // Keeps the photographed horizon fixed against the floor when the camera
      // pitches; see lockedPitch in scene.js.
      backdropLock: true,
      // Whether the spotlight housings are drawn beside the fixed light rail.
      // "auto" hides them under an indoor preset, where the hall's own track
      // lighting is already in the picture. Optional: a backup written before
      // it existed loads with the same default.
      fixtures: "auto",
      // The drawn shadows a hung work throws onto the wall behind it —
      // `shadowBehind`, `shadowUnder` and the global light `shadowAngle` —
      // are deliberately absent here: absent is the default everywhere that
      // reads them (see src/dropshadow.js), so a booth nobody has tuned
      // follows the defaults if they are retuned, and each record is written
      // the first time one of its controls is touched. An older booth's
      // `dropShadow` is still read, for the shadow behind.
      // A single edge colour for every work in the booth. Off by default, so
      // each placement keeps its own `edgeColor`; switched on, one colour
      // answers for all of them and the per-work swatch says where it comes
      // from. Two optional keys, never a changed meaning: `a.edgeColor` is
      // still what a work carries and still what it goes back to.
      edgeUniversal: false,
      edgeColor: "#b7a68b",
      // Figures for scale. Optional and empty by default, so a schema-1 backup
      // written before they existed loads unchanged; see src/people.js.
      people: [],
      walls: {
        back: { enabled: true, width: 120, height: 96 },
        left: { enabled: true, width: 120, height: 96 },
        right: { enabled: true, width: 120, height: 96 },
      },
      // Free-standing interior walls. A separate optional list rather than
      // more keys in `walls`, because `walls` is a fixed record that six
      // places assume the shape of, and because a schema-1 backup written
      // before panels existed has no key here at all and must still load.
      // x/z are inches from the booth centre (+x right, +z toward the
      // entrance), rotation is degrees about the vertical axis.
      panels: [],
      // The modular panel an art-show wall is built from. The walls keep
      // their own authoritative width and height; this is the module they
      // can be rebuilt from, and `linked` is what says they should be.
      artShow: { ...ART_SHOW_PANEL },
      // A light bar across the booth with directional heads spotting each
      // wall. Derived scenery, not spotlights in `p.lights`: nine fixtures
      // would fill that list four times over, and their aim is a consequence
      // of the booth's own measurements rather than something to type.
      lightBar: { ...LIGHT_BAR },
      // The white exhibition hall an indoor booth stands in.
      hall: { ...HALL },
      // Free-standing pedestals: a plinth with a solid top for cards, a
      // tablet or a guest book. Placed and dragged the way a free-standing
      // wall is, and like `panels` absent from every older backup.
      pedestals: [],
    },
    art: [],
    assets: {},
    ambient: 1.25,
    lights: [
      {
        id: uid(),
        x: -28,
        y: 91,
        z: 24,
        tx: -28,
        ty: 56,
        tz: -59,
        power: 75,
        kelvin: 4000,
      },
      {
        id: uid(),
        x: 28,
        y: 91,
        z: 24,
        tx: 28,
        ty: 56,
        tz: -59,
        power: 75,
        kelvin: 4000,
      },
    ],
    photo: { asset: null, layers: [], lights: [], exposure: 0 },
    editClipboard: null,
  };
}
export function demoProject() {
  const p = blankProject();
  [
    ["back", 12, 32, 36, 48],
    ["back", 60, 44, 36, 36],
    ["left", 23, 32, 36, 48],
    ["left", 73, 44, 24, 36],
    ["right", 20, 32, 48, 48],
    ["right", 80, 44, 24, 36],
  ].forEach(([wall, x, y, w, h], i) =>
    p.art.push({
      id: uid(),
      asset: null,
      title: `Sample panel ${String(i + 1).padStart(2, "0")}`,
      wall,
      x,
      y,
      w,
      h,
      thickness: 1.5,
      offset: 0.75,
    }),
  );
  return p;
}
/**
 * The art-show booth, as asked for and as measured: a 144″ wide back wall and
 * 120″ side walls, all 144″ tall, in white, with no seams. These are the
 * defaults the venue switch writes; every one of them stays editable
 * afterwards, which is what "custom booth dimensions" means here.
 */
export const ART_SHOW = {
  width: 144,
  depth: 120,
  height: 144,
  backWidth: 144,
  sideWidth: 120,
  wallHeight: 144,
  color: "#f4f3f0",
};
/** The outdoor pop-up this app has always opened with. */
export const OUTDOOR = {
  width: 120,
  depth: 120,
  height: 96,
  backWidth: 120,
  sideWidth: 120,
  wallHeight: 96,
  color: "#45474a",
};
/** The individual display panel an art-show wall is built from. */
export const ART_SHOW_PANEL = { width: 38, height: 144, linked: false };
// The top of the Diffusion scale. It was 1 — "a fully frosted head" — until a
// booth was looked at on a real monitor and reported as still harsh with the
// slider at its maximum. The scale now runs to 3, and the extra travel is not
// more frost: past 1 the hall itself takes over, opening the cones until they
// stop reading as cones at all and letting the bounce off white walls do the
// lighting. See `lightBarOptics`, which is where the two halves are written
// out and where the reason each number stops where it does is recorded.
//
// **0..1 means exactly what it meant before.** Widening the range would have
// been worthless if it moved the numbers underneath an already-composed booth:
// a backup saved at 0.7 must light identically today. `lightBarOptics` is
// piecewise for that reason alone, and `tests/artshow.test.js` pins the old
// endpoints against literals rather than against the curve that produces them.
export const DIFFUSION_MAX = 3;
// What the Fixture brightness slider offers, which is deliberately not what
// the schema accepts. The slider is a percentage of a bar that reads right:
// 0 is dark, 50 is the default, 100 is twice the default and already more
// than anyone wanted. The stored unit is unchanged and unchangeable — the
// schema accepts 0..300 and always will, because narrowing a stored range
// would refuse to open a backup that is already on someone's disk — so the
// slider carries a scale instead, and `LIGHT_BAR_POWER_STEP` stored units is
// one point of it.
//
// The numbers underneath moved twice, both times after someone looked at a
// real monitor. 300 units of travel in steps of 5 squeezed the whole useful
// range into the first fifth, so the control felt like it had two settings;
// 70 was then called "beyond bright" and 60 — the old default — was still
// much too hot. 8 stored units is where the bar was judged to look right, so
// 8 is what the middle of the slider means and what a new booth opens at.
//
// A booth saved brighter than 100 keeps its value and widens its own slider
// rather than being dragged down the moment the panel is drawn; see
// `lightBarLevels` in main.js. That is why this is a slider maximum and not a
// clamp, and it is the same move as `panelSlider`, `artSlider` and the
// diffusion scale above.
export const LIGHT_BAR_POWER_SLIDER_MAX = 100;
export const LIGHT_BAR_POWER_STEP = 0.16;
export const LIGHT_BAR = {
  on: true,
  height: 132,
  count: 9,
  power: 8,
  kelvin: 3500,
  // How diffused the wall wash is, 0..DIFFUSION_MAX. A real art-fair bar
  // carries a frost or a barn-door diffuser over each head, and the hall's
  // white walls bounce the rest; a bare point source aimed at a wall is what
  // makes nine heads read as nine hot pools with nine crossing shadows behind
  // every pedestal. 0 is the bare source, 1 is a fully frosted head, 3 is a
  // booth lit mostly by the room. See `lightBarOptics`.
  //
  // The default was 0.7 and is 1.5: 0.7 was a number chosen rather than
  // derived, and the first person to judge it on a real monitor said it was
  // still harsh. 1.5 is half again past what the old scale could reach at all.
  // It is a judgement made by eye, which is exactly the kind of thing a later
  // diff will "clean up" back to a rounder number — don't.
  diffusion: 1.5,
};
// 30 foot ceilings, as asked. The ceiling itself is off by default: it is
// almost always out of frame, and drawing it puts a grey wash over the booth.
export const HALL = { on: false, ceiling: 360, showCeiling: false };
export const VENUES = { outdoor: "Outdoor · pop-up canopy", artshow: "Art show · indoor booth" };
/** Accepts a project or a booth: the scene has one, the environment the other. */
export const isArtShow = (p) => ((p?.booth || p)?.venue || "outdoor") === "artshow";
/** Defaults filled in, so a backup written before these existed reads whole. */
export const artShowPanel = (b) => ({ ...ART_SHOW_PANEL, ...(b.artShow || {}) });
export const lightBarSpec = (b) => ({ ...LIGHT_BAR, ...(b.lightBar || {}) });
export const hallSpec = (b) => ({ ...HALL, ...(b.hall || {}) });
/**
 * Switch a booth between the two venues. Everything it writes is a default a
 * user can then change; what it must not do is leave a booth in a state its
 * own venue cannot describe — an art show with a canopy over it, or an
 * outdoor pop-up with 12ft walls it never asked for.
 */
export function applyVenue(p, venue) {
  const spec = venue === "artshow" ? ART_SHOW : OUTDOOR;
  const b = p.booth;
  b.venue = venue === "artshow" ? "artshow" : "outdoor";
  b.width = spec.width;
  b.depth = spec.depth;
  b.height = spec.height;
  b.color = spec.color;
  b.walls.back = { ...b.walls.back, width: spec.backWidth, height: spec.wallHeight };
  b.walls.left = { ...b.walls.left, width: spec.sideWidth, height: spec.wallHeight };
  b.walls.right = { ...b.walls.right, width: spec.sideWidth, height: spec.wallHeight };
  if (venue === "artshow") {
    // A hall has a roof of its own; a canopy indoors is a contradiction.
    b.tent = false;
    b.ground = "studio";
    b.groundPreset = "studio";
    b.horizon = "studio";
    // The neutral studio environment, not whatever photographed hall was
    // selected before. An HDRI of a warehouse or an outdoor art fair behind a
    // seamless white indoor booth is the surroundings of one venue lit onto
    // another, and it reads exactly as wrong as it is. Like everything else
    // here it is a default: the Environment picker still works afterwards.
    b.envPreset = "studio";
    b.wallFinish = "smooth";
    b.artShow = { ...artShowPanel(b), height: spec.wallHeight };
    b.lightBar = { ...lightBarSpec(b), on: true };
    b.hall = { ...hallSpec(b), on: true };
  } else {
    b.hall = { ...hallSpec(b), on: false };
    b.lightBar = { ...lightBarSpec(b), on: false };
  }
  // Art already hanging is measured against walls that just changed size.
  p.art = p.art.map((a) => constrain(p, a));
  p.booth.panels = boothPanels(p).map((panel) => constrainPanel(p, panel));
  p.booth.pedestals = boothPedestals(p).map((ped) => constrainPedestal(p, ped));
  return p;
}
/**
 * How many whole panels of the current module a wall is, and what it would
 * measure if it were built from them. Nothing is rewritten here: the readout
 * is what makes the module mean something on a wall whose width is its own.
 */
export function panelCount(p, key) {
  const spec = wallSpec(p, key), module = artShowPanel(p.booth);
  if (!spec || !(module.width > 0)) return 0;
  return Math.max(1, Math.round(spec.width / module.width));
}
/**
 * Rebuild the three perimeter walls from the panel module: each takes the
 * whole number of panels its current width is nearest to, at the module's
 * width and height — so a rebuild leaves the booth about the size it already
 * was, snapped to panels, rather than to whatever count it happened to have
 * at the old width. The footprint follows, because a wall wider than the
 * booth is not a booth anyone can build.
 */
export function relinkArtShowWalls(p) {
  const module = artShowPanel(p.booth);
  const counts = {};
  for (const key of ["back", "left", "right"]) counts[key] = panelCount(p, key);
  for (const key of ["back", "left", "right"]) {
    const width = Math.max(12, Math.min(360, counts[key] * module.width));
    p.booth.walls[key] = {
      ...p.booth.walls[key],
      width: Math.round(width * 100) / 100,
      height: module.height,
    };
  }
  p.booth.width = Math.max(48, Math.min(360, p.booth.walls.back.width));
  p.booth.depth = Math.max(48, Math.min(360, p.booth.walls.left.width));
  p.booth.height = Math.max(48, Math.min(144, module.height));
  p.art = p.art.map((a) => constrain(p, a));
  return p;
}
/**
 * Whether a piece someone added — a pedestal or piece of furniture, a
 * free-standing wall, a figure — is in the booth. Each may carry an optional
 * `hidden: true`, asked for as "a hide button, so you don't need to delete —
 * you can just hide it": hidden is out of the picture, out of every export,
 * out of the floor plan and the packing list, and one click from back, with
 * its size and place kept. Absent means shown, which is what every older
 * backup meant.
 */
export const isShown = (item) => item?.hidden !== true;
export const PEDESTAL_PREFIX = "pedestal:";
// Raised from 8 when furniture joined the list: a 10 × 20 with two tables,
// chairs, a bin and a banner is a dozen things before a single pedestal.
export const MAX_PEDESTALS = 24;
/** The pedestal asked for: 44″ tall, 12 × 12, with a solid top. */
export const PEDESTAL = { width: 12, depth: 12, height: 44, color: "#f4f3f0" };
/**
 * Free-standing furniture. Each is a pedestal with a `kind`: the same list,
 * the same drag, sliders, rotation and limit, and a different shape when the
 * scene draws it. A pedestal saved before this has no kind and is still a
 * pedestal, which is what keeps schema 1 true.
 *
 * Sizes are the ones a show supplies or a booth buys: a folding table is 6′
 * or 8′ by 30″ at 30″ high, a retractable banner is about 33″ by 80″, a
 * gridwall panel is 2′ wide. Each is a starting point, typed over like any
 * pedestal's.
 */
export const FURNITURE = {
  pedestal: { label: "Pedestal", ...PEDESTAL },
  table6: { label: "Table 6′ with cloth", width: 72, depth: 30, height: 30, color: "#23262b" },
  table8: { label: "Table 8′ with cloth", width: 96, depth: 30, height: 30, color: "#23262b" },
  counter: { label: "Counter", width: 40, depth: 20, height: 40, color: "#f4f3f0" },
  chair: { label: "Chair", width: 18, depth: 18, height: 33, color: "#2e3034" },
  stool: { label: "Stool", width: 16, depth: 16, height: 30, color: "#2e3034" },
  bin: { label: "Print bin", width: 30, depth: 20, height: 32, color: "#8a6a4a" },
  // A gridwall panel is a sheet of wire; its depth is the footprint of its feet.
  gridwall: { label: "Gridwall panel", width: 24, depth: 12, height: 72, color: "#1e1f22" },
  banner: { label: "Banner stand", width: 33, depth: 12, height: 80, color: "#91beff" },
  tv: { label: "Screen on a stand", width: 44, depth: 20, height: 72, color: "#15171a" },
  // Draw-a-box: a plain block at any size — a riser, a plinth, a stage, a
  // custom counter. Drawn on the floor with the Box tool, then pulled up.
  box: { label: "Box · riser, plinth or stage", width: 48, depth: 24, height: 12, color: "#e9e6df" },
};
/** A drawn box may be far bigger than a piece of furniture: a stage. */
export const BOX_LIMITS = { width: [1, 360], depth: [1, 360], height: [1, 144] };
/** Models brought in as .glb, stood on the floor. */
export const MAX_MODELS = 8;
export const furnitureKind = (ped) => (ped?.kind && FURNITURE[ped.kind] ? ped.kind : "pedestal");
export const boothPedestals = (p) => p.booth.pedestals || [];
export const findPedestal = (p, id) =>
  boothPedestals(p).find((ped) => ped.id === id) || null;
/** A pedestal with its X/Z pulled back inside the footprint. Same rule a panel gets. */
export function constrainPedestal(p, ped) {
  const r = panelRange(p);
  return {
    ...ped,
    x: Math.max(-r.x, Math.min(r.x, ped.x)),
    z: Math.max(-r.z, Math.min(r.z, ped.z)),
  };
}
export const PANEL_PREFIX = "panel:";
export const panelKey = (id) => PANEL_PREFIX + id;
export const isPanelKey = (key) =>
  typeof key === "string" && key.startsWith(PANEL_PREFIX);
export const panelIdOf = (key) =>
  isPanelKey(key) ? key.slice(PANEL_PREFIX.length) : null;
export const boothPanels = (p) => p.booth.panels || [];
export const findPanel = (p, key) =>
  boothPanels(p).find((panel) => panel.id === panelIdOf(key)) || null;
/** Every wall a placement may name, perimeter walls first. */
export const wallKeys = (p) => [
  "back",
  "left",
  "right",
  ...boothPanels(p).map((panel) => panelKey(panel.id)),
];
/**
 * The width/height/enabled a placement is measured against, for a perimeter
 * wall or a free-standing panel alike. Every caller that used to index
 * `booth.walls` goes through here. A key naming a panel that no longer exists
 * returns null; callers treat that the way they treat a hidden wall.
 */
export function wallSpec(p, key) {
  if (isPanelKey(key)) {
    const panel = findPanel(p, key);
    // A hidden panel reads exactly as a switched-off perimeter wall does, so
    // everything that already skips one — the build, the art hung on it,
    // picking — skips a hidden panel too.
    return panel
      ? { enabled: isShown(panel), width: panel.width, height: panel.height, panel }
      : null;
  }
  return p.booth.walls[key] || null;
}
export const wallLabel = (p, key) => {
  const panel = findPanel(p, key);
  if (panel) return panel.name || "Panel";
  return key ? key[0].toUpperCase() + key.slice(1) + " wall" : "";
};
export const wallWidth = (p, wall) => wallSpec(p, wall)?.width ?? 0;
export function boundWarning(p, a) {
  const wall = wallSpec(p, a.wall);
  if (!wall) return "This wall no longer exists. Move the artwork in Layout.";
  if (!wall.enabled)
    return wall.panel
      ? "This free-standing wall is hidden. Its eye in the Walls tool shows it again."
      : "This wall is hidden. Enable it in Layout.";
  if (
    a.x < 0 ||
    a.y < 0 ||
    a.x + a.w > wall.width + 0.001 ||
    a.y + a.h > wall.height + 0.001
  )
    return "Artwork extends beyond this wall. Adjust its size or placement.";
  return "";
}
export function constrain(p, a) {
  const wall = wallSpec(p, a.wall);
  if (!wall) return { ...a };
  const w = wall.width,
    h = wall.height;
  return {
    ...a,
    x: Math.max(0, Math.min(a.x, w - a.w)),
    y: Math.max(0, Math.min(a.y, h - a.h)),
  };
}
/** What the app leaves between two placements it positioned for you, in inches. */
export const PLACEMENT_GAP = 6;
/**
 * Where a placement the app positions lands so that it is not sitting on top
 * of one already there. Two panels at the same x, y and wall gap are coplanar,
 * and coplanar artwork does not read as two pictures — it reads as one picture
 * flickering, because the depth buffer has no way to choose between them. That
 * flicker was the visible half of uploading several images at once.
 *
 * It walks right along the row it was asked for, then down a row, then up,
 * and gives up quietly rather than refusing to place anything: an overlap the
 * user can drag apart beats a file that seems not to have arrived.
 */
export function openSpot(p, a) {
  const wall = wallSpec(p, a.wall);
  if (!wall) return { ...a };
  const face = a.face || "inside";
  const taken = p.art.filter(
    // A booth of its own is a wall of its own: two works at the same spot on
    // the same wall of two different booths are not on top of each other.
    (o) =>
      o.id !== a.id &&
      o.wall === a.wall &&
      (o.face || "inside") === face &&
      (o.booth || null) === (a.booth || null),
  );
  const clear = (x, y) =>
    !taken.some(
      (o) => x < o.x + o.w && o.x < x + a.w && y < o.y + o.h && o.y < y + a.h,
    );
  const rows = [];
  for (let y = a.y; y >= 0; y -= a.h + PLACEMENT_GAP) rows.push(y);
  for (let y = a.y + a.h + PLACEMENT_GAP; y + a.h <= wall.height; y += a.h + PLACEMENT_GAP)
    rows.push(y);
  for (const y of rows)
    for (let x = a.x; x + a.w <= wall.width + 0.001; x += a.w + PLACEMENT_GAP)
      if (clear(x, y)) return { ...a, x: +x.toFixed(3), y: +y.toFixed(3) };
  return { ...a };
}
/**
 * The travel of a free-standing wall's position sliders and of a drag across
 * the floor: the booth's own footprint, measured from the centre. A panel is
 * an interior fitting, so that is the useful range — the stored schema has
 * always allowed +/-360 and still does, which is what lets a typed or imported
 * position outside the booth keep its meaning.
 */
export const panelRange = (p) => ({
  x: p.booth.width / 2,
  z: p.booth.depth / 2,
});
/** A panel with its X/Z pulled back inside the footprint. Everything else is untouched. */
export function constrainPanel(p, panel) {
  const r = panelRange(p);
  return {
    ...panel,
    x: Math.max(-r.x, Math.min(r.x, panel.x)),
    z: Math.max(-r.z, Math.min(r.z, panel.z)),
  };
}
export function mismatch(p, a) {
  const asset = p.assets[a.asset];
  return (
    !!asset &&
    Math.abs(a.w / a.h - editedAspect(asset, a.edits)) /
      editedAspect(asset, a.edits) >
      0.015
  );
}
// The floor is one choice from two groups: the six shipped PBR kinds, and the
// user's own photographs. `booth.ground` holds either — a kind, or
// "upload:<asset id>" — which is the widened-enum move `a.wall` uses in
// WALLS_PHASE.md. Before this an upload sat in `booth.groundAsset` and
// silently outranked the kind, so picking Grass appeared to do nothing; that
// was two different things competing for one slot, and it was reported as a
// broken dropdown three times. `booth.groundAsset` is still read — see
// groundUpload and adoptGroundAsset — and the floor it names is never dropped.
export const GROUND_KINDS = ["studio", "grass", "concrete", "asphalt", "carpet", "wood"];
export const GROUND_UPLOAD = "upload:";
const uploadRef = (value) =>
  typeof value === "string" && value.startsWith(GROUND_UPLOAD)
    ? value.slice(GROUND_UPLOAD.length)
    : null;
/** The asset id of the photograph covering the floor, or null for a kind. */
export function groundUpload(p) {
  const chosen = uploadRef(p.booth?.ground);
  // An id with no asset behind it is not a floor; groundKind then answers.
  if (chosen && p.assets?.[chosen]) return chosen;
  // A backup read straight into the scene without passing through
  // adoptGroundAsset still shows the photograph it was saved with.
  const legacy = p.booth?.groundAsset;
  return legacy && p.assets?.[legacy] ? legacy : null;
}
/** The shipped kind to draw, or null while a photograph covers the floor. */
export function groundKind(p) {
  if (groundUpload(p)) return null;
  for (const value of [p.booth?.ground, p.booth?.groundPreset])
    if (GROUND_KINDS.includes(value)) return value;
  return "studio";
}
/** The user's uploaded grounds, as the picker's second group. */
export const groundLibrary = (p) =>
  Object.entries(p.assets || {})
    .filter(([, asset]) => asset?.role === "ground")
    .map(([id, asset]) => ({ id, name: asset.name || "Ground photograph" }));
/** Choose a floor: a kind, or "upload:<asset id>". */
export function selectGround(p, value) {
  const upload = uploadRef(value);
  if (upload) {
    if (p.assets?.[upload]) p.booth.ground = GROUND_UPLOAD + upload;
    return;
  }
  if (!GROUND_KINDS.includes(value)) return;
  p.booth.ground = value;
  p.booth.groundPreset = value;
}
/** Delete a library entry, falling back to the last preset if it was showing. */
export function removeGroundUpload(p, assetId) {
  if (p.assets?.[assetId]?.role !== "ground") return;
  // Shared with a placement — only the floor's claim on it is given up.
  if (!p.art.some((a) => a.asset === assetId) && p.photo?.asset !== assetId)
    delete p.assets[assetId];
  if (p.booth.groundAsset === assetId) p.booth.groundAsset = null;
  if (uploadRef(p.booth.ground) === assetId)
    p.booth.ground = GROUND_KINDS.includes(p.booth.groundPreset)
      ? p.booth.groundPreset
      : "studio";
}
/** Read an older backup's single ground override as the first library entry. */
export function adoptGroundAsset(p) {
  const id = p.booth?.groundAsset;
  if (!id || !p.assets?.[id]) return p;
  p.assets[id].role = "ground";
  if (GROUND_KINDS.includes(p.booth.ground) && p.booth.groundPreset === undefined)
    p.booth.groundPreset = p.booth.ground;
  p.booth.ground = GROUND_UPLOAD + id;
  p.booth.groundAsset = null;
  return p;
}
export const MAX_PANELS = 8;
const finite = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function validateProject(p) {
  const fail = () => {
    throw new Error(
      "This is not a valid Booth Studio v1 backup. Your current project was kept.",
    );
  };
  if (
    !p ||
    p.schema !== 1 ||
    p.units !== "inches" ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !Array.isArray(p.art) ||
    p.art.length > 200 ||
    !p.booth ||
    !p.assets ||
    !Array.isArray(p.lights) ||
    p.lights.length > 4 ||
    !p.photo
  )
    fail();
  if (
    !finite(p.booth.width, 48, 360) ||
    !finite(p.booth.depth, 48, 360) ||
    !finite(p.booth.height, 48, 144) ||
    !/^#[0-9a-f]{6}$/i.test(p.booth.color) ||
    typeof p.booth.tent !== "boolean"
  )
    fail();
  for (const [key, values] of Object.entries({tentStyle:["classic","peak","barrel","dome"],horizon:["studio","open","park","urban"],wallFinish:["smooth","fabric"]})) {
    if (p.booth[key] !== undefined && !values.includes(p.booth[key])) fail();
  }
  // A kind, or an upload id that names an asset actually in this backup.
  if (
    p.booth.ground !== undefined &&
    !GROUND_KINDS.includes(p.booth.ground) &&
    !(typeof p.booth.ground === "string" &&
      p.booth.ground.startsWith(GROUND_UPLOAD) &&
      p.assets[p.booth.ground.slice(GROUND_UPLOAD.length)])
  )
    fail();
  if (p.booth.groundPreset !== undefined && !GROUND_KINDS.includes(p.booth.groundPreset)) fail();
  if (p.booth.neighbors !== undefined && typeof p.booth.neighbors !== "boolean") fail();
  // The booth row. Optional, so every backup written before it existed loads
  // as the one booth it described. Every id is checked here because the slot
  // a work hangs in is looked up by id below.
  if (p.booth.row !== undefined) {
    const r = p.booth.row;
    if (!r || typeof r !== "object" || !Array.isArray(r.slots) || r.slots.length > MAX_SLOTS) fail();
    if (r.gap !== undefined && !finite(r.gap, 0, MAX_GAP)) fail();
    const slotIds = new Set();
    for (const slot of r.slots) {
      if (!slot || typeof slot !== "object" || typeof slot.id !== "string" || !slot.id || slotIds.has(slot.id)) fail();
      if (!["booth", "space"].includes(slot.kind)) fail();
      if (slot.kind === "space" && !finite(slot.width, MIN_SPACE, MAX_SPACE)) fail();
      if (slot.name !== undefined && (typeof slot.name !== "string" || slot.name.length > 200)) fail();
      slotIds.add(slot.id);
    }
    if (typeof r.home !== "string" || !r.slots.some(s => s.id === r.home && s.kind === "booth")) fail();
  }
  if (p.booth.venue !== undefined && !["outdoor", "artshow"].includes(p.booth.venue)) fail();
  // The panel module, the light bar and the hall are all optional records.
  // Undefined means "the defaults above", which is exactly what every backup
  // written before this release says.
  if (p.booth.artShow !== undefined) {
    const a = p.booth.artShow;
    if (
      !a ||
      typeof a !== "object" ||
      !finite(a.width, 6, 360) ||
      !finite(a.height, 24, 144) ||
      (a.linked !== undefined && typeof a.linked !== "boolean")
    )
      fail();
  }
  if (p.booth.lightBar !== undefined) {
    const l = p.booth.lightBar;
    if (
      !l ||
      typeof l !== "object" ||
      typeof l.on !== "boolean" ||
      !finite(l.height, 24, 240) ||
      !finite(l.count, 1, 24) ||
      l.count !== Math.round(l.count) ||
      !finite(l.power, 0, 300) ||
      !finite(l.kelvin, 2700, 6500) ||
      (l.diffusion !== undefined && !finite(l.diffusion, 0, DIFFUSION_MAX))
    )
      fail();
  }
  if (p.booth.hall !== undefined) {
    const h = p.booth.hall;
    if (!h || typeof h !== "object" || typeof h.on !== "boolean" || !finite(h.ceiling, 96, 720))
      fail();
    if (h.showCeiling !== undefined && typeof h.showCeiling !== "boolean") fail();
  }
  if (p.booth.pedestals !== undefined) {
    if (!Array.isArray(p.booth.pedestals) || p.booth.pedestals.length > MAX_PEDESTALS) fail();
    const seen = new Set();
    for (const ped of p.booth.pedestals) {
      if (
        !ped ||
        typeof ped.id !== "string" ||
        !ped.id ||
        ped.id.length > 200 ||
        seen.has(ped.id) ||
        !finite(ped.width, ...(ped.kind === "box" ? BOX_LIMITS.width : [4, 96])) ||
        !finite(ped.depth, ...(ped.kind === "box" ? BOX_LIMITS.depth : [4, 96])) ||
        !finite(ped.height, ...(ped.kind === "box" ? BOX_LIMITS.height : [6, 96])) ||
        !finite(ped.x, -360, 360) ||
        !finite(ped.z, -360, 360) ||
        !finite(ped.rotation, -180, 180)
      )
        fail();
      if (ped.name !== undefined && (typeof ped.name !== "string" || ped.name.length > 200)) fail();
      if (ped.color !== undefined && !/^#[0-9a-f]{6}$/i.test(ped.color)) fail();
      if (ped.kind !== undefined && !Object.hasOwn(FURNITURE, ped.kind)) fail();
      if (ped.hidden !== undefined && typeof ped.hidden !== "boolean") fail();
      seen.add(ped.id);
    }
  }
  for (const wall of ["back", "left", "right"]) {
    let w = p.booth.walls?.[wall];
    if (
      !w ||
      typeof w.enabled !== "boolean" ||
      !finite(w.width, 12, wall === "back" ? p.booth.width : p.booth.depth) ||
      !finite(w.height, 24, 144)
    )
      fail();
  }
  if (p.booth.neighborLayout !== undefined && !["inline","corner-left","corner-right","island"].includes(p.booth.neighborLayout)) fail();
  for (const key of ["neighborGap", "rearGap"]) if (p.booth[key] !== undefined && !finite(p.booth[key], 0, 240)) fail();
  if (p.booth.neighborRear !== undefined && typeof p.booth.neighborRear !== "boolean") fail();
  if (p.booth.surroundAsset != null && (typeof p.booth.surroundAsset !== "string" || !p.assets[p.booth.surroundAsset])) fail();
  if (p.booth.surroundRotation !== undefined && !finite(p.booth.surroundRotation, -180, 180)) fail();
  if (p.booth.groundAsset != null && (typeof p.booth.groundAsset !== "string" || !p.assets[p.booth.groundAsset])) fail();
  if (p.booth.groundTile !== undefined && !finite(p.booth.groundTile, 12, 240)) fail();
  if (p.booth.wallTexture !== undefined && !finite(p.booth.wallTexture, 0, 100)) fail();
  if (p.booth.backdropFraming !== undefined && !finite(p.booth.backdropFraming, 25, 100)) fail();
  if (p.booth.backdropTilt !== undefined && !finite(p.booth.backdropTilt, -45, 45)) fail();
  if (p.booth.backdropLock !== undefined && typeof p.booth.backdropLock !== "boolean") fail();
  if (p.booth.fixtures !== undefined && !["auto", "always", "never"].includes(p.booth.fixtures)) fail();
  // Whether the figures are drawn. Optional and absent from every backup
  // written before it, so undefined means "shown", which is what they all say.
  // 3D models brought in as .glb: each names a model asset in this backup.
  if (p.booth.models !== undefined) {
    if (!Array.isArray(p.booth.models) || p.booth.models.length > MAX_MODELS) fail();
    const seenModels = new Set();
    for (const m of p.booth.models) {
      if (
        !m ||
        typeof m !== "object" ||
        typeof m.id !== "string" ||
        !m.id ||
        m.id.length > 200 ||
        seenModels.has(m.id) ||
        typeof m.asset !== "string" ||
        p.assets[m.asset]?.role !== "model" ||
        !finite(m.height, 1, 240) ||
        !finite(m.x, -600, 600) ||
        !finite(m.z, -600, 600) ||
        !finite(m.rotation, -360, 360)
      )
        fail();
      if (m.name !== undefined && (typeof m.name !== "string" || m.name.length > 200)) fail();
      if (m.hidden !== undefined && typeof m.hidden !== "boolean") fail();
      seenModels.add(m.id);
    }
  }
  // Saved views: optional, so every backup written before them opens.
  if (!validViews(p.views)) fail();
  // The floor plan underlay: an image of the venue's plan laid on the floor
  // at a real width. Optional; when present it must name an image in this
  // backup, or it would be a plan of nothing.
  if (p.booth.underlay !== undefined) {
    const u = p.booth.underlay;
    if (
      !u ||
      typeof u !== "object" ||
      typeof u.asset !== "string" ||
      !p.assets[u.asset] ||
      !finite(u.width, 12, 24000) ||
      !finite(u.x, -24000, 24000) ||
      !finite(u.z, -24000, 24000) ||
      !finite(u.rotation, -360, 360) ||
      !finite(u.opacity, 0, 1) ||
      (u.on !== undefined && typeof u.on !== "boolean")
    )
      fail();
  }
  if (p.booth.showPeople !== undefined && typeof p.booth.showPeople !== "boolean") fail();
  if (p.booth.people !== undefined) {
    if (!Array.isArray(p.booth.people) || p.booth.people.length > 6) fail();
    for (const person of p.booth.people) {
      if (!person || typeof person !== "object") fail();
      if (!["woman", "man"].includes(person.kind)) fail();
      if (!finite(person.height, 48, 84)) fail();
      if (!finite(person.x, -600, 600) || !finite(person.z, -600, 600)) fail();
      if (person.rotation !== undefined && !finite(person.rotation, -360, 360)) fail();
      if (person.hidden !== undefined && typeof person.hidden !== "boolean") fail();
    }
  }
  // Free-standing panels. Absent in every schema-1 backup written before they
  // existed, so undefined is valid and means "none".
  const panelIds = new Set();
  if (p.booth.panels !== undefined) {
    if (!Array.isArray(p.booth.panels) || p.booth.panels.length > MAX_PANELS) fail();
    for (const panel of p.booth.panels) {
      if (
        !panel ||
        typeof panel.id !== "string" ||
        !panel.id ||
        panel.id.length > 200 ||
        panelIds.has(panel.id) ||
        panel.id.includes(":") ||
        !finite(panel.width, 12, 360) ||
        !finite(panel.height, 24, 144) ||
        !finite(panel.x, -360, 360) ||
        !finite(panel.z, -360, 360) ||
        !finite(panel.rotation, -180, 180)
      )
        fail();
      if (panel.name !== undefined && (typeof panel.name !== "string" || panel.name.length > 200)) fail();
      if (panel.hidden !== undefined && typeof panel.hidden !== "boolean") fail();
      panelIds.add(panel.id);
    }
  }
  const ids = new Set();
  for (const a of p.art) {
    if (
      typeof a.id !== "string" ||
      ids.has(a.id) ||
      typeof a.title !== "string" ||
      a.title.length > 200 ||
      !(["back", "left", "right"].includes(a.wall) ||
        (isPanelKey(a.wall) && panelIds.has(panelIdOf(a.wall)))) ||
      !finite(a.w, 1, 360) ||
      !finite(a.h, 1, 360) ||
      !finite(a.x, -360, 360) ||
      !finite(a.y, -360, 360) ||
      !finite(a.thickness, 0.1, 12) ||
      !finite(a.offset, 0, 12)
    )
      fail();
    if (a.face !== undefined && !["inside", "outside"].includes(a.face)) fail();
    if (a.kind !== undefined && !["art", "sign", "label"].includes(a.kind)) fail();
    for (const key of ["artistName", "city", "medium", "price"])
      if (a[key] !== undefined && (typeof a[key] !== "string" || a[key].length > 200)) fail();
    if (a.sourceId !== undefined && (typeof a.sourceId !== "string" || a.sourceId.length > 200)) fail();
    // Which booth of the row it hangs in. Absent means this booth, which is
    // what every work in every older backup means.
    if (a.booth !== undefined && !(typeof a.booth === "string" && boothSlotIds(p.booth).has(a.booth))) fail();
    if (a.edits !== undefined && !validImageEdits(a.edits)) fail();
    if (a.stretch !== undefined && typeof a.stretch !== "boolean") fail();
    if (a.edgeTexture !== undefined && !["plain", "concrete", "wood", "metal"].includes(a.edgeTexture)) fail();
    if (a.edgeColor !== undefined && !/^#[0-9a-f]{6}$/i.test(a.edgeColor)) fail();
    ids.add(a.id);
    if (a.asset && !p.assets[a.asset]) fail();
  }
  if (p.editClipboard !== undefined && p.editClipboard !== null && !validImageEdits(p.editClipboard)) fail();
  if (Object.keys(p.assets).length > 250) fail();
  for (const asset of Object.values(p.assets)) {
    if (
      !asset ||
      !finite(asset.width, 1, 30000) ||
      !finite(asset.height, 1, 30000) ||
      (asset.role !== undefined && !["artwork", "photo", "surround", "ground", "underlay", "model"].includes(asset.role)) ||
      typeof asset.data !== "string" ||
      // An image, or — for a 3D model someone brought in — a binary glTF.
      !(asset.role === "model"
        ? /^data:model\/gltf-binary;base64,/.test(asset.data)
        : /^data:image\/(png|jpeg);base64,/.test(asset.data)) ||
      asset.data.length > 40000000 ||
      // Optional, and derived from `data` rather than standing in for it: a
      // small JPEG the library and the inspector show instead of asking the
      // browser for the original again on every re-render. A backup written
      // before it existed simply has none, and one is made on the way in.
      (asset.thumb !== undefined &&
        (typeof asset.thumb !== "string" ||
          !/^data:image\/(png|jpeg);base64,/.test(asset.thumb) ||
          asset.thumb.length > 400000))
    )
      fail();
  }
  // The drawn drop shadows. Absent is the default everywhere, so this only
  // has to refuse a value that is present and wrong. `dropShadow` is the
  // first version's record: never written now, and still read.
  if (p.booth.dropShadow !== undefined) {
    const s = p.booth.dropShadow;
    if (!s || typeof s !== "object") fail();
    if (s.on !== undefined && typeof s.on !== "boolean") fail();
    for (const key of ["darkness", "distance", "softness"])
      if (s[key] !== undefined && !finite(s[key], 0, 100)) fail();
  }
  for (const field of Object.values(SHADOW_FIELD)) {
    const s = p.booth[field];
    if (s === undefined) continue;
    if (!s || typeof s !== "object" || Array.isArray(s)) fail();
    for (const key of ["on", "global"])
      if (s[key] !== undefined && typeof s[key] !== "boolean") fail();
    for (const key of ["opacity", "spread"])
      if (s[key] !== undefined && !finite(s[key], 0, 100)) fail();
    for (const key of ["distance", "size"])
      if (s[key] !== undefined && !finite(s[key], 0, SHADOW_MAX)) fail();
    if (s.angle !== undefined && !finite(s.angle, -360, 360)) fail();
  }
  if (p.booth.shadowAngle !== undefined && !finite(p.booth.shadowAngle, -360, 360)) fail();
  if (p.booth.edgeUniversal !== undefined && typeof p.booth.edgeUniversal !== "boolean") fail();
  if (p.booth.edgeColor !== undefined && !/^#[0-9a-f]{6}$/i.test(p.booth.edgeColor)) fail();
  if (!finite(p.ambient, 0, 4)) fail();
  for (const l of p.lights) {
    for (const key of ["x", "z", "tx", "tz"])
      if (!finite(l[key], -360, 360)) fail();
    for (const key of ["y", "ty"]) if (!finite(l[key], 0, 160)) fail();
    if (!finite(l.power, 0, 300) || !finite(l.kelvin, 2700, 6500)) fail();
    // Hidden rather than deleted. Absent means shown, which is what every
    // light in every older backup means.
    if (l.on !== undefined && typeof l.on !== "boolean") fail();
  }
  if (
    !Array.isArray(p.photo.layers) ||
    p.photo.layers.length > 200 ||
    !Array.isArray(p.photo.lights) ||
    p.photo.lights.length > 8 ||
    !finite(p.photo.exposure, -1, 1) ||
    (p.photo.asset && !p.assets[p.photo.asset])
  )
    fail();
  for (const l of p.photo.layers) {
    if (
      !p.assets[l.asset] ||
      !Array.isArray(l.corners) ||
      l.corners.length !== 4 ||
      !l.corners.every(
        (c) =>
          Array.isArray(c) && c.length === 2 && c.every((n) => finite(n, 0, 1)),
      ) ||
      !finite(l.shadow, 0, 60)
    )
      fail();
  }
  for (const l of p.photo.lights) {
    if (
      !finite(l.x, 0, 1) ||
      !finite(l.y, 0, 1) ||
      !finite(l.radius, 0.02, 0.8) ||
      !finite(l.power, 0, 1) ||
      !finite(l.kelvin, 2700, 6500)
    )
      fail();
  }
  // Normalisation, after everything above has been checked: an older backup's
  // single ground override becomes an ordinary entry in the library.
  return adoptGroundAsset(p);
}
export const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Normalized square -> projective quadrilateral. Coordinates ordered TL, TR, BR, BL.
export function homography(q) {
  const [a, b, c, d] = q,
    dx1 = b[0] - c[0],
    dx2 = d[0] - c[0],
    dx3 = a[0] - b[0] + c[0] - d[0],
    dy1 = b[1] - c[1],
    dy2 = d[1] - c[1],
    dy3 = a[1] - b[1] + c[1] - d[1],
    den = dx1 * dy2 - dx2 * dy1;
  let g = 0,
    h = 0;
  if (Math.abs(den) > 1e-10) {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return (u, v) => {
    const z = g * u + h * v + 1;
    return [
      ((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) / z,
      ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) / z,
    ];
  };
}
export function convex(q) {
  return q.every((a, i) => {
    const b = q[(i + 1) % 4],
      c = q[(i + 2) % 4];
    return (
      (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0.00001
    );
  });
}

/**
 * Neighbors use nominal footprint-edge gaps in inches, not center spacing.
 *
 * Each neighbour is the same size as this booth. A hall sells a row of equal
 * pitches, so a 10 x 20 stand beside two hardcoded 10 x 10 ones was drawing a
 * row that no hall lays out — and, because the gap was measured to a 120-inch
 * neighbour's centre, a booth that was not 120 inches deep also put its
 * neighbours at the wrong distance. Both numbers come from `b` now.
 *
 * Each placement also carries which way its booth faces. The one behind is
 * turned around: it opens onto the next aisle, so what this booth sees over
 * its back wall is the back of another booth, not the inside of one. Left and
 * right share this booth's aisle and so share its facing.
 */
/** The ids of the booths in a row, home included. */
export function boothSlotIds(booth) {
  return new Set(rowLayout(booth).filter(s => s.kind === "booth").map(s => s.id));
}
export function neighborPlacements(b) {
  if (!b.neighbors) return [];
  const layout = b.neighborLayout || "inline", gap = b.neighborGap ?? 24;
  const result = [], width = b.width, depth = b.depth;
  const at = (side, x, z, rotation) => ({ side, x, z, rotation, width, depth });
  // A row is the aisle drawn by hand, so the decorative booths either side
  // would stand inside it. The one behind is a different axis and stays: a
  // row says nothing about what backs onto it.
  if (layout !== "island" && !hasRow(b)) {
    if (layout !== "corner-left") result.push(at("left", -(b.width/2 + gap + width/2), 0, 0));
    if (layout !== "corner-right") result.push(at("right", b.width/2 + gap + width/2, 0, 0));
  }
  if (b.neighborRear && layout !== "island")
    result.push(at("rear", 0, -(b.depth/2 + (b.rearGap ?? gap) + depth/2), 180));
  return result;
}
/** Uniform size adjustment preserves image proportions and the panel's center. */
export function scalePanel(p, a, factor) {
  const wall = wallSpec(p, a.wall);
  if (!wall) return { ...a };
  const low = Math.max(1 / a.w, 1 / a.h);
  const high = Math.max(low, Math.min(360 / a.w, 360 / a.h, wall.width / a.w, wall.height / a.h));
  const f = Math.max(low, Math.min(high, Number.isFinite(factor) ? factor : 1));
  const w = a.w * f, h = a.h * f;
  return constrain(p, {...a, w, h, x:a.x + (a.w-w)/2, y:a.y + (a.h-h)/2});
}

/**
 * The colour a work's edges are painted. A booth can hold one universal edge
 * colour for every work in it; with that off — the default — each placement
 * keeps its own, which is what it has always carried and what it returns to.
 * One function so the renderer, the inspector's swatch and the hanging guide
 * cannot disagree about which colour is showing.
 */
export const DEFAULT_EDGE_COLOR = "#b7a68b";
export const edgeColorOf = (booth, art = {}) =>
  booth?.edgeUniversal && booth.edgeColor
    ? booth.edgeColor
    : art.edgeColor || DEFAULT_EDGE_COLOR;
/** Whether a spotlight is showing. Absent means yes; see validate(). */
export const lightVisible = (light) => light?.on !== false;
export { shadowSpec };
