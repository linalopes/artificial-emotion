export {
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

export {
  buildPlate,
  countAxis,
  exportFilename,
  formatMm,
  sanitizeParams,
  summaryRows,
  type SummaryRow,
} from './geometry';

export { downloadSvg, exportPlateSvg, previewPlateSvg } from './svg';
