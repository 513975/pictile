import { cloneGrid, imageDataToGrid, validateGrid } from './core/color-grid.js';
import { EditHistory } from './core/edit-history.js';
import { deleteVersion, listVersions, openStore, putVersion } from './data/project-store.js';
import { GridCanvas } from './ui/grid-canvas.js';
import { constrainCrop, cropImageData } from './core/crop.js';

const $ = (id) => document.getElementById(id);
const PALETTE = ['#e45a4f', '#f59e0b', '#fde047', '#84cc16', '#14b8a6', '#38bdf8', '#6366f1', '#a855f7', '#f8fafc', '#64748b', '#334155', '#111827'];
const state = { projectId: crypto.randomUUID(), source: null, grid: null, history: null, selected: null, database: null, crop: { x: 0, y: 0, width: 1, height: 1, ratio: 'free' } };
const view = new GridCanvas($('grid-canvas'));
let regenerateTimer;
let stroke = null;
let manuallyEdited = false;
let cropDrag = null;
let cropBounds = null;

function setStatus(message, error = false) {
  $('workspace-status').textContent = message;
  $('workspace-status').className = `status${error ? ' error' : ''}`;
}

function getOptions() {
  return { rows: Number($('rows-input').value), cols: Number($('cols-input').value), mode: $('sampling-input').value, detail: $('detail-input').checked };
}

function sourceAspect() {
  return state.source ? state.source.width / state.source.height : 1;
}

function setCrop(crop) {
  state.crop = constrainCrop(crop, crop.ratio ?? state.crop.ratio, sourceAspect());
}

async function decodeImage(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  return { name: file.name, bitmap, width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

function redraw() {
  if (!state.grid) return;
  view.render(state.grid, { cellSize: Number($('zoom-input').value) || 22, selected: state.selected, gridlines: $('gridlines-input').checked });
  $('undo-button').disabled = !state.history?.canUndo;
  $('redo-button').disabled = !state.history?.canRedo;
  updateLivePreview();
}

function imageDataUrl(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function updateLivePreview() {
  if (!state.source || !state.grid) return;
  const original = imageDataUrl(cropImageData(state.source.data, state.source.width, state.source.height, state.crop));
  const grid = view.exportPng(state.grid, $('gridlines-input').checked);
  $('live-original').src = original;
  $('live-grid').src = grid;
  $('compare-original').src = original;
  $('compare-grid').src = grid;
}

async function saveVersion(label) {
  if (!state.database || !validateGrid(state.grid)) return;
  await putVersion(state.database, { id: crypto.randomUUID(), projectId: state.projectId, label, createdAt: Date.now(), grid: cloneGrid(state.grid), crop: { ...state.crop }, thumbnail: view.exportPng(state.grid, false) });
  await renderVersions();
}

function historyButton(label, variant, handler) {
  const button = document.createElement('sl-button');
  button.textContent = label;
  button.size = 'small';
  if (variant) button.variant = variant;
  button.addEventListener('click', handler);
  return button;
}

async function renderVersions() {
  const versions = state.database ? await listVersions(state.database, state.projectId) : [];
  $('history-list').replaceChildren(...versions.map((version) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    const thumbnail = document.createElement('img');
    thumbnail.className = 'history-thumb'; thumbnail.alt = version.label; thumbnail.src = version.thumbnail;
    const content = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = version.label;
    const time = document.createElement('p'); time.textContent = new Date(version.createdAt).toLocaleString();
    const actions = document.createElement('div'); actions.className = 'history-actions';
    actions.append(
      historyButton('恢复', 'primary', async () => {
        await saveVersion('恢复前');
        state.grid = cloneGrid(version.grid);
        setCrop(version.crop ?? { x: 0, y: 0, width: 1, height: 1, ratio: 'free' });
        state.history = new EditHistory(state.grid.cells); state.selected = null; manuallyEdited = true;
        redraw(); await saveVersion('已恢复版本'); setStatus('已恢复历史版本及裁切区域');
      }),
      historyButton('删除', 'default', async () => { await deleteVersion(state.database, version.id); await renderVersions(); }),
    );
    content.append(title, time, actions); item.append(thumbnail, content);
    return item;
  }));
}

async function regenerate() {
  const { rows, cols, mode, detail } = getOptions();
  if (!state.source) return;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows * cols > 14400) throw new RangeError('网格尺寸需在 2 到 14,400 格之间。');
  const source = cropImageData(state.source.data, state.source.width, state.source.height, state.crop);
  state.grid = imageDataToGrid(source.data, source.width, source.height, rows, cols, mode, detail);
  state.history = new EditHistory(state.grid.cells); state.selected = null; manuallyEdited = false;
  redraw(); await saveVersion('重新生成'); setStatus(`已生成 ${rows} x ${cols} 拼图`);
}

function hsbToHex(hue, saturation, brightness) {
  const c = brightness * saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = brightness - c;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsb(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi)?.map((part) => parseInt(part, 16) / 255) ?? [0, 0, 0];
  const max = Math.max(...values), min = Math.min(...values), d = max - min;
  let hue = 0;
  if (d) hue = max === values[0] ? 60 * (((values[1] - values[2]) / d + 6) % 6) : max === values[1] ? 60 * ((values[2] - values[0]) / d + 2) : 60 * ((values[0] - values[1]) / d + 4);
  return { hue: Math.round(hue), saturation: max ? d / max : 0, brightness: max };
}

function validColor(value) { return /^#[0-9a-f]{6}$/i.test(value); }

function updateColorUi(color = $('color-input').value) {
  if (!validColor(color)) return;
  const { hue, saturation, brightness } = hexToHsb(color);
  $('color-input').value = color.toLowerCase(); $('hue-input').value = hue;
  $('color-square').style.setProperty('--hue', `hsl(${hue} 100% 50%)`);
  $('color-square-handle').style.left = `${saturation * 100}%`;
  $('color-square-handle').style.top = `${(1 - brightness) * 100}%`;
  $('color-swatch').style.background = color;
}

function setColorFromPicker(event) {
  const rect = $('color-square').getBoundingClientRect();
  const saturation = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const brightness = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const color = hsbToHex(Number($('hue-input').value), saturation, brightness);
  updateColorUi(color);
}

function buildPalette() {
  $('palette').replaceChildren(...PALETTE.map((color) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'palette-swatch'; button.style.background = color; button.title = color; button.setAttribute('aria-label', `使用 ${color}`);
    button.onclick = () => updateColorUi(color); return button;
  }));
}

function drawCrop() {
  const canvas = $('crop-canvas'); const context = canvas.getContext('2d');
  const scale = Math.min(canvas.width / state.source.width, canvas.height / state.source.height);
  const width = state.source.width * scale; const height = state.source.height * scale;
  const left = (canvas.width - width) / 2; const top = (canvas.height - height) / 2;
  cropBounds = { left, top, width, height };
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.source.bitmap, left, top, width, height);
  const c = state.crop; context.fillStyle = '#0009'; context.fillRect(left, top, width, height);
  context.drawImage(state.source.bitmap, c.x * state.source.width, c.y * state.source.height, c.width * state.source.width, c.height * state.source.height, left + c.x * width, top + c.y * height, c.width * width, c.height * height);
  context.strokeStyle = '#fff'; context.lineWidth = 3; context.strokeRect(left + c.x * width, top + c.y * height, c.width * width, c.height * height);
  context.fillStyle = '#fff';
  for (const [x, y] of [[c.x, c.y], [c.x + c.width, c.y], [c.x, c.y + c.height], [c.x + c.width, c.y + c.height]]) context.fillRect(left + x * width - 5, top + y * height - 5, 10, 10);
}

function cropPoint(event) {
  const rect = $('crop-canvas').getBoundingClientRect();
  const x = (event.clientX - rect.left) * ($('crop-canvas').width / rect.width);
  const y = (event.clientY - rect.top) * ($('crop-canvas').height / rect.height);
  return { x: Math.max(0, Math.min(1, (x - cropBounds.left) / cropBounds.width)), y: Math.max(0, Math.min(1, (y - cropBounds.top) / cropBounds.height)) };
}

function setPreset(ratio) {
  const target = ratio === 'free' ? null : { square: 1, '4:3': 4 / 3, '16:9': 16 / 9 }[ratio];
  if (!target) setCrop({ ...state.crop, ratio });
  else {
    const normalizedRatio = target / sourceAspect();
    const width = Math.min(0.86, 0.86 * normalizedRatio);
    const height = width / normalizedRatio;
    setCrop({ x: (1 - width) / 2, y: (1 - height) / 2, width, height, ratio });
  }
  drawCrop();
  document.querySelectorAll('.crop-preset').forEach((button) => button.variant = button.dataset.ratio === ratio ? 'primary' : 'default');
}

function openDrawer(drawerId, contentId) {
  const drawer = $(drawerId); const content = $(contentId);
  const placeholder = document.createComment(`${contentId} position`);
  content.replaceWith(placeholder); drawer.append(content); drawer.show();
  drawer.addEventListener('sl-after-hide', () => placeholder.replaceWith(content), { once: true });
}

$('image-input').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0]; if (!file) return;
    state.source = await decodeImage(file); state.crop = { x: 0, y: 0, width: 1, height: 1, ratio: 'free' };
    $('upload-screen').hidden = true; $('workspace').hidden = false; document.querySelector('.mobile-actions').hidden = false;
    state.database = await openStore().catch(() => null);
    if (!state.database) setStatus('历史记录不可用，但当前编辑仍可继续。', true);
    await regenerate();
  } catch (error) { $('upload-error').textContent = error.message || '无法读取该图片。'; $('upload-error').hidden = false; }
});

$('regenerate-button').onclick = () => regenerate().catch((error) => setStatus(error.message, true));
for (const id of ['rows-input', 'cols-input', 'sampling-input', 'detail-input']) $(id).addEventListener('sl-change', () => { if (manuallyEdited) return; clearTimeout(regenerateTimer); regenerateTimer = setTimeout(() => regenerate().catch((error) => setStatus(error.message, true)), 250); });
$('crop-button').onclick = () => { drawCrop(); setPreset(state.crop.ratio); $('crop-dialog').show(); };
$('cancel-crop-button').onclick = () => $('crop-dialog').hide();
$('apply-crop-button').onclick = async () => { $('crop-dialog').hide(); await regenerate(); };
document.querySelectorAll('.crop-preset').forEach((button) => button.onclick = () => setPreset(button.dataset.ratio));

$('crop-canvas').onpointerdown = (event) => {
  const point = cropPoint(event); const c = state.crop; const edge = 0.035;
  cropDrag = { point, crop: { ...c }, edges: { left: Math.abs(point.x - c.x) < edge, right: Math.abs(point.x - (c.x + c.width)) < edge, top: Math.abs(point.y - c.y) < edge, bottom: Math.abs(point.y - (c.y + c.height)) < edge } };
  $('crop-canvas').setPointerCapture(event.pointerId);
};
$('crop-canvas').onpointermove = (event) => {
  if (!cropDrag) return;
  const point = cropPoint(event); const d = cropDrag; const c = { ...d.crop }; const e = d.edges;
  if (e.left) { c.x = Math.min(point.x, d.crop.x + d.crop.width - .03); c.width = d.crop.x + d.crop.width - c.x; } else if (e.right) c.width = Math.max(.03, point.x - c.x);
  if (e.top) { c.y = Math.min(point.y, d.crop.y + d.crop.height - .03); c.height = d.crop.y + d.crop.height - c.y; } else if (e.bottom) c.height = Math.max(.03, point.y - c.y);
  if (!e.left && !e.right && !e.top && !e.bottom) { c.x = point.x - (d.point.x - d.crop.x); c.y = point.y - (d.point.y - d.crop.y); }
  setCrop(c); drawCrop();
};
$('crop-canvas').onpointerup = () => { cropDrag = null; };

$('zoom-input').addEventListener('sl-input', redraw);
$('gridlines-input').addEventListener('sl-change', redraw);
$('save-version-button').onclick = () => saveVersion('手动保存').catch((error) => setStatus(error.message, true));
$('compare-button').onclick = () => $('compare-dialog').show();
document.querySelector('[data-close-dialog]').onclick = () => $('compare-dialog').hide();

$('hue-input').oninput = () => { const { saturation, brightness } = hexToHsb($('color-input').value); updateColorUi(hsbToHex(Number($('hue-input').value), saturation, brightness)); };
$('color-input').addEventListener('sl-change', () => updateColorUi($('color-input').value));
$('color-square').onpointerdown = (event) => { $('color-square').setPointerCapture(event.pointerId); setColorFromPicker(event); };
$('color-square').onpointermove = (event) => { if (event.buttons) setColorFromPicker(event); };
buildPalette(); updateColorUi();

$('grid-canvas').onpointerdown = (event) => {
  const index = view.hitTest(event); if (index === null) return;
  const mode = $('edit-mode').value;
  if (mode === 'eyedropper') { updateColorUi(state.grid.cells[index]); $('edit-mode').value = 'fill'; state.selected = index; redraw(); return; }
  if (mode === 'select') { state.selected = index; redraw(); return; }
  stroke = new Map(); $('grid-canvas').setPointerCapture(event.pointerId); paint(index);
};
$('grid-canvas').onpointermove = (event) => { if (!stroke) return; const index = view.hitTest(event); if (index !== null) paint(index); };
$('grid-canvas').onpointerup = () => {
  if (!stroke) return;
  state.history.applyStroke([...stroke.values()]); state.grid.cells = state.history.cells; stroke = null; manuallyEdited = true; redraw();
};
function paint(index) { if (stroke.has(index)) return; const after = $('color-input').value; stroke.set(index, { index, before: state.grid.cells[index], after }); state.grid.cells[index] = after; state.selected = index; redraw(); }
$('undo-button').onclick = () => { state.grid.cells = state.history.undo(); redraw(); };
$('redo-button').onclick = () => { state.grid.cells = state.history.redo(); redraw(); };
$('export-button').onclick = () => { const link = document.createElement('a'); link.href = view.exportPng(state.grid, $('gridlines-input').checked); link.download = `${state.source.name.replace(/\.[^.]+$/, '')}-puzzle.png`; link.click(); };
document.addEventListener('keydown', (event) => { if (!event.ctrlKey || event.target.closest('sl-input, sl-select')) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); state.grid.cells = event.shiftKey ? state.history.redo() : state.history.undo(); redraw(); } if (key === 'y') { event.preventDefault(); state.grid.cells = state.history.redo(); redraw(); } });

$('open-settings').onclick = () => openDrawer('settings-drawer', 'settings-content');
$('open-preview').onclick = () => openDrawer('preview-drawer', 'preview-content');
$('open-history').onclick = () => openDrawer('history-drawer', 'history-content');
