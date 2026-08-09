# Direct Grid Editing Implementation Plan

**Goal:** Add automatic conversion, brush painting, eyedropper mode, and compact color controls.

**Architecture:** Extend the existing `EditHistory` with grouped strokes. Keep conversion debounce and editor mode state in `app.js`; keep canvas hit testing in `GridCanvas`.

### Task 1: Grouped editing core

- [ ] Add tests for a multi-cell stroke that undoes as one action.
- [ ] Implement `applyStroke(changes)` and reversible grouped history in `src/core/edit-history.js`.
- [ ] Run `npm test` and commit `feat: add grouped grid strokes`.

### Task 2: Immediate workspace controls

- [ ] Remove comparison-preview command and dialog.
- [ ] Add segmented select/fill/eyedropper controls, compact switches, a hue range, saturation/value surface, current-color swatch, and saved colors.
- [ ] Debounce conversion-setting events by 250ms and skip automatic conversion after manual edits.

### Task 3: Canvas editor interactions

- [ ] Add pointer-down, pointer-move, and pointer-up behavior for fill strokes.
- [ ] Use eyedropper mode to set the active color from the clicked cell, then return to fill.
- [ ] Redraw live preview and update undo state after each edit.

### Task 4: Integration

- [ ] Verify conversion debounce, brush stroke undo, eyedropper, responsive control density, and export.
- [ ] Commit and push the completed feature.
