// Lite and Pro.
//
// One table says which features are Pro, and one function — `can` — is the
// only question anything else asks. Every Pro tool is gated through it from
// the day it lands, so the day the owner decides what Pro costs and how it is
// unlocked, nothing has to be retrofitted: the answer to "is this Pro?" is
// already in one place, and the answer to "is this browser Pro?" is `tier`.
//
// How Pro is unlocked is deliberately not decided here. The app is
// local-first — no accounts, no backend — so there is nothing to check a
// purchase against; the owner will choose between an honour-system switch and
// a signed key checked in the browser. Until then the tier is a view setting,
// remembered per browser, **Pro by default** at the owner's word ("pro
// version up and going"), and Layout → Project → Plan switches it so Lite can
// be seen. It is never in a backup and never in schema 1: a booth is the same
// booth in either tier, and a Lite browser opening a Pro booth draws all of
// it — it only cannot add to or export the Pro parts.

export const TIERS = {
  lite: { label: "Lite" },
  pro: { label: "Pro" },
};
export const DEFAULT_TIER = "pro";
export const TIER_KEY = "booth.tier";

/**
 * Every feature that is Pro, with the name the lock badge and the toast use.
 * A feature not listed here is Lite, which is to say everyone's.
 */
export const PRO_FEATURES = {
  row: "Booth row",
  showPack: "Show pack",
  guide: "Hanging guide",
  video: "Video export",
  templates: "Booth templates",
  align: "Align and distribute",
  underlay: "Floor plan underlay",
  clearance: "Clearance checks",
  elevations: "Elevations to scale",
  box: "Draw a box",
  glb: "3D model import and export",
  hall: "Hall planner",
  power: "Power and rentals sheet",
};

/**
 * Toolbar and inspector actions that belong to a Pro feature, by their
 * `data-action`. The click handler asks this before it runs anything, so a
 * Pro button that somehow reaches a Lite browser — a stale panel, a search
 * hit, a keyboard shortcut — still does nothing but say why.
 */
export const PRO_ACTIONS = {
  "show-pack": "showPack",
  guide: "guide",
  "export-video": "video",
  "batch-export": "video",
  "batch-add": "video",
  "preview-move": "video",
  "edit-timeline": "video",
  "save-template": "templates",
  "row-booth-left": "row",
  "row-booth-right": "row",
  "row-count-left": "row",
  "row-count-right": "row",
  "row-space-left": "row",
  "row-space-right": "row",
  "align-left": "align",
  "align-center": "align",
  "align-right": "align",
  "align-top": "align",
  "align-middle": "align",
  "align-bottom": "align",
  "distribute-x": "align",
  "distribute-y": "align",
  "upload-underlay": "underlay",
  "underlay-scale": "underlay",
  elevations: "elevations",
  "draw-box": "box",
  "upload-model": "glb",
  "export-glb": "glb",
  "hall-start": "hall",
  "hall-map": "hall",
  "hall-csv": "hall",
  "hall-mine": "hall",
  "power-sheet": "power",
};

export const resolveTier = (tier) => (TIERS[tier] ? tier : DEFAULT_TIER);

/** Whether a browser on `tier` may use `feature`. Unknown features are Lite. */
export function can(tier, feature) {
  if (!feature || !(feature in PRO_FEATURES)) return true;
  return resolveTier(tier) === "pro";
}

/** The Pro feature an action belongs to, or null for everyone's. */
export const actionFeature = (action) => PRO_ACTIONS[action] || null;

/** The tier this browser remembered, read defensively. */
export function readTier(storage = globalThis.localStorage) {
  try {
    return resolveTier(storage?.getItem(TIER_KEY));
  } catch {
    return DEFAULT_TIER;
  }
}

export function writeTier(tier, storage = globalThis.localStorage) {
  try {
    storage?.setItem(TIER_KEY, resolveTier(tier));
    return true;
  } catch {
    return false;
  }
}
