// Auto preview quality: the viewport measuring its own frame rate and giving
// up supersampling until it keeps up.
//
// Preview quality has always been a fixed supersampling factor, and the
// default of 2 draws four fragments for every pixel of a 1x monitor — and the
// same four for every pixel of a Retina iMac, where the display's own density
// already asks for two. On a 2014 machine that is most of the frame. Auto
// starts where Balanced always did, so a fast machine sees exactly the picture
// it always saw, and steps down one rung at a time while motion is measured to
// be slow. It never steps back up on its own: a picture that sharpens and
// softens as the machine's load wanders is worse than one that settles once.
//
// Pure, so the rule is pinned by node tests without a GPU. The scene feeds it
// the interval between consecutive drawn frames; nothing here reads a clock.

// The select value that means "choose for me". A string so it can never be
// mistaken for a supersampling factor.
export const AUTO_QUALITY = "auto";
// The rungs auto walks down. Never below 1: under one fragment per pixel the
// booth goes soft, and fast edit already covers the rest of the gesture.
export const AUTO_LADDER = [3, 2, 1.5, 1];
// A frame slower than this, as the median of a window, is slow: about 35 fps.
// Orbit damping and a drag both read as smooth above it and as sticky below.
export const SLOW_FRAME_MS = 28;
// How many consecutive intervals make one verdict. Half a second at 60 fps —
// long enough that one hitch (a texture upload, a shadow refresh) cannot cost
// the whole session its sharpness.
export const SAMPLE_FRAMES = 30;
// An interval longer than this is not a slow frame: it is a tab that was in
// the background, or a pause between two gestures that happened to both draw.
export const GAP_MS = 250;

/** The next rung below `scale`, or 1 once there. */
export function stepDown(scale) {
  return AUTO_LADDER.find((rung) => rung < scale) ?? 1;
}

/**
 * Where auto starts on this display: the rung Balanced renders at, unless a
 * previous session on the same display already measured its way lower. The
 * saved value is keyed on devicePixelRatio because the same browser moved to
 * a different monitor is a different amount of work per frame.
 */
export function startScale(dpr, saved) {
  const balanced = Math.min(Math.max(dpr || 1, 2), 3);
  if (saved && saved.dpr === (dpr || 1) && AUTO_LADDER.includes(saved.scale) && saved.scale <= balanced)
    return saved.scale;
  return balanced;
}

/** Collects frame intervals and says when a window of them was slow. */
export class FrameBudget {
  constructor({ slow = SLOW_FRAME_MS, frames = SAMPLE_FRAMES, gap = GAP_MS } = {}) {
    this.slow = slow;
    this.frames = frames;
    this.gap = gap;
    this.samples = [];
  }
  /**
   * One interval, in milliseconds, between two frames drawn back to back.
   * Returns true when a full window's median is slow, and starts a new window
   * either way, so one verdict is one step down.
   */
  sample(ms) {
    if (!(ms > 0) || ms > this.gap) return false;
    this.samples.push(ms);
    if (this.samples.length < this.frames) return false;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    this.samples.length = 0;
    return sorted[Math.floor(sorted.length / 2)] > this.slow;
  }
  /** Forget a half-filled window: the scale it was measuring has changed. */
  reset() {
    this.samples.length = 0;
  }
}
