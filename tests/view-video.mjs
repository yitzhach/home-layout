// Covers the video export end to end in a real browser: the UI, a real
// WebCodecs H.264 encode, the muxer's output parsed back as an MP4, and the
// promise every recording makes — that it leaves the camera exactly where it
// found it.
//
// H.264 encoding is not guaranteed in a headless sandbox: it depends on
// Chromium shipping a software encoder for this platform. When it is missing
// the suite says so and still checks everything up to the encode, because the
// alternative is a test that is skipped silently and rots.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5194 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOOTH_TEST_CHROMIUM ? { executablePath: process.env.BOOTH_TEST_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--single-process', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto('http://127.0.0.1:5194');
  await page.waitForFunction(() => !!window.__booth?.scene);

  const supported = await page.evaluate(() => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined');
  assert.equal(supported, true, 'Chromium should expose WebCodecs; without it the UI below is the fallback copy');

  await page.click('[data-tab="export"]');
  const move = page.locator('#video-move');
  assert.equal(await move.count(), 1, 'the export panel offers a camera move');
  const moves = await move.locator('option').evaluateAll((os) => os.map((o) => o.value));
  // The four fixed moves, then the door to a timeline of the user's own.
  assert.deepEqual(moves, ['orbit', 'push', 'reveal', 'survey', 'kenburns', 'custom'], `unexpected moves ${moves}`);

  // Choosing a move proposes the length it was designed around.
  await move.selectOption('push');
  await page.waitForFunction(() => document.querySelector('#video-seconds')?.value === '8', null, { timeout: 5000 });
  await move.selectOption('survey');
  await page.waitForFunction(() => document.querySelector('#video-seconds')?.value === '14', null, { timeout: 5000 });

  // Which codec this machine will actually encode, asked the way the app asks.
  // Open Chromium builds ship without H.264 encoding, which is the whole
  // reason the VP9 fallback exists — and the reason this suite can exercise the
  // real encoder-to-muxer pipeline here at all.
  const codec = await page.evaluate(async () => {
    const { pickCodec } = await import('/src/video.js');
    const chosen = await pickCodec({ width: 320, height: 240, framerate: 30, bitrate: 1e6 });
    return chosen && { codec: chosen.config.codec, kind: chosen.kind };
  });

  // The codec is probed and stated before anything is rendered, because it
  // decides whether QuickTime Player can open the result. In this sandbox that
  // is the VP9 warning; in Chrome or Safari it names H.264.
  await page.waitForFunction(
    () => !/Checking what this browser can encode/.test(document.querySelector("#inspector-content")?.textContent || ""),
    null,
    { timeout: 15000 },
  );
  const stated = await page.evaluate(() => {
    const warn = document.querySelector(".warn-note");
    const notes = [...document.querySelectorAll("#inspector-content .muted")].map((n) => n.textContent);
    return { warn: warn?.textContent || null, notes };
  });
  if (codec?.kind === 'vp09') {
    assert.ok(stated.warn, 'a VP9 fallback must be stated before rendering, not after');
    assert.match(stated.warn, /QuickTime Player cannot open it/, `warning read: ${stated.warn}`);
  } else if (codec) {
    assert.ok(stated.notes.some((n) => /will encode/.test(n)), 'the H.264 codec is named');
    assert.equal(stated.warn, null, 'no warning when H.264 is available');
  }

  // Preview: plays the move in the viewport and hands the camera back. This is
  // the cheap way to judge a move, so it has to leave no trace.
  const previewBefore = await page.evaluate(() => {
    const v = window.__booth.scene;
    return { position: v.camera.position.toArray(), target: v.controls.target.toArray() };
  });
  await page.selectOption('#video-seconds', '6');
  const preview = await page.evaluate(async () => {
    const v = window.__booth.scene;
    const seen = [];
    // A one-second preview: this is about the mechanism, not the duration.
    // The camera is read from inside the preview's own progress callback, not
    // on a timer: the callback fires after a frame has been drawn, where a
    // 250 ms timer can land before swiftshader has managed its first one.
    // Same property, no dependence on how fast this machine is.
    const moves = [];
    const run = v.previewMove({
      move: 'orbit',
      seconds: 1,
      onProgress: (t) => {
        seen.push(t);
        if (t > 0 && t < 1) moves.push(v.camera.position.toArray());
      },
    });
    const result = await run;
    return { result, moved: moves[0] || v.camera.position.toArray(), midway: moves.length, samples: seen.length, first: seen[0], last: seen.at(-1) };
  });
  assert.equal(preview.result.cancelled, false, 'the preview ran to the end');
  // Two samples, not four. What is being tested is that a preview reports
  // progress and finishes on t=1, not how many frames this machine managed:
  // under swiftshader one frame can take most of a second, and a count tuned
  // to a fast machine is the flake this suite is known for.
  assert.ok(preview.samples >= 2, `the preview should report progress, got ${preview.samples} samples`);
  assert.equal(preview.last, 1, 'the preview finishes on the end of the move');
  // It must actually have moved the camera part way through. On a machine slow
  // enough to render no frame before the end, there is no midway sample to
  // check — the move still ran, and the restore assertions below are what
  // matter most about it.
  if (preview.midway) {
    const drifted = preview.moved.some((v, i) => Math.abs(v - previewBefore.position[i]) > 0.01);
    assert.ok(drifted, 'the camera did not move during the preview');
  } else {
    console.log('     note: no midway frame rendered; the preview ran but this machine drew only its last frame.');
  }
  const previewAfter = await page.evaluate(() => {
    const v = window.__booth.scene;
    return { position: v.camera.position.toArray(), target: v.controls.target.toArray(), damping: v.controls.enableDamping, enabled: v.controls.enabled };
  });
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(previewAfter.position[i] - previewBefore.position[i]) < 1e-6, `preview left the camera at ${previewAfter.position[i]}`);
    assert.ok(Math.abs(previewAfter.target[i] - previewBefore.target[i]) < 1e-6, 'preview left the orbit target moved');
  }
  assert.equal(previewAfter.damping, true, 'damping is restored after a preview');
  assert.equal(previewAfter.enabled, true, 'the orbit controls are handed back');

  // And a preview can be stopped part way, leaving the camera where it started.
  const stopped = await page.evaluate(async () => {
    const v = window.__booth.scene;
    const run = v.previewMove({ move: 'survey', seconds: 10 });
    await new Promise((r) => setTimeout(r, 200));
    v.stopPreview();
    const result = await run;
    return { result, position: v.camera.position.toArray(), stopper: v.stopPreview };
  });
  assert.equal(stopped.result.cancelled, true, 'stopping a preview reports it as cancelled');
  assert.equal(stopped.stopper, null, 'the stopper is cleared once the preview ends');
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(stopped.position[i] - previewBefore.position[i]) < 1e-6, 'a stopped preview still restores the camera');

  // Starting a second preview while the first is running must not strand the
  // camera. The framing is read *after* the running preview is stopped, because
  // stopping it is what puts the camera back; reading first would make a
  // halfway-through position the new home and displace the view for good.
  const overlapped = await page.evaluate(async () => {
    const v = window.__booth.scene;
    const home = v.camera.position.toArray();
    // Wait for the first preview to actually draw a frame rather than for a
    // fixed 220 ms: under swiftshader the first frame can take most of a
    // second, and then a timer reads the camera before the move has begun.
    // The 3 s cap keeps a wedged preview from hanging the suite.
    let midway = null;
    const drawn = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 3000);
      v.previewMove({
        move: 'survey',
        seconds: 10,
        onProgress: (t) => {
          if (midway || !(t > 0)) return;
          midway = v.camera.position.toArray();
          clearTimeout(timeout);
          resolve(true);
        },
      }).then((r) => (firstResult = r));
    });
    let firstResult = null;
    await drawn;
    const second = v.previewMove({ move: 'orbit', seconds: 1 });
    const secondResult = await second;
    return { home, midway, after: v.camera.position.toArray(), firstResult, secondResult, looping: v.renderer.getAnimationLoop !== undefined };
  });
  assert.equal(overlapped.firstResult?.cancelled, true, 'the interrupted preview reports itself cancelled');
  assert.equal(overlapped.secondResult.cancelled, false, 'the second preview runs to the end');
  if (overlapped.midway)
    assert.ok(
      overlapped.midway.some((v, i) => Math.abs(v - overlapped.home[i]) > 0.01),
      'the first preview had actually moved the camera before being interrupted',
    );
  else console.log('     note: the first preview drew no frame before being interrupted on this machine.');
  for (let i = 0; i < 3; i++)
    assert.ok(
      Math.abs(overlapped.after[i] - overlapped.home[i]) < 1e-6,
      `an interrupted preview stranded the camera: axis ${i} is ${overlapped.after[i]}, home is ${overlapped.home[i]}`,
    );

  // The live loop has to be running again after a preview, or the viewport
  // freezes on the last previewed frame.
  const afterPreviewLive = await page.evaluate(async () => {
    const view = window.__booth.scene;
    const first = view.renderer.info.render.frame;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return view.renderer.info.render.frame > first;
  });
  assert.equal(afterPreviewLive, true, 'the live render loop is running again after a preview');

  // The framing the recording must hand back untouched.
  const before = await page.evaluate(() => {
    const v = window.__booth.scene;
    return { position: v.camera.position.toArray(), target: v.controls.target.toArray(), fov: v.camera.fov, pixelRatio: v.renderer.getPixelRatio() };
  });

  if (!codec) {
    console.log('SKIP no video codec encodes in this sandbox; the UI and the muxer are still covered by tests/video.test.js.');
  } else {
    // A short clip at the smallest size: this is about correctness, and a
    // software encoder under swiftshader is slow.
    const result = await page.evaluate(async () => {
      const view = window.__booth.scene;
      const progress = [];
      const recorded = await view.recordVideo({
        move: 'orbit', seconds: 1, fps: 24, size: 720,
        onProgress: (f) => progress.push(f),
      });
      const blob = recorded.blob;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dv = new DataView(bytes.buffer);
      const boxes = [];
      for (let o = 0; o < bytes.length; ) {
        const size = dv.getUint32(o);
        boxes.push({ type: String.fromCharCode(...bytes.slice(o + 4, o + 8)), size });
        if (size < 8) break;
        o += size;
      }
      // Walk moov/trak/mdia/minf/stbl to read the sample entry and the sample
      // count back out of the file that was just produced.
      const walk = (from, end, wanted) => {
        for (let o = from; o < end; ) {
          const size = dv.getUint32(o);
          if (size < 8) return null;
          const type = String.fromCharCode(...bytes.slice(o + 4, o + 8));
          if (type === wanted) return { start: o + 8, end: o + size };
          o += size;
        }
        return null;
      };
      const moov = boxes.reduce((at, b) => (b.type === 'moov' ? at : at + b.size), 0);
      let level = walk(moov + 8, bytes.length, 'trak');
      for (const type of ['mdia', 'minf', 'stbl']) level = walk(level.start, level.end, type);
      const stsd = walk(level.start, level.end, 'stsd');
      const entryStart = stsd.start + 8; // version, flags, entry count
      const entry = String.fromCharCode(...bytes.slice(entryStart + 4, entryStart + 8));
      const configuration = String.fromCharCode(...bytes.slice(entryStart + 8 + 78 + 4, entryStart + 8 + 78 + 8));
      const stsz = walk(level.start, level.end, 'stsz');
      const samples = dv.getUint32(stsz.start + 8);
      return { type: blob.type, bytes: bytes.length, boxes, progress, frames: progress.length, entry, configuration, samples, kind: recorded.kind, codec: recorded.codec, label: recorded.label, reportedFrames: recorded.frames };
    });
    assert.equal(result.type, 'video/mp4', 'the recording is an MP4');
    assert.deepEqual(result.boxes.map((b) => b.type), ['ftyp', 'mdat', 'moov'], `top-level boxes were ${JSON.stringify(result.boxes)}`);
    assert.ok(result.bytes > 2000, `a 1-second clip should be more than 2 kB, got ${result.bytes}`);
    assert.equal(result.frames, 24, `24 frames at 24fps for one second, got ${result.frames}`);
    assert.equal(result.progress.at(-1), 1, 'progress finishes at 100%');
    for (let i = 1; i < result.progress.length; i++)
      assert.ok(result.progress[i] > result.progress[i - 1], 'progress only moves forward');
    // mdat must actually hold encoded video, not an empty container.
    const mdat = result.boxes.find((b) => b.type === 'mdat');
    assert.ok(mdat.size > 1000, `mdat holds only ${mdat.size} bytes, so nothing was encoded`);

    // The sample entry has to name the codec that is actually in the file, and
    // carry its configuration box. This is the assertion that a synthetic
    // muxer test cannot make: the bytes came from a real VideoEncoder.
    assert.equal(result.entry, codec.kind === 'vp09' ? 'vp09' : 'avc1', `sample entry was ${result.entry}`);
    assert.equal(result.configuration, codec.kind === 'vp09' ? 'vpcC' : 'avcC', `configuration box was ${result.configuration}`);
    assert.equal(result.samples, result.frames, 'every rendered frame reached the sample table');
    // The recording reports what it produced, which is what lets the app warn
    // about a file QuickTime cannot open instead of handing it over silently.
    assert.equal(result.kind, codec.kind, 'the recording reports which codec encoded it');
    assert.ok(result.label, 'and names it for the user');
    assert.equal(result.reportedFrames, result.frames, 'and reports its own frame count');
    // The level in the codec string must match what the frame size and rate
    // need — the bug that made a 1440p or 1080p60 clip declare level 4.0.
    if (codec.kind !== 'vp09') {
      const { h264Level } = await import('/src/video.js');
      const expected = h264Level(1280, Math.round(1280 / (1280 / 924)), 24).toString(16).padStart(2, '0');
      assert.ok(result.codec.endsWith(expected), `codec ${result.codec} should declare level ${expected}`);
    }
    console.log(`     encoded ${result.frames} frames with ${codec.codec} into ${(result.bytes / 1024).toFixed(0)} kB, as ${result.entry}/${result.configuration}`);

    // A chosen frame, not the browser window's. The reported bug was that a
    // clip came out the shape of the viewport; a vertical frame in a
    // landscape window is the shortest way to say it no longer does.
    const vertical = await page.evaluate(async () => {
      const view = window.__booth.scene;
      const canvas = view.renderer.domElement;
      const recorded = await view.recordVideo({ move: 'orbit', seconds: 0.5, fps: 24, size: 720, frame: 'phone', settle: false });
      return { width: recorded.width, height: recorded.height, viewport: canvas.width / canvas.height };
    });
    assert.ok(vertical.viewport > 1, 'the window is landscape');
    assert.ok(vertical.height > vertical.width, `a phone clip is taller than it is wide, got ${vertical.width} x ${vertical.height}`);
    assert.equal(vertical.width % 2, 0, 'and both sides are even, as the encoder requires');
    assert.equal(vertical.height % 2, 0);
  }

  // The recording drives the user's own camera, so it has to give it back.
  const after = await page.evaluate(() => {
    const v = window.__booth.scene;
    return { position: v.camera.position.toArray(), target: v.controls.target.toArray(), fov: v.camera.fov, pixelRatio: v.renderer.getPixelRatio(), looping: !!v.renderer.info };
  });
  for (const key of ['position', 'target']) {
    for (let i = 0; i < 3; i++)
      assert.ok(Math.abs(after[key][i] - before[key][i]) < 1e-6, `${key} axis ${i} came back as ${after[key][i]}, was ${before[key][i]}`);
  }
  assert.equal(after.fov, before.fov, 'the field of view is restored');
  assert.equal(after.pixelRatio, before.pixelRatio, 'the preview pixel ratio is restored');

  // And the canvas must be back at viewport size, with the live loop answering
  // again. The loop draws on demand, so the test asks for a frame the way any
  // change does; a loop left stopped would ignore the request.
  const live = await page.evaluate(async () => {
    const view = window.__booth.scene;
    const first = view.renderer.info.render.frame;
    view.invalidate();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { advanced: view.renderer.info.render.frame > first, width: view.renderer.domElement.clientWidth };
  });
  assert.equal(live.advanced, true, 'the live render loop is running again');
  assert.ok(live.width > 300, `the canvas came back at ${live.width}px`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS video export: camera moves, codec probe, live preview, WebCodecs encode, MP4 container and camera restoration.');
} finally {
  await browser.close();
  await server.close();
}
