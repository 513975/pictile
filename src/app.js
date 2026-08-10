import { createGridPalette, imageDataToGrid, mapGridToPalette, simplifyGrid } from './core/color-grid.js';
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
  crop: { x: 0, y: 0, width: 1, height: 1, ratio: 'free' },
};
const view = new GridCanvas($('grid-canvas'));
let regenerateTimer;
let stroke = null;
let cropDrag = null;
let cropBounds = null;
let cropBeforeDialog = null;

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
    paletteColors: $('palette-colors-input').value,
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
  const requested = value === 'auto' ? automatic : Number(value);
  return Math.min(requested, { light: 24, medium: 16, strong: 12 }[simplify] ?? 64);
}

function getBoardMode() { return document.querySelector('input[name="board-mode"]:checked')?.value ?? 'free'; }

function getEditMode() { return document.querySelector('input[name="edit-mode"]:checked')?.value ?? 'fill'; }

function currentPalette() {
  return getBoardMode() === 'fixed40'
    ? FIXED_40_PALETTE.map(hexToRgb)
    : state.palette.length ? state.palette : QUICK_PALETTE.map(hexToRgb);
}

function updateWorkspaceLabels() {
  const fixed = getBoardMode() === 'fixed40';
  const palette = currentPalette();
  $('palette-title').textContent = fixed ? '固定 40 色' : state.source ? '图像色板' : '自由色板';
  $('palette-count').textContent = `${palette.length} 色`;
  $('palette-description').textContent = fixed
    ? '来自参考色板的 40 个锁定颜色，适合稳定、清晰的像素图。'
    : state.source ? '从图片中提取的实际用色，可选中后继续微调。' : '从当前颜色开始绘制，也可从下方快捷色中选取。';
  $('canvas-mode-label').textContent = fixed ? '固定 40 色绘制' : state.source ? '图像生成后编辑' : '自由绘制';
  $('project-meta').textContent = state.grid ? `${state.grid.rows} × ${state.grid.cols} 网格` : '空白画板';
  $('update-palette-button').hidden = fixed;
  $('palette').hidden = fixed;
  $('color-input').disabled = fixed;
  $('hue-input').disabled = fixed;
  $('color-square').classList.toggle('is-locked', fixed);
}

function renderImagePalette(nextPalette) {
  if (nextPalette) {
    state.palette = nextPalette.map((rgb) => [...rgb]);
    state.paletteSelection = null;
  }
  const fixed = getBoardMode() === 'fixed40';
  const palette = currentPalette();
  $('image-palette').replaceChildren(...palette.map((rgb, index) => {
    const color = rgbToHex(rgb);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `palette-swatch${state.paletteSelection === index ? ' is-selected' : ''}${fixed ? ' is-locked' : ''}`;
    button.style.backgroundColor = color;
    button.title = fixed ? `${color}（固定颜色）` : color;
    button.setAttribute('aria-label', `使用 ${color}`);
    button.onclick = () => {
      state.paletteSelection = index;
      updateColorUi(color);
      renderImagePalette();
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
    button.title = color;
    button.setAttribute('aria-label', `使用 ${color}`);
    button.onclick = () => { state.paletteSelection = null; updateColorUi(color); renderImagePalette(); };
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
  $('update-palette-button').disabled = state.paletteSelection === null || getBoardMode() === 'fixed40';
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
  return { name: file.name, bitmap, width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
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
    $('live-original').src = imageDataUrl(state.processedSource);
    $('live-original-label').textContent = '处理后的原图';
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
  const resized = resampleImageData(opaque, Math.max(cols * 4, 64), Math.max(rows * 4, 64), resample);
  state.processedSource = adjustImageData(resized, { brightness, contrast, saturation, temperature, hue });
  const sampledGrid = imageDataToGrid(state.processedSource.data, state.processedSource.width, state.processedSource.height, rows, cols, mode, detail);
  const palette = getBoardMode() === 'fixed40'
    ? FIXED_40_PALETTE.map(hexToRgb)
    : createGridPalette(sampledGrid.cells, resolvePaletteSize(paletteColors, rows, cols, simplify), state.processedSource, detail);
  state.grid = simplifyGrid(mapGridToPalette(sampledGrid, palette, distance), simplify);
  state.history = new EditHistory(state.grid.cells); state.selected = null;
  if (getBoardMode() !== 'fixed40') state.palette = [...new Set(state.grid.cells)].map(hexToRgb);
  renderImagePalette(); redraw();
  setStatus(`已生成 ${rows} × ${cols} 网格，使用 ${new Set(state.grid.cells).size} 种颜色${simplify === 'none' ? '' : '，已整理零散色块'}`);
}

function updateSelectedPaletteColor() {
  if (getBoardMode() === 'fixed40' || state.paletteSelection === null || !state.grid) return;
  const color = getColorInputValue(); if (!validColor(color)) return;
  const nextPalette = state.palette.map((rgb, index) => index === state.paletteSelection ? hexToRgb(color) : [...rgb]);
  const nextGrid = mapGridToPalette(state.grid, nextPalette, getOptions().distance);
  const changes = nextGrid.cells.flatMap((after, index) => after === state.grid.cells[index] ? [] : [{ index, before: state.grid.cells[index], after }]);
  if (changes.length) { state.history.applyStroke(changes); state.grid.cells = state.history.cells; state.palette = nextPalette; redraw(); }
  renderImagePalette([...new Set(state.grid.cells)].map(hexToRgb));
  setStatus('已更新选中色板');
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
  if (getBoardMode() === 'fixed40' && !FIXED_40_PALETTE.includes(getColorInputValue().toLowerCase())) updateColorUi(FIXED_40_PALETTE[0]);
  renderImagePalette(); redraw(); if (state.source) scheduleRegenerate();
}));
$('gridlines-input').addEventListener('change', () => redraw());
$('zoom-input').addEventListener('input', () => { $('zoom-value').value = `${$('zoom-input').value} px`; redraw(false); });
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
const syncColorInput = (event) => updateColorUi(event.target.value);
$('color-input').addEventListener('input', syncColorInput); $('color-input').addEventListener('change', syncColorInput);
$('color-square').onpointerdown = (event) => { $('color-square').setPointerCapture(event.pointerId); setColorFromPicker(event); };
$('color-square').onpointermove = (event) => { if (event.buttons) setColorFromPicker(event); };
$('update-palette-button').onclick = updateSelectedPaletteColor;
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
document.querySelectorAll('.edit-mode-button').forEach((button) => button.addEventListener('click', () => {
  const input = document.querySelector(`input[name="edit-mode"][value="${button.dataset.editMode}"]`);
  if (!input) return;
  input.checked = true;
  document.querySelectorAll('.edit-mode-button').forEach((item) => item.classList.toggle('is-active', item === button));
}));

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
  const index = view.hitTest(event); if (index === null) return; const mode = getEditMode();
  if (mode === 'eyedropper') { updateColorUi(state.grid.cells[index]); document.querySelector('input[name="edit-mode"][value="fill"]').checked = true; document.querySelectorAll('.edit-mode-button').forEach((item) => item.classList.toggle('is-active', item.dataset.editMode === 'fill')); state.selected = index; redraw(); return; }
  if (mode === 'select') { state.selected = index; redraw(false); return; }
  stroke = new Map(); $('grid-canvas').setPointerCapture(event.pointerId); paint(index);
};
$('grid-canvas').onpointermove = (event) => { if (!stroke) return; const index = view.hitTest(event); if (index !== null) paint(index); };
$('grid-canvas').onpointerup = () => { if (!stroke) return; state.history.applyStroke([...stroke.values()]); state.grid.cells = state.history.cells; stroke = null; redraw(); };
function paint(index) { if (stroke.has(index)) return; const after = getColorInputValue(); if (!validColor(after)) return; stroke.set(index, { index, before: state.grid.cells[index], after }); state.grid.cells[index] = after; state.selected = index; redraw(false); }
$('undo-button').onclick = () => { if (!state.history) return; state.grid.cells = state.history.undo(); redraw(); };
$('redo-button').onclick = () => { if (!state.history) return; state.grid.cells = state.history.redo(); redraw(); };
$('export-button').onclick = () => { if (!state.grid) return; const link = document.createElement('a'); link.href = view.exportPng(state.grid, $('gridlines-input').checked); link.download = `${state.source?.name?.replace(/\.[^.]+$/, '') ?? 'pictile-artwork'}-grid.png`; link.click(); };
document.addEventListener('keydown', (event) => { if (!event.ctrlKey || event.target.closest('input, select, textarea')) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); state.grid.cells = event.shiftKey ? state.history.redo() : state.history.undo(); redraw(); } if (key === 'y') { event.preventDefault(); state.grid.cells = state.history.redo(); redraw(); } });

if (localStorage.getItem('pictile-theme') === 'dark') $('theme-toggle').click();
buildQuickPalette(); updateColorUi('#e45a4f'); setupResizablePanels();
resetBlankGrid('空白画板已就绪，选择颜色后直接开始绘制。');
