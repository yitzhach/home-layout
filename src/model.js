import { validViews } from "./views.js";
import { findRoomWall, homeRooms, wallOpenings, houseExtent, isRoomKey, roomWallLabel, roomWalls, starterRooms, validRooms } from "./rooms.js";
import { editedAspect, validImageEdits } from "./image-edit.js";
import { SHADOW_FIELD, SHADOW_MAX, shadowSpec } from "./dropshadow.js";
// Limits the booth app's row, venue, light bar and hall were stored within.
// Those features are gone, but backups carrying them must still load, so
// their records are still checked against what they were written to.
const MAX_SLOTS = 41, MIN_SPACE = 6, MAX_SPACE = 600, MAX_GAP = 240, DIFFUSION_MAX = 3;
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
 * A new home: the starter floor of rooms, and a booth's settings turned to an
 * interior. `blankProject` is still the base every record starts from — it is
 * what schema 1 was written against and what the older tests measure — so a
 * home is that base with its perimeter walls off (the rooms stand the walls),
 * its footprint grown to hold the rooms, a wood floor, pale walls and the
 * booth's two spotlights taken down, since a house is lit by its rooms.
 */
export function homeProject() {
  const p = blankProject();
  const b = p.booth;
  p.name = "My home";
  b.rooms = starterRooms();
  Object.assign(b, houseExtent(b.rooms));
  b.height = 96;
  b.color = "#eeebe4";
  b.ground = "concrete";
  b.groundPreset = "concrete";
  b.horizon = "studio";
  b.tent = false;
  for (const w of ["back", "left", "right"]) b.walls[w] = { enabled: false, width: Math.min(120, w === "back" ? b.width : b.depth), height: 96 };
  p.lights = [];
  p.ambient = 1.6;
  return p;
}
/** A home with a few sample works on the living room walls, for a first visit. */
export function demoHome() {
  const p = homeProject();
  const living = p.booth.rooms[0];
  const key = (side) => roomWalls(p).find((w) => w.room === living.id && w.side === side)?.key;
  [
    [key("n"), 60, 40, 36, 48],
    [key("n"), 108, 46, 24, 36],
    [key("w"), 110, 40, 40, 30],
  ].forEach(([wall, x, y, w, h], i) => {
    if (!wall) return;
    p.art.push({ id: uid(), asset: null, title: `Sample work ${String(i + 1).padStart(2, "0")}`, wall, x, y, w, h, thickness: 1.5, offset: 0.75 });
  });
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
export const MAX_PEDESTALS = 120;
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
  // The home set, listed in the picker by the room it usually stands in.
  // Sizes are the common ones — a queen bed, a three-seat sofa, a 25″-deep
  // kitchen counter at 36″ — and all of them are typed over afterwards.
  // Height is always the top of the piece as drawn: a bed's is its
  // headboard, a TV console's the top of its screen.
  sofa: { label: "Sofa", room: "Living", wall: true, width: 84, depth: 36, height: 34, color: "#7b8590" },
  armchair: { label: "Armchair", room: "Living", width: 34, depth: 34, height: 34, color: "#8c8577" },
  coffee: { label: "Coffee table", room: "Living", width: 48, depth: 24, height: 18, color: "#8a6a4a" },
  media: { label: "TV on a media console", room: "Living", wall: true, width: 60, depth: 18, height: 50, color: "#5a4636", limits: { width: [36, 120], depth: [12, 30], height: [30, 90] } },
  bookcase: { label: "Bookcase", room: "Living", wall: true, width: 36, depth: 12, height: 72, color: "#8a6a4a" },
  // A rug lies under the furniture, so clearance never reports it as
  // standing in anything; see `layer`.
  rug: { label: "Rug", room: "Living", width: 96, depth: 60, height: 0.5, color: "#b9a58a", layer: "under", limits: { width: [24, 240], depth: [24, 240], height: [0.25, 2] } },
  dining: { label: "Dining table", room: "Dining", width: 72, depth: 36, height: 30, color: "#8a6a4a" },
  chair: { label: "Chair", room: "Dining", width: 18, depth: 18, height: 33, color: "#2e3034" },
  bed: { label: "Bed · queen", room: "Bedroom", wall: true, width: 60, depth: 80, height: 44, color: "#9aa3ab", limits: { width: [30, 90], depth: [60, 96], height: [18, 72] } },
  nightstand: { label: "Nightstand", room: "Bedroom", wall: true, width: 20, depth: 16, height: 24, color: "#8a6a4a" },
  dresser: { label: "Dresser", room: "Bedroom", wall: true, width: 60, depth: 20, height: 32, color: "#8a6a4a" },
  desk: { label: "Desk", room: "Office", wall: true, width: 60, depth: 30, height: 30, color: "#8a6a4a" },
  counter: { label: "Kitchen counter", room: "Kitchen", wall: true, width: 96, depth: 25, height: 36, color: "#e9e6df", limits: { width: [12, 240], depth: [12, 40], height: [24, 48] } },
  // Upper cabinets hang over the counter, so like a rug they share its
  // floor space without standing in it. The height is to their top.
  wallcab: { label: "Wall cabinets", room: "Kitchen", wall: true, width: 72, depth: 12, height: 84, color: "#e9e6df", layer: "over", limits: { width: [12, 240], depth: [9, 24], height: [48, 108] } },
  fridge: { label: "Refrigerator", room: "Kitchen", wall: true, width: 36, depth: 30, height: 70, color: "#d9dbdd" },
  range: { label: "Range", room: "Kitchen", wall: true, width: 30, depth: 26, height: 36, color: "#cfd2d4" },
  vanity: { label: "Bathroom vanity", room: "Bath", wall: true, width: 36, depth: 21, height: 34, color: "#e9e6df" },
  toilet: { label: "Toilet", room: "Bath", wall: true, width: 20, depth: 28, height: 30, color: "#f7f7f5" },
  bathtub: { label: "Bathtub", room: "Bath", wall: true, width: 60, depth: 30, height: 20, color: "#f7f7f5", limits: { width: [48, 84], depth: [26, 44], height: [14, 26] } },
  tv: { label: "Screen on a stand", room: "Other", width: 44, depth: 20, height: 72, color: "#15171a" },
  pedestal: { label: "Pedestal", room: "Other", ...PEDESTAL },
  // Draw-a-box: a plain block at any size — a riser, a plinth, a built-in.
  // Drawn on the floor with the Box tool, then pulled up.
  box: { label: "Box · riser, plinth or built-in", room: "Other", width: 48, depth: 24, height: 12, color: "#e9e6df" },
  // A straight flight to the floor above: 7¾″ risers and 10″ treads are the
  // usual residential code, and the height is floor to floor. Its footprint
  // runs up toward −Z, so it climbs away from whoever stands at its foot.
  stairs: { label: "Stairs · straight flight", room: "Other", width: 36, depth: 130, height: 108, color: "#b48a5e", limits: { width: [24, 96], depth: [40, 240], height: [12, 144] } },
  // The booth app's pieces. Not offered any more, but a backup that has them
  // still loads and still draws them.
  table6: { label: "Table 6′ with cloth", width: 72, depth: 30, height: 30, color: "#23262b", booth: true },
  table8: { label: "Table 8′ with cloth", width: 96, depth: 30, height: 30, color: "#23262b", booth: true },
  stool: { label: "Stool", width: 16, depth: 16, height: 30, color: "#2e3034", booth: true },
  bin: { label: "Print bin", width: 30, depth: 20, height: 32, color: "#8a6a4a", booth: true },
  // A gridwall panel is a sheet of wire; its depth is the footprint of its feet.
  gridwall: { label: "Gridwall panel", width: 24, depth: 12, height: 72, color: "#1e1f22", booth: true },
  banner: { label: "Banner stand", width: 33, depth: 12, height: 80, color: "#91beff", booth: true },
};
// `wall: true` is a piece that stands with its back to a wall — a bed's
// headboard, a counter, a bookcase — so a new one is put against the north
// wall of the room it is added to rather than in the middle of the floor.
/** The rooms the furniture picker groups by, in its order. */
export const FURNITURE_ROOMS = ["Living", "Dining", "Bedroom", "Office", "Kitchen", "Bath", "Other"];
/** The size limits of one kind of floor piece. */
export const furnitureLimits = (kind) =>
  kind === "box" ? BOX_LIMITS : FURNITURE[kind]?.limits || { width: [4, 96], depth: [4, 96], height: [6, 96] };
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
  ...roomWalls(p).map((w) => w.key),
  ...boothPanels(p).map((panel) => panelKey(panel.id)),
];
/**
 * The width/height/enabled a placement is measured against, for a perimeter
 * wall or a free-standing panel alike. Every caller that used to index
 * `booth.walls` goes through here. A key naming a panel that no longer exists
 * returns null; callers treat that the way they treat a hidden wall.
 */
export function wallSpec(p, key) {
  // A room's wall: derived from the room, never hidden on its own — a side
  // that should not be there is opened in the room instead, and then it has
  // no key at all.
  if (isRoomKey(key)) {
    const wall = findRoomWall(p, key);
    return wall ? { enabled: true, width: wall.width, height: wall.height, room: wall } : null;
  }
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
  if (isRoomKey(key)) return roomWallLabel(p, key) || "Room wall";
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
  if (wall.room) {
    const hit = wallOpenings(p, wall.room).find((o) => {
      // An outside face is the same wall seen from behind: x runs the other way.
      const x0 = a.face === "outside" ? wall.width - a.x - a.w : a.x;
      return x0 < o.x + o.width && x0 + a.w > o.x && a.y < o.sill + o.height && a.y + a.h > o.sill;
    });
    if (hit) return `Artwork overlaps a ${hit.kind === "arch" ? "archway" : hit.kind} in this wall. Move it along the wall.`;
  }
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
      "This is not a valid Home Layout backup. Your current project was kept.",
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
    !finite(p.booth.width, 48, 1200) ||
    !finite(p.booth.depth, 48, 1200) ||
    !finite(p.booth.height, 48, 240) ||
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
        !finite(ped.width, ...furnitureLimits(ped.kind).width) ||
        !finite(ped.depth, ...furnitureLimits(ped.kind).depth) ||
        !finite(ped.height, ...furnitureLimits(ped.kind).height) ||
        !finite(ped.x, -600, 600) ||
        !finite(ped.z, -600, 600) ||
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
        !finite(panel.width, 12, 600) ||
        !finite(panel.height, 24, 144) ||
        !finite(panel.x, -600, 600) ||
        !finite(panel.z, -600, 600) ||
        !finite(panel.rotation, -180, 180)
      )
        fail();
      if (panel.name !== undefined && (typeof panel.name !== "string" || panel.name.length > 200)) fail();
      if (panel.hidden !== undefined && typeof panel.hidden !== "boolean") fail();
      panelIds.add(panel.id);
    }
  }
  // Rooms: the house itself. Optional, like every other list here.
  if (!validRooms(p.booth.rooms)) fail();
  const roomIds = new Set(homeRooms(p).map((r) => r.id));
  const ids = new Set();
  for (const a of p.art) {
    if (
      typeof a.id !== "string" ||
      ids.has(a.id) ||
      typeof a.title !== "string" ||
      a.title.length > 200 ||
      !(["back", "left", "right"].includes(a.wall) ||
        (isPanelKey(a.wall) && panelIds.has(panelIdOf(a.wall))) ||
        (isRoomKey(a.wall) && roomIds.has(a.wall.split(":")[1]))) ||
      !finite(a.w, 1, 360) ||
      !finite(a.h, 1, 360) ||
      !finite(a.x, -600, 600) ||
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
    // Which booth of the old booth row it hung in. Absent means this floor,
    // which is what every work in every home means.
    if (a.booth !== undefined && !(typeof a.booth === "string" && (p.booth.row?.slots || []).some((s) => s.id === a.booth && s.kind === "booth"))) fail();
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
      if (!finite(l[key], -600, 600)) fail();
    for (const key of ["y", "ty"]) if (!finite(l[key], 0, 240)) fail();
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
