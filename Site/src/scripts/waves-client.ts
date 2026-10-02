/**
 * Tomorrow's Waves — p5.js 2D sketch.
 *
 * Direct port of the approved HTML implementation (seeded ribbons, body
 * lines, cross mesh, defining edges, free threads, colour ramps, pointer).
 * Instance-mode p5 so the library only loads on pages that mount this.
 */
import p5 from 'p5';
import { WAVES_CONFIG, type WavesParams } from '../lib/waves.config';

const C = {
  purple: [34, 17, 62] as [number, number, number],
  gg: [202, 216, 216] as [number, number, number],
  pink: [234, 125, 255] as [number, number, number],
  turq: [8, 242, 219] as [number, number, number],
};
const GRAY_LIGHT = [118, 118, 138] as [number, number, number];

type RGB = [number, number, number];

interface Ribbon {
  jit: number;
  amp: number;
  f1: number;
  f2: number;
  ph: number;
  wBase: number;
  wRange: number;
  tw: number;
  tws: number;
  off: number;
  colOff: number;
  sp: number;
  ramp: 0 | 1;
}

interface Thread {
  base: number;
  amp: number;
  f: number;
  ph: number;
  off: number;
  sp: number;
}

interface DebugUi {
  setSeed: (s: number) => void;
  setPaused: (paused: boolean) => void;
  togglePanel: () => void;
}

/** Portrait canvases get a thinner ribbon so the field does not flood. */
function widthScaleFor(width: number, height: number): number {
  const { fullAspect, minAspect, minWidthScale } = WAVES_CONFIG.compact;
  const aspect = height > 0 ? width / height : 1;
  if (aspect >= fullAspect) return 1;
  const t = Math.max(0, Math.min(1, (aspect - minAspect) / (fullAspect - minAspect)));
  return minWidthScale + (1 - minWidthScale) * t;
}

export function mountWaves(container: HTMLElement): void {
  const params: WavesParams = structuredClone(WAVES_CONFIG.params);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const allowDebug = container.hasAttribute('data-waves-debug');
  const atmosphere = container.hasAttribute('data-waves-atmosphere');
  const compactField = atmosphere && window.matchMedia('(max-width: 47.99rem)').matches;

  if (atmosphere) {
    params.speed = compactField ? 0.4 : 0.55;
    params.amp = compactField ? 1.05 : 1.2;
    params.width = compactField ? 1.35 : 1.5;
    if (compactField) params.lines = 40;
  }

  let seed = WAVES_CONFIG.seed;
  let ribbons: Ribbon[] = [];
  let threads: Thread[] = [];
  let t = 0;
  let paused = reducedMotion;
  let mx = 0;
  let my = 0;
  let pointerX = 0;
  let pointerY = 0;
  let mInf = 0;
  let lastMove = -1e9;
  let visible = true;
  let widthScale = 1;
  let debugUi: DebugUi | undefined;

  const SAMPLES = WAVES_CONFIG.samples;
  const XS = new Float32Array(SAMPLES + 1);
  const CS = new Float32Array(SAMPLES + 1);
  const WS = new Float32Array(SAMPLES + 1);
  const CT = new Float32Array(SAMPLES + 1);
  const ST = new Float32Array(SAMPLES + 1);

  const sketch = (p: p5) => {
    const lerpC = (a: RGB, b: RGB, f: number): RGB => [
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    ];

    const rampColor = (v: number, r: Ribbon): RGB => {
      const gray = params.dark ? C.gg : GRAY_LIGHT;
      const a1 = r.ramp ? C.turq : C.pink;
      const a2 = r.ramp ? C.pink : C.turq;
      const stops = [gray, a1, gray, a2, gray];
      const scaled = p.constrain(v, 0, 0.9999) * (stops.length - 1);
      const i = Math.floor(scaled);
      return lerpC(stops[i]!, stops[i + 1]!, scaled - i);
    };

    const gradient = (ctx: CanvasRenderingContext2D, r: Ribbon, tt: number, alpha: number | string) => {
      const g = ctx.createLinearGradient(0, 0, p.width, 0);
      const n = 7;
      for (let s = 0; s < n; s++) {
        const v = p.map(p.noise(r.colOff + s * 0.55, tt * 0.06), 0.28, 0.72, 0, 1);
        const c = rampColor(v, r);
        g.addColorStop(s / (n - 1), `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`);
      }
      return g;
    };

    const build = () => {
      p.randomSeed(seed);
      p.noiseSeed(seed);
      ribbons = [];
      for (let i = 0; i < 8; i++) {
        ribbons.push({
          jit: p.random(-0.05, 0.05),
          amp: p.random(0.08, 0.18),
          f1: p.random(0.7, 1.6),
          f2: p.random(0.8, 1.8),
          ph: p.random(p.TAU),
          wBase: p.random(0.035, 0.07),
          wRange: p.random(0.05, 0.12),
          tw: p.random(1.2, 3.2) * (p.random() < 0.5 ? -1 : 1),
          tws: p.random(0.25, 0.6) * (p.random() < 0.5 ? -1 : 1),
          off: p.random(1000),
          colOff: p.random(1000),
          sp: p.random(0.75, 1.25),
          ramp: p.random() < 0.5 ? 0 : 1,
        });
      }
      ribbons = p.shuffle(ribbons);
      threads = [];
      for (let i = 0; i < 7; i++) {
        threads.push({
          base: p.random(0.05, 0.95),
          amp: p.random(0.1, 0.3),
          f: p.random(0.6, 1.6),
          ph: p.random(p.TAU),
          off: p.random(1000),
          sp: p.random(0.5, 1.2),
        });
      }
      debugUi?.setSeed(seed);
    };

    const drawThreads = (ctx: CanvasRenderingContext2D) => {
      const W = p.width;
      const H = p.height;
      const col = params.dark ? C.gg : C.purple;
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${params.dark ? 0.35 : 0.28})`;
      for (const th of threads) {
        const tt = t * th.sp;
        ctx.beginPath();
        for (let k = 0; k <= 90; k++) {
          const u = k / 90;
          const x = -0.05 * W + u * 1.1 * W;
          const y =
            th.base * H +
            H *
              th.amp *
              params.amp *
              ((p.noise(u * th.f + th.off, tt * 0.12) - 0.5) * 2 +
                0.4 * Math.sin(u * p.TWO_PI * th.f + tt * 0.4 + th.ph));
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    };

    const drawRibbon = (ctx: CanvasRenderingContext2D, r: Ribbon, idx: number, n: number) => {
      const W = p.width;
      const H = p.height;
      const tt = t * r.sp;
      const base = ((idx + 0.5) / n + r.jit) * H;
      const aScale = Math.min(1, 3 / n + 0.35);

      for (let k = 0; k <= SAMPLES; k++) {
        const u = k / SAMPLES;
        const x = -0.08 * W + u * 1.16 * W;
        let c =
          base +
          H *
            r.amp *
            params.amp *
            aScale *
            ((p.noise(u * r.f1 + r.off, tt * 0.14) - 0.5) * 2.4 +
              0.45 * Math.sin(u * p.TWO_PI * r.f2 + tt * 0.55 + r.ph));
        if (mInf > 0.001) {
          const spread = atmosphere ? W * 0.24 : W * 0.16;
          const pull = atmosphere ? 0.14 : 0.3;
          const dx = (x - mx) / spread;
          c += (my - c) * pull * mInf * Math.exp(-dx * dx);
        }
        const w =
          H * params.width * widthScale * (r.wBase + r.wRange * p.noise(u * 1.4 + r.off + 50, tt * 0.11));
        const th =
          u * r.tw * params.twist * p.PI +
          tt * r.tws +
          p.noise(u * 0.9 + r.off + 99, tt * 0.09) * 2.2;
        XS[k] = x;
        CS[k] = c;
        WS[k] = w;
        CT[k] = Math.cos(th);
        ST[k] = Math.sin(th);
      }

      const N = params.lines;
      const dk = params.dark;
      const bodyA = (dk ? 0.13 : 0.11) * Math.sqrt(70 / N);

      ctx.lineWidth = 0.55;
      ctx.strokeStyle = gradient(ctx, r, tt, bodyA.toFixed(3));
      for (let i = 0; i < N; i++) {
        const uu = -1 + (2 * i) / (N - 1);
        ctx.beginPath();
        for (let k = 0; k <= SAMPLES; k++) {
          const x = XS[k]! + WS[k]! * uu * ST[k]! * 0.35;
          const y = CS[k]! + WS[k]! * uu * CT[k]!;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }

      if (params.mesh) {
        ctx.lineWidth = 0.4;
        ctx.strokeStyle = gradient(ctx, r, tt, dk ? 0.08 : 0.07);
        ctx.beginPath();
        for (let k = 0; k <= SAMPLES; k += 2) {
          const ox = WS[k]! * ST[k]! * 0.35;
          const oy = WS[k]! * CT[k]!;
          ctx.moveTo(XS[k]! - ox, CS[k]! - oy);
          ctx.lineTo(XS[k]! + ox, CS[k]! + oy);
        }
        ctx.stroke();
      }

      ctx.lineWidth = 0.9;
      ctx.strokeStyle = gradient(ctx, r, tt, dk ? 0.55 : 0.5);
      for (const uu of [-1, 1]) {
        ctx.beginPath();
        for (let k = 0; k <= SAMPLES; k++) {
          const x = XS[k]! + WS[k]! * uu * ST[k]! * 0.35;
          const y = CS[k]! + WS[k]! * uu * CT[k]!;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
      lastMove = p.millis();
    };

    const setRunning = (run: boolean) => {
      if (reducedMotion) return;
      if (run && !p.isLooping()) p.loop();
      if (!run && p.isLooping()) p.noLoop();
    };

    const newSeed = () => {
      seed = Math.floor(Math.random() * 1e6);
      build();
      if (reducedMotion || !p.isLooping()) p.redraw();
    };

    const togglePause = () => {
      if (reducedMotion) return;
      paused = !paused;
      debugUi?.setPaused(paused);
    };

    p.setup = () => {
      p.pixelDensity(
        Math.min(compactField ? 1 : WAVES_CONFIG.maxPixelDensity, p.displayDensity()),
      );
      p.createCanvas(container.clientWidth || 800, container.clientHeight || 500);
      widthScale = widthScaleFor(p.width, p.height);
      mx = pointerX = p.width / 2;
      my = pointerY = p.height / 2;
      build();
      if (reducedMotion) {
        paused = true;
        p.noLoop();
      }
    };

    p.draw = () => {
      if (!paused && !reducedMotion) t += p.deltaTime * 0.001 * params.speed;

      const moving = !reducedMotion && p.millis() - lastMove < (atmosphere ? 3200 : 2500);
      const target = params.mouse && moving ? 1 : 0;
      mInf += (target - mInf) * (atmosphere ? 0.016 : 0.04);
      mx += (pointerX - mx) * (atmosphere ? 0.03 : 0.08);
      my += (pointerY - my) * (atmosphere ? 0.03 : 0.08);

      const ctx = p.drawingContext as CanvasRenderingContext2D;
      if (atmosphere) ctx.clearRect(0, 0, p.width, p.height);
      else if (params.dark) p.background(C.purple[0], C.purple[1], C.purple[2]);
      else p.background(255);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (params.threads) drawThreads(ctx);
      const n = params.ribbons;
      for (let i = 0; i < n; i++) drawRibbon(ctx, ribbons[i]!, i, n);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      widthScale = widthScaleFor(w, h);
      if (w === p.width && h === p.height) return;
      p.resizeCanvas(w, h);
      if (reducedMotion || !p.isLooping()) p.redraw();
    };
    new ResizeObserver(resize).observe(container);

    new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      setRunning(visible && !document.hidden);
    }).observe(container);
    document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));

    if (import.meta.env.DEV && allowDebug && new URLSearchParams(location.search).has('debug')) {
      debugUi = mountDebugPanel(container, params, {
        getSeed: () => seed,
        newSeed,
        togglePause,
      });
      p.keyPressed = () => {
        const el = document.activeElement;
        if (el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') return;
        const key = p.key;
        if (key === 'r' || key === 'R') newSeed();
        else if (key === ' ') togglePause();
        else if (key === 'h' || key === 'H') debugUi?.togglePanel();
        else if (key === 's' || key === 'S') p.saveCanvas(`sota-waves-${seed}`, 'png');
      };
    }
  };

  new p5(sketch, container);
}

function mountDebugPanel(
  container: HTMLElement,
  params: WavesParams,
  hooks: {
    getSeed: () => number;
    newSeed: () => void;
    togglePause: () => void;
  },
): DebugUi {
  const panel = document.createElement('div');
  panel.className = 'waves-debug';
  panel.innerHTML = `
    <h2 class="waves-debug__title">Tomorrow's Waves</h2>
    <p class="waves-debug__sub">seed <span data-seed></span></p>
    <label class="waves-debug__row"><span>speed</span><input data-p="speed" type="range" min="0" max="3" step="0.05"><output></output></label>
    <label class="waves-debug__row"><span>ribbons</span><input data-p="ribbons" type="range" min="1" max="8" step="1"><output></output></label>
    <label class="waves-debug__row"><span>lines</span><input data-p="lines" type="range" min="16" max="140" step="2"><output></output></label>
    <label class="waves-debug__row"><span>amplitude</span><input data-p="amp" type="range" min="0.2" max="2" step="0.05"><output></output></label>
    <label class="waves-debug__row"><span>width</span><input data-p="width" type="range" min="0.3" max="2" step="0.05"><output></output></label>
    <label class="waves-debug__row"><span>twist</span><input data-p="twist" type="range" min="0" max="2.5" step="0.05"><output></output></label>
    <div class="waves-debug__toggles">
      <label><input data-t="mesh" type="checkbox"> mesh</label>
      <label><input data-t="threads" type="checkbox"> threads</label>
      <label><input data-t="mouse" type="checkbox"> mouse</label>
      <label><input data-t="dark" type="checkbox"> deep purple</label>
    </div>
    <div class="waves-debug__btns">
      <button type="button" class="waves-debug__accent" data-act="seed">new seed</button>
      <button type="button" data-act="pause">pause</button>
      <button type="button" data-act="hide">hide</button>
    </div>
    <p class="waves-debug__keys">R new seed · SPACE pause<br>H hide panel · S save png</p>
  `;

  const show = document.createElement('button');
  show.type = 'button';
  show.className = 'waves-debug__show';
  show.textContent = 'controls';
  show.hidden = true;

  const seedLabel = panel.querySelector('[data-seed]')!;
  const pauseBtn = panel.querySelector('[data-act="pause"]') as HTMLButtonElement;

  const sliders = ['speed', 'ribbons', 'lines', 'amp', 'width', 'twist'] as const;
  for (const id of sliders) {
    const input = panel.querySelector<HTMLInputElement>(`[data-p="${id}"]`)!;
    const out = input.parentElement!.querySelector('output')!;
    input.value = String(params[id]);
    out.textContent = String(params[id]);
    input.addEventListener('input', () => {
      params[id] = Number(input.value);
      out.textContent = input.value;
    });
  }

  const toggles = ['mesh', 'threads', 'mouse', 'dark'] as const;
  for (const id of toggles) {
    const input = panel.querySelector<HTMLInputElement>(`[data-t="${id}"]`)!;
    input.checked = params[id];
    input.addEventListener('change', () => {
      params[id] = input.checked;
    });
  }

  const setSeed = (s: number) => {
    seedLabel.textContent = String(s);
  };
  setSeed(hooks.getSeed());

  const setPaused = (isPaused: boolean) => {
    pauseBtn.textContent = isPaused ? 'play' : 'pause';
  };

  const togglePanel = () => {
    const hidden = panel.classList.toggle('is-hidden');
    show.hidden = !hidden;
  };

  panel.querySelector('[data-act="seed"]')!.addEventListener('click', hooks.newSeed);
  pauseBtn.addEventListener('click', hooks.togglePause);
  panel.querySelector('[data-act="hide"]')!.addEventListener('click', togglePanel);
  show.addEventListener('click', togglePanel);

  container.append(panel, show);

  return { setSeed, setPaused, togglePanel };
}
