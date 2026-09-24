/**
 * Decoding an uploaded original at the size the caller actually needs.
 *
 * An original is stored whole — up to 25 MB and up to 100 megapixels — because
 * it is the file the artist handed over and a backup has to hand it back
 * unaltered. Nothing on screen wants it at that size: a library thumbnail is
 * 52 px wide and a wall texture is capped at 2048. The old path decoded the
 * whole thing into an `<img>` and then shrank it on a 2D canvas, so a machine
 * that is slow at exactly this spent its time unpacking a 100 megapixel bitmap
 * it was about to throw away. That is what made a booth full of uploads feel
 * heavy on an older machine, while the sample panels — which have no files at
 * all — stayed quick.
 *
 * `createImageBitmap` does the same downscale inside the browser's own decoder
 * and off the main thread. Where it is missing or refuses the resize options,
 * the old canvas path is still here and still correct.
 */

/**
 * The sources that came back already upside down, because they are on their
 * way to a texture. WebGL's own vertical flip (`UNPACK_FLIP_Y_WEBGL`, which is
 * what three's `texture.flipY` sets) is not applied to an ImageBitmap the way
 * it is to an `<img>` or a canvas, which is why decoding an original through
 * `createImageBitmap` hung every uploaded photograph upside down. Asking the
 * decoder itself for the flip is the fix, and a member of this set is the
 * signal to leave `texture.flipY` off so it is not flipped twice.
 *
 * A WeakSet, so a bitmap that has been closed and dropped is not kept alive by
 * the bookkeeping that describes it.
 */
const PREFLIPPED = new WeakSet();
/** True if `decodeAt` handed this source back already flipped for upload. */
export const isPreflipped = (source) => !!source && PREFLIPPED.has(source);
/** The size a source is decoded to: the largest that fits, never an upscale. */
export function fitWithin(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (!(longest > 0) || !(maxEdge > 0) || longest <= maxEdge)
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * A data URL as a Blob, which is what `createImageBitmap` takes. `fetch` does
 * this in native code; the hand-rolled loop is the fallback for anything that
 * will not fetch its own data URL.
 */
async function asBlob(dataUrl) {
  try {
    const response = await fetch(dataUrl);
    return await response.blob();
  } catch {
    const comma = dataUrl.indexOf(",");
    const head = dataUrl.slice(0, comma);
    const type = head.slice(5, head.indexOf(";")) || "image/png";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }
}

/** The old path: decode whole, then shrink onto a canvas if it is too big. */
function decodeWithImage(dataUrl, size) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.width <= size.width && image.height <= size.height) {
        resolve(image);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.getContext("2d").drawImage(image, 0, 0, size.width, size.height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error("This image could not be decoded."));
    image.src = dataUrl;
  });
}

/**
 * The decoded original, no larger than `maxEdge` on its longest side. The
 * result is an ImageBitmap, an `<img>` or a canvas — all three are drawable
 * and all three carry `width` and `height`, which is everything the callers
 * here need.
 *
 * `options.upload` says the source is going straight onto the GPU rather than
 * onto a canvas or into an `<img>`. That path asks the decoder for the
 * vertical flip a texture upload needs, because WebGL will not do it for an
 * ImageBitmap; `isPreflipped` is how the caller knows to leave `flipY` off.
 * Without it the orientation is the browser's own, which is what anything
 * being drawn or measured wants.
 *
 * `width` and `height` are the original's, which every asset already records,
 * so the target size is known before anything is decoded.
 */
export async function decodeAt(dataUrl, width, height, maxEdge, options = {}) {
  const size = fitWithin(width, height, maxEdge);
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(await asBlob(dataUrl), {
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality: "medium",
        ...(options.upload ? { imageOrientation: "flipY" } : {}),
      });
      if (options.upload) PREFLIPPED.add(bitmap);
      return bitmap;
    } catch {
      // Older Chromium ignores or rejects the resize options rather than
      // resizing badly, and a machine without ImageBitmap at all lands here
      // too. Either way the canvas path below is the answer, not a failure.
    }
  }
  return decodeWithImage(dataUrl, size);
}
