import * as T from "three";
export function signTexture(a) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = Math.max(128, Math.min(2048, Math.round(canvas.width * a.h / a.w)));
  const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#faf8f2"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#b4afa4"; ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W-28, H-28);
  const lines = a.kind === "sign"
    ? [a.artistName || "Artist name", a.city || "City, State", a.medium || "Medium"]
    : [a.title || "Artwork title", a.medium || "", a.price || ""];
  const margin = W * .07;
  lines.forEach((line, i) => {
    if (!line) return;
    let size = Math.min(W * (i ? .038 : .072), H * (i ? .17 : .26));
    ctx.font = (i ? "400 " : "600 ") + size + "px sans-serif";
    while (ctx.measureText(line).width > W - margin * 2 && size > 8) {
      size -= 1; ctx.font = (i ? "400 " : "600 ") + size + "px sans-serif";
    }
    ctx.fillStyle = i ? "#55534e" : "#252521";
    ctx.textAlign = a.kind === "sign" ? "center" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText(line, a.kind === "sign" ? W/2 : margin, H * [.30,.58,.79][i]);
  });
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
