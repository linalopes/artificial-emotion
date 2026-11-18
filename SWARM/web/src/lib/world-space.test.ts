import { describe, expect, it } from 'vitest';
import { NODE_IDS } from '@swarm/shared';
import { viewPoseOf } from './view-grid';
import {
  ANCHOR_SPACING_M,
  CEILING_Y_M,
  CAMERA_PRESETS,
  SPHERE_RADIUS_M,
  anchorWorld,
  sphereWorld,
  travelMmToDropM
} from './world-space';

describe('SWARM 3D world-space', () => {
  it('maps front row Mau01/04/07 closest (+Z) and back Mau03/06/09 farthest (−Z)', () => {
    expect(anchorWorld('Mau01').z).toBeCloseTo(ANCHOR_SPACING_M);
    expect(anchorWorld('Mau04').z).toBeCloseTo(ANCHOR_SPACING_M);
    expect(anchorWorld('Mau07').z).toBeCloseTo(ANCHOR_SPACING_M);
    expect(anchorWorld('Mau03').z).toBeCloseTo(-ANCHOR_SPACING_M);
    expect(anchorWorld('Mau01').x).toBeCloseTo(-ANCHOR_SPACING_M);
    expect(anchorWorld('Mau04').x).toBeCloseTo(0);
    expect(anchorWorld('Mau07').x).toBeCloseTo(ANCHOR_SPACING_M);
  });

  it('drops spheres downward from the ceiling as travel mm increases (0 near ceiling, 500 mm = 0.5 m)', () => {
    expect(travelMmToDropM(0)).toBe(0);
    expect(travelMmToDropM(500)).toBeCloseTo(0.5);
    const home = sphereWorld('Mau05', 0);
    const deep = sphereWorld('Mau05', 500);
    expect(home.y).toBeCloseTo(CEILING_Y_M - SPHERE_RADIUS_M);
    expect(deep.y).toBeCloseTo(CEILING_Y_M - 0.5 - SPHERE_RADIUS_M);
    expect(deep.y).toBeLessThan(home.y);
    expect(home.x).toBe(deep.x);
    expect(home.z).toBe(deep.z);
  });

  it('keeps world anchors aligned with viewPoseOf for all nine modules', () => {
    for (const id of NODE_IDS) {
      const { col, depth } = viewPoseOf(id);
      const a = anchorWorld(id);
      expect(a.x).toBeCloseTo((col - 1) * ANCHOR_SPACING_M);
      expect(a.z).toBeCloseTo((1 - depth) * ANCHOR_SPACING_M);
      expect(a.y).toBe(CEILING_Y_M);
    }
  });

  it('defines oblique / front / top camera presets with front row closest in oblique/front', () => {
    expect(CAMERA_PRESETS.oblique.z).toBeGreaterThan(ANCHOR_SPACING_M);
    expect(CAMERA_PRESETS.front.z).toBeGreaterThan(CAMERA_PRESETS.oblique.z);
    expect(CAMERA_PRESETS.front.x).toBe(0);
    expect(CAMERA_PRESETS.top.y).toBeGreaterThan(CAMERA_PRESETS.oblique.y);
    expect(CAMERA_PRESETS.top.z).toBeLessThan(CAMERA_PRESETS.front.z);
  });
});
