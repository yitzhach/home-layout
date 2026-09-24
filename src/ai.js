// The browser's side of the AI Worker (phase 5): ask whether AI is set up,
// shrink a photo, send it, and hand back what came back — or an error in
// words someone can act on. See worker/index.js for the other side.
//
// Nothing here runs unless someone presses an AI button, and with AI not set
// up (no key on the deployment, or the dev server, which has no /api) every
// call ends in "not set up" and the app carries on as it was.

export const BROWSER_KEY = "home.browserId";
export const MAX_SIDE = 1024;

/** A random id this browser keeps, sent so the Worker can limit it. */
export function browserId(storage = globalThis.localStorage) {
  try {
    let id = storage.getItem(BROWSER_KEY);
    if (!id) storage.setItem(BROWSER_KEY, (id = globalThis.crypto.randomUUID()));
    return id;
  } catch {
    return "";
  }
}

/** The size a photo is drawn at to be sent: its longest side at most `max`. */
export function fitSize(w, h, max = MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** A File → base64 JPEG no larger than MAX_SIDE on its longest side. */
export async function photoPayload(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { image: url.slice(url.indexOf(",") + 1), mediaType: "image/jpeg" };
}

let status = null;
/** Whether this deployment has AI, asked once per page. */
export function aiEnabled(fetcher = globalThis.fetch) {
  status ??= fetcher("/api/ai/status")
    .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : { enabled: false }))
    .then((j) => j.enabled === true)
    .catch(() => false);
  return status;
}

/**
 * POST a photo to an AI route. Resolves to `{ value }` or `{ error }`, never
 * throws: the caller shows the error as a toast and nothing else changes.
 */
export async function askAI(route, payload, fetcher = globalThis.fetch) {
  if (!(await aiEnabled(fetcher))) return { error: "AI is not set up on this site yet." };
  try {
    const r = await fetcher("/api/ai/" + route, {
      method: "POST",
      headers: { "content-type": "application/json", "x-browser-id": browserId() },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { value: body } : { error: body.error || "AI could not be reached." };
  } catch {
    return { error: "AI could not be reached — are you offline?" };
  }
}
