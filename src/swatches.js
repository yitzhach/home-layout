// The saved colour palette, and the colour that was there before.
//
// A native `<input type="color">` opens the operating system's own picker, and
// nothing can be added inside that window — so the seven saved slots and the
// Previous button sit beside the swatch in the panel, where the four fixed
// finishes already are. Same gesture, one row lower.
//
// Palette and history are per browser, not per project, for the same reason
// the fast-edit lock is: a set of colours someone mixes is theirs across every
// booth they open, and a backup carrying somebody else's palette would be a
// surprise. Neither reaches schema 1.
//
// Pure: the list arithmetic is here, `localStorage` is main.js's business.

/** Seven, as asked for. The eighth save pushes the oldest out. */
export const MAX_SWATCHES = 7;
const HEX = /^#[0-9a-f]{6}$/i;

export const isColor = (value) => typeof value === "string" && HEX.test(value);
const clean = (value) => (isColor(value) ? value.toLowerCase() : null);

/** A stored palette, read defensively: anything unrecognised is dropped. */
export function readPalette(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const entry of list) {
    const c = clean(entry);
    if (c && !out.includes(c)) out.push(c);
    if (out.length === MAX_SWATCHES) break;
  }
  return out;
}

/**
 * Saving a colour. A colour already in the palette moves to the front rather
 * than being stored twice — seven slots is few enough that a duplicate costs
 * a seventh of the palette.
 */
export function savePalette(palette, color) {
  const c = clean(color);
  if (!c) return readPalette(palette);
  return readPalette([c, ...readPalette(palette).filter((x) => x !== c)]);
}

export function removeSwatch(palette, color) {
  const c = clean(color);
  return readPalette(palette).filter((x) => x !== c);
}

/**
 * The previous colour for one field. `history` is a map of field key to the
 * last two colours it held, most recent first, so "Previous" means the colour
 * this control had before the one it has now — not the one it has.
 */
export function rememberColor(history, key, color) {
  const c = clean(color);
  if (!c) return { ...history };
  const past = (history?.[key] || []).filter(isColor).map((x) => x.toLowerCase());
  if (past[0] === c) return { ...history };
  return { ...history, [key]: [c, ...past.filter((x) => x !== c)].slice(0, 2) };
}

export const previousColor = (history, key, current) => {
  const past = (history?.[key] || []).filter(isColor).map((x) => x.toLowerCase());
  const now = clean(current);
  return past.find((x) => x !== now) || null;
};
