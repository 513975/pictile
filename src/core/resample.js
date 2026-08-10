const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));

function pixel(image, x, y) {
  const safeX = Math.max(0, Math.min(image.width - 1, x));
  const safeY = Math.max(0, Math.min(image.height - 1, y));
  const offset = (safeY * image.width + safeX) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
}

function nearest(image, x, y) { return pixel(image, Math.round(x), Math.round(y)); }

function bilinear(image, x, y) {
  const left = Math.floor(x); const top = Math.floor(y);
  const tx = x - left; const ty = y - top;
  const topLeft = pixel(image, left, top); const topRight = pixel(image, left + 1, top);
  const bottomLeft = pixel(image, left, top + 1); const bottomRight = pixel(image, left + 1, top + 1);
  return topLeft.map((value, index) => {
    const topValue = value + (topRight[index] - value) * tx;
    const bottomValue = bottomLeft[index] + (bottomRight[index] - bottomLeft[index]) * tx;
    return topValue + (bottomValue - topValue) * ty;
  });
}

function boxAverage(image, x, y, scaleX, scaleY) {
  if (scaleX <= 1 && scaleY <= 1) return bilinear(image, x, y);
  const left = Math.max(0, Math.floor(x - scaleX / 2));
  const right = Math.min(image.width - 1, Math.ceil(x + scaleX / 2));
  const top = Math.max(0, Math.floor(y - scaleY / 2));
  const bottom = Math.min(image.height - 1, Math.ceil(y + scaleY / 2));
  const totals = [0, 0, 0, 0]; let count = 0;
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      const sample = pixel(image, column, row);
      for (let channel = 0; channel < 4; channel += 1) totals[channel] += sample[channel];
      count += 1;
    }
  }
  return totals.map((value) => value / Math.max(1, count));
}

function cubic(value) {
  const absolute = Math.abs(value);
  if (absolute <= 1) return 1.5 * absolute ** 3 - 2.5 * absolute ** 2 + 1;
  if (absolute < 2) return -0.5 * absolute ** 3 + 2.5 * absolute ** 2 - 4 * absolute + 2;
  return 0;
}

function bicubic(image, x, y) {
  const left = Math.floor(x); const top = Math.floor(y);
  const result = [0, 0, 0, 0]; let total = 0;
  for (let offsetY = -1; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 2; offsetX += 1) {
      const weight = cubic(x - (left + offsetX)) * cubic(y - (top + offsetY));
      const sample = pixel(image, left + offsetX, top + offsetY);
      total += weight;
      for (let channel = 0; channel < 4; channel += 1) result[channel] += sample[channel] * weight;
    }
  }
  return result.map((value) => value / (total || 1));
}

function sinc(value) {
  if (value === 0) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function lanczos(image, x, y) {
  const radius = 3; const left = Math.floor(x); const top = Math.floor(y);
  const result = [0, 0, 0, 0]; let total = 0;
  for (let offsetY = 1 - radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = 1 - radius; offsetX <= radius; offsetX += 1) {
      const weight = sinc(x - (left + offsetX)) * sinc((x - (left + offsetX)) / radius)
        * sinc(y - (top + offsetY)) * sinc((y - (top + offsetY)) / radius);
      const sample = pixel(image, left + offsetX, top + offsetY);
      total += weight;
      for (let channel = 0; channel < 4; channel += 1) result[channel] += sample[channel] * weight;
    }
  }
  return result.map((value) => value / (total || 1));
}

export function resampleImageData(image, targetWidth, targetHeight, method = 'lanczos') {
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(targetHeight));
  if (width === image.width && height === image.height) return image;
  const result = new Uint8ClampedArray(width * height * 4);
  const scaleX = image.width / width; const scaleY = image.height / height;
  const sampler = method === 'nearest' ? nearest : method === 'box' ? boxAverage : method === 'bicubic' ? bicubic : method === 'bilinear' ? bilinear : lanczos;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sample = sampler(image, (x + 0.5) * scaleX - 0.5, (y + 0.5) * scaleY - 0.5, scaleX, scaleY);
      const offset = (y * width + x) * 4;
      result[offset] = clamp(Math.round(sample[0]));
      result[offset + 1] = clamp(Math.round(sample[1]));
      result[offset + 2] = clamp(Math.round(sample[2]));
      result[offset + 3] = clamp(Math.round(sample[3]));
    }
  }
  return { ...image, width, height, data: result };
}
