import { cloneGrid, imageDataToGrid, validateGrid } from './core/color-grid.js';
import { EditHistory } from './core/edit-history.js';
import { deleteVersion, listVersions, openStore, putVersion } from './data/project-store.js';
import { GridCanvas } from './ui/grid-canvas.js';

const $ = (id) => document.getElementById(id);
const state = { projectId: crypto.randomUUID(), source: null, grid: null, history: null, selected: null, database: null };
const view = new GridCanvas($('grid-canvas'));

function setStatus(message, error = false) {
  $('workspace-status').textContent = message;
  $('workspace-status').className = `status${error ? ' error' : ''}`;
}

function getOptions() {
  return { rows: Number($('rows-input').value), cols: Number($('cols-input').value), mode: $('sampling-input').value, detail: $('detail-input').checked };
}

async function decodeImage(file) {
  const image = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return { name: file.name, width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

function redraw() {
  if (!state.grid) return;
  view.render(state.grid, { cellSize: Number($('zoom-input').value), selected: state.selected, gridlines: $('gridlines-input').checked });
  $('undo-button').disabled = !state.history.canUndo;
  $('redo-button').disabled = !state.history.canRedo;
}

async function saveVersion(label) {
  if (!state.database || !validateGrid(state.grid)) return;
  await putVersion(state.database, { id: crypto.randomUUID(), projectId: state.projectId, label, createdAt: Date.now(), grid: cloneGrid(state.grid), thumbnail: view.exportPng(state.grid, false) });
  await renderVersions();
}

async function renderVersions() {
  const versions = state.database ? await listVersions(state.database, state.projectId) : [];
  $('history-list').replaceChildren(...versions.map((version) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    item.innerHTML = `<img class="history-thumb" alt="${version.label}" src="${version.thumbnail}"><div><p><strong>${version.label}</strong></p><p>${new Date(version.createdAt).toLocaleString()}</p></div>`;
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const restore = document.createElement('button');
    restore.textContent = '恢复';
    restore.onclick = async () => { await saveVersion('恢复前'); state.grid = cloneGrid(version.grid); state.history = new EditHistory(state.grid.cells); state.selected = null; redraw(); await saveVersion('已恢复版本'); setStatus('已恢复历史版本'); };
    const remove = document.createElement('button');
    remove.textContent = '删除';
    remove.onclick = async () => { await deleteVersion(state.database, version.id); await renderVersions(); };
    actions.append(restore, remove); item.lastElementChild.append(actions); return item;
  }));
}

async function regenerate() {
  const { rows, cols, mode, detail } = getOptions();
  if (!state.source) return;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows * cols > 14400) throw new RangeError('网格尺寸需在 2 到 14,400 格之间。');
  state.grid = imageDataToGrid(state.source.data, state.source.width, state.source.height, rows, cols, mode, detail);
  state.history = new EditHistory(state.grid.cells);
  state.selected = null;
  redraw();
  await saveVersion('重新生成');
  setStatus(`已生成 ${rows} x ${cols} 拼图`);
}

$('image-input').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    state.source = await decodeImage(file);
    $('upload-screen').hidden = true;
    $('workspace').hidden = false;
    state.database = await openStore().catch(() => null);
    if (!state.database) setStatus('历史记录不可用，但当前编辑仍可继续。', true);
    await regenerate();
  } catch (error) {
    $('upload-error').textContent = error.message || '无法读取该图片。';
    $('upload-error').hidden = false;
  }
});

$('regenerate-button').onclick = () => regenerate().catch((error) => setStatus(error.message, true));
$('zoom-input').oninput = redraw;
$('gridlines-input').onchange = redraw;
$('save-version-button').onclick = () => saveVersion('手动保存').catch((error) => setStatus(error.message, true));
$('grid-canvas').onclick = (event) => { const index = view.hitTest(event); if (index === null) return; const after = $('color-input').value; state.selected = index; state.history.apply({ index, before: state.grid.cells[index], after }); state.grid.cells = state.history.cells; redraw(); };
$('undo-button').onclick = () => { state.grid.cells = state.history.undo(); redraw(); };
$('redo-button').onclick = () => { state.grid.cells = state.history.redo(); redraw(); };
$('export-button').onclick = () => { const link = document.createElement('a'); link.href = view.exportPng(state.grid, $('gridlines-input').checked); link.download = `${state.source.name.replace(/\.[^.]+$/, '')}-puzzle.png`; link.click(); };
document.addEventListener('keydown', (event) => { if (!event.ctrlKey || event.target.matches('input, select')) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); state.grid.cells = event.shiftKey ? state.history.redo() : state.history.undo(); redraw(); } if (key === 'y') { event.preventDefault(); state.grid.cells = state.history.redo(); redraw(); } });
