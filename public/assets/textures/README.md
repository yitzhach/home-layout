Ground texture sets live here, one directory per ground kind:

    concrete/color.jpg  concrete/normal.jpg  concrete/rough.jpg
    concrete/ao.jpg     concrete/meta.json
    asphalt/...  grass/...  carpet/...  wood/...

The repository ships none of them, and the app runs without them: a ground kind
whose files are missing keeps the procedural canvas surface. See
`docs/TEXTURE-ASSETS.md` for what to download from ambientCG and how
`tools/texture-prep.mjs` puts it in place.
