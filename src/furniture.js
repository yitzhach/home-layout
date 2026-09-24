// The shapes of the furniture a home stands on its floors: beds, sofas and
// chairs, tables and a desk, kitchen counters, wall cabinets and appliances,
// a bookcase, a rug, a TV, the bathroom's fittings — and the booth app's
// tables, bins and stands, still drawn for a backup that has them. Each is
// built from a few primitives at the size typed for it, origin at the centre
// of its footprint on the floor and its front toward +Z, so the scene places
// and turns it exactly as it does a pedestal.
//
// Stylised on purpose, like the figures: these are there to take up the room
// they take up and to read as what they are from across an aisle, not to be
// looked at closely.
import * as T from "three";

const IN = 0.0254;

/** A colour a little lighter (f > 0) or darker (f < 0), as a hex string. */
function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

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
  } else if (kind === "chair") {
    const seat = Math.min(h - 0.05, 18 * IN);
    const frame = mat(color, 0.6);
    add(box(w, 0.03, d, 0, seat - 0.015, 0, frame, g));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        add(box(leg, seat - 0.03, leg, (sx * (w - leg)) / 2, (seat - 0.03) / 2, (sz * (d - leg)) / 2, metal, g));
    // The back, at the rear edge (−Z is the back of the chair).
    add(box(w, h - seat, 0.025, 0, seat + (h - seat) / 2, -d / 2 + 0.0125, frame, g));
  } else if (kind === "bed") {
    // A bed: the typed height is the headboard's top, and the mattress top
    // sits at about half of it (24″ on the default 44″) — a plinth frame, the
    // mattress on it, a duvet over its foot two thirds and two pillows.
    const frame = mat(color, 0.7),
      linen = mat("#f1eee8", 0.95),
      top = Math.min(h * 0.55, 25 * IN),
      base = top * 0.45,
      head = Math.max(0.05, Math.min(d * 0.06, 3 * IN)),
      bd = d - head,
      duvet = bd * 0.66;
    add(box(w, base, bd, 0, base / 2, head / 2, frame, g));
    add(box(w - 0.03, top - base - 0.03, bd - 0.03, 0, base + (top - base - 0.03) / 2, head / 2, linen, g));
    add(box(w, 0.03, duvet, 0, top - 0.015, d / 2 - duvet / 2, mat(color, 0.9), g));
    const pw = Math.min(26 * IN, (w - 0.1) / 2);
    for (const sx of w > 50 * IN ? [-1, 1] : [0])
      add(box(pw, 0.08, 0.36, sx * (pw / 2 + 0.03), top + 0.04, -d / 2 + head + 0.22, linen, g));
    add(box(w, h, head, 0, h / 2, -d / 2 + head / 2, frame, g));
  } else if (kind === "sofa" || kind === "armchair") {
    // A seat block, back cushion along −Z and two arms; cushions split into
    // seats roughly 24″ each.
    const fabric = mat(color, 0.95),
      arm = Math.min(7 * IN, w * 0.18),
      seat = Math.min(18 * IN, h * 0.55),
      back = Math.min(9 * IN, d * 0.3);
    add(box(w, seat - 0.12, d, 0, (seat - 0.12) / 2 + 0.04, 0, fabric, g));
    const inner = w - 2 * arm,
      n = Math.max(1, Math.round(inner / (26 * IN)));
    for (let i = 0; i < n; i++)
      add(box(inner / n - 0.01, 0.12, d - back - 0.02, -inner / 2 + (inner / n) * (i + 0.5), seat - 0.06, back / 2, mat(color, 0.98), g));
    add(box(w, h - 0.04, back, 0, (h - 0.04) / 2 + 0.04, -d / 2 + back / 2, fabric, g));
    for (const sx of [-1, 1]) add(box(arm, Math.min(h, 25 * IN) - 0.04, d, (sx * (w - arm)) / 2, (Math.min(h, 25 * IN) - 0.04) / 2 + 0.04, 0, fabric, g));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.04, 0.04, 0.04, (sx * (w - 0.1)) / 2, 0.02, (sz * (d - 0.1)) / 2, metal, g));
  } else if (kind === "dining" || kind === "coffee" || kind === "desk" || kind === "nightstand") {
    // A top on four legs; a desk and a nightstand also have a drawer box.
    const wood = mat(color, 0.6),
      top = kind === "coffee" ? 0.035 : 0.03,
      lg = kind === "coffee" ? 0.04 : 0.045;
    add(box(w, top, d, 0, h - top / 2, 0, wood, g));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) add(box(lg, h - top, lg, (sx * (w - lg - 0.02)) / 2, (h - top) / 2, (sz * (d - lg - 0.02)) / 2, wood, g));
    if (kind === "desk") add(box(Math.min(w * 0.35, 16 * IN), 0.14, d - 0.06, w / 2 - Math.min(w * 0.35, 16 * IN) / 2 - 0.03, h - top - 0.07, 0, wood, g));
    if (kind === "nightstand") add(box(w - 0.02, h * 0.55, d - 0.02, 0, h - top - (h * 0.55) / 2, 0, wood, g));
  } else if (kind === "counter" || kind === "vanity") {
    // A run of base cabinets: toe kick, doors every 18″ or so, a 1½″ top
    // that overhangs the front an inch. The front is +Z.
    const body = mat(color, 0.7),
      top = 1.5 * IN,
      kick = 4 * IN;
    add(box(w, kick, d - 0.08, 0, kick / 2, -0.04, mat("#2c2d30", 0.8), g));
    add(box(w, h - top - kick, d - 0.03, 0, kick + (h - top - kick) / 2, -0.015, body, g));
    add(box(w, top, d, 0, h - top / 2, 0, mat(kind === "vanity" ? "#f2f1ee" : "#d9d6cf", 0.3), g));
    const doors = Math.max(1, Math.round(w / (18 * IN))),
      dw = w / doors;
    for (let i = 0; i < doors; i++) {
      const x = -w / 2 + dw * (i + 0.5);
      add(box(dw - 0.008, h - top - kick - 0.01, 0.012, x, kick + (h - top - kick) / 2, d / 2 - 0.02, mat(color, 0.55), g));
      add(box(0.012, 0.1, 0.02, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), h - top - 0.12, d / 2 - 0.004, metal, g));
    }
    if (kind === "vanity") {
      const sink = new T.Mesh(new T.CylinderGeometry(Math.min(w, d) * 0.28, Math.min(w, d) * 0.24, 0.02, 24), mat("#ffffff", 0.2));
      sink.position.set(0, h + 0.005, 0);
      g.add(add(sink));
    }
  } else if (kind === "wallcab") {
    // Upper cabinets: the typed height is to the top, the usual 84″; the
    // body is the top 30″ of that, hung on the wall behind it (−Z).
    const body = mat(color, 0.7),
      bh = Math.min(h, 30 * IN);
    add(box(w, bh, d, 0, h - bh / 2, 0, body, g));
    const doors = Math.max(1, Math.round(w / (18 * IN))),
      dw = w / doors;
    for (let i = 0; i < doors; i++) {
      const x = -w / 2 + dw * (i + 0.5);
      add(box(dw - 0.008, bh - 0.01, 0.012, x, h - bh / 2, d / 2 + 0.006, mat(color, 0.55), g));
      add(box(0.012, 0.1, 0.02, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), h - bh + 0.1, d / 2 + 0.016, metal, g));
    }
  } else if (kind === "fridge") {
    const shell = mat(color, 0.3, { metalness: 0.4 });
    add(box(w, h, d, 0, h / 2, 0, shell, g));
    add(box(w - 0.01, 0.006, 0.01, 0, h * 0.62, d / 2 + 0.002, mat("#3a3d42", 0.4), g));
    for (const y of [h * 0.8, h * 0.45]) add(box(0.02, 0.3, 0.03, -w / 2 + 0.06, y, d / 2 + 0.02, metal, g));
  } else if (kind === "range") {
    add(box(w, h - 0.02, d, 0, (h - 0.02) / 2, 0, mat(color, 0.35, { metalness: 0.4 }), g));
    add(box(w, 0.02, d, 0, h - 0.01, 0, mat("#15171a", 0.3), g));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const burner = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.01, 18), mat("#2c2e31", 0.5));
      burner.position.set(sx * w * 0.24, h + 0.004, sz * d * 0.22);
      g.add(add(burner));
    }
    add(box(w * 0.8, h * 0.35, 0.01, 0, h * 0.4, d / 2 + 0.005, mat("#1b1d20", 0.2), g));
  } else if (kind === "bookcase") {
    // Sides, a back and a shelf every 12″ or so, with a few rows of books.
    const wood = mat(color, 0.65),
      t = 0.02,
      shelves = Math.max(2, Math.round(h / (12 * IN)));
    for (const sx of [-1, 1]) add(box(t, h, d, (sx * (w - t)) / 2, h / 2, 0, wood, g));
    add(box(w, h, t, 0, h / 2, -d / 2 + t / 2, wood, g));
    const bookColors = ["#7a4b3a", "#3d5a6c", "#c9b27c", "#5e6e4f", "#8b2f3c", "#d8d2c4"];
    for (let i = 0; i <= shelves; i++) {
      const y = Math.min(h - t / 2, (i * h) / shelves + t / 2);
      add(box(w - 2 * t, t, d - t, 0, y, t / 2, wood, g));
      if (i === shelves) continue;
      const space = h / shelves - t;
      let x = -w / 2 + t + 0.01;
      let k = i * 3;
      while (x < w / 2 - t - 0.05) {
        const bw = 0.025 + ((k * 37) % 5) * 0.006,
          bh = space * (0.6 + ((k * 13) % 4) * 0.08);
        if ((k * 7) % 9 === 0) x += 0.06;
        else add(box(bw, bh, d * 0.7, x + bw / 2, y + t / 2 + bh / 2, 0, mat(bookColors[k % bookColors.length], 0.8), g));
        x += bw + 0.002;
        k++;
      }
    }
  } else if (kind === "dresser") {
    const wood = mat(color, 0.6);
    add(box(w, h - 0.08, d, 0, (h - 0.08) / 2 + 0.08, 0, wood, g));
    const rows = Math.max(2, Math.round(h / (10 * IN)));
    for (let i = 0; i < rows; i++) {
      const y = 0.08 + ((h - 0.08) / rows) * (i + 0.5);
      add(box(w - 0.03, (h - 0.08) / rows - 0.012, 0.012, 0, y, d / 2 + 0.006, mat(color, 0.5), g));
      add(box(0.12, 0.015, 0.02, 0, y, d / 2 + 0.016, metal, g));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.04, 0.08, 0.04, (sx * (w - 0.06)) / 2, 0.04, (sz * (d - 0.06)) / 2, wood, g));
  } else if (kind === "media") {
    // A low console with a flat screen standing on it; the typed height is
    // the top of the screen, the console about 20″ of it.
    const wood = mat(color, 0.6),
      low = Math.min(20 * IN, h * 0.42),
      room = h - low - 0.09,
      screen = Math.min(w * 0.95, (room * 16) / 9),
      sh = (screen * 9) / 16;
    add(box(w, low - 0.05, d, 0, (low - 0.05) / 2 + 0.05, 0, wood, g));
    for (const sx of [-1, 1]) add(box(0.04, 0.05, d - 0.06, (sx * (w - 0.1)) / 2, 0.025, 0, metal, g));
    add(box(Math.min(0.25, w * 0.5), 0.015, Math.min(0.18, d * 0.8), 0, low + 0.0075, 0, metal, g));
    add(box(0.04, 0.08, 0.03, 0, low + 0.05, 0, metal, g));
    add(box(screen, sh, 0.03, 0, h - sh / 2, 0, mat("#0c0d0f", 0.25, { metalness: 0.3 }), g));
    const glass = box(screen - 0.02, sh - 0.02, 0.002, 0, h - sh / 2, 0.016, mat("#1b2733", 0.15, { emissive: "#0d1a26" }), g);
    glass.castShadow = false;
    add(glass);
  } else if (kind === "rug") {
    // A rug: a thin slab with a border a shade darker.
    const border = Math.min(3 * IN, w * 0.06, d * 0.06);
    add(box(w, h, d, 0, h / 2, 0, mat(color, 0.98), g));
    add(box(w - 2 * border, 0.002, d - 2 * border, 0, h + 0.001, 0, mat(shadeColor(color, 0.12), 0.98), g)).castShadow = false;
  } else if (kind === "bathtub") {
    const shell = mat(color, 0.25),
      rim = 0.08;
    add(box(w, h * 0.3, d, 0, h * 0.15, 0, shell, g));
    add(box(w, h * 0.7, rim, 0, h * 0.65, (d - rim) / 2, shell, g));
    add(box(w, h * 0.7, rim, 0, h * 0.65, -(d - rim) / 2, shell, g));
    for (const sx of [-1, 1]) add(box(rim, h * 0.7, d - 2 * rim, (sx * (w - rim)) / 2, h * 0.65, 0, shell, g));
  } else if (kind === "toilet") {
    const china = mat(color, 0.2);
    add(box(w, h * 0.55, d * 0.3, 0, h * 0.45 + h * 0.55 / 2, -d / 2 + (d * 0.3) / 2, china, g));
    const bowl = new T.Mesh(new T.CylinderGeometry(w * 0.48, w * 0.36, h * 0.5, 20), china);
    bowl.scale.z = (d * 0.7) / w;
    bowl.position.set(0, h * 0.25, d * 0.12);
    g.add(add(bowl));
    add(box(w, 0.03, d * 0.66, 0, h * 0.5 + 0.015, d * 0.12, china, g));
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
  }
  return parts;
}
