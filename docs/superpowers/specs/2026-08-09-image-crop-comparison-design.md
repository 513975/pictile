# Image Crop and Comparison Design

## Goal

Add non-destructive image cropping and original-versus-grid comparison to Pictile so users can improve composition before or after seeing the generated puzzle.

## Scope

- Offer cropping immediately after upload and from the generated-grid workspace.
- Support freeform, square, 4:3, and 16:9 crop ratios.
- Let users drag the crop area and resize it using four corner handles.
- Keep crop changes non-destructive until the user applies them.
- Save a recoverable version before applying a crop, then regenerate the grid from the cropped region.
- Add a comparison preview with side-by-side and draggable overlay modes.
- Let comparison select the original image, the cropped image, or the current grid result.
- Persist crop region values with each history version.

## User Flow

1. After selecting a source image, users can either generate immediately or choose `裁切原图`.
2. The workspace also exposes `裁切原图` in the settings panel.
3. The crop dialog displays the source image and a crop box covering the full image by default.
4. Ratio controls update crop-box width and height while preserving its center; freeform removes the lock.
5. `取消` closes the dialog without changing the working grid.
6. `应用裁切` stores a `裁切前` version, updates the active crop region, regenerates the grid, then stores an `已裁切生成` version.
7. `对比预览` opens a dialog that compares the selected image reference and current grid without changing either.

## Data Model

Each version stores an optional crop object:

```js
{ x: 0, y: 0, width: 1, height: 1, ratio: 'free' }
```

Coordinates are normalized to the source image dimensions. The source image remains in memory for the current project; history records reference the normalized crop and grid data rather than duplicate full-resolution image bytes. Restoring a version restores its grid and crop object.

## Components

- `src/ui/crop-editor.js`: crop-box layout, drag, corner resize, ratio constraints, and crop-to-canvas conversion.
- `src/ui/compare-dialog.js`: side-by-side reference/grid rendering and overlay slider.
- `index.html` and `styles.css`: crop and comparison dialog markup, controls, and responsive dialog layout.
- `src/app.js`: opens dialogs, applies crop changes, regenerates from the selected source region, saves/restores crop state, and provides comparison input.

## Error Handling

The crop dialog validates that the final box has nonzero dimensions inside the source image. Image decoding, canvas readback, and oversized crop processing failures leave the current puzzle unchanged and surface a visible status message. Closing either dialog does not mutate project state.

## Verification

- Crop with each supported ratio and freeform drag/resize.
- Confirm cancel leaves grid and history unchanged.
- Confirm applying crop creates both required history states and uses the cropped image for conversion.
- Restore pre-crop and post-crop history states and verify crop-reference alignment.
- Compare original, cropped, and grid images in both side-by-side and overlay modes.
- Check dialogs at desktop and narrow mobile widths.
