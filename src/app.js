import { cloneGrid, imageDataToGrid, validateGrid } from './core/color-grid.js';
import { EditHistory } from './core/edit-history.js';
import { deleteVersion, listVersions, openStore, putVersion } from './data/project-store.js';
import { GridCanvas } from './ui/grid-canvas.js';
import { constrainCrop, cropImageData } from './core/crop.js';

const $ = (id) => document.getElementById(id);
const state = { projectId: crypto.randomUUID(), source: null, grid: null, history: null, selected: null, database: null, crop: { x: 0, y: 0, width: 1, height: 1, ratio: 'free' } };
const view = new GridCanvas($('grid-canvas'));
let regenerateTimer; let stroke = null; let manuallyEdited = false;

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
  return { name: file.name, bitmap: image, width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

function redraw() {
  if (!state.grid) return;
  view.render(state.grid, { cellSize: Number($('zoom-input').value) || 22, selected: state.selected, gridlines: $('gridlines-input').checked });
  $('undo-button').disabled = !state.history.canUndo;
  $('redo-button').disabled = !state.history.canRedo;
  updateLivePreview();
}

function updateLivePreview() {
  if (!state.source || !state.grid) return;
  const cropped = cropImageData(state.source.data, state.source.width, state.source.height, state.crop);
  const canvas = document.createElement('canvas');
  canvas.width = cropped.width; canvas.height = cropped.height;
  canvas.getContext('2d').putImageData(new ImageData(cropped.data, cropped.width, cropped.height), 0, 0);
  $('live-original').src = canvas.toDataURL('image/png');
  $('live-grid').src = view.exportPng(state.grid, $('gridlines-input').checked);
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
  const source = cropImageData(state.source.data, state.source.width, state.source.height, state.crop);
  state.grid = imageDataToGrid(source.data, source.width, source.height, rows, cols, mode, detail);
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
for (const id of ['rows-input', 'cols-input', 'sampling-input', 'detail-input']) $(id).addEventListener('change', () => { if (manuallyEdited) return; clearTimeout(regenerateTimer); regenerateTimer = setTimeout(() => regenerate().catch((error) => setStatus(error.message, true)), 250); });
const cropCanvas = $('crop-canvas'); const cropContext = cropCanvas.getContext('2d'); let cropDrag = null;
function drawCrop() { const scale = Math.min(cropCanvas.width / state.source.width, cropCanvas.height / state.source.height); const width = state.source.width * scale, height = state.source.height * scale; cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height); cropContext.drawImage(state.source.bitmap, 0, 0, width, height); const c = state.crop; cropContext.fillStyle = '#0008'; cropContext.fillRect(0,0,width,height); cropContext.drawImage(state.source.bitmap, c.x*state.source.width, c.y*state.source.height, c.width*state.source.width, c.height*state.source.height, c.x*width, c.y*height, c.width*width, c.height*height); cropContext.strokeStyle='#fff';cropContext.lineWidth=3;cropContext.strokeRect(c.x*width,c.y*height,c.width*width,c.height*height); }
$('crop-button').onclick = () => { drawCrop(); $('crop-dialog').showModal(); };
cropCanvas.onpointerdown = (event) => { const r = cropCanvas.getBoundingClientRect(), x=(event.clientX-r.left)/r.width, y=(event.clientY-r.top)/r.height, c=state.crop, edge=.035; const left=Math.abs(x-c.x)<edge,right=Math.abs(x-(c.x+c.width))<edge,top=Math.abs(y-c.y)<edge,bottom=Math.abs(y-(c.y+c.height))<edge; cropDrag={x,y,crop:{...c},edges:{left,right,top,bottom}}; cropCanvas.setPointerCapture(event.pointerId); };
cropCanvas.onpointermove = (event) => { if(!cropDrag)return; const r=cropCanvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height,d=cropDrag,c={...d.crop},e=d.edges; if(e.left){c.x=Math.min(x,d.crop.x+d.crop.width-.03);c.width=d.crop.x+d.crop.width-c.x}else if(e.right)c.width=Math.max(.03,x-c.x); if(e.top){c.y=Math.min(y,d.crop.y+d.crop.height-.03);c.height=d.crop.y+d.crop.height-c.y}else if(e.bottom)c.height=Math.max(.03,y-c.y); if(!e.left&&!e.right&&!e.top&&!e.bottom){c.x=x-(d.x-d.crop.x);c.y=y-(d.y-d.crop.y)} state.crop=constrainCrop(c);drawCrop(); };
cropCanvas.onpointerup = () => { cropDrag=null; };
$('apply-crop-button').onclick = async (event) => { event.preventDefault(); $('crop-dialog').close(); await regenerate(); };
$('zoom-input').oninput = redraw;
$('gridlines-input').onchange = redraw;
$('save-version-button').onclick = () => saveVersion('手动保存').catch((error) => setStatus(error.message, true));
$('grid-canvas').onpointerdown = (event) => { const index = view.hitTest(event); if (index === null) return; const mode = $('edit-mode').value; if (mode === 'eyedropper') { $('color-input').value = state.grid.cells[index]; $('edit-mode').value = 'fill'; state.selected = index; redraw(); return; } if (mode === 'select') { state.selected = index; redraw(); return; } stroke = new Map(); $('grid-canvas').setPointerCapture(event.pointerId); paint(index); };
$('grid-canvas').onpointermove = (event) => { if (!stroke) return; const index = view.hitTest(event); if (index !== null) paint(index); };
$('grid-canvas').onpointerup = () => { if (!stroke) return; state.history.applyStroke([...stroke.values()]); state.grid.cells = state.history.cells; stroke = null; manuallyEdited = true; redraw(); };
function paint(index) { if (stroke.has(index)) return; const after = $('color-input').value; stroke.set(index, { index, before: state.grid.cells[index], after }); state.grid.cells[index] = after; state.selected = index; redraw(); }
$('undo-button').onclick = () => { state.grid.cells = state.history.undo(); redraw(); };
$('redo-button').onclick = () => { state.grid.cells = state.history.redo(); redraw(); };
$('export-button').onclick = () => { const link = document.createElement('a'); link.href = view.exportPng(state.grid, $('gridlines-input').checked); link.download = `${state.source.name.replace(/\.[^.]+$/, '')}-puzzle.png`; link.click(); };
document.addEventListener('keydown', (event) => { if (!event.ctrlKey || event.target.matches('input, select')) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); state.grid.cells = event.shiftKey ? state.history.redo() : state.history.undo(); redraw(); } if (key === 'y') { event.preventDefault(); state.grid.cells = state.history.redo(); redraw(); } });
