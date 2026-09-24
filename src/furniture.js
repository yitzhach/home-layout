// The shapes of the furniture a booth stands on its floor: folding tables
// in their cloths, a counter, chairs and a stool, a print bin, a gridwall
// panel, a banner stand and a screen. Each is built from a few primitives at
// the size typed for it, origin at the centre of its footprint on the floor,
// so the scene places and turns it exactly as it does a pedestal.
//
// Stylised on purpose, like the figures: these are there to take up the room
// they take up and to read as what they are from across an aisle, not to be
// looked at closely.
import * as T from "three";

const IN = 0.0254;

// One gridwall texture for every panel: 3″ squares of wire on transparency.
let gridTexture = null;
function gridwallTexture() {
  if (gridTexture) return gridTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 64, 6);
  g.fillRect(0, 0, 6, 64);
  gridTexture = new T.CanvasTexture(c);
  gridTexture.wrapS = gridTexture.wrapT = T.RepeatWrapping;
  gridTexture.colorSpace = T.SRGBColorSpace;
  return gridTexture;
}

/**
 * Build one piece of furniture. `box(w, h, d, x, y, z, material, parent)` is
 * the scene's own helper, so every part casts and takes shadows the way the
 * rest of the booth does. Returns the meshes that should pick and drag it.
 */
export function buildFurniture(kind, ped, g, box) {
  const w = ped.width * IN,
    d = ped.depth * IN,
    h = ped.height * IN,
    color = ped.color,
    parts = [];
  const mat = (c, roughness = 0.7, extra = {}) => new T.MeshStandardMaterial({ color: c, roughness, ...extra });
  const add = (mesh) => (parts.push(mesh), mesh);
  const metal = mat("#3a3d42", 0.4, { metalness: 0.6 });
  const leg = 0.022;

  if (kind === "table6" || kind === "table8") {
    // A folding table in a floor-length cloth: the drape is the table, as far
    // as anyone in the aisle can tell. A thin top slab catches the light.
    const cloth = mat(color, 0.9);
    add(box(w, h - 0.012, d, 0, (h - 0.012) / 2, 0, cloth, g));
    add(box(w + 0.012, 0.012, d + 0.012, 0, h - 0.006, 0, mat(color, 0.75), g));
  } else if (kind === "counter") {
    const body = mat(color, 0.78);
    add(box(w, h - 0.03, d, 0, (h - 0.03) / 2, 0, body, g));
    add(box(w + 0.03, 0.03, d + 0.03, 0, h - 0.015, 0, mat("#d9d6cf", 0.45), g));
  } else if (kind === "chair") {
    const seat = Math.min(h - 0.05, 18 * IN);
    const frame = mat(color, 0.6);
    add(box(w, 0.03, d, 0, seat - 0.015, 0, frame, g));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        add(box(leg, seat - 0.03, leg, (sx * (w - leg)) / 2, (seat - 0.03) / 2, (sz * (d - leg)) / 2, metal, g));
    // The back, at the rear edge (−Z is the back of the chair).
    add(box(w, h - seat, 0.025, 0, seat + (h - seat) / 2, -d / 2 + 0.0125, frame, g));
  } else if (kind === "stool") {
    const r = Math.min(w, d) / 2;
    const top = new T.Mesh(new T.CylinderGeometry(r, r, 0.04, 20), mat(color, 0.6));
    top.position.y = h - 0.02;
    g.add(add(top));
    const pole = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, h - 0.04, 10), metal);
    pole.position.y = (h - 0.04) / 2;
    g.add(add(pole));
    const foot = new T.Mesh(new T.CylinderGeometry(r * 0.85, r * 0.85, 0.02, 20), metal);
    foot.position.y = 0.01;
    g.add(add(foot));
    for (const m of [top, pole, foot]) (m.castShadow = true), (m.receiveShadow = true);
  } else if (kind === "bin") {
    // A browse bin: a base, then an open tray the top 12″ deep with prints
    // standing in it, leaning back the way a flipped-through bin sits.
    const tray = Math.min(12 * IN, h * 0.5), base = h - tray, wood = mat(color, 0.75), t = 0.015;
    add(box(w, base, d, 0, base / 2, 0, wood, g));
    add(box(w, tray, t, 0, base + tray / 2, d / 2 - t / 2, wood, g));
    add(box(w, tray, t, 0, base + tray / 2, -d / 2 + t / 2, wood, g));
    for (const sx of [-1, 1]) add(box(t, tray, d, (sx * (w - t)) / 2, base + tray / 2, 0, wood, g));
    const prints = ["#e9e4da", "#c9d6df", "#e3cfc0", "#d4dcc8", "#efe9f2", "#d9d2c3"];
    const n = Math.max(3, Math.floor(d / (2.5 * IN)));
    for (let i = 0; i < n; i++) {
      const p = box(w - 0.05, tray * 1.1, 0.004, 0, base + tray * 0.55, -d / 2 + 0.03 + ((d - 0.06) * i) / Math.max(1, n - 1), mat(prints[i % prints.length], 0.85), g);
      p.rotation.x = -0.18;
      add(p);
    }
  } else if (kind === "gridwall") {
    // Wire grid on two feet. The squares are a texture with the holes cut by
    // alpha, so a panel is one plane rather than a few hundred bars.
    const feet = 4 * IN, span = h - feet;
    const tex = gridwallTexture();
    const material = mat(color, 0.5, { map: tex, alphaTest: 0.5, side: T.DoubleSide, metalness: 0.4 });
    // A repeat per 3″ square, set on a clone so each size tiles its own way.
    material.map = tex.clone();
    material.map.repeat.set(ped.width / 3, (span / IN) / 3);
    material.map.needsUpdate = true;
    material.userData.ownedMap = true;
    const panel = new T.Mesh(new T.PlaneGeometry(w, span), material);
    panel.position.y = feet + span / 2;
    panel.castShadow = true;
    g.add(add(panel));
    const frame = mat(color, 0.45, { metalness: 0.5 });
    add(box(w, 0.012, 0.012, 0, h - 0.006, 0, frame, g));
    add(box(w, 0.012, 0.012, 0, feet, 0, frame, g));
    for (const sx of [-1, 1]) {
      add(box(0.012, span, 0.012, (sx * w) / 2, feet + span / 2, 0, frame, g));
      add(box(0.03, 0.02, d, (sx * w) / 2, 0.01, 0, metal, g));
    }
  } else if (kind === "banner") {
    // A retractable banner: a cassette base and the print standing out of it.
    const base = 3 * IN;
    add(box(w, base, Math.min(d, 8 * IN), 0, base / 2, 0, metal, g));
    add(box(w - 0.02, h - base, 0.006, 0, base + (h - base) / 2, 0, mat(color, 0.8), g));
  } else if (kind === "tv") {
    // A screen on a pole: 16:9 at the width typed, its top at the height.
    const screenH = (w * 9) / 16, bottom = Math.max(0.1, h - screenH);
    add(box(w, screenH, 0.05, 0, bottom + screenH / 2, 0, mat("#0c0d0f", 0.25, { metalness: 0.3 }), g));
    const glass = box(w - 0.03, screenH - 0.03, 0.002, 0, bottom + screenH / 2, 0.026, mat("#1b2733", 0.15, { emissive: "#0d1a26" }), g);
    glass.castShadow = false;
    add(glass);
    add(box(0.05, bottom, 0.05, 0, bottom / 2, -0.03, metal, g));
    add(box(Math.min(w, 0.6), 0.03, d, 0, 0.015, -0.03, metal, g));
  }
  return parts;
}
