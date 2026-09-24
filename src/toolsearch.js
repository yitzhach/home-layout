// Finding a tool by name. Asked for on the real machine as "a search box —
// you can search a tool name and it opens the tool or gives a list of
// options": seven inspector tabs, each long, is a lot of scrolling to find
// one slider whose tab you have forgotten.
//
// Pure: main.js collects the entries from what the inspector would draw (so
// the index is never a second list to keep in step with the panels) and this
// file only decides which of them a query means, in what order. Node tests
// pin it.

/** Lower case, accents off, punctuation to spaces: how both sides compare. */
export const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The entries a query matches, best first, at most `limit`.
 *
 * An entry is `{ label, where }`: what the control is called, and the tab and
 * section it sits in ("Lighting · Drop shadow"). Every word of the query has
 * to appear somewhere in the two, so "shadow angle" finds the dial and
 * "lighting brightness" finds the spotlight's slider rather than every
 * brightness there is. A word that starts a word of the label counts more
 * than one found in the middle of it, and the label counts more than where
 * it lives; shorter labels win a tie, because "Height" searched for is more
 * likely the wall's height than "Target height".
 */
export function rankTools(entries, query, limit = 12) {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  entries.forEach((entry, order) => {
    const label = fold(entry.label),
      where = fold(entry.where),
      labelWords = label.split(" ");
    let score = 0;
    for (const w of words) {
      if (label === w) score += 100;
      else if (labelWords.some((x) => x.startsWith(w))) score += label.startsWith(w) ? 40 : 30;
      else if (label.includes(w)) score += 15;
      else if (where.split(" ").some((x) => x.startsWith(w))) score += 8;
      else if (where.includes(w)) score += 4;
      else return;
    }
    if (label === words.join(" ")) score += 200;
    scored.push({ entry, score, len: label.length, order });
  });
  scored.sort((a, b) => b.score - a.score || a.len - b.len || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * One entry per distinct label and place. A panel says "Download project
 * backup" in Layout and in Export; both are listed, because both are real
 * places to find it, but the same label twice in one section is one entry.
 */
export function dedupe(entries) {
  const seen = new Set();
  return entries.filter((x) => {
    const key = fold(x.label) + "|" + fold(x.where);
    if (!fold(x.label) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
