# Responsive Component UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pictile's inconsistent static interface with Shoelace controls and a responsive editing workspace.

**Architecture:** Keep all image, crop, history, and export modules intact. Load Shoelace component modules in `index.html`, replace native interactive controls with semantic custom elements, and centralize responsive workspace CSS in `styles.css`.

**Tech Stack:** Existing ES modules, Shoelace Web Components, Canvas API, Node test runner.

---

### Task 1: Install and load Shoelace

**Files:** Modify `package.json` and `index.html`.

- [ ] Install `@shoelace-style/shoelace` with `npm install @shoelace-style/shoelace`.
- [ ] Add Shoelace light theme stylesheet and only the component module imports used by Pictile: button, input, select, option, switch, dialog, drawer, tooltip, alert, icon-button, and range.
- [ ] Replace native buttons, inputs, selects, checkbox switches, and dialogs with equivalent `sl-*` elements while retaining current DOM ids used by `src/app.js`.
- [ ] Run `npm test`; expected: seven tests PASS. Commit `build: add shoelace component library`.

### Task 2: Rebuild the workspace shell

**Files:** Modify `index.html` and `styles.css`.

- [ ] Build a restrained desktop workspace with a 260px reference/settings sidebar, flexible canvas region, and 300px version sidebar.
- [ ] Make all icon-only commands `sl-icon-button` controls with tooltips and accessible labels; use `sl-alert` for application error and success status.
- [ ] Give panels 6px maximum corner radius, consistent 8px spacing increments, high contrast labels, and stable canvas dimensions.
- [ ] Define breakpoints: desktop above 1100px, tablet from 700px to 1099px, and mobile below 700px.
- [ ] Run `npm test` and inspect the default route at 1440px; expected: no overlapping controls. Commit `feat: redesign desktop editor workspace`.

### Task 3: Add tablet and mobile navigation

**Files:** Modify `index.html`, `styles.css`, and `src/app.js`.

- [ ] At tablet widths, expose reference, controls, and history through compact `sl-drawer` controls while retaining a full canvas center.
- [ ] At mobile widths, show a fixed top command bar and use bottom drawers for settings, live reference, and versions; crop and compare dialogs use full viewport width and height.
- [ ] Bind drawer state without changing any grid, crop, history, or export data.
- [ ] Verify at 768px and 390px: upload, regenerate, cell recolor, undo/redo, crop, comparison, version restore, and PNG export remain reachable.
- [ ] Run `npm test`; expected: seven tests PASS. Commit `feat: add responsive editor navigation`.

### Task 4: Verify and integrate

**Files:** Modify affected UI files only for validation fixes.

- [ ] Run `node --check src/app.js` and `npm test`.
- [ ] Capture desktop, tablet, and mobile screenshots after uploading a source image; inspect controls, labels, canvas framing, drawers, dialogs, and preview images for clipping or overlap.
- [ ] Run `git diff --check`, commit validation fixes, push, then verify `git status --short --branch` reports no ahead or behind count.

## Plan Self-Review

- Shoelace installation, control replacement, desktop layout, responsive navigation, and viewport checks cover every approved UI requirement.
- Existing image-processing APIs remain unchanged, limiting UI changes to presentation and event wiring.
