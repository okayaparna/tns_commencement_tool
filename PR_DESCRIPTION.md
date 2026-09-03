## Summary

Two fixes on top of what is already on `main`.

## Four width controls did nothing

**Stroke width, Width vary, Outer edge and Edge curve** had no effect at all. The cause was `pack` defaulting to `1`: pack was not blending toward the gapless width, it was taking it over. Stroke width and width vary were multiplied by `1 - pack`, and outer edge and edge curve were replaced outright by the computed gapless values. At pack 1 that zeroes or discards all four. It only became visible once pack started at 1 rather than 0.

Pack now sets the width the strokes are measured against, and the settings scale against it — so a stroke narrower than its neighbour spacing simply leaves a gap again. Each pattern's own default is the value that lands exactly gapless, so a fresh document still tiles and every notch away from the default is a visible change.

Measured on rays at pack 1, stroke width at focus / quarter / rim:

| | focus | quarter | rim |
|---|---|---|---|
| default | 7 | 60 | 122 |
| outer edge `0.30` | 7 | 124 | **261** |
| outer edge `0.05` | 7 | 24 | **43** |
| edge curve `3.0` | 7 | **26** | 122 |
| edge curve `0.4` | 7 | **97** | 122 |
| stroke width `0.06` | **75** | 96 | 122 |

The trade: width vary and edge curve are no longer damped by pack either, which is what makes them work at pack 1. A perfect tile now needs Width vary at 0 and Edge curve at 1, rather than pack forcing it. The default render is visually unchanged.

## The brand face ships

`fonts/NeueDisplayNextVariable.ttf` is now tracked. Without it a deployed copy falls back to Helvetica — verified by moving the file aside: the family dropdown empties, the style dropdown drops from 108 named instances to one, the headline sets in Helvetica, and the SVG export carries no `@font-face`. The app still boots and the beams still render, but it cannot set the brand type.

Only the cut `fonts/fonts.json` actually loads is tracked. The three unused static cuts stay ignored.

## Testing

Every pattern x fill x pack x stroke width combination, and all seven mockups across three canvas sizes, through both PNG and SVG export. Console clean.
