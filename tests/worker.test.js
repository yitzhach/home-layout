// The AI Worker (phase 5). No network: a stand-in plays Anthropic, another
// plays the rate limiter. These pin that the key never has to be present for
// the app to run, that only this app's own pages get answers, that a photo is
// checked before anything is spent on it, that the limit counts the address as
// well as the browser, and that whatever the model says is cleaned into
// something the app can apply.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { MODEL, cleanCorners, cleanMaterial, handleApi, readImage } from "../worker/index.js";

const IMG = Buffer.from("not really a jpeg").toString("base64");
const url = (path) => "https://home.example" + path;
const post = (path, body, headers = {}) =>
  new Request(url(path), { method: "POST", headers: { "content-type": "application/json", origin: "https://home.example", ...headers }, body: JSON.stringify(body) });

function fakeClient(answer, calls = []) {
  return () => ({
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return typeof answer === "function" ? answer(params) : { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }] };
        },
      },
    },
  });
}
function limiter(allow = () => true) {
  const keys = [];
  return { keys, limit: async ({ key }) => (keys.push(key), { success: allow(key) }) };
}
const env = (extra = {}) => ({ ANTHROPIC_API_KEY: "sk-test", AI_LIMIT: limiter(), ...extra });

test("status says whether AI is set up, and nothing needs the key to be", async () => {
  assert.deepEqual(await (await handleApi(new Request(url("/api/ai/status")), {})).json(), { enabled: false });
  assert.deepEqual(await (await handleApi(new Request(url("/api/ai/status")), env())).json(), { enabled: true });
  const res = await handleApi(post("/api/ai/material", { image: IMG, mediaType: "image/jpeg" }), {}, fakeClient({}));
  assert.equal(res.status, 503);
});

test("everything that is not /api/ goes to the static app", async () => {
  const seen = [];
  const res = await worker.fetch(new Request(url("/index.html")), { ASSETS: { fetch: async (r) => (seen.push(r.url), new Response("app")) } });
  assert.equal(await res.text(), "app");
  assert.deepEqual(seen, [url("/index.html")]);
  assert.equal((await worker.fetch(new Request(url("/api/nope")), {})).status, 404);
});

test("a material photo becomes a finish, a colour and a roughness", async () => {
  const calls = [];
  const res = await handleApi(
    post("/api/ai/material", { image: IMG, mediaType: "image/jpeg", kind: "floor" }),
    env(),
    fakeClient({ label: "Wide white oak", finish: "light-oak", color: "#C8B08A", roughness: 0.55 }, calls),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.label, "Wide white oak");
  assert.equal(body.color, "#c8b08a");
  assert.equal(body.roughness, 0.55);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.model, MODEL);
  assert.equal(c.output_config.format.type, "json_schema");
  assert.equal(c.messages[0].content[0].source.data, IMG, "the photo is sent as given");
  assert.ok(!JSON.stringify(c).includes("sk-test"), "the key is never in the request body");
});

test("a photo is checked before anything is spent on it", async () => {
  const calls = [];
  for (const body of [{}, { image: IMG, mediaType: "image/gif" }, { image: "not base64!", mediaType: "image/jpeg" }, { image: "A".repeat(2_100_000), mediaType: "image/jpeg" }]) {
    const res = await handleApi(post("/api/ai/material", body), env(), fakeClient({}, calls));
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await handleApi(post("/api/ai/material", { image: IMG, mediaType: "image/jpeg" }, { origin: "https://evil.example" }), env(), fakeClient({}, calls))).status, 403);
  assert.equal((await handleApi(new Request(url("/api/ai/material")), env(), fakeClient({}, calls))).status, 405);
  assert.equal(calls.length, 0, "no call reached the model");
});

test("the limit counts the address and the browser, each on its own", async () => {
  const lim = limiter((key) => key !== "ip:203.0.113.9");
  const calls = [];
  const res = await handleApi(
    post("/api/ai/corners", { image: IMG, mediaType: "image/png" }, { "cf-connecting-ip": "203.0.113.9", "x-browser-id": "fresh-id" }),
    env({ AI_LIMIT: lim }),
    fakeClient({}, calls),
  );
  assert.equal(res.status, 429);
  assert.deepEqual(lim.keys.sort(), ["browser:fresh-id", "ip:203.0.113.9"]);
  assert.equal(calls.length, 0);
});

test("corners come back as four clamped points, or not found", async () => {
  const res = await handleApi(post("/api/ai/corners", { image: IMG, mediaType: "image/jpeg" }), env(), fakeClient({ found: true, corners: [[0.1, 0.1], [0.9, 0.12], [1.2, 0.95], [0.05, 0.9]] }));
  assert.deepEqual(await res.json(), { found: true, corners: [[0.1, 0.1], [0.9, 0.12], [1, 0.95], [0.05, 0.9]] });
  assert.deepEqual(cleanCorners({ found: true, corners: [[0, 0]] }), { found: false, corners: null });
  assert.deepEqual(cleanCorners({ found: false, corners: [] }), { found: false, corners: null });
});

test("a refusal, an unreadable answer or a failed call is an error the app can show", async () => {
  const refused = await handleApi(post("/api/ai/material", { image: IMG, mediaType: "image/jpeg" }), env(), fakeClient(() => ({ stop_reason: "refusal", content: [] })));
  assert.equal(refused.status, 502);
  assert.match((await refused.json()).error, /declined/);
  const garbled = await handleApi(post("/api/ai/material", { image: IMG, mediaType: "image/jpeg" }), env(), fakeClient(() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "{oops" }] })));
  assert.equal(garbled.status, 502);
  const down = await handleApi(post("/api/ai/material", { image: IMG, mediaType: "image/jpeg" }), env(), fakeClient(() => { throw new Error("socket"); }));
  assert.equal(down.status, 502);
});

test("the model's material answer is cleaned", () => {
  assert.deepEqual(cleanMaterial({ label: "x".repeat(200), finish: "lava", color: "red", roughness: 7 }), { label: "x".repeat(80), finish: null, color: null, roughness: 1 });
  assert.equal(readImage({ image: IMG, mediaType: "image/webp" }).mediaType, "image/webp");
});
