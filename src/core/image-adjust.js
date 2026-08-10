const clamp = (value) => Math.max(0, Math.min(255, value));

function hexToRgb(color) {
  const matches = String(color).match(/^#([0-9a-f]{6})$/i);
  if (!matches) return [255, 255, 255];
  return [
    Number.parseInt(matches[1].slice(0, 2), 16),
    Number.parseInt(matches[1].slice(2, 4), 16),
    Number.parseInt(matches[1].slice(4, 6), 16),
  ];
}

export function replaceTransparentPixels(image, color = '#ffffff') {
  const [backgroundRed, backgroundGreen, backgroundBlue] = hexToRgb(color);
  const result = new Uint8ClampedArray(image.data.length);
  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3] / 255;
    result[index] = image.data[index] * alpha + backgroundRed * (1 - alpha);
    result[index + 1] = image.data[index + 1] * alpha + backgroundGreen * (1 - alpha);
    result[index + 2] = image.data[index + 2] * alpha + backgroundBlue * (1 - alpha);
    result[index + 3] = 255;
  }
  return { ...image, data: result };
}

export function fitImageData(image, targetAspect, mode = 'stretch', background = '#ffffff') {
  if (!Number.isFinite(targetAspect) || targetAspect <= 0 || mode === 'stretch') return image;
  const sourceAspect = image.width / image.height;
  if (mode === 'crop') {
    if (sourceAspect > targetAspect) {
      const width = Math.max(1, Math.round(image.height * targetAspect));
      const left = Math.floor((image.width - width) / 2);
      const data = new Uint8ClampedArray(width * image.height * 4);
      for (let row = 0; row < image.height; row += 1) {
        const sourceStart = (row * image.width + left) * 4;
        data.set(image.data.subarray(sourceStart, sourceStart + width * 4), row * width * 4);
      }
      return { ...image, width, data };
    }
    const height = Math.max(1, Math.round(image.width / targetAspect));
    const top = Math.floor((image.height - height) / 2);
    const data = new Uint8ClampedArray(image.width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const sourceStart = ((top + row) * image.width) * 4;
      data.set(image.data.subarray(sourceStart, sourceStart + image.width * 4), row * image.width * 4);
    }
    return { ...image, height, data };
  }

  const width = sourceAspect < targetAspect ? Math.max(image.width, Math.round(image.height * targetAspect)) : image.width;
  const height = sourceAspect > targetAspect ? Math.max(image.height, Math.round(image.width / targetAspect)) : image.height;
  const [red, green, blue] = hexToRgb(background);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = red; data[index + 1] = green; data[index + 2] = blue; data[index + 3] = 255;
  }
  const left = Math.floor((width - image.width) / 2); const top = Math.floor((height - image.height) / 2);
  for (let row = 0; row < image.height; row += 1) {
    const sourceStart = row * image.width * 4;
    const targetStart = ((top + row) * width + left) * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + image.width * 4), targetStart);
  }
  return { ...image, width, height, data };
}

function rgbToHsl(red, green, blue) {
  const values = [red, green, blue].map((value) => value / 255);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (delta) {
    if (max === values[0]) hue = ((values[1] - values[2]) / delta) % 6;
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }
  return [hue, saturation, lightness];
}

function hueToRgb(p, q, hue) {
  const normalized = (hue + 1) % 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function hslToRgb(hue, saturation, lightness) {
  if (saturation === 0) return [lightness * 255, lightness * 255, lightness * 255];
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [hueToRgb(p, q, hue + 1 / 3) * 255, hueToRgb(p, q, hue) * 255, hueToRgb(p, q, hue - 1 / 3) * 255];
}

export function adjustImageData(image, options = {}) {
  const brightness = Number(options.brightness) || 0;
  const contrast = Number(options.contrast) || 0;
  const saturation = Number(options.saturation) || 0;
  const temperature = Number(options.temperature) || 0;
  const hueShift = (Number(options.hue) || 0) / 360;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const result = new Uint8ClampedArray(image.data.length);

  for (let index = 0; index < image.data.length; index += 4) {
    let red = image.data[index];
    let green = image.data[index + 1];
    let blue = image.data[index + 2];

    red += brightness * 2.55;
    green += brightness * 2.55;
    blue += brightness * 2.55;
    red = (red - 128) * contrastFactor + 128;
    green = (green - 128) * contrastFactor + 128;
    blue = (blue - 128) * contrastFactor + 128;

    const [hue, hslSaturation, lightness] = rgbToHsl(red, green, blue);
    [red, green, blue] = hslToRgb((hue + hueShift + 1) % 1, Math.max(0, Math.min(1, hslSaturation * (1 + saturation / 100))), lightness);
    red += temperature * 0.7;
    green += temperature * 0.15;
    blue -= temperature * 0.7;

    result[index] = clamp(red);
    result[index + 1] = clamp(green);
    result[index + 2] = clamp(blue);
    result[index + 3] = image.data[index + 3];
  }

  return { ...image, data: result };
}
