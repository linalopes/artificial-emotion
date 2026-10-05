import { CLOCK_TICK_DEG } from './types';

export type ClockFit = 'good' | 'mixed' | 'poor';

export type ClockReport = {
  tickDeg: number;
  stepDeg: number;
  positions: number;
  framesPerTick: number;
  fit: ClockFit;
  status: string;
  interpretation: string;
};

export function encodingStepDeg(frames: number, slices: number): number {
  return 360 / Math.max(1, frames * slices);
}

export function clockReport(frames: number, slices: number): ClockReport {
  const positions = frames * slices;
  const stepDeg = encodingStepDeg(frames, slices);
  const framesPerTick = CLOCK_TICK_DEG / stepDeg;
  const nearest = Math.round(framesPerTick);
  const err = Math.abs(framesPerTick - nearest);
  const exact = err < 1e-6;
  const approx = err < 0.05;

  if (exact && nearest === 1) {
    return {
      tickDeg: CLOCK_TICK_DEG,
      stepDeg,
      positions,
      framesPerTick,
      fit: 'good',
      status: 'This encoding aligns cleanly with a 6° quartz tick.',
      interpretation: 'Each second advances one encoded position — one visual state.',
    };
  }
  if (exact && nearest > 1) {
    return {
      tickDeg: CLOCK_TICK_DEG,
      stepDeg,
      positions,
      framesPerTick,
      fit: 'mixed',
      status: 'This encoding works, but each clock tick advances multiple encoded positions.',
      interpretation: `This clock will skip ${nearest} encoded positions per tick.`,
    };
  }
  if (approx && nearest >= 1) {
    return {
      tickDeg: CLOCK_TICK_DEG,
      stepDeg,
      positions,
      framesPerTick,
      fit: 'mixed',
      status: 'This configuration is close to a 6° clock tick, but not exact.',
      interpretation: 'The animation may still read, but states will not land on whole ticks.',
    };
  }
  return {
    tickDeg: CLOCK_TICK_DEG,
    stepDeg,
    positions,
    framesPerTick,
    fit: 'poor',
    status: 'This encoding does not align cleanly with a 6° quartz tick and may skip states unpredictably.',
    interpretation: 'This configuration does not align cleanly with a 6° clock tick.',
  };
}

export function formatDeg(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return `${trimZeros(n.toFixed(digits))}°`;
}

export function formatCount(n: number): string {
  return trimZeros(n.toFixed(Math.abs(n - Math.round(n)) < 1e-6 ? 1 : 2));
}

function trimZeros(s: string): string {
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0');
}
