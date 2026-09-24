import test from "node:test";
import assert from "node:assert/strict";
import { TextureCache } from "../src/texture-cache.js";

test("edited images stay synchronously available across selection rebuilds", async () => {
  const cache = new TextureCache();
  let loads = 0, disposals = 0;
  const edits = { contrast: 20, temperature: 12 };
  const texture = { dispose() { disposals++; } };
  const create = () => { loads++; return texture; };
  const first = cache.get("art", edits, "original", create);
  assert.equal(cache.get("art", { temperature: 12, contrast: 20 }, "original", create), first);
  await first;
  for (let i = 0; i < 6; i++) {
    cache.retain([{ id: "art", edits, data: "original" }]);
    assert.equal(cache.peek("art", edits, "original"), texture);
    assert.equal(await cache.get("art", edits, "original", create), texture);
  }
  assert.equal(loads, 1);
  assert.equal(disposals, 0);
});

test("changed edits and replaced originals cannot reuse stale textures", async () => {
  const cache = new TextureCache();
  let disposed = 0;
  await cache.get("art", { contrast: 10 }, "old", () => ({ dispose() { disposed++; } }));
  assert.equal(cache.peek("art", { contrast: 20 }, "old"), undefined);
  assert.equal(cache.peek("art", { contrast: 10 }, "new"), undefined);
  cache.retain([{ id: "art", edits: { contrast: 20 }, data: "new" }]);
  assert.equal(disposed, 1);
  assert.equal(cache.entries.size, 0);
});

test("removed in-flight textures are disposed and failed loads can retry", async () => {
  const cache = new TextureCache();
  let finish, disposed = 0;
  const pending = cache.get("art", null, "image", () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.retain([]);
  finish({ dispose() { disposed++; } });
  await pending;
  assert.equal(disposed, 1);
  assert.equal(cache.peek("art", null, "image"), undefined);
  await assert.rejects(cache.get("art", null, "image", () => { throw new Error("decode"); }));
  const good = { dispose() {} };
  assert.equal(await cache.get("art", null, "image", () => good), good);
});
