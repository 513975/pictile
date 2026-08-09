# Responsive Component UI Design

## Goal

Replace Pictile's ad-hoc interface with a cohesive, responsive component-based editing workspace while retaining all local image-processing behavior.

## Technology

Use Shoelace Web Components loaded as browser modules. This preserves the existing HTML and ES-module application architecture without migrating to React. Shoelace supplies buttons, inputs, selects, dialogs, drawers, tabs, tooltips, and alerts.

## Layout

- Desktop: three persistent regions: reference preview/settings, central canvas, and history.
- Tablet: central canvas remains visible; reference and history become collapsible regions.
- Mobile: canvas remains the primary surface; settings, preview, and history open in bottom or side drawers; crop and comparison use full-screen dialogs.
- Fixed-size controls, labels, and canvas containers must remain stable across all breakpoints.

## Scope

- Replace native controls with consistent Shoelace controls.
- Add accessible labels, tooltips for icon-only actions, and visible operation feedback.
- Refactor CSS around desktop, tablet, and mobile breakpoints.
- Retain Canvas conversion, crop data, edit history, IndexedDB, and PNG export APIs.
- Verify upload, crop, grid editing, history restore, comparison, and export at desktop, tablet, and phone viewports.

## Out of Scope

- Changing color-conversion algorithms or persistence schema.
- Adding server communication or cloud storage.

## Error Handling

Shoelace alerts present image, storage, and export errors. When a dialog or drawer is closed, current editor state remains unchanged unless the user explicitly applies an action.
