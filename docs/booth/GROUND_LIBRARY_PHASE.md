# Ground library phase — presets and uploads in one list

The record of what was decided while turning the floor from one slot two
things fought over into one list with two groups. Planned in `FUTURE_BUILD.md`;
that entry is now removed.

## The report

> *"if I manually load a ground texture it overrides the other presets — if you
> select grass, it won't switch."*

That was true, and intentional: `booth.groundAsset` held an uploaded
photograph and outranked `booth.ground`, the preset kind. The Layout panel even
said so while it was happening. It was still the wrong model — an upload and a
preset were two different things competing for one slot, so choosing a preset
appeared to do nothing, and the only way back was Remove ground texture.

It is also, by `HANDOFF.md`'s own count, one of the two known causes behind
every "the ground selector is broken" report, of which there have been three.
Removing the behaviour removes the diagnosis, which is why that section of the
handoff is shorter now.

## What was built

One picker, two `<optgroup>`s: **Preset grounds** (the six shipped PBR kinds)
and **Your photographs** (the user's uploads, each named). Selecting anything
from either group switches the floor, because they are now the same kind of
choice. There is nothing to remove before a preset will work.

`booth.ground` holds either a kind or `"upload:<asset id>"`. That is the
widened-enum move `WALLS_PHASE.md` uses for `a.wall`, and it is what makes the
two groups one choice: a value that can only hold one of them cannot be
overridden by the other.

## Decisions

- **The library is not a new list.** An uploaded ground is an asset with
  `role: "ground"`, a role the schema already had and already validated, so
  `groundLibrary()` is a filter over `p.assets` rather than a parallel array to
  keep in step with it. A list that can disagree with the assets it names is a
  bug waiting to be written.
- **`booth.groundPreset` remembers the last kind**, so deleting a photograph
  returns the floor to the preset the user last chose rather than dumping them
  on the studio default. It is the one new key, it is optional, and it only
  ever holds a preset kind.
- **An older backup's `groundAsset` is read, never dropped.** `adoptGroundAsset()`
  runs at the end of `validateProject()` — after every check, so it normalises
  only something already valid — and turns that single override into the first
  entry of the library, carrying the kind it was saved with into
  `groundPreset`. `groundUpload()` *also* reads the legacy key directly, so a
  project handed straight to the scene without passing through validation still
  shows the photograph it was saved with. The migration is then normalisation,
  not the thing that makes old files work.
- **An environment preset no longer silently deselects a photograph.** Choosing
  a preset carries a matching floor, which used to overwrite `booth.ground`
  outright. A photograph is a more explicit choice than a preset's default
  floor, so it stays and the preset's kind is remembered for when it is
  deleted. This also matches what the old behaviour *looked* like, since an
  upload outranked everything anyway.
- **Deleting an entry deletes the image**, unless a placement or the photo mode
  is still showing it — then only the floor's claim on it is given up. Assets
  are shared; a delete that can orphan another view of the same image is worse
  than one that occasionally keeps a few hundred KB.
- **The tile size stayed one setting, not one per entry.** It belongs to
  whichever photograph is showing. Per-entry tile sizes are a list of records
  where a single number does the job today; if someone keeps two grounds at
  different scales and has to retype it, that is when to add it.

## Storage

Unchanged: uploads live in `p.assets` alongside artwork originals, which is
where `FUTURE_BUILD.md` said they should live until the Cloudflare-backed
library exists. A list of photographs will outgrow local storage eventually;
nothing here decides that question, and moving them later is a change to where
assets are kept rather than to how the floor is chosen.

## What is pinned, and what still needs eyes

Pinned by `tests/ground.test.js` (9 Node tests): the two groups as one choice,
the named library, the fallback when an upload id names nothing, deletion and
its return to the last preset, the shared-image case, the legacy migration both
through and around `validateProject`, and the widened enum's limits.

Pinned by `tests/view-ground-library.mjs`, in a real browser: uploading a
photograph through the real file input, the second optgroup appearing under its
name, the map reaching the real floor mesh — and **the reported bug itself**,
that picking a preset with a photograph showing switches the floor without
anything being removed first.

What no agent session can judge: whether two labelled groups in one dropdown
read as obviously as they should, and whether "Delete this ground photograph"
is clear enough that nobody expects it to only deselect. Both are judgements
about a picker, on a live site.
