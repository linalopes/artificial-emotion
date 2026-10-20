/**
 * OS20 laser-cut plate generator — constants and types.
 * Pitch is a fixed 20 mm lattice from the plate centre. Hole diameters
 * are independent of pitch.
 */

export const PITCH_MM = 20;
export const M3_DIAMETER_MM = 3.2;
export const M6_DIAMETER_MM = 6.2;
export const NAIL_DIAMETER_MM = 1.2;
export const FRAME_ZONE_MM = 10;
export const NAIL_PITCH_MM = 40;
export const DEFAULT_WIDTH_MM = 300;
export const DEFAULT_HEIGHT_MM = 220;
export const MIN_PLATE_MM = 10;
export const MAX_PLATE_MM = 2400;

export type HoleKind = 'm3' | 'm6' | 'nail';

export type PlateParams = {
  widthMm: number;
  heightMm: number;
  m6Perimeter: boolean;
  frameHoles: boolean;
};

export type Hole = {
  /** Centre-origin, millimetres. +x right, +y up. */
  x: number;
  y: number;
  diameter: number;
  kind: HoleKind;
};

export type PlateModel = {
  width: number;
  height: number;
  pitch: number;
  columns: number;
  rows: number;
  /** Total leftover width after the grid span, millimetres. */
  marginX: number;
  /** Total leftover height after the grid span, millimetres. */
  marginY: number;
  m6Perimeter: boolean;
  frameHoles: boolean;
  holes: Hole[];
};
