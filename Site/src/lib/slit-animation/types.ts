/** Shared types for the Heartbeat Slit Animation lab. Unit space: disc radius = 1, origin at centre, y down. */

export type Point = { x: number; y: number };

export type CubicSeg = {
  c1: Point;
  c2: Point;
  p: Point;
};

export type BezierPath = {
  start: Point;
  cubics: CubicSeg[];
  closed: boolean;
};

export type HeartGeometry = {
  /** Filled silhouette. */
  body: BezierPath;
  /** Paper knockout (chamber), optional. */
  chamber?: BezierPath;
  /** Great vessels, deformed less than the ventricular body. */
  vessels: BezierPath[];
};

export type SlitAnimationParams = {
  frames: number;
  slices: number;
  /** Physical disc diameter in millimetres. */
  diameterMm: number;
  /** Centre hole / axle guide diameter in millimetres. */
  guideMm: number;
};

export type SlitAnimationModel = {
  params: SlitAnimationParams;
  names: string[];
  contractions: number[];
  hearts: HeartGeometry[];
  wedgeCount: number;
  wedgeAngle: number;
};

export const HEART_RED = '#C8102E';
export const MASK_BLACK = '#000000';
export const PAPER_WHITE = '#FFFFFF';
export const MARK_STROKE = '#6B5A78';

export const DEFAULT_PARAMS: SlitAnimationParams = {
  frames: 6,
  slices: 10,
  diameterMm: 120,
  guideMm: 2,
};

export const FRAME_CHOICES = [4, 5, 6, 8, 10, 12] as const;

/** Quartz second-hand tick. */
export const CLOCK_TICK_DEG = 6;

export const CLOCK_PRESETS = [
  { frames: 4, slices: 15 },
  { frames: 5, slices: 12 },
  { frames: 6, slices: 10 },
  { frames: 10, slices: 6 },
  { frames: 12, slices: 5 },
] as const;

export const A4_MM = { width: 210, height: 297 };
