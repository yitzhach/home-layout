// Video export: an MP4 muxer and the WebCodecs encoder that feeds it.
//
// Why this exists rather than MediaRecorder. MediaRecorder timestamps frames
// by wall clock, so a clip is only correct if every frame renders inside its
// own 33 ms. A booth with a 4K backdrop, supersampling and two spotlights does
// not, on most machines, and the file comes out either stuttering or in slow
// motion — the machine's performance baked permanently into the artwork. So
// frames are rendered offline, as fast or as slow as the machine manages, and
// given exact presentation times on the way into the encoder. The clip is then
// the move that was asked for, at the frame rate that was asked for, on a
// laptop and on a workstation alike.
//
// MediaRecorder also gives WebM. An MP4 of H.264 is what drops into Instagram,
// a gallery submission or a slide, so WebCodecs' VideoEncoder produces the
// H.264 and the muxer below wraps it. `muxMp4` is pure — bytes in, bytes out —
// which is how tests/video.test.js can parse a real file in Node with no GPU.

// ---------------------------------------------------------------- box writing

const FOURCC = (s) => [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)];
const u8 = (n) => [n & 0xff];
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n / 0x1000000) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const flatten = (parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === "number") out.push(part & 0xff);
    else for (const byte of part) out.push(byte & 0xff);
  }
  return out;
};
// An ISO base media box: size, type, payload. Sizes are what make an MP4
// parseable at all, so they are computed here and never written by hand.
const box = (type, ...payload) => {
  const body = flatten(payload);
  return [...u32(body.length + 8), ...FOURCC(type), ...body];
};
// A full box carries a version and 24 bits of flags ahead of its payload.
const fullBox = (type, version, flags, ...payload) =>
  box(type, u8(version), [(flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff], ...payload);

const ZEROS = (n) => new Array(n).fill(0);
// 16.16 fixed point, which is how MP4 stores the display matrix and the track
// dimensions.
const fixed16 = (n) => u32(Math.round(n * 0x10000));
const IDENTITY_MATRIX = [
  ...u32(0x00010000), ...u32(0), ...u32(0),
  ...u32(0), ...u32(0x00010000), ...u32(0),
  ...u32(0), ...u32(0), ...u32(0x40000000),
];
// A 32-byte Pascal string: one length byte then the name, zero padded.
const compressorName = (name) => {
  const bytes = [...name].slice(0, 31).map((c) => c.charCodeAt(0));
  return [bytes.length, ...bytes, ...ZEROS(31 - bytes.length)];
};

// ------------------------------------------------------------------ the muxer

export const MP4_TIMESCALE = 90000; // divides 24, 25, 30, 50 and 60 exactly
export const sampleDuration = (fps) => Math.round(MP4_TIMESCALE / fps);

// VP9's level is a bound on resolution and rate. Players are lenient about it,
// but a level below the stream is the kind of thing a strict one rejects, so it
// is picked from the frame size rather than hard-coded.
export const vp9Level = (width, height) => {
  const pixels = (width || 0) * (height || 0);
  if (pixels <= 1280 * 720) return 31;
  if (pixels <= 1920 * 1080) return 40;
  if (pixels <= 2560 * 1440) return 50;
  return 51;
};

/**
 * Wraps encoded H.264 access units in an MP4 container.
 *
 * `samples` are AVCC — length-prefixed NAL units, which is what VideoEncoder
 * emits when configured with `avc: { format: "avc" }`. `description` is the
 * avcC payload from the encoder's own decoderConfig: the SPS and PPS, already
 * assembled. Taking both from the encoder rather than parsing the bitstream is
 * the difference between this file and a bitstream parser.
 */
export function muxMp4({
  width,
  height,
  samples,
  description,
  kind = "avc",
  profile = 0,
  level = vp9Level(width, height),
  bitDepth = 8,
  timescale = MP4_TIMESCALE,
}) {
  if (!samples?.length) throw new Error("Nothing was recorded.");
  if (kind !== "vp09" && !description?.length)
    throw new Error("The encoder did not describe its own output.");
  const duration = samples.reduce((total, s) => total + s.duration, 0);

  // Brands tell a player what it is looking at before it parses anything. An
  // H.264 file leads with mp42 and names avc1, which is the combination
  // QuickTime and every phone expect; a VP9 file cannot claim avc1, and leads
  // with iso6 because that is the brand its binding specifies.
  const ftyp =
    kind === "vp09"
      ? box("ftyp", FOURCC("iso6"), u32(0x200), FOURCC("iso6"), FOURCC("isom"), FOURCC("iso2"), FOURCC("mp41"))
      : box("ftyp", FOURCC("mp42"), u32(0x200), FOURCC("mp42"), FOURCC("mp41"), FOURCC("isom"), FOURCC("iso2"), FOURCC("avc1"));

  // A VisualSampleEntry: 78 bytes that every video codec in MP4 shares, then
  // one codec-specific configuration box. H.264 puts avcC there, taken verbatim
  // from the encoder; VP9 puts vpcC, which describes itself and needs nothing
  // from the encoder at all.
  const visualSampleEntry = (type, configuration) =>
    box(
      type,
      ZEROS(6), u16(1),              // reserved, data reference index
      ZEROS(16),                     // pre_defined and reserved
      u16(width), u16(height),
      u32(0x00480000), u32(0x00480000), // 72 dpi horizontal and vertical
      u32(0), u16(1),                // reserved, frame count
      compressorName("Artist OS Booth Studio"),
      u16(0x18), u16(0xffff),        // 24-bit colour, pre_defined = -1
      configuration,
      // Colour, stated rather than left to the player to guess. QuickTime
      // colour-manages what it plays, and an unmarked clip is interpreted
      // against whatever default it likes, which is how a render comes out
      // looking washed or oversaturated next to the PNG export. "nclx" with
      // BT.709 primaries, transfer and matrix is what the canvas actually is.
      box("colr", FOURCC("nclx"), u16(1), u16(1), u16(1), u8(0)),
      // Square pixels, stated for the same reason: a player that assumes
      // anamorphic pixels would stretch the booth, and the booth is the thing
      // being measured.
      box("pasp", u32(1), u32(1)),
    );
  const entry =
    kind === "vp09"
      ? visualSampleEntry(
          "vp09",
          // vpcC is a full box, version 1. The record is profile, level, then a
          // packed byte of bit depth, chroma subsampling and range, then three
          // colour description bytes, then the length of any codec
          // initialisation data. The colour bytes are not optional: leaving
          // them out makes the box three bytes short, which mp4box.js catches
          // and a player may not.
          fullBox(
            "vpcC", 1, 0,
            u8(profile), u8(level),
            // 4 bits bit depth, 3 bits chroma subsampling (1 = 4:2:0
            // colocated), 1 bit full-range flag (0 = studio range).
            u8((bitDepth << 4) | (1 << 1) | 0),
            // BT.709 primaries, transfer and matrix: the canvas is sRGB.
            u8(1), u8(1), u8(1),
            u16(0),
          ),
        )
      : visualSampleEntry("avc1", box("avcC", description));
  const stsd = fullBox("stsd", 0, 0, u32(1), entry);

  // Every frame of an offline render is exactly one frame long, so the
  // time-to-sample table is a single run however long the clip is. Runs are
  // still coalesced rather than assumed, so a variable-rate clip stays correct.
  const runs = [];
  for (const sample of samples) {
    const last = runs[runs.length - 1];
    if (last && last.delta === sample.duration) last.count++;
    else runs.push({ count: 1, delta: sample.duration });
  }
  const stts = fullBox("stts", 0, 0, u32(runs.length), ...runs.map((r) => [...u32(r.count), ...u32(r.delta)]));

  // Sync sample table. Omitted entirely when every frame is a keyframe, which
  // is what "all samples are sync samples" means in the spec.
  const keyframes = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const stss =
    keyframes.length === samples.length
      ? []
      : fullBox("stss", 0, 0, u32(keyframes.length), ...keyframes.map((n) => u32(n)));

  const stsc = fullBox("stsc", 0, 0, u32(1), u32(1), u32(samples.length), u32(1));
  const stsz = fullBox("stsz", 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length)));

  const mdatPayload = samples.reduce((total, s) => total + s.data.length, 0);
  if (mdatPayload > 0xfffffff0 - 8) throw new Error("That clip is too long to write in one file.");
  // mdat comes before moov so the header can be written once, at the end, with
  // every sample size already known. The price is that the chunk offset has to
  // be computed rather than patched: one chunk, starting right after the mdat
  // header, which itself starts right after ftyp.
  const mdatStart = ftyp.length;
  const stco = fullBox("stco", 0, 0, u32(1), u32(mdatStart + 8));

  const stbl = box("stbl", stsd, stts, stss, stsc, stsz, stco);
  // A self-contained file: one data reference, flagged as "the media is in
  // this very file", so nothing points anywhere else.
  const dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));
  const minf = box("minf", fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf, stbl);
  const hdlr = fullBox("hdlr", 0, 0, u32(0), FOURCC("vide"), ZEROS(12), [...FOURCC("Vide"), ...FOURCC("oHan"), ...FOURCC("dler"), 0]);
  const mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
  const mdia = box("mdia", mdhd, hdlr, minf);
  const tkhd = fullBox(
    "tkhd", 0, 3,                  // enabled, in movie
    u32(0), u32(0), u32(1), u32(0), u32(duration),
    ZEROS(8), u16(0), u16(0), u16(0), u16(0),
    IDENTITY_MATRIX,
    fixed16(width), fixed16(height),
  );
  const trak = box("trak", tkhd, mdia);
  const mvhd = fullBox(
    "mvhd", 0, 0,
    u32(0), u32(0), u32(timescale), u32(duration),
    u32(0x00010000), u16(0x0100), ZEROS(10),
    IDENTITY_MATRIX,
    ZEROS(24), u32(2),             // pre_defined, next track id
  );
  const moov = box("moov", mvhd, trak);

  const file = new Uint8Array(ftyp.length + 8 + mdatPayload + moov.length);
  let at = 0;
  const put = (bytes) => {
    file.set(bytes, at);
    at += bytes.length;
  };
  put(Uint8Array.from(ftyp));
  put(Uint8Array.from([...u32(mdatPayload + 8), ...FOURCC("mdat")]));
  for (const sample of samples) put(sample.data);
  put(Uint8Array.from(moov));
  return file;
}

// ----------------------------------------------------------------- the encoder

// Descending preference. H.264 first, in High, Main then Baseline: it is what
// every player, phone and upload form accepts, and asking for High first means
// a machine that can do better is not held back. VP9 last, because H.264
// encoding is a licensed codec that open Chromium builds and some Linux
// browsers ship without — those machines would otherwise have no video export
// at all, and VP9 in MP4 plays in every current browser and in VLC.
// H.264 levels, as the limits the spec actually sets: macroblocks per frame
// and macroblocks per second. A level is a promise about how much work a
// decoder will be asked to do, and a stream that exceeds the level it declares
// is out of spec — QuickTime is entitled to refuse it, and an encoder is
// entitled to refuse the configuration, which drops the export to VP9 and
// leaves QuickTime unable to open the file at all.
//
// This was hard-coded at 4.0 (`avc1.640028`) for every size, and 4.0 cannot
// carry 1440p at any rate or 1080p at 60. That is the bug.
const H264_LEVELS = [
  { level: 0x1e, macroblocks: 1620, rate: 40500 },    // 3.0
  { level: 0x1f, macroblocks: 3600, rate: 108000 },   // 3.1 — 720p30
  { level: 0x20, macroblocks: 5120, rate: 216000 },   // 3.2 — 720p60
  { level: 0x28, macroblocks: 8192, rate: 245760 },   // 4.0 — 1080p30
  { level: 0x2a, macroblocks: 8704, rate: 522240 },   // 4.2 — 1080p60
  { level: 0x32, macroblocks: 22080, rate: 589824 },  // 5.0 — 1440p30
  { level: 0x33, macroblocks: 36864, rate: 983040 },  // 5.1 — 1440p60
  { level: 0x34, macroblocks: 36864, rate: 2073600 }, // 5.2
];
// A macroblock is 16x16, and a frame is padded up to whole macroblocks.
export const macroblocks = (width, height) => Math.ceil(width / 16) * Math.ceil(height / 16);
export const h264Level = (width, height, fps) => {
  const perFrame = macroblocks(width, height);
  const perSecond = perFrame * fps;
  const fit = H264_LEVELS.find((l) => perFrame <= l.macroblocks && perSecond <= l.rate);
  // Nothing above 5.2 is worth claiming: no frame this app offers reaches it,
  // and a level a decoder does not know is as bad as one that is too low.
  return (fit || H264_LEVELS.at(-1)).level;
};
const hex2 = (n) => n.toString(16).padStart(2, "0");
// Profiles, most capable first. High gives the best picture per byte; Main and
// then Baseline are what an older or stricter decoder will take. The level is
// appended per clip rather than baked in.
const H264_PROFILES = [
  { name: "High", prefix: "6400" },
  { name: "Main", prefix: "4d00" },
  { name: "Baseline", prefix: "42e0" },
];
export const codecsFor = (width, height, fps) => [
  ...H264_PROFILES.map((p) => ({
    codec: `avc1.${p.prefix}${hex2(h264Level(width, height, fps))}`,
    kind: "avc",
    label: `H.264 ${p.name}`,
  })),
  // Last resort. VP9 in MP4 plays in every current browser and in VLC, but
  // QuickTime Player cannot open it, so the app says so when it lands here
  // rather than handing over a file that looks broken.
  { codec: "vp09.00.41.08", kind: "vp09", label: "VP9" },
];
export const H264_PROFILE_NAMES = H264_PROFILES.map((p) => p.name);

export const SIZES = {
  1080: { label: "1080p · 1920 × 1080", width: 1920, height: 1080, bitrate: 12e6 },
  720: { label: "720p · 1280 × 720", width: 1280, height: 720, bitrate: 6e6 },
  1440: { label: "1440p · 2560 × 1440", width: 2560, height: 1440, bitrate: 20e6 },
};
export const DEFAULT_SIZE = 1080;
export const FPS = [24, 30, 60];
export const DEFAULT_FPS = 30;

export const videoSupported = () =>
  typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";

// H.264 encodes in macroblocks, so both dimensions must be even; an odd height
// is rejected by some encoders outright and silently cropped by others.
export const evenSize = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Finds a codec the machine will actually encode, rather than trusting that
 * VideoEncoder existing means H.264 exists. Safari and Firefox differ here,
 * and a rejected configure() is an exception thrown in the middle of a
 * recording the user has already waited for.
 */
export async function pickCodec({ width, height, framerate, bitrate }) {
  if (!videoSupported()) return null;
  for (const { codec, kind, label } of codecsFor(width, height, framerate)) {
    const config = {
      codec,
      width,
      height,
      framerate,
      bitrate,
      // "avc" asks for length-prefixed samples and an avcC description, which
      // is exactly what the muxer wants. VP9 in MP4 has no equivalent knob:
      // its samples are already self-delimiting.
      ...(kind === "avc" ? { avc: { format: "avc" } } : {}),
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      // isConfigSupported may hand back a config with fields the browser has
      // normalised, but it can also drop the ones it does not recognise — and
      // losing avc.format would silently produce Annex B samples the muxer
      // cannot wrap. So the returned config is merged over ours, never
      // substituted for it.
      if (support?.supported) return { config: { ...config, ...(support.config || {}) }, kind, label };
    } catch {
      // isConfigSupported throws rather than resolving on some builds; the next
      // codec is a better answer than giving up on the whole feature.
    }
  }
  return null;
}

/**
 * Encodes frames drawn on demand by `drawFrame(index)` into an MP4, and
 * reports which codec did it.
 *
 * `drawFrame` renders one frame and returns something VideoFrame accepts — the
 * renderer's own canvas. It is called exactly `count` times, in order, and it
 * is awaited, so a frame that waits on a texture upload delays the clip rather
 * than being captured half-drawn.
 */
export async function recordMp4({
  count,
  fps,
  width,
  height,
  bitrate,
  drawFrame,
  // Called after drawFrame and before the frame is handed to the encoder.
  // The renderer's work is asynchronous on the GPU, so a frame read straight
  // after the draw call that produced it can still carry the previous one's
  // backdrop, shadow map or a texture that had not finished uploading — which
  // is what "glitches on export" looked like. A settle draws it again after
  // yielding. Optional, because on a machine that keeps up it is paying twice
  // for nothing.
  settleFrame = null,
  onProgress = () => {},
  signal,
}) {
  const chosen = await pickCodec({ width, height, framerate: fps, bitrate });
  if (!chosen)
    throw new Error(
      "This browser cannot encode video. Chrome, Edge and Safari 16.4 or newer can; Export PNG works everywhere.",
    );
  const { config, kind, label } = chosen;
  const samples = [];
  const duration = sampleDuration(fps);
  let description = null;
  let failure = null;

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      // The decoder description arrives with the first chunk, not from
      // configure(), so it is captured rather than requested.
      const incoming = metadata?.decoderConfig?.description;
      if (incoming && !description)
        description = incoming instanceof ArrayBuffer ? new Uint8Array(incoming) : new Uint8Array(incoming.buffer ?? incoming, incoming.byteOffset ?? 0, incoming.byteLength ?? incoming.length);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, duration, key: chunk.type === "key" });
    },
    error: (error) => {
      failure ||= error;
    },
  });
  encoder.configure(config);

  const microseconds = 1e6 / fps;
  try {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new DOMException("Recording cancelled", "AbortError");
      if (failure) throw failure;
      const source = await drawFrame(i);
      if (settleFrame) await settleFrame(i);
      const frame = new VideoFrame(source, { timestamp: Math.round(i * microseconds), duration: Math.round(microseconds) });
      try {
        // A keyframe every two seconds: long enough not to cost much, short
        // enough that a player can scrub the clip.
        encoder.encode(frame, { keyFrame: i === 0 || i % (fps * 2) === 0 });
      } finally {
        frame.close();
      }
      // Backpressure. Without it the whole clip queues as uncompressed frames
      // and a 14-second 1440p move is several gigabytes of VRAM.
      while (encoder.encodeQueueSize > 4 && !failure) await new Promise((r) => setTimeout(r, 0));
      onProgress((i + 1) / count);
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  const blob = new Blob([muxMp4({ width, height, samples, description, kind })], { type: "video/mp4" });
  // The caller needs to know which codec landed, because it decides what the
  // file can be opened with: QuickTime Player plays H.264 and cannot open VP9.
  // Returning it is what lets the app say so instead of leaving someone with a
  // file their player rejects for no stated reason.
  return { blob, kind, label, codec: config.codec, frames: samples.length };
}
