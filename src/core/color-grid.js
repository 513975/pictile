const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));

const toHex = (value) => clampChannel(value).toString(16).padStart(2, '0');

const toColor = (red, green, blue) => `#${toHex(red)}${toHex(green)}${toHex(blue)}`;

const quantizeChannel = (value) => Math.min(255, Math.round(value / 16) * 16);

function getPixel(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function getCellBounds(width, height, rows, columns, row, column) {
  return {
    left: Math.floor((column * width) / columns),
    right: Math.max(Math.floor(((column + 1) * width) / columns), 1),
    top: Math.floor((row * height) / rows),
    bottom: Math.max(Math.floor(((row + 1) * height) / rows), 1),
  };
}

function getDominantColor(buckets) {
  let winner = '#ffffff';
  let highestCount = -1;

  for (const [color, count] of buckets) {
    if (count > highestCount) {
      winner = color;
      highestCount = count;
    }
  }

  return { color: winner, count: highestCount };
}

function sampleCell(data, width, bounds, mode, detailPriority) {
  const totals = [0, 0, 0];
  const buckets = new Map();
  let pixelCount = 0;

  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const [red, green, blue, alpha] = getPixel(data, width, x, y);
      if (alpha === 0) continue;

      totals[0] += red;
      totals[1] += green;
      totals[2] += blue;
      pixelCount += 1;

      const bucket = toColor(
        quantizeChannel(red),
        quantizeChannel(green),
        quantizeChannel(blue),
      );
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }

  if (pixelCount === 0) return '#ffffff';

  const dominant = getDominantColor(buckets);
  if (mode === 'dominant') return dominant.color;

  const average = toColor(
    totals[0] / pixelCount,
    totals[1] / pixelCount,
    totals[2] / pixelCount,
  );

  return detailPriority && dominant.count / pixelCount >= 0.65
    ? dominant.color
    : average;
}

export function imageDataToGrid(data, width, height, rows, columns, mode = 'average', detailPriority = true) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
    throw new RangeError('Grid dimensions must be positive integers.');
  }

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push(sampleCell(
        data,
        width,
        getCellBounds(width, height, rows, columns, row, column),
        mode,
        detailPriority,
      ));
    }
  }

  return { rows, cols: columns, cells };
}

export function cloneGrid(grid) {
  return { rows: grid.rows, cols: grid.cols, cells: [...grid.cells] };
}

export function validateGrid(grid) {
  return Number.isInteger(grid?.rows)
    && Number.isInteger(grid?.cols)
    && grid.rows >= 2
    && grid.cols >= 2
    && Array.isArray(grid.cells)
    && grid.cells.length === grid.rows * grid.cols
    && grid.cells.every((color) => /^#[0-9a-f]{6}$/i.test(color));
}
