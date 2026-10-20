import {
  DEFAULT_HEIGHT_MM,
  DEFAULT_WIDTH_MM,
  FRAME_ZONE_MM,
  M3_DIAMETER_MM,
  M6_DIAMETER_MM,
  MAX_PLATE_MM,
  MIN_PLATE_MM,
  NAIL_DIAMETER_MM,
  NAIL_PITCH_MM,
  PITCH_MM,
  type Hole,
  type HoleKind,
  type PlateModel,
  type PlateParams,
} from './types';

const EPS = 1e-9;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sanitizeParams(input: Partial<PlateParams>): PlateParams {
  return {
    widthMm: clamp(finite(input.widthMm, DEFAULT_WIDTH_MM), MIN_PLATE_MM, MAX_PLATE_MM),
    heightMm: clamp(finite(input.heightMm, DEFAULT_HEIGHT_MM), MIN_PLATE_MM, MAX_PLATE_MM),
    m6Perimeter: Boolean(input.m6Perimeter),
    frameHoles: Boolean(input.frameHoles),
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Count odd lattice points k·pitch around 0 whose holes of `diameter`
 * stay fully inside a plate of `length`.
 */
export function countAxis(length: number, diameter: number): number {
  const maxOffset = length / 2 - diameter / 2;
  if (maxOffset < -EPS) return 0;
  const kMax = Math.floor((maxOffset + EPS) / PITCH_MM);
  return 2 * kMax + 1;
}

function axisCoords(count: number): number[] {
  if (count <= 0) return [];
  const kMax = (count - 1) / 2;
  const coords: number[] = [];
  for (let k = -kMax; k <= kMax; k += 1) {
    coords.push(k * PITCH_MM);
  }
  return coords;
}

function holeFits(x: number, y: number, diameter: number, width: number, height: number): boolean {
  const r = diameter / 2;
  return Math.abs(x) + r <= width / 2 + EPS && Math.abs(y) + r <= height / 2 + EPS;
}

/** True when a hole centre sits in the 10 mm edge band (inclusive). */
function inEdgeBand(x: number, y: number, width: number, height: number): boolean {
  return (
    Math.abs(x) >= width / 2 - FRAME_ZONE_MM - EPS ||
    Math.abs(y) >= height / 2 - FRAME_ZONE_MM - EPS
  );
}

function key(x: number, y: number): string {
  return `${x.toFixed(4)},${y.toFixed(4)}`;
}

function addHole(
  map: Map<string, Hole>,
  x: number,
  y: number,
  diameter: number,
  kind: HoleKind,
  width: number,
  height: number,
): void {
  if (!holeFits(x, y, diameter, width, height)) return;
  const id = key(x, y);
  const existing = map.get(id);
  if (existing && existing.diameter >= diameter) return;
  map.set(id, { x, y, diameter, kind });
}

/**
 * Nail centres sit in the middle of the 10 mm edge zone. Corners of that
 * inset rectangle are shared; extra holes step along each edge at a fixed
 * pitch, skipping positions that would crowd a corner.
 */
function nailCentres(width: number, height: number): Array<{ x: number; y: number }> {
  const inset = FRAME_ZONE_MM / 2;
  const minGap = NAIL_PITCH_MM / 2;
  const xs = edgePositions(width, inset, minGap);
  const ys = edgePositions(height, inset, minGap);
  const left = -width / 2 + inset;
  const right = width / 2 - inset;
  const bottom = -height / 2 + inset;
  const top = height / 2 - inset;
  const points: Array<{ x: number; y: number }> = [];

  for (const x of xs) {
    points.push({ x, y: top });
    points.push({ x, y: bottom });
  }
  for (const y of ys) {
    if (Math.abs(y - top) < EPS || Math.abs(y - bottom) < EPS) continue;
    points.push({ x: left, y });
    points.push({ x: right, y });
  }
  return points;
}

function edgePositions(length: number, inset: number, minGap: number): number[] {
  const span = length - 2 * inset;
  const start = -length / 2 + inset;
  if (span < -EPS) return [];
  if (span <= EPS) return [0];
  const coords = [start];
  for (let step = NAIL_PITCH_MM; step < span - minGap + EPS; step += NAIL_PITCH_MM) {
    coords.push(start + step);
  }
  coords.push(start + span);
  return coords;
}

export function buildPlate(raw: Partial<PlateParams>): PlateModel {
  const params = sanitizeParams(raw);
  const { widthMm: width, heightMm: height, m6Perimeter, frameHoles } = params;
  const holes = new Map<string, Hole>();

  // 1–3. Centered OS20 lattice, fully inside the plate. If the wood-frame
  // band is on, drop any grid centre that falls in that 10 mm edge zone
  // before diameters are assigned.
  const fitDiameter = frameHoles ? M3_DIAMETER_MM : m6Perimeter ? M6_DIAMETER_MM : M3_DIAMETER_MM;
  const latticeX = axisCoords(countAxis(width, fitDiameter));
  const latticeY = axisCoords(countAxis(height, fitDiameter));
  const gridPoints: Array<{ x: number; y: number }> = [];
  for (const x of latticeX) {
    for (const y of latticeY) {
      if (!holeFits(x, y, M3_DIAMETER_MM, width, height)) continue;
      if (frameHoles && inEdgeBand(x, y, width, height)) continue;
      gridPoints.push({ x, y });
    }
  }

  // 4. Optional M6 conversion applies only to the remaining OS20 perimeter.
  const remainingX = uniqueCoords(gridPoints.map((point) => point.x));
  const remainingY = uniqueCoords(gridPoints.map((point) => point.y));
  const minX = remainingX[0];
  const maxX = remainingX[remainingX.length - 1];
  const minY = remainingY[0];
  const maxY = remainingY[remainingY.length - 1];

  for (const point of gridPoints) {
    const onRemainingPerimeter =
      remainingX.length > 0 &&
      remainingY.length > 0 &&
      (point.x === minX || point.x === maxX || point.y === minY || point.y === maxY);
    const asM6 =
      m6Perimeter &&
      onRemainingPerimeter &&
      holeFits(point.x, point.y, M6_DIAMETER_MM, width, height);
    const diameter = asM6 ? M6_DIAMETER_MM : M3_DIAMETER_MM;
    const kind: HoleKind = asM6 ? 'm6' : 'm3';
    addHole(holes, point.x, point.y, diameter, kind, width, height);
  }

  // 5. Nail holes occupy the edge band only. They replace any leftover
  // grid hole at the same centre (should not happen after exclusion).
  if (frameHoles) {
    for (const point of nailCentres(width, height)) {
      if (!holeFits(point.x, point.y, NAIL_DIAMETER_MM, width, height)) continue;
      holes.set(key(point.x, point.y), {
        x: point.x,
        y: point.y,
        diameter: NAIL_DIAMETER_MM,
        kind: 'nail',
      });
    }
  }

  const columns = remainingX.length;
  const rows = remainingY.length;
  const gridSpanX = columns > 1 ? (columns - 1) * PITCH_MM : 0;
  const gridSpanY = rows > 1 ? (rows - 1) * PITCH_MM : 0;

  return {
    width,
    height,
    pitch: PITCH_MM,
    columns,
    rows,
    marginX: width - gridSpanX,
    marginY: height - gridSpanY,
    m6Perimeter,
    frameHoles,
    holes: [...holes.values()],
  };
}

function uniqueCoords(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 10000) / 10000))].sort((a, b) => a - b);
}

export function formatMm(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

export type SummaryRow = { label: string; value: string };

export function summaryRows(model: PlateModel): SummaryRow[] {
  const rows: SummaryRow[] = [
    { label: 'Plate', value: `${formatMm(model.width)} × ${formatMm(model.height)} mm` },
    { label: 'Grid pitch', value: `${formatMm(model.pitch)} mm` },
    { label: 'Grid', value: `${model.columns} × ${model.rows} points` },
    {
      label: model.m6Perimeter ? 'Standard holes' : 'All grid holes',
      value: `Ø${formatMm(M3_DIAMETER_MM)} mm`,
    },
  ];
  if (model.m6Perimeter) {
    rows.push({ label: 'Perimeter holes', value: `Ø${formatMm(M6_DIAMETER_MM)} mm` });
  }
  rows.push(
    { label: 'Horizontal remaining margin', value: marginLabel(model.marginX) },
    { label: 'Vertical remaining margin', value: marginLabel(model.marginY) },
  );
  if (model.frameHoles) {
    const nails = model.holes.filter((hole) => hole.kind === 'nail').length;
    rows.push({
      label: 'Wood frame holes',
      value: `${nails} × Ø${formatMm(NAIL_DIAMETER_MM)} mm, ${formatMm(FRAME_ZONE_MM)} mm edge zone`,
    });
  }
  return rows;
}

function marginLabel(total: number): string {
  const each = total / 2;
  return `${formatMm(total)} mm (${formatMm(each)} mm each side)`;
}

export function exportFilename(model: PlateModel): string {
  const w = formatMm(model.width);
  const h = formatMm(model.height);
  const flags = [
    model.m6Perimeter ? 'm6' : null,
    model.frameHoles ? 'frame' : null,
  ].filter(Boolean);
  const suffix = flags.length ? `-${flags.join('-')}` : '';
  return `os20-plate-${w}x${h}${suffix}.svg`;
}
