/**
 * Heartbeat Kinegram — p5 instance-mode lab.
 * Preview and SVG export share src/lib/kinegram geometry.
 */
import p5 from 'p5';
import {
  CLOCK_TICK_DEG,
  DEFAULT_PARAMS,
  buildKinegram,
  clockReport,
  downloadSvg,
  drawCheckerboard,
  drawEncodedBase,
  drawHeart,
  drawMarks,
  drawMask,
  drawPaperDisc,
  exportA4TestSheetSvg,
  exportBaseSvg,
  exportMaskSvg,
  formatCount,
  formatDeg,
  frameAtAngle,
  snapAngle,
  wedgeAngle,
  type KinegramModel,
  type KinegramParams,
  type PreviewMode,
} from '../lib/kinegram';

const LAB_BG = '#22113E';

function wrapTau(a: number): number {
  const tau = Math.PI * 2;
  return ((a % tau) + tau) % tau;
}

function readNumber(el: HTMLInputElement | HTMLSelectElement, fallback: number): number {
  const n = Number(el.value);
  return Number.isFinite(n) ? n : fallback;
}

export function mountHeartbeatKinegram(root: HTMLElement): void {
  const canvasHost = root.querySelector<HTMLElement>('[data-kine-canvas]');
  if (!canvasHost) return;

  const ui = {
    preview: root.querySelectorAll<HTMLButtonElement>('[data-kine-preview]'),
    rotation: root.querySelector<HTMLInputElement>('[data-kine-rotation]'),
    angle: root.querySelector<HTMLElement>('[data-kine-angle]'),
    snap: root.querySelector<HTMLButtonElement>('[data-kine-snap]'),
    prev: root.querySelector<HTMLButtonElement>('[data-kine-prev]'),
    next: root.querySelector<HTMLButtonElement>('[data-kine-next]'),
    tick: root.querySelector<HTMLButtonElement>('[data-kine-tick]'),
    tickBack: root.querySelector<HTMLButtonElement>('[data-kine-tick-back]'),
    frames: root.querySelector<HTMLSelectElement>('[data-kine-frames]'),
    slices: root.querySelector<HTMLInputElement>('[data-kine-slices]'),
    diameter: root.querySelector<HTMLInputElement>('[data-kine-diameter]'),
    guide: root.querySelector<HTMLInputElement>('[data-kine-guide]'),
    state: root.querySelector<HTMLElement>('[data-kine-state]'),
    slicesOut: root.querySelector<HTMLElement>('[data-kine-slices-out]'),
    diameterOut: root.querySelector<HTMLElement>('[data-kine-diameter-out]'),
    guideOut: root.querySelector<HTMLElement>('[data-kine-guide-out]'),
    positions: root.querySelector<HTMLElement>('[data-kine-positions]'),
    step: root.querySelector<HTMLElement>('[data-kine-step]'),
    clockTick: root.querySelector<HTMLElement>('[data-kine-clock-tick]'),
    clockStep: root.querySelector<HTMLElement>('[data-kine-clock-step]'),
    clockPositions: root.querySelector<HTMLElement>('[data-kine-clock-positions]'),
    clockAdvance: root.querySelector<HTMLElement>('[data-kine-clock-advance]'),
    clockStatus: root.querySelector<HTMLElement>('[data-kine-clock-status]'),
    clockNote: root.querySelector<HTMLElement>('[data-kine-clock-note]'),
    presets: root.querySelectorAll<HTMLButtonElement>('[data-kine-preset]'),
    a4Fit: root.querySelector<HTMLElement>('[data-kine-a4-fit]'),
    exportA4: root.querySelector<HTMLButtonElement>('[data-kine-export-a4]'),
    exportBase: root.querySelector<HTMLButtonElement>('[data-kine-export-base]'),
    exportMask: root.querySelector<HTMLButtonElement>('[data-kine-export-mask]'),
  };

  const params: KinegramParams = { ...DEFAULT_PARAMS };
  let model: KinegramModel = buildKinegram(params);
  let preview: PreviewMode = 'composite';
  let rotation = 0;
  let dragging = false;
  let lastPointerAngle = 0;

  const syncParamsFromUi = () => {
    if (ui.frames) params.frames = readNumber(ui.frames, DEFAULT_PARAMS.frames);
    if (ui.slices) params.slices = Math.round(readNumber(ui.slices, DEFAULT_PARAMS.slices));
    if (ui.diameter) params.diameterMm = readNumber(ui.diameter, DEFAULT_PARAMS.diameterMm);
    if (ui.guide) params.guideMm = readNumber(ui.guide, DEFAULT_PARAMS.guideMm);
    model = buildKinegram(params);
    if (ui.slicesOut) ui.slicesOut.textContent = String(params.slices);
    if (ui.diameterOut) ui.diameterOut.textContent = `${params.diameterMm} mm`;
    if (ui.guideOut) ui.guideOut.textContent = `${params.guideMm} mm`;
    if (ui.a4Fit) {
      const fits = 2 * params.diameterMm + 24 <= 297;
      ui.a4Fit.hidden = fits;
    }
    ui.presets.forEach((btn) => {
      const [f, s] = (btn.dataset.kinePreset ?? '').split(',').map(Number);
      btn.setAttribute('aria-pressed', f === params.frames && s === params.slices ? 'true' : 'false');
    });
    updateState();
  };

  const updateClockReadouts = () => {
    const report = clockReport(params.frames, params.slices);
    if (ui.positions) {
      ui.positions.textContent = `${params.frames} × ${params.slices} = ${report.positions}`;
    }
    if (ui.step) ui.step.textContent = `${formatDeg(report.stepDeg)} per position`;
    if (ui.clockTick) ui.clockTick.textContent = formatDeg(report.tickDeg);
    if (ui.clockStep) ui.clockStep.textContent = formatDeg(report.stepDeg);
    if (ui.clockPositions) ui.clockPositions.textContent = String(report.positions);
    if (ui.clockAdvance) ui.clockAdvance.textContent = formatCount(report.framesPerTick);
    if (ui.clockStatus) {
      ui.clockStatus.textContent = report.status;
      ui.clockStatus.classList.remove('kine__status--good', 'kine__status--mixed', 'kine__status--poor');
      ui.clockStatus.classList.add(`kine__status--${report.fit}`);
    }
    if (ui.clockNote) ui.clockNote.textContent = report.interpretation;
  };

  const updateState = () => {
    const frame = frameAtAngle(rotation, params);
    const name = model.names[frame] ?? '';
    if (ui.state) {
      ui.state.textContent = `State ${frame + 1} / ${params.frames} — ${name}`;
    }
    const deg = (wrapTau(rotation) * 180) / Math.PI;
    if (ui.angle) ui.angle.textContent = `${deg.toFixed(1)}°`;
    if (ui.rotation && document.activeElement !== ui.rotation) {
      ui.rotation.value = deg.toFixed(1);
    }
    updateClockReadouts();
  };

  const setPreview = (next: PreviewMode) => {
    preview = next;
    ui.preview.forEach((btn) => {
      const on = btn.dataset.kinePreview === next;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  ui.preview.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.kinePreview as PreviewMode;
      if (mode) setPreview(mode);
    });
  });

  ui.rotation?.addEventListener('input', () => {
    if (!ui.rotation) return;
    rotation = (readNumber(ui.rotation, 0) * Math.PI) / 180;
    updateState();
  });

  ui.snap?.addEventListener('click', () => {
    rotation = snapAngle(rotation, params);
    updateState();
  });

  const stepFrame = (dir: number) => {
    rotation = snapAngle(rotation, params) + dir * wedgeAngle(params);
    updateState();
  };
  ui.prev?.addEventListener('click', () => stepFrame(-1));
  ui.next?.addEventListener('click', () => stepFrame(1));

  const stepTick = (dir: number) => {
    rotation += (dir * CLOCK_TICK_DEG * Math.PI) / 180;
    updateState();
  };
  ui.tick?.addEventListener('click', () => stepTick(1));
  ui.tickBack?.addEventListener('click', () => stepTick(-1));

  ui.presets.forEach((btn) => {
    btn.addEventListener('click', () => {
      const [f, s] = (btn.dataset.kinePreset ?? '').split(',').map(Number);
      if (!Number.isFinite(f) || !Number.isFinite(s)) return;
      if (ui.frames) ui.frames.value = String(f);
      if (ui.slices) ui.slices.value = String(s);
      syncParamsFromUi();
    });
  });

  for (const el of [ui.frames, ui.slices, ui.diameter, ui.guide]) {
    el?.addEventListener('input', syncParamsFromUi);
    el?.addEventListener('change', syncParamsFromUi);
  }

  ui.exportA4?.addEventListener('click', () => {
    downloadSvg('heartbeat-kinegram-a4-test-sheet.svg', exportA4TestSheetSvg(model));
  });
  ui.exportBase?.addEventListener('click', () => {
    downloadSvg('heartbeat-kinegram-base.svg', exportBaseSvg(model));
  });
  ui.exportMask?.addEventListener('click', () => {
    downloadSvg('heartbeat-kinegram-mask.svg', exportMaskSvg(model));
  });

  const sketch = (p: p5) => {
    let cache: { key: string; base: HTMLCanvasElement; mask: HTMLCanvasElement } | null = null;

    const layout = () => {
      const size = Math.max(280, Math.floor(canvasHost.clientWidth || 480));
      return { size, cx: size / 2, cy: size / 2, radius: size * 0.42 };
    };

    const pointerAngle = (x: number, y: number, cx: number, cy: number) => Math.atan2(y - cy, x - cx);

    const makeLayer = (size: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
      const dpr = p.pixelDensity();
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        paint(ctx);
      }
      return canvas;
    };

    const layersFor = (size: number, cx: number, cy: number, radius: number) => {
      const key = `${size}:${params.frames}:${params.slices}:${p.pixelDensity()}`;
      if (cache?.key === key) return cache;
      cache = {
        key,
        base: makeLayer(size, (c) => drawEncodedBase(c, model, cx, cy, radius)),
        mask: makeLayer(size, (c) => drawMask(c, model, cx, cy, radius)),
      };
      return cache;
    };

    p.draw = () => {
      const { size, cx, cy, radius } = layout();
      p.background(LAB_BG);
      const ctx = p.drawingContext as CanvasRenderingContext2D;
      const frame = frameAtAngle(rotation, params);
      const layers = layersFor(size, cx, cy, radius);

      if (preview === 'mask') {
        drawCheckerboard(ctx, cx, cy, radius);
        ctx.drawImage(layers.mask, 0, 0, size, size);
        drawMarks(ctx, cx, cy, radius, params.guideMm, params.diameterMm);
      } else if (preview === 'base') {
        drawPaperDisc(ctx, cx, cy, radius);
        ctx.drawImage(layers.base, 0, 0, size, size);
        drawMarks(ctx, cx, cy, radius, params.guideMm, params.diameterMm);
      } else if (preview === 'source') {
        drawPaperDisc(ctx, cx, cy, radius);
        drawHeart(ctx, model.hearts[frame]!, cx, cy, radius);
        drawMarks(ctx, cx, cy, radius, params.guideMm, params.diameterMm);
      } else {
        drawPaperDisc(ctx, cx, cy, radius);
        ctx.drawImage(layers.base, 0, 0, size, size);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.translate(-cx, -cy);
        ctx.drawImage(layers.mask, 0, 0, size, size);
        ctx.restore();
        drawMarks(ctx, cx, cy, radius, params.guideMm, params.diameterMm);
      }
    };

    const hitDisc = (x: number, y: number) => {
      const { cx, cy, radius } = layout();
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= (radius * 1.12) ** 2;
    };

    const canvasEl = () => (p.drawingContext as CanvasRenderingContext2D).canvas;

    const localXY = (e: PointerEvent) => {
      const canvas = canvasEl();
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * p.width,
        y: ((e.clientY - rect.top) / rect.height) * p.height,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      const { x, y } = localXY(e);
      if (!hitDisc(x, y)) return;
      dragging = true;
      canvasEl().setPointerCapture(e.pointerId);
      const { cx, cy } = layout();
      lastPointerAngle = pointerAngle(x, y, cx, cy);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const { x, y } = localXY(e);
      const { cx, cy } = layout();
      const next = pointerAngle(x, y, cx, cy);
      let delta = next - lastPointerAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      rotation += delta;
      lastPointerAngle = next;
      updateState();
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (canvasEl().hasPointerCapture(e.pointerId)) {
        canvasEl().releasePointerCapture(e.pointerId);
      }
    };

    p.setup = () => {
      const { size } = layout();
      p.pixelDensity(Math.min(2, p.displayDensity()));
      p.createCanvas(size, size);
      p.frameRate(60);
      const canvas = canvasEl();
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
    };

    const resize = () => {
      const { size } = layout();
      if (size === p.width) return;
      p.resizeCanvas(size, size);
    };
    new ResizeObserver(resize).observe(canvasHost);
  };

  new p5(sketch, canvasHost);
  syncParamsFromUi();
  setPreview('composite');
}
