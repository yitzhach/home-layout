import { edgeColorOf, escapeHTML as e, boothPedestals, isShown, boundWarning, findPanel, hallSpec, isArtShow, lightBarSpec, wallKeys, wallLabel, wallSpec } from "./model.js";
import { BAR_INSET, lightBarFixtures } from "./lightbar.js";
export function hangingGuide(p) {
  let content = "";
  for (const key of wallKeys(p)) for (const face of ["inside", "outside"]) {
    const w = wallSpec(p, key);
    if (!w) continue;
    const scale = 6,
      // Only what hangs in this booth. A row's other booths are there to
      // judge the aisle against; a build sheet that listed their walls as
      // this one's would send somebody to hang a work in a stranger's stand.
      arts = p.art.filter(
        (a) => !a.booth && a.wall === key && (a.face || "inside") === face,
      );
    if (face === "outside" && !arts.length) continue;
    const panel = findPanel(p, key);
    // A free-standing panel has no fixed side of the booth to stand on, so
    // where it stands is part of the measurement, not something the builder
    // can read off the footprint.
    const standing = panel
      ? ` · standing ${panel.x.toFixed(1)}″ right / ${panel.z.toFixed(1)}″ forward of centre, turned ${panel.rotation.toFixed(0)}°`
      : "";
    const faceName = panel ? (face === "outside" ? "back" : "front") : face;
    content += `<section><h2>${e(wallLabel(p, key))} · ${faceName} · ${w.width} × ${w.height} in${w.enabled ? "" : " (hidden)"}${standing}</h2><svg viewBox="-20 -24 ${w.width * scale + 40} ${w.height * scale + 70}" xmlns="http://www.w3.org/2000/svg"><rect width="${w.width * scale}" height="${w.height * scale}" fill="#f3f3f3" stroke="#555"/>${arts.map((a, i) => `<rect x="${a.x * scale}" y="${(w.height - a.y - a.h) * scale}" width="${a.w * scale}" height="${a.h * scale}" fill="#d6e5f7" stroke="#28619e"/><text x="${(a.x + a.w / 2) * scale}" y="${(w.height - a.y - a.h / 2) * scale}" text-anchor="middle" font-size="16">${i + 1}</text>`).join("")}<text x="0" y="${w.height * scale + 28}" font-size="14">Origin (0, 0) · bottom left, facing the wall from the ${faceName}</text></svg><table><thead><tr><th># / Artwork</th><th>W × H</th><th>Left edge</th><th>Bottom edge</th><th>Top edge</th><th>Thickness / gap</th><th>Edge</th></tr></thead><tbody>${arts.map((a, i) => `<tr><td>${i + 1}. ${e(a.title)}${boundWarning(p, a) ? "<br><strong>Outside wall / hidden</strong>" : ""}</td><td>${a.w} × ${a.h}</td><td>${a.x.toFixed(2)}</td><td>${a.y.toFixed(2)}</td><td>${(a.y + a.h).toFixed(2)}</td><td>${a.thickness} / ${a.offset}</td><td>${e(edgeColorOf(p.booth, a))}</td></tr>`).join("")}</tbody></table></section>`;
  }
  // Everything that stands on the floor rather than hanging on a wall. A
  // builder setting a booth up needs these measurements as much as the
  // artwork's, and they are nowhere else in the guide.
  // A hidden piece is not in the booth, so it is not on the build sheet.
  const pedestals = boothPedestals(p).filter(isShown);
  const bar = lightBarSpec(p.booth), fixtures = lightBarFixtures(p);
  if (pedestals.length || (isArtShow(p) && bar.on))
    content += `<section><h2>Booth fixtures</h2>${pedestals.length ? `<h3>Pedestals</h3><table><thead><tr><th>Pedestal</th><th>H × W × D</th><th>X from centre</th><th>Z from centre</th><th>Turned</th></tr></thead><tbody>${pedestals.map((ped, i) => `<tr><td>${i + 1}. ${e(ped.name || "Pedestal " + (i + 1))}</td><td>${ped.height} × ${ped.width} × ${ped.depth}</td><td>${ped.x.toFixed(1)}″</td><td>${ped.z.toFixed(1)}″</td><td>${ped.rotation.toFixed(0)}°</td></tr>`).join("")}</tbody></table><p>X is inches right of the centre of the floor, Z is inches toward the entrance. Tops are solid.</p>` : ""}${isArtShow(p) && bar.on ? `<h3>Light bar</h3><p>${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"} on a bar ${bar.height}″ above the floor, ${BAR_INSET}″ inside the front edge, at ${bar.kelvin}K.</p><table><thead><tr><th>#</th><th>Wall</th><th>X on the bar</th><th>Aimed at (X, height, Z)</th></tr></thead><tbody>${fixtures.map((f, i) => `<tr><td>${i + 1}</td><td>${f.wall}</td><td>${f.x.toFixed(1)}″</td><td>${f.tx.toFixed(1)}″, ${f.ty.toFixed(1)}″, ${f.tz.toFixed(1)}″</td></tr>`).join("")}</tbody></table>` : ""}${isArtShow(p) && hallSpec(p.booth).on ? `<p>Standing in an exhibition hall with ${(hallSpec(p.booth).ceiling / 12).toFixed(0)} ft ceilings.</p>` : ""}</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(p.name)} — Hanging guide</title><style>body{font:14px system-ui,sans-serif;margin:36px;color:#202630}h1{font-size:26px}h2{font-size:18px}section{break-inside:avoid;page-break-after:always}svg{display:block;width:100%;max-height:440px;margin:20px 0}table{width:100%;border-collapse:collapse;font-size:12px}td,th{text-align:left;padding:9px;border-bottom:1px solid #ccc}p{line-height:1.5}@media print{body{margin:12mm}button{display:none}}@page{margin:10mm}</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${e(p.name)} · Hanging guide</h1><p>Footprint: ${p.booth.width / 12} × ${p.booth.depth / 12} ft. All panel measurements below are inches.<br>Left and bottom edges are measured on the wall from its bottom-left corner, viewed facing the listed inside or outside face. Top edge is height above floor. These are panel positions, not hook positions; account for your hanging hardware separately. Photo overlays are not measured and are excluded.${p.art.some((a) => a.booth) ? " Artwork hung in the other booths of the row is excluded too: this guide is the build sheet for this booth." : ""}</p>${content}</body></html>`;
}
