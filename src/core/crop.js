const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const normalize = (value) => Math.round(value * 1_000_000) / 1_000_000;

const ratioValue = (ratio) => ({ square: 1, '4:3': 4 / 3, '16:9': 16 / 9 }[ratio] ?? null);

export function constrainCrop(crop, ratio = 'free', sourceAspect = 1) {
  const x = clamp(crop.x ?? 0, 0, 1);
  const y = clamp(crop.y ?? 0, 0, 1);
  let width = clamp(crop.width ?? 1, 0.001, 1 - x);
  let height = clamp(crop.height ?? 1, 0.001, 1 - y);
  const target = ratioValue(ratio) ? ratioValue(ratio) / sourceAspect : null;

  if (target) {
    const maximumWidth = Math.min(1 - x, (1 - y) * target);
    const requestedWidth = Math.min(width, height * target);
    width = Math.min(requestedWidth, maximumWidth);
    height = width / target;
  }

  return { x: normalize(x), y: normalize(y), width: normalize(width), height: normalize(height), ratio };
}

export function cropImageData(data, sourceWidth, sourceHeight, crop) {
  const safeCrop = constrainCrop(crop, 'free');
  const left = Math.floor(safeCrop.x * sourceWidth);
  const top = Math.floor(safeCrop.y * sourceHeight);
  const right = Math.max(left + 1, Math.floor((safeCrop.x + safeCrop.width) * sourceWidth));
  const bottom = Math.max(top + 1, Math.floor((safeCrop.y + safeCrop.height) * sourceHeight));
  const width = Math.min(sourceWidth, right) - left;
  const height = Math.min(sourceHeight, bottom) - top;
  const result = new Uint8ClampedArray(width * height * 4);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * sourceWidth + left) * 4;
    result.set(data.subarray(sourceStart, sourceStart + width * 4), row * width * 4);
  }

  return { data: result, width, height };
}
