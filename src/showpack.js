// The show pack: what someone takes to a show on paper. A measured floor
// plan, the inventory of work with sizes and prices, and a packing and
// load-in checklist worked out from the booth itself — a canopy needs its
// weights, a table its cloth, forty works their hardware.
//
// Pure: it takes a project and returns strings and lists, so node tests pin
// it. The hanging guide stays its own file; this is the one that goes in the
// van, and it says where the hanging guide fits.
import { FURNITURE, artShowPanel, boothPanels, boothPedestals, escapeHTML as e, furnitureKind, isArtShow, isShown, lightBarSpec, lightVisible, panelCount, wallKeys, wallSpec } from "./model.js";

// What stands in the booth. A piece someone hid is out of it: not drawn on the
// plan, not packed, not numbered — the way a deleted one would be, except
// that it is one click from back in the app.
const panelsIn = (p) => boothPanels(p).filter(isShown);
const piecesIn = (p) => boothPedestals(p).filter(isShown);
import { lightBarFixtures } from "./lightbar.js";
import { formatLength, footprint } from "./measure.js";

// The work in this booth, in hanging order: wall by wall, left to right.
// Signs and wall labels are not stock, and a row's other booths are not ours.
// Work on a switched-off perimeter wall or a hidden free-standing one is out
// of the picture, so it is out of the inventory too: what the list counts is
// what the booth shows.
const onShownWall = (p, a) => {
  const spec = wallSpec(p, a.wall);
  return !!spec && spec.enabled !== false;
};
export function inventory(p) {
  const order = wallKeys(p);
  return p.art
    .filter((a) => !a.booth && (a.kind || "art") === "art" && onShownWall(p, a))
    .slice()
    .sort((a, b) => order.indexOf(a.wall) - order.indexOf(b.wall) || (a.face === "outside") - (b.face === "outside") || a.x - b.x);
}

/**
 * A price as typed — "$450", "450", "1,200.00", "£80" — as a number, or null
 * when it is not one ("NFS", "on request"). Only used for the total.
 */
export function priceValue(price) {
  if (typeof price !== "string") return null;
  const m = price.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** The sum of every price that is a number, and how many were not. */
export function priceTotal(works) {
  let total = 0, priced = 0, unpriced = 0;
  for (const a of works) {
    const v = priceValue(a.price);
    if (v === null) unpriced++;
    else (total += v), priced++;
  }
  return { total, priced, unpriced };
}

/**
 * The packing and load-in list, grouped. Each item is `{ qty, text }`; a qty
 * of null is a single thing to bring. Everything is derived from the booth:
 * nothing is listed that this booth does not have, and nothing it has is
 * left off.
 */
export function checklist(p) {
  const b = p.booth, groups = [];
  const structure = [];
  if (isArtShow(p)) {
    const panels = ["back", "left", "right"].reduce((n, w) => n + (b.walls[w]?.enabled === false ? 0 : panelCount(p, w)), 0);
    const module = artShowPanel(b);
    if (panels) structure.push({ qty: panels, text: `Display panels, ${module.width}″ × ${module.height}″` });
    const bar = lightBarSpec(b);
    if (bar.on) structure.push({ qty: lightBarFixtures(p).length, text: `Light-bar heads (bar at ${bar.height}″)` });
  } else {
    if (b.tent) {
      structure.push({ qty: null, text: `Canopy tent, ${b.width / 12} × ${b.depth / 12} ft` });
      structure.push({ qty: 4, text: "Tent weights, 40 lb or more each — one per leg" });
    }
    for (const w of ["back", "left", "right"]) {
      const spec = b.walls[w];
      if (spec?.enabled !== false) structure.push({ qty: null, text: `${w[0].toUpperCase() + w.slice(1)} display wall, ${spec.width}″ × ${spec.height}″` });
    }
  }
  for (const panel of panelsIn(p)) structure.push({ qty: null, text: `Free-standing wall “${panel.name || "Wall"}”, ${panel.width}″ × ${panel.height}″` });
  if (structure.length) groups.push({ title: "Structure", items: structure });

  const pieces = piecesIn(p);
  if (pieces.length) {
    const counts = new Map();
    for (const ped of pieces) {
      const kind = furnitureKind(ped);
      const key = `${FURNITURE[kind].label}|${ped.width}×${ped.depth}×${ped.height}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const items = [...counts].map(([key, qty]) => {
      const [label, size] = key.split("|");
      return { qty, text: `${label}, ${size.replace(/×/g, " × ")}″` };
    });
    const tables = pieces.filter((x) => ["table6", "table8"].includes(furnitureKind(x))).length;
    if (tables) items.push({ qty: tables, text: "Floor-length tablecloths, and clips" });
    groups.push({ title: "Furniture", items });
  }

  const works = inventory(p);
  if (works.length)
    groups.push({
      title: "Artwork",
      items: [
        { qty: works.length, text: "Works — see the inventory" },
        { qty: works.length * 2, text: "Hanging hooks or hangers, two per work" },
        { qty: works.length, text: "Price tags or wall labels" },
        { qty: null, text: "Blankets, bubble wrap and corner protectors for transport" },
      ],
    });

  const lit = (p.lights || []).filter(lightVisible).length;
  const screens = pieces.filter((x) => furnitureKind(x) === "tv").length;
  const power = [];
  if (lit) power.push({ qty: lit, text: "Spotlights and clamps" });
  if (lit || screens || (isArtShow(p) && lightBarSpec(b).on)) power.push({ qty: null, text: "Extension cord, power strip and cable tape" });
  if (power.length) groups.push({ title: "Lighting and power", items: power });

  groups.push({
    title: "Every show",
    items: [
      "Tape measure and level",
      "Drill, screwdriver, Allen keys and spare screws",
      "Zip ties, gaffer tape, scissors",
      "Business cards and a guest book or mailing list",
      "Card reader, receipt book, bags and change",
      "This show pack and the hanging guide",
    ].map((text) => ({ qty: null, text })),
  });
  return groups;
}

/**
 * The floor plan as SVG, drawn from above with the entrance at the bottom:
 * the footprint, its walls, free-standing walls and every piece of furniture
 * numbered to match the list beside it, with the overall dimensions.
 */
export function floorPlanSVG(p) {
  const b = p.booth, W = b.width, D = b.depth, s = 3, pad = 40;
  const X = (x) => (x + W / 2) * s + pad, Y = (z) => (z + D / 2) * s + pad;
  const parts = [`<rect x="${X(-W / 2)}" y="${Y(-D / 2)}" width="${W * s}" height="${D * s}" fill="#f7f7f5" stroke="#999" stroke-dasharray="6 4"/>`];
  const wall = (x1, z1, x2, z2) => `<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="#202630" stroke-width="6" stroke-linecap="square"/>`;
  const back = b.walls.back, left = b.walls.left, right = b.walls.right;
  if (back?.enabled !== false) parts.push(wall(-back.width / 2, -D / 2, back.width / 2, -D / 2));
  if (left?.enabled !== false) parts.push(wall(-W / 2, -D / 2, -W / 2, -D / 2 + left.width));
  if (right?.enabled !== false) parts.push(wall(W / 2, -D / 2, W / 2, -D / 2 + right.width));
  for (const panel of panelsIn(p))
    parts.push(`<rect x="${X(panel.x) - (panel.width * s) / 2}" y="${Y(panel.z) - 4}" width="${panel.width * s}" height="8" fill="#202630" transform="rotate(${-panel.rotation} ${X(panel.x)} ${Y(panel.z)})"/>`);
  piecesIn(p).forEach((ped, i) => {
    const cx = X(ped.x), cy = Y(ped.z);
    parts.push(`<g transform="rotate(${-(ped.rotation || 0)} ${cx} ${cy})"><rect x="${cx - (ped.width * s) / 2}" y="${cy - (ped.depth * s) / 2}" width="${ped.width * s}" height="${ped.depth * s}" fill="#d6e5f7" stroke="#28619e"/></g><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="600">${i + 1}</text>`);
  });
  // Overall dimensions, and the aisle.
  parts.push(`<text x="${X(0)}" y="${Y(D / 2) + 24}" text-anchor="middle" font-size="13">${e(formatLength(W))} wide · entrance / aisle ↓</text>`);
  parts.push(`<text x="${X(W / 2) + 14}" y="${Y(0)}" font-size="13" transform="rotate(90 ${X(W / 2) + 14} ${Y(0)})" text-anchor="middle">${e(formatLength(D))} deep</text>`);
  return `<svg viewBox="0 0 ${W * s + pad * 2 + 20} ${D * s + pad * 2 + 10}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Floor plan">${parts.join("")}</svg>`;
}

/** The whole pack, as a printable HTML page. */
export function showPack(p) {
  const works = inventory(p), money = priceTotal(works), pieces = piecesIn(p);
  const plan = `<section><h2>Floor plan</h2>${floorPlanSVG(p)}${pieces.length ? `<table><thead><tr><th>#</th><th>Piece</th><th>W × D × H</th><th>Clear to left / right / back wall</th><th>Turned</th></tr></thead><tbody>${pieces.map((ped, i) => {
    const { hx, hz } = footprint(ped);
    const clear = [ped.x - hx + p.booth.width / 2, p.booth.width / 2 - ped.x - hx, ped.z - hz + p.booth.depth / 2].map((n) => (n > 0 ? e(formatLength(n)) : "—"));
    return `<tr><td>${i + 1}</td><td>${e(ped.name || FURNITURE[furnitureKind(ped)].label)}</td><td>${ped.width} × ${ped.depth} × ${ped.height}″</td><td>${clear.join(" / ")}</td><td>${(ped.rotation || 0).toFixed(0)}°</td></tr>`;
  }).join("")}</tbody></table>` : `<p>Nothing stands on the floor yet.</p>`}</section>`;
  const list = `<section><h2>Inventory</h2>${works.length ? `<table><thead><tr><th>#</th><th>Title</th><th>Size (W × H in)</th><th>Medium</th><th>Wall</th><th>Price</th></tr></thead><tbody>${works.map((a, i) => `<tr><td>${i + 1}</td><td>${e(a.title)}</td><td>${a.w} × ${a.h}</td><td>${e(a.medium || "")}</td><td>${e(a.wall.replace(/^panel:.*/, "Free-standing wall"))}${a.face === "outside" ? " · outside" : ""}</td><td>${e(a.price || "")}</td></tr>`).join("")}</tbody></table><p><strong>${works.length} work${works.length === 1 ? "" : "s"}.</strong>${money.priced ? ` Listed total ${money.total.toLocaleString("en-US", { maximumFractionDigits: 2 })} across ${money.priced} priced work${money.priced === 1 ? "" : "s"}${money.unpriced ? `; ${money.unpriced} without a price` : ""}.` : " No prices entered — add them in the Artwork tool."}</p>` : `<p>No artwork hung yet.</p>`}</section>`;
  const pack = `<section><h2>Packing and load-in</h2>${checklist(p).map((g) => `<h3>${e(g.title)}</h3><ul class="check">${g.items.map((it) => `<li>☐ ${it.qty != null ? `<strong>${it.qty} ×</strong> ` : ""}${e(it.text)}</li>`).join("")}</ul>`).join("")}</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(p.name)} — Show pack</title><style>body{font:14px system-ui,sans-serif;margin:36px;color:#202630}h1{font-size:26px}h2{font-size:18px;margin-top:28px}h3{font-size:15px;margin:18px 0 6px}section{break-inside:avoid;page-break-after:always}svg{display:block;width:100%;max-height:520px;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:12px}td,th{text-align:left;padding:8px;border-bottom:1px solid #ccc}ul.check{list-style:none;padding:0;margin:0}ul.check li{padding:5px 0;border-bottom:1px dotted #ddd}@media print{body{margin:12mm}button{display:none}}@page{margin:10mm}</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${e(p.name)} · Show pack</h1><p>${e(formatLength(p.booth.width))} × ${e(formatLength(p.booth.depth))} ${isArtShow(p) ? "art-show booth" : p.booth.tent ? "canopy booth" : "booth"}. The floor plan is drawn from above with the entrance at the bottom; clearances are measured from what each piece covers. Wall-by-wall hanging positions are in the separate hanging guide.</p>${plan}${list}${pack}</body></html>`;
}
