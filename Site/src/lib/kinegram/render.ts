import { isMaskSolid } from './encode';
import {
  HEART_RED,
  MARK_STROKE,
  MASK_BLACK,
  PAPER_WHITE,
  type BezierPath,
  type HeartGeometry,
  type KinegramModel,
} from './types';

export type PreviewMode = 'composite' | 'base' | 'mask' | 'source';

function applyPath(ctx: CanvasRenderingContext2D, path: BezierPath, cx: number, cy: number, radius: number): void {
  ctx.moveTo(cx + path.start.x * radius, cy + path.start.y * radius);
  for (const seg of path.cubics) {
    ctx.bezierCurveTo(
      cx + seg.c1.x * radius,
      cy + seg.c1.y * radius,
      cx + seg.c2.x * radius,
      cy + seg.c2.y * radius,
      cx + seg.p.x * radius,
      cy + seg.p.y * radius,
    );
  }
  ctx.closePath();
}

export function drawHeart(ctx: CanvasRenderingContext2D, geom: HeartGeometry, cx: number, cy: number, radius: number, fill = HEART_RED): void {
  ctx.beginPath();
  applyPath(ctx, geom.body, cx, cy, radius);
  if (geom.chamber) applyPath(ctx, geom.chamber, cx, cy, radius);
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
  ctx.fillStyle = fill;
  for (const vessel of geom.vessels) {
    ctx.beginPath();
    applyPath(ctx, vessel, cx, cy, radius);
    ctx.fill();
  }
}

export function drawEncodedBase(
  ctx: CanvasRenderingContext2D,
  model: KinegramModel,
  cx: number,
  cy: number,
  radius: number,
): void {
  const { params, hearts, wedgeCount, wedgeAngle } = model;
  for (let i = 0; i < wedgeCount; i += 1) {
    const a0 = i * wedgeAngle;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a0, a0 + wedgeAngle);
    ctx.closePath();
    ctx.clip();
    drawHeart(ctx, hearts[i % params.frames]!, cx, cy, radius);
    ctx.restore();
  }
}

export function drawMask(
  ctx: CanvasRenderingContext2D,
  model: KinegramModel,
  cx: number,
  cy: number,
  radius: number,
): void {
  const { params, wedgeCount, wedgeAngle } = model;
  ctx.beginPath();
  ctx.moveTo(cx + radius, cy);
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  for (let i = 0; i < wedgeCount; i += 1) {
    if (isMaskSolid(i, params.frames)) continue;
    const a0 = i * wedgeAngle;
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a0, a0 + wedgeAngle);
    ctx.closePath();
  }
  ctx.fillStyle = MASK_BLACK;
  ctx.fill('evenodd');
}

export function drawMarks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  guideMm: number,
  diameterMm: number,
): void {
  const mm = (2 * radius) / diameterMm;
  const g = Math.max(0.4, guideMm / 2) * mm;
  const tick = Math.min(4, radius * 0.08);
  const cross = Math.max(2.2, guideMm * 1.6) * mm;
  ctx.save();
  ctx.strokeStyle = MARK_STROKE;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy - radius + tick);
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - cross, cy);
  ctx.lineTo(cx + cross, cy);
  ctx.moveTo(cx, cy - cross);
  ctx.lineTo(cx, cy + cross);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, g, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  cell = 10,
): void {
  const x0 = cx - radius;
  const y0 = cy - radius;
  const size = radius * 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#ececec';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#c8c8c8';
  const cols = Math.ceil(size / cell);
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      if ((i + j) % 2 === 0) continue;
      ctx.fillRect(x0 + i * cell, y0 + j * cell, cell, cell);
    }
  }
  ctx.restore();
}

export function drawPaperDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = PAPER_WHITE;
  ctx.fill();
}
