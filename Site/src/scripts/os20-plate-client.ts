import {
  DEFAULT_HEIGHT_MM,
  DEFAULT_WIDTH_MM,
  MAX_PLATE_MM,
  MIN_PLATE_MM,
  buildPlate,
  downloadSvg,
  exportFilename,
  exportPlateSvg,
  previewPlateSvg,
  summaryRows,
  type PlateModel,
  type PlateParams,
} from '../lib/os20-plate';

function readNumber(input: HTMLInputElement | null, fallback: number): number {
  if (!input) return fallback;
  const n = Number(input.value);
  return Number.isFinite(n) ? n : fallback;
}

export function mountOs20PlateGenerator(root: HTMLElement): void {
  const widthInput = root.querySelector<HTMLInputElement>('[data-os20-width]');
  const heightInput = root.querySelector<HTMLInputElement>('[data-os20-height]');
  const m6Input = root.querySelector<HTMLInputElement>('[data-os20-m6]');
  const frameInput = root.querySelector<HTMLInputElement>('[data-os20-frame]');
  const stage = root.querySelector<HTMLElement>('[data-os20-stage]');
  const summary = root.querySelector<HTMLElement>('[data-os20-summary]');
  const exportBtn = root.querySelector<HTMLButtonElement>('[data-os20-export]');

  if (!stage || !summary) return;

  let model: PlateModel = buildPlate({
    widthMm: DEFAULT_WIDTH_MM,
    heightMm: DEFAULT_HEIGHT_MM,
    m6Perimeter: false,
    frameHoles: false,
  });
  let frame = 0;

  const readParams = (): PlateParams => ({
    widthMm: readNumber(widthInput, DEFAULT_WIDTH_MM),
    heightMm: readNumber(heightInput, DEFAULT_HEIGHT_MM),
    m6Perimeter: Boolean(m6Input?.checked),
    frameHoles: Boolean(frameInput?.checked),
  });

  const paint = (): void => {
    model = buildPlate(readParams());
    stage.style.aspectRatio = `${model.width} / ${model.height}`;
    stage.innerHTML = previewPlateSvg(model);
    summary.replaceChildren(
      ...summaryRows(model).map((row) => {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = row.label;
        dd.textContent = row.value;
        wrap.append(dt, dd);
        return wrap;
      }),
    );
    if (widthInput && document.activeElement !== widthInput) {
      widthInput.value = String(model.width);
    }
    if (heightInput && document.activeElement !== heightInput) {
      heightInput.value = String(model.height);
    }
    if (m6Input) m6Input.checked = model.m6Perimeter;
    if (frameInput) frameInput.checked = model.frameHoles;
    root.classList.toggle('is-framed', model.frameHoles);
  };

  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
    });
  };

  widthInput?.addEventListener('input', schedule);
  heightInput?.addEventListener('input', schedule);
  m6Input?.addEventListener('change', schedule);
  frameInput?.addEventListener('change', schedule);

  widthInput?.setAttribute('min', String(MIN_PLATE_MM));
  widthInput?.setAttribute('max', String(MAX_PLATE_MM));
  heightInput?.setAttribute('min', String(MIN_PLATE_MM));
  heightInput?.setAttribute('max', String(MAX_PLATE_MM));

  exportBtn?.addEventListener('click', () => {
    model = buildPlate(readParams());
    downloadSvg(exportFilename(model), exportPlateSvg(model));
  });

  paint();
}
