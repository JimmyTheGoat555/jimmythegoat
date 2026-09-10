# Source media

Originals for assets that get processed before they reach `public/`. Nothing
here is deployed — it sits outside `public/` on purpose.

## `dances/` — the 16 dance clips

The delivered MP4s, one per dance x evolution stage. They are **not** what the
app loads. Two things were wrong with them as shipped:

1. **No transparency.** H.264 cannot store an alpha channel, so whoever
   exported them had the transparency flattened into the checkerboard pattern
   that stands in for "transparent" in an editor. That checkerboard was real
   pixels, and it rendered in the app as a grey-and-white box around Jimmy.
   The `stage3`/`stage4` clips are worse: the content sits in a small panel
   letterboxed in black, with a "KlingAI 3.0" watermark out in the margin.

2. **No consistent scale.** The clips were rendered at anything from
   `960x960` to `1056x1984`, and the character occupies a different fraction
   of the frame in each. Dropped into one fixed box, Jimmy changed size and
   drifted off his pedestal every time the dance or evolution stage changed.

`pipeline/` fixes both offline and writes
`public/animations/dances/dance{N}/stage{N}.webp`.

## Regenerating

Needs Python with numpy/scipy/Pillow, and Swift (for AVFoundation — this is
why no ffmpeg install is required). From the project root:

```bash
swiftc -O source-media/pipeline/extract.swift -o source-media/pipeline/extract
python3 source-media/pipeline/build.py source-media/pipeline/geo2.json
```

`extract.swift` streams decoded frames; `key.py` removes the background;
`build.py` measures each clip and re-anchors it onto the shared canvas.
`geo2.json` caches the per-clip measurements (delete it to re-measure),
`canvas.json` records the canvas the app's layout assumes.

### Why animated WebP and not video

It is the only format with a real alpha channel that plays everywhere the app
runs, iOS Safari included. (VP9-with-alpha in WebM is not supported by Safari;
HEVC-with-alpha is Safari-only.) It also removed every fragile part of the
`<video>` path — autoplay policies, a stale frame on source change, a black
flash before first decode. Total output is ~26MB across 15 files versus 58MB
of source MP4, and none of it is precached by the service worker: the clips
load on demand, one at a time.

### The canvas contract

All clips share one canvas, and its proportions match the static tier sprites
in `public/assets/jimmy-*.png` — the character is the same fraction of the
canvas height, with the same empty space below his feet. That is what lets
`JimmyAnimation` render both layers in the same box with
`object-contain object-bottom` and have them line up exactly. **If you
regenerate with different constants, check that component still aligns.**

## Partly-bad source: `dance3/stage4`

That generation pulls the camera back partway through and reveals the whole
panel as a framed picture hanging on a textured wall. Frames 61-110 are
unusable; 0-60 and 111-150 are clean.

It is salvaged in the pipeline rather than by hand, via `FRAME_PLANS` in
`build.py`: the first clean run is played forward and then backward. That
restores the length lost to the cut, and since these clips play once and
hold on their final frame, it guarantees the clip ends on exactly the pose
it started in — which a straight trim at frame 60 would not, as the
character is mid-spin and facing away there.

If the clip is ever regenerated cleanly (ask for a locked camera with no
zoom-out), delete its entry from `FRAME_PLANS` and re-run.
