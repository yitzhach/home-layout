// Custom camera timelines. Everything here runs in Node with no GPU, which is
// the whole reason src/timeline.js is pure arithmetic: a keyframed clip is
// minutes of encoding to look at, and these are the properties that decide
// whether it is worth encoding at all.
import test from "node:test";
import assert from "node:assert/strict";
import {
  EASES, MAX_KEYS, MIN_KEYS, MIN_SECONDS, MAX_SECONDS, DEFAULT_SECONDS,
  emptyTimeline, keyFrom, normalizeTimeline, sampleTimeline, fadeAt,
  segmentSpeed, timelineSeconds, isTimeline, poseBetween,
} from "../src/timeline.js";
import { samplePath } from "../src/camera-path.js";

const A = { position: [3, 1.6, 4], target: [0, 1.2, 0] };
const B = { position: [-3.5, 2.2, -2], target: [0, 1.4, 0] };
const three = () =>
  normalizeTimeline({
    seconds: 12,
    keys: [
      { ...keyFrom(A.position, A.target, 0) },
      { ...keyFrom([0, 1.8, 5], [0, 1.3, 0], 0.5) },
      { ...keyFrom(B.position, B.target, 1) },
    ],
  });

test("a timeline always starts at 0, ends at 1 and ascends in between", () => {
  const tl = normalizeTimeline({
    keys: [keyFrom(A.position, A.target, 0.9), keyFrom(B.position, B.target, 0.2), keyFrom(A.position, A.target, 0.2)],
  });
  assert.equal(tl.keys[0].t, 0);
  assert.equal(tl.keys.at(-1).t, 1);
  for (let i = 1; i < tl.keys.length; i++)
    assert.ok(tl.keys[i].t > tl.keys[i - 1].t, `key ${i} must come after key ${i - 1}`);
});

test("fewer than two keys is padded, more than the limit is cut", () => {
  assert.equal(normalizeTimeline({ keys: [] }).keys.length, MIN_KEYS);
  assert.equal(normalizeTimeline({ keys: [keyFrom(A.position, A.target)] }).keys.length, MIN_KEYS);
  const many = normalizeTimeline({
    keys: Array.from({ length: MAX_KEYS + 6 }, (_, i) => keyFrom(A.position, A.target, i / (MAX_KEYS + 5))),
  });
  assert.equal(many.keys.length, MAX_KEYS);
});

test("t=0 and t=1 land exactly on the first and last keyframe", () => {
  const tl = three();
  const start = sampleTimeline(tl, 0);
  const end = sampleTimeline(tl, 1);
  for (const axis of [0, 1, 2]) {
    assert.ok(Math.abs(start.position[axis] - tl.keys[0].position[axis]) < 1e-6, "the clip opens on the pose someone composed");
    assert.ok(Math.abs(end.position[axis] - tl.keys.at(-1).position[axis]) < 1e-6, "and ends on one too");
  }
});

test("a sampled timeline never puts the camera under the floor", () => {
  const tl = normalizeTimeline({
    keys: [keyFrom([4, 0.02, 0], [0, 1.2, 0], 0), keyFrom([-4, 0.01, 0.5], [0, 1.2, 0], 1)],
  });
  for (let i = 0; i <= 60; i++) assert.ok(sampleTimeline(tl, i / 60).position[1] >= 0.1199);
});

test("the path is continuous — no frame jumps", () => {
  const tl = three();
  let previous = sampleTimeline(tl, 0).position;
  for (let i = 1; i <= 240; i++) {
    const next = sampleTimeline(tl, i / 240).position;
    const step = Math.hypot(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]);
    assert.ok(step < 0.35, `frame ${i} jumped ${step.toFixed(3)} m`);
    previous = next;
  }
});

test("a segment crossing the azimuth seam goes the short way round", () => {
  // Two poses either side of the -pi/pi seam. The long way round is a full
  // extra lap of the booth inside one segment.
  const tl = normalizeTimeline({
    keys: [keyFrom([0.2, 1.5, -4], [0, 1.2, 0], 0), keyFrom([-0.2, 1.5, -4], [0, 1.2, 0], 1)],
  });
  const middle = sampleTimeline(tl, 0.5).position;
  assert.ok(middle[2] < -3, "the camera stayed behind the booth instead of sweeping the front");
});

test("a hold stops the camera rather than slowing it", () => {
  const held = normalizeTimeline({
    seconds: 10,
    keys: [
      { ...keyFrom(A.position, A.target, 0), hold: 4 },
      keyFrom(B.position, B.target, 1),
    ],
  });
  // Four of ten seconds are spent on the opening pose.
  const during = sampleTimeline(held, 0.3).position;
  for (const axis of [0, 1, 2]) assert.ok(Math.abs(during[axis] - A.position[axis]) < 1e-6);
  const after = sampleTimeline(held, 0.5).position;
  assert.ok(Math.hypot(...after.map((n, i) => n - A.position[i])) > 0.1, "and then it moves");
});

test("fades reach black at the ends and full brightness in the middle", () => {
  const tl = normalizeTimeline({ seconds: 10, keys: [keyFrom(A.position, A.target, 0), keyFrom(B.position, B.target, 1)], fade: { in: 1, out: 2 } });
  assert.equal(fadeAt(tl, 0), 0);
  assert.equal(fadeAt(tl, 1), 0);
  assert.equal(fadeAt(tl, 0.5), 1);
  assert.ok(fadeAt(tl, 0.05) > 0 && fadeAt(tl, 0.05) < 1, "and ramp rather than cut");
});

test("no fade means every frame is fully lit", () => {
  const tl = three();
  for (let i = 0; i <= 10; i++) assert.equal(fadeAt(tl, i / 10), 1);
});

test("a fade cannot outlast half the clip, so two fades cannot overlap", () => {
  const tl = normalizeTimeline({ seconds: 8, keys: [keyFrom(A.position, A.target, 0), keyFrom(B.position, B.target, 1)], fade: { in: 30, out: 30 } });
  assert.equal(tl.fade.in, 4);
  assert.equal(tl.fade.out, 4);
  assert.equal(fadeAt(tl, 0.5), 1, "the one frame both fades touch is the one frame that is fully lit");
});

test("speed is distance over the time the segment was given", () => {
  const tl = normalizeTimeline({
    seconds: 10,
    keys: [keyFrom([0, 1.5, 5], [0, 1.2, 0], 0), keyFrom([0, 1.5, -5], [0, 1.2, 0], 1)],
  });
  assert.ok(Math.abs(segmentSpeed(tl, 0) - 1) < 1e-6, "10 m in 10 s is 1 m/s");
  const held = normalizeTimeline({ ...tl, keys: [{ ...tl.keys[0], hold: 5 }, tl.keys[1]] });
  assert.ok(Math.abs(segmentSpeed(held, 0) - 2) < 1e-6, "a hold takes its seconds out of the move, so the rest is faster");
});

test("lengths, holds and strengths are clamped to something renderable", () => {
  assert.equal(timelineSeconds({ seconds: 1e6, keys: [] }), MAX_SECONDS);
  assert.equal(timelineSeconds({ seconds: -4, keys: [] }), MIN_SECONDS);
  assert.equal(normalizeTimeline({ keys: [{ ...keyFrom(A.position, A.target, 0), hold: 99 }] }).keys[0].hold, 10);
  assert.equal(normalizeTimeline({ flare: { on: true, strength: 9 } }).flare.strength, 1);
});

test("garbage in does not produce NaN out", () => {
  const tl = normalizeTimeline({ seconds: "banana", keys: [{ t: "x", position: "no", target: null }, { t: NaN }] });
  assert.equal(tl.seconds, MIN_SECONDS, "an unreadable length falls back to the shortest clip, not to NaN");
  for (let i = 0; i <= 8; i++) {
    const pose = sampleTimeline(tl, i / 8);
    assert.ok(pose.position.every(Number.isFinite) && pose.target.every(Number.isFinite));
  }
});

test("every ramp is a curve from 0 to 1", () => {
  for (const [id, { fn }] of Object.entries(EASES)) {
    assert.ok(Math.abs(fn(0)) < 1e-9, `${id} starts at 0`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${id} ends at 1`);
    for (let i = 1; i <= 20; i++) assert.ok(fn(i / 20) >= fn((i - 1) / 20) - 1e-9, `${id} never goes backwards`);
  }
});

test("samplePath renders a timeline through the same call as a fixed move", () => {
  const tl = three();
  assert.ok(isTimeline(tl));
  const base = { position: [9, 9, 9], target: [9, 9, 9] };
  const viaPath = samplePath(tl, base, 0.25);
  const direct = sampleTimeline(tl, 0.25);
  assert.deepEqual(viaPath, direct, "and ignores the base framing, because a keyframe is absolute");
});

test("an empty timeline is two keys on the current view, ready to preview", () => {
  const tl = normalizeTimeline(emptyTimeline(A.position, A.target));
  assert.equal(tl.keys.length, 2);
  assert.equal(tl.seconds, DEFAULT_SECONDS);
  assert.deepEqual(sampleTimeline(tl, 0.5).position.map((n) => +n.toFixed(6)), A.position.map((n) => +n.toFixed(6)));
});

test("poseBetween lifts the target with the camera when the floor intervenes", () => {
  const { position, target } = poseBetween(keyFrom([0.5, 0.05, 0.5], [0, 0.05, 0]), keyFrom([0.5, 0.05, 0.5], [0, 0.05, 0]), 0.5);
  assert.ok(position[1] >= 0.1199);
  assert.ok(target[1] > 0.05, "so the framing is kept rather than tipped upwards");
});

test("a timeline records which light its flare comes from", () => {
  const tl = normalizeTimeline({ keys: [], flare: { on: true, strength: 0.5, source: "spot" } });
  assert.equal(tl.flare.source, "spot");
  assert.equal(normalizeTimeline({ flare: { source: "nonsense" } }).flare.source, "overhead", "and falls back to the one that always exists");
  assert.equal(normalizeTimeline({}).flare.source, "overhead");
});
