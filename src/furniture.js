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
  } else if (kind === "stairs") {
    // Treads and risers as solid steps, each one riser taller than the last,
    // climbing toward −Z; two stringers down the sides.
    const tread = mat(color, 0.65),
      steps = Math.max(2, Math.round(h / (7.75 * IN))),
      rise = h / steps,
      run = d / steps;
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      add(box(w, top, run, 0, top / 2, d / 2 - run * (i + 0.5), tread, g));
    }
    const rail = mat("#f3f1ec", 0.6);
    for (const sx of [-1, 1]) {
      const len = Math.hypot(d, h);
      const stringer = add(box(0.03, 0.035, len, (sx * (w - 0.03)) / 2, h / 2 - 0.02, 0, rail, g));
      stringer.rotation.x = Math.atan2(h, d);
    }
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
  } else if (kind === "bed") {
    // A base, a mattress a shade lighter, two pillows and a headboard at −Z.
    const base = Math.min(12 * IN, h * 0.3), mattress = Math.min(10 * IN, h * 0.25), head = 0.05;
    const frame = mat(shade(color, -0.35), 0.7);
    add(box(w, base, d, 0, base / 2, 0, frame, g));
    add(box(w - 0.03, mattress, d - head - 0.03, 0, base + mattress / 2, head / 2, mat(color, 0.95), g));
    add(box(w, h, head, 0, h / 2, -d / 2 + head / 2, frame, g));
    const pw = Math.min(26 * IN, (w - 0.08) / 2);
    for (const sx of w > 44 * IN ? [-1, 1] : [0])
      add(box(pw, 0.1, 0.4, sx * (pw / 2 + 0.02), base + mattress + 0.05, -d / 2 + head + 0.25, mat("#f7f6f2", 0.95), g));
    // The duvet over the foot two-thirds.
    add(box(w - 0.02, 0.03, d * 0.62, 0, base + mattress + 0.015, d / 2 - (d * 0.62) / 2 - 0.01, mat(shade(color, -0.12), 0.95), g));
  } else if (kind === "sofa" || kind === "armchair") {
    // Seat deck, back cushion at −Z, and an arm each end.
    const fabric = mat(color, 0.95), arm = Math.min(7 * IN, w * 0.18), seat = Math.min(18 * IN, h * 0.58), back = Math.min(9 * IN, d * 0.28);
    add(box(w, seat * 0.55, d, 0, (seat * 0.55) / 2, 0, fabric, g));
    const cushions = kind === "sofa" ? Math.max(1, Math.round((w - 2 * arm) / (26 * IN))) : 1,
      cw = (w - 2 * arm) / cushions;
    for (let i = 0; i < cushions; i++)
      add(box(cw - 0.01, seat * 0.45, d - back - 0.01, -w / 2 + arm + cw * (i + 0.5), seat * 0.55 + (seat * 0.45) / 2, back / 2, mat(shade(color, 0.04), 0.97), g));
    add(box(w, h, back, 0, h / 2, -d / 2 + back / 2, fabric, g));
    for (const sx of [-1, 1]) add(box(arm, Math.min(h, seat + 6 * IN), d, sx * (w / 2 - arm / 2), Math.min(h, seat + 6 * IN) / 2, 0, fabric, g));
  } else if (kind === "dining" || kind === "coffee" || kind === "desk" || kind === "nightstand") {
    // A top on four legs; a desk and a nightstand carry a drawer box under it.
    const wood = mat(color, 0.55), top = kind === "coffee" ? 0.04 : 0.035, lg = kind === "coffee" ? 0.04 : 0.045;
    add(box(w, top, d, 0, h - top / 2, 0, wood, g));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        add(box(lg, h - top, lg, sx * (w / 2 - lg), (h - top) / 2, sz * (d / 2 - lg), wood, g));
    if (kind === "desk") add(box(Math.min(w * 0.35, 18 * IN), 0.14, d - 0.06, w / 2 - Math.min(w * 0.35, 18 * IN) / 2 - 0.03, h - top - 0.07, 0, wood, g));
    if (kind === "nightstand") add(box(w - 0.02, h * 0.55, d - 0.02, 0, h - top - (h * 0.55) / 2, 0, wood, g));
    if (kind === "coffee") add(box(w - 0.1, 0.02, d - 0.1, 0, h * 0.3, 0, wood, g));
  } else if (kind === "cabinet" || kind === "dresser" || kind === "wallcab") {
    // A carcass with its doors or drawers drawn as reveals on the front
    // (+Z). A base cabinet wears a counter top with a 1″ overhang and sits
    // on a toe kick; a wall cabinet hangs its bottom 54″ off the floor.
    const body = mat(color, 0.55), reveal = mat(shade(color, -0.25), 0.6);
    const bottom = kind === "wallcab" ? Math.max(0, h - 30 * IN) : kind === "cabinet" ? 4 * IN : 0.03;
    const topH = kind === "cabinet" ? 1.5 * IN : 0;
    const boxH = h - bottom - topH;
    // The counter's overhang is inside the typed depth: the carcass stands
    // an inch back from the front edge, the way a 25″ top sits on a 24″ box.
    const cd = topH ? d - IN : d, cz = (d - cd) / -2;
    if (kind !== "wallcab") add(box(w - 0.02, bottom, cd - 0.08, 0, bottom / 2, cz - 0.04, mat("#2a2b2d", 0.8), g));
    add(box(w, boxH, cd, 0, bottom + boxH / 2, cz, body, g));
    if (topH) add(box(w, topH, d, 0, h - topH / 2, 0, mat("#d9d6cf", 0.3), g));
    const face = cz + cd / 2 + 0.002;
    if (kind === "dresser") {
      const rows = 3;
      for (let i = 1; i < rows; i++) add(box(w - 0.02, 0.006, 0.004, 0, bottom + (boxH * i) / rows, face, reveal, g));
    } else {
      const doors = Math.max(1, Math.round(w / (18 * IN)));
      for (let i = 1; i < doors; i++) add(box(0.006, boxH - 0.02, 0.004, -w / 2 + (w * i) / doors, bottom + boxH / 2, face, reveal, g));
      if (kind === "cabinet") add(box(w - 0.02, 0.006, 0.004, 0, bottom + boxH - 6 * IN, face, reveal, g));
    }
  } else if (kind === "shelves") {
    // Two sides, a back and a shelf every 12″ or so, with a few books.
    const wood = mat(color, 0.6), t = 0.02;
    for (const sx of [-1, 1]) add(box(t, h, d, sx * (w / 2 - t / 2), h / 2, 0, wood, g));
    add(box(w, h, 0.008, 0, h / 2, -d / 2 + 0.004, wood, g));
    const n = Math.max(2, Math.round(h / (12 * IN)));
    const spines = ["#7b3b2e", "#2f4a5a", "#c9b27c", "#3f5b3a", "#8f8a80", "#b3553f"];
    const rand = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(Math.round(w * 1000 + h * 7));
    for (let i = 0; i <= n; i++) {
      const y = (h - t) * (i / n) + t / 2;
      add(box(w - 2 * t, t, d - 0.01, 0, y, 0.005, wood, g));
      if (i === n) continue;
      let x = -w / 2 + t + 0.01;
      const gap = (h - t) / n - t;
      while (x < w / 2 - t - 0.06 && rand() > 0.08) {
        const bw = 0.02 + rand() * 0.025, bh = gap * (0.6 + rand() * 0.3);
        add(box(bw, bh, d * 0.75, x + bw / 2, y + t / 2 + bh / 2, 0, mat(spines[Math.floor(rand() * spines.length)], 0.8), g));
        x += bw + 0.002;
      }
    }
  } else if (kind === "rug") {
    // Flat on the floor, just above each room's own floor slab, with a border.
    const r = add(box(w, h, d, 0, h / 2 + 0.004, 0, mat(color, 1), g));
    r.castShadow = false;
    const edge = mat(shade(color, -0.2), 1), b = Math.min(4 * IN, w * 0.06);
    for (const sz of [-1, 1]) add(box(w, h + 0.001, b, 0, h / 2 + 0.0045, sz * (d / 2 - b / 2), edge, g)).castShadow = false;
    for (const sx of [-1, 1]) add(box(b, h + 0.001, d, sx * (w / 2 - b / 2), h / 2 + 0.0045, 0, edge, g)).castShadow = false;
  }
  return parts;
}

/** A hex colour lightened (+) or darkened (−) by a fraction. */
function shade(hex, amount) {
  const c = new T.Color(hex);
  const target = amount < 0 ? new T.Color(0, 0, 0) : new T.Color(1, 1, 1);
  return "#" + c.lerp(target, Math.abs(amount)).getHexString();
}
