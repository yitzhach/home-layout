// Elevations to scale: the drawings a carpenter or an installer works from.
//
// One printable HTML page per booth: a floor plan and one elevation per wall
// face that carries work, each drawn at a real architectural scale — ½″ = 1′
// and so on — with its dimension chain, so a ruler held against the printout
// reads the booth. The hanging guide is the list of numbers; this is the
// picture of them, measured.
//
// Pure: it takes the project and returns a string. SVGs are sized in physical
// inches (`width="6in"`) with a viewBox in real inches, which is what makes a
// print at 100% come out to scale.
import { escapeHTML as e, boothPanels, boothPedestals, isShown, wallKeys, wallLabel, wallSpec } from "./model.js";
import { formatLength } from "./measure.js";
import { checkClearance, corners } from "./clearance.js";

/** Architectural scales, by how many real inches one inch of paper stands for. */
export const SCALES = [
  { ratio: 12, label: "1″ = 1′-0″" },
  { ratio: 16, label: "¾″ = 1′-0″" },
  { ratio: 24, label: "½″ = 1′-0″" },
  { ratio: 48, label: "¼″ = 1′-0″" },
];
/** How wide a drawing may be on paper: US Letter landscape inside margins. */
export const SHEET_WIDTH = 9.5;
export const SHEET_HEIGHT = 6;

/**
 * The largest standard scale at which a drawing `width` × `height` real
 * inches fits the sheet. Largest, because a bigger drawing is easier to read
 * and to measure off.
 */
export function fitScale(width, height, sheet = { width: SHEET_WIDTH, height: SHEET_HEIGHT }) {
  return SCALES.find((s) => width / s.ratio <= sheet.width && height / s.ratio <= sheet.height) || SCALES[SCALES.length - 1];
}

/** A length for a label: feet and inches, without the plain-inch echo. */
const len = (inches) => formatLength(inches).split(" · ")[0];
const num = (n) => Number(n.toFixed(3));

/**
 * A horizontal dimension line from x0 to x1 at height y, with ticks and its
 * length written above it. Real inches; `t` is the text size.
 */
function dimH(x0, x1, y, t) {
  if (x1 - x0 < 0.25) return "";
  const mid = (x0 + x1) / 2;
  return `<line x1="${num(x0)}" y1="${num(y)}" x2="${num(x1)}" y2="${num(y)}" class="dim"/><line x1="${num(x0)}" y1="${num(y - t / 2)}" x2="${num(x0)}" y2="${num(y + t / 2)}" class="dim"/><line x1="${num(x1)}" y1="${num(y - t / 2)}" x2="${num(x1)}" y2="${num(y + t / 2)}" class="dim"/><text x="${num(mid)}" y="${num(y - t * 0.35)}" font-size="${num(t)}" text-anchor="middle">${e(len(x1 - x0))}</text>`;
}
function dimV(x, y0, y1, t) {
  if (y1 - y0 < 0.25) return "";
  const mid = (y0 + y1) / 2;
  return `<line x1="${num(x)}" y1="${num(y0)}" x2="${num(x)}" y2="${num(y1)}" class="dim"/><line x1="${num(x - t / 2)}" y1="${num(y0)}" x2="${num(x + t / 2)}" y2="${num(y0)}" class="dim"/><line x1="${num(x - t / 2)}" y1="${num(y1)}" x2="${num(x + t / 2)}" y2="${num(y1)}" class="dim"/><text x="${num(x + t * 0.5)}" y="${num(mid)}" font-size="${num(t)}" dominant-baseline="middle">${e(len(y1 - y0))}</text>`;
}
/** A one-foot scale bar, so a photocopied drawing can still be measured. */
const scaleBar = (x, y, t) =>
  `<rect x="${num(x)}" y="${num(y)}" width="6" height="${num(t / 2)}" class="bar-a"/><rect x="${num(x + 6)}" y="${num(y)}" width="6" height="${num(t / 2)}" class="bar-b"/><text x="${num(x)}" y="${num(y + t * 1.6)}" font-size="${num(t)}">0</text><text x="${num(x + 12)}" y="${num(y + t * 1.6)}" font-size="${num(t)}" text-anchor="end">1′</text>`;

/**
 * One wall face, to scale: the wall, each work numbered, the chain of gaps
 * along the floor line, each work's height off the floor, and the wall's
 * own width and height.
 */
export function elevation(p, key, face) {
  const w = wallSpec(p, key);
  if (!w) return null;
  const works = p.art
    .filter((a) => !a.booth && a.wall === key && (a.face || "inside") === face)
    .sort((a, b) => a.x - b.x);
  const scale = fitScale(w.width + 30, w.height + 30);
  const t = Math.max(2, scale.ratio * 0.09); // about 6.5 pt on paper
  const pad = t * 4;
  const vbW = w.width + pad * 2 + t * 6,
    vbH = w.height + pad * 3;
  // SVG y runs down; the wall's y runs up from the floor.
  const Y = (y) => w.height - y;
  let body = `<rect x="0" y="0" width="${num(w.width)}" height="${num(w.height)}" class="wall"/><line x1="${num(-pad / 2)}" y1="${num(w.height)}" x2="${num(w.width + pad / 2)}" y2="${num(w.height)}" class="floor"/>`;
  works.forEach((a, i) => {
    body += `<rect x="${num(a.x)}" y="${num(Y(a.y + a.h))}" width="${num(a.w)}" height="${num(a.h)}" class="work"/><text x="${num(a.x + a.w / 2)}" y="${num(Y(a.y + a.h / 2))}" font-size="${num(t * 1.4)}" text-anchor="middle" dominant-baseline="middle" class="num">${i + 1}</text>`;
    // Centre height, the number a hanger actually sets a level to.
    body += `<text x="${num(a.x + a.w / 2)}" y="${num(Y(a.y) + t * 1.3)}" font-size="${num(t * 0.85)}" text-anchor="middle" class="cl">CL ${e(len(a.y + a.h / 2))}</text>`;
  });
  // The chain along the floor: wall edge, each work, wall edge.
  const edges = [0, ...works.flatMap((a) => [a.x, a.x + a.w]), w.width];
  const chainY = w.height + t * 3.2;
  for (let i = 0; i < edges.length - 1; i++) body += dimH(edges[i], edges[i + 1], chainY, t);
  body += dimH(0, w.width, -t * 1.6, t);
  body += dimV(w.width + t * 2, 0, w.height, t);
  body += scaleBar(0, w.height + t * 5.5, t);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(vbW / scale.ratio)}in" height="${num(vbH / scale.ratio)}in" viewBox="${num(-pad)} ${num(-pad)} ${num(vbW)} ${num(vbH)}">${body}</svg>`;
  const rows = works
    .map((a, i) => `<tr><td>${i + 1}</td><td>${e(a.title)}</td><td>${e(len(a.w))} × ${e(len(a.h))}</td><td>${e(len(a.x))}</td><td>${e(len(a.y))}</td><td>${e(len(a.y + a.h / 2))}</td></tr>`)
    .join("");
  const faceName = key.startsWith("panel:") ? (face === "outside" ? "back" : "front") : face;
  return {
    title: `${wallLabel(p, key)} · ${faceName}`,
    scale,
    html: `<section class="sheet"><h2>${e(wallLabel(p, key))} · ${e(faceName)} <small>${e(scale.label)} · ${e(len(w.width))} × ${e(len(w.height))}</small></h2>${svg}${works.length ? `<table><thead><tr><th>#</th><th>Work</th><th>W × H</th><th>From left</th><th>Off floor</th><th>Centre line</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">Nothing hangs on this face.</p>`}</section>`,
  };
}

/** The floor plan, to scale: footprint, walls, floor pieces and tight spots. */
export function planSheet(p) {
  const W = p.booth.width,
    D = p.booth.depth;
  const scale = fitScale(W + 60, D + 60);
  const t = Math.max(2, scale.ratio * 0.09);
  const pad = t * 6;
  const poly = (pts, cls) => `<polygon points="${pts.map(([x, z]) => `${num(x)},${num(z)}`).join(" ")}" class="${cls}"/>`;
  let body = `<rect x="${num(-W / 2)}" y="${num(-D / 2)}" width="${num(W)}" height="${num(D)}" class="footprint"/>`;
  for (const key of ["back", "left", "right"]) {
    const w = wallSpec(p, key);
    if (!w?.enabled) continue;
    if (key === "back") body += `<line x1="${num(-W / 2)}" y1="${num(-D / 2)}" x2="${num(-W / 2 + w.width)}" y2="${num(-D / 2)}" class="wall-line"/>`;
    if (key === "left") body += `<line x1="${num(-W / 2)}" y1="${num(D / 2)}" x2="${num(-W / 2)}" y2="${num(D / 2 - w.width)}" class="wall-line"/>`;
    if (key === "right") body += `<line x1="${num(W / 2)}" y1="${num(-D / 2)}" x2="${num(W / 2)}" y2="${num(-D / 2 + w.width)}" class="wall-line"/>`;
  }
  const labels = [];
  boothPanels(p).filter(isShown).forEach((panel, i) => {
    body += poly(corners(panel.x, panel.z, panel.width, 3, panel.rotation || 0), "panel");
    labels.push([panel.x, panel.z - t * 1.2, panel.name || "Panel " + (i + 1)]);
  });
  boothPedestals(p).filter(isShown).forEach((ped, i) => {
    body += poly(corners(ped.x, ped.z, ped.width, ped.depth, ped.rotation || 0), "piece");
    labels.push([ped.x, ped.z, ped.name || "Pedestal " + (i + 1)]);
  });
  for (const issue of checkClearance(p).filter((x) => x.kind === "tight"))
    body += `<line x1="${num(issue.from[0])}" y1="${num(issue.from[1])}" x2="${num(issue.to[0])}" y2="${num(issue.to[1])}" class="tight"/><text x="${num((issue.from[0] + issue.to[0]) / 2)}" y="${num((issue.from[1] + issue.to[1]) / 2 - t * 0.4)}" font-size="${num(t)}" text-anchor="middle" class="tight-text">${e(len(issue.inches))}</text>`;
  for (const [x, z, text] of labels) body += `<text x="${num(x)}" y="${num(z)}" font-size="${num(t)}" text-anchor="middle" dominant-baseline="middle">${e(text)}</text>`;
  body += dimH(-W / 2, W / 2, D / 2 + t * 3, t);
  body += dimV(W / 2 + t * 2, -D / 2, D / 2, t);
  body += `<text x="0" y="${num(D / 2 + t * 5.5)}" font-size="${num(t)}" text-anchor="middle">Entrance · aisle</text>`;
  body += scaleBar(-W / 2, D / 2 + t * 7, t);
  const vbW = W + pad * 2 + t * 8,
    vbH = D + pad * 2 + t * 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(vbW / scale.ratio)}in" height="${num(vbH / scale.ratio)}in" viewBox="${num(-W / 2 - pad)} ${num(-D / 2 - pad)} ${num(vbW)} ${num(vbH)}">${body}</svg>`;
  return { scale, html: `<section class="sheet"><h2>Floor plan <small>${e(scale.label)} · ${e(len(W))} × ${e(len(D))}</small></h2>${svg}<p class="muted">Seen from above, entrance at the bottom. Dashed red lines are gaps narrower than 36″.</p></section>` };
}

/** The whole set: the plan, then every wall face with work on it, inside faces always. */
export function elevationsHTML(p) {
  const sheets = [planSheet(p).html];
  for (const key of wallKeys(p))
    for (const face of ["inside", "outside"]) {
      const hasWork = p.art.some((a) => !a.booth && a.wall === key && (a.face || "inside") === face);
      const w = wallSpec(p, key);
      if (!w || (!hasWork && (face === "outside" || !w.enabled))) continue;
      const sheet = elevation(p, key, face);
      if (sheet) sheets.push(sheet.html);
    }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(p.name)} — Elevations</title><style>
body{font:13px system-ui,sans-serif;margin:24px;color:#1d232b}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0 0 10px}h2 small{font-weight:400;color:#56606b;margin-left:8px}
.sheet{page-break-after:always;break-after:page;margin:0 0 36px}
svg{display:block;margin:6px 0 12px;overflow:visible}
svg text{font-family:system-ui,sans-serif;fill:#1d232b}
.wall{fill:#f4f4f2;stroke:#333;stroke-width:.6}.floor{stroke:#333;stroke-width:1.2}
.work{fill:#dce8f6;stroke:#28619e;stroke-width:.5}.num{font-weight:700;fill:#28619e}.cl{fill:#56606b}
.dim{stroke:#56606b;stroke-width:.35}
.footprint{fill:#fafaf8;stroke:#999;stroke-width:.5;stroke-dasharray:3 2}.wall-line{stroke:#222;stroke-width:3}
.piece{fill:#e7e1d6;stroke:#6b5a3a;stroke-width:.6}.panel{fill:#555;stroke:#222;stroke-width:.4}
.tight{stroke:#d33;stroke-width:1;stroke-dasharray:2 1.5}.tight-text{fill:#d33;font-weight:700}
.bar-a{fill:#1d232b}.bar-b{fill:#fff;stroke:#1d232b;stroke-width:.3}
table{border-collapse:collapse;font-size:12px;min-width:60%}td,th{text-align:left;padding:5px 10px 5px 0;border-bottom:1px solid #ddd}
.muted{color:#56606b}.note{background:#fff7dd;border:1px solid #e6cf7a;padding:8px 12px;border-radius:6px;display:inline-block}
@media print{body{margin:0}button,.note{display:none}}@page{size:letter landscape;margin:12mm}
</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${e(p.name)} · Elevations to scale</h1><p class="note">Print at 100% (“Actual size”), landscape. Each drawing names its scale; the 1′ bar under it checks the print.</p>${sheets.join("")}</body></html>`;
}
