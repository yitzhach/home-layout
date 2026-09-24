/**
 * The project and its images are two stores, not one record.
 *
 * Every edit schedules a save, and a save used to hand IndexedDB the whole
 * project — including every uploaded original as base64. Serialising fifty
 * megabytes of string happens on the main thread, and it happened again 350 ms
 * after each nudge of a slider, for images that had not changed since they
 * were uploaded. Now the layout is one small record and each original is a row
 * of its own, written when it arrives and not again.
 *
 * Backups are untouched by this: a `.booth.json` is still one document with
 * its images inside it, which is what makes it portable, and what schema 1
 * promises.
 */
const dbPromise = new Promise((resolve, reject) => {
  const r = indexedDB.open("artist-os-booth-studio", 2);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
    if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets");
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
/**
 * What each asset row looked like when this session last wrote or read it, so
 * a save can tell which rows changed without comparing megabytes. The three
 * parts are everything the app ever alters about a stored asset — its role,
 * its thumbnail and the original itself — and each is a length or a word, so
 * the check is free.
 */
const written = new Map();
const stamp = (asset) =>
  `${asset.role || ""}|${asset.thumb ? asset.thumb.length : 0}|${asset.data ? asset.data.length : 0}`;
export async function load() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "assets"]);
    const project = tx.objectStore("projects").get("current");
    const store = tx.objectStore("assets");
    const ids = store.getAllKeys();
    const rows = store.getAll();
    tx.oncomplete = () => {
      const p = project.result;
      if (!p) {
        resolve(p);
        return;
      }
      // A project written before the images had a store of their own carries
      // them inline, and inline is still what it means. It moves across on
      // the next save, which happens moments after opening.
      if (!p.assets || !Object.keys(p.assets).length) {
        const byId = new Map(ids.result.map((id, i) => [id, rows.result[i]]));
        const assets = {};
        // In the order they were added, not the order the store hands them
        // back: the ground picker lists uploaded floors in this order, and a
        // list that reshuffles itself on reload is a bug even when every
        // entry is still there.
        for (const id of p.assetOrder || []) if (byId.has(id)) assets[id] = byId.get(id);
        for (const [id, asset] of byId) if (!(id in assets)) assets[id] = asset;
        delete p.assetOrder;
        p.assets = assets;
        // Everything just read is, by definition, what is stored — so the
        // first save of a session rewrites none of it.
        written.clear();
        for (const [id, asset] of Object.entries(assets)) written.set(id, stamp(asset));
      }
      resolve(p);
    };
    tx.onerror = () => reject(tx.error);
  });
}
export async function save(p) {
  const db = await dbPromise;
  const assets = p.assets || {};
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "assets"], "readwrite");
    const store = tx.objectStore("assets");
    const present = store.getAllKeys();
    present.onsuccess = () => {
      const stored = new Set(present.result);
      for (const [id, asset] of Object.entries(assets)) {
        const now = stamp(asset);
        if (stored.has(id) && written.get(id) === now) continue;
        store.put(asset, id);
        written.set(id, now);
      }
      // An image nothing refers to any more goes with the save that dropped
      // it, in the same transaction, so the two can never disagree.
      for (const id of stored)
        if (!(id in assets)) {
          store.delete(id);
          written.delete(id);
        }
    };
    // `assetOrder` belongs to the stored record, not to the project: `load`
    // spends it rebuilding the map and drops it again, so nothing downstream
    // — a backup least of all — ever sees a key schema 1 has not heard of.
    tx.objectStore("projects").put(
      { ...p, assets: {}, assetOrder: Object.keys(assets) },
      "current",
    );
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
/**
 * The longest edge of the thumbnail every asset carries. The library card is
 * 52 px wide and the selected-artwork panel is not much bigger, so this is
 * generous even on a retina screen — and about four orders of magnitude off
 * the original it stands in for.
 */
export const THUMB_MAX = 256;
/**
 * A small JPEG of an original, for the library and the inspector.
 *
 * Every re-render of either used to put the whole original in an `<img src>`,
 * so a click on a booth carrying a dozen 20-megapixel photographs asked the
 * browser to find a dozen decoded 20-megapixel bitmaps again. This is the
 * picture those places actually wanted: about 15 KB, decoded in no time, and
 * held in the project so it survives a reload rather than being rebuilt on
 * every start.
 *
 * It is derived data. The original is never touched — `asset.data` is the
 * file that was handed over, and it is what a backup and an export still use.
 */
export function thumbnailOf(source, width, height) {
  const longest = Math.max(width, height) || 1;
  const scale = Math.min(1, THUMB_MAX / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
export async function readImage(file) {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw new Error("Choose an original JPG or PNG image.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose an image smaller than 25 MB.");
  const data = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("This file could not be read."));
    r.readAsDataURL(file);
  });
  const im = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("This image could not be decoded."));
    i.src = data;
  });
  if (im.width * im.height > 100000000)
    throw new Error("Please use an image below 100 megapixels.");
  const asset = { data, width: im.width, height: im.height, name: file.name };
  // A thumbnail is worth having and never worth failing an upload over: a
  // canvas that will not export — a tainted one, or one past a browser's size
  // limit — leaves the asset without one, and the library falls back to the
  // original exactly as it always did.
  try {
    asset.thumb = thumbnailOf(im, im.width, im.height);
  } catch {}
  return asset;
}
