// The hall planner: a whole show's floor, for the promoter selling it.
//
// Rows of booths with aisles between them, each booth numbered, each with an
// exhibitor, a status (open, held, sold) and a price, and a map of it to
// print or send. It is a plan of the show, not of one booth, so it lives
// beside the booth rather than inside it: the optional `p.hall` of a project,
// which every older backup simply does not have.
//
// Pure. Inches, like everything else; the map draws each row left to right,
// row 1 at the back of the hall and the entrance along the bottom edge.

export const STATUSES = {
  open: { label: "Open", color: "#e9eef3" },
  held: { label: "Held", color: "#ffe3a3" },
  sold: { label: "Sold", color: "#b9e4c3" },
};
export const HALL_LIMITS = {
  rows: [1, 40],
  perRow: [1, 60],
  boothWidth: [48, 480],
  boothDepth: [48, 480],
  aisle: [36, 480],
  start: [1, 9999],
  price: [0, 1000000],
};
export const MAX_HALL_BOOTHS = 1200;

/** A new plan: two back-to-back rows of eight 10 × 10s on 10′ aisles. */
export function newHall() {
  return { rows: 2, perRow: 8, boothWidth: 120, boothDepth: 120, aisle: 120, backToBack: true, start: 101, price: 0, booths: {} };
}

const inRange = (n, [lo, hi]) => Number.isFinite(n) && n >= lo && n <= hi;

/** Whether a stored plan is one this version can open. */
export function validHall(h) {
  if (h === undefined) return true;
  if (!h || typeof h !== "object") return false;
  for (const [k, range] of Object.entries(HALL_LIMITS)) if (!inRange(h[k], range)) return false;
  if (h.rows * h.perRow > MAX_HALL_BOOTHS) return false;
  if (typeof h.backToBack !== "boolean") return false;
  if (h.mine !== undefined && !Number.isInteger(h.mine)) return false;
  if (!h.booths || typeof h.booths !== "object" || Array.isArray(h.booths)) return false;
  const entries = Object.entries(h.booths);
  if (entries.length > MAX_HALL_BOOTHS) return false;
  for (const [number, b] of entries) {
    if (!/^\d{1,5}$/.test(number) || !b || typeof b !== "object") return false;
    if (b.name !== undefined && (typeof b.name !== "string" || b.name.length > 120)) return false;
    if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > 300)) return false;
    if (b.status !== undefined && !STATUSES[b.status]) return false;
    if (b.price !== undefined && !inRange(b.price, HALL_LIMITS.price)) return false;
  }
  return true;
}

/**
 * Every booth of the plan, positioned: `{ number, row, col, x, y, w, d,
 * faces }` with x across the hall and y from the back of the hall toward the
 * entrance, both from the plan's top-left corner. Back-to-back rows come in pairs that share a
 * back line, facing opposite aisles; otherwise every row faces the aisle in
 * front of it. Numbers run along each row, row by row, from `start`.
 */
export function hallLayout(h) {
  const out = [];
  let y = h.aisle;
  for (let row = 0; row < h.rows; row++) {
    // In a back-to-back pair the second row faces the other way and there is
    // no aisle between the two.
    const second = h.backToBack && row % 2 === 1;
    if (row > 0 && !second) y += h.aisle;
    for (let col = 0; col < h.perRow; col++)
      out.push({
        number: h.start + row * h.perRow + col,
        row: row + 1,
        col: col + 1,
        x: h.aisle + col * h.boothWidth,
        y,
        w: h.boothWidth,
        d: h.boothDepth,
        faces: second ? "back" : "front",
      });
    y += h.boothDepth;
  }
  return out;
}

/** The size of the whole floor the plan takes, aisles round the outside included. */
export function hallSize(h) {
  const layout = hallLayout(h);
  const bottom = Math.max(...layout.map((b) => b.y + b.d));
  return { width: h.aisle * 2 + h.perRow * h.boothWidth, depth: bottom + h.aisle };
}

/** A booth's record with the defaults filled in. */
export const boothOf = (h, number) => ({ status: "open", name: "", note: "", price: h.price, ...(h.booths[number] || {}) });

/** Counts, square footage and money, for the panel and the printed map. */
export function hallTotals(h) {
  const layout = hallLayout(h);
  const t = { booths: layout.length, open: 0, held: 0, sold: 0, soldValue: 0, heldValue: 0, sqft: 0 };
  for (const b of layout) {
    const rec = boothOf(h, b.number);
    t[rec.status] += 1;
    if (rec.status === "sold") t.soldValue += rec.price || 0;
    if (rec.status === "held") t.heldValue += rec.price || 0;
    t.sqft += (b.w * b.d) / 144;
  }
  return t;
}

/** The exhibitor list, as CSV: one line per booth, quoted where it has to be. */
export function hallCSV(h) {
  const q = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Booth", "Row", "Size (ft)", "Status", "Exhibitor", "Price", "Note"].join(",")];
  for (const b of hallLayout(h)) {
    const rec = boothOf(h, b.number);
    lines.push([b.number, b.row, `${b.w / 12} x ${b.d / 12}`, STATUSES[rec.status].label, rec.name, rec.price || "", rec.note].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

/**
 * The map as an SVG in real inches (viewBox), for the panel and the print:
 * each booth coloured by status with its number and exhibitor, aisles
 * between, the entrance marked, and the plan's own booth — `h.mine` —
 * outlined.
 */
export function hallSVG(h, { selected = null, interactive = false } = {}) {
  const layout = hallLayout(h);
  const size = hallSize(h);
  const t = Math.max(8, Math.min(h.boothWidth, h.boothDepth) * 0.16);
  const cells = layout
    .map((b) => {
      const rec = boothOf(h, b.number);
      const mine = h.mine === b.number;
      const chosen = selected === b.number;
      return `<g${interactive ? ` data-hall-booth="${b.number}" role="button" tabindex="0" aria-label="Booth ${b.number}${rec.name ? ", " + esc(rec.name) : ""}, ${STATUSES[rec.status].label}"` : ""}><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.d}" fill="${STATUSES[rec.status].color}" stroke="${chosen ? "#2f7de1" : mine ? "#ff5fa2" : "#6b7580"}" stroke-width="${chosen || mine ? t * 0.35 : t * 0.1}"/><text x="${b.x + b.w / 2}" y="${b.y + b.d * 0.42}" font-size="${t * 1.2}" font-weight="700" text-anchor="middle" fill="#1d232b">${b.number}</text>${rec.name ? `<text x="${b.x + b.w / 2}" y="${b.y + b.d * 0.68}" font-size="${t * 0.8}" text-anchor="middle" fill="#1d232b">${esc(rec.name.length > 18 ? rec.name.slice(0, 17) + "…" : rec.name)}</text>` : ""}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.depth + t * 3}" class="hall-map" preserveAspectRatio="xMidYMin meet"><rect x="0" y="0" width="${size.width}" height="${size.depth}" fill="#fbfbfa" stroke="#9aa3ad" stroke-width="${t * 0.15}"/>${cells}<text x="${size.width / 2}" y="${size.depth + t * 2}" font-size="${t}" text-anchor="middle" fill="#56606b">Entrance</text></svg>`;
}

/** A printable page: the map, the legend, the totals and the exhibitor list. */
export function hallHTML(h, name = "Show") {
  const totals = hallTotals(h);
  const rows = hallLayout(h)
    .map((b) => {
      const rec = boothOf(h, b.number);
      return `<tr><td>${b.number}</td><td>${b.row}</td><td>${b.w / 12}′ × ${b.d / 12}′</td><td><span class="dot" style="background:${STATUSES[rec.status].color}"></span>${STATUSES[rec.status].label}</td><td>${esc(rec.name)}</td><td>${rec.price ? money(rec.price) : ""}</td><td>${esc(rec.note)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} — Hall map</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#1d232b}h1{font-size:22px}svg{width:100%;max-height:70vh;display:block;margin:12px 0}.legend span{display:inline-flex;align-items:center;gap:6px;margin-right:16px}.dot{display:inline-block;width:12px;height:12px;border:1px solid #6b7580;border-radius:2px;margin-right:6px;vertical-align:middle}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd}.totals{margin:8px 0 18px}@media print{button{display:none}}@page{size:letter landscape;margin:10mm}</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${esc(name)} · Hall map</h1><p class="legend">${Object.values(STATUSES).map((s) => `<span><span class="dot" style="background:${s.color}"></span>${s.label}</span>`).join("")}</p>${hallSVG(h)}<p class="totals"><strong>${totals.booths}</strong> booths · ${totals.sold} sold · ${totals.held} held · ${totals.open} open · ${Math.round(totals.sqft).toLocaleString("en-US")} sq ft of booth${totals.soldValue ? ` · sold ${money(totals.soldValue)}` : ""}${totals.heldValue ? ` · held ${money(totals.heldValue)}` : ""}</p><table><thead><tr><th>Booth</th><th>Row</th><th>Size</th><th>Status</th><th>Exhibitor</th><th>Price</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
