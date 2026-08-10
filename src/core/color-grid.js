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

      totals[0] += srgbToLinear(red);
      totals[1] += srgbToLinear(green);
      totals[2] += srgbToLinear(blue);
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
    linearToSrgb(totals[0] / pixelCount),
    linearToSrgb(totals[1] / pixelCount),
    linearToSrgb(totals[2] / pixelCount),
  );

  return average;
}

function hexToRgb(color) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function srgbToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const normalized = Math.max(0, Math.min(1, value));
  return (normalized <= 0.0031308
    ? normalized * 12.92
    : 1.055 * normalized ** (1 / 2.4) - 0.055) * 255;
}

function rgbToOklab(rgb) {
  const [red, green, blue] = rgb.map(srgbToLinear);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

function rgbToLab(rgb) {
  const [red, green, blue] = rgb.map(srgbToLinear);
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
  const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
  const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
  const transform = (value) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const [fx, fy, fz] = [x, y, z].map(transform);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function ciede2000(first, second) {
  const [l1, a1, b1] = first;
  const [l2, a2, b2] = second;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);
  const hue = (a, b) => {
    const value = Math.atan2(b, a) * 180 / Math.PI;
    return value < 0 ? value + 360 : value;
  };
  const h1Prime = hue(a1Prime, b1);
  const h2Prime = hue(a2Prime, b2);
  const deltaL = l2 - l1;
  const deltaC = c2Prime - c1Prime;
  let deltaHue = h2Prime - h1Prime;
  if (c1Prime * c2Prime === 0) deltaHue = 0;
  else if (Math.abs(deltaHue) > 180) deltaHue += deltaHue > 0 ? -360 : 360;
  const deltaH = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin((deltaHue * Math.PI / 180) / 2);
  const lBar = (l1 + l2) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;
  let hBar = h1Prime + h2Prime;
  if (c1Prime * c2Prime === 0) hBar = h1Prime + h2Prime;
  else if (Math.abs(h1Prime - h2Prime) <= 180) hBar /= 2;
  else hBar = (h1Prime + h2Prime + (h1Prime + h2Prime < 360 ? 360 : -360)) / 2;
  const radians = Math.PI / 180;
  const t = 1 - 0.17 * Math.cos((hBar - 30) * radians)
    + 0.24 * Math.cos(2 * hBar * radians)
    + 0.32 * Math.cos((3 * hBar + 6) * radians)
    - 0.20 * Math.cos((4 * hBar - 63) * radians);
  const lightnessTerm = 1 + 0.015 * (lBar - 50) ** 2 / Math.sqrt(20 + (lBar - 50) ** 2);
  const chromaTerm = 1 + 0.045 * cBarPrime;
  const hueTerm = 1 + 0.015 * cBarPrime * t;
  const rotation = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const rT = -2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + 25 ** 7)) * Math.sin(2 * rotation * radians);
  return Math.sqrt(
    (deltaL / lightnessTerm) ** 2
      + (deltaC / chromaTerm) ** 2
      + (deltaH / hueTerm) ** 2
      + rT * (deltaC / chromaTerm) * (deltaH / hueTerm),
  );
}

function oklabToRgb(lab) {
  const [lightness, greenRed, blueYellow] = lab;
  const lRoot = lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow;
  const mRoot = lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow;
  const sRoot = lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function colorDistance(first, second) {
  return (first[0] - second[0]) ** 2
    + (first[1] - second[1]) ** 2
    + (first[2] - second[2]) ** 2;
}

function weightedRgbDistance(first, second) {
  const meanRed = (first[0] + second[0]) / 2;
  const redDelta = first[0] - second[0];
  const greenDelta = first[1] - second[1];
  const blueDelta = first[2] - second[2];
  return ((512 + meanRed) * redDelta ** 2) / 256
    + 4 * greenDelta ** 2
    + ((767 - meanRed) * blueDelta ** 2) / 256;
}

function getColorEntries(cells) {
  const counts = new Map();
  for (const color of cells) counts.set(color, (counts.get(color) ?? 0) + 1);
  return [...counts].map(([color, count]) => {
    const rgb = hexToRgb(color);
    const lab = rgbToOklab(rgb);
    return {
      color,
      count,
      rgb,
      lab,
      chroma: Math.hypot(lab[1], lab[2]),
      hue: (Math.atan2(lab[2], lab[1]) + Math.PI * 2) % (Math.PI * 2),
    };
  });
}

function choosePaletteSeeds(entries, colorCount, detailPriority) {
  const dominant = [...entries].sort((first, second) => second.count - first.count)[0];
  const seeds = dominant ? [dominant] : [];
  const hueGroups = new Map();
  for (const entry of entries) {
    if (entry.chroma < 0.045) continue;
    const group = Math.floor((entry.hue / (Math.PI * 2)) * 12);
    const current = hueGroups.get(group);
    const score = Math.log1p(entry.count) * (0.55 + entry.chroma * 4);
    if (!current || score > current.score) hueGroups.set(group, { entry, score });
  }

  const hueSlots = detailPriority
    ? Math.min(Math.max(2, Math.ceil(colorCount * 0.35)), hueGroups.size, colorCount - seeds.length)
    : 0;
  const hueSeeds = [...hueGroups.values()]
    .sort((first, second) => second.score - first.score)
    .slice(0, hueSlots)
    .map(({ entry }) => entry);
  for (const entry of hueSeeds) {
    if (!seeds.some((seed) => colorDistance(seed.lab, entry.lab) < 0.002)) seeds.push(entry);
  }

  while (seeds.length < Math.min(colorCount, entries.length)) {
    const next = entries
      .filter((entry) => !seeds.includes(entry))
      .map((entry) => {
        const nearest = Math.min(...seeds.map((seed) => colorDistance(seed.lab, entry.lab)));
        return { entry, score: Math.sqrt(entry.count) * (0.35 + entry.chroma * 3) * nearest };
      })
      .sort((first, second) => second.score - first.score)[0];
    if (!next) break;
    seeds.push(next.entry);
  }
  return seeds;
}

function refinePalette(entries, seeds) {
  let centers = seeds.map((entry) => [...entry.lab]);
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const totals = centers.map(() => [0, 0, 0, 0]);
    for (const entry of entries) {
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const nextDistance = colorDistance(center, entry.lab);
        if (nextDistance < distance) { nearest = index; distance = nextDistance; }
      });
      const weight = Math.sqrt(entry.count);
      totals[nearest][0] += entry.lab[0] * weight;
      totals[nearest][1] += entry.lab[1] * weight;
      totals[nearest][2] += entry.lab[2] * weight;
      totals[nearest][3] += weight;
    }
    centers = centers.map((center, index) => totals[index][3]
      ? totals[index].slice(0, 3).map((value) => value / totals[index][3])
      : center);
  }
  return centers.map(oklabToRgb);
}

function sourceColorCandidates(image) {
  const pixelCount = image.data.length / 4;
  const stride = Math.max(1, Math.ceil(Math.sqrt(pixelCount / 50000)));
  const colors = new Map();
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const [red, green, blue, alpha] = getPixel(image.data, image.width, x, y);
      if (alpha === 0) continue;
      const key = (red << 16) | (green << 8) | blue;
      if (!colors.has(key)) {
        const rgb = [red, green, blue];
        colors.set(key, { rgb, lab: rgbToOklab(rgb) });
      }
    }
  }
  return [...colors.values()];
}

function preserveSourceAnchors(centers, image) {
  const candidates = sourceColorCandidates(image);
  const lightSource = candidates
    .filter((candidate) => candidate.rgb.every((value) => value >= 245))
    .sort((first, second) => second.lab[0] - first.lab[0])[0];
  if (lightSource && centers.length) {
    const lightCenter = centers
      .map((center, index) => ({ index, lab: rgbToOklab(center) }))
      .filter(({ lab }) => lab[0] >= 0.75 && Math.hypot(lab[1], lab[2]) < 0.12)
      .sort((first, second) => second.lab[0] - first.lab[0])[0];
    if (lightCenter) centers[lightCenter.index] = [255, 255, 255];
  }
  return centers;
}

export function createGridPalette(cells, colorCount, sourceImage = null, detailPriority = true) {
  if (!Array.isArray(cells) || !cells.length || !Number.isInteger(colorCount) || colorCount < 1) return [];
  const entries = getColorEntries(cells);
  const seeds = choosePaletteSeeds(entries, colorCount, detailPriority);
  const centers = refinePalette(entries, seeds);
  return sourceImage ? preserveSourceAnchors(centers, sourceImage) : centers;
}

function mapToPalette(color, palette, distanceMethod = 'oklab') {
  if (!palette?.length) return color;

  const rgb = hexToRgb(color);
  const lab = rgbToOklab(rgb);
  const cieLab = ['ciede2000', 'cielab'].includes(distanceMethod) ? rgbToLab(rgb) : null;
  let closest = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const candidateRgb = typeof candidate === 'string' ? hexToRgb(candidate) : candidate;
    const candidateLab = ['ciede2000', 'cielab'].includes(distanceMethod) ? rgbToLab(candidateRgb) : rgbToOklab(candidateRgb);
    const distance = distanceMethod === 'rgb'
      ? colorDistance(rgb, candidateRgb)
      : distanceMethod === 'weighted-rgb'
        ? weightedRgbDistance(rgb, candidateRgb)
        : distanceMethod === 'ciede2000'
          ? ciede2000(cieLab, candidateLab)
          : distanceMethod === 'cielab' ? colorDistance(cieLab, candidateLab) : colorDistance(lab, candidateLab);
    if (distance < bestDistance) {
      closest = candidate;
      bestDistance = distance;
    }
  }

  return toColor(...(typeof closest === 'string' ? hexToRgb(closest) : closest));
}

export function imageDataToGrid(data, width, height, rows, columns, mode = 'average', detailPriority = true, palette = null, distanceMethod = 'oklab') {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
    throw new RangeError('Grid dimensions must be positive integers.');
  }

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push(mapToPalette(sampleCell(
        data,
        width,
        getCellBounds(width, height, rows, columns, row, column),
        mode,
        detailPriority,
      ), palette, distanceMethod));
    }
  }

  return { rows, cols: columns, cells };
}

export function mapGridToPalette(grid, palette, distanceMethod = 'oklab') {
  return { ...grid, cells: grid.cells.map((color) => mapToPalette(color, palette, distanceMethod)) };
}

export function simplifyGrid(grid, strength = 'none') {
  const settings = {
    light: { passes: 1, supportRatio: 0.62, maximumMatchingNeighbors: 1 },
    medium: { passes: 2, supportRatio: 0.52, maximumMatchingNeighbors: 2 },
    strong: { passes: 3, supportRatio: 0.44, maximumMatchingNeighbors: 3 },
  }[strength];
  if (!settings || !validateGrid(grid)) return cloneGrid(grid);

  let cells = [...grid.cells];
  for (let pass = 0; pass < settings.passes; pass += 1) {
    const next = [...cells];
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.cols; column += 1) {
        const index = row * grid.cols + column;
        const current = cells[index];
        const counts = new Map();
        let neighborCount = 0;
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
            if (rowOffset === 0 && columnOffset === 0) continue;
            const neighborRow = row + rowOffset; const neighborColumn = column + columnOffset;
            if (neighborRow < 0 || neighborRow >= grid.rows || neighborColumn < 0 || neighborColumn >= grid.cols) continue;
            const color = cells[neighborRow * grid.cols + neighborColumn];
            counts.set(color, (counts.get(color) ?? 0) + 1);
            neighborCount += 1;
          }
        }
        const winner = [...counts].sort((first, second) => second[1] - first[1])[0];
        if (!winner || winner[0] === current) continue;
        const matchingNeighbors = counts.get(current) ?? 0;
        const requiredSupport = Math.max(2, Math.ceil(neighborCount * settings.supportRatio));
        if (winner[1] >= requiredSupport && matchingNeighbors <= settings.maximumMatchingNeighbors) next[index] = winner[0];
      }
    }
    cells = next;
  }
  return { ...grid, cells };
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
