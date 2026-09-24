// Figures for scale.
//
// A booth drawing is a measurement, and a measurement is hard to read without
// something whose size everyone already knows. A 96-inch wall means little on
// screen; a 96-inch wall beside a 5'6" person means exactly what it means in
// the aisle.
//
// Each figure is a cut-out photograph when its file is present — the way
// architects' entourage and SketchUp's face-me people work: a flat picture that
// turns to face the camera, so it never shows its edge. The owner supplied the
// two pictures in `public/assets/people`: a black silhouette for the man and a
// posterised woman in colour. Without those files (the app must run with
// `public/assets` empty) a figure is the stylised mannequin below — no face, no
// clothing, matte mid-grey, out of the way of the artwork's colour.
//
// Heights are the defaults the user asked for and are editable per figure:
// 5 ft 6 for a woman, 6 ft for a man. They are averages standing in for a
// visitor, not a claim about anybody.
import * as T from "three";
import { IN } from "./model.js";

// `cutout.box` is the figure's own extent in the picture, in pixels, from the
// top of the hair to the soles — left, top, right, bottom, inclusive — out of
// `size`. Measured off the alpha channel once; the rest of each picture is
// transparent margin. The figure's height maps onto the box, so the top of the
// hair is the typed height and the soles stand on the floor.
export const PEOPLE = {
  woman: {
    label: "Woman · 5′6″",
    height: 66,
    cutout: { file: "assets/people/woman.png", size: [750, 1827], box: [130, 40, 603, 1781] },
  },
  man: {
    label: "Man · 6′0″",
    height: 72,
    cutout: { file: "assets/people/man.png", size: [750, 1827], box: [152, 28, 586, 1764] },
  },
};
export const DEFAULT_PERSON = "woman";
export const MAX_PEOPLE = 6;
export const MIN_HEIGHT = 48;
export const MAX_HEIGHT = 84;
export const personHeight = (kind) => (PEOPLE[kind] || PEOPLE[DEFAULT_PERSON]).height;
export const resolvePerson = (kind) => (PEOPLE[kind] ? kind : DEFAULT_PERSON);

// Proportions as fractions of standing height, from the ordinary artist's
// canon: the head is about an eighth of a figure, the hip sits near the
// half-way mark. They are what keeps a 5'6" figure reading as shorter rather
// than smaller — a uniformly scaled figure just looks further away.
const HEAD = 0.125;
const SHOULDER = 0.82;
const HIP = 0.5;

// Mid-grey, and darker than the walls on purpose: a figure lighter than the
// panels competes with the artwork, and under a spotlight it blows out to a
// white post. These read as a person standing in the booth at a glance, which
// is the entire job.
const PALETTE = {
  woman: "#5f636b",
  man: "#53575f",
};

/**
 * The cut-out's rectangle in texture space, `[u0, v0, u1, v1]`, with v up the
 * way three's default `flipY` lays an image out. Pure, so a test can hold it.
 */
export function cutoutUV(kind) {
  const { size: [w, h], box: [left, top, right, bottom] } = PEOPLE[resolvePerson(kind)].cutout;
  return [left / w, 1 - (bottom + 1) / h, (right + 1) / w, 1 - top / h];
}

/** Width over height of a figure's picture, so a cut-out is never stretched. */
export function cutoutAspect(kind) {
  const { box: [left, top, right, bottom] } = PEOPLE[resolvePerson(kind)].cutout;
  return (right - left + 1) / (bottom - top + 1);
}

// Scratch objects for the face-the-camera turn, which runs once per figure per
// drawn frame and per shadow pass.
const UP = new T.Vector3(0, 1, 0);
const seat = new T.Vector3();
const eye = new T.Vector3();
const turn = new T.Quaternion();
const flip = new T.Vector3();

/**
 * A cut-out figure: one plane carrying the picture, cut along its alpha.
 *
 * It turns about the vertical to face whatever camera draws it — the viewport,
 * an export, a video frame, and each light's shadow camera, so the shadow is
 * always the full silhouette rather than a sliver. The turn is written into
 * `matrixWorld` in `onBeforeRender`, which three calls after it has updated
 * the world matrices and before it uses this one, so nothing else — the
 * figure's placement, its `rotation`, a test reading its position — sees it.
 *
 * Both pictures look to the viewer's left. The figure's own facing still
 * means something: when it points to the viewer's right the picture is
 * mirrored, so two people placed to face each other do.
 */
function makeCutout(id, height, texture) {
  const width = height * cutoutAspect(id);
  const geometry = new T.PlaneGeometry(width, height);
  const [u0, v0, u1, v1] = cutoutUV(id);
  // PlaneGeometry's corners run top-left, top-right, bottom-left, bottom-right.
  geometry.attributes.uv.array.set([u0, v1, u1, v1, u0, v0, u1, v0]);
  const material = new T.MeshStandardMaterial({
    map: texture,
    // A hard cut rather than blending: blended planes need sorting against
    // the artwork behind them and the shadow pass ignores blending entirely,
    // while the alpha test is honoured by both.
    alphaTest: 0.5,
    side: T.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.userData.person = true;
  mesh.userData.cutout = true;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const group = mesh.parent;
    if (!group) return;
    seat.setFromMatrixPosition(group.matrixWorld);
    camera.getWorldPosition(eye);
    const dx = eye.x - seat.x;
    const dz = eye.z - seat.z;
    // Straight overhead there is no horizontal direction to face; keep the
    // figure's own.
    const yaw = Math.hypot(dx, dz) < 1e-6 ? group.rotation.y : Math.atan2(dx, dz);
    const faceX = Math.sin(group.rotation.y);
    const faceZ = Math.cos(group.rotation.y);
    // The viewer's right, seen from the camera, is (dz, -dx).
    const mirrored = faceX * dz - faceZ * dx > 1e-9;
    turn.setFromAxisAngle(UP, yaw);
    seat.y += height / 2;
    flip.set(mirrored ? -1 : 1, 1, 1);
    mesh.matrixWorld.compose(seat, turn, flip);
  };
  return mesh;
}

/**
 * One figure, standing at the origin and facing +Z (the aisle), built to a
 * real height in inches so it can be measured against the walls beside it.
 * With `texture` — that kind's picture, loaded by the scene — it is the
 * cut-out; without, the mannequin.
 */
export function makePerson(kind = DEFAULT_PERSON, inches = 0, texture = null) {
  const id = resolvePerson(kind);
  const height = (inches > 0 ? inches : personHeight(id)) * IN;
  const group = new T.Group();
  if (texture) {
    group.add(makeCutout(id, height, texture));
    group.userData.person = true;
    return group;
  }
  const skin = new T.MeshStandardMaterial({
    color: PALETTE[id] || PALETTE.woman,
    roughness: 0.85,
    metalness: 0,
  });
  const add = (geometry, x, y, z) => {
    const mesh = new T.Mesh(geometry, skin);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    // Marks the mesh as part of a figure. Note what this does *not* do: it is
    // not `editorOnly`, so a figure is in the PNG and in the video, unlike the
    // grid and the selection handles. That is deliberate — a person is part of
    // the picture, and a render is where the scale reference earns its keep —
    // but it means Layout -> People -> Show the figures is the only way to take
    // one out of an export. This comment claimed the opposite for a while.
    mesh.userData.person = true;
    group.add(mesh);
    return mesh;
  };
  const shoulders = height * (id === "man" ? 0.125 : 0.112);
  const hips = height * (id === "man" ? 0.096 : 0.105);
  const headRadius = (height * HEAD) / 2;

  add(new T.SphereGeometry(headRadius, 18, 14), 0, height - headRadius, 0);
  // Neck.
  add(new T.CylinderGeometry(headRadius * 0.38, headRadius * 0.45, height * 0.04, 12), 0, height * 0.94, 0);
  // Torso: a tapered cylinder from shoulders to hips, which is enough of a
  // silhouette at the distance anybody looks at a booth from.
  const torso = add(
    new T.CylinderGeometry(shoulders * 0.46, hips * 0.42, height * (SHOULDER - HIP), 18, 1),
    0,
    height * (HIP + (SHOULDER - HIP) / 2),
    0,
  );
  // Flattened front to back: a round torso at this scale reads as a bollard,
  // and a bollard beside a wall tells you nothing about how tall the wall is.
  torso.scale.z = 0.5;
  // Hips, then two legs.
  const pelvis = add(new T.SphereGeometry(hips * 0.46, 16, 12), 0, height * HIP, 0);
  pelvis.scale.set(1, 0.68, 0.6);
  for (const side of [-1, 1]) {
    // Two legs with daylight between them. One merged column is the difference
    // between a figure and a post, and it is visible at any distance.
    const leg = add(
      new T.CylinderGeometry(hips * 0.17, hips * 0.12, height * HIP, 12),
      side * hips * 0.3,
      (height * HIP) / 2,
      0,
    );
    leg.scale.z = 0.9;
    // Arms hang just clear of the torso, tilted out a few degrees so the gap
    // survives being seen straight on.
    const arm = add(
      new T.CylinderGeometry(shoulders * 0.13, shoulders * 0.1, height * 0.33, 10),
      side * (shoulders * 0.5 + shoulders * 0.12),
      height * 0.655,
      0,
    );
    arm.rotation.z = side * -0.06;
    arm.scale.z = 0.9;
  }
  group.userData.person = true;
  return group;
}

/**
 * Where a figure stands, in one function, because a slider and a typed number
 * must land in the same place. `BoothScene.update` calls it when the scene is
 * built and `movePerson` calls it on every pixel of a drag.
 */
export function placePerson(group, person) {
  group.position.set((person.x || 0) * IN, 0, (person.z || 0) * IN);
  group.rotation.y = ((person.rotation || 0) * Math.PI) / 180;
  return group;
}

/** A new figure for the project, placed a little in front of the back wall. */
export const newPerson = (kind = DEFAULT_PERSON, id = "") => ({
  id,
  kind: resolvePerson(kind),
  height: personHeight(resolvePerson(kind)),
  // Inches from the centre of the floor, the same frame the lights use.
  x: 0,
  z: 18,
  // Degrees. 0 faces the aisle, which is how someone looking at the back wall
  // would be standing if you were photographing the booth from outside.
  rotation: 180,
});
