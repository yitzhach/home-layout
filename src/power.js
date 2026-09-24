// The power and rentals sheet: what a show's service desk asks a booth for.
//
// Two things every exhibitor fills in before load-in, worked out from the
// booth instead of guessed: how much power it draws — so the right number of
// circuits is ordered — and what it needs rented — tables, chairs, carpet —
// so the order form is filled in once. Pure; the numbers are assumptions,
// said as such on the sheet, and every one is a typed value the exhibitor can
// correct on the printout.
import { boothPedestals, furnitureKind, isArtShow, isShown, lightBarSpec, lightVisible, escapeHTML as e } from "./model.js";
import { lightBarFixtures } from "./lightbar.js";

/**
 * Watts per fixture: LED track heads and bar heads are what booths use now,
 * and a screen is a 43″ LED set. These are typical, not measured — the sheet
 * prints them beside each line so they can be struck out.
 */
export const WATTS = { spot: 15, barHead: 12, screen: 120, outlet: 150 };
/** A 120 V, 15 A circuit, loaded to 80% as the electrical code has it. */
export const CIRCUIT_WATTS = 120 * 15 * 0.8;
export const VOLTS = 120;

/** Every load in the booth, as `{ label, count, watts }` lines. */
export function powerLines(p, { outlets = 1 } = {}) {
  const lines = [];
  const spots = (p.lights || []).filter(lightVisible).length;
  if (spots) lines.push({ label: "Spotlights · LED track heads", count: spots, watts: WATTS.spot });
  if (isArtShow(p) && lightBarSpec(p.booth).on) {
    const heads = lightBarFixtures(p).length;
    if (heads) lines.push({ label: "Light bar heads · LED", count: heads, watts: WATTS.barHead });
  }
  const screens = boothPedestals(p).filter(isShown).filter((x) => furnitureKind(x) === "tv").length;
  if (screens) lines.push({ label: "Screens", count: screens, watts: WATTS.screen });
  if (outlets > 0) lines.push({ label: "Outlets · phone, card reader, laptop", count: outlets, watts: WATTS.outlet });
  return lines;
}

/** Total watts, amps at 120 V, and circuits at 80% of 15 A. */
export function powerTotals(lines) {
  const watts = lines.reduce((sum, l) => sum + l.count * l.watts, 0);
  return { watts, amps: Math.round((watts / VOLTS) * 10) / 10, circuits: Math.max(watts > 0 ? 1 : 0, Math.ceil(watts / CIRCUIT_WATTS)) };
}

const RENTALS = {
  table6: "6′ table with skirting",
  table8: "8′ table with skirting",
  counter: "Counter",
  chair: "Chair",
  stool: "Stool",
  bin: "Print bin",
  gridwall: "Gridwall panel",
  banner: "Banner stand",
  tv: "Screen with stand",
  pedestal: "Pedestal",
  box: "Riser or platform",
};

/** What the booth would rent, by kind, plus carpet for its floor. */
export function rentalLines(p) {
  const counts = {};
  for (const ped of boothPedestals(p).filter(isShown)) {
    const kind = furnitureKind(ped);
    counts[kind] = (counts[kind] || 0) + 1;
  }
  const lines = Object.entries(counts).map(([kind, count]) => ({ label: RENTALS[kind] || kind, count, unit: "each" }));
  lines.push({ label: "Carpet", count: Math.round((p.booth.width * p.booth.depth) / 144), unit: "sq ft" });
  lines.push({ label: "Wastebasket", count: 1, unit: "each" });
  return lines;
}

/** The printable sheet: power, then rentals, with blanks for the prices. */
export function powerHTML(p, opts = {}) {
  const lines = powerLines(p, opts);
  const totals = powerTotals(lines);
  const rentals = rentalLines(p);
  const blank = '<td class="blank"></td>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(p.name)} — Power and rentals</title><style>body{font:13px system-ui,sans-serif;margin:28px;color:#1d232b;max-width:900px}h1{font-size:22px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}td.num,th.num{text-align:right}td.blank{border-bottom:1px solid #999;min-width:90px}.total td{font-weight:700;border-top:2px solid #1d232b}.note{color:#56606b;font-size:12px;line-height:1.5}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${e(p.name)} · Power and rentals</h1><p>Booth ${p.booth.width / 12}′ × ${p.booth.depth / 12}′. Worked out from the booth as planned; correct anything on the printout before you send it.</p><h2>Electrical</h2><table><thead><tr><th>Load</th><th class="num">Qty</th><th class="num">Watts each</th><th class="num">Watts</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${e(l.label)}</td><td class="num">${l.count}</td><td class="num">${l.watts}</td><td class="num">${l.count * l.watts}</td></tr>`).join("")}<tr><td>Other</td>${blank}${blank}${blank}</tr><tr class="total"><td>Total</td><td></td><td></td><td class="num">${totals.watts} W</td></tr></tbody></table><p><strong>${totals.amps} A at ${VOLTS} V · order ${totals.circuits} circuit${totals.circuits === 1 ? "" : "s"}</strong> of 120 V / 15 A.</p><p class="note">Watts are typical for LED fixtures (${WATTS.spot} W a track head, ${WATTS.barHead} W a bar head), ${WATTS.screen} W for a screen and ${WATTS.outlet} W for each general outlet — not measured. Circuits are loaded to 80% (${CIRCUIT_WATTS} W), the continuous-load rule. Check your own fixtures' labels and the show's electrical form.</p><h2>Rentals</h2><table><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>${rentals.map((r) => `<tr><td>${e(r.label)}</td><td class="num">${r.count}</td><td>${r.unit}</td>${blank}${blank}</tr>`).join("")}<tr><td>Other</td>${blank}<td></td>${blank}${blank}</tr></tbody></table><p class="note">Everything on the floor of the plan, by kind — strike out what you are bringing yourself. Carpet is the booth's floor area.</p></body></html>`;
}
