// Saved views, tags and walk mode: how a booth is looked at.
//
// Pure, so the rules are pinned in Node; the scene and main.js do the drawing.
//
// - A **saved view** is SketchUp's Scene: a named camera, one click to come
//   back to, and every one of them exportable as a PNG in one go. It is part
//   of the booth — "the aisle approach" belongs to this booth — so it is
//   saved in the project as the optional `p.views`, which every older backup
//   simply does not have.
// - A **tag** is a visibility group (SketchUp's Tags, once Layers): art,
//   furniture, free-standing walls, people, light fixtures, surroundings. A
//   hidden tag leaves the picture — viewport, PNG and video alike — and is
//   not pickable. It is a view setting of the moment, never saved: a booth
//   reopened with its art missing because of a switch nobody remembers
//   flipping is the wrong failure.
// - **Walk mode** stands the camera at eye height in the aisle and moves it
//   like a visitor: forward, back and sideways on the floor, looking round
//   by dragging. The eye height is a 5′6″ visitor's.
// Metres per inch — the same constant as model.js, repeated so model.js can
// import this file's validator without a cycle.
const IN = 0.0254;

export const MAX_VIEWS = 12;

export const TAGS = {
  art: "Artwork",
  furniture: "Pedestals and furniture",
  panels: "Free-standing walls",
  people: "People",
  fixtures: "Light fixtures",
  surroundings: "Surroundings",
};

/** Eye height of a 5′6″ visitor, in inches: the height a booth is seen from. */
export const EYE_HEIGHT = 62;

/** A walking step, in inches; Shift is a stride of two feet. */
export const STEP = 6;
export const STRIDE = 24;

const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n) && Math.abs(n) < 1000);

/** Whether a stored list of views is one this version can open. */
export function validViews(views) {
  if (views === undefined) return true;
  if (!Array.isArray(views) || views.length > MAX_VIEWS) return false;
  const ids = new Set();
  for (const v of views) {
    if (!v || typeof v !== "object") return false;
    if (typeof v.id !== "string" || !v.id || v.id.length > 200 || ids.has(v.id)) return false;
    if (typeof v.name !== "string" || v.name.length > 120) return false;
    if (!vec3(v.position) || !vec3(v.target)) return false;
    ids.add(v.id);
  }
  return true;
}

/** A new saved view from a camera pose, named after how many there are. */
export function newView(pose, id, views = []) {
  let n = views.length + 1;
  const taken = new Set(views.map((v) => v.name));
  while (taken.has("View " + n)) n += 1;
  return {
    id,
    name: "View " + n,
    position: pose.position.map((x) => round(x)),
    target: pose.target.map((x) => round(x)),
  };
}

/** Whether every object tagged `tag` should be drawn, given the hidden set. */
export const tagShown = (hidden, tag) => !tag || !hidden?.has?.(tag);

/**
 * Where walk mode starts: in the aisle, a little over a metre in front of
 * the booth, at eye height, looking at the back wall. Metres, like a pose.
 */
export function walkStart(booth) {
  const eye = EYE_HEIGHT * IN;
  const front = (booth.depth / 2) * IN + 1.2;
  return {
    position: [0, eye, front],
    target: [0, eye, front - 0.01],
  };
}

/**
 * One step: `forward` and `right` are -1, 0 or 1, `inches` how far. The step
 * is along the floor whichever way the head is tilted — a visitor looking up
 * at a high work does not rise off the floor walking toward it — and the
 * target moves with the camera so the view direction is kept.
 */
export function walkStep(pose, forward, right, inches = STEP) {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  let fx = tx - px,
    fz = tz - pz;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len;
  fz /= len;
  // Right of a direction (fx, fz) on the floor, seen from above with +Y up.
  const rx = -fz,
    rz = fx;
  const d = inches * IN;
  const dx = (fx * forward + rx * right) * d,
    dz = (fz * forward + rz * right) * d;
  return {
    position: [px + dx, py, pz + dz],
    target: [tx + dx, ty, tz + dz],
  };
}

const round = (n) => Math.round(n * 10000) / 10000;
