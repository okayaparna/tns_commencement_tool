# The New School 2025 Commencement Studio

A browser-based generator for The New School Class of 2025 commencement identity:
gradient beams and streamers that cross and merge ("unity through intersectionality"),
with type, mockups and export to PNG / SVG / MP4.

No build step and no dependencies. Serve the folder over HTTP and open it:

```bash
node serve.js
```

then visit http://localhost:8765 (ES modules do not run from `file://`).

## What you can do

- **Patterns**: rays from a focus point, weave, and streamers. Width, flare, span and spread mean
  different things in each, so picking a pattern brings its own settings with it rather than
  carrying the last one's across — Undo puts your numbers back. The *Looks* row above sets a whole
  design (colours, fill and type) rather than only the shape.
- **Colour**: background is the four brand colours plus black and white; the beam palette is
  free and ordered. Solid, gradient or striped beams; blend modes so intersections mix; outline
  strokes.
- **Core heat**: a bright centreline running the length of each beam, brightest in the middle of
  the stroke and fading to its edges. Without it a beam is flat in section and reads as coloured
  tape; with it the stroke reads as light. Pair it with a black background — light adds where
  beams cross, so overlaps stay clean instead of averaging toward grey. *Core focus* takes it from
  a broad wash to a hot filament.
- **Mix**: how colours travel along a beam. *Arc* rotates round the hue wheel, so pink → green
  passes through amber instead of the grey that a straight OKLab line runs through; *Direct* is
  that straight line; *Hard* does not mix at all (crisp bands, closest to the 2025 posters).
  **Vividness** holds mid-gradient chroma up toward the more saturated of the two colours.
- **Direct manipulation**: drag the headline to move it and its corner grip to scale it, right on
  the canvas — and inside a mockup too, tilted booklet included, since the stage inverts whatever
  transform the mockup used. Positions snap to centre and thirds; hold Shift to disable. The
  anchor handle and centre lines come with *Guides & anchor* under Canvas; Alt-drag jumps the
  anchor.
- **Woven type**: *Beams behind* says how many ribbons are drawn behind the headline. Put it
  halfway and the type threads through the pattern instead of sitting flatly on top of it.
- **Comb fan**: rays describe a stroke by its two ends — *Stroke width* at the focus and *Outer
  edge* out at the rim, with *Edge curve* easing between them — rather than by a flare piled on
  top of a base width. *Warp* bows the strokes away from the fan's axis, the outer ones most and
  none of it at the focus, so they still converge to a point. *Centre seam* carves a gap down
  each stroke's middle, splitting it in two, whatever the fill mode.
- **Pack**: closes the gaps. Each beam's width grows toward the spacing between its neighbours,
  so they meet edge to edge — a flare that keeps pace with the fan for rays, and for streamers
  the shuffled exits settle into a clean X that stays flush at both edges. Streamers with *Curve*
  at 0 are two straight runs through the crossing point. Rays with **Mirror** on run through the
  focus both ways; with Pack at 1 and a wide Span that gives the gapless symmetric burst.
- **Sizes**: presets for screen, social, story, poster, program cover/spread, arena ribbon,
  banner, badge, or custom pixel sizes.
- **Mockups**: arena jumbotron, program booklet, poster on wall, phone story, social post, name
  badge. The story carries real Instagram chrome — progress segments, poster row, reply bar and
  the scrims behind them — so you can see the band your type has to stay clear of. The social
  post shows two crops side by side, the 4:5 and the asset's own ratio, rising in when you pick
  it; it sits straight on the stage with no card behind it. Chrome icons are Material Symbols
  Rounded at weight 300, loaded from Google Fonts — offline, hand-drawn outlines stand in.
- **Motion**: colour run, sway and anchor drift, plus *Export* — duration, frame rate and "fit
  duration to a seamless loop".
- **Rulers**: asset-pixel rules along the top and left, with the headline's extent shaded on
  both — under Canvas, next to Guides. They are hidden inside a tilted mockup, where a
  horizontal rule would not measure anything.
- **Export**: one button with the file type on its chevron — PNG (0.5× / 1× / 2×), SVG (vector,
  font embedded), video (MP4 in Chrome 126+ / Safari, WebM elsewhere), or the preset as JSON.
  Core light adds a gradient per length-wise slice, so it roughly doubles SVG file size.
- **Type**: one family — Neue Display Next Variable, loaded from `fonts/`. The Type panel copies
  Figma's Typography and Position sections: family, then a **Style** dropdown listing all 108 of
  the font's named instances (Compressed → Extended × Hairline → Black, roman and italic) beside
  the size and its preset chevron, then captioned fields for line height, tracking, alignment,
  position and rotation in px / % / °. Drag a field's icon sideways to scrub the value, or type
  over it; arrow keys nudge (Shift for ×10). *Variable axes* underneath gives raw **Weight**
  (100-900), **Width** (50-200) and **Slant** (0 to -20) for anything between two instances.
- **Fonts**: the family is listed in `fonts/fonts.json`:

```json
[{ "name": "Neue Display Next Variable", "file": "NeueDisplayNextVariable.ttf" }]
```

Font files themselves are gitignored, since they are licensed. They live in `fonts/` locally and
load at runtime. Anyone else cloning this repo needs to copy them in separately.

Keyboard: `Space` play/pause, `R` shuffle seed, `G` guides, `⌘Z` undo.

The right-hand panel splits into four tabs: **Design** (the beams), **Motion**, **Typography**
and **Logos**.

## Layout

- `js/geometry.js` — turns state into beam ribbons (the pattern templates live here)
- `js/paint.js` — canvas renderer (asset, text, logo)
- `js/svg.js` — SVG exporter using the same scene model
- `js/mockups.js` — mockup scenes drawn around the asset
- `js/export.js` — PNG / SVG / video / JSON export
- `js/util.js` — maths plus the OKLab / OKLCh colour mixing
- `js/fonts.js` — the font registry and the `fvar` reader for axes and named instances
- `js/state.js` — defaults, size presets, looks
- `js/main.js`, `js/ui.js` — app shell and control panel
