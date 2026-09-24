import * as T from "three";

// Image-based lighting layer.
//
// A preset names an HDRI (lighting), a backdrop image, a ground surface and an
// exposure. Every asset reference is optional: with `public/assets` empty the
// app must still run, so a preset whose files are missing falls back silently
// to the procedural environment in environment.js. That is why nothing here
// throws on a failed load.
//
// Two files per environment, not one: a small .hdr drives `scene.environment`
// (lighting and reflections) while a tonemapped .jpg drives `scene.background`
// (what the camera sees). A single 4K HDR serving both costs roughly ten times
// the bytes for no visible gain — see PBR_PHASE.md.

export const ENV_PRESETS = {
  studio: {
    label: "Studio · neutral",
    hdri: null,
    ground: "studio",
    horizon: "studio",
    exposure: 1.15,
    envIntensity: 1,
  },
  // A white hall, and nothing photographed in it. This preset carried the
  // burnt-warehouse HDRI until someone put an art-show booth in it and got
  // brick, girders and a dark ceiling behind seamless white walls: a trade
  // show is a convention centre, not a warehouse, and the photograph was
  // answering a question nobody asked. The warehouse is still here — it is
  // its own preset below, which is where someone who wants it goes.
  //
  // No `hdri`, so the procedural surroundings and the booth's own exhibition
  // hall stand, and the floor is the texture-free studio grey rather than a
  // concrete photograph.
  tradeshow: {
    label: "Trade show · exhibition hall",
    hdri: null,
    ground: "studio",
    horizon: "studio",
    exposure: 1.0,
    envIntensity: 1,
  },
  warehouse: {
    label: "Warehouse · photographed",
    hdri: "warehouse",
    ground: "concrete",
    horizon: "studio",
    exposure: 1.0,
    envIntensity: 1,
  },
  artfair: {
    label: "Art fair · outdoor",
    hdri: "artfair",
    ground: "grass",
    horizon: "open",
    exposure: 1.1,
    envIntensity: 1,
  },
  home: {
    label: "Home · interior",
    hdri: "home",
    ground: "studio",
    horizon: "studio",
    exposure: 0.9,
    envIntensity: 0.9,
  },
};
export const DEFAULT_PRESET = "studio";

// Which presets put the booth under a roof. Indoors the hall supplies its own
// track lighting, so the booth's own fixtures are visual clutter hanging in
// mid-air beside it — the rail reads as the light source and the housings read
// as a bug. Outdoors and in the neutral studio there is no hall, so the
// fixtures are the only thing telling you where the light comes from.
export const INDOOR_PRESETS = new Set(["tradeshow", "warehouse", "home"]);
// A venue of "artshow" is indoors whatever the environment picker says: the
// art-show booth stands in its own white hall with a light bar over it, and
// that hall is the thing the fixtures would be duplicating. The environment
// preset is a separate question — it defaults to the neutral studio there —
// so both are asked.
export const isIndoor = (preset, venue) =>
  venue === "artshow" || INDOOR_PRESETS.has(preset || DEFAULT_PRESET);

// Whether the spotlight housings are drawn. "auto" is the default and means
// "not indoors"; the other two are for someone who disagrees with that, which
// is a judgement about their own booth and not ours to override.
export const FIXTURE_MODES = {
  auto: "Auto · hidden indoors",
  always: "Always show",
  never: "Never show",
};
export const DEFAULT_FIXTURES = "auto";
export const showFixtures = (mode, preset, venue) =>
  (mode || DEFAULT_FIXTURES) === "always" ? true : (mode || DEFAULT_FIXTURES) === "never" ? false : !isIndoor(preset, venue);

// Artwork fidelity. "accurate" keeps the environment out of the artwork's
// shading so uploaded colour reads true; the lighting studio's own spotlights
// still fall on it, which a MeshBasicMaterial would discard. "scene" lets the
// HDRI tint the art the way the surrounding booth is tinted.
export const ART_FIDELITY = {
  accurate: "Accurate colour",
  scene: "Scene lighting",
};
export const DEFAULT_FIDELITY = "accurate";

export const resolvePreset = (id) =>
  ENV_PRESETS[id] ? { id, ...ENV_PRESETS[id] } : { id: DEFAULT_PRESET, ...ENV_PRESETS[DEFAULT_PRESET] };

export const artEnvIntensity = (mode) => (mode === "scene" ? 1 : 0);

export const presetPaths = (preset) =>
  preset.hdri
    ? {
        light: `assets/hdri/${preset.hdri}/light.hdr`,
        background: `assets/hdri/${preset.hdri}/bg.jpg`,
        meta: `assets/hdri/${preset.hdri}/meta.json`,
      }
    : null;

// Both the dev server and the deployed Worker answer a missing asset with
// index.html and a 200, so "did it load" cannot be left to the loaders:
// HDRLoader parses that HTML into undefined and throws from inside its own
// callback, outside any promise we could catch. Check the response first.
async function requireAsset(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`missing asset: ${url}`);
  if ((res.headers.get("content-type") || "").includes("text/html"))
    throw new Error(`missing asset (fell through to the app shell): ${url}`);
}
async function loadHDR(url) {
  await requireAsset(url);
  // HDRLoader, not RGBELoader: three r180 deprecated the latter and warns on
  // every construction. Same parser, same .hdr files.
  const { HDRLoader } = await import("three/addons/loaders/HDRLoader.js");
  return new HDRLoader().loadAsync(url);
}
async function loadBackground(url) {
  await requireAsset(url);
  return new T.TextureLoader().loadAsync(url);
}
// tools/hdri-prep.mjs writes the backdrop as linear radiance divided by a
// headroom factor, because three tone-maps scene.background with the same ACES
// curve as the booth and an already tone-mapped JPEG would go through it
// twice. Multiplying the factor back in through backgroundIntensity undoes the
// division inside the shader, before tone mapping. A hand-dropped Poly Haven
// JPEG has no meta.json, so the factor is 1 and nothing changes.
async function loadMeta(url) {
  await requireAsset(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`missing asset: ${url}`);
  return res.json();
}
const backgroundIntensityOf = (meta) => {
  const value = Number(meta?.backgroundIntensity);
  return Number.isFinite(value) && value > 0 ? value : 1;
};

export class EnvironmentLighting {
  // `loaders` is injected so tests can exercise the swap and disposal rules
  // without a GPU or any asset files on disk.
  constructor(renderer, loaders = {}) {
    this.renderer = renderer;
    this.loadHDR = loaders.loadHDR || loadHDR;
    this.loadBackground = loaders.loadBackground || loadBackground;
    this.loadMeta = loaders.loadMeta || loadMeta;
    this.makePMREM = loaders.makePMREM || ((r) => new T.PMREMGenerator(r));
    this.revision = 0;
    this.applied = null;
    this.backgroundIntensity = 1;
  }
  // Applies exposure and intensity synchronously, then resolves once the HDRI
  // has landed. `background: false` leaves scene.background alone, so a user's
  // own uploaded panorama always outranks the preset's backdrop. `rotation` is
  // the same degrees the panorama uses, so turning the backdrop works whether
  // it came from a preset or an upload.
  async apply(scene, presetId, { background = true, rotation = 0 } = {}) {
    const preset = resolvePreset(presetId);
    this.renderer.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.envIntensity;
    // Re-fetching and re-filtering on every edit would stall a slider drag:
    // the scene calls this on each update, and PMREM is not cheap. Keep what
    // is already loaded and just re-seat it on the scene, since the procedural
    // environment rewrites scene.background underneath us every time.
    if (this.applied && this.applied.id === preset.id && this.applied.background === background) {
      if (this.target) scene.environment = this.target.texture;
      if (this.applied.backdrop) this.seatBackdrop(scene, rotation);
      return { preset, environment: !!this.target, background: this.applied.backdrop, cached: true };
    }
    const rev = ++this.revision;
    const paths = presetPaths(preset);
    if (!paths) {
      this.clear(scene);
      scene.backgroundIntensity = 1;
      this.applied = { id: preset.id, background, backdrop: false };
      return { preset, environment: false, background: false };
    }
    const [light, backdrop, meta] = await Promise.all([
      this.loadHDR(paths.light).catch(() => null),
      background ? this.loadBackground(paths.background).catch(() => null) : null,
      background ? this.loadMeta(paths.meta).catch(() => null) : null,
    ]);
    if (this.revision !== rev) {
      light?.dispose();
      backdrop?.dispose();
      return { preset, environment: false, background: false, stale: true };
    }
    let applied = false;
    if (light) {
      this.pmrem ||= this.makePMREM(this.renderer);
      const target = this.pmrem.fromEquirectangular(light);
      light.dispose();
      this.target?.dispose();
      this.target = target;
      scene.environment = target.texture;
      applied = true;
    } else this.clear(scene);
    if (backdrop) {
      backdrop.mapping = T.EquirectangularReflectionMapping;
      backdrop.colorSpace = T.SRGBColorSpace;
      this.backdrop?.dispose();
      this.backdrop = backdrop;
      this.backgroundIntensity = backgroundIntensityOf(meta);
      this.seatBackdrop(scene, rotation);
    } else scene.backgroundIntensity = 1;
    this.applied = { id: preset.id, background, backdrop: !!backdrop };
    return { preset, environment: applied, background: !!backdrop, intensity: this.backgroundIntensity };
  }
  // Puts the loaded backdrop back on the scene at the requested rotation. The
  // fog belongs to the procedural horizon and would sit in front of a real
  // photograph, so it goes.
  seatBackdrop(scene, rotation = 0) {
    scene.background = this.backdrop;
    scene.backgroundIntensity = this.backgroundIntensity;
    scene.backgroundRotation.set(0, (rotation * Math.PI) / 180, 0);
    scene.fog = null;
  }
  // Drops the environment map without touching the background, so the
  // procedural horizon keeps whatever environment.js gave it.
  clear(scene) {
    scene.environment = null;
    this.target?.dispose();
    this.target = null;
  }
  dispose() {
    this.revision++;
    this.applied = null;
    this.target?.dispose();
    this.target = null;
    this.backdrop?.dispose();
    this.backdrop = null;
    this.pmrem?.dispose();
    this.pmrem = null;
  }
}
