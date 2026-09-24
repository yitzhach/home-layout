import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeTent, environment } from "./environment.js";
import { signTexture } from "./signage.js";
import { edgeMaterial } from "./edge-material.js";
import { SHADOW_GLSL, SHADOW_KINDS, shadowPlan, shadowSpec } from "./dropshadow.js";
import { TextureCache } from "./texture-cache.js";
import { EnvironmentLighting, artEnvIntensity, DEFAULT_FIDELITY, showFixtures } from "./lighting.js";
import { GROUND_CONSUMER, TENT_CONSUMER, TENT_WEAVE, WALL_CONSUMER, WALL_SET, UV_METRE, SurfaceTextures } from "./surfaces.js";
import { applyImageEdits, editedAspect, hasImageEdits } from "./image-edit.js";
import { decodeAt, isPreflipped } from "./image-source.js";
import { IN, PEDESTAL, FURNITURE, furnitureKind, boothPedestals, isShown, edgeColorOf, lightVisible, constrain, groundKind, groundUpload, constrainPanel, constrainPedestal, findPanel, findPedestal, isArtShow, lightBarSpec, isPanelKey, scalePanel, wallKeys, wallSpec } from "./model.js";
import { lightBarBounce, lightBarFixtures, lightBarOptics, lightBarRail } from "./lightbar.js";
import { PEOPLE, makePerson, placePerson, resolvePerson } from "./people.js";
import { rowLayout } from "./row.js";
import { smartSnap } from "./guides.js";
import { tagShown, walkStart, walkStep } from "./views.js";
import { sameWall } from "./arrange.js";
/**
 * The longest edge a preview texture is decoded to. An original stays whole
 * in the project and in a backup; this is what the wall is shown at, and it
 * is already more than a 2048-wide export can use on a panel that fills a
 * third of the frame.
 */
export const ART_TEXTURE_MAX = 2048;
import { frameTimes, resolveMove, samplePath } from "./camera-path.js";
import { fadeAt, isTimeline, timelineSeconds } from "./timeline.js";
import { flareGhosts, flareOrigin } from "./flare.js";
import { DEFAULT_SIZE, SIZES, evenSize, recordMp4, videoSupported } from "./video.js";
import { DEFAULT_FRAME, frameSize } from "./framing.js";
import { AUTO_QUALITY, FrameBudget, startScale, stepDown } from "./adaptive.js";
import { distanceInches, formatLength, planDimensions } from "./measure.js";
import { buildFurniture } from "./furniture.js";
// How far behind its frame plane a wall's slab sits, in metres. Half the
// slab's thickness plus the sliver that keeps art from z-fighting the face.
const WALL_SLAB_OFFSET = 0.031;
/**
 * Which wall frame a piece of artwork hangs on. A work in the home booth
 * names no booth and keys by its wall alone, which is exactly what every
 * frame was keyed by before rows existed; a work in a row booth is prefixed
 * with that booth's slot id, because the same three walls stand once per
 * booth in the aisle.
 */
export const frameKey = (a) =>
  (a.booth ? a.booth + ":" : "") + a.wall + (a.face === "outside" ? "-outside" : "");
// The orbit camera may drop below the booth's centre of interest to give a
// low, looking-up perspective. It is stopped by the ground, not by a fixed
// angle: MIN_CAMERA_Y keeps the eye just above the floor plane, and
// MAX_POLAR avoids the up-vector flip OrbitControls suffers near 180 degrees.
// One soft disc, drawn once into a canvas and shared by every ghost. A flare is
// the only thing in this app that wants a texture nothing else can supply, and
// a 128px gradient is cheaper to make here than to ship as a file.
let RADIAL;
function radialTexture() {
  if (RADIAL) return RADIAL;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  RADIAL = new T.CanvasTexture(canvas);
  RADIAL.colorSpace = T.SRGBColorSpace;
  return RADIAL;
}

const MIN_CAMERA_Y = 0.12;
const MAX_POLAR = Math.PI * 0.82;
// An equirectangular backdrop is sampled by view direction, so the field of
// view is the only thing that decides how much of it you see — moving the
// camera cannot pull it back. 62 degrees against the old 44 shows about half
// as much again, and frames more of the booth with it.
export const FOV = 62;
// The backdrop is drawn in a pass of its own, with a field of view wider than
// the camera's. Two problems share that one cause. A spherical photograph sits
// at infinity, so field of view alone frames it — which is why a 62 degree
// view of a 1024px equirectangular image shows only 62/360 of it, about 176
// pixels, stretched across the whole canvas. Everything in it therefore looks
// both magnified and soft, and no camera move can pull it back. Widening the
// view of the backdrop alone pulls the environment back and cuts the
// magnification with it, without putting a wide-angle lens on the booth, which
// is the thing actually being measured. `framing` is a percentage: 100 matches
// the camera exactly, and smaller is wider.
//
// This buys back magnification; it cannot add detail the file never had. The
// backdrops are prepped from Poly Haven's 1K HDRIs, so bg.jpg is 1024x512.
// Re-prepping from the 4K download is the rest of the fix — see
// docs/HDRI-ASSETS.md.
export const BACKDROP_FRAMING = 65;
// How far the zoom can be pulled back. Tried at 15 and rejected by eye: a lens
// that wide shears an equirectangular lookup badly enough that the hall ceiling
// smears into streaks. 25 is the widest that still reads as a room.
export const BACKDROP_FRAMING_MIN = 25;
// ...but 25 was judged on a level camera, and that is only half the rule.
//
// What shears an equirectangular lookup is not the lens on its own: it is how
// far from the horizon the frame's edge reaches. The edge sits at
// |pitch| + fov/2, so a 135 degree backdrop lens is fine looking straight out
// and catastrophic tilted 12 degrees down — the frame edge passes 79 degrees,
// into the pole, where a whole row of pixels is one point and the ceiling
// smears into radial streaks. That is the "weird artifact" the wide zoom
// produced in practice, and no framing percentage alone can prevent it.
//
// So the limit is stated where it actually lives, as an angle from the
// horizon, and the backdrop lens is narrowed per frame to respect it. Tilt
// far enough and the backdrop simply stops widening — it falls back towards
// the camera's own lens, which is the one-pass behaviour that never shears.
export const BACKDROP_EDGE_LIMIT = 52;
export function safeBackdropFov(cameraFov, wideFov, pitch, limit = BACKDROP_EDGE_LIMIT) {
  const pitchDegrees = Math.abs(((Number(pitch) || 0) * 180) / Math.PI);
  const allowed = 2 * Math.max(0, (Number(limit) || BACKDROP_EDGE_LIMIT) - pitchDegrees);
  // Never narrower than the camera's own lens: the backdrop pass exists to
  // widen, and matching the camera is the same picture the single pass draws.
  return Math.max(cameraFov, Math.min(wideFov, allowed));
}
// Drawing the backdrop through a wider lens has a side effect that reads as a
// second bug: the horizon slides.
//
// A direction at angle θ from the lens axis lands at tan(θ)/tan(fov/2) of the
// way to the frame edge. The booth is drawn at the camera's own field of view
// and the backdrop at a wider one, so the same pitch moves the booth further up
// the screen than it moves the backdrop — tilt the camera down and the
// photographed horizon appears to climb out of the floor, which is the one
// thing in the frame that should be nailed to it.
//
// The fix is to over-rotate the backdrop camera by exactly the ratio of those
// two tangents, so a world direction lands in the same place in both passes.
// It is exact at the centre of frame and very close across it; nothing can be
// exact everywhere, because two lenses are two projections.
//
// Only pitch. Yaw could be scaled by the same argument, but a 360 degree orbit
// would then spin the backdrop nearly twice — the horizon is what drifts and
// the horizon is what this locks.
//
// The correction is bounded by the same edge limit, and for the same reason:
// over-rotating a wide lens is the fastest way into the pole. Where the bound
// bites, the horizon drifts a little rather than shearing a lot — a compromise
// that only appears at tilts where there was no un-sheared answer anyway.
export const lockedPitch = (pitch, fov, wideFov, limit = BACKDROP_EDGE_LIMIT) => {
  const narrow = Math.tan((Math.min(179, Math.max(1, fov)) * Math.PI) / 360);
  const wide = Math.tan((Math.min(179, Math.max(1, wideFov)) * Math.PI) / 360);
  if (!(narrow > 0) || !(wide > 0)) return pitch;
  // No widening, nothing to correct: the backdrop is the camera's own lens and
  // the single pass already agrees with itself.
  if (wide <= narrow) return pitch;
  // Clamped to a quarter turn: past that the scaling is asking a lens to show
  // something behind it, and atan would fold the image over.
  const clamped = Math.min(Math.PI / 2.2, Math.max(-Math.PI / 2.2, pitch));
  const corrected = Math.atan(Math.tan(clamped) * (wide / narrow));
  const ceiling = Math.max(0, (((Number(limit) || BACKDROP_EDGE_LIMIT) * Math.PI) / 180) - (wideFov * Math.PI) / 360);
  return Math.min(ceiling, Math.max(-ceiling, corrected));
};
export const backdropFov = (fov, framing = BACKDROP_FRAMING) => {
  const clamped = Math.min(100, Math.max(BACKDROP_FRAMING_MIN, Number(framing) || BACKDROP_FRAMING));
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) / (clamped / 100));
  return Math.min(160, (half * 360) / Math.PI);
};
// Only a spherical photograph is framed by field of view. A flat colour or the
// procedural sky gradient has nothing to reframe, so it stays in the one pass.
export const isPanorama = (background) =>
  !!background &&
  background.isTexture === true &&
  (background.mapping === T.EquirectangularReflectionMapping ||
    background.mapping === T.EquirectangularRefractionMapping);
// Quality is a supersampling factor, not a ceiling: on a 1x monitor asking for
// min(devicePixelRatio, 2) renders at 1 and aliases. Capped at 3 because the
// cost is per pixel and a phone does not need 9x the fragments.
// "auto" asks for the same factor Balanced does; the scene then measures its
// way down from there (see src/adaptive.js).
export const renderScale = (quality = 2) =>
  Math.min(Math.max(devicePixelRatio || 1, quality === AUTO_QUALITY ? 2 : quality), 3);
// How long the viewport keeps a once-a-second heartbeat after the last thing
// that asked it to draw. See `startLoop`.
const HEARTBEAT_MS = 1000;
const HEARTBEAT_FOR_MS = 15000;
// How long an asked-for frame may wait on the browser before a timer draws it.
const KICK_MS = 50;
// The longest a rebuilt booth's old group waits on a load before it is
// released anyway. See `disposeGroup`.
const RETIRE_MAX_MS = 10000;
// And the most retired groups held at once.
const RETIRE_KEEP = 3;
export function temperature(k) {
  const t = (k - 2700) / 3800;
  return new T.Color().setRGB(
    1,
    0.7 + 0.28 * t,
    0.43 + 0.57 * t,
    T.SRGBColorSpace,
  );
}
/**
 * Stand a free-standing wall's frame where its measurements say. A perimeter
 * wall's frame plane sits on the footprint line, so its slab hangs just
 * outside it. A panel has no line to sit on and is used from both sides, so
 * its typed X/Z is the centre of the slab: the frame is pushed forward by the
 * same offset the slab is pushed back, and the corner is that centre stepped
 * back half a width along the frame's own +x.
 *
 * Both the build and a drag go through here, so a dragged panel lands exactly
 * where typing the same numbers would have put it.
 */
// The plan-view plane every free-standing wall drag is measured in.
const FLOOR = new T.Plane(new T.Vector3(0, 1, 0), 0);
function placePanelFrame(g, panel) {
  const r = ((panel.rotation || 0) * Math.PI) / 180,
    half = (panel.width * IN) / 2;
  g.position.set(
    panel.x * IN - Math.cos(r) * half + Math.sin(r) * WALL_SLAB_OFFSET,
    0,
    panel.z * IN + Math.sin(r) * half + Math.cos(r) * WALL_SLAB_OFFSET,
  );
  g.rotation.y = r;
  return g;
}
/**
 * Stand a pedestal where its measurements say. Unlike a wall, a pedestal's
 * X/Z is its own centre in plan and there is no frame-plane offset to undo,
 * so this is the whole of it — but it is still one function the build and a
 * drag both go through, for the same reason `placePanelFrame` is.
 */
/**
 * A .glb held as a data URL, parsed into a three object. GLTFLoader is loaded
 * on first use, so a booth with no models never downloads it.
 */
async function parseModel(dataUrl) {
  const [{ GLTFLoader }, buffer] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    fetch(dataUrl).then((r) => r.arrayBuffer()),
  ]);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  return gltf.scene;
}
function placePedestal(g, ped) {
  g.position.set(ped.x * IN, 0, ped.z * IN);
  g.rotation.y = ((ped.rotation || 0) * Math.PI) / 180;
  return g;
}
/**
 * A drawn drop shadow's material: black, with its alpha computed per
 * fragment from the plane's own position (src/dropshadow.js, SHADOW_GLSL).
 * MeshBasicMaterial rather than a ShaderMaterial so opacity, fog, tone
 * mapping and the colour space all work as they do for every other
 * material; the hook only multiplies the alpha. Each material carries its
 * own uniforms, and the fixed cache key makes every shadow share one program,
 * which is what lets a rebuild keep it (see `disposeGroup`).
 */
function shadowMaterial() {
  const material = new T.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    // On the wall, not in it: writing depth would make the plane fight the
    // artwork in front of it at grazing angles.
    depthWrite: false,
  });
  material.userData.shadow = {
    shadowExtent: { value: new T.Vector2() },
    shadowPlane: { value: new T.Vector2() },
    shadowSigma: { value: 0.01 },
  };
  material.onBeforeCompile = shadowShader;
  material.customProgramCacheKey = shadowProgramKey;
  return material;
}
function shadowShader(shader) {
  Object.assign(shader.uniforms, this.userData.shadow);
  shader.vertexShader =
    "uniform vec2 shadowPlane;\nvarying vec2 vShadowPos;\n" +
    shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n\tvShadowPos = position.xy * shadowPlane;",
    );
  shader.fragmentShader =
    SHADOW_GLSL +
    shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\n\tdiffuseColor.a *= shadowBox(vShadowPos, shadowExtent, shadowSigma);",
    );
}
function shadowProgramKey() {
  return "booth-drop-shadow-1";
}
/**
 * Stand one shadow plane where its plan says, relative to the centre of the
 * work at its wall gap: back to the wall face and a hair in front of it. The
 * shadow under sits a hair nearer than the one behind, so the two never
 * trade places at a grazing angle.
 */
function placeShadow(mesh, spec, a) {
  const plan = shadowPlan(spec, a);
  const u = mesh.material.userData.shadow;
  u.shadowExtent.value.set(plan.halfW * IN, plan.halfH * IN);
  u.shadowPlane.value.set(plan.width * IN, plan.height * IN);
  u.shadowSigma.value = plan.sigma * IN;
  mesh.scale.set(plan.width * IN, plan.height * IN, 1);
  mesh.material.opacity = plan.opacity;
  mesh.visible = plan.on;
  mesh.position.set(
    plan.dx * IN,
    plan.dy * IN,
    -((a.offset + a.thickness / 2) * IN + 0.003) + (mesh.userData.shadowKind === "under" ? 0.002 : 0.0015),
  );
}
/** Release everything a retired booth group holds on the GPU. */
function disposeTree(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        { if (m.userData.ownedMap) m.map?.dispose(); m.dispose(); },
      );
    }
    if (o.isLight) o.shadow?.dispose();
  });
}
export class BoothScene {
  constructor(
    host,
    onSelect,
    onMove,
    onStart,
    onEnd = () => {},
    // A free-standing wall is selected and dragged the way artwork is, but it
    // is not artwork: it lives in booth.panels, its inspector is Layout, and
    // moving it changes X/Z rather than a placement. Two callbacks of its own
    // keep that separation, and default to nothing so every older caller —
    // the tests among them — still constructs a scene.
    onSelectPanel = () => {},
    onMovePanel = () => {},
    // A pedestal is placed and dragged exactly the way a free-standing wall
    // is, but it is not a wall: nothing hangs on it, it has no face, and its
    // controls are their own. Two more callbacks rather than overloading the
    // panel pair with a kind argument every existing caller would have to
    // start passing.
    onSelectPedestal = () => {},
    onMovePedestal = () => {},
  ) {
    this.host = host;
    this.onSelect = onSelect;
    this.onMove = onMove;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onSelectPanel = onSelectPanel;
    this.onMovePanel = onMovePanel;
    this.onSelectPedestal = onSelectPedestal;
    this.onMovePedestal = onMovePedestal;
    this.selectedPanel = null;
    this.selectedPedestal = null;
    this.pedestalObjects = [];
    this.pedestalFrames = {};
    this.personFrames = {};
    // Tags hidden right now (see src/views.js). A view setting: main.js owns
    // the set and hands it over; `applyTags` does the hiding.
    this.hiddenTags = new Set();
    // Each figure kind's cut-out picture, loaded once and shared by every
    // figure of that kind across rebuilds. `texture` stays null while loading
    // and for good when the file is missing, which leaves the mannequin.
    this.cutouts = {};
    this.view = "perspective";
    this.move = false;
    // On by default, matching the toolbar button's own initial state: this is a
    // measured planning tool, and a drag that lands at 23.59 inches is not a
    // measurement. The button turns it off for fine placement.
    this.snap = true;
    this.textureCache = new TextureCache();
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#b5b4b0");
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    // Render above the display's own density and let the browser downsample.
    // antialias:true asks for MSAA, but on a 1x desktop monitor — which is most
    // of them — a white tent roof against a dark backdrop still stair-steps:
    // sample counts are the driver's choice and ANGLE often gives few.
    // Supersampling does not ask permission.
    // The Export panel's Preview quality, kept here rather than only in the
    // inspector because draft mode has to be able to put it back.
    this.quality = 2;
    // Auto quality's current rung and the frame budget that moves it. Set by
    // `setQuality(AUTO_QUALITY)`; unused at a fixed quality.
    this.autoScale = startScale(devicePixelRatio);
    this.budget = new FrameBudget();
    this.onAdapt = () => {};
    // Light-bar heads draw their shadows in exports always, and in the live
    // viewport only at High detail. See `setBarShadows`.
    this.barShadows = false;
    // Fast edit follows the gesture unless someone has locked it; see
    // setDraftPolicy.
    this.draftPolicy = "auto";
    // Draft mode is off on load: the booth should look like itself the first
    // time it is seen, and someone who never drags anything never needs this.
    this.draft = false;
    this.renderer.setPixelRatio(this.previewScale());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.lighting = new EnvironmentLighting(this.renderer);
    this.surfaces = new SurfaceTextures(this.renderer);
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive measured 3D booth",
    );
    this.camera = new T.PerspectiveCamera(FOV, 1, 0.02, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = MAX_POLAR;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 18;
    this.ray = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.group = new T.Group();
    this.scene.add(this.group);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.bind();
    // The backdrop's own pass needs somewhere to live. An empty scene carrying
    // nothing but the background reuses three's own background shader, so the
    // tone mapping and colour space stay identical to a one-pass render —
    // which a hand-written fullscreen shader would have to reproduce.
    this.backdropScene = new T.Scene();
    this.backdropCamera = new T.PerspectiveCamera(FOV, 1, 0.1, 10);
    this.backdropFraming = BACKDROP_FRAMING;
    this.backdropLock = true;
    this.backdropEdgeLimit = BACKDROP_EDGE_LIMIT;
    // What the overlay pass draws over a finished frame: a fade to black and an
    // optional lens flare. Both belong to a clip, not to the booth, so the
    // default is "nothing at all" and every recording restores it.
    this.overlay = { fade: 1, flare: null };
    // Dimension labels and the tape measure's reading: DOM over the canvas,
    // so they stay crisp at any quality and never reach an exported file.
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "scene-labels";
    host.append(this.labelLayer);
    this.annotations = [];
    this.measure = { on: false, points: [] };
    this.onMeasure = () => {};
    this.watchForChanges();
    this.startLoop();
  }
  // The live loop, in one place: the video recorder stops it so that nothing
  // renders between the frames it is encoding, and starts it again afterwards.
  /**
   * Draft mode: the viewport's quality escape hatch, and the honest answer to
   * "dragging still stutters on my machine".
   *
   * Two things cost a nine-head art-show booth most of its frame, and neither
   * of them is the geometry:
   *
   * - **Every shadow-casting light is a depth pass.** A drag refreshes the
   *   shadow maps once a drawn frame (`touchShadows`), so the cast shadow
   *   follows the work — and every one of those frames pays for them all.
   * - **Quality is a supersampling factor.** At Balanced the renderer draws
   *   four fragments for every pixel on the 1x monitor most desktops have.
   *
   * Draft mode drops both. It is a view setting and not a project one: it is
   * not in the backup, not in the undo history and not in schema 1, because
   * how fast someone's laptop is has nothing to do with what their booth
   * looks like. For the same reason it cannot reach an export — see
   * `export()` and `recordMp4()`, which both put full quality back first.
   *
   * What it deliberately does not touch: the backdrop's own pass. Skipping it
   * would change how the hall is framed, and a picture that reframes itself
   * when you pick up a tool is worse than one that renders a little slower.
   */
  setDraft(on) {
    const draft = !!on;
    if (draft === this.draft) return;
    this.draft = draft;
    this.renderer.shadowMap.enabled = !draft;
    this.renderer.setPixelRatio(draft ? 1 : this.previewScale());
    // Whether a material samples a shadow map is compiled into its program,
    // so flipping `shadowMap.enabled` under a built scene is not enough on its
    // own: without this the booth keeps drawing the shadows it was compiled
    // with, and turning them back on leaves them missing. One recompile on a
    // button press is a hitch nobody minds; per frame it would be the bug.
    this.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((one) => (one.needsUpdate = true));
      else m.needsUpdate = true;
    });
    if (!draft) this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  /**
   * Who decides when fast edit is on. **auto** is the default and is the
   * gesture answering for itself: arming a work's handles turns it on,
   * letting go of that work turns it off, so the quality drop lasts exactly
   * as long as the arranging does. **on** and **off** are the lock beside the
   * toolbar button — someone who has judged it for their own machine should
   * not have it changed back under them, in either direction.
   *
   * The policy is a view setting like the mode it governs: not in the backup,
   * not in the undo history, not in schema 1.
   */
  setDraftPolicy(policy) {
    this.draftPolicy = ["auto", "on", "off"].includes(policy) ? policy : "auto";
    if (this.draftPolicy === "on") this.setDraft(true);
    if (this.draftPolicy === "off") this.setDraft(false);
    return this.draftPolicy;
  }
  /**
   * The armed work is no longer being arranged. Under the auto policy that is
   * the end of fast edit; under a lock it changes nothing but the handles.
   */
  letGoOfArt() {
    this.scaleId = null;
    this.releaseDraft();
  }
  /** A gesture is starting on a piece of artwork. */
  armDraft() {
    if ((this.draftPolicy || "auto") === "auto") this.setDraft(true);
  }
  /** That artwork has been let go of. */
  releaseDraft() {
    if ((this.draftPolicy || "auto") === "auto") this.setDraft(false);
  }
  /**
   * Preview quality, remembered so draft mode can restore the right one.
   * `AUTO_QUALITY` hands the factor to the frame budget, starting from
   * `autoScale` — which the caller may seed from what an earlier session on
   * this display measured. High detail is also the one setting that draws the
   * light bar's shadows live; see `setBarShadows`.
   */
  setQuality(quality, autoScale) {
    this.quality = quality;
    if (autoScale) this.autoScale = autoScale;
    this.budget.reset();
    if (!this.draft) this.renderer.setPixelRatio(this.previewScale());
    this.setBarShadows(quality === 3);
    this.invalidate();
  }
  /** The supersampling factor the live viewport draws at, outside fast edit. */
  previewScale() {
    return this.quality === AUTO_QUALITY ? this.autoScale : renderScale(this.quality);
  }
  /**
   * Whether the light bar's heads cast shadows. Nine shadow-casting spots are
   * nine shadow maps sampled by every lit fragment of every frame — with the
   * supersampling, the largest single cost of an art-show booth. At the
   * default diffusion each of those shadows is drawn at about a quarter
   * strength, filling in rather than cutting, and the fill light still grounds
   * every pedestal. So the live viewport leaves them off below High detail,
   * and `export()` and `recordVideo()` turn them on for the delivered file,
   * the way they already put fast edit's shadows back. three recompiles the
   * materials by itself: the number of shadowed spots is part of its lights
   * state.
   */
  setBarShadows(on) {
    this.barShadows = !!on;
    let changed = false;
    this.group.getObjectByName("light-bar")?.traverse((o) => {
      if (o.isSpotLight && o.castShadow !== this.barShadows) {
        o.castShadow = this.barShadows;
        changed = true;
      }
    });
    if (changed) this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }
  /**
   * Something that casts a shadow has moved: redraw the shadow maps with the
   * next frame.
   *
   * This used to hold the maps still for the length of a drag and refresh
   * them once on release, from when every pointer event re-rendered nine
   * shadow-casting heads. With fast edit off, that left a dragged work's cast
   * shadow on the wall where the work had been until the button came up —
   * reported as "the shadow stays in the original space". Neither reason
   * survives: a drag is applied once per drawn frame (`flushDrag`), so this
   * is at most one refresh a frame, and the light bar's heads cast only at
   * High detail. Fast edit is the answer for a machine that cannot keep up,
   * and it has no shadow maps to refresh at all.
   *
   * During a drag the maps refresh every other drawn frame. On the real
   * machine a refresh on every frame read as "slight stutter, but decent";
   * halving it keeps the shadow following the work (a frame behind at most)
   * rather than holding it until release, which is the bug that was
   * reported. A skipped refresh is owed: the next frame without a move pays
   * it, and so does letting go, so a drag always ends on true shadows.
   */
  touchShadows() {
    if (this.drag) {
      this.dragShadowSkip = !this.dragShadowSkip;
      if (this.dragShadowSkip) {
        this.shadowsOwed = true;
        return;
      }
    }
    this.shadowsOwed = false;
    this.renderer.shadowMap.needsUpdate = true;
  }
  /** Apply the most recent pointer move, if one arrived since the last frame. */
  flushDrag() {
    const e = this.pendingMove;
    if (!e) return;
    this.pendingMove = null;
    this.applyDrag?.(e);
  }
  /**
   * Ask for the viewport to be drawn. The live loop draws on demand: a booth
   * nobody is touching is the same picture sixty times a second, and drawing
   * it anyway kept a slow machine's GPU pinned — and its inspector sluggish —
   * while nothing moved. `frames` is how many consecutive frames to draw; two
   * covers a change whose effect lands one frame late (a shadow map, a
   * texture upload).
   */
  invalidate(frames = 2) {
    this.framesOwed = Math.max(this.framesOwed || 0, frames);
    this.touchedAt = performance.now();
    // A browser only promises animation frames while it has a reason to make
    // them; with the loop idle, headless Chromium was measured handing out
    // three a second, so a change could wait most of a second to appear. A
    // timer draws the frame if the loop has not within KICK_MS; when frames
    // are flowing the loop gets there first and the timer finds nothing owed.
    if (!this.kick && this.looping)
      this.kick = setTimeout(() => {
        this.kick = null;
        if (this.looping && this.framesOwed > 0) this.tick(performance.now());
      }, KICK_MS);
  }
  /**
   * Everything that can change the picture, wired to `invalidate`. Nothing
   * about how the booth is built had to change for on-demand drawing; what
   * has to be right is this list, so it is deliberately broad:
   *
   * - Any input anywhere on the page. Every inspector control, toolbar
   *   button, key and gesture ends in a scene call synchronously from its
   *   event, so a document-level listener catches all of them, including the
   *   ones main.js makes by assigning to a field.
   * - Every public method that changes what is drawn, wrapped once here
   *   rather than remembered in each of them.
   * - Every asynchronous load that lands in the scene: artwork textures,
   *   surface sets and the lighting preset, on settling either way.
   * - The camera controls' own change event, and a shadow map flagged stale.
   *
   * And a safety net: for fifteen seconds after the last of those, the
   * viewport still draws once a second, so a change nothing above announced
   * shows up late rather than never. After that an idle booth costs nothing.
   */
  watchForChanges() {
    const touch = () => this.invalidate();
    for (const type of ["pointerdown", "pointerup", "click", "dblclick", "input", "change", "keydown", "keyup", "wheel"])
      document.addEventListener(type, touch, { capture: true, passive: true });
    this.controls.addEventListener("change", touch);
    for (const name of ["update", "updateArtwork", "updateShadows", "setSelection", "applySelection", "setView", "zoom", "resize",
      "movePerson", "movePedestal", "movePanel", "focusWall", "applyPose", "setDraft", "letGoOfArt", "touchShadows"]) {
      const method = this[name];
      this[name] = (...args) => {
        const result = method.apply(this, args);
        this.invalidate();
        return result;
      };
    }
    // Loads in flight, which `releaseRetired` also waits on. Settling runs
    // before the caller's own `.then` — registered first — and both before the
    // next frame, so the frame that sees zero already has what landed.
    this.loading = 0;
    const done = () => {
      this.loading--;
      touch();
    };
    const settle = (owner, name) => {
      const load = owner[name];
      owner[name] = (...args) => {
        const result = load.apply(owner, args);
        this.loading++;
        Promise.resolve(result).then(done, done);
        return result;
      };
    };
    settle(this, "texture");
    settle(this, "loadCutout");
    settle(this, "loadingModel");
    settle(this.surfaces, "load");
    settle(this.lighting, "apply");
  }
  startLoop() {
    this.looping = true;
    this.invalidate();
    this.lastTick = 0;
    this.renderer.setAnimationLoop((now) => this.tick(now));
  }
  /** Stop the live loop, for a recording or a preview that draws its own frames. */
  stopLoop() {
    this.looping = false;
    this.renderer.setAnimationLoop(null);
  }
  /** One turn of the live loop: draw if anything asked for it. */
  tick(now) {
    const moved = !!this.pendingMove;
    this.flushDrag();
    if (this.shadowsOwed && (!moved || !this.drag)) {
      this.dragShadowSkip = true;
      this.touchShadows();
    }
    if (this.host.hidden) return;
    this.clampToGround();
    const moving = this.controls.update();
    const due =
      this.framesOwed > 0 ||
      moving ||
      this.renderer.shadowMap.needsUpdate ||
      (now - this.touchedAt < HEARTBEAT_FOR_MS && now - (this.drawnAt || 0) >= HEARTBEAT_MS);
    if (!due) {
      this.lastTick = 0;
      return;
    }
    if (this.framesOwed > 0) this.framesOwed--;
    this.renderFrame();
    // three clears this flag only when it actually redraws a shadow map. With
    // the maps switched off (fast edit) or no light casting, it stays up, and
    // `due` above read it as a frame owed on every tick — so one moved piece
    // in fast edit kept the viewport drawing flat out until fast edit ended,
    // in exactly the mode meant for a machine that cannot afford it. Nothing
    // is lost by dropping it: leaving fast edit and a new caster (a rebuild,
    // `setBarShadows`) each raise it again.
    this.renderer.shadowMap.needsUpdate = false;
    this.drawnAt = now;
    // Only back-to-back frames measure the machine: the gap after an idle
    // stretch is how long nobody touched it, not how long a frame took.
    if (this.lastTick) this.adapt(now - this.lastTick);
    this.lastTick = now;
  }
  /** One measured frame interval, for auto quality. */
  adapt(ms) {
    if (this.quality !== AUTO_QUALITY || this.draft) return;
    if (!this.budget.sample(ms)) return;
    const next = stepDown(this.autoScale);
    if (next === this.autoScale) return;
    this.autoScale = next;
    this.renderer.setPixelRatio(next);
    this.resize();
    this.onAdapt(next);
  }
  // One frame. A spherical backdrop is drawn first, through a wider lens of its
  // own, then the booth over the top of it; see BACKDROP_FRAMING. Anything else
  // — a flat colour, the procedural sky, the orthographic plan view — has
  // nothing to reframe and takes the single pass it always did.
  renderFrame() {
    const background = this.scene.background;
    if (
      !this.camera.isPerspectiveCamera ||
      !isPanorama(background) ||
      backdropFov(this.camera.fov, this.backdropFraming) <= this.camera.fov
    ) {
      this.renderer.render(this.scene, this.camera);
      this.renderOverlay();
      this.groupDrawn = true;
      this.releaseRetired(false);
      this.placeAnnotations();
      return;
    }
    this.backdropScene.background = background;
    this.backdropScene.backgroundIntensity = this.scene.backgroundIntensity;
    this.backdropScene.backgroundRotation.copy(this.scene.backgroundRotation);
    this.backdropScene.backgroundRotation.order = this.scene.backgroundRotation.order;
    this.backdropCamera.aspect = this.camera.aspect;
    this.camera.updateMatrixWorld();
    // The lens is chosen with the camera's tilt in hand, not from the framing
    // alone: see BACKDROP_EDGE_LIMIT. A wide lens plus a tilt is what reaches
    // the pole, so the two are bounded together or not at all.
    const tilt = new T.Euler().setFromQuaternion(this.camera.quaternion, "YXZ").x;
    const asked = backdropFov(this.camera.fov, this.backdropFraming);
    // The lens and the lock settle together. The lock rotates the backdrop
    // further than the camera, which pushes the frame edge closer to the pole,
    // so a lens chosen from the camera's own tilt would leave no room for it
    // and the limit would silently switch the lock off at exactly the wide
    // framings that need it. Two passes converge: each narrower lens asks for
    // less correction, and less correction needs less room.
    let lens = safeBackdropFov(this.camera.fov, asked, tilt, this.backdropEdgeLimit);
    if (this.backdropLock)
      for (let i = 0; i < 2; i++)
        lens = safeBackdropFov(
          this.camera.fov,
          asked,
          lockedPitch(tilt, this.camera.fov, lens, this.backdropEdgeLimit),
          this.backdropEdgeLimit,
        );
    this.backdropCamera.fov = lens;
    this.backdropCamera.updateProjectionMatrix();
    this.backdropCamera.quaternion.copy(this.camera.quaternion);
    // Horizon lock: see lockedPitch. YXZ, so pitch can be scaled on its own
    // without the yaw rolling the image — the same reason backgroundRotation is
    // a YXZ Euler.
    if (this.backdropLock) {
      const euler = new T.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
      euler.x = lockedPitch(tilt, this.camera.fov, this.backdropCamera.fov, this.backdropEdgeLimit);
      this.backdropCamera.quaternion.setFromEuler(euler);
    }
    // The booth has to draw over the backdrop rather than clear it away, so
    // autoClear goes off for the second pass. three draws a background with
    // depth writes disabled, so the depth buffer is already clean; clearing it
    // anyway keeps this honest if that ever changes.
    const autoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = true;
      this.renderer.render(this.backdropScene, this.backdropCamera);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.scene.background = null;
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.scene.background = background;
      this.backdropScene.background = null;
      this.renderer.autoClear = autoClear;
    }
    this.renderOverlay();
    this.groupDrawn = true;
    this.releaseRetired(false);
    this.placeAnnotations();
  }

  // The fade and the flare, drawn over a finished frame.
  //
  // After tone mapping, on purpose. A fade implemented by scaling exposure
  // never reaches black — ACES rolls off rather than cutting — so a clip that
  // "ends on black" would end on a dark grey wash that reads as an encoding
  // fault. Drawing actual black over the rendered pixels is the fade a cut is.
  //
  // Nothing is built until something asks for it, so a booth that never records
  // a clip never pays for the geometry or the two textures.
  renderOverlay() {
    const fade = this.overlay?.fade ?? 1;
    const flare = this.overlay?.flare;
    if (fade >= 1 && !flare) return;
    const parts = this.overlayParts();
    parts.fade.material.opacity = Math.min(1, Math.max(0, 1 - fade));
    parts.fade.visible = parts.fade.material.opacity > 0.001;
    const ghosts = flare ? flareGhosts(flare.ndc, { strength: flare.strength, aspect: this.camera.aspect || 1.6 }) : [];
    parts.ghosts.forEach((sprite, i) => {
      const g = ghosts[i];
      sprite.visible = !!g;
      if (!g) return;
      sprite.position.set(g.x, g.y, 0);
      sprite.scale.set(Math.max(0.001, g.width), Math.max(0.001, g.height), 1);
      sprite.material.opacity = g.alpha;
      // Warm at the source, cool down the chain: uncoated glass scatters the
      // long wavelengths first, which is why a real flare is not one colour.
      sprite.material.color.setRGB(1, 0.72 + 0.28 * g.warm, 0.45 + 0.5 * g.warm);
    });
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    try {
      this.renderer.render(parts.scene, parts.camera);
    } finally {
      this.renderer.autoClear = autoClear;
    }
  }
  overlayParts() {
    if (this.overlayCache) return this.overlayCache;
    const scene = new T.Scene();
    // -1..1 in both axes, which is the space src/flare.js computes in.
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 0.5;
    const fade = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    fade.renderOrder = 1;
    scene.add(fade);
    const texture = radialTexture();
    const ghosts = Array.from({ length: 8 }, () => {
      const sprite = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
          map: texture,
          transparent: true,
          // Additive, because a flare is light arriving at the sensor on top of
          // the image, not paint over it.
          blending: T.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          opacity: 0,
        }),
      );
      sprite.visible = false;
      // Under the fade: a flare in a frame that is fading to black fades too.
      sprite.renderOrder = 0;
      scene.add(sprite);
      return sprite;
    });
    this.overlayCache = { scene, camera, fade, ghosts };
    return this.overlayCache;
  }
  // Where the flare comes from this frame, projected into the same -1..1 space
  // the ghosts are placed in. Either the brightest spotlight — which may not
  // exist, and then there is no flare — or the unseen overhead source, which
  // always does: see OVERHEAD in src/flare.js.
  flareState(strength, source) {
    // Hidden spotlights are not in the picture, so a flare cannot come from
    // one: the ghosts would trail from a light nothing is lit by.
    const origin = flareOrigin(source, (this.p?.lights || []).filter(lightVisible));
    if (!origin) return null;
    const ndc = new T.Vector3(origin.x * IN, origin.y * IN, origin.z * IN).project(this.camera);
    return { ndc: { x: ndc.x, y: ndc.y, z: ndc.z }, strength };
  }
  // Allow the lowest polar angle that still keeps the camera above the floor
  // at its current distance, so orbiting down slides along the ground instead
  // of stopping at eye level or punching through the ground plane.
  clampToGround() {
    // Walking, the camera is at eye height by construction and the head is
    // free to look up at a high work.
    if (this.walking) return;
    if (!this.camera.isPerspectiveCamera || !this.controls.enableRotate) return;
    const radius = this.camera.position.distanceTo(this.controls.target);
    if (!(radius > 0)) return;
    const cos = (MIN_CAMERA_Y - this.controls.target.y) / radius;
    const limit = Math.acos(Math.max(-1, Math.min(1, cos)));
    this.controls.maxPolarAngle = Math.min(MAX_POLAR, limit);
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    // setSize writes the canvas's width and height, and a browser reallocates
    // the drawing buffer on that write even when the numbers have not
    // changed. main.js calls this after every edit, so an unchanged size is
    // left alone; an export, which sizes the canvas behind the renderer's
    // back, still reads as a change.
    const canvas = this.renderer.domElement,
      ratio = this.renderer.getPixelRatio(),
      size = this.renderer.getSize(new T.Vector2());
    if (size.x !== w || size.y !== h || canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio))
      this.renderer.setSize(w, h);
    if (this.camera.isPerspectiveCamera) {
      const factor = Math.max(1, h / w);
      if (this.fitAspectFactor)
        this.camera.position
          .sub(this.controls.target)
          .multiplyScalar(factor / this.fitAspectFactor)
          .add(this.controls.target);
      this.fitAspectFactor = factor;
      this.camera.aspect = w / h;
    } else {
      const W = this.p?.booth.width * IN || 3,
        D = this.p?.booth.depth * IN || 3,
        H = this.p?.booth.height * IN || 2.4;
      const span =
        this.view === "plan"
          ? Math.max(D * 1.3, ((W * h) / w) * 1.3)
          : Math.max(
              H * 1.25,
              (((this.view === "back" ? W : D) * h) / w) * 1.2,
            );
      this.camera.left = (-span * w) / h / 2;
      this.camera.right = (span * w) / h / 2;
      this.camera.top = span / 2;
      this.camera.bottom = -span / 2;
    }
    this.camera.updateProjectionMatrix();
  }
  /**
   * The drawn shadows a hung work throws onto the wall behind it: one plane
   * per shadow that is switched on, each a child of the work's own group, so
   * it moves, scales and hides with the work and needs nothing per frame.
   *
   * Drawn rather than lit, for the reason src/dropshadow.js states. The shape
   * is computed in the fragment shader — a rectangle blurred by a Gaussian,
   * exactly — so there is no texture to build, cache or size: a thin shadow
   * stays crisp at 4096 px, and every shadow in the booth shares one program
   * (see `shadowMaterial`). A plane is built whenever its shadow is on, even
   * at 0% opacity, so a slider can bring it up without a rebuild.
   */
  artShadows(p, a, parent) {
    for (const kind of SHADOW_KINDS) {
      const spec = shadowSpec(p.booth, kind);
      if (!spec.on) continue;
      const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), shadowMaterial());
      mesh.userData.artShadow = a.id;
      mesh.userData.shadowKind = kind;
      mesh.renderOrder = -1;
      placeShadow(mesh, spec, a);
      parent.add(mesh);
    }
  }
  /**
   * Re-plan every shadow in place from the booth's current settings — what a
   * shadow slider does while it is being dragged. Only numbers change, so no
   * program, geometry or texture is touched; switching a shadow on or off is
   * a rebuild, because that adds or removes planes.
   */
  updateShadows() {
    const specs = Object.fromEntries(SHADOW_KINDS.map((kind) => [kind, shadowSpec(this.p.booth, kind)]));
    for (const [id, entry] of this.artGroups) {
      // The work as its group was built: a group mid-resize carries the rest
      // as its own scale, and the shadow is its child.
      for (const mesh of entry.group.children)
        if (mesh.userData.artShadow === id && specs[mesh.userData.shadowKind])
          placeShadow(mesh, specs[mesh.userData.shadowKind], entry.initial);
    }
  }
  /**
   * Retire the booth's current group and start an empty one.
   *
   * The old group is taken out of the scene at once but its geometry and
   * materials are released only after the new group has been drawn (see
   * `releaseRetired`, called from `renderFrame`). The order is the whole
   * point: three deletes a shader program as soon as the last material using
   * it is disposed, so disposing first threw away every program the booth
   * uses and the next frame compiled them all again — measured at about half
   * of what an edit cost, and on an old GPU the most expensive half. Drawn
   * first, the new materials pick up the same programs and disposing the old
   * ones only lowers a count.
   *
   * Not at the first frame, though: a work's texture lands a moment after the
   * build, and a material that gains a map needs a different program — one
   * the old group was still holding. So the old group waits for every load
   * the build started to settle (counted in `watchForChanges`) and goes with
   * the first frame drawn after that, or after `RETIRE_MAX_MS` if a load
   * never does.
   */
  disposeGroup() {
    this.scene.remove(this.group);
    this.retired ||= [];
    if (this.retired.length && !this.groupDrawn) {
      // Two builds with no frame between them (a burst of edits, a hidden
      // viewport). The group being replaced never drew, so it holds no
      // programs and can go at once; the ones that did draw stay.
      disposeTree(this.group);
    } else {
      this.retired.push(this.group);
      // A long burst of drawn edits while a load is pending is the one way
      // the list could grow; past a few booths the oldest goes regardless.
      while (this.retired.length > RETIRE_KEEP) disposeTree(this.retired.shift());
    }
    this.retiredAt = performance.now();
    this.groupDrawn = false;
    this.group = new T.Group();
    this.scene.add(this.group);
  }
  releaseRetired(force = true) {
    if (!this.retired?.length) return;
    if (!force && this.loading > 0 && performance.now() - this.retiredAt < RETIRE_MAX_MS) return;
    this.retired.splice(0).forEach(disposeTree);
  }
  box(w, h, d, x, y, z, mat, parent = this.group) {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  /**
   * A wall's local frame: origin at its bottom-left corner, +x along its
   * width, +z out of its front (inside) face. The three perimeter walls are
   * three fixed callers; a free-standing panel supplies its own centre and
   * rotation, and the corner is that centre stepped back half a width along
   * the frame's own +x.
   */
  wallFrame(wall) {
    const p = this.p.booth,
      W = p.width * IN,
      D = p.depth * IN;
    const g = new T.Group();
    const panel = findPanel(this.p, wall);
    if (panel) return placePanelFrame(g, panel);
    if (wall === "back") g.position.set(-W / 2, 0, -D / 2);
    if (wall === "left") {
      g.position.set(-W / 2, 0, D / 2);
      g.rotation.y = Math.PI / 2;
    }
    if (wall === "right") {
      g.position.set(W / 2, 0, -D / 2);
      g.rotation.y = -Math.PI / 2;
    }
    return g;
  }
  async texture(id, edits = null) {
    const edited = hasImageEdits(edits);
    const asset = this.p.assets[id];
    return this.textureCache.get(id, edits, asset.data, async () => {
      // Decoded straight to the size the wall wants. This used to unpack the
      // whole original — up to 100 megapixels of it — and then shrink it on a
      // 2D canvas, which is most of what made a booth full of uploads heavy
      // on an older machine.
      //
      // An unedited original goes straight onto the GPU, so it is decoded
      // already flipped: WebGL does not apply `texture.flipY` to an
      // ImageBitmap, which is what hung every uploaded photograph upside
      // down. An edited one is drawn onto a canvas first — rotating a
      // pre-flipped image turns the wrong way — so it is decoded the way up
      // it was taken and the texture flips it in the usual way.
      let src = await decodeAt(asset.data, asset.width, asset.height, ART_TEXTURE_MAX, {
        upload: !edited,
      });
      const preflipped = isPreflipped(src);
      if (edited) src = applyImageEdits(src, edits);
      const texture = new T.Texture(src);
      texture.flipY = !preflipped;
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      texture.needsUpdate = true;
      // An ImageBitmap holds its pixels outside the JavaScript heap, so the
      // garbage collector cannot see what it costs. The cache disposes a
      // texture it is done with; this hands the pixels back at the same
      // moment. A canvas or an `<img>` has no `close` and needs none.
      texture.addEventListener("dispose", () => texture.image?.close?.());
      return texture;
    });
  }
  update(p, selected, selectedPanel = null, selectedPedestal = null) {
    this.renderer.shadowMap.needsUpdate = true;
    this.p = p;
    this.selected = selected;
    this.selectedPanel = findPanel(p, selectedPanel) ? selectedPanel : null;
    this.selectedPedestal = findPedestal(p, selectedPedestal) ? selectedPedestal : null;
    if (this.scaleId !== selected) this.scaleId = null;
    this.revision = (this.revision || 0) + 1;
    const rev = this.revision;
    this.disposeGroup();
    this.textureCache.retain([
      ...p.art.filter(a => a.asset).map(a => ({ id: a.asset, edits: a.edits, data: p.assets[a.asset]?.data })),
      ...[p.booth.surroundAsset, groundUpload(p)].filter(Boolean)
        .map(id => ({ id, edits: null, data: p.assets[id]?.data })),
    ]);
    this.artObjects = [];
    this.artGroups = new Map();
    this.wallObjects = [];
    // The other booths' walls. Kept apart from this booth's, which are what
    // the wall picker and the selection outline are about, but offered to a
    // drop so an original can be dragged straight onto a neighbour's wall.
    this.rowWallObjects = [];
    this.pedestalObjects = [];
    this.pedestalFrames = {};
    this.personFrames = {};
    this.resizeHandles = [];
    // The old outlines went with the group that was just disposed.
    this.selectionObjects = [];
    this.frames = {};
    const W = p.booth.width * IN,
      D = p.booth.depth * IN,
      H = p.booth.height * IN;
    const rough = (c) =>
      new T.MeshStandardMaterial({ color: c, roughness: 0.92 });
    const beforeEnvironment = this.group.children.length;
    environment(this.scene, this.group, p.booth);
    // Everything environment() stood around the booth is the Surroundings
    // tag — except the ground, which the booth stands on.
    for (const o of this.group.children.slice(beforeEnvironment))
      if (o.name !== "environment-ground") o.userData.tag = "surroundings";
    // environment() has just put the procedural sky back on the scene, so the
    // backdrop settings it knows nothing about are reset here, before anything
    // that loads an image can claim them. Resetting afterwards would undo the
    // rotation a still-loaded preset backdrop re-applies synchronously.
    // YXZ so the two backdrop controls compose the way a tripod head does:
    // pan swings around the world's vertical, then tilt lifts from there. Under
    // the default XYZ order a pan applied after a tilt rolls the horizon, which
    // reads as the whole hall leaning.
    this.scene.backgroundRotation.order = "YXZ";
    this.scene.backgroundRotation.set(0, 0, 0);
    this.scene.backgroundIntensity = 1;
    this.backdropFraming = p.booth.backdropFraming ?? BACKDROP_FRAMING;
    // On by default, including for a backup saved before this existed: a
    // horizon that slides against the floor is a bug, not a look someone chose.
    this.backdropLock = p.booth.backdropLock ?? true;
    // The preset only supplies image-based lighting and a backdrop; the
    // procedural horizon above stays in place when its assets are missing.
    this.lighting
      .apply(this.scene, p.booth.envPreset, {
        background: !p.booth.surroundAsset,
        rotation: p.booth.surroundRotation || 0,
      })
      .then(() => {
        if (this.revision !== rev) return;
        // Tilt rides on top of whatever yaw the preset backdrop applied.
        this.scene.backgroundRotation.x = (p.booth.backdropTilt || 0) * Math.PI / 180;
        this.renderer.shadowMap.needsUpdate = true;
      })
      .catch(() => {});
    if (p.booth.surroundAsset) this.texture(p.booth.surroundAsset).then(t => {
      if (this.revision !== rev) return;
      t.mapping = T.EquirectangularReflectionMapping;
      this.scene.background = t;
      this.scene.backgroundRotation.y = (p.booth.surroundRotation || 0) * Math.PI / 180;
      this.scene.backgroundRotation.x = (p.booth.backdropTilt || 0) * Math.PI / 180;
      this.scene.fog = null;
    }).catch(() => {});
    // A photographed ground surface, when its files are present. The floor is
    // one choice from one list, so a shipped kind and the user's own
    // photograph are alternatives here rather than one overriding the other;
    // with no files the procedural canvas above stays.
    const groundPhoto = groundUpload(p);
    if (!groundPhoto) this.surfaces.load(groundKind(p)).then(set => {
      if (this.revision !== rev || !set) return;
      const floor = this.group.getObjectByName("environment-ground");
      if (this.surfaces.applyTo(floor, set)) this.renderer.shadowMap.needsUpdate = true;
    }).catch(() => {});
    // A photograph is showing, so the texture set the ground was holding is
    // handed back rather than left on the GPU behind it.
    if (groundPhoto) this.surfaces.release(GROUND_CONSUMER);
    if (groundPhoto) this.texture(groundPhoto).then(t => {
      if (this.revision !== rev) return;
      const floor = this.group.getObjectByName("environment-ground"), map = t.clone();
      map.mapping = T.UVMapping;
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.setScalar(180 / ((p.booth.groundTile || 48) * IN));
      map.needsUpdate = true;
      floor.material.map = map; floor.material.color.set("#ffffff");
      floor.material.bumpMap = null; floor.material.userData.ownedMap = true;
      floor.material.needsUpdate = true;
    }).catch(() => {});
    this.buildUnderlay(p, rev);
    this.buildModels(p, rev);
    const ambient = new T.HemisphereLight("#e9f1ff", "#858079", p.ambient);
    this.group.add(ambient);
    const fill = new T.DirectionalLight("#fff4df", 0.6);
    fill.position.set(-3, 6, 5);
    fill.castShadow = true;
    fill.shadow.mapSize.set(1024, 1024);
    fill.shadow.camera.left = -5;
    fill.shadow.camera.right = 5;
    fill.shadow.camera.top = 5;
    fill.shadow.camera.bottom = -5;
    fill.shadow.normalBias = 0.015;
    this.group.add(fill);
    const wallConsumers = new Set();
    for (const wall of wallKeys(p)) {
      const g = this.wallFrame(wall);
      if (isPanelKey(wall)) g.userData.tag = "panels";
      this.frames[wall] = g;
      this.group.add(g);
      const config = wallSpec(p, wall),
        width = config.width * IN,
        height = config.height * IN;
      if (!config.enabled) continue;
      const wallMesh = this.box(
        width,
        height,
        0.055,
        width / 2,
        height / 2,
        -WALL_SLAB_OFFSET,
        rough(p.booth.color),
        g,
      );
      wallMesh.userData.wall = wall;
      this.wallObjects.push(wallMesh);
      // The blue outline it gets when selected is drawn by applySelection(),
      // so that picking a wall does not rebuild the scene to show it.
      // A fabric pro-panel finish: the weave, not the carpet's own colour. The
      // user picked that colour and this is a tool for judging artwork against
      // it, so only the relief and the sheen are taken and `keepColor` leaves
      // the colour exactly as chosen. The panel's UVs run 0..1 over a face that
      // is wider than it is tall, so the span is given per axis.
      if (p.booth.wallFinish === "fabric") {
        const consumer = WALL_CONSUMER + wall;
        wallConsumers.add(consumer);
        const strength = Math.max(0, Math.min(100, p.booth.wallTexture ?? 60)) / 100;
        this.surfaces.load(WALL_SET, consumer).then(set => {
          if (this.revision !== rev || !set) return;
          if (this.surfaces.applyTo(wallMesh, set, {
            consumer, strength, keepColor: true,
            metres: [width, height],
            slots: ["normalMap", "roughnessMap"],
          })) this.renderer.shadowMap.needsUpdate = true;
        }).catch(() => {});
      } else this.surfaces.release(WALL_CONSUMER + wall);
      const exterior = new T.Group();
      exterior.position.set(width, 0, -0.063);
      exterior.rotation.y = Math.PI;
      g.add(exterior);
      this.frames[wall + "-outside"] = exterior;
      // An art-show wall is one continuous surface — that is what a
      // pro-panel wall is, and "no seams on these walls" is a measurement of
      // the thing being planned, not a finish. The outdoor pop-up keeps its
      // 30″ seam posts, feet and cap rail, because that is what it is made of.
      if (isArtShow(p)) continue;
      const count = Math.ceil(width / (30 * IN));
      for (let i = 0; i <= count; i++) {
        const x = Math.min(width, i * 30 * IN);
        this.box(
          0.009,
          height,
          0.01,
          x,
          height / 2,
          0.001,
          rough("#343638"),
          g,
        );
        this.box(0.09, 0.025, 0.24, x, 0.012, -0.02, rough("#33363a"), g);
      }
      this.box(width, 0.025, 0.08, width / 2, height, 0.0, rough("#26292b"), g);
    }
    this.surfaces.releaseMatching(WALL_CONSUMER, wallConsumers);
    // The rest of the aisle. Every other booth in the row is this booth's
    // size and stands on the same line, offset along X; its three walls are
    // real geometry with real frames, so artwork hung in it is positioned,
    // picked and dragged by exactly the code that hangs artwork at home.
    // They are drawn plain — no seam posts, no fabric weave, no light bar —
    // because they are the neighbours, and the booth being planned is the
    // one that deserves the detail.
    for (const slot of rowLayout(p.booth)) {
      if (slot.kind !== "booth" || slot.home) continue;
      const stand = new T.Group();
      stand.name = "row-booth-" + slot.id;
      stand.position.x = slot.x * IN;
      this.group.add(stand);
      for (const wall of ["back", "left", "right"]) {
        const config = p.booth.walls[wall];
        if (!config?.enabled) continue;
        const g = this.wallFrame(wall);
        stand.add(g);
        this.frames[slot.id + ":" + wall] = g;
        const width = config.width * IN,
          height = config.height * IN;
        const slab = this.box(width, height, 0.055, width / 2, height / 2, -WALL_SLAB_OFFSET, rough(p.booth.color), g);
        slab.userData.wall = wall;
        slab.userData.booth = slot.id;
        this.rowWallObjects.push(slab);
        const exterior = new T.Group();
        exterior.position.set(width, 0, -0.063);
        exterior.rotation.y = Math.PI;
        g.add(exterior);
        this.frames[slot.id + ":" + wall + "-outside"] = exterior;
      }
    }
    for (const a of p.art) {
      const frame = this.frames[frameKey(a)];
      if (!frame || !wallSpec(p, a.wall)?.enabled) continue;
      const art = new T.Group();
      this.artGroups.set(a.id, { group: art, initial: { ...a } });
      art.userData.tag = "art";
      art.position.set(
        (a.x + a.w / 2) * IN,
        (a.y + a.h / 2) * IN,
        (a.offset + a.thickness / 2) * IN + 0.003,
      );
      frame.add(art);
      const box = this.box(
        a.w * IN,
        a.h * IN,
        a.thickness * IN,
        0,
        0,
        0,
        edgeMaterial(a, edgeColorOf(p.booth, a)),
        art,
      );
      box.userData.artId = a.id;
      this.artObjects.push(box);
      this.artShadows(p, a, art);
      // applySelection() outlines this box and places the handles against the
      // size it was built at, since the group carries the live scale.
      this.artGroups.get(a.id).box = box;
      let iw = a.w,
        ih = a.h;
      const asset = p.assets[a.asset];
      if (asset && !a.stretch) {
        const ratio = editedAspect(asset, a.edits);
        if (iw / ih > ratio) iw = ih * ratio;
        else ih = iw / ratio;
      }
      const plane = new T.Mesh(
        new T.PlaneGeometry(iw * IN, ih * IN),
        rough(
          a.asset
            ? "#ffffff"
            : [
                "#dddbcd",
                "#947d61",
                "#c0b6a2",
                "#716e65",
                "#d3c8ad",
                "#8b8277",
              ][p.art.indexOf(a) % 6],
        ),
      );
      plane.material.envMapIntensity = artEnvIntensity(
        p.booth.artFidelity || DEFAULT_FIDELITY,
      );
      plane.position.z = (a.thickness * IN) / 2 + 0.0005;
      plane.receiveShadow = true;
      plane.userData.artId = a.id;
      art.add(plane);
      Object.assign(this.artGroups.get(a.id), { plane, imageWidth: iw, imageHeight: ih });
      this.artObjects.push(plane);
      if (a.kind === "sign" || a.kind === "label") {
        plane.material.color.set("#ffffff");
        plane.material.map = signTexture(a);
        plane.material.userData.ownedMap = true;
      } else if (a.asset) {
        // Bind completed textures synchronously: never render a white placeholder
        // during selection, deselection, or handle activation.
        plane.material.map = this.textureCache.peek(a.asset, a.edits, asset?.data) || null;
        this.texture(a.asset, a.edits)
          .then((t) => {
            if (this.revision === rev) {
              plane.material.map = t;
              plane.material.needsUpdate = true;
            }
          })
          .catch(() => {});
      }
    }
    const fixtures = showFixtures(p.booth.fixtures, p.booth.envPreset, p.booth.venue);
    for (const l of p.lights) {
      // A hidden spotlight is still in the list, still carries its position,
      // its aim and its power, and is simply not built. That is the whole
      // difference between hiding one and deleting one: deleting was the only
      // way to take a light out of a composition, and it threw away the aim
      // that took the longest to set.
      if (!lightVisible(l)) continue;
      const light = new T.SpotLight(
        temperature(l.kelvin),
        l.power,
        20,
        Math.PI / 5,
        0.65,
        2,
      );
      light.position.set(l.x * IN, l.y * IN, l.z * IN);
      light.target.position.set(l.tx * IN, l.ty * IN, l.tz * IN);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.00008;
      light.shadow.normalBias = 0.003;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 20;
      this.group.add(light, light.target);
      // The housing and its glow are the fixture, not the light: hiding them
      // indoors changes what the picture shows, never what it is lit by.
      if (!fixtures) continue;
      const housing = new T.Mesh(
        new T.CylinderGeometry(0.045, 0.055, 0.13, 16),
        rough("#25282b"),
      );
      housing.userData.tag = "fixtures";
      housing.position.copy(light.position);
      housing.quaternion.setFromUnitVectors(
        new T.Vector3(0, -1, 0),
        light.target.position.clone().sub(light.position).normalize(),
      );
      this.group.add(housing);
      const glow = new T.Mesh(
        new T.SphereGeometry(0.033, 12, 8),
        new T.MeshBasicMaterial({ color: temperature(l.kelvin) }),
      );
      glow.position
        .copy(light.position)
        .add(
          light.target.position
            .clone()
            .sub(light.position)
            .normalize()
            .multiplyScalar(0.07),
        );
      glow.userData.tag = "fixtures";
      this.group.add(glow);
    }
    // The pop-up's front header rail. An art-show booth has no canopy frame
    // to carry one; it gets the light bar below instead.
    if (!isArtShow(p))
      this.box(W, 0.025, 0.025, 0, H - 0.025, D * 0.2, rough("#2e3032"));
    this.buildLightBar(p, rough);
    this.buildPedestals(p);
    // Figures for scale. They are part of the picture, not of the booth: the
    // hanging guide ignores them and nothing can be hung on one.
    //
    // Hidden rather than deleted when the switch is off: a figure is placed to
    // sit beside a particular wall, and making someone rebuild that placement
    // to take one clean shot without a person in it is the reason the switch
    // exists. The list is kept, so switching back restores where they stood.
    for (const person of (p.booth.showPeople === false ? [] : (p.booth.people || []).filter(isShown))) {
      const figure = makePerson(person.kind, person.height, this.cutoutFor(person.kind));
      figure.name = "person:" + person.id;
    figure.userData.tag = "people";
      figure.userData.tag = "people";
      placePerson(figure, person);
      this.group.add(figure);
      this.personFrames[person.id] = figure;
    }
    if (p.booth.tent) this.group.add(makeTent(W,D,H,p.booth.tentStyle || "classic"));
    // Photographed canvas on every fabric panel in the scene, when its files
    // are present. Asked of the whole group rather than of the tent just added,
    // because the neighbouring booths environment() built are canopies too and
    // a textured tent beside two procedural ones looks worse than three
    // procedural ones. The panels carry their UVs in metres, so one UV unit is
    // one metre: the same repeatFor() the ground uses, with a span of one
    // instead of 180.
    const fabric = [];
    this.group.traverse(o => { if (o.userData?.fabric) fabric.push(o); });
    if (!fabric.length) this.surfaces.release(TENT_CONSUMER);
    else this.surfaces.load("canvas", TENT_CONSUMER).then(set => {
      if (this.revision !== rev || !set) return;
      let applied = false;
      for (const panel of fabric)
        applied = this.surfaces.applyTo(panel, set, {
          planeMetres: UV_METRE, consumer: TENT_CONSUMER,
          // A tent roof is white, lit from a bright sky and tone-mapped: a
          // weave at its literal depth washes out to nothing. This is a
          // rendering choice, not a measurement, so the relief is exaggerated
          // until the fabric reads as fabric.
          strength: TENT_WEAVE,
        }) || applied;
      if (applied) this.renderer.shadowMap.needsUpdate = true;
    }).catch(() => {});
    this.applyTags();
    this.applySelection();
    this.refreshGuides();
    if (!this.initialized) {
      this.initialized = true;
      this.setView("perspective");
    }
  }
  /**
   * Selection visuals, and nothing else: the blue outline on a work, its eight
   * scale handles, and the outline a free-standing wall or a pedestal gets.
   * Selecting used to go through `update()`, which disposes and rebuilds the
   * scene — every wall, every texture, the HDRI — so a double-click on a
   * picture cost a full rebuild before the handles appeared. It is the same
   * rule `movePanel` follows: a rebuild is for a change of what is in the
   * scene, not for a change of what is selected.
   */
  setSelection(selected, selectedPanel = null, selectedPedestal = null, also = []) {
    this.selected = selected;
    // The rest of a multiple selection: outlined, but only the primary one —
    // `selected` — carries handles and an inspector.
    this.also = also.filter((id) => id !== selected);
    this.selectedPanel = findPanel(this.p, selectedPanel) ? selectedPanel : null;
    this.selectedPedestal = findPedestal(this.p, selectedPedestal) ? selectedPedestal : null;
    if (this.scaleId !== selected) this.scaleId = null;
    this.applySelection();
    this.refreshGuides();
  }
  /** Redraw the outlines from the current selection. Cheap and idempotent. */
  applySelection() {
    for (const object of this.selectionObjects || []) {
      object.parent?.remove(object);
      object.geometry?.dispose();
      object.material?.dispose();
    }
    this.selectionObjects = [];
    this.resizeHandles = [];
    const outline = (geometry, parent) => {
      const edge = new T.LineSegments(
        geometry,
        new T.LineBasicMaterial({ color: "#78b4ff" }),
      );
      edge.userData.editorOnly = true;
      parent.add(edge);
      this.selectionObjects.push(edge);
      return edge;
    };
    this.selectionEdge = null;
    const entry = this.selected && this.artGroups.get(this.selected);
    const a = entry && this.p.art.find((x) => x.id === this.selected);
    if (entry?.box && a) {
      this.selectionEdge = outline(new T.EdgesGeometry(entry.box.geometry), entry.group);
      this.selectionEdge.scale.set(1.007, 1.007, 1.007);
      if (this.scaleId === a.id) {
        for (const [sx, sy] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) {
          const handle = new T.Mesh(new T.SphereGeometry(.045, 16, 10),
            new T.MeshBasicMaterial({color:"#91beff"}));
          // The group carries the work's scale, so the handles are placed in
          // the unscaled geometry the box was built at.
          handle.position.set(sx*entry.initial.w*IN/2, sy*entry.initial.h*IN/2, entry.initial.thickness*IN/2 + .008);
          handle.userData = {artId:a.id, editorOnly:true, sx, sy, stretch: sx === 0 || sy === 0};
          handle.renderOrder = 10;
          entry.group.add(handle);
          this.selectionObjects.push(handle);
          this.resizeHandles.push(handle);
        }
      }
    }
    for (const id of this.also || []) {
      const other = this.artGroups.get(id);
      if (!other?.box) continue;
      const edge = outline(new T.EdgesGeometry(other.box.geometry), other.group);
      edge.material.color.set("#f2a0ff");
      edge.scale.set(1.007, 1.007, 1.007);
    }
    const wallMesh = this.wallObjects.find((m) => m.userData.wall === this.selectedPanel);
    if (this.selectedPanel && wallMesh?.parent) {
      const edge = outline(new T.EdgesGeometry(wallMesh.geometry), wallMesh.parent);
      edge.position.copy(wallMesh.position);
      edge.scale.set(1.004, 1.004, 1.2);
    }
    const ped = this.selectedPedestal && findPedestal(this.p, this.selectedPedestal);
    const pedFrame = ped && this.pedestalFrames[ped.id];
    if (pedFrame) {
      const edge = outline(
        new T.EdgesGeometry(new T.BoxGeometry(ped.width * IN, ped.height * IN, ped.depth * IN)),
        pedFrame,
      );
      edge.position.set(0, (ped.height * IN) / 2, 0);
      edge.scale.setScalar(1.02);
    }
    // No frame drawn here. This used to end in `renderFrame()`, from before
    // the viewport drew on demand; it is wrapped in `watchForChanges`, so the
    // loop draws the outline on its next turn — and a synchronous frame on
    // top of that was a third full render for every click and every rebuild,
    // inside the click handler, on the machine least able to afford it.
  }
  /**
   * The light bar and its heads. Nine directional fixtures spotting the three
   * walls is what an art-show booth is lit with, and none of them is a
   * spotlight anyone wants in the four-light list: where each one points is
   * computed from the booth's measurements by `lightBarFixtures`, so the bar
   * is described by five numbers and rebuilt whenever those change.
   */
  buildLightBar(p, rough) {
    const rail = lightBarRail(p);
    if (!rail.on) return;
    const fixtures = lightBarFixtures(p);
    if (!fixtures.length) return;
    const spec = lightBarSpec(p.booth);
    const optics = lightBarOptics(spec);
    const bar = new T.Group();
    bar.name = "light-bar";
    bar.userData.tag = "fixtures";
    this.group.add(bar);
    // The white hall bouncing the bar back at itself. Without it every surface
    // the nine beams miss falls to black, which reads harsher than the beams.
    const bounce = lightBarBounce(p);
    if (bounce > 0) {
      const fill = new T.HemisphereLight(temperature(spec.kelvin), "#d8d5cf", bounce);
      fill.name = "light-bar-bounce";
      bar.add(fill);
    }
    const metal = new T.MeshStandardMaterial({
      color: "#2b2e31",
      roughness: 0.42,
      metalness: 0.6,
    });
    // The rail itself, plus a drop at each end back to the booth's top rail.
    this.box(rail.width * IN, 0.035, 0.035, 0, rail.y * IN, rail.z * IN, metal, bar);
    // A short bracket at each end, running back toward the booth, so the bar
    // reads as hung rather than floating.
    for (const side of [-1, 1])
      this.box(0.03, 0.03, 0.09, (side * rail.width * IN) / 2, rail.y * IN, rail.z * IN - 0.06, metal, bar);
    for (const f of fixtures) {
      const from = new T.Vector3(f.x * IN, f.y * IN, f.z * IN);
      const to = new T.Vector3(f.tx * IN, f.ty * IN, f.tz * IN);
      const light = new T.SpotLight(
        temperature(f.kelvin),
        f.power * optics.powerScale,
        // Reach far enough to cross the booth diagonally and land on the wall.
        26,
        // Narrower than a floor-standing spot: a wall washer on a bar is aimed
        // at one section of one wall, not at the room. How much narrower is
        // the Diffusion slider's business — see `lightBarOptics`.
        optics.angle,
        optics.penumbra,
        2,
      );
      light.position.copy(from);
      light.target.position.copy(to);
      // Off in the live viewport below High detail; see setBarShadows.
      light.castShadow = this.barShadows;
      // Nine shadow-casting spots is nine shadow passes. Half the map size of
      // a hand-placed spotlight keeps that affordable; a wall wash is a soft
      // edge anyway, so there is nothing in it to see.
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.00008;
      light.shadow.normalBias = optics.normalBias;
      // Nine sources means nine shadows behind every pedestal. Scaling how
      // dark each one goes is what a diffuser does in the room: it fills the
      // shadow rather than removing it.
      light.shadow.intensity = optics.shadowIntensity;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 26;
      bar.add(light, light.target);
      const head = new T.Mesh(new T.CylinderGeometry(0.035, 0.042, 0.12, 14), metal);
      head.position.copy(from);
      head.quaternion.setFromUnitVectors(
        new T.Vector3(0, -1, 0),
        to.clone().sub(from).normalize(),
      );
      head.castShadow = true;
      bar.add(head);
      const glow = new T.Mesh(
        new T.SphereGeometry(0.024, 10, 8),
        new T.MeshBasicMaterial({ color: temperature(f.kelvin) }),
      );
      glow.position.copy(from).addScaledVector(to.clone().sub(from).normalize(), 0.062);
      bar.add(glow);
    }
  }
  /**
   * Pedestals: a plinth with a solid top for cards, a tablet or a guest book.
   * Each is its own group so `movePedestal` can restand one without the scene
   * rebuild `update()` performs, exactly as a free-standing wall's frame does.
   */
  buildPedestals(p) {
    for (const ped of boothPedestals(p).filter(isShown)) {
      const g = new T.Group();
      g.name = "pedestal:" + ped.id;
      g.userData.tag = "furniture";
      placePedestal(g, ped);
      this.group.add(g);
      this.pedestalFrames[ped.id] = g;
      const kind = furnitureKind(ped);
      if (kind === "box") {
        // A drawn box is exactly its measurements: one block, no reveal.
        const block = this.box(ped.width * IN, ped.height * IN, ped.depth * IN, 0, (ped.height * IN) / 2, 0,
          new T.MeshStandardMaterial({ color: ped.color || FURNITURE.box.color, roughness: 0.8 }), g);
        block.userData.pedestal = ped.id;
        this.pedestalObjects.push(block);
        continue;
      }
      if (kind !== "pedestal") {
        // Furniture: the same group, placement and drag, another shape.
        for (const part of buildFurniture(kind, { ...ped, color: ped.color || FURNITURE[kind].color }, g, this.box.bind(this))) {
          part.userData.pedestal = ped.id;
          this.pedestalObjects.push(part);
        }
        continue;
      }
      const color = ped.color || PEDESTAL.color;
      const body = new T.MeshStandardMaterial({ color, roughness: 0.78 });
      const w = ped.width * IN, d = ped.depth * IN, h = ped.height * IN;
      // The top is a separate slab, slightly proud of the body on every side:
      // a solid top is the point of the thing, and the reveal is what stops it
      // reading as a plain extruded box.
      const TOP = 0.02;
      const column = this.box(w, h - TOP, d, 0, (h - TOP) / 2, 0, body, g);
      column.userData.pedestal = ped.id;
      this.pedestalObjects.push(column);
      const top = this.box(
        w + 0.01,
        TOP,
        d + 0.01,
        0,
        h - TOP / 2,
        0,
        new T.MeshStandardMaterial({ color, roughness: 0.55 }),
        g,
      );
      top.userData.pedestal = ped.id;
      this.pedestalObjects.push(top);
    }
  }
  /**
   * Restand one pedestal without a rebuild — the drag counterpart of
   * `movePanel`, and the reason a pedestal is a group of its own.
   */
  /**
   * Restand one figure without the scene rebuild `update()` performs, so a
   * placement slider tracks the cursor instead of disposing every wall and
   * texture in the booth per pixel.
   *
   * Unlike a pedestal this may rebuild the figure itself, because a person's
   * height is in the geometry: a 5'6" figure is not a 6'0" one scaled down —
   * the head stays an eighth of the height and the hip stays at the halfway
   * mark, which is what keeps a shorter figure reading as shorter rather than
   * as further away. Rebuilding one figure is a handful of primitives, and
   * still nothing beside a whole-scene rebuild. Position and facing skip even
   * that.
   *
   * Same rule as `movePanel`: this is the one path a drag and a typed number
   * both take, so a dragged figure lands where a typed one would.
   */
  movePerson(person) {
    const list = this.p.booth.people || [];
    const index = list.findIndex((x) => x.id === person.id);
    if (index < 0) return;
    const before = list[index];
    list[index] = person;
    let figure = this.personFrames[person.id];
    if (!figure) return;
    if (before.height !== person.height || before.kind !== person.kind) figure = this.rebuildFigure(person);
    placePerson(figure, person);
    this.touchShadows();
  }
  /** Replace one figure's meshes, in place, for a new height, kind or picture. */
  rebuildFigure(person) {
    const old = this.personFrames[person.id];
    old.traverse((o) => {
      o.geometry?.dispose();
      // The material is owned by the figure. A cut-out's picture is not — it
      // is shared through `this.cutouts` — and disposing a material leaves
      // its map alone.
      if (o.material) o.material.dispose();
    });
    this.group.remove(old);
    const figure = makePerson(person.kind, person.height, this.cutoutFor(person.kind));
    figure.name = "person:" + person.id;
    figure.userData.tag = "people";
    placePerson(figure, person);
    this.group.add(figure);
    this.personFrames[person.id] = figure;
    this.applyTags(figure);
    return figure;
  }
  /** A figure kind's cut-out picture, or null while it loads or if it is missing. */
  cutoutFor(kind) {
    const id = resolvePerson(kind);
    if (!this.cutouts[id]) {
      this.cutouts[id] = { texture: null };
      this.loadCutout(id);
    }
    return this.cutouts[id].texture;
  }
  /**
   * Load a cut-out, then swap every figure of that kind from mannequin to
   * picture. A missing file is not an error: the mannequin is the fallback,
   * and the app must run with `public/assets` empty.
   */
  loadCutout(id) {
    return new T.TextureLoader().loadAsync(PEOPLE[id].cutout.file).then((texture) => {
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.cutouts[id].texture = texture;
      let swapped = false;
      for (const person of this.p?.booth.people || []) {
        if (resolvePerson(person.kind) !== id || !this.personFrames[person.id]) continue;
        this.rebuildFigure(person);
        swapped = true;
      }
      if (swapped) this.touchShadows();
    }, () => {});
  }
  movePedestal(ped) {
    const list = this.p.booth.pedestals || [];
    const index = list.findIndex((x) => x.id === ped.id);
    if (index < 0) return;
    list[index] = ped;
    const g = this.pedestalFrames[ped.id];
    if (!g) return;
    placePedestal(g, ped);
    this.touchShadows();
    this.refreshGuides();
  }
  /** The pedestal under the pointer, or null. Artwork and walls win the pick. */
  pickPedestal() {
    this.group.updateMatrixWorld(true);
    const hit = this.ray.intersectObjects(
      [...this.artObjects, ...this.wallObjects, ...this.pedestalObjects],
      false,
    )[0];
    return hit?.object.userData.pedestal ? hit : null;
  }
  /**
   * A dragged pedestal's new position, measured on the floor plane the same
   * way a wall's is, so both read identically from any orbit.
   */
  pedestalDragTarget(d) {
    const point = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
    if (!point) return null;
    const grid = this.snap ? 1 : 0.01;
    const ped = findPedestal(this.p, d.pedestal);
    if (!ped) return null;
    return constrainPedestal(this.p, {
      ...ped,
      x: Math.round((point.x / IN - d.dx) / grid) * grid,
      z: Math.round((point.z / IN - d.dz) / grid) * grid,
    });
  }
  updateArtwork(a) {
    const entry = this.artGroups.get(a.id);
    if (!entry) return;
    const { group, initial } = entry;
    group.position.set((a.x + a.w / 2) * IN, (a.y + a.h / 2) * IN,
      (a.offset + a.thickness / 2) * IN + 0.003);
    group.scale.set(a.w / initial.w, a.h / initial.h, a.thickness / initial.thickness);
    if (a.stretch && entry.plane) {
      entry.plane.scale.set(initial.w / entry.imageWidth, initial.h / entry.imageHeight, 1);
    }
    this.touchShadows();
  }
  setView(view) {
    // Any fixed view ends a walk; stopWalk itself comes back through here.
    if (this.walking) this.stopWalk();
    this.view = view;
    const W = this.p.booth.width * IN,
      D = this.p.booth.depth * IN,
      H = this.p.booth.height * IN;
    const perspective = view === "perspective";
    this.camera = perspective
      ? new T.PerspectiveCamera(FOV, 1, 0.02, 100)
      : new T.OrthographicCamera(-3, 3, 3, -3, 0.01, 100);
    this.controls.object = this.camera;
    this.controls.enableRotate = perspective;
    this.camera.up.set(0, 1, 0);
    if (perspective) {
      this.fitAspectFactor = 1;
      this.camera.position.set(0.25, H * 1.1, D / 2 + Math.max(W, D) * 1.85);
      this.controls.target.set(0, H * 0.62, -D * 0.2);
    } else if (view === "plan") {
      this.camera.position.set(0, 12, 0);
      this.camera.up.set(0, 0, -1);
      this.controls.target.set(0, 0, 0);
      this.orthoSpan = Math.max(W, D) * 1.32;
    } else {
      this.orthoSpan = Math.max(
        H * 1.25,
        (((view === "back" ? W : D) * this.host.clientHeight) /
          Math.max(1, this.host.clientWidth)) *
          1.2,
      );
      if (view === "back") {
        this.camera.position.set(0, H / 2, D / 2 + 0.3);
        this.controls.target.set(0, H / 2, -D / 2);
      }
      if (view === "left") {
        this.camera.position.set(W / 2 - 0.05, H / 2, 0);
        this.controls.target.set(-W / 2, H / 2, 0);
      }
      if (view === "right") {
        this.camera.position.set(-W / 2 + 0.05, H / 2, 0);
        this.controls.target.set(W / 2, H / 2, 0);
      }
    }
    this.controls.update();
    this.resize();
    this.refreshGuides();
  }
  /**
   * The plan view's dimension lines and the tape measure, rebuilt from the
   * booth and the measure's two points. Cheap — a few line segments — so it
   * is simply redone whenever anything they depend on moves. The lines are
   * LineSegments in the booth group, which `export()` and `recordVideo()`
   * already hide; the labels are DOM, which neither ever sees.
   */
  refreshGuides() {
    if (!this.p) return;
    if (this.guides) {
      this.guides.parent?.remove(this.guides);
      this.guides.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.guides = new T.Group();
    this.guides.name = "guides";
    this.group.add(this.guides);
    this.annotations = [];
    const segments = [];
    const tight = [];
    const Y = 0.006;
    if (this.view === "plan") {
      const ped = this.selectedPedestal && findPedestal(this.p, this.selectedPedestal);
      const panel = this.selectedPanel && findPanel(this.p, this.selectedPanel);
      const item = ped ? ped : panel ? { ...panel, depth: 3 } : null;
      // Clearance: each gap narrower than a wheelchair needs, in red. Set by
      // main.js from src/clearance.js, and only in Pro.
      for (const issue of this.clearance || []) {
        if (issue.kind !== "tight") continue;
        const a = new T.Vector3(issue.from[0] * IN, Y, issue.from[1] * IN),
          b = new T.Vector3(issue.to[0] * IN, Y, issue.to[1] * IN);
        tight.push(a, b);
        this.annotations.push({ at: a.clone().lerp(b, 0.5), text: formatLength(issue.inches), kind: "clearance" });
      }
      for (const line of planDimensions(this.p.booth, item)) {
        const a = new T.Vector3(line.from.x * IN, Y, line.from.z * IN),
          b = new T.Vector3(line.to.x * IN, Y, line.to.z * IN);
        segments.push(a, b);
        this.annotations.push({ at: a.clone().lerp(b, 0.5), text: formatLength(line.inches), kind: "dimension " + line.kind });
      }
    }
    const [m0, m1] = this.measure.points;
    if (m0) {
      // A small cross marks where the tape starts until the second click.
      const s = 0.03;
      segments.push(m0.clone().add(new T.Vector3(-s, 0, 0)), m0.clone().add(new T.Vector3(s, 0, 0)),
        m0.clone().add(new T.Vector3(0, 0, -s)), m0.clone().add(new T.Vector3(0, 0, s)));
    }
    if (m0 && m1) {
      segments.push(m0, m1);
      this.annotations.push({ at: m0.clone().lerp(m1, 0.5), text: formatLength(distanceInches(m0, m1, IN)), kind: "tape" });
    }
    if (tight.length) {
      const red = new T.LineSegments(
        new T.BufferGeometry().setFromPoints(tight),
        new T.LineBasicMaterial({ color: "#ff4d4d", depthTest: false, transparent: true }),
      );
      red.renderOrder = 10;
      red.userData.editorOnly = true;
      this.guides.add(red);
    }
    if (segments.length) {
      const lines = new T.LineSegments(
        new T.BufferGeometry().setFromPoints(segments),
        new T.LineBasicMaterial({ color: "#91beff", depthTest: false, transparent: true }),
      );
      lines.renderOrder = 10;
      lines.userData.editorOnly = true;
      this.guides.add(lines);
    }
    this.invalidate();
  }
  /**
   * The venue's floor plan, laid on the floor at its real width: an image
   * plane just above the ground, under everything else, half see-through.
   * Editor-only — a planning aid, never in an export — and not pickable, so
   * the tape measures through it to the floor, which is the same place.
   */
  buildUnderlay(p, rev) {
    const u = p.booth.underlay;
    const asset = u && p.assets[u.asset];
    if (!asset || u.on === false) return;
    this.texture(u.asset).then((t) => {
      if (this.revision !== rev) return;
      const aspect = (asset.height || 1) / (asset.width || 1);
      const map = t.clone();
      map.needsUpdate = true;
      const plane = new T.Mesh(
        new T.PlaneGeometry(u.width * IN, u.width * aspect * IN),
        new T.MeshBasicMaterial({ map, transparent: true, opacity: u.opacity ?? 0.6, depthWrite: false, toneMapped: false }),
      );
      plane.material.userData.ownedMap = true;
      plane.rotation.order = "YXZ";
      plane.rotation.set(-Math.PI / 2, ((u.rotation || 0) * Math.PI) / 180, 0);
      plane.position.set(u.x * IN, 0.004, u.z * IN);
      plane.renderOrder = -2;
      plane.name = "underlay";
      plane.userData.editorOnly = true;
      this.group.add(plane);
      this.invalidate();
    }).catch(() => {});
  }
  /**
   * The .glb models brought in (booth.models), each stood on the floor at its
   * typed height: scaled uniformly so its tallest point is that height, its
   * footprint centred on its X/Z and its lowest point on the floor. A model
   * file is parsed once per asset and cloned per placement.
   */
  buildModels(p, rev) {
    this.modelFrames = {};
    const list = (p.booth.models || []).filter(isShown);
    if (!list.length) return;
    this.modelCache ||= new Map();
    for (const m of list) {
      const asset = p.assets[m.asset];
      if (!asset) continue;
      let parsed = this.modelCache.get(m.asset);
      if (!parsed) {
        parsed = parseModel(asset.data);
        this.modelCache.set(m.asset, parsed);
        // A model that will not parse is forgotten, so a fixed file can try again.
        parsed.catch(() => this.modelCache.delete(m.asset));
      }
      this.loadingModel(parsed).then((source) => {
        if (this.revision !== rev) return;
        const g = new T.Group();
        g.name = "model:" + m.id;
        g.userData.tag = "furniture";
        const model = source.clone(true);
        const box = new T.Box3().setFromObject(model);
        const size = box.getSize(new T.Vector3());
        const k = size.y > 0 ? (m.height * IN) / size.y : 1;
        model.scale.setScalar(k);
        const centre = box.getCenter(new T.Vector3());
        model.position.set(-centre.x * k, -box.min.y * k, -centre.z * k);
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        g.add(model);
        g.position.set(m.x * IN, 0, m.z * IN);
        g.rotation.y = ((m.rotation || 0) * Math.PI) / 180;
        this.group.add(g);
        this.modelFrames[m.id] = g;
        this.applyTags(g);
      }).catch(() => {});
    }
  }
  /** A model load in flight, counted like every other load (watchForChanges). */
  loadingModel(promise) {
    return promise;
  }
  /**
   * The booth as a binary glTF (.glb), for SketchUp, Blender, an AR viewer or
   * a fabricator: the booth, the work, the furniture, the figures and any
   * models — not the surroundings, the ground, the lights, the drawn drop
   * shadows or anything editor-only, and nothing a hidden tag has taken out.
   * Metres, which is glTF's unit.
   */
  async exportGLB() {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const off = [];
    this.group.traverse((o) => {
      if (o === this.group || !o.visible) return;
      const drop =
        o.isLight ||
        o.userData.editorOnly ||
        o.userData.artShadow ||
        o.userData.tag === "surroundings" ||
        o.name === "environment-ground" ||
        o.name === "underlay" ||
        (!o.isGroup && (o.layers.mask & 1) === 0);
      if (drop) {
        o.visible = false;
        off.push(o);
      }
    });
    try {
      const result = await new GLTFExporter().parseAsync(this.group, { binary: true, onlyVisible: true });
      return new Blob([result], { type: "model/gltf-binary" });
    } finally {
      for (const o of off) o.visible = true;
    }
  }
  /**
   * The Box tool: press on the floor, drag out a rectangle, let go. Snapped
   * to whole inches with Snap on. The finished footprint goes to `onDrawBox`,
   * which makes it a box piece; a click without a drag draws nothing.
   */
  setDrawingBox(on) {
    this.drawingBox = on ? { start: null } : null;
    this.showBoxPreview(null);
    this.controls.enabled = true;
  }
  boxFrom(a, b) {
    const grid = this.snap ? 1 : 0.25;
    const q = (m) => Math.round(m / IN / grid) * grid;
    const x0 = q(a.x), z0 = q(a.z), x1 = q(b.x), z1 = q(b.z);
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: Math.abs(x1 - x0), depth: Math.abs(z1 - z0) };
  }
  showBoxPreview(r) {
    if (this.boxPreview) {
      this.boxPreview.parent?.remove(this.boxPreview);
      this.boxPreview.geometry.dispose();
      this.boxPreview.material.dispose();
      this.boxPreview = null;
    }
    this.snapNotes = [];
    if (!r) return this.invalidate();
    const Y = 0.008, x0 = (r.x - r.width / 2) * IN, x1 = (r.x + r.width / 2) * IN, z0 = (r.z - r.depth / 2) * IN, z1 = (r.z + r.depth / 2) * IN;
    const pts = [[x0, z0], [x1, z0], [x1, z0], [x1, z1], [x1, z1], [x0, z1], [x0, z1], [x0, z0]].map(([x, z]) => new T.Vector3(x, Y, z));
    this.boxPreview = new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: "#ff5fa2", depthTest: false, transparent: true }));
    this.boxPreview.renderOrder = 11;
    this.boxPreview.userData.editorOnly = true;
    this.group.add(this.boxPreview);
    this.snapNotes = [{ at: new T.Vector3(r.x * IN, Y, r.z * IN), text: `${formatLength(r.width).split(" · ")[0]} × ${formatLength(r.depth).split(" · ")[0]}`, kind: "snap" }];
    this.invalidate();
  }
  /**
   * Hide every object whose tag is hidden, and show the rest. Hidden means
   * moved to layer 1, which the camera, every shadow camera and the raycaster
   * all leave out — so a hidden work is out of the picture, casts nothing and
   * cannot be clicked. Lights are never moved: the Light fixtures tag hides
   * the housings and the bar, not the light they give.
   */
  applyTags(root = this.group) {
    const hidden = this.hiddenTags;
    const walk = (o, off) => {
      const tag = o.userData?.tag;
      const hide = off || (!!tag && !tagShown(hidden, tag));
      if (!o.isLight) o.layers.set(hide ? 1 : 0);
      for (const child of o.children) walk(child, hide);
    };
    let parentHidden = false;
    for (let o = root.parent; o; o = o.parent) if (o.userData?.tag && !tagShown(hidden, o.userData.tag)) parentHidden = true;
    walk(root, parentHidden);
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }
  setHiddenTags(tags) {
    this.hiddenTags = new Set(tags);
    this.applyTags();
  }
  /**
   * Walk mode: the camera at a visitor's eye height in the aisle, looking at
   * the booth. The orbit controls orbit a target a centimetre ahead, which is
   * looking round from where you stand; zoom and pan are off, because a
   * visitor walks rather than zooms. `walk(forward, right, inches)` steps.
   * Leaving puts the controls and the view back.
   */
  startWalk() {
    if (this.walking) return;
    this.setView("perspective");
    this.walking = {
      minDistance: this.controls.minDistance,
      maxDistance: this.controls.maxDistance,
      maxPolar: this.controls.maxPolarAngle,
    };
    this.controls.minDistance = 0.001;
    this.controls.maxDistance = 0.05;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.rotateSpeed = -0.35;
    this.applyPose(walkStart(this.p.booth));
  }
  walk(forward, right, inches) {
    if (!this.walking) return;
    this.applyPose(walkStep(this.pose(), forward, right, inches));
  }
  stopWalk() {
    if (!this.walking) return;
    const w = this.walking;
    this.walking = null;
    this.controls.minDistance = w.minDistance;
    this.controls.maxDistance = w.maxDistance;
    this.controls.maxPolarAngle = w.maxPolar;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.enableDamping = true;
    this.controls.rotateSpeed = 1;
    this.setView("perspective");
  }
  /**
   * The smart guides of the drag in progress: pink lines on the wall the
   * work is being dragged along, and a readout for each equal gap. Lines are
   * editor-only, labels are DOM, so neither can reach an export; both go when
   * the drag ends. `frame` null clears them.
   */
  showSnap(frame, snapped = null) {
    if (this.snapGuides) {
      this.snapGuides.parent?.remove(this.snapGuides);
      this.snapGuides.geometry.dispose();
      this.snapGuides.material.dispose();
      this.snapGuides = null;
    }
    this.snapNotes = [];
    this.lastSnap = snapped && (snapped.guides.length || snapped.gaps.length) ? snapped : null;
    if (!frame || !this.lastSnap) return;
    const Z = 0.03;
    const points = [];
    for (const g of snapped.guides) {
      if (g.axis === "x") points.push(new T.Vector3(g.at * IN, g.from * IN, Z), new T.Vector3(g.at * IN, g.to * IN, Z));
      else points.push(new T.Vector3(g.from * IN, g.at * IN, Z), new T.Vector3(g.to * IN, g.at * IN, Z));
    }
    frame.updateWorldMatrix(true, false);
    for (const gap of snapped.gaps) {
      const a = new T.Vector3(gap.from * IN, gap.at * IN, Z), b = new T.Vector3(gap.to * IN, gap.at * IN, Z);
      points.push(a, b);
      const tick = 1.5 * IN;
      for (const end of [a, b]) points.push(end.clone().setY(end.y - tick), end.clone().setY(end.y + tick));
      this.snapNotes.push({ at: frame.localToWorld(a.clone().lerp(b, 0.5)), text: formatLength(gap.inches), kind: "snap" });
    }
    const lines = new T.LineSegments(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color: "#ff5fa2", depthTest: false, transparent: true }),
    );
    lines.renderOrder = 11;
    lines.userData.editorOnly = true;
    lines.name = "snap-guides";
    frame.add(lines);
    this.snapGuides = lines;
    this.invalidate();
  }
  /** Stand each label over its point on screen. Called after every frame. */
  placeAnnotations() {
    const layer = this.labelLayer;
    if (!layer) return;
    const list = this.snapNotes?.length ? [...this.annotations, ...this.snapNotes] : this.annotations;
    while (layer.children.length > list.length) layer.lastChild.remove();
    while (layer.children.length < list.length) layer.append(document.createElement("span"));
    if (!list.length) return;
    const w = this.host.clientWidth, h = this.host.clientHeight, v = new T.Vector3();
    list.forEach((note, i) => {
      const el = layer.children[i];
      v.copy(note.at).project(this.camera);
      el.className = "scene-label-note " + note.kind;
      if (el.textContent !== note.text) el.textContent = note.text;
      el.hidden = v.z > 1;
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    });
  }
  /**
   * The tape measure. While it is on, a click on the booth sets a point
   * instead of selecting: the first click is where the tape starts, the
   * second where it ends and shows the distance, and a third starts over.
   * Points land on whatever surface is under the pointer — a wall, a
   * pedestal top, a work — or the floor, so a diagonal across the booth and
   * the height of a work off the floor are both one gesture.
   */
  setMeasuring(on) {
    this.measure.on = !!on;
    if (!on) this.measure.points = [];
    this.refreshGuides();
  }
  measurePoint(e) {
    this.point(e);
    this.group.updateMatrixWorld(true);
    const targets = [];
    this.group.traverse((o) => { if (o.isMesh && o.visible && !o.userData.editorOnly) targets.push(o); });
    const hit = this.ray.intersectObjects(targets, false)[0];
    let at = hit?.point || this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
    if (!at) return;
    // Snap is a measurement tool's friend: 1″ on, left raw when snap is off.
    if (this.snap) at = new T.Vector3(...at.toArray().map((m) => Math.round(m / IN) * IN));
    const pts = this.measure.points;
    this.measure.points = pts.length === 1 ? [pts[0], at] : [at];
    this.refreshGuides();
    const [a, b] = this.measure.points;
    this.onMeasure(b ? distanceInches(a, b, IN) : null);
  }
  zoom(factor) {
    if (this.camera.isPerspectiveCamera) {
      const offset=this.camera.position.clone().sub(this.controls.target);
      offset.setLength(Math.max(this.controls.minDistance,Math.min(this.controls.maxDistance,offset.length()/factor)));
      this.camera.position.copy(this.controls.target).add(offset);
    } else { this.camera.zoom=Math.max(.3,Math.min(8,this.camera.zoom*factor));this.camera.updateProjectionMatrix(); }
    this.clampToGround();
    this.controls.update();
  }
  point(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  artFrame(a) {
    return this.frames[frameKey(a)];
  }
  pickArt() {
    this.group.updateMatrixWorld(true);
    const hits = this.ray.intersectObjects([...this.artObjects, ...this.wallObjects], false);
    return hits[0]?.object.userData.artId ? hits[0] : null;
  }
  /**
   * The free-standing wall under the pointer, or null. Artwork wins: the walls
   * are raycast in the same pass, so a work hanging on a panel is picked
   * rather than the panel behind it, which is what clicking a picture means.
   */
  pickPanel() {
    this.group.updateMatrixWorld(true);
    const hit = this.ray.intersectObjects([...this.artObjects, ...this.wallObjects], false)[0];
    if (!hit || hit.object.userData.artId) return null;
    return isPanelKey(hit.object.userData.wall) ? hit : null;
  }
  /**
   * A dragged panel's new position, from the pointer's own point on the floor.
   * The floor is the plane a plan view is measured in, so an X/Z drag reads
   * the same from any orbit — and a grab keeps its offset, so a panel does not
   * jump its centre to the cursor on the first pixel of movement.
   */
  panelDragTarget(d) {
    const point = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
    if (!point) return null;
    const grid = this.snap ? 1 : 0.01;
    const panel = findPanel(this.p, d.key);
    if (!panel) return null;
    return constrainPanel(this.p, {
      ...panel,
      x: Math.round((point.x / IN - d.dx) / grid) * grid,
      z: Math.round((point.z / IN - d.dz) / grid) * grid,
    });
  }
  /**
   * Restand one panel without rebuilding the scene. `update()` disposes and
   * rebuilds everything, which is far too much for every pixel of a drag —
   * and the exterior frame, the art hanging on both faces and the posts are
   * all children of the panel's own frame, so moving that group moves the lot.
   */
  movePanel(panel) {
    const index = (this.p.booth.panels || []).findIndex((x) => x.id === panel.id);
    if (index < 0) return;
    this.p.booth.panels[index] = panel;
    const frame = this.frames["panel:" + panel.id];
    if (!frame) return;
    placePanelFrame(frame, panel);
    this.touchShadows();
    this.refreshGuides();
  }
  wallDrop(e, a) {
    this.point(e); this.group.updateMatrixWorld(true);
    const hit = this.ray.intersectObjects([...this.wallObjects, ...(this.rowWallObjects || [])], false)[0];
    if (!hit || Math.abs(hit.face.normal.z) < .9) return null;
    const wall = hit.object.userData.wall, face = hit.face.normal.z > 0 ? "inside" : "outside";
    // Dropping onto a wall says which booth as well as which wall: the work
    // belongs to the booth it was let go of over, whichever one the row
    // picker happened to be pointing at.
    const booth = hit.object.userData.booth || undefined;
    const frame = this.frames[frameKey({ booth, wall, face })];
    const local = frame.worldToLocal(hit.point.clone());
    const grid = this.snap ? 1 : .01;
    return constrain(this.p, {...a, booth, wall, face,
      x:Math.round((local.x/IN-a.w/2)/grid)*grid,
      y:Math.round((local.y/IN-a.h/2)/grid)*grid});
  }
  focusWall(wall, face = "inside") {
    // A panel stands anywhere and at any angle, so there is no fixed
    // elevation to switch to: frame it from its own face instead, the way an
    // exterior face is already framed.
    const panel = findPanel(this.p, wall);
    if (panel) this.setView("perspective");
    else this.setView(wall);
    if (face !== "outside" && !panel) return;
    const f = this.frames[wall + (face === "outside" ? "-outside" : "")];
    if (!f) return;
    f.updateWorldMatrix(true, false);
    const w = wallSpec(this.p, wall);
    if (!w) return;
    const target = f.localToWorld(new T.Vector3(w.width*IN/2, w.height*IN/2, 0));
    const normal = new T.Vector3(0,0,1).applyQuaternion(f.getWorldQuaternion(new T.Quaternion()));
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(normal, 5);
    this.controls.update();
  }
  bind() {
    const c = this.renderer.domElement;
    // Double-clicking artwork arms its move-and-scale handles, which is the
    // start of a drag, and a drag is the one thing fast edit exists for. So
    // the gesture that says "I am about to arrange this" turns it on. It is
    // still only a view setting — nothing about the booth changed, exports
    // put full quality back — and the toolbar toggle turns it off again.
    const activateTransform = (id) => {
      this.scaleId = id;
      this.armDraft();
      this.onSelect(id);
    };
    c.addEventListener("dblclick", e => {
      this.point(e);
      // Double-clicking a pedestal selects it, so one gesture both picks it
      // up and arms the drag — the single click that selects is the same
      // click a double-click starts with, so this only has to catch the case
      // where the first click landed on something else.
      const ped = this.pickPedestal();
      if (ped) {
        e.preventDefault();
        const id = ped.object.userData.pedestal;
        this.selectedPedestal = id;
        this.onSelectPedestal(id);
        return;
      }
      const hit = this.pickArt();
      if (!hit) return;
      e.preventDefault();
      activateTransform(hit.object.userData.artId);
    });
    c.addEventListener("pointerdown", e => {
      if (e.button !== 0 || this.drag) return;
      if (this.drawingBox) {
        this.point(e);
        const at = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
        if (!at) return;
        this.drawingBox.start = at;
        this.controls.enabled = false;
        c.setPointerCapture(e.pointerId);
        return;
      }
      if (this.measure.on) {
        this.measurePoint(e);
        return;
      }
      this.point(e); this.group.updateMatrixWorld(true);
      this.down = [e.clientX, e.clientY];
      const nearest = this.ray.intersectObjects([...this.resizeHandles, ...this.wallObjects, ...this.artObjects, ...this.pedestalObjects], false)[0];
      const handle = nearest?.object.userData.editorOnly ? nearest : null;
      const pedestalHit = !handle && nearest?.object.userData.pedestal ? nearest : null;
      if (pedestalHit) {
        const id = pedestalHit.object.userData.pedestal,
          ped = findPedestal(this.p, id);
        // The same rule a free-standing wall gets: a first click selects, and
        // only a selected pedestal — or the Move tool — drags. A pedestal in
        // the middle of the booth is otherwise something you shove across the
        // floor on the way to orbiting.
        if (ped && (this.move || this.selectedPedestal === id)) {
          const floor = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
          if (floor) {
            this.drag = { pedestal: id, dx: floor.x / IN - ped.x, dz: floor.z / IN - ped.z };
            this.controls.enabled = false;
            this.onStart();
            c.setPointerCapture(e.pointerId);
          }
        }
        this.selectedPedestal = id;
        this.onSelectPedestal(id);
        return;
      }
      const panelHit =
        !handle && nearest && !nearest.object.userData.artId &&
        isPanelKey(nearest.object.userData.wall)
          ? nearest
          : null;
      if (panelHit) {
        const key = panelHit.object.userData.wall,
          panel = findPanel(this.p, key);
        // A first click selects; only a selected wall — or the Move tool —
        // drags. Otherwise every click on a panel on the way to orbiting the
        // booth would shove it across the floor.
        if (panel && (this.move || this.selectedPanel === key)) {
          const floor = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
          if (floor) {
            this.drag = { key, dx: floor.x / IN - panel.x, dz: floor.z / IN - panel.z };
            this.controls.enabled = false;
            this.onStart();
            c.setPointerCapture(e.pointerId);
          }
        }
        this.selectedPanel = key;
        this.onSelectPanel(key);
        return;
      }
      const hit = handle || this.pickArt();
      if (!hit || (!handle && !this.move && this.scaleId !== hit.object.userData.artId)) return;
      const id = hit.object.userData.artId, a = this.p.art.find(x => x.id === id);
      const frame = this.artFrame(a);
      frame.updateWorldMatrix(true, false);
      const local = frame.worldToLocal(hit.point.clone());
      const normal = new T.Vector3(0,0,1).applyQuaternion(frame.getWorldQuaternion(new T.Quaternion()));
      const plane = new T.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
      this.drag = {id, frame, plane, initial:{...a}, resizing:!!handle,
        stretch: handle?.object.userData.stretch,
        sx: handle?.object.userData.sx, sy: handle?.object.userData.sy,
        dx:local.x/IN-a.x, dy:local.y/IN-a.y,
        radius:Math.hypot(local.x/IN-a.x-a.w/2, local.y/IN-a.y-a.h/2)};
      this.controls.enabled = false;
      this.onStart();
      c.setPointerCapture(e.pointerId);
      this.onSelect(id);
    }, true);
    // A high-rate mouse or trackpad fires several pointermove events per
    // displayed frame, and each one here raycasts, restands the thing being
    // dragged and re-renders its shadows. Only the last one before a frame is
    // drawn can be seen, so the rest is work thrown away: the event is stored
    // and applied once, from the render loop.
    c.addEventListener("pointermove", e => {
      if (this.drawingBox?.start) {
        this.point(e);
        const at = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
        if (at) this.showBoxPreview(this.boxFrom(this.drawingBox.start, at));
        return;
      }
      if (!this.drag) return;
      this.pendingMove = e;
    });
    this.applyDrag = (e) => {
      if (!this.drag) return;
      this.point(e);
      if (this.drag.key) {
        const next = this.panelDragTarget(this.drag);
        if (next) {
          this.movePanel(next);
          this.onMovePanel(next);
        }
        return;
      }
      if (this.drag.pedestal) {
        const next = this.pedestalDragTarget(this.drag);
        if (next) {
          this.movePedestal(next);
          this.onMovePedestal(next);
        }
        return;
      }
      const point = this.ray.ray.intersectPlane(this.drag.plane, new T.Vector3());
      if (!point) return;
      const d = this.drag, local = d.frame.worldToLocal(point);
      if (d.resizing) {
        const a = d.initial;
        if (d.stretch) {
          const horizontal = d.sx !== 0;
          const spec = wallSpec(this.p, a.wall);
          const width = spec.width;
          const height = spec.height;
          const x = horizontal && d.sx < 0 ? Math.max(0, Math.min(a.x+a.w-1, local.x/IN)) : a.x;
          const y = !horizontal && d.sy < 0 ? Math.max(0, Math.min(a.y+a.h-1, local.y/IN)) : a.y;
          const w = horizontal ? d.sx < 0 ? a.x+a.w-x : Math.max(1,Math.min(360,width-a.x,local.x/IN-a.x)) : a.w;
          const h = !horizontal ? d.sy < 0 ? a.y+a.h-y : Math.max(1,Math.min(360,height-a.y,local.y/IN-a.y)) : a.h;
          this.onMove({...a,x,y,w,h,stretch:true});
          return;
        }
        const radius = Math.hypot(local.x/IN-a.x-a.w/2, local.y/IN-a.y-a.h/2);
        this.onMove(scalePanel(this.p, a, radius / Math.max(.01,d.radius)));
      } else {
        const a = this.p.art.find(x => x.id === d.id), grid = this.snap ? 1 : .01;
        let next = constrain(this.p, {...a,
          x:Math.round((local.x/IN-d.dx)/grid)*grid,
          y:Math.round((local.y/IN-d.dy)/grid)*grid});
        // Smart guides: with Snap on, an edge or a centre that comes within
        // two inches of another work's, the wall's centre or the hang line
        // jumps to it, and the line it jumped to is drawn. Alt holds them off
        // for one drag, the way it does in every drawing program.
        const wall = wallSpec(this.p, a.wall);
        if (this.snap && !e.altKey && wall) {
          const snapped = smartSnap(next, sameWall(this.p.art, a).filter((b) => b.id !== a.id), wall);
          next = constrain(this.p, { ...next, x: snapped.x, y: snapped.y });
          this.showSnap(d.frame, snapped);
        } else this.showSnap(null);
        this.onMove(next);
      }
    };
    c.addEventListener("pointerup", e => {
      if (this.drawingBox?.start) {
        this.point(e);
        const at = this.ray.ray.intersectPlane(FLOOR, new T.Vector3());
        const r = at && this.boxFrom(this.drawingBox.start, at);
        this.drawingBox.start = null;
        this.controls.enabled = true;
        this.showBoxPreview(null);
        if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
        if (r && r.width >= 4 && r.depth >= 4) this.onDrawBox?.(r);
        return;
      }
      if (this.drag) {
        // The last move still pending has to land before the drag ends, or a
        // quick flick finishes an inch short of where it was released.
        this.flushDrag();
        this.drag = null; this.down = null; this.controls.enabled = true;
        this.showSnap(null);
        if (this.shadowsOwed) this.touchShadows();
        if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
        this.onEnd();
        return;
      }
      if (this.down && Math.hypot(e.clientX-this.down[0], e.clientY-this.down[1]) < 7) {
        this.point(e);
        const pedestalHit = this.pickPedestal();
        if (pedestalHit) {
          const id = pedestalHit.object.userData.pedestal;
          this.lastTap = null;
          this.down = null;
          this.letGoOfArt();
          this.selectedPedestal = id;
          this.onSelectPedestal(id);
          return;
        }
        const panelHit = this.pickPanel();
        if (panelHit) {
          const key = panelHit.object.userData.wall;
          this.lastTap = null;
          this.down = null;
          this.letGoOfArt();
          this.selectedPanel = key;
          this.onSelectPanel(key);
          return;
        }
        const hit = this.pickArt();
        const id = hit?.object.userData.artId || null;
        // Clicking anything that is not a free-standing wall lets go of the
        // one that was selected, so the sliders never point at a wall the
        // pointer has moved on from.
        if (this.selectedPanel) {
          this.selectedPanel = null;
          this.onSelectPanel(null);
        }
        const now = performance.now();
        if (
          id &&
          this.lastTap?.id === id &&
          now - this.lastTap.time < 380 &&
          Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 24
        ) {
          this.lastTap = null;
          activateTransform(id);
        } else {
          // Clicking anywhere but the work whose handles are armed is letting
          // go of it — the floor, the wall behind it, or another work. In
          // auto that is what turns fast edit back off, so the shadows and the
          // supersampling come back the moment the arranging stops.
          if (id !== this.scaleId) this.letGoOfArt();
          this.lastTap = id ? { id, time: now, x: e.clientX, y: e.clientY } : null;
          // Shift adds to the selection rather than replacing it; main.js
          // keeps the set, because the set is about the inspector.
          this.onSelect(id, { add: e.shiftKey });
        }
      }
      this.down = null;
    });
    c.addEventListener("pointercancel", () => {
      this.drag = null; this.controls.enabled = true; this.down = null;
      this.showSnap(null);
      this.onEnd();
    });
  }
  // The framing as a keyframe would hold it, and the way back to one. Both are
  // here rather than in main.js because the camera and its controls are this
  // class's to touch — a panel that set camera.position itself would be fighting
  // OrbitControls for the same state.
  pose() {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray() };
  }
  applyPose(pose) {
    if (!pose?.position || !pose?.target) return;
    this.stopPreview?.();
    this.controls.target.set(...pose.target);
    this.camera.position.set(...pose.position);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.renderFrame();
  }
  // Plays a camera move in the viewport at its real duration, so a move can be
  // judged before committing to a render — a 14-second 1440p clip is minutes of
  // encoding, and finding out afterwards that the move was wrong is the whole
  // cost of not having this.
  //
  // Unlike recordVideo this is driven by wall clock, not by frame index, and
  // that is correct here for the same reason it is wrong there: a preview
  // should take the number of seconds it claims even if the machine drops
  // frames doing it, whereas a file must contain every frame it promises.
  previewMove({ move, seconds, onProgress = () => {}, signal } = {}) {
    // Any preview already running is stopped *before* the framing is read,
    // because stopping it is what puts the camera back. Reading first would
    // capture a camera halfway through the old move and make that the place
    // this one returns to, displacing the view permanently.
    this.stopPreview?.();
    const base = {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
    // A timeline carries its own length, including its holds; a fixed move has
    // the length it was designed around.
    const duration = Math.max(0.5, seconds ?? (isTimeline(move) ? timelineSeconds(move) : resolveMove(move).seconds)) * 1000;
    const overlay = isTimeline(move) ? move : null;
    const restore = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      enabled: this.controls.enabled,
    };
    // The live loop is stopped and frames are drawn here instead, for the same
    // reason recordVideo does it: OrbitControls.update() re-derives the camera
    // position from its own spherical state every frame and re-applies
    // minDistance, maxDistance and maxPolarAngle. It would quietly clamp a
    // move — a push-in that starts at 1.75x the orbit radius can exceed
    // maxDistance — and a preview that is clamped where the recording is not
    // is a preview of the wrong clip.
    this.stopLoop();
    // A drag mid-preview would still reach the controls and fight the path.
    this.controls.enabled = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(this.previewFrame);
      this.stopPreview = null;
      // The live loop and export() share this renderer, so a fade left at 0.3
      // after a cancelled preview is a viewport that looks broken.
      this.overlay = { fade: 1, flare: null };
      this.camera.position.copy(restore.position);
      this.controls.target.copy(restore.target);
      this.camera.lookAt(this.controls.target);
      this.controls.enabled = restore.enabled;
      this.controls.update();
      this.startLoop();
    };
    return new Promise((resolve) => {
      const started = performance.now();
      const step = () => {
        if (signal?.aborted) {
          finish();
          return resolve({ cancelled: true });
        }
        // Wall clock, not frame index — the opposite of recordVideo, and right
        // for the opposite reason: a preview should take the seconds it claims
        // even if the machine drops frames, whereas a file must contain every
        // frame it promises.
        const t = Math.min(1, (performance.now() - started) / duration);
        const frame = samplePath(move, base, t);
        this.camera.position.set(...frame.position);
        this.controls.target.set(...frame.target);
        this.camera.lookAt(this.controls.target);
        // Fades and flares are functions of t, so the wall-clock preview and the
        // frame-indexed recording get the same answer without sharing a loop.
        this.overlay = overlay
          ? { fade: fadeAt(overlay, t), flare: overlay.flare?.on ? this.flareState(overlay.flare.strength, overlay.flare.source) : null }
          : { fade: 1, flare: null };
        this.renderFrame();
        onProgress(t);
        if (t >= 1) {
          finish();
          return resolve({ cancelled: false });
        }
        this.previewFrame = requestAnimationFrame(step);
      };
      // Cancellable from outside: someone who sees the wrong move in the first
      // second should not have to wait out the rest.
      this.stopPreview = () => {
        finish();
        resolve({ cancelled: true });
      };
      // The first frame now rather than on the next animation frame: with the
      // live loop drawing on demand, an idle page may be handed its next
      // frame late, and a preview should start the moment it is asked for.
      step();
    });
  }
  // Records a filmic camera move to an MP4.
  //
  // Frames are rendered offline, one at a time, and handed to the encoder with
  // exact presentation times — never captured from a live canvas. A booth with
  // a photographic backdrop and two spotlights does not render inside 33 ms on
  // most machines, and a live capture would bake that machine's frame rate into
  // the file as stutter or slow motion. Rendering offline costs the user a
  // progress bar and buys a clip that is the same on every machine.
  //
  // The camera, the controls and the editor's own overlays are all restored in
  // a finally block: this drives the same camera the user is holding, and
  // leaving it parked mid-move after a cancelled recording would look like the
  // viewport had broken.
  async recordVideo({ move, seconds, fps, size, frame = DEFAULT_FRAME, custom, settle = true, onProgress = () => {}, signal } = {}) {
    if (!videoSupported())
      throw new Error(
        "This browser cannot encode video. Chrome, Edge and Safari 16.4 or newer can; Export PNG works everywhere.",
      );
    // A preview drives the same camera, so it cannot be left running.
    this.stopPreview?.();
    await Promise.allSettled(this.textureCache.pending());
    const preset = SIZES[size] || SIZES[DEFAULT_SIZE];
    const canvas = this.renderer.domElement;
    // The frame is chosen now, not inherited from the window. "This window"
    // is still an option and still the default, and it is the old behaviour
    // exactly: the viewport's own aspect, height following width. The named
    // frames — widescreen, vertical, square — state their ratio instead, so a
    // clip for a phone is 1080 x 1920 whatever shape the browser is. Both
    // sides are forced even because H.264 encodes in macroblocks.
    const shape = frameSize(frame, {
      long: preset.height ? Math.max(preset.width, preset.height) : preset.width,
      viewport: canvas.width / canvas.height,
      custom,
    });
    const width = evenSize(shape.width);
    const height = evenSize(shape.height);
    const max = this.renderer.capabilities.maxTextureSize;
    if (width > max || height > max)
      throw new Error("This device cannot render that clip size. Choose 720p.");

    const base = {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
    const clip = frameTimes(seconds ?? (isTimeline(move) ? timelineSeconds(move) : resolveMove(move).seconds), fps);
    // frameTimes still owns the frame count and the exact landing on t=1, even
    // for a timeline that knows its own length: two sources of frame times is
    // how a clip ends a frame early.
    const overlay = isTimeline(move) ? move : null;
    const pixelRatio = this.renderer.getPixelRatio();
    const restore = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      target: this.controls.target.clone(),
      aspect: this.camera.aspect,
      enabled: this.controls.enabled,
      damping: this.controls.enableDamping,
      maxPolar: this.controls.maxPolarAngle,
    };
    const hidden = [];
    this.group.traverse((o) => {
      if (o.isLineSegments || o.userData.editorOnly) {
        hidden.push(o);
        o.visible = false;
      }
    });
    // The live loop must not render between frames: it would fight this method
    // for the camera and for the framebuffer the encoder is about to read.
    this.stopLoop();
    this.controls.enabled = false;
    // Damping interpolates towards a target over wall-clock time. On a path
    // driven frame by frame it would smear every frame towards the last one.
    this.controls.enableDamping = false;
    // Same rule as `export()`: a recording is a delivered file, so full
    // quality goes back before the first frame is drawn and draft mode is
    // restored afterwards. A clip is rendered offline anyway — nothing about
    // it is timed against this machine — so there is nothing to gain by
    // leaving the shadows off and a whole clip to lose.
    const wasDraft = this.draft;
    this.setDraft(false);
    const wasBarShadows = this.barShadows;
    this.setBarShadows(true);
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      const recorded = await recordMp4({
        count: clip.count,
        fps,
        width,
        height,
        bitrate: preset.bitrate,
        onProgress,
        signal,
        drawFrame: (i) => {
          const t = clip.at(i);
          const frame = samplePath(move, base, t);
          this.overlay = overlay
            ? { fade: fadeAt(overlay, t), flare: overlay.flare?.on ? this.flareState(overlay.flare.strength, overlay.flare.source) : null }
            : { fade: 1, flare: null };
          this.camera.position.set(...frame.position);
          this.controls.target.set(...frame.target);
          this.camera.lookAt(this.controls.target);
          this.camera.updateProjectionMatrix();
          // Shadows are static between edits, so the map is refreshed once per
          // frame here rather than never: the lights do not move, but the
          // camera does, and a cascade that was fit to the old view would
          // crawl across the floor.
          this.renderer.shadowMap.needsUpdate = true;
          this.renderFrame();
          return canvas;
        },
        // Careful rendering. Reported as glitches on export: a frame captured
        // while a texture upload, a shadow map or the backdrop's second pass
        // was still landing comes out with a wall, a shadow or the
        // surroundings from the frame before. Drawing each frame a second
        // time, after yielding to the browser, costs roughly double the
        // encode and buys a frame whose GPU work has certainly finished. It
        // is a setting rather than a rule because on a fast machine it is
        // paying twice for nothing.
        settleFrame: settle
          ? async () => {
              await new Promise((r) => setTimeout(r, 0));
              this.renderFrame();
            }
          : null,
      });
      return { ...recorded, width, height, fps, seconds: clip.count / fps };
    } finally {
      // Restored here and not on the happy path only: a cancelled recording
      // must not leave the viewport faded or flaring.
      this.overlay = { fade: 1, flare: null };
      hidden.forEach((o) => (o.visible = true));
      this.camera.position.copy(restore.position);
      this.camera.quaternion.copy(restore.quaternion);
      this.controls.target.copy(restore.target);
      this.camera.aspect = restore.aspect;
      this.controls.maxPolarAngle = restore.maxPolar;
      this.controls.enableDamping = restore.damping;
      this.controls.enabled = restore.enabled;
      this.renderer.setPixelRatio(pixelRatio);
      this.resize();
      this.controls.update();
      this.renderer.shadowMap.needsUpdate = true;
      this.setBarShadows(wasBarShadows);
      this.setDraft(wasDraft);
      this.startLoop();
    }
  }
  /**
   * A still.
   *
   * `long` is the longer side in pixels — the old "4096 px wide", generalised,
   * because a vertical phone frame at 4096 wide would be 7281 tall and no
   * device will render it. `frame` names the shape: "view" keeps the window's
   * own aspect, which is what this always did, and the rest state a ratio and
   * get the camera set up for it. A camera whose aspect is not the canvas's is
   * the whole bug behind a stretched export, so it is set here and restored in
   * the finally beside everything else.
   */
  async export(long, { frame = DEFAULT_FRAME, custom } = {}) {
    await Promise.allSettled(this.textureCache.pending());
    const canvas = this.renderer.domElement,
      w = canvas.width,
      h = canvas.height;
    const shape = frameSize(frame, { long, viewport: w / h, custom });
    const width = shape.width,
      height = shape.height;
    const max = this.renderer.capabilities.maxTextureSize;
    if (width > max || height > max)
      throw new Error(
        "This device cannot render that export size. Choose 2048 px.",
      );
    // An export is the artefact someone shows a jury. Draft mode is about how
    // this machine feels to drag on, and it has no business in a delivered
    // file: a booth exported with the shadows switched off is not the booth.
    // Below the size check, so a refused export leaves the mode as it found it.
    const wasDraft = this.draft;
    this.setDraft(false);
    const wasBarShadows = this.barShadows;
    this.setBarShadows(true);
    const pixel = this.renderer.getPixelRatio();
    const wasAspect = this.camera.aspect;
    const hidden = [];
    this.group.traverse((o) => {
      if (o.isLineSegments || o.userData.editorOnly) {
        hidden.push(o);
        o.visible = false;
      }
    });
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      if (this.camera.isPerspectiveCamera) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      }
      // Once, unlike a recorded frame. `toBlob` reads the canvas back, and a
      // readback flushes everything the GPU still owed — so a still cannot
      // catch a half-finished frame the way a captured video frame can. A
      // second draw at 4096 px costs as much again as the first and buys
      // nothing; it also took the export past the browser suite's timeout,
      // which is how this was found.
      this.renderFrame();
      return await new Promise((res, rej) =>
        canvas.toBlob(
          (b) => (b ? res(b) : rej(new Error("Export failed. Try 2048 px."))),
          "image/png",
        ),
      );
    } finally {
      hidden.forEach((o) => (o.visible = true));
      this.renderer.setPixelRatio(pixel);
      if (this.camera.isPerspectiveCamera) this.camera.aspect = wasAspect;
      this.resize();
      this.setBarShadows(wasBarShadows);
      this.setDraft(wasDraft);
    }
  }
}
