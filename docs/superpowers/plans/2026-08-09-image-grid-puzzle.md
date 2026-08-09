# Image Grid Puzzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only image-to-editable-color-grid tool with persistent local history and PNG export.

**Architecture:** Pure ES modules convert RGBA image data to a flat `{ rows, cols, cells }` grid and record reversible cell edits. Browser-only modules handle Canvas rendering, IndexedDB, decoding, DOM events, and downloading. No image data is uploaded.

**Tech Stack:** HTML, CSS, ES modules, Canvas API, IndexedDB, Node built-in test runner.

---

## File Structure

- `package.json`: declares ES modules and the Node test command.
- `index.html`, `styles.css`: responsive upload screen and workbench.
- `src/core/color-grid.js`: sampling, detail preservation, grid validation.
- `src/core/edit-history.js`: bounded undo/redo.
- `src/data/project-store.js`: IndexedDB version queries.
- `src/ui/grid-canvas.js`: draw, select, hit-test, and export a grid.
- `src/app.js`: browser workflow coordinator.
- `tests/color-grid.test.js`, `tests/edit-history.test.js`: unit coverage.

### Task 1: Build and test the conversion core

**Files:** Create `package.json`, `src/core/color-grid.js`, and `tests/color-grid.test.js`.

- [ ] **Step 1: Configure tests**

Create `package.json` with this exact content:

```json
{"name":"pictile","private":true,"type":"module","scripts":{"test":"node --test tests/*.test.js"}}
```

- [ ] **Step 2: Write failing color tests**

Create `tests/color-grid.test.js` with three tests: a two-pixel red/blue average must be `#800080`; a three-pixel near-red/near-red/blue dominant sample must be `#f00000`; and a 2-by-2 request must produce four cells that pass `validateGrid`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { imageDataToGrid, validateGrid } from '../src/core/color-grid.js';
const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());
test('average', () => assert.equal(imageDataToGrid(rgba([255,0,0,255],[0,0,255,255]),2,1,1,1,'average',false).cells[0], '#800080'));
test('dominant', () => assert.equal(imageDataToGrid(rgba([240,12,10,255],[245,9,8,255],[2,20,240,255]),3,1,1,1,'dominant',false).cells[0], '#f00000'));
test('shape', () => { const grid = imageDataToGrid(rgba([0,0,0,255],[255,255,255,255],[255,0,0,255],[0,255,0,255]),2,2,2,2); assert.equal(grid.cells.length,4); assert.equal(validateGrid(grid),true); });
```

- [ ] **Step 3: Prove the tests fail**

Run `npm test`. Expected: `ERR_MODULE_NOT_FOUND` for `src/core/color-grid.js`.

- [ ] **Step 4: Implement the conversion API**

Create `src/core/color-grid.js` exporting `imageDataToGrid(data, width, height, rows, cols, mode, detailPriority)`, `cloneGrid(grid)`, and `validateGrid(grid)`. Reject row or column values less than two. Compute each source region using `Math.floor(col * width / cols)` boundaries. Average opaque pixels for average mode; count `Math.round(channel / 16) * 16` RGB buckets in a `Map` for dominant mode. With detail priority, select the dominant bucket only when it covers at least 65% of a cell; otherwise retain the average. Return lower-case six-character hex colors.

- [ ] **Step 5: Verify and commit**

Run `npm test`; expected: three PASS. Commit only Task 1 files with message `feat: add image color grid conversion`.

### Task 2: Build and test undo/redo

**Files:** Create `src/core/edit-history.js` and `tests/edit-history.test.js`.

- [ ] **Step 1: Write failing history tests**

Test that applying `{ index: 0, before: '#ffffff', after: '#ff0000' }` changes the first cell, `undo()` restores it, and `redo()` reapplies it. Test that a new edit after `undo()` makes `canRedo` false.

```js
const history = new EditHistory(['#ffffff', '#000000']);
history.apply({index:0,before:'#ffffff',after:'#ff0000'});
assert.deepEqual(history.undo(), ['#ffffff','#000000']);
assert.deepEqual(history.redo(), ['#ff0000','#000000']);
```

- [ ] **Step 2: Prove the new test fails**

Run `npm test`. Expected: color tests PASS and history tests fail because the module does not exist.

- [ ] **Step 3: Implement the state machine**

Create `EditHistory` with a copied `cells` array, 160-entry `undoStack`, `redoStack`, `canUndo`, `canRedo`, `apply`, `undo`, and `redo`. `apply` must change one indexed cell, discard the redo stack, and ignore no-op edits. `undo` and `redo` return the current cells array without changing it when their corresponding stack is empty.

- [ ] **Step 4: Verify and commit**

Run `npm test`; expected: five PASS. Commit Task 2 files with message `feat: add reversible grid edits`.

### Task 3: Build the browser workbench

**Files:** Create `index.html`, `styles.css`, `src/data/project-store.js`, `src/ui/grid-canvas.js`, and `src/app.js`.

- [ ] **Step 1: Add the semantic page and responsive layout**

Create an upload screen whose hidden file input accepts PNG/JPEG/WebP. After selection show a three-column workbench: 248px left settings panel with row/column inputs (2-120, default 24), average/dominant select, detail toggle, native color input, gridline toggle, regenerate and export commands; flexible central Canvas panel with undo, redo, and 8-48px cell zoom; 280px history panel with save, restore, and delete controls. Below 900px place history below the canvas. Keep the canvas inside a scrollable region and use a 3px outline for the selected cell.

- [ ] **Step 2: Add persistent snapshot functions**

In `project-store.js`, open IndexedDB database `pictile`, version 1. Create `projects` and `versions` object stores keyed by `id`; add a `projectId` index to `versions`. Export async `openStore`, `putVersion`, `listVersions`, and `deleteVersion`. Every request must reject errors so the UI can show a visible storage warning.

- [ ] **Step 3: Add Canvas view behavior**

In `grid-canvas.js`, create `GridCanvas` with `render(grid, { cellSize, selected, gridlines })`, `hitTest(event)`, and `exportPng(grid, gridlines)`. Draw each flat cell at `row * cols + col`; gridlines are 1px semi-transparent white. For export, use an off-screen canvas with `Math.max(16, Math.floor(1600 / Math.max(grid.rows, grid.cols)))` pixels per cell and return `toDataURL('image/png')`.

- [ ] **Step 4: Coordinate the interaction flow**

In `app.js`, use `createImageBitmap` and an off-screen Canvas to decode once and obtain `ImageData`. Convert with `imageDataToGrid`; reject requested grids larger than 14,400 cells with an `aria-live` error. On a canvas click, use `hitTest`, apply the active color through `EditHistory`, and redraw. Bind undo/redo buttons plus `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z` outside form fields. Save `{ id, projectId, label, createdAt, grid, thumbnail }` after generation, manual save, and before restoration. List thumbnail, timestamp, restore, and delete actions. Export a `${sourceName}-puzzle.png` using the active gridline setting.

- [ ] **Step 5: Verify all acceptance behavior**

Run `npm test`; expected: five PASS. Start a static server and inspect in Chromium. Upload a landscape JPEG, portrait PNG, and square WebP. Verify settings regenerate the grid; single-cell edits undo and redo by button and shortcut; save-refresh-restore preserves the earlier state; exported PNGs differ when grid lines are toggled; bad files and over-limit dimensions show errors.

- [ ] **Step 6: Commit, push, and verify**

Commit Task 3 files with message `feat: add editable image grid puzzle workspace`. Run `npm test`, then `git push`, then `git status --short --branch`; expected: tests pass and `main...origin/main` has no ahead/behind count.

## Plan Self-Review

- Spec coverage: conversion options and recognition are Task 1; undo/redo is Task 2; upload, grid editing, persistence, version restore, export, errors, responsiveness, and browser checks are Task 3.
- Completeness scan: all implementation units are defined.
- Type consistency: every browser module uses the same flat `{ rows, cols, cells }` grid shape.
