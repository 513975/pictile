# Local Image Grid Puzzle Design

## Goal

Build a browser-only tool that converts an uploaded image into an editable, solid-color grid puzzle. Users choose the number of rows and columns, preserve recognizable image detail, recolor individual cells, recover earlier work, and export a PNG.

## Scope

- Process all images in the browser. No image data is sent to a server.
- Let users configure grid rows and columns.
- Convert the source image to a grid of solid-color cells.
- Make the conversion prioritize recognizability through high-quality downscaling and a limited color palette.
- Offer average-color and dominant-color sampling modes.
- Offer a detail-priority option to retain contrast around edges.
- Support manual single-cell recoloring with a native color picker.
- Support undo and redo with toolbar controls and `Ctrl+Z` / `Ctrl+Y`.
- Store key points in the editing timeline as recoverable local history versions.
- Persist projects and historical versions with IndexedDB.
- Export the current grid as a high-resolution PNG, with an optional grid-line overlay.

## Out of Scope

- Server-side image processing, authentication, sharing, or cloud sync.
- Exporting cell colors as CSV or other data formats.
- Collaborative editing.

## User Experience

The initial screen is an upload area. After an image is selected, it becomes a three-column puzzle workspace.

### Left Control Panel

- Row and column numeric inputs.
- Sampling mode selection: average color or dominant color.
- Detail-priority toggle.
- Grid-line visibility toggle.
- Current-color swatch and native color picker.
- Export PNG command.

### Center Canvas

- Renders the current solid-color grid.
- Supports zoom for detailed editing.
- A click selects and recolors one cell with the current color.
- Shows a clear selected-cell outline.
- Has visible undo and redo controls above the canvas.

### Right History Panel

- Lists recoverable versions with a thumbnail and saved time.
- Lets users restore a version or delete it.
- Restoring a version preserves the current state as a new version first.

## Data Flow

1. Decode the uploaded image in the browser.
2. Render it to an off-screen canvas sized to the selected grid dimensions.
3. Calculate a color for each cell using the selected sampling mode.
4. Quantize related colors into a limited palette, retaining contrast in detail-priority mode.
5. Store the result as a two-dimensional array of color values.
6. Render that array on the visible canvas and update it for every manual edit.
7. Save key states, source metadata, grid configuration, and cell data to IndexedDB.
8. Re-render the current grid at export resolution and download it as a PNG.

## Edit History

Undo and redo hold a bounded in-memory sequence of editing operations such as recoloring a cell or changing conversion settings. They serve immediate trial and error. Browser history versions are durable snapshots created after initial conversion, regeneration, and restores; they serve recovery across sessions.

## Persistence and Failure Handling

IndexedDB holds project metadata, source-image thumbnails, grid configuration, cell colors, and saved versions. The UI must show a clear error when IndexedDB is unavailable, image decoding fails, requested grid density exceeds a supported safe limit, or PNG generation fails. It must not silently discard edits.

## Version Control

The project is managed as a local Git repository. Source code, tests, documentation, and configuration are committed in small logical changes. Generated dependencies, build output, local browser data, and editor-specific files are excluded through `.gitignore`. A user-provided GitHub repository is configured as the `origin` remote and receives the committed history through standard Git push commands.

## Verification

- Convert landscape, portrait, and square images at several grid dimensions.
- Confirm recognizability options alter color selection as intended.
- Confirm single-cell recoloring, selection outline, undo, redo, and keyboard shortcuts.
- Confirm restored versions preserve the state being replaced.
- Confirm refresh retains projects and history entries.
- Confirm exported PNG dimensions, cell colors, and optional grid lines.
- Confirm invalid images and storage failures show useful errors.
