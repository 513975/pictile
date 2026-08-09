import test from 'node:test';
import assert from 'node:assert/strict';
import { imageDataToGrid, validateGrid } from '../src/core/color-grid.js';

const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());

test('average sampling returns the mean color of a cell', () => {
  const grid = imageDataToGrid(
    rgba([255, 0, 0, 255], [0, 0, 255, 255]),
    2,
    1,
    1,
    1,
    'average',
    false,
  );

  assert.equal(grid.cells[0], '#800080');
});

test('dominant sampling picks the most common quantized color', () => {
  const grid = imageDataToGrid(
    rgba([240, 12, 10, 255], [245, 9, 8, 255], [2, 20, 240, 255]),
    3,
    1,
    1,
    1,
    'dominant',
    false,
  );

  assert.equal(grid.cells[0], '#f01010');
});

test('conversion creates one valid cell for every requested row and column', () => {
  const grid = imageDataToGrid(
    rgba([0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [0, 255, 0, 255]),
    2,
    2,
    2,
    2,
    'average',
    true,
  );

  assert.equal(grid.cells.length, 4);
  assert.equal(validateGrid(grid), true);
});
