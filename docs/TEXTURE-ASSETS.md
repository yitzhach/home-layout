# Ground texture assets — step by step

Like the HDRIs, these are optional: a ground kind with no texture files keeps
the procedural canvas surface it has always had. Adding them replaces a
noise-generated floor with a photographed one that responds to light.

Agent sessions cannot reach ambientcg.com — the sandbox proxy refuses the
connection — so the downloads are yours, and the files get committed.

---

## 1. What you are producing

Five ground kinds can take a texture set. Each is a folder of four maps plus
metadata:

```
public/assets/textures/concrete/color.jpg    the surface's colour      sRGB
public/assets/textures/concrete/normal.jpg   its bumps and grooves     linear
public/assets/textures/concrete/rough.jpg    where it is shiny or matt linear
public/assets/textures/concrete/ao.jpg       creases that stay dark    linear
public/assets/textures/concrete/meta.json    written by the tool
```

Folder names are the ground kinds, fixed: `concrete`, `asphalt`, `grass`,
`carpet`, `wood`. (`studio` is the texture-free default floor.)

One more folder, `canvas`, is not a ground: it is the tent's fabric, and it
works exactly the same way. See **The tent canvas** below.

Only `color.jpg` is required. A colour-only set already beats procedural noise;
each of the other three is applied if present and skipped if not. The normal map
is the one that earns its download — it is what makes light rake across the
surface instead of sliding over a flat plane.

---

## 2. Which textures to get

[ambientcg.com](https://ambientcg.com) — everything there is CC0.

| Folder | Suggested asset | Search for |
| - | - | - |
| `concrete` | `Concrete034` | *concrete floor*, *polished concrete* |
| `asphalt` | `Asphalt026` | *asphalt* |
| `grass` | `Grass004` | *grass*, *lawn* |
| `carpet` | `Carpet013` | *carpet* — this is what trade show halls actually are |
| `wood` | `WoodFloor051` | *wood floor*, *planks* |
| `canvas` | `Fabric081C` | *canvas*, *fabric*, *tarp* — the tent, not the floor |

Pick seamless, evenly-lit, low-contrast surfaces. A texture with a distinctive
mark or a strong light gradient in it will visibly repeat across a 180 m floor.

---

## 3. Pick a resolution

| | Download |
| - | - |
| **Testing / first try** | **1K-JPG** |
| **Shipping** | **1K-JPG**, or 2K-JPG for concrete and wood if you orbit close to the floor |
| **Never** | 4K or 8K — a floor seen at a glancing angle cannot show it, and it is 16× the bytes |

Choose **JPG**, not PNG: the PNG downloads are several times larger for no
visible difference on a floor, and the prep tool can only resample JPEG.

A 1K-JPG set is roughly 1–2 MB for all four maps. Five ground kinds is under
10 MB, which sits comfortably beside the HDRIs in the 50 MB budget.

---

## 4. Get the files into place

1. On the asset page, choose **1K-JPG** and download the zip.
2. Unzip it. You get files named like:

   ```
   Concrete034_1K_Color.jpg
   Concrete034_1K_NormalGL.jpg
   Concrete034_1K_Roughness.jpg
   Concrete034_1K_AmbientOcclusion.jpg
   Concrete034_1K_Displacement.jpg      ← not used
   ```

3. Note the **Physical Size** shown on the asset page — usually 1 m, 2 m or 4 m.
   This is the single number that matters most; see below.
4. Run:

```sh
node tools/texture-prep.mjs ~/Downloads/Concrete034_1K-JPG concrete \
  --tile 2 --credit "Concrete034 (ambientCG)"
```

It copies the four maps under the names the app looks for — no re-encoding, so
no quality is lost — and writes `meta.json`.

Options:

```
--tile <metres>   real-world size of one tile (default 2; ambientCG lists it)
--size <px>       resample to this width, JPEG sources only
--quality <1-100> re-encode quality when resampling (default 92)
--credit <text>   asset name and author, recorded in meta.json
--license <text>  asset licence (default CC0)
--out <dir>       output directory
```

### If you place files by hand instead

Rename them `color.jpg`, `normal.jpg`, `rough.jpg`, `ao.jpg` and drop them in
the folder. Without `meta.json` the app assumes a 2 m tile and a GL normal map.
Both are the common case, so this works — the tool exists mainly to get the tile
size and the normal-map convention on record.

---

## 5. The two ways to get this wrong

**Tile size.** The ground is a 180 m plane, and how often the texture repeats
across it is computed from the tile size: a 2 m tile repeats 90 times. Tell it
2 m when the asset is really 4 m and every pebble comes out double size — the
floor stops reading as concrete and starts reading as *a picture of* concrete.
It is the difference between a floor and wallpaper. ambientCG prints the real
size on every asset page; pass it with `--tile`.

**NormalGL vs NormalDX.** ambientCG offers both. They are identical files with
the green channel inverted, and getting it wrong lights every bump from the
opposite side — subtly, plausibly, and completely wrongly. Prefer the file
ending `NormalGL`. If you only have `NormalDX`, the tool detects it from the
name and records it, and the app flips it in the shader; you lose nothing.

---

## 6. Check that it worked

```sh
npm run dev
```

**Layout** → **Surroundings** → **Ground**, and pick the kind you filled in.

You should see the floor gain real surface detail, and — the actual test —
light should rake across it as you orbit, with grooves catching highlights on
one side. A colour map alone will change the colour but stay flat; that means
the normal map did not load.

If nothing changes, check the devtools Network tab for
`assets/textures/<kind>/color.jpg`. A **200 returning HTML** means the path is
wrong and the dev server answered with the app shell. The app treats that as
"absent" and falls back silently, which is why a wrong path looks like nothing
happening rather than an error.

---

## 7. The tent canvas

`public/assets/textures/canvas/` textures the tent's roof and valances, and
takes the same four maps under the same names. Two things differ.

**Tile size is 1 m by default, not 2.** Tent canvas is woven polyester; a weave
photographed at four metres and tiled onto a three-metre roof reads as a
bedsheet. Pass the asset's real `--tile` as always, but prefer a source in the
half-metre to two-metre range.

**Pick a plain one.** The roof is the largest single surface in the scene and
the most directly lit. A canvas with a printed pattern, a logo, or heavy
weathering repeats across it three times and reads as wallpaper. An evenly-lit
off-white or light grey weave is what you want; the material keeps its sheen,
so it will not look flat.

```sh
node tools/texture-prep.mjs ~/Downloads/Fabric081C_1K-JPG canvas \
  --tile 1 --credit "Fabric081C (ambientCG)"
```

Check it under **Layout** → **Footprint** → **White canopy & frame**. The weave
should be the same size on the 12-inch valance as on the roof — that is the
thing worth looking at, because it is what the geometry's UVs are there to
guarantee. If the valance weave looks stretched downward, the UVs are wrong,
not the texture.

## 8. The fabric wall finish

**Layout** → **Display walls** → **Panel surface** offers *Smooth print* or
*Fabric pro-panel*. The fabric option has no folder of its own: it borrows the
`carpet` set, because a woven pile is what a fabric pro-panel is.

It takes only the **normal and roughness maps** — never the colour map. The
wall colour is the one the user picked in the swatch above it, and this is a
tool for judging artwork against that colour, so a carpet's navy must not
creep into it. The weave and the sheen are the whole contribution.

**Weave depth** (0–100%) scales the relief. 0 is indistinguishable from smooth;
the default 60 is a clear but quiet texture. It is one slider rather than one
per map because the maps are not independent — deepening the weave without
changing how it catches light just looks like noise.

With no `carpet/` folder the panels stay smooth and the control does nothing,
the same fallback as everywhere else.

One thing to watch: the weave is tiled at the carpet's real size, so a 2 m
carpet repeats about one and a half times across a 10 ft panel. That is
physically honest, and it may read coarser than the fine weave of a real
pro-panel. If it does, re-prep the carpet set with a smaller `--tile`, or point
`WALL_SET` in `src/surfaces.js` at the finer `canvas` set instead.

## 9. Budget and licensing

- 1K-JPG, five kinds: well under 10 MB in total.
- Keep all of `public/assets` (HDRIs included) under about 50 MB.
- ambientCG is CC0: no attribution required. Record it anyway with `--credit`.
