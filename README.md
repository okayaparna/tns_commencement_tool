# TNS Commencement Studio

A browser-based generator for The New School Class of 2025 commencement identity:
gradient beams and streamers that cross and merge ("unity through intersectionality"),
with type, mockups and export to PNG / SVG / MP4.

No build step and no dependencies. Serve the folder over HTTP and open it:

```bash
node serve.js
```

then visit http://localhost:8765 (ES modules do not run from `file://`).

## What you can do

- **Patterns**: rays from a focus point, weave, and streamers (curved ribbons merging).
- **Colour**: background + ordered beam palette; solid, gradient or striped beams; blend modes
  (multiply / screen / …) so intersections mix; outline strokes.
- **Transition**: how colours change along a beam — *Smooth* (OKLab, keeps chroma up),
  *sRGB* (browser default), or *Hard* (crisp colour bands, closest to the 2025 posters).
- **Align**: drag the anchor handle, headline, caption or logo directly on the canvas
  (snaps to centre and thirds; hold Shift to disable, Alt-drag to jump the anchor).
- **Sizes**: presets for screen, social, story, poster, program cover/spread, arena ribbon,
  banner, badge, or custom pixel sizes.
- **Mockups**: arena jumbotron, program booklet, poster on wall, phone story, social post, name badge.
- **Motion**: colour run, sway, anchor drift; "fit duration to a seamless loop".
- **Export**: PNG (0.5× / 1× / 2×), SVG (vector, fonts embedded when uploaded), video
  (MP4 in Chrome 126+ / Safari, WebM elsewhere), and JSON presets.
- **Type**: the four brand faces load automatically from `fonts/`. Neue Display Next Variable is a
  variable font, so the Headline and Caption panels expose live **Weight** (100-900), **Width**
  (50-200, Compressed through Extended) and **Slant** (0 to -20) sliders, with one-click width presets.
- **Fonts**: to add more, upload .otf/.ttf/.woff in the Fonts panel, or drop files in `fonts/` and
  list them in `fonts/fonts.json`:

```json
[{ "name": "Neue Display Next Variable", "file": "NeueDisplayNextVariable.ttf" }]
```

Font files themselves are gitignored, since they are licensed. They live in `fonts/` locally and
load at runtime. Anyone else cloning this repo needs to copy them in separately.

Keyboard: `Space` play/pause, `R` shuffle seed, `G` guides, `⌘Z` undo.

## Layout

- `js/geometry.js` — turns state into beam ribbons (the pattern templates live here)
- `js/paint.js` — canvas renderer (asset, text, logo)
- `js/svg.js` — SVG exporter using the same scene model
- `js/mockups.js` — mockup scenes drawn around the asset
- `js/export.js` — PNG / SVG / video / JSON export
- `js/state.js` — defaults, size presets, looks
- `js/main.js`, `js/ui.js` — app shell and control panel
