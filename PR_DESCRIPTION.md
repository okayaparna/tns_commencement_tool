## Summary

Twenty-six commits turning the generator from a broad parameter sandbox into a tool that can only make on-brand work. The through-line: every control that could produce something off-brand or nonsensical is gone, and the ones that remain do what their names say.

## Colour

- **Mixing is OKLCh, along the shorter hue arc.** A straight OKLab line between two hues passes close to the neutral axis, which is where brand pink into brand green turned to mud — measured `#bda17e` before, `#e29200` after. Out-of-gamut results back off chroma instead of clamping each channel, which was shifting hues.
- **Nothing off-brand can get in.** Background is the four brand colours plus black and white; beams are the four colours only, and never the one the background is set to — that swatch greys out. Colours are picked from swatches, never a colour dialogue. Changing the background swaps the colour it invalidates for a spare rather than dropping it.
- Gradients span the part of a beam that is **on the canvas**, not its full geometric length — a ray runs thousands of pixels past the frame, so the visible stretch was showing one stretched mid-mix.

## Type

- One family: Neue Display Next Variable. The system font list and the uploader are gone.
- The panel follows Figma's: a **Style** dropdown built from the font's own 108 named instances grouped by width, then captioned fields for size, line height, tracking, position and rotation in px / % / °. Drag a field's icon to scrub, type over it, arrow keys nudge.
- Raw `wght` / `wdth` / `slnt` axes underneath for anything between two instances.

## Pattern

- Two patterns: **Rays** and **Weave**. Picking one brings its own settings rather than carrying the last one's across.
- A ray stroke is described by its **two ends** — stroke width at the focus, outer edge at the rim — instead of a flare piled on a base width. Packing falls out of it: the outer edge that leaves no wedge between neighbours is `lenRef × span / (n−1)`.
- **Pack** closes the gaps, **Warp** combs the fan, **Centre seam** splits each stroke, **Core heat** lights its centreline.

## Canvas and mockups

- Drag the type and the mark to move, corner grips to size — inside mockups too, tilted booklet included, since the stage inverts whatever transform the mockup used.
- Shared **Position** block: alignment snaps an item to a canvas edge or centre by moving its box, so snapping centred multi-line type flush left does not re-rag it.
- Asset-pixel **rulers**; **woven type** that threads through the ribbons.
- Story mockup carries real Instagram chrome; social post shows the 4:5 and the asset's own crop side by side; booklet and badge carry the printed red information band with the mark.

## Fixes worth naming

- **Runaway render loop.** `draw()` called `requestRender()` while `frame()` had already cleared `raf`, so each frame scheduled two rAF chains. Replayed against a fake clock: 1, 2, 4, 8 … 8192 callbacks by frame 14 — about a quarter second, which is why choosing a mockup froze the page.
- **Quad merging across a taper.** Slices merged on cross-section direction alone, so a whole tapering ray collapsed into one quad and its gradient was stretched over a stroke it no longer spanned. Merging now also requires matching width.
- **Beam length.** Fixed at a multiple of the canvas diagonal, so shrinking Scale pulled the ends inside the frame. Now derived from the region that maps onto the canvas.

## Testing

Each change was checked in the browser rather than by inspection: pixel scans across strokes to confirm colour ramps and soft edges, matrix probes to confirm mockup drag mapping, rAF counting for the loop fix, and a sweep of every pattern × fill × mockup × canvas size through both PNG and SVG export after each commit. Console clean throughout.

## Note

`js/mark.js` embeds The New School mark as path data. The repo deliberately keeps licensed fonts out via `.gitignore`; if this repo is public, the mark may deserve the same treatment.
