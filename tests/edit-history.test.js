import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../src/core/edit-history.js';

test('undo restores a recolored cell and redo reapplies it', () => {
  const history = new EditHistory(['#ffffff', '#000000']);

  history.apply({ index: 0, before: '#ffffff', after: '#ff0000' });

  assert.deepEqual(history.cells, ['#ff0000', '#000000']);
  assert.deepEqual(history.undo(), ['#ffffff', '#000000']);
  assert.deepEqual(history.redo(), ['#ff0000', '#000000']);
});

test('a new edit clears redo state', () => {
  const history = new EditHistory(['#ffffff']);

  history.apply({ index: 0, before: '#ffffff', after: '#ff0000' });
  history.undo();
  history.apply({ index: 0, before: '#ffffff', after: '#00ff00' });

  assert.equal(history.canRedo, false);
});
