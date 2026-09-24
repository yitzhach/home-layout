# HDRI assets — step by step

The app ships with no HDRIs, and runs perfectly without them: a preset whose
files are missing keeps the procedural sky and ground. Adding them is what turns
"a 3D booth" into "a booth photographed in a place".

Everything below happens on **your** machine. Agent sessions cannot reach
polyhaven.com — the sandbox proxy refuses the connection — so the downloads are
yours to do, and the files get committed to the repo.

---

## 1. What you are producing

Three presets take assets. Each one is a folder with two or three files:

```
public/assets/hdri/warehouse/light.hdr     1K equirectangular HDR   ~1–3 MB
public/assets/hdri/warehouse/bg.jpg        2K or 4K JPG             ~0.5–2 MB
public/assets/hdri/warehouse/meta.json     written by the tool      <1 KB

public/assets/hdri/artfair/…               same three files
public/assets/hdri/home/…                  same three files
```

The folder names are fixed — `warehouse`, `artfair`, `home` — and so are the
file names. `studio` and `tradeshow` deliberately have none: `studio` is the
default and the zero-asset fallback, and `tradeshow` is a white exhibition hall
drawn procedurally, which is the point of it. This folder was called
`tradeshow` until the preset it served stopped being photographed; the asset
inside never changed and its `meta.json` always said *Burnt Warehouse*.

**Why two files rather than one.** `light.hdr` is only ever filtered into a
reflection probe. Nobody sees its pixels, so 1K is plenty and 4K is waste.
`bg.jpg` is what the camera actually looks at, so it wants resolution. Using one
4K HDR for both jobs costs roughly ten times the bytes for no visible gain.

Only `light.hdr` is really required. A folder with just `light.hdr` lights the
booth from the HDRI and keeps the procedural sky behind it — which is a
perfectly good look, and half the download.

---

## 2. Which HDRIs to get

[polyhaven.com/hdris](https://polyhaven.com/hdris) — everything there is CC0
(free, commercial use, no attribution required).

| Folder | Search for | What you want to see |
| - | - | - |
| `warehouse` | *warehouse*, *exhibition*, *hangar*, *factory* | a large indoor space with overhead lighting, no strong sun |
| `artfair` | *park*, *plaza*, *courtyard*, *market* | open sky, soft daylight, ideally overcast |
| `home` | *living room*, *interior*, *apartment* | windows on one side, warm interior light |

Two things to avoid:

- **Hard midday sun.** It throws a single black shadow across the booth and the
  artwork. Overcast or open shade flatters artwork and is what a real fair tent
  gets anyway.
- **Anything with strong colour casts** (sunset, neon). It tints the booth
  walls, and though the artwork is protected by the Artwork colour setting, the
  surroundings will look wrong to you.

---

## 3. Pick a resolution

On an asset page, the download panel offers resolutions (1K, 2K, 4K, 8K…) and
formats (HDR, EXR, and on many assets a tone-mapped JPG). You need:

| | For `light.hdr` | For `bg.jpg` |
| - | - | - |
| **Testing / first try** | 1K HDR | 2K |
| **Shipping** | 1K HDR | 4K, or 2K if the backdrop is mostly out of frame |
| **Never** | 4K or 8K HDR — ten times the bytes, zero visible gain | 8K — past the point a browser wants to decode |

1K is the right answer for `light.hdr` at *every* stage. Image-based lighting is
blurred into a probe before it is used; the resolution does nothing.

For the backdrop, do not start below 2K, and prefer 4K. A spherical backdrop is
magnified by the field of view alone: a 62-degree view shows 62/360 of the
image, so a 1K panorama puts about 176 source pixels across the whole canvas and
every one of them is smeared over eight. **This is not hypothetical — both
shipped presets were prepped from the 1K HDR and look soft and magnified because
of it.** The Backdrop framing control in Layout → Surroundings buys back about a
third of that magnification, and re-prepping from the 4K source is the rest. 4K doubles the download for detail that is usually
behind the booth.

---

## 4. Get the files into place

### Route A — download only (fastest)

1. Download the **1K HDR**. Rename it `light.hdr`.
2. If the asset page offers a **tone-mapped JPG** at 2K or 4K, download that and
   rename it `bg.jpg`. If it does not, skip to Route B, or skip `bg.jpg`
   entirely and let the procedural sky stand behind the HDRI lighting.
3. Put both in `public/assets/hdri/<preset>/`.
4. No `meta.json`. The app defaults to a headroom of 1 and everything works.

The catch, stated plainly: a tone-mapped JPG has already had a tone curve baked
into it, and three.js applies its own ACES curve to the background as well. The
backdrop therefore reads flatter and dimmer than the HDRI it came from. It still
looks like the place. Route B fixes it.

### Route B — the tool (best quality, one command)

1. Download **one** file: the **4K HDR or EXR**. Do not prep from the 1K file —
   the tool will not stretch a backdrop past its source, so a 1K source silently
   produces a 1024px backdrop. It warns loudly when that happens; heed it.
2. Run:

```sh
node tools/hdri-prep.mjs ~/Downloads/warehouse_4k.exr warehouse --bg 4096 \
  --credit "Warehouse by Sergej Majboroda (Poly Haven)"
```

That writes all three files into `public/assets/hdri/warehouse/`, correctly
named, with the headroom measured and recorded in `meta.json` so the backdrop's
brightness comes out right.

Options:

```
--light <px>      width of light.hdr           (default 1024)
--bg <px>         width of bg.jpg              (default 4096)
--quality <1-100> JPEG quality                 (default 92)
--headroom <n>    override the measured backdrop headroom
--credit <text>   asset name and author, recorded in meta.json
--license <text>  asset licence                (default CC0)
--out <dir>       output directory
```

It reads `.hdr` and `.exr`, requires a 2:1 equirectangular source, and will not
stretch a backdrop past the source's own width. A 4096×2048 source takes about
three seconds and peaks near 450 MB of memory — the price of resampling in plain
JavaScript rather than depending on native image tooling. Typical output from a
4K source: `light.hdr` about 1.6 MB at 1K, `bg.jpg` about 1.2 MB at 4K.

---

## 5. Check that it worked

```sh
npm run dev
```

Open the app → **Layout** → **Surroundings** → **Environment**, and pick the
preset you just filled in.

You should see:

- the booth's shading change — reflections and fill light now come from the
  HDRI, not from a flat hemisphere;
- a photographed backdrop behind the booth instead of the grey studio wall or
  the procedural skyline;
- a **Backdrop rotation** field appear under Photographic materials. Drag it and
  the backdrop turns; use it to put the interesting part of the room behind the
  booth's open side.

If nothing changes, the files are not where the app looks. Check in the browser
devtools Network tab for `assets/hdri/<preset>/light.hdr` — a **200 that returns
HTML** means the path is wrong and the dev server answered with the app itself.
That case is handled (the app falls back silently rather than crashing), which
is exactly why a silent fallback can look like "nothing happened".

---

## 6. Budget and licensing

- Cloudflare Workers caps a single asset at 25 MiB. Nothing here comes close.
- Keep all of `public/assets` under about 50 MB. Three presets at 1K HDR + 4K JPG
  is roughly 8–9 MB, so there is plenty of room. Past 50 MB, move the files to
  R2 and load them by URL instead of committing them.
- Mention any asset over ~4 MB in its commit message.
- Poly Haven is CC0: no attribution required. Record it anyway — pass `--credit`
  so `meta.json` carries the asset name and author.
