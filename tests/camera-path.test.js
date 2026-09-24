import test from "node:test";
import assert from "node:assert/strict";
import {
  MOVES, DEFAULT_MOVE, resolveMove, samplePath, frameTimes,
  smootherstep, easeOut, toSpherical, fromSpherical,
} from "../src/camera-path.js";

const BASE = { position: [3.6, 2.1, 4.8], target: [0, 1.2, -0.3] };
const height = (p) => p[1];
const radiusOf = (s) => Math.hypot(s.position[0] - s.target[0], s.position[1] - s.target[1], s.position[2] - s.target[2]);

test("spherical coordinates round-trip", () => {
  for (const offset of [[3, 2, 4], [-1, 0.5, -2], [0, 5, 0], [2, -1, 0]]) {
    const back = fromSpherical(toSpherical(offset));
    for (let i = 0; i < 3; i++)
      assert.ok(Math.abs(back[i] - offset[i]) < 1e-9, `${offset} came back as ${back}`);
  }
});

test("a camera sitting on its own target does not produce NaN", () => {
  const s = toSpherical([0, 0, 0]);
  assert.equal(s.radius, 0);
  assert.ok(Number.isFinite(s.theta) && Number.isFinite(s.phi));
  for (const id of Object.keys(MOVES)) {
    const frame = samplePath(id, { position: [1, 1, 1], target: [1, 1, 1] }, 0.5);
    assert.ok(frame.position.every(Number.isFinite), `${id} produced ${frame.position}`);
  }
});

// The whole point of the easing. A move whose velocity is non-zero at t=0 or
// t=1 reads as a scrubbed viewport rather than a camera.
test("smootherstep starts and stops with zero velocity", () => {
  assert.equal(smootherstep(0), 0);
  assert.equal(smootherstep(1), 1);
  assert.ok(Math.abs(smootherstep(0.5) - 0.5) < 1e-12, "and is symmetric about the middle");
  const h = 1e-4;
  assert.ok(smootherstep(h) / h < 0.01, "velocity at the start is negligible");
  assert.ok((1 - smootherstep(1 - h)) / h < 0.01, "velocity at the end is negligible");
});

test("easeOut commits early and settles, rather than easing both ends", () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5, "past halfway by the midpoint");
  const h = 1e-4;
  assert.ok((1 - easeOut(1 - h)) / h < 0.01, "it still stops rather than cutting");
});

test("every easing stays inside 0..1 for input outside it", () => {
  for (const ease of [smootherstep, easeOut])
    for (const t of [-2, -0.001, 0, 0.5, 1, 1.001, 7, NaN]) {
      const v = ease(t);
      if (Number.isNaN(t)) assert.ok(Number.isFinite(v) || Number.isNaN(v));
      else assert.ok(v >= 0 && v <= 1, `${ease.name}(${t}) = ${v}`);
    }
});

test("each move ends where it means to and moves monotonically in time", () => {
  for (const id of Object.keys(MOVES)) {
    const frames = Array.from({ length: 61 }, (_, i) => samplePath(id, BASE, i / 60));
    for (const frame of frames)
      assert.ok(frame.position.every(Number.isFinite) && frame.target.every(Number.isFinite), `${id} went non-finite`);
    // Consecutive frames must be close together: a jump is a visible cut.
    for (let i = 1; i < frames.length; i++) {
      const step = Math.hypot(...frames[i].position.map((v, k) => v - frames[i - 1].position[k]));
      assert.ok(step < radiusOf(frames[0]) * 0.2, `${id} jumps ${step.toFixed(3)} between frames ${i - 1} and ${i}`);
    }
  }
});

// A frame under the floor is a frame of the underside of the ground plane, and
// it is the single most likely way a generated move produces garbage.
test("no move ever puts the eye at or below the floor", () => {
  const targets = [BASE, { position: [1.2, 0.4, 1.1], target: [0, 0.2, 0] }, { position: [9, 0.3, 0.2], target: [0, 2.4, 0] }];
  for (const id of Object.keys(MOVES))
    for (const base of targets)
      for (let i = 0; i <= 120; i++) {
        const frame = samplePath(id, base, i / 120);
        assert.ok(height(frame.position) >= 0.12 - 1e-9, `${id} dropped to ${height(frame.position)}`);
      }
});

test("a move orbits the framing it was given rather than replacing it", () => {
  const frame = samplePath("orbit", BASE, 0.5);
  // Mid-orbit, the arc is symmetric, so it passes through the original framing.
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(frame.position[i] - BASE.position[i]) < 1e-6, `orbit strayed on axis ${i}`);
  assert.deepEqual(frame.target, BASE.target, "and keeps looking at the same place");
});

test("the push-in ends closer than it starts, and the reveal ends higher", () => {
  const push = [0, 1].map((t) => samplePath("push", BASE, t));
  assert.ok(radiusOf(push[1]) < radiusOf(push[0]) * 0.6, "the push in actually pushes in");
  const reveal = [0, 1].map((t) => samplePath("reveal", BASE, t));
  assert.ok(height(reveal[0].position) < height(reveal[1].position), "the reveal rises");
  assert.ok(
    Math.abs(height(reveal[1].position) - height(BASE.position)) < 1e-6,
    "and lands on the framing the user set",
  );
});

test("no move swings more than a half turn, so a clip is not a turntable", () => {
  for (const id of Object.keys(MOVES)) {
    const angle = (t) => {
      const p = samplePath(id, BASE, t);
      return Math.atan2(p.position[0] - p.target[0], p.position[2] - p.target[2]);
    };
    let swing = 0;
    for (let i = 1; i <= 120; i++) swing += Math.abs(angle(i / 120) - angle((i - 1) / 120));
    assert.ok(swing <= Math.PI + 1e-6, `${id} swings ${((swing * 180) / Math.PI).toFixed(0)} degrees`);
  }
});

test("an unknown move falls back rather than throwing on an old backup", () => {
  assert.equal(resolveMove("nope").id, DEFAULT_MOVE);
  assert.equal(resolveMove(undefined).id, DEFAULT_MOVE);
  assert.ok(MOVES[DEFAULT_MOVE], "the default is a real move");
  for (const [id, move] of Object.entries(MOVES)) {
    assert.ok(move.label && move.describe, `${id} is described to the user`);
    assert.ok(move.seconds >= 4 && move.seconds <= 30, `${id} runs for ${move.seconds}s`);
    assert.equal(typeof move.ease, "function");
  }
});

// Frame times come from the index, never an accumulator, so a long clip cannot
// drift — and the final frame is the end of the move, not one step short of it.
test("frame times are exact at both ends and never drift", () => {
  const { count, at } = frameTimes(12, 30);
  assert.equal(count, 360);
  assert.equal(at(0), 0);
  assert.equal(at(count - 1), 1, "the clip ends on the end of the move");
  assert.ok(at(count) <= 1, "and cannot overshoot if asked for one frame too many");
  for (const [seconds, fps] of [[8, 24], [14, 60], [10, 30], [0.01, 30]]) {
    const clip = frameTimes(seconds, fps);
    assert.ok(clip.count >= 2, `${seconds}s at ${fps}fps still has two frames to interpolate`);
    assert.equal(clip.at(clip.count - 1), 1);
  }
});
