// Filmic camera moves.
//
// A move is pure geometry: given where the camera is now and a time t in 0..1,
// it says where the camera should be and what it should look at. No three.js,
// no DOM, no renderer — which is why tests/camera-path.test.js can cover every
// move in Node without a GPU, and why the video recorder can sample a move
// without a live scene.
//
// Everything is expressed relative to the framing the user has already chosen,
// in spherical coordinates around the orbit target. A move that hard-coded
// positions would throw away the composition they set up by hand and would
// break the moment the booth changed size.
//
// The easing matters more than the path. A move that starts and stops abruptly
// reads as a scrubbed viewport; one that accelerates and decelerates reads as a
// camera. Every move therefore eases position with smootherstep, whose first
// derivative is zero at both ends, so no frame has visible velocity at a cut.

// 6t^5 - 15t^4 + 10t^3. Zero velocity *and* zero acceleration at both ends,
// where plain smoothstep only gives zero velocity.
export const smootherstep = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
// For a push-in: quick commitment, long settle. Zero velocity at the end only.
export const easeOut = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// The orbit controls' own limits, restated: a move must not drive the camera
// under the floor or through the up-vector flip, and it is cheaper to clamp
// here than to discover it as a frame of garbage in the middle of a file.
const MIN_PHI = 0.08;
const MAX_PHI = Math.PI * 0.82;
const MIN_GROUND_Y = 0.12;

// Imported rather than duplicated: a timeline is sampled by the same call as a
// fixed move, and the two must agree about what a pose is.
import { isTimeline, sampleTimeline } from "./timeline.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a, b, t) => a + (b - a) * t;

// Cartesian offset -> (radius, theta, phi). theta is the azimuth in the XZ
// plane, phi the polar angle from +Y, matching OrbitControls' own convention so
// a move composes with whatever the user last dragged.
export function toSpherical(offset) {
  const [x, y, z] = offset;
  const radius = Math.hypot(x, y, z);
  if (!(radius > 0)) return { radius: 0, theta: 0, phi: Math.PI / 2 };
  return {
    radius,
    theta: Math.atan2(x, z),
    phi: Math.acos(Math.min(1, Math.max(-1, y / radius))),
  };
}
export function fromSpherical({ radius, theta, phi }) {
  const s = Math.sin(phi);
  return [radius * s * Math.sin(theta), radius * Math.cos(phi), radius * s * Math.cos(theta)];
}

// Each move is a function of eased time returning offsets from the base
// framing: a multiplier on the radius, deltas on theta and phi, and an
// optional target lift. Keeping them declarative keeps them comparable — it is
// easy to see that no move swings more than a quarter turn, which is what stops
// a 10-second clip from looking like a spinning turntable.
export const MOVES = {
  orbit: {
    label: "Orbit · slow arc",
    seconds: 12,
    ease: smootherstep,
    describe: "Drifts a third of a turn around the booth at the height you set.",
    at: (e) => ({ radius: 1, theta: (-55 + 110 * e) * DEG, phi: 0, lift: 0 }),
  },
  push: {
    label: "Push in · settle on the back wall",
    seconds: 8,
    ease: easeOut,
    describe: "Starts wide and moves in, easing to a stop. Good for one hero shot.",
    at: (e) => ({ radius: lerp(1.75, 0.85, e), theta: (-14 + 14 * e) * DEG, phi: (-6 + 6 * e) * DEG, lift: 0 }),
  },
  reveal: {
    label: "Reveal · rise from the aisle",
    seconds: 10,
    ease: smootherstep,
    describe: "Begins low, near standing height at the aisle, and rises into your framing.",
    at: (e) => ({ radius: lerp(1.3, 1, e), theta: (-26 + 26 * e) * DEG, phi: lerp(0.42, 0, e), lift: lerp(-0.25, 0, e) }),
  },
  survey: {
    label: "Survey · track the walls",
    seconds: 14,
    ease: smootherstep,
    describe: "A long, level pass across the display walls. The move for showing every panel.",
    at: (e) => ({ radius: lerp(1.15, 1.15, e), theta: (-72 + 144 * e) * DEG, phi: (4 - 8 * e) * DEG, lift: 0 }),
  },
  // A Ken Burns: the documentary move, borrowed from stills. A slow, almost
  // imperceptible push with a touch of drift, so the frame is never quite
  // still and never visibly moving either. It is the one move here that is
  // about the artwork rather than about the booth, which is why it swings so
  // little — a slow pass across a painting reads as looking at it, and the
  // same pass across a room reads as looking for something.
  kenburns: {
    label: "Ken Burns · slow drift",
    seconds: 16,
    ease: smootherstep,
    describe: "A very slow push with a little drift, the way a documentary moves over a still. Frame one piece and let it breathe.",
    at: (e) => ({ radius: lerp(1.12, 0.9, e), theta: (-7 + 14 * e) * DEG, phi: (2.5 - 5 * e) * DEG, lift: lerp(-0.03, 0.03, e) }),
  },
};
// The fifth entry of the Camera move menu. It is not a move — it is the door to
// a timeline the user builds themselves — so it is named here but has no entry
// in MOVES, which stays a list of moves that can be sampled with a base pose.
export const CUSTOM_MOVE = "custom";
export const DEFAULT_MOVE = "orbit";
export const resolveMove = (id) => (MOVES[id] ? { id, ...MOVES[id] } : { id: DEFAULT_MOVE, ...MOVES[DEFAULT_MOVE] });

// One frame of a move. `base` is the framing the user already set:
// { position, target } as 3-element arrays. The return value is a camera
// position and a look-at target, clamped to stay above the floor.
//
// `moveId` may also be a custom timeline object, in which case the keyframes
// decide the pose and `base` is ignored — a keyframe is an absolute shot
// someone composed, where a fixed move is a gesture applied to whatever they
// are looking at now. That branch is the whole of the custom-video feature as
// far as everything downstream is concerned: src/video.js, the muxer and the
// offline frame loop still see one `(t) -> pose` function.
export function samplePath(moveId, base, t) {
  if (isTimeline(moveId)) return sampleTimeline(moveId, t);
  const move = resolveMove(moveId);
  const eased = move.ease(t);
  const step = move.at(eased);
  const target = [...base.target];
  const spherical = toSpherical(sub(base.position, target));
  // A camera sitting exactly on its target has no direction to orbit around,
  // so the move would be undefined rather than merely odd.
  const radius = Math.max(0.3, spherical.radius) * step.radius;
  const phi = Math.min(MAX_PHI, Math.max(MIN_PHI, spherical.phi + step.phi));
  const lifted = [target[0], target[1] + step.lift, target[2]];
  const position = add(lifted, fromSpherical({ radius, theta: spherical.theta + step.theta, phi }));
  // Clamping phi bounds the angle, not the height: a wide radius at a legal
  // angle can still put the eye under the floor. Lift the pair rather than
  // shortening the radius, so the move keeps its shape instead of lurching.
  if (position[1] < MIN_GROUND_Y) {
    const rise = MIN_GROUND_Y - position[1];
    position[1] += rise;
    lifted[1] += rise;
  }
  return { position, target: lifted };
}

// How many frames a clip is, and the exact time of each. Frame times come from
// the index rather than from an accumulator, so a 30-second clip cannot drift,
// and the last frame lands on t=1 exactly — the end of the move is a
// composition someone chose, and it should be the frame the file ends on.
export function frameTimes(seconds, fps) {
  const count = Math.max(2, Math.round(seconds * fps));
  return { count, at: (i) => Math.min(1, i / (count - 1)) };
}
