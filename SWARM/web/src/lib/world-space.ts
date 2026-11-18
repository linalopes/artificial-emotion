/**
 * Shared world-space layout for SWARM 2D/3D visualization.
 * Visualization-only constants — not physical installation survey data.
 */
import type { NodeId } from '@swarm/shared';
import { viewPoseOf } from './view-grid';

/** Centre-to-centre spacing between ceiling anchors (metres). Visualization only. */
export const ANCHOR_SPACING_M = 0.55;

/** Ceiling plane Y (metres). Spheres hang below this. */
export const CEILING_Y_M = 2.05;

/** Glass sphere radius (metres). Visualization only. */
export const SPHERE_RADIUS_M = 0.07;

/** Convert firmware travel mm → metres downward from the ceiling. */
export function travelMmToDropM(mm: number): number {
  return Math.max(0, mm) / 1000;
}

/** World X (left→right), Z (front→back with +Z toward the observer / front). */
export function anchorWorldXZ(id: NodeId): { x: number; z: number } {
  const { col, depth } = viewPoseOf(id);
  return {
    x: (col - 1) * ANCHOR_SPACING_M,
    z: (1 - depth) * ANCHOR_SPACING_M
  };
}

/** Ceiling anchor position. */
export function anchorWorld(id: NodeId): { x: number; y: number; z: number } {
  const { x, z } = anchorWorldXZ(id);
  return { x, y: CEILING_Y_M, z };
}

/**
 * Sphere centre for a reported/planned travel in mm.
 * Y decreases as travel increases (0 mm = near ceiling).
 */
export function sphereWorld(id: NodeId, travelMm: number): { x: number; y: number; z: number } {
  const a = anchorWorld(id);
  return { x: a.x, y: a.y - travelMmToDropM(travelMm) - SPHERE_RADIUS_M, z: a.z };
}

export type CameraPreset = 'oblique' | 'front' | 'top';

/** Target look-at for all presets (installation centre, mid-height). */
export const CAMERA_LOOK_AT = { x: 0, y: 1.35, z: 0 } as const;

/** Camera eye positions (metres). Oblique keeps Mau01/04/07 closest. */
export const CAMERA_PRESETS: Record<CameraPreset, { x: number; y: number; z: number }> = {
  oblique: { x: 1.65, y: 1.55, z: 2.55 },
  front: { x: 0, y: 1.35, z: 3.15 },
  top: { x: 0, y: 4.4, z: 0.02 }
};
