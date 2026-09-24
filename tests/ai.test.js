// The browser's side of the AI Worker: photos shrunk before they are sent,
// and every failure — no Worker, no key, offline, refused — an error to show
// rather than a throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askAI, browserId, fitSize } from "../src/ai.js";

test("a photo is sent no larger than 1024px on its longest side", () => {
  assert.deepEqual(fitSize(4032, 3024), { width: 1024, height: 768 });
  assert.deepEqual(fitSize(600, 900), { width: 600, height: 900 }, "never enlarged");
});

test("a browser keeps one id, and storage that throws is survived", () => {
  const m = new Map();
  const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const a = browserId(store);
  assert.ok(a.length > 10);
  assert.equal(browserId(store), a);
  assert.equal(browserId({ getItem() { throw new Error("blocked"); } }), "");
});

test("without the Worker every ask is 'not set up', and nothing is posted", async () => {
  const calls = [];
  const fetcher = async (url, init) => (calls.push([url, init?.method]), new Response("<html>", { headers: { "content-type": "text/html" } }));
  const r = await askAI("material", { image: "AA==", mediaType: "image/jpeg" }, fetcher);
  assert.match(r.error, /not set up/);
  assert.deepEqual(calls, [["/api/ai/status", undefined]]);
});
