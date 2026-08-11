import { createGridPalette, imageDataToGrid, imageDataToLineGrid, mapGridToPalette, simplifyGrid } from './core/color-grid.js';
import { EditHistory } from './core/edit-history.js';
import { GridCanvas } from './ui/grid-canvas.js';
import { constrainCrop, cropImageData } from './core/crop.js';
import { adjustImageData, fitImageData, replaceTransparentPixels } from './core/image-adjust.js';
import { resampleImageData } from './core/resample.js';

const $ = (id) => document.getElementById(id);
const QUICK_PALETTE = ['#e45a4f', '#f59e0b', '#fde047', '#84cc16', '#14b8a6', '#38bdf8', '#6366f1', '#a855f7', '#ffffff', '#f8fafc', '#64748b', '#334155', '#111827'];
const FIXED_40_PALETTE = [
  '#222222', '#b4b4b4', '#eae7df', '#ffffff', '#d32f36', '#9c0a00', '#d60c4a', '#e6968d',
  '#fe9875', '#f7d0c0', '#fcefea', '#fbf6e8', '#dcd2c8', '#e2ceab', '#d56322', '#d48c42',
  '#f29900', '#f9c933', '#fce499', '#b3b47a', '#c2da72', '#6c6e00', '#b19155', '#a98f74',
  '#aa9228', '#3f2b12', '#74491f', '#534658', '#2a2446', '#394599', '#5a459d', '#baa3d7',
  '#b6bcdf', '#a9acbe', '#63abb9', '#b4d2dc', '#91d8e6', '#47aea0', '#b6d3c8', '#273864',
];

const state = {
  source: null,
  processedSource: null,
  grid: null,
  history: null,
  selected: null,
  palette: QUICK_PALETTE.map(hexToRgb),
  paletteSelection: null,
  disabledFixedColors: new Set(),
  crop: { x: 0, y: 0, width: 1, height: 1, ratio: 'free' },
};
const view = new GridCanvas($('grid-canvas'));
let regenerateTimer;
let stroke = null;
let cropDrag = null;
let cropBounds = null;
let cropBeforeDialog = null;
let canvasPan = null;
let spacePressed = false;

function setStatus(message, error = false) {
  $('workspace-status').textContent = message;
  $('workspace-status').className = `status${error ? ' error' : ''}`;
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function validColor(value) { return /^#[0-9a-f]{6}$/i.test(value); }

function getColorInputValue() {
  return $('color-input').value || '';
}

function createBlankGrid(rows, cols, color = '#f7f5ef') {
  return { rows, cols, cells: Array(rows * cols).fill(color) };
}

function getOptions() {
  return {
    rows: Number($('rows-input').value),
    cols: Number($('cols-input').value),
    mode: $('sampling-input').value,
    detail: $('detail-input').checked,
    paletteColors: $('palette-colors-input').value === 'custom' ? $('palette-colors-custom').value : $('palette-colors-input').value,
    brightness: $('brightness-input').value,
    contrast: $('contrast-input').value,
    saturation: $('saturation-input').value,
    temperature: $('temperature-input').value,
    hue: $('hue-adjust-input').value,
    distance: $('distance-input').value,
    fit: $('fit-input').value,
    resample: $('resample-input').value,
    transparent: $('transparent-input').value,
    simplify: $('simplify-input').value,
  };
}

function resolvePaletteSize(value, rows, cols, simplify = 'none') {
  const cells = rows * cols;
  const automatic = cells <= 100 ? 8 : cells <= 256 ? 12 : cells <= 576 ? 16 : cells <= 1024 ? 24 : cells <= 2304 ? 32 : cells <= 4096 ? 48 : 64;
  const parsed = Number.parseInt(value, 10);
  const requested = value === 'auto' || value === 'original' || !Number.isFinite(parsed) ? automatic : Math.max(2, Math.min(64, parsed));
  return Math.min(requested, { light: 24, medium: 16, strong: 12 }[simplify] ?? 64);
}

function getBoardMode() { return document.querySelector('input[name="board-mode"]:checked')?.value ?? 'free'; }

function getEditMode() { return document.querySelector('input[name="edit-mode"]:checked')?.value ?? 'fill'; }

function enabledFixedPalette() {
  return FIXED_40_PALETTE.filter((color) => !state.disabledFixedColors.has(color));
}

function selectUsedPalette(grid, palette, colorCount, distance = 'weighted-rgb') {
  if (palette.length <= colorCount) return palette;
  const mapped = mapGridToPalette(grid, palette.map(hexToRgb), distance); const counts = new Map();
  for (const color of mapped.cells) counts.set(color, (counts.get(color) ?? 0) + 1);
  const selected = [...counts.entries()].sort((first, second) => second[1] - first[1]).slice(0, colorCount).map(([color]) => color);
  return selected.length ? selected : [palette[0]];
}

function currentPalette() {
  return getBoardMode() === 'fixed40'
    ? FIXED_40_PALETTE.map(hexToRgb)
    : state.palette.length ? state.palette : QUICK_PALETTE.map(hexToRgb);
}

function updateWorkspaceLabels() {
  const fixed = getBoardMode() === 'fixed40';
  const palette = currentPalette();
  $('palette-title').textContent = fixed ? '固定 40 色' : state.source ? '图像色板' : '自由色板';
  $('palette-count').textContent = fixed ? `${enabledFixedPalette().length}/40 可用` : `${palette.length} 色`;
  $('palette-description').textContent = fixed
    ? '来自参考色板的 40 个锁定颜色，适合稳定、清晰的像素图。'
    : state.source ? '从图片中提取的实际用色，可选中后继续微调。' : '从当前颜色开始绘制，也可从下方快捷色中选取。';
  $('canvas-mode-label').textContent = fixed ? '固定 40 色绘制' : state.source ? '图像生成后编辑' : '自由绘制';
  $('project-meta').textContent = state.grid ? `${state.grid.rows} × ${state.grid.cols} 网格` : '空白画板';
  $('palette').hidden = fixed;
  $('free-palette-controls').hidden = fixed;
  $('fixed-palette-controls').hidden = !fixed;
  $('selected-color-label').textContent = !fixed && $('palette-edit-input').checked && state.paletteSelection !== null ? `正在编辑色板 ${state.paletteSelection + 1}` : '当前绘制颜色';
  $('color-input').disabled = fixed;
  $('hue-input').hidden = fixed;
  $('color-square').hidden = fixed;
}

function renderImagePalette(nextPalette) {
  if (nextPalette) {
    state.palette = nextPalette.map((rgb) => [...rgb]);
    state.paletteSelection = null;
  }
  const fixed = getBoardMode() === 'fixed40';
  const managing = fixed && $('palette-manage-input').checked;
  const editing = !fixed && $('palette-edit-input').checked;
  const palette = currentPalette();
  $('image-palette').replaceChildren(...palette.map((rgb, index) => {
    const color = rgbToHex(rgb);
    const disabled = fixed && state.disabledFixedColors.has(color);
    const current = color === getColorInputValue().toLowerCase();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `palette-swatch${current ? ' is-current' : ''}${state.paletteSelection === index ? ' is-selected' : ''}${fixed ? ' is-locked' : ''}${disabled ? ' is-disabled' : ''}${managing ? ' is-managing' : ''}${editing ? ' is-editing' : ''}`;
    button.style.backgroundColor = color;
    button.dataset.color = color;
    button.title = fixed ? `${color}（${disabled ? '已禁用' : '可使用'}）` : color;
    button.setAttribute('aria-label', `使用 ${color}`);
    button.setAttribute('aria-current', current ? 'true' : 'false');
    button.setAttribute('aria-pressed', String(disabled));
    button.onclick = () => {
      if (fixed && managing) {
        if (disabled) state.disabledFixedColors.delete(color);
        else if (enabledFixedPalette().length > 1) state.disabledFixedColors.add(color);
        else { setStatus('固定色板至少需要保留一种可用颜色。', true); return; }
        state.paletteSelection = null;
        if (state.disabledFixedColors.has(getColorInputValue().toLowerCase())) updateColorUi(enabledFixedPalette()[0]);
        renderImagePalette(); if (state.source) scheduleRegenerate(); return;
      }
      if (disabled) return;
      state.paletteSelection = editing ? index : null;
      updateColorUi(color);
      renderImagePalette();
      if (getEditMode() === 'eyedropper') setEditMode('fill');
    };
    return button;
  }));
  updateWorkspaceLabels();
}

function buildQuickPalette() {
  $('palette').replaceChildren(...QUICK_PALETTE.map((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-swatch';
    button.style.backgroundColor = color;
    button.dataset.color = color;
    button.title = color;
    button.setAttribute('aria-label', `使用 ${color}`);
    button.onclick = () => { updateColorUi(color); if ($('palette-edit-input').checked && state.paletteSelection !== null) updateSelectedPaletteColor(); else { state.paletteSelection = null; renderImagePalette(); } if (getEditMode() === 'eyedropper') setEditMode('fill'); };
    return button;
  }));
}

function hsbToHex(hue, saturation, brightness) {
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = brightness - chroma;
  const [red, green, blue] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[red, green, blue].map((value) => Math.round((value + match) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsb(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi)?.map((part) => Number.parseInt(part, 16) / 255) ?? [0, 0, 0];
  const max = Math.max(...values); const min = Math.min(...values); const delta = max - min;
  let hue = 0;
  if (delta) hue = max === values[0] ? 60 * (((values[1] - values[2]) / delta + 6) % 6) : max === values[1] ? 60 * ((values[2] - values[0]) / delta + 2) : 60 * ((values[0] - values[1]) / delta + 4);
  return { hue: Math.round(hue), saturation: max ? delta / max : 0, brightness: max };
}

function updateColorUi(color = getColorInputValue()) {
  if (!validColor(color)) return;
  const normalized = color.toLowerCase(); const { hue, saturation, brightness } = hexToHsb(normalized);
  $('color-input').value = normalized;
  $('hue-input').value = hue;
  $('color-square').style.setProperty('--hue', `hsl(${hue} 100% 50%)`);
  $('color-square-handle').style.left = `${saturation * 100}%`;
  $('color-square-handle').style.top = `${(1 - brightness) * 100}%`;
  $('color-swatch').style.backgroundColor = normalized;
  $('hue-input').style.setProperty('--hue-color', `hsl(${hue} 100% 50%)`);
  $('hue-color-indicator').style.backgroundColor = `hsl(${hue} 100% 50%)`;
  $('hue-value').value = `${hue}° · ${normalized.toUpperCase()}`;
  document.querySelectorAll('.palette-swatch').forEach((swatch) => {
    const current = swatch.dataset.color === normalized;
    swatch.classList.toggle('is-current', current);
    swatch.setAttribute('aria-current', current ? 'true' : 'false');
  });
}

function setColorFromPicker(event) {
  if (getBoardMode() === 'fixed40') return;
  const rect = $('color-square').getBoundingClientRect();
  const saturation = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const brightness = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  updateColorUi(hsbToHex(Number($('hue-input').value), saturation, brightness));
}

function sourceAspect() { return state.source ? state.source.width / state.source.height : 1; }
function setCrop(crop) { state.crop = constrainCrop(crop, crop.ratio ?? state.crop.ratio, sourceAspect()); }
function gridCropRatio() { return state.grid ? state.grid.cols / state.grid.rows : 1; }

function resetCropToGridRatio() {
  const normalizedRatio = gridCropRatio() / sourceAspect();
  const width = normalizedRatio <= 1 ? normalizedRatio * .86 : .86;
  const height = normalizedRatio <= 1 ? .86 : .86 / normalizedRatio;
  setCrop({ x: (1 - width) / 2, y: (1 - height) / 2, width, height, ratio: gridCropRatio() });
}

async function decodeImage(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0);
  return { name: file.name, bitmap, width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, previewUrl: canvas.toDataURL('image/png') };
}

function imageDataUrl(image) {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function updateLivePreview() {
  if (!state.grid) return;
  const grid = view.exportPng(state.grid, $('gridlines-input').checked);
  $('live-grid').src = grid;
  if (state.source && state.processedSource) {
    $('live-original').src = state.source.previewUrl ?? imageDataUrl(state.source);
    $('live-original-label').textContent = '导入原图';
  } else {
    $('live-original').src = view.exportPng(state.grid, false);
    $('live-original-label').textContent = '空白画板';
  }
}

function redraw(updatePreview = true) {
  if (!state.grid) return;
  view.render(state.grid, { cellSize: Number($('zoom-input').value) || 22, selected: state.selected, gridlines: $('gridlines-input').checked });
  $('undo-button').disabled = !state.history?.canUndo;
  $('redo-button').disabled = !state.history?.canRedo;
  updateWorkspaceLabels();
  if (updatePreview) updateLivePreview();
}

function resetBlankGrid(message = '已创建空白画板') {
  const { rows, cols } = getOptions();
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows * cols > 14400) throw new RangeError('网格尺寸需在 2 到 14,400 格之间。');
  state.source = null; state.processedSource = null; state.selected = null; state.paletteSelection = null;
  state.grid = createBlankGrid(rows, cols);
  state.history = new EditHistory(state.grid.cells);
  state.palette = QUICK_PALETTE.map(hexToRgb);
  renderImagePalette(); redraw(); setStatus(message);
}

async function regenerate() {
  if (!state.source) { resetBlankGrid(); return; }
  const { rows, cols, mode, detail, paletteColors, brightness, contrast, saturation, temperature, hue, distance, fit, resample, transparent, simplify } = getOptions();
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows * cols > 14400) throw new RangeError('网格尺寸需在 2 到 14,400 格之间。');
  const source = cropImageData(state.source.data, state.source.width, state.source.height, state.crop);
  const fitted = fitImageData(source, cols / rows, fit, transparent);
  const opaque = replaceTransparentPixels(fitted, transparent);
  const direct = simplify === 'direct'; const lineart = simplify === 'lineart';
  state.processedSource = adjustImageData(opaque, { brightness, contrast, saturation, temperature, hue });
  const samplingSource = direct || lineart ? state.processedSource : resampleImageData(state.processedSource, Math.max(cols * 4, 64), Math.max(rows * 4, 64), resample);
  const sampledGrid = lineart
    ? imageDataToLineGrid(samplingSource.data, samplingSource.width, samplingSource.height, rows, cols)
    : imageDataToGrid(samplingSource.data, samplingSource.width, samplingSource.height, rows, cols, mode, detail);
  const requestedColors = paletteColors === 'original' ? null : resolvePaletteSize(paletteColors, rows, cols, simplify);
  if (lineart) state.grid = getBoardMode() === 'fixed40'
    ? mapGridToPalette(sampledGrid, enabledFixedPalette().map(hexToRgb), 'weighted-rgb')
    : sampledGrid;
  else if (direct && getBoardMode() === 'fixed40') {
    const available = enabledFixedPalette(); const palette = requestedColors ? selectUsedPalette(sampledGrid, available, requestedColors) : available;
    state.grid = mapGridToPalette(sampledGrid, palette.map(hexToRgb), 'weighted-rgb');
  } else if (direct && requestedColors) {
    const palette = createGridPalette(sampledGrid.cells, requestedColors, samplingSource, detail);
    state.grid = mapGridToPalette(sampledGrid, palette, 'weighted-rgb');
  } else if (direct) state.grid = sampledGrid;
  else {
    const palette = getBoardMode() === 'fixed40'
      ? enabledFixedPalette().map(hexToRgb)
      : createGridPalette(sampledGrid.cells, resolvePaletteSize(paletteColors, rows, cols, simplify), samplingSource, detail);
    state.grid = simplifyGrid(mapGridToPalette(sampledGrid, palette, distance), simplify);
  }
  state.history = new EditHistory(state.grid.cells); state.selected = null;
  if (getBoardMode() !== 'fixed40') state.palette = [...new Set(state.grid.cells)].map(hexToRgb);
  renderImagePalette(); redraw();
  setStatus(lineart
    ? `已生成 ${rows} × ${cols} 黑白线稿，使用 ${new Set(state.grid.cells).size} 个灰阶颜色`
    : direct
    ? `已直接网格化为 ${rows} × ${cols}，使用 ${new Set(state.grid.cells).size} 种${getBoardMode() === 'fixed40' ? '固定色板' : ''}颜色`
    : `已生成 ${rows} × ${cols} 网格，使用 ${new Set(state.grid.cells).size} 种颜色${simplify === 'none' ? '' : '，已整理零散色块'}`);
}

function updateProcessingControls() {
  const simple = ['direct', 'lineart'].includes($('simplify-input').value);
  for (const id of ['distance-input', 'resample-input', 'detail-input']) $(id).disabled = simple;
  $('palette-colors-input').disabled = $('simplify-input').value === 'lineart';
  $('palette-colors-custom').disabled = $('simplify-input').value === 'lineart';
  $('sampling-input').disabled = $('simplify-input').value === 'lineart';
  $('palette-colors-custom').hidden = $('palette-colors-input').value !== 'custom';
}

function normalizeCustomPaletteSize() {
  const input = $('palette-colors-custom');
  const parsed = Number.parseInt(input.value, 10);
  input.value = String(Number.isFinite(parsed) ? Math.max(Number(input.min), Math.min(Number(input.max), parsed)) : 12);
}

function updateSelectedPaletteColor() {
  if (getBoardMode() === 'fixed40' || state.paletteSelection === null || !state.grid) return;
  const color = getColorInputValue().toLowerCase(); if (!validColor(color)) return;
  const previous = rgbToHex(state.palette[state.paletteSelection]); if (previous === color) return;
  const changes = state.grid.cells.flatMap((before, index) => before.toLowerCase() === previous ? [{ index, before, after: color }] : []);
  if (changes.length) { state.history.applyStroke(changes); state.grid.cells = state.history.cells; }
  state.palette[state.paletteSelection] = hexToRgb(color);
  redraw(); renderImagePalette(); setStatus(`已替换 ${changes.length} 个使用 ${previous.toUpperCase()} 的格子`);
}

function drawCrop() {
  if (!state.source) return;
  const canvas = $('crop-canvas'); const context = canvas.getContext('2d'); const scale = Math.min(canvas.width / state.source.width, canvas.height / state.source.height);
  const width = state.source.width * scale; const height = state.source.height * scale; const left = (canvas.width - width) / 2; const top = (canvas.height - height) / 2;
  cropBounds = { left, top, width, height }; context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(state.source.bitmap, left, top, width, height);
  const crop = state.crop; const cropLeft = left + crop.x * width; const cropTop = top + crop.y * height; const cropWidth = crop.width * width; const cropHeight = crop.height * height;
  context.fillStyle = '#0009'; context.fillRect(left, top, width, height);
  context.drawImage(state.source.bitmap, crop.x * state.source.width, crop.y * state.source.height, crop.width * state.source.width, crop.height * state.source.height, cropLeft, cropTop, cropWidth, cropHeight);
  context.save(); context.beginPath(); context.rect(cropLeft, cropTop, cropWidth, cropHeight); context.clip();
  const cols = Math.min(state.grid?.cols ?? 24, 120); const rows = Math.min(state.grid?.rows ?? 24, 120);
  context.strokeStyle = '#ffffff9c'; context.lineWidth = 1;
  for (let column = 1; column < cols; column += 1) { const x = cropLeft + cropWidth * column / cols; context.beginPath(); context.moveTo(x, cropTop); context.lineTo(x, cropTop + cropHeight); context.stroke(); }
  for (let row = 1; row < rows; row += 1) { const y = cropTop + cropHeight * row / rows; context.beginPath(); context.moveTo(cropLeft, y); context.lineTo(cropLeft + cropWidth, y); context.stroke(); }
  context.restore(); context.strokeStyle = '#3de1d0'; context.lineWidth = 3; context.strokeRect(cropLeft, cropTop, cropWidth, cropHeight);
  context.fillStyle = '#ffffff'; context.strokeStyle = '#0d8176'; context.lineWidth = 2;
  [[cropLeft,cropTop],[cropLeft + cropWidth / 2,cropTop],[cropLeft + cropWidth,cropTop],[cropLeft,cropTop + cropHeight / 2],[cropLeft + cropWidth,cropTop + cropHeight / 2],[cropLeft,cropTop + cropHeight],[cropLeft + cropWidth / 2,cropTop + cropHeight],[cropLeft + cropWidth,cropTop + cropHeight]].forEach(([x, y]) => { context.fillRect(x - 5, y - 5, 10, 10); context.strokeRect(x - 5, y - 5, 10, 10); });
}

function cropPoint(event) {
  const rect = $('crop-canvas').getBoundingClientRect(); const x = (event.clientX - rect.left) * ($('crop-canvas').width / rect.width); const y = (event.clientY - rect.top) * ($('crop-canvas').height / rect.height);
  return { x: Math.max(0, Math.min(1, (x - cropBounds.left) / cropBounds.width)), y: Math.max(0, Math.min(1, (y - cropBounds.top) / cropBounds.height)) };
}

const layoutKey = 'pictile-layout-widths'; const layoutSizes = { settings: 276, sidebar: 286 };
function applyLayoutSizes() { layoutSizes.settings = Math.max(230, Math.min(420, Number(layoutSizes.settings) || 276)); layoutSizes.sidebar = Math.max(250, Math.min(420, Number(layoutSizes.sidebar) || 286)); $('workspace').style.setProperty('--settings-width', `${layoutSizes.settings}px`); $('workspace').style.setProperty('--history-width', `${layoutSizes.sidebar}px`); }
function persistLayoutSizes() { localStorage.setItem(layoutKey, JSON.stringify(layoutSizes)); }
function resizePanel(key, delta) { const [min, max] = key === 'settings' ? [230, 420] : [250, 420]; layoutSizes[key] = Math.round(Math.max(min, Math.min(max, layoutSizes[key] + delta))); applyLayoutSizes(); }
function setupResizablePanels() {
  try { Object.assign(layoutSizes, JSON.parse(localStorage.getItem(layoutKey) || '{}')); } catch { /* Use defaults. */ }
  applyLayoutSizes();
  for (const [id, key, direction] of [['settings-resize', 'settings', 1], ['sidebar-resize', 'sidebar', -1]]) {
    const handle = $(id); handle.addEventListener('pointerdown', (event) => {
      if (matchMedia('(max-width: 1100px)').matches) return;
      const startX = event.clientX; const initial = layoutSizes[key]; handle.setPointerCapture(event.pointerId);
      const move = (moveEvent) => { layoutSizes[key] = initial; resizePanel(key, (moveEvent.clientX - startX) * direction); };
      const finish = () => { handle.removeEventListener('pointermove', move); persistLayoutSizes(); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', finish, { once: true }); handle.addEventListener('pointercancel', finish, { once: true });
    });
  }
}

function scheduleRegenerate() {
  clearTimeout(regenerateTimer); regenerateTimer = setTimeout(() => regenerate().catch((error) => setStatus(error.message, true)), 180);
}

$('image-input').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0]; if (!file) return;
    state.source = await decodeImage(file); state.crop = { x: 0, y: 0, width: 1, height: 1, ratio: 'free' }; await regenerate();
  } catch (error) { setStatus(error.message || '无法读取该图片。', true); }
});
$('import-button').onclick = () => $('image-input').click();
$('blank-grid-button').onclick = () => resetBlankGrid('已切换到空白画板');
$('regenerate-button').onclick = () => regenerate().catch((error) => setStatus(error.message, true));
$('crop-button').onclick = () => { if (!state.source) { setStatus('请先导入图片后再裁切。'); return; } cropBeforeDialog = { ...state.crop }; resetCropToGridRatio(); $('crop-grid-label').textContent = `${state.grid.rows} × ${state.grid.cols} 网格比例`; drawCrop(); $('crop-dialog').showModal(); };
$('cancel-crop-button').onclick = () => { if (cropBeforeDialog) state.crop = cropBeforeDialog; cropBeforeDialog = null; $('crop-dialog').close(); };
$('apply-crop-button').onclick = async () => { cropBeforeDialog = null; $('crop-dialog').close(); await regenerate(); };

for (const id of ['rows-input', 'cols-input']) $(id).addEventListener('change', scheduleRegenerate);
for (const id of ['sampling-input', 'palette-colors-input', 'detail-input', 'brightness-input', 'contrast-input', 'saturation-input', 'temperature-input', 'hue-adjust-input', 'distance-input', 'fit-input', 'resample-input', 'transparent-input', 'simplify-input']) {
  $(id).addEventListener('change', scheduleRegenerate);
  if ($(id).type === 'range') $(id).addEventListener('input', scheduleRegenerate);
}
document.querySelectorAll('input[name="board-mode"]').forEach((input) => input.addEventListener('change', () => {
  state.paletteSelection = null;
  if (getBoardMode() === 'fixed40' && !enabledFixedPalette().includes(getColorInputValue().toLowerCase())) updateColorUi(enabledFixedPalette()[0]);
  updateProcessingControls(); renderImagePalette(); redraw(); if (state.source) scheduleRegenerate();
}));
$('palette-manage-input').addEventListener('change', () => renderImagePalette());
$('palette-edit-input').addEventListener('change', () => { state.paletteSelection = null; renderImagePalette(); });
$('simplify-input').addEventListener('change', updateProcessingControls);
$('palette-colors-input').addEventListener('change', updateProcessingControls);
$('palette-colors-custom').addEventListener('input', scheduleRegenerate);
$('palette-colors-custom').addEventListener('change', () => { normalizeCustomPaletteSize(); scheduleRegenerate(); });
$('palette-colors-custom').addEventListener('blur', normalizeCustomPaletteSize);
$('gridlines-input').addEventListener('change', () => redraw());
$('zoom-input').addEventListener('input', () => { $('zoom-value').value = `${$('zoom-input').value} px`; redraw(false); });
const canvasScroll = document.querySelector('.canvas-scroll');

function isTextEntryTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, select, textarea, [contenteditable="true"]'));
}

function finishCanvasPan(event) {
  if (!canvasPan || (event?.pointerId !== undefined && event.pointerId !== canvasPan.pointerId)) return;
  if (canvasScroll.hasPointerCapture(canvasPan.pointerId)) canvasScroll.releasePointerCapture(canvasPan.pointerId);
  canvasPan = null;
  canvasScroll.classList.remove('is-panning');
  canvasScroll.classList.toggle('is-pan-ready', spacePressed);
}

canvasScroll.addEventListener('pointerdown', (event) => {
  if (event.button !== 1 && !(event.button === 0 && spacePressed)) return;
  event.preventDefault(); event.stopPropagation();
  canvasPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: canvasScroll.scrollLeft, top: canvasScroll.scrollTop };
  canvasScroll.setPointerCapture(event.pointerId);
  canvasScroll.classList.add('is-panning');
}, { capture: true });
canvasScroll.addEventListener('pointermove', (event) => {
  if (!canvasPan || event.pointerId !== canvasPan.pointerId) return;
  event.preventDefault(); event.stopPropagation();
  canvasScroll.scrollLeft = canvasPan.left - (event.clientX - canvasPan.x);
  canvasScroll.scrollTop = canvasPan.top - (event.clientY - canvasPan.y);
}, { capture: true });
canvasScroll.addEventListener('pointerup', finishCanvasPan, { capture: true });
canvasScroll.addEventListener('pointercancel', finishCanvasPan, { capture: true });
canvasScroll.addEventListener('auxclick', (event) => { if (event.button === 1) event.preventDefault(); });

$('grid-canvas').addEventListener('wheel', (event) => {
  event.preventDefault();
  const zoom = $('zoom-input'); const previous = Number(zoom.value);
  const next = Math.max(Number(zoom.min), Math.min(Number(zoom.max), previous + (event.deltaY < 0 ? 1 : -1)));
  if (next === previous) return;
  const canvas = $('grid-canvas'); const canvasRect = canvas.getBoundingClientRect();
  const anchor = { x: (event.clientX - canvasRect.left) / previous, y: (event.clientY - canvasRect.top) / previous };
  zoom.value = next; $('zoom-value').value = `${next} px`; redraw(false);
  const scroll = document.querySelector('.canvas-scroll'); const nextRect = canvas.getBoundingClientRect();
  scroll.scrollLeft += nextRect.left + anchor.x * next - event.clientX;
  scroll.scrollTop += nextRect.top + anchor.y * next - event.clientY;
}, { passive: false });

$('hue-input').oninput = () => { if (getBoardMode() === 'fixed40') return; const { saturation, brightness } = hexToHsb(getColorInputValue()); updateColorUi(hsbToHex(Number($('hue-input').value), saturation, brightness)); };
$('hue-input').addEventListener('change', updateSelectedPaletteColor);
$('color-input').addEventListener('input', (event) => { updateColorUi(event.target.value); if (validColor(event.target.value)) updateSelectedPaletteColor(); });
$('color-input').addEventListener('change', (event) => { updateColorUi(event.target.value); updateSelectedPaletteColor(); });
$('color-square').onpointerdown = (event) => { $('color-square').setPointerCapture(event.pointerId); setColorFromPicker(event); };
$('color-square').onpointermove = (event) => { if (event.buttons) setColorFromPicker(event); };
$('color-square').onpointerup = updateSelectedPaletteColor;
$('theme-toggle').onclick = () => {
  const dark = document.body.classList.toggle('is-dark');
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
  $('theme-toggle').textContent = dark ? '☀' : '◐';
  localStorage.setItem('pictile-theme', dark ? 'dark' : 'light');
};
$('settings-open').onclick = () => $('settings-content').classList.toggle('is-open');
$('settings-close').onclick = () => $('settings-content').classList.remove('is-open');
$('grid-toggle').onclick = () => { $('gridlines-input').checked = !$('gridlines-input').checked; redraw(); };

function setEditMode(mode) {
  const input = document.querySelector(`input[name="edit-mode"][value="${mode}"]`);
  if (!input) return;
  input.checked = true;
  document.querySelectorAll('.edit-mode-button').forEach((item) => item.classList.toggle('is-active', item.dataset.editMode === mode));
  $('preview-content').classList.toggle('is-eyedropper', mode === 'eyedropper');
}

document.querySelectorAll('.edit-mode-button').forEach((button) => button.addEventListener('click', () => {
  setEditMode(button.dataset.editMode);
}));
document.querySelectorAll('input[name="edit-mode"]').forEach((input) => input.addEventListener('change', () => setEditMode(input.value)));

function pickOriginalColor(event) {
  if (getEditMode() !== 'eyedropper') return;
  if (!state.source) { setStatus('请先导入图片后再从原图取色。'); return; }
  const image = $('live-original'); const rect = image.getBoundingClientRect();
  const contentLeft = rect.left + image.clientLeft; const contentTop = rect.top + image.clientTop;
  const scale = Math.min(image.clientWidth / state.source.width, image.clientHeight / state.source.height);
  const displayWidth = state.source.width * scale; const displayHeight = state.source.height * scale;
  const left = contentLeft + (image.clientWidth - displayWidth) / 2; const top = contentTop + (image.clientHeight - displayHeight) / 2;
  if (event.clientX < left || event.clientX >= left + displayWidth || event.clientY < top || event.clientY >= top + displayHeight) return;
  const x = Math.min(state.source.width - 1, Math.floor((event.clientX - left) / displayWidth * state.source.width));
  const y = Math.min(state.source.height - 1, Math.floor((event.clientY - top) / displayHeight * state.source.height));
  const offset = (y * state.source.width + x) * 4;
  if (state.source.data[offset + 3] === 0) { setStatus('该位置完全透明，请选择原图中的可见区域。'); return; }
  const original = rgbToHex(Array.from(state.source.data.slice(offset, offset + 3)));
  const color = getBoardMode() === 'fixed40'
    ? mapGridToPalette({ rows: 1, cols: 1, cells: [original] }, enabledFixedPalette().map(hexToRgb), 'weighted-rgb').cells[0]
    : original;
  state.paletteSelection = null;
  updateColorUi(color); renderImagePalette(); setEditMode('fill');
  setStatus(getBoardMode() === 'fixed40' ? `已从原图取色 ${original.toUpperCase()}，匹配为固定色 ${color.toUpperCase()}` : `已从原图取色 ${color.toUpperCase()}`);
}

$('live-original').addEventListener('pointerdown', pickOriginalColor);

$('crop-canvas').onpointerdown = (event) => {
  if (!state.source) return; const point = cropPoint(event); const crop = state.crop; const edge = .035;
  cropDrag = { point, crop: { ...crop }, edges: { left: Math.abs(point.x - crop.x) < edge, right: Math.abs(point.x - (crop.x + crop.width)) < edge, top: Math.abs(point.y - crop.y) < edge, bottom: Math.abs(point.y - (crop.y + crop.height)) < edge } }; $('crop-canvas').setPointerCapture(event.pointerId);
};
$('crop-canvas').onpointermove = (event) => {
  if (!cropDrag) return; const point = cropPoint(event); const drag = cropDrag; const crop = { ...drag.crop }; const edges = drag.edges;
  if (!edges.left && !edges.right && !edges.top && !edges.bottom) { crop.x = point.x - (drag.point.x - drag.crop.x); crop.y = point.y - (drag.point.y - drag.crop.y); }
  else if (typeof drag.crop.ratio === 'number') {
    const normalizedRatio = drag.crop.ratio / sourceAspect();
    const horizontalWidth = edges.left ? drag.crop.x + drag.crop.width - point.x : point.x - drag.crop.x;
    const verticalHeight = edges.top ? drag.crop.y + drag.crop.height - point.y : point.y - drag.crop.y;
    const horizontal = edges.left || edges.right; const vertical = edges.top || edges.bottom;
    const width = Math.max(.03, horizontal && vertical ? Math.abs(horizontalWidth - drag.crop.width) >= Math.abs(verticalHeight * normalizedRatio - drag.crop.width) ? horizontalWidth : verticalHeight * normalizedRatio : horizontal ? horizontalWidth : verticalHeight * normalizedRatio);
    crop.width = width; crop.height = width / normalizedRatio;
    if (edges.left) crop.x = drag.crop.x + drag.crop.width - crop.width;
    if (edges.top) crop.y = drag.crop.y + drag.crop.height - crop.height;
  } else {
    if (edges.left) { crop.x = Math.min(point.x, drag.crop.x + drag.crop.width - .03); crop.width = drag.crop.x + drag.crop.width - crop.x; } else if (edges.right) crop.width = Math.max(.03, point.x - crop.x);
    if (edges.top) { crop.y = Math.min(point.y, drag.crop.y + drag.crop.height - .03); crop.height = drag.crop.y + drag.crop.height - crop.y; } else if (edges.bottom) crop.height = Math.max(.03, point.y - crop.y);
  }
  setCrop(crop); drawCrop();
};
$('crop-canvas').onpointerup = () => { cropDrag = null; };

$('grid-canvas').onpointerdown = (event) => {
  if (event.button !== 0 || spacePressed || canvasPan) return;
  const index = view.hitTest(event); if (index === null) return; const mode = getEditMode();
  if (mode === 'eyedropper') {
    const color = state.grid.cells[index];
    state.paletteSelection = null; state.selected = index;
    updateColorUi(color); renderImagePalette(); setEditMode('fill'); redraw();
    setStatus(`已从网格结果取色 ${color.toUpperCase()}`);
    return;
  }
  if (mode === 'select') { state.selected = index; redraw(false); return; }
  stroke = new Map(); $('grid-canvas').setPointerCapture(event.pointerId); paint(index);
};
$('grid-canvas').onpointermove = (event) => { if (!stroke || spacePressed || canvasPan) return; const index = view.hitTest(event); if (index !== null) paint(index); };
$('grid-canvas').onpointerup = () => { if (!stroke) return; state.history.applyStroke([...stroke.values()]); state.grid.cells = state.history.cells; stroke = null; redraw(); };
function paint(index) { if (stroke.has(index)) return; const after = getColorInputValue(); if (!validColor(after)) return; stroke.set(index, { index, before: state.grid.cells[index], after }); state.grid.cells[index] = after; state.selected = index; redraw(false); }
$('undo-button').onclick = () => { if (!state.history) return; state.grid.cells = state.history.undo(); redraw(); };
$('redo-button').onclick = () => { if (!state.history) return; state.grid.cells = state.history.redo(); redraw(); };
$('export-button').onclick = () => { if (!state.grid) return; const link = document.createElement('a'); link.href = view.exportPng(state.grid, $('gridlines-input').checked); link.download = `${state.source?.name?.replace(/\.[^.]+$/, '') ?? 'pictile-artwork'}-grid.png`; link.click(); };
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || isTextEntryTarget(event.target)) return;
  event.preventDefault();
  if (spacePressed) return;
  spacePressed = true; canvasScroll.classList.add('is-pan-ready');
});
document.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') return;
  spacePressed = false;
  if (!canvasPan) canvasScroll.classList.remove('is-pan-ready');
});
window.addEventListener('blur', () => { spacePressed = false; finishCanvasPan(); canvasScroll.classList.remove('is-pan-ready'); });
document.addEventListener('keydown', (event) => { if (!event.ctrlKey || isTextEntryTarget(event.target)) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); state.grid.cells = event.shiftKey ? state.history.redo() : state.history.undo(); redraw(); } if (key === 'y') { event.preventDefault(); state.grid.cells = state.history.redo(); redraw(); } });

if (localStorage.getItem('pictile-theme') === 'dark') $('theme-toggle').click();
buildQuickPalette(); updateColorUi('#e45a4f'); updateProcessingControls(); setupResizablePanels();
resetBlankGrid('空白画板已就绪，选择颜色后直接开始绘制。');
