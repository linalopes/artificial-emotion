import { pathToSvgD, round } from './heart';
import { isMaskSolid, wedgePathD } from './encode';
import {
  A4_MM,
  HEART_RED,
  MARK_STROKE,
  MASK_BLACK,
  PAPER_WHITE,
  type HeartGeometry,
  type KinegramModel,
} from './types';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function heartFill(geom: HeartGeometry, cx: number, cy: number, radius: number, fill: string): string {
  const body = pathToSvgD(geom.body, cx, cy, radius);
  const hole = geom.chamber ? ` ${pathToSvgD(geom.chamber, cx, cy, radius)}` : '';
  const bodyPath = `<path fill-rule="evenodd" d="${body}${hole}" fill="${fill}"/>`;
  const vessels = geom.vessels
    .map((v) => `<path d="${pathToSvgD(v, cx, cy, radius)}" fill="${fill}"/>`)
    .join('');
  return `${bodyPath}${vessels}`;
}

export function marks(cx: number, cy: number, radius: number, guideMm: number): string {
  const g = Math.max(0.4, guideMm / 2);
  const tick = Math.min(4, radius * 0.08);
  const cross = Math.max(2.2, guideMm * 1.6);
  return [
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="none" stroke="${MARK_STROKE}" stroke-width="0.25" stroke-dasharray="1.2 0.9"/>`,
    `<line x1="${round(cx)}" y1="${round(cy - radius)}" x2="${round(cx)}" y2="${round(cy - radius + tick)}" stroke="${MARK_STROKE}" stroke-width="0.35"/>`,
    `<line x1="${round(cx - cross)}" y1="${round(cy)}" x2="${round(cx + cross)}" y2="${round(cy)}" stroke="${MARK_STROKE}" stroke-width="0.2"/>`,
    `<line x1="${round(cx)}" y1="${round(cy - cross)}" x2="${round(cx)}" y2="${round(cy + cross)}" stroke="${MARK_STROKE}" stroke-width="0.2"/>`,
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(g)}" fill="none" stroke="${MARK_STROKE}" stroke-width="0.3"/>`,
  ].join('');
}

function circlePath(cx: number, cy: number, radius: number): string {
  const r = round(radius);
  const x0 = round(cx - radius);
  const x1 = round(cx + radius);
  const y = round(cy);
  return `M ${x0} ${y} A ${r} ${r} 0 1 1 ${x1} ${y} A ${r} ${r} 0 1 1 ${x0} ${y} Z`;
}

/** Interlaced red heart: each frame clipped to its radial wedges. */
export function encodedHeart(
  model: KinegramModel,
  cx: number,
  cy: number,
  radius: number,
  idPrefix: string,
): string {
  const { params, hearts, wedgeAngle } = model;
  const defs: string[] = [];
  hearts.forEach((geom, i) => {
    defs.push(`<g id="${idPrefix}-h-${i}">${heartFill(geom, cx, cy, radius, HEART_RED)}</g>`);
  });
  for (let f = 0; f < params.frames; f += 1) {
    const wedges: string[] = [];
    for (let s = 0; s < params.slices; s += 1) {
      const i = s * params.frames + f;
      const a0 = i * wedgeAngle;
      wedges.push(`<path d="${wedgePathD(cx, cy, radius, a0, a0 + wedgeAngle)}"/>`);
    }
    defs.push(`<clipPath id="${idPrefix}-c-${f}" clipPathUnits="userSpaceOnUse">${wedges.join('')}</clipPath>`);
  }
  const uses = hearts
    .map(
      (_, f) =>
        `<g clip-path="url(#${idPrefix}-c-${f})"><use href="#${idPrefix}-h-${f}"/></g>`,
    )
    .join('');
  return `<defs>${defs.join('')}</defs>${uses}`;
}

/** Black disc with transparent radial apertures. */
export function maskEvenoddPath(model: KinegramModel, cx: number, cy: number, radius: number): string {
  const { params, wedgeCount, wedgeAngle } = model;
  const parts = [circlePath(cx, cy, radius)];
  for (let i = 0; i < wedgeCount; i += 1) {
    if (isMaskSolid(i, params.frames)) continue;
    const a0 = i * wedgeAngle;
    parts.push(wedgePathD(cx, cy, radius, a0, a0 + wedgeAngle));
  }
  return `<path fill-rule="evenodd" fill="${MASK_BLACK}" d="${parts.join(' ')}"/>`;
}

function discSvg(model: KinegramModel, kind: 'base' | 'mask'): string {
  const d = model.params.diameterMm;
  const r = d / 2;
  const cx = r;
  const cy = r;
  const bg = kind === 'base' ? `<rect width="${d}" height="${d}" fill="${PAPER_WHITE}"/>` : '';
  const paper = kind === 'base' ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER_WHITE}"/>` : '';
  const art =
    kind === 'base' ? encodedHeart(model, cx, cy, r, 'hk') : maskEvenoddPath(model, cx, cy, r);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d}mm" height="${d}mm" viewBox="0 0 ${d} ${d}">
${bg}${paper}${art}${marks(cx, cy, r, model.params.guideMm)}
</svg>`;
}

export function exportBaseSvg(model: KinegramModel): string {
  return discSvg(model, 'base');
}

export function exportMaskSvg(model: KinegramModel): string {
  return discSvg(model, 'mask');
}

export function exportA4TestSheetSvg(model: KinegramModel): string {
  const { width, height } = A4_MM;
  const d = model.params.diameterMm;
  const r = d / 2;
  const labelH = 5;
  let outer = 12;
  if (2 * d + 2 * outer + labelH + 12 > height) outer = 8;
  const cx = width / 2;
  const topCy = outer + labelH + r;
  const botCy = height - outer - r;
  const labelYTop = outer + 3.4;
  const labelYBot = botCy - r - 3.4;

  const baseArt = encodedHeart(model, cx, topCy, r, 'a4b');
  const maskArt = maskEvenoddPath(model, cx, botCy, r);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${PAPER_WHITE}"/>
<text x="${cx}" y="${labelYTop}" text-anchor="middle" font-family="sans-serif" font-size="3.2" fill="#22113E">${xmlEscape('BASE — PAPER')}</text>
<circle cx="${cx}" cy="${topCy}" r="${r}" fill="${PAPER_WHITE}"/>
${baseArt}
${marks(cx, topCy, r, model.params.guideMm)}
<text x="${cx}" y="${labelYBot}" text-anchor="middle" font-family="sans-serif" font-size="3.2" fill="#22113E">${xmlEscape('MASK — TRANSPARENCY')}</text>
${maskArt}
${marks(cx, botCy, r, model.params.guideMm)}
</svg>`;
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
