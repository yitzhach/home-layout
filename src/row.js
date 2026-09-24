/**
 * The booth row: this booth, and the ones standing beside it.
 *
 * `booth.neighbors` has always drawn decorative neighbours — same size as this
 * booth, one either side, there to judge sightlines against. A row is the
 * other thing that was asked for: an aisle you lay out yourself, booth by
 * booth, with gaps where the show has them, and each booth able to hold
 * artwork of its own. So a row is a list of slots, each either a booth or a
 * space, and exactly one of the booths is this one.
 *
 * Every booth in a row is this booth's size. That is not a shortcut: the
 * walls, their heights and the panel module are one set of measurements in
 * this project, and artwork hung in a row booth is measured against the same
 * `booth.walls` as artwork hung at home. A row of differently-sized booths is
 * a different feature and would need a booth to be a document of its own.
 *
 * Positions are in inches along X, measured from the centre of the home
 * booth — which is the origin the scene already draws around, so a row costs
 * the camera, the ground and the hall nothing.
 */

/** A new space is four feet of aisle: wide enough to read as a gap. */
export const DEFAULT_SPACE = 48;
export const MIN_SPACE = 6;
export const MAX_SPACE = 600;
/** Between two adjoining slots. 0 is booths sharing a wall line. */
export const DEFAULT_GAP = 24;
export const MAX_GAP = 240;
/** Enough to lay out an aisle; far past what anyone will draw at once. */
export const MAX_SLOTS = 41;
export const HOME = "home";

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  "slot-" + Math.random().toString(36).slice(2, 10);

/** The row a booth carries, with every default filled in and a home slot guaranteed. */
export function normalizeRow(booth = {}) {
  const raw = booth.row;
  const slots = Array.isArray(raw?.slots) ? raw.slots.filter(Boolean) : [];
  const clean = [];
  const seen = new Set();
  for (const s of slots) {
    const id = typeof s.id === "string" && s.id && !seen.has(s.id) ? s.id : newId();
    seen.add(id);
    if (s.kind === "space")
      clean.push({
        id,
        kind: "space",
        width: clampSpace(s.width),
      });
    else clean.push({ id, kind: "booth", name: typeof s.name === "string" ? s.name : "" });
    if (clean.length >= MAX_SLOTS) break;
  }
  let home = typeof raw?.home === "string" ? raw.home : HOME;
  if (!clean.some((s) => s.kind === "booth" && s.id === home)) {
    const first = clean.find((s) => s.kind === "booth");
    if (first) home = first.id;
    else {
      home = HOME;
      clean.unshift({ id: HOME, kind: "booth", name: "" });
    }
  }
  const gap = Number.isFinite(raw?.gap)
    ? Math.max(0, Math.min(MAX_GAP, raw.gap))
    : DEFAULT_GAP;
  return { home, gap, slots: clean };
}

export const clampSpace = (w) =>
  Number.isFinite(w) ? Math.max(MIN_SPACE, Math.min(MAX_SPACE, Math.round(w))) : DEFAULT_SPACE;

/** True once the row holds anything but this booth on its own. */
export const hasRow = (booth) => normalizeRow(booth).slots.length > 1;

/**
 * Every slot with the width it occupies and the X of its centre, in inches,
 * relative to the centre of the home booth. Slots are laid out left to right
 * in list order, one gap between each pair, and the whole run is then shifted
 * so that home sits at zero.
 */
export function rowLayout(booth = {}) {
  const row = normalizeRow(booth);
  const boothWidth = Number.isFinite(booth.width) ? booth.width : 120;
  const placed = [];
  let cursor = 0;
  for (const slot of row.slots) {
    const width = slot.kind === "space" ? slot.width : boothWidth;
    placed.push({ ...slot, width, x: cursor + width / 2, home: slot.id === row.home });
    cursor += width + row.gap;
  }
  const origin = placed.find((s) => s.home)?.x ?? 0;
  return placed.map((s) => ({ ...s, x: +(s.x - origin).toFixed(3) }));
}

/** The booths only, numbered left to right the way someone reads the aisle. */
export function boothSlots(booth = {}) {
  let n = 0;
  return rowLayout(booth)
    .filter((s) => s.kind === "booth")
    .map((s) => ({ ...s, number: ++n }));
}

export function slotLabel(slot) {
  if (slot.kind === "space") return `Space · ${Number((slot.width / 12).toFixed(2))} ft`;
  return slot.name || (slot.home ? `Booth ${slot.number} · yours` : `Booth ${slot.number}`);
}

const insert = (row, side, made) => {
  const slots = side === "left" ? [...made, ...row.slots] : [...row.slots, ...made];
  return { ...row, slots: slots.slice(0, MAX_SLOTS) };
};

/**
 * `count` more booths on one side. The count is what makes a row worth having:
 * typing 10 is the whole point, and adding them one at a time is the same call
 * with a one.
 */
export function addBooths(booth, side, count = 1) {
  const row = normalizeRow(booth);
  const room = Math.max(0, MAX_SLOTS - row.slots.length);
  const n = Math.max(0, Math.min(room, Math.floor(count) || 0));
  const made = Array.from({ length: n }, () => ({ id: newId(), kind: "booth", name: "" }));
  return insert(row, side, side === "left" ? made.reverse() : made);
}

/** A gap in the aisle: a cross-walk, a doorway, or simply air. */
export function addSpace(booth, side, width = DEFAULT_SPACE) {
  const row = normalizeRow(booth);
  if (row.slots.length >= MAX_SLOTS) return row;
  return insert(row, side, [{ id: newId(), kind: "space", width: clampSpace(width) }]);
}

/** Anything but home can go. Removing home would leave the project without a booth. */
export function removeSlot(booth, id) {
  const row = normalizeRow(booth);
  if (id === row.home) return row;
  return { ...row, slots: row.slots.filter((s) => s.id !== id) };
}

export function setSpaceWidth(booth, id, width) {
  const row = normalizeRow(booth);
  return {
    ...row,
    slots: row.slots.map((s) =>
      s.id === id && s.kind === "space" ? { ...s, width: clampSpace(width) } : s,
    ),
  };
}

/** The slot a piece of artwork hangs in: its own, or home when it names none. */
export function artSlot(booth, art) {
  const layout = rowLayout(booth);
  return (
    layout.find((s) => s.kind === "booth" && s.id === art?.booth) ||
    layout.find((s) => s.home) ||
    null
  );
}

/** How far along X a slot's booth stands from this one, in inches. 0 for home. */
export const slotOffset = (booth, id) =>
  rowLayout(booth).find((s) => s.id === id && s.kind === "booth")?.x ?? 0;
