// Arranging a wall of work: even spacing and a common hang line.
//
// Pure, so the arithmetic is pinned by node tests. A work's placement is its
// left edge `x` and bottom edge `y` in inches on its wall, and `w` × `h` its
// size; a wall is `{ width, height }`.

// The hang line: the centre of a work 60″ off the floor. Galleries use
// 57″–60″; 60″ is what this app's single-work "Center at 60″" has always
// used, and a wall hung by one button should match a work hung by the other.
export const HANG_LINE = 60;

// The works that share a wall with `a`: same wall, same face, same booth.
export const sameWall = (list, a) =>
  list.filter((b) => b.wall === a.wall && (b.face || "inside") === (a.face || "inside") && (b.booth || null) === (a.booth || null));

/**
 * Spread works across a wall with equal gaps: the same space between each
 * pair and at both ends, in the order they already hang left to right. If
 * they are wider together than the wall, they are packed edge to edge from
 * the left rather than overlapped. Returns `{ id: x }`.
 */
export function spaceEvenly(works, wall) {
  const sorted = [...works].sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
  const total = sorted.reduce((sum, a) => sum + a.w, 0);
  const gap = Math.max(0, (wall.width - total) / (sorted.length + 1));
  const out = {};
  let x = gap;
  for (const a of sorted) {
    out[a.id] = round(x);
    x += a.w + gap;
  }
  return out;
}

/**
 * Hang every work with its centre on one line, `line` inches off the floor,
 * clamped so nothing leaves the wall. Returns `{ id: y }`.
 */
export function hangAt(works, wall, line = HANG_LINE) {
  const out = {};
  for (const a of works) out[a.id] = round(Math.max(0, Math.min(wall.height - a.h, line - a.h / 2)));
  return out;
}

/** A nudge for an arrow key: 1″, or a foot with Shift. */
export function nudge(key, shift) {
  const step = shift ? 12 : 1;
  return (
    { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key] || null
  );
}

const round = (n) => Math.round(n * 100) / 100;
