// The AI Worker (phase 5): the app's one call out, and only when asked.
//
// Everything else the Worker serves is the static app in dist/, through the
// ASSETS binding, exactly as it did when wrangler served assets alone. Only
// `/api/*` reaches this code first (`run_worker_first` in wrangler.jsonc).
//
// What it does, and nothing more:
//   GET  /api/ai/status    — whether AI is set up on this deployment
//   POST /api/ai/material  — a photo of a surface → a name, the nearest of the
//                            app's floor finishes, a colour and a roughness
//   POST /api/ai/corners   — a photo of a wall → its four corners, for the
//                            wall-photo straightening of phase 3
//
// The owner's Anthropic key is a Worker secret, ANTHROPIC_API_KEY, and never
// leaves here. Without it every AI route answers 503 and the app says AI is
// not set up; nothing else changes. There are no accounts, so the limit is per
// browser and per address together: the browser sends a random id it keeps in
// localStorage, and a request is refused if either its id or its IP has used
// the minute's allowance (the AI_LIMIT rate-limiting binding). Rotating the id
// does not get round the address.
//
// Claude cannot make images, so a texture from a photo stays a job for the
// browser; the model only looks and labels. Requests are small on purpose —
// the browser sends a JPEG no wider than 1024px — and effort is low: this is
// naming a floor, not a proof.
import Anthropic from "@anthropic-ai/sdk";
import { FLOOR_FINISHES } from "../src/finishes.js";

export const MODEL = "claude-opus-5";
export const MAX_IMAGE_BYTES = 1_500_000;
const MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEX = /^#[0-9a-f]{6}$/i;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const MATERIAL_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "What the surface is, in a few words, e.g. 'wide-plank white oak'." },
    finish: { type: "string", enum: [...Object.keys(FLOOR_FINISHES), "none"] },
    color: { type: "string", description: "The surface's average colour as #rrggbb, ignoring shadows and highlights." },
    roughness: { type: "number", description: "0 mirror-gloss to 1 fully matte." },
  },
  required: ["label", "finish", "color", "roughness"],
  additionalProperties: false,
};

const CORNER_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    corners: {
      type: "array",
      description: "Top-left, top-right, bottom-right, bottom-left, each [x, y] as fractions of the image width and height.",
      items: { type: "array", items: { type: "number" } },
    },
  },
  required: ["found", "corners"],
  additionalProperties: false,
};

const PROMPTS = {
  material: (kind) =>
    `This photo shows a ${kind === "wall" ? "wall" : "floor"} surface in a home. Say what the material is, pick the closest of these floor finishes (or "none" if nothing is close): ${Object.entries(FLOOR_FINISHES)
      .map(([k, v]) => `${k} = ${v.label}`)
      .join("; ")}. Give its average colour as it would look under neutral light, and how rough it looks.`,
  corners: () =>
    "This photo shows one wall of a room. Find the four corners of the wall itself — where it meets the ceiling, the floor and the walls beside it — even if furniture hides part of it. If no wall fills a clear part of the photo, set found to false.",
};

/** Whether an Origin header, if any, is this deployment's own. */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function limited(env, request) {
  if (!env.AI_LIMIT) return false;
  const ip = request.headers.get("cf-connecting-ip") || "unknown",
    browser = (request.headers.get("x-browser-id") || "").slice(0, 64) || "none";
  const [a, b] = await Promise.all([env.AI_LIMIT.limit({ key: "ip:" + ip }), env.AI_LIMIT.limit({ key: "browser:" + browser })]);
  return !a.success || !b.success;
}

/** The request's image, checked: a base64 JPEG, PNG or WebP under the cap. */
export function readImage(body) {
  if (!body || typeof body !== "object") return null;
  const { image, mediaType } = body;
  if (typeof image !== "string" || !MEDIA.has(mediaType)) return null;
  if (image.length > (MAX_IMAGE_BYTES * 4) / 3 || !/^[A-Za-z0-9+/]+=*$/.test(image)) return null;
  return { data: image, mediaType };
}

/** Clean what the model answered into what the app can apply. */
export function cleanMaterial(m) {
  if (!m || typeof m !== "object") return null;
  return {
    label: String(m.label || "").slice(0, 80),
    finish: m.finish in FLOOR_FINISHES ? m.finish : null,
    color: HEX.test(m.color) ? m.color.toLowerCase() : null,
    roughness: Number.isFinite(m.roughness) ? Math.max(0, Math.min(1, m.roughness)) : null,
  };
}

export function cleanCorners(c) {
  if (!c || c.found !== true || !Array.isArray(c.corners) || c.corners.length !== 4) return { found: false, corners: null };
  const corners = c.corners.map((q) => (Array.isArray(q) && q.length === 2 ? q.map((n) => Math.max(0, Math.min(1, Number(n)))) : null));
  if (corners.some((q) => !q || q.some((n) => !Number.isFinite(n)))) return { found: false, corners: null };
  return { found: true, corners };
}

/** One structured call to Claude; the parsed JSON, or an error to show. */
export async function ask(client, image, prompt, schema) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") return { error: "The model declined this photo." };
  const text = response.content.find((b) => b.type === "text")?.text;
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: "The model's answer could not be read." };
  }
}

/**
 * The API. `makeClient` is how tests put a stand-in for Anthropic; in
 * production it is the SDK client with the owner's key.
 */
export async function handleApi(request, env, makeClient = (key) => new Anthropic({ apiKey: key })) {
  const { pathname } = new URL(request.url);
  const enabled = !!env.ANTHROPIC_API_KEY;
  if (pathname === "/api/ai/status" && request.method === "GET") return json({ enabled });
  const route = { "/api/ai/material": "material", "/api/ai/corners": "corners" }[pathname];
  if (!route) return json({ error: "Not found." }, 404);
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!sameOrigin(request)) return json({ error: "Not from this app." }, 403);
  if (!enabled) return json({ error: "AI is not set up on this site." }, 503);
  if (Number(request.headers.get("content-length") || 0) > MAX_IMAGE_BYTES * 1.5) return json({ error: "That photo is too large." }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const image = readImage(body);
  if (!image) return json({ error: "Send a JPEG, PNG or WebP photo, base64, under 1.5 MB." }, 400);
  if (await limited(env, request)) return json({ error: "Too many requests — try again in a minute." }, 429);
  const client = makeClient(env.ANTHROPIC_API_KEY);
  try {
    if (route === "material") {
      const kind = body.kind === "wall" ? "wall" : "floor";
      const r = await ask(client, image, PROMPTS.material(kind), MATERIAL_SCHEMA);
      if (r.error) return json({ error: r.error }, 502);
      const m = cleanMaterial(r.value);
      return m ? json(m) : json({ error: "The model's answer could not be read." }, 502);
    }
    const r = await ask(client, image, PROMPTS.corners(), CORNER_SCHEMA);
    if (r.error) return json({ error: r.error }, 502);
    return json(cleanCorners(r.value));
  } catch (err) {
    const status = err instanceof Anthropic.RateLimitError ? 429 : 502;
    return json({ error: status === 429 ? "AI is busy — try again in a minute." : "AI could not be reached." }, status);
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
