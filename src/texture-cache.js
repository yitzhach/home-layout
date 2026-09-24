import { normalizeImageEdits } from "./image-edit.js";

// Shared GPU textures belong to the cache, not to disposable scene materials.
export class TextureCache {
  entries = new Map();
  key(id, edits) {
    return JSON.stringify([id, normalizeImageEdits(edits)]);
  }
  peek(id, edits, data) {
    const entry = this.entries.get(this.key(id, edits));
    return entry?.data === data ? entry.texture : undefined;
  }
  get(id, edits, data, create) {
    const key = this.key(id, edits);
    let entry = this.entries.get(key);
    if (entry?.data === data) return entry.promise;
    if (entry) this.remove(key);
    entry = { data, texture: null };
    this.entries.set(key, entry);
    entry.promise = Promise.resolve().then(create).then(texture => {
      if (this.entries.get(key) === entry) entry.texture = texture;
      else texture.dispose();
      return texture;
    }, error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    return entry.promise;
  }
  remove(key) {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    entry?.texture?.dispose();
  }
  retain(references) {
    const keep = new Map(references.map(r => [this.key(r.id, r.edits), r.data]));
    for (const [key, entry] of this.entries)
      if (!keep.has(key) || keep.get(key) !== entry.data) this.remove(key);
  }
  pending() {
    return [...this.entries.values()].map(entry => entry.promise);
  }
}
