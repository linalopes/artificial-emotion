import { FRAME_ZONE_MM, type Hole, type PlateModel } from './types';
import { formatMm } from './geometry';

function round(value: number): string {
  return formatMm(Math.round(value * 10000) / 10000);
}

function toSvg(model: PlateModel, x: number, y: number): { x: number; y: number } {
  return {
    x: model.width / 2 + x,
    y: model.height / 2 - y,
  };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function holeCircle(model: PlateModel, hole: Hole, extraClass?: string): string {
  const { x, y } = toSvg(model, hole.x, hole.y);
  const cls = extraClass ? ` class="${extraClass}"` : '';
  return `<circle${cls} cx="${round(x)}" cy="${round(y)}" r="${round(hole.diameter / 2)}"/>`;
}

/** Fabrication SVG: millimetre units, plate outline and holes only. */
export function exportPlateSvg(model: PlateModel): string {
  const w = round(model.width);
  const h = round(model.height);
  const holes = model.holes.map((hole) => holeCircle(model, hole)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" version="1.1">
  <g fill="none" stroke="#000000" stroke-width="0.1">
    <rect x="0" y="0" width="${w}" height="${h}"/>
    ${holes}
  </g>
</svg>
`;
}

export function previewPlateSvg(model: PlateModel): string {
  const w = round(model.width);
  const h = round(model.height);
  const grid = previewGrid(model);
  const zone = model.frameHoles ? previewZone(model) : '';
  const holes = model.holes
    .map((hole) => holeCircle(model, hole, `os20-hole os20-hole--${hole.kind}`))
    .join('');
  const label = xmlEscape(
    `OS20 plate ${formatMm(model.width)} by ${formatMm(model.height)} millimetres`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">
  <rect class="os20-plate" x="0" y="0" width="${w}" height="${h}"/>
  ${zone}
  ${grid}
  ${holes}
</svg>`;
}

function previewGrid(model: PlateModel): string {
  if (model.columns <= 0 || model.rows <= 0) return '';
  const xs = unique(model.holes.filter((hole) => hole.kind !== 'nail').map((hole) => hole.x));
  const ys = unique(model.holes.filter((hole) => hole.kind !== 'nail').map((hole) => hole.y));
  if (xs.length === 0 || ys.length === 0) return '';
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const lines: string[] = [];
  for (const x of xs) {
    const a = toSvg(model, x, y0);
    const b = toSvg(model, x, y1);
    lines.push(
      `<line class="os20-grid" x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}"/>`,
    );
  }
  for (const y of ys) {
    const a = toSvg(model, x0, y);
    const b = toSvg(model, x1, y);
    lines.push(
      `<line class="os20-grid" x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}"/>`,
    );
  }
  return `<g class="os20-grid-lines">${lines.join('')}</g>`;
}

function previewZone(model: PlateModel): string {
  const z = FRAME_ZONE_MM;
  const innerW = Math.max(0, model.width - 2 * z);
  const innerH = Math.max(0, model.height - 2 * z);
  return `<g class="os20-zone">
    <rect class="os20-zone__outer" x="0" y="0" width="${round(model.width)}" height="${round(model.height)}"/>
    <rect class="os20-zone__inner" x="${round(z)}" y="${round(z)}" width="${round(innerW)}" height="${round(innerH)}"/>
  </g>`;
}

function unique(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 10000) / 10000))].sort(
    (a, b) => a - b,
  );
}

export function downloadSvg(filename: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
