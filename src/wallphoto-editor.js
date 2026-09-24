// The four-corner editor for a wall photo (phase 3): the photo in a dialog
// with a handle on each corner of the wall, dragged by mouse or finger, and
// beside it the straightened result as it will lie on the wall, redrawn as
// the handles move. Manual first — it works offline — with an optional
// "Find the corners" button that asks the AI Worker and moves the handles to
// what it found, for the user to check.
//
// It owns no state beyond the dialog's lifetime: it is handed the photo and
// the starting corners and calls `done(corners)` or nothing.
import { goodCorners, straightSize, straighten } from "./wallphoto.js";

const HANDLE = 14;
const LABELS = ["Top left", "Top right", "Bottom right", "Bottom left"];

/**
 * Open the editor in `dialog` (a <dialog>) with its content in `host`.
 * `findCorners`, when given, is `async () => corners | { error }`.
 */
export async function editCorners({ dialog, host, dataUrl, corners, width, height, title, findCorners, toast, done }) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  let q = corners.map((c) => [...c]);
  host.innerHTML = `<div class="wall-photo-editor"><h2>${title}</h2><p class="muted">Drag the four handles onto the corners of the wall — where it meets the ceiling, the floor and the walls beside it. The right-hand picture is how it will lie on the wall, ${width}″ × ${height}″.</p><div class="wall-photo-panes"><canvas class="wall-photo-source" aria-label="Photo with the wall's four corners"></canvas><canvas class="wall-photo-preview" aria-label="Straightened wall"></canvas></div><p class="wall-photo-warning" role="alert" hidden>The corners cross — drag them back round the wall in order.</p><div class="button-row">${findCorners ? `<button data-wp="find">Find the corners · AI</button>` : ""}<button data-wp="reset">Reset</button><button data-wp="cancel">Cancel</button><button class="primary" data-wp="done">Use this photo</button></div></div>`;
  const canvas = host.querySelector(".wall-photo-source"),
    preview = host.querySelector(".wall-photo-preview"),
    warning = host.querySelector(".wall-photo-warning"),
    ctx = canvas.getContext("2d");
  // The source at a working size: the dialog shows it no bigger than this,
  // and the preview straightens from it.
  const s = Math.min(1, 720 / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * s);
  canvas.height = Math.round(img.height * s);
  const work = document.createElement("canvas");
  work.width = canvas.width;
  work.height = canvas.height;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.drawImage(img, 0, 0, work.width, work.height);
  const pixels = wctx.getImageData(0, 0, work.width, work.height).data;

  const draw = () => {
    ctx.drawImage(work, 0, 0);
    const pts = q.map(([x, y]) => [x * canvas.width, y * canvas.height]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1e90ff";
    ctx.fillStyle = "rgba(30,144,255,0.12)";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    pts.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, HANDLE / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1e90ff";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(i + 1), x + 9, y - 9);
    });
    const ok = goodCorners(q);
    warning.hidden = ok;
    host.querySelector('[data-wp="done"]').disabled = !ok;
    if (!ok) return;
    const size = straightSize({ corners: q, width, height }, work.width, work.height, 360);
    preview.width = size.width;
    preview.height = size.height;
    preview.getContext("2d").putImageData(new ImageData(straighten(pixels, work.width, work.height, q, size.width, size.height), size.width, size.height), 0, 0);
  };

  // Dragging: the nearest handle within reach follows the pointer.
  let drag = -1;
  const at = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))];
  };
  canvas.addEventListener("pointerdown", (ev) => {
    const [x, y] = at(ev),
      r = canvas.getBoundingClientRect();
    let best = -1,
      bestD = Infinity;
    q.forEach(([cx, cy], i) => {
      const d = Math.hypot((cx - x) * r.width, (cy - y) * r.height);
      if (d < bestD) (bestD = d), (best = i);
    });
    if (bestD > 40) return;
    drag = best;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (drag < 0) return;
    q[drag] = at(ev);
    draw();
  });
  const end = () => (drag = -1);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  host.querySelector('[data-wp="reset"]').onclick = () => {
    q = corners.map((c) => [...c]);
    draw();
  };
  host.querySelector('[data-wp="cancel"]').onclick = () => dialog.close();
  host.querySelector('[data-wp="done"]').onclick = () => {
    if (!goodCorners(q)) return;
    dialog.close();
    done(q.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]));
  };
  const find = host.querySelector('[data-wp="find"]');
  if (find)
    find.onclick = async () => {
      find.disabled = true;
      toast("Looking for the wall's corners…");
      const r = await findCorners();
      find.disabled = false;
      if (r?.error) return toast(r.error, true);
      if (!r || !goodCorners(r)) return toast("No wall's corners could be found in this photo — drag them by hand.", true);
      q = r.map((c) => [...c]);
      draw();
      toast("Corners found — check them, then use the photo.");
    };
  canvas.title = LABELS.join(", ");
  draw();
  if (!dialog.open) dialog.showModal();
}
