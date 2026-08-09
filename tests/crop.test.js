import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainCrop, cropImageData } from '../src/core/crop.js';

test('constrainCrop keeps a square inside normalized bounds', () => {
  assert.deepEqual(
    constrainCrop({ x: 0.8, y: 0.8, width: 0.4, height: 0.2 }, 'square'),
    { x: 0.8, y: 0.8, width: 0.2, height: 0.2, ratio: 'square' },
  );
});

test('cropImageData extracts the selected normalized pixels', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  const result = cropImageData(data, 2, 1, { x: 0.5, y: 0, width: 0.5, height: 1, ratio: 'free' });

  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.deepEqual([...result.data], [0, 0, 255, 255]);
});
