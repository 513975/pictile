# Image Crop and Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-destructive cropping before or after grid generation and a reference-versus-grid comparison dialog.

**Architecture:** A pure crop helper owns normalized crop geometry and source-pixel extraction. Crop and comparison dialogs render from the source image and current grid; `app.js` owns applying crop, regenerating, and saving crop data with every version.

**Tech Stack:** ES modules, Canvas API, DOM events, existing Node test runner.

---

### Task 1: Test and implement crop geometry

**Files:** Create `src/core/crop.js` and `tests/crop.test.js`.

- [ ] **Step 1: Write failing geometry tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainCrop, cropImageData } from '../src/core/crop.js';
test('constrainCrop keeps a square within normalized bounds', () => assert.deepEqual(constrainCrop({x:.8,y:.8,width:.4,height:.2}, 'square'), {x:.8,y:.8,width:.2,height:.2,ratio:'square'}));
test('cropImageData extracts the chosen normalized region', () => { const data=new Uint8ClampedArray([255,0,0,255,0,0,255,255]); const result=cropImageData(data,2,1,{x:.5,y:0,width:.5,height:1,ratio:'free'}); assert.equal(result.width,1); assert.deepEqual([...result.data],[0,0,255,255]); });
```

- [ ] **Step 2: Run `npm test` and confirm `ERR_MODULE_NOT_FOUND` for `crop.js`.**

- [ ] **Step 3: Implement `constrainCrop` and `cropImageData`**

`constrainCrop(crop, ratio)` clamps `x`, `y`, `width`, and `height` to `[0,1]`; `square`, `4:3`, and `16:9` use the largest locked box still within remaining bounds; `free` preserves independent dimensions. It returns `{x,y,width,height,ratio}`. `cropImageData` maps normalized bounds with `Math.floor`, copies RGBA rows into a new typed array, and returns `{data,width,height}`.

- [ ] **Step 4: Run `npm test`; expected: seven tests PASS. Commit `feat: add crop geometry`.**

### Task 2: Build crop and comparison dialogs

**Files:** Create `src/ui/crop-editor.js` and `src/ui/compare-dialog.js`; modify `index.html` and `styles.css`.

- [ ] **Step 1: Add dialog markup**

Add `#crop-dialog` with source canvas, draggable crop box, four `.crop-handle` elements, ratio buttons (`free`, `square`, `4:3`, `16:9`), cancel, and apply. Add `#compare-dialog` with original/cropped selector, side-by-side and overlay mode buttons, overlay range slider, and close.

- [ ] **Step 2: Implement crop editor**

`CropEditor.open(sourceCanvas, crop)` draws the source, positions the crop box from normalized coordinates, and returns a Promise resolving to the applied crop or `null` on cancel. Pointer movement updates translation when dragging the box; corner movement updates width and height; ratio controls pass their value to `constrainCrop`.

- [ ] **Step 3: Implement comparison dialog**

`CompareDialog.open({original, cropped, gridPng})` renders side-by-side canvases by default. Overlay mode layers the grid image atop the chosen reference and assigns slider value to `clip-path: inset(0 calc(100% - value%) 0 0)`.

- [ ] **Step 4: Verify dialogs manually at 1280px and 390px widths; commit `feat: add crop and comparison dialogs`.**

### Task 3: Wire crop, history, and conversion state

**Files:** Modify `src/app.js`, `src/data/project-store.js`, and `src/ui/grid-canvas.js`.

- [ ] **Step 1: Add `state.crop` defaulting to `{x:0,y:0,width:1,height:1,ratio:'free'}` and retain decoded full source data.**

- [ ] **Step 2: Before `imageDataToGrid`, call `cropImageData(state.source.data, state.source.width, state.source.height, state.crop)` and pass its result to conversion.**

- [ ] **Step 3: Save `crop: {...state.crop}` in every version. Restore both `grid` and `crop`; save `裁切前` before apply and `已裁切生成` after regeneration.**

- [ ] **Step 4: Bind `裁切原图` from both upload and workspace to `CropEditor.open`; bind `对比预览` to `CompareDialog.open` with full-source, cropped-source, and `GridCanvas.exportPng` values.**

- [ ] **Step 5: Run `npm test`; verify crop cancel leaves grid unchanged, apply changes grid, history restores crop, and both comparison modes render. Commit `feat: connect crop workflow to project history`.**

### Task 4: Validate and integrate

**Files:** Modify test files if a discovered geometry regression needs a test.

- [ ] **Step 1: Run `node --check src/app.js`, `node --check src/ui/crop-editor.js`, `node --check src/ui/compare-dialog.js`, and `npm test`.**
- [ ] **Step 2: Test a JPEG, PNG, and WebP through upload, freeform and preset crop, apply, undo/restore, comparison side-by-side, comparison overlay, and PNG export.**
- [ ] **Step 3: Commit any validation fix, run `git status --short --branch`, then `git push`; expected: a clean branch tracking `origin/main`.**

## Plan Self-Review

- Geometry, crop UI, comparison UI, persistence, restoration, and responsive/manual verification map directly to the approved specification.
- All named functions and data fields are defined in the tasks above.
