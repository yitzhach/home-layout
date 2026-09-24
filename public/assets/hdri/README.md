Environment preset HDRIs live here, one directory per preset:

    tradeshow/light.hdr   tradeshow/bg.jpg   tradeshow/meta.json
    artfair/...           home/...

The repository ships none of them, and the app runs without them: a preset
whose files are missing keeps the procedural sky and ground. See
`docs/HDRI-ASSETS.md` for what to download, where to get it, and how
`tools/hdri-prep.mjs` converts an HDRI you already have.

Ground textures are the sibling folder, `../textures`.
