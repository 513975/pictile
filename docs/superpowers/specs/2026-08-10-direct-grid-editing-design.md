# Direct Grid Editing Design

## Goal

Make grid conversion and recoloring immediate, visual, and efficient.

## Scope

- Remove the redundant comparison-preview command; retain live previews.
- Debounce conversion changes by 250ms after row, column, sampling, or detail settings change.
- Add select, fill, and eyedropper editing modes.
- Fill mode paints every cell crossed while pointer-dragging as one undoable stroke.
- Eyedropper copies a grid cell's pure color and returns to fill mode.
- Replace the basic color input with hue, saturation/value, current-color, and swatch controls.
- Compact binary controls into small inline switches.

## Protection

Automatic conversion never runs after a manual grid edit. A conversion replaces the current generated grid only after its 250ms delay and creates a recoverable version. Each drag stroke is one history action.

## Verification

Confirm parameter changes update automatically, a continuous brush stroke undoes in one action, eyedropper changes active color, and all modes remain usable at mobile width.
