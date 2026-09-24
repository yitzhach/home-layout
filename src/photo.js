import { homography, convex } from "./model.js";
export class PhotoEditor {
  constructor(host, select, change, start) {
    this.host = host;
    this.select = select;
    this.change = change;
    this.start = start;
    this.cache = new Map();
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "Booth photo perspective editor");
    host.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    new ResizeObserver(() => this.draw()).observe(host);
    this.bind();
  }
  async image(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const promise = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Image unavailable"));
      i.src = this.p.assets[id].data;
    });
    this.cache.set(id, promise);
    return promise;
  }
  update(p, selected) {
    this.p = p;
    this.selected = selected;
    this.draw();
  }
  async draw() {
    if (!this.p || this.host.hidden) return;
    const rev = (this.rev = (this.rev || 0) + 1);
    const p = this.p,
      asset = p.assets[p.photo.asset];
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.canvas.width = w * Math.min(devicePixelRatio, 2);
    this.canvas.height = h * Math.min(devicePixelRatio, 2);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    const ratio = asset ? asset.width / asset.height : 1.5;
    let rw = w - 48,
      rh = rw / ratio;
    if (rh > h - 70) {
      rh = h - 70;
      rw = rh * ratio;
    }
    this.rect = { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
    const ctx = this.ctx;
    ctx.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0);
    ctx.fillStyle = "#23272c";
    ctx.fillRect(0, 0, w, h);
    if (!asset) return;
    const loaded = await Promise.all([
      this.image(p.photo.asset),
      ...p.photo.layers.map((l) => this.image(l.asset)),
    ]);
    if (rev !== this.rev) return;
    ctx.save();
    ctx.translate(this.rect.x, this.rect.y);
    await this.paint(ctx, rw, rh, loaded);
    ctx.restore();
    const layer = p.photo.layers.find((l) => l.id === this.selected);
    if (layer) {
      ctx.strokeStyle = "#7bb8ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      layer.corners.forEach(([x, y], i) => {
        const px = this.rect.x + x * rw,
          py = this.rect.y + y * rh;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      for (const [x, y] of layer.corners) {
        ctx.beginPath();
        ctx.arc(this.rect.x + x * rw, this.rect.y + y * rh, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  async paint(ctx, w, h, loaded) {
    const p = this.p;
    if (!loaded)
      loaded = await Promise.all([
        this.image(p.photo.asset),
        ...p.photo.layers.map((l) => this.image(l.asset)),
      ]);
    ctx.drawImage(loaded[0], 0, 0, w, h);
    if (p.photo.exposure) {
      ctx.fillStyle = p.photo.exposure > 0 ? "white" : "black";
      ctx.globalAlpha = Math.abs(p.photo.exposure) * 0.6;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    for (let n = 0; n < p.photo.layers.length; n++) {
      const l = p.photo.layers[n],
        q = l.corners.map(([x, y]) => [x * w, y * h]),
        im = loaded[n + 1];
      ctx.save();
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.shadowColor = "#000b";
      ctx.shadowBlur = (l.shadow * w) / 1000;
      ctx.shadowOffsetX = (l.shadow * w) / 1600;
      ctx.shadowOffsetY = (l.shadow * w) / 900;
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.restore();
      warp(ctx, im, q);
    }
    for (const l of p.photo.lights) {
      const x = l.x * w,
        y = l.y * h,
        r = l.radius * w;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const t = (l.kelvin - 2700) / 3800;
      g.addColorStop(
        0,
        `rgba(255,${Math.round(180 + t * 65)},${Math.round(105 + t * 150)},${l.power * 0.55})`,
      );
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
  bind() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (!this.p.photo.asset) return;
      const rect = c.getBoundingClientRect(),
        x = (e.clientX - rect.left - this.rect.x) / this.rect.w,
        y = (e.clientY - rect.top - this.rect.y) / this.rect.h;
      let layer = this.p.photo.layers.find((l) => l.id === this.selected);
      let corner =
        layer?.corners.findIndex(
          (q) =>
            Math.hypot((q[0] - x) * this.rect.w, (q[1] - y) * this.rect.h) < 18,
        ) ?? -1;
      if (corner < 0) {
        layer = [...this.p.photo.layers]
          .reverse()
          .find((l) => inside([x, y], l.corners));
      }
      if (!layer) return;
      this.select(layer.id);
      this.start();
      this.drag = {
        id: layer.id,
        corner,
        x,
        y,
        original: structuredClone(layer.corners),
      };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const r = c.getBoundingClientRect(),
        x = (e.clientX - r.left - this.rect.x) / this.rect.w,
        y = (e.clientY - r.top - this.rect.y) / this.rect.h,
        d = this.drag,
        q = structuredClone(d.original);
      if (d.corner >= 0)
        q[d.corner] = [
          Math.max(0, Math.min(1, x)),
          Math.max(0, Math.min(1, y)),
        ];
      else {
        let dx = x - d.x,
          dy = y - d.y;
        dx = Math.max(
          -Math.min(...q.map((p) => p[0])),
          Math.min(1 - Math.max(...q.map((p) => p[0])), dx),
        );
        dy = Math.max(
          -Math.min(...q.map((p) => p[1])),
          Math.min(1 - Math.max(...q.map((p) => p[1])), dy),
        );
        q.forEach((p) => {
          p[0] += dx;
          p[1] += dy;
        });
      }
      if (convex(q)) this.change(d.id, q);
    });
    c.addEventListener("pointerup", () => (this.drag = null));
    c.addEventListener("pointercancel", () => (this.drag = null));
  }
  async export(width) {
    const a = this.p.assets[this.p.photo.asset];
    if (!a) throw new Error("Upload a booth photo first.");
    const c = document.createElement("canvas");
    c.width = width;
    c.height = Math.round((width * a.height) / a.width);
    if (c.height > 8192)
      throw new Error("Choose a smaller export for this tall photo.");
    await this.paint(c.getContext("2d"), c.width, c.height);
    return new Promise((res, rej) =>
      c.toBlob(
        (b) =>
          b ? res(b) : rej(new Error("Export failed. Choose a smaller size.")),
        "image/png",
      ),
    );
  }
}
function inside(p, q) {
  let result = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i],
      b = q[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function warp(ctx, img, q) {
  const f = homography(q),
    steps = 24;
  ctx.save();
  ctx.beginPath();
  q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  for (let y = 0; y < steps; y++)
    for (let x = 0; x < steps; x++) {
      const a = [x / steps, y / steps],
        b = [(x + 1) / steps, y / steps],
        c = [(x + 1) / steps, (y + 1) / steps],
        d = [x / steps, (y + 1) / steps];
      triangle(ctx, img, [a, b, c], [f(...a), f(...b), f(...c)]);
      triangle(ctx, img, [a, c, d], [f(...a), f(...c), f(...d)]);
    }
  ctx.restore();
}
function triangle(ctx, img, uv, xy) {
  const [[u0, v0], [u1, v1], [u2, v2]] = uv.map(([u, v]) => [
      u * img.width,
      v * img.height,
    ]),
    [[x0, y0], [x1, y1], [x2, y2]] = xy,
    den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(den) < 1e-10) return;
  const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / den,
    c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / den,
    e =
      (x0 * (u1 * v2 - u2 * v1) +
        x1 * (u2 * v0 - u0 * v2) +
        x2 * (u0 * v1 - u1 * v0)) /
      den,
    b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / den,
    d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / den,
    f =
      (y0 * (u1 * v2 - u2 * v1) +
        y1 * (u2 * v0 - u0 * v2) +
        y2 * (u0 * v1 - u1 * v0)) /
      den;
  ctx.save();
  ctx.beginPath();
  const cx = (x0 + x1 + x2) / 3,
    cy = (y0 + y1 + y2) / 3;
  xy.forEach(([x, y], i) => {
    const dx = x - cx,
      dy = y - cy,
      l = Math.hypot(dx, dy) || 1,
      px = x + (dx / l) * 0.45,
      py = y + (dy / l) * 0.45;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
