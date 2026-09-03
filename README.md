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

- **Patterns**: rays from a focus point, and weave — straight ribbons running edge to edge
  through one crossing point. Width, outer edge, span and spread mean
  different things in each, so picking a pattern brings its own settings with it rather than
  carrying the last one's across — Undo puts your numbers back.
- **Colour**: picked from swatches, never a colour dialogue, so nothing off-brand can get in.
  The background is the four brand colours plus black and white. Beams are the four colours
  only — black and white are ground, never stroke — and never the colour the background is
  already set to, which would only cut a hole in the pattern; that swatch greys out. Changing
  the background swaps the colour it invalidates for a spare rather than dropping it, so the
  palette keeps its size as you try grounds. The palette is ordered, and beams take it in that
  order.
- **Core heat**: a bright centreline running the length of each beam, brightest in the middle of
  the stroke and fading to its edges. Without it a beam is flat in section and reads as coloured
  tape; with it the stroke reads as light. Pair it with a black background — light adds where
  beams cross, so overlaps stay clean instead of averaging toward grey. *Core focus* takes it from
  a broad wash to a hot filament.
- **Mix**: how colours travel along a beam. *Arc* rotates round the hue wheel, so pink → green
  passes through amber instead of the grey that a straight OKLab line runs through; *Direct* is
  that straight line; *Hard* does not mix at all (crisp bands, closest to the 2025 posters).
  Mid-gradient chroma is always held up toward the more saturated of the two colours, so a mix
  never sags toward grey.
- **Position**: the type and the mark share one block — alignment buttons that snap the item to a
  canvas edge or its centre, and X/Y in pixels. Alignment moves the item on the page; it works on
  the item's box and shifts its anchor by however far the box has to travel, so snapping a block
  flush left does not re-rag the lines inside it. A button lights when the item is already there.
  The type keeps its own *Text alignment* row, which is the different thing it sounds like.
- **Direct manipulation**: drag the headline to move it and its corner grip to scale it, right on
  the canvas — and the same for the mark. Frames and grips come with *Guides & anchor*, so
  turning those off gives a clean preview; dragging either one still works — and inside a mockup too, tilted booklet included, since the stage inverts whatever
  transform the mockup used. Positions snap to centre and thirds; hold Shift to disable. The
  anchor handle and centre lines come with *Guides & anchor* under Canvas; Alt-drag jumps the
  anchor.
- **Woven type**: *Beams behind* says how many ribbons are drawn behind the headline. Put it
  halfway and the type threads through the pattern instead of sitting flatly on top of it.
- **Palette runs**: *Along* puts the ramp down the length of a stroke, so one stroke is one
  colour and the pattern comes from having many. *Across* runs it edge → centre → edge instead,
  so a single stroke carries the whole ramp in section — rim colour, mid tones, hot centreline.
  That is what lets one stroke read as a plume rather than a flat wedge, and it is the thing
  *Core heat* sits on top of. **Edge fade** carries an alpha ramp with that section: how much of
  the half-width dissolves into the ground at the rims. A stroke that ends on a hard edge reads
  as a wedge of paint however good its colours are; one that dissolves reads as light.
- **Comb fan**: rays describe a stroke by its two ends — *Stroke width* at the focus and *Outer
  edge* out at the rim, with *Edge curve* easing between them — rather than by a flare piled on
  top of a base width. *Warp* bows the strokes away from the fan's axis, the outer ones most and
  none of it at the focus, so they still converge to a point. *Centre seam* carves a gap down
  each stroke's middle, splitting it in two, whatever the fill mode.
- **Pack**: closes the gaps. Each beam's width grows toward the spacing between its neighbours,
  so they meet edge to edge — a flare that keeps pace with the fan for rays, and for streamers
  the shuffled exits settle into a clean X that stays flush at both edges. Rays with **Mirror**
  on run through the
  focus both ways; with Pack at 1 and a wide Span that gives the gapless symmetric burst.
- **Sizes**: presets for screen, social, story, poster, program cover/spread, arena ribbon,
  banner, badge, or custom pixel sizes.
- **Mockups**: arena jumbotron, program booklet, poster on wall, phone story, social post, name
  badge. The booklet and badge carry the red information band the printed pieces have — the
  mark, the date and the ceremony, set in the brand face. The badge is the same red panel with
  the mark, the wearer's name and their school. The story carries real Instagram chrome — progress segments, poster row, reply bar and
  the scrims behind them — so you can see the band your type has to stay clear of. The social
  post shows two crops side by side, the 4:5 and the asset's own ratio, rising in when you pick
  it; it sits straight on the stage with no card behind it. Chrome icons are Material Symbols
  Rounded at weight 300, loaded from Google Fonts — offline, hand-drawn outlines stand in.
- **Motion**: the animate switch and *Export* — duration, frame rate and "fit duration to a
  seamless loop". The colour run itself sits with the colours, under Beams, since that is what
  it is running.
- **Logo**: The New School mark, on by default and switchable off, in white, black or red. It is
  the only logo — no uploads — and it is drawn as vector, so it stays sharp at poster size and
  exports as paths in the SVG rather than an embedded bitmap. Its panel carries the same
  the same position block the type has. On the
  canvas it gets the same frame and corner grip as the type: drag to move, drag the corner to
  size it.
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
- `js/mark.js` — The New School mark as path data, for the logo layer and the printed pieces
- `js/state.js` — defaults, size presets, patterns
- `js/main.js`, `js/ui.js` — app shell and control panel
