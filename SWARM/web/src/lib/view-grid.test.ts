import { describe, expect, it } from 'vitest';
import { NODE_IDS, gridOf } from '@swarm/shared';
import {
  VIZ_ANCHOR_SPACING_MM,
  VIEW_COLS_LEFT_TO_RIGHT,
  VIEW_MATRIX_FRONT_TO_BACK,
  VIEW_ROWS_FRONT_TO_BACK,
  VIEW_ROWS_PLAN_TOP_TO_BOTTOM,
  formatPlanView,
  viewPoseOf,
  worldAnchorOf,
  worldSphereOf
} from './view-grid';

describe('SWARM Control column-based spatial mapping', () => {
  it('places Mau01/04/07 at front, Mau02/05/08 middle, Mau03/06/09 at back', () => {
    expect(VIEW_MATRIX_FRONT_TO_BACK).toEqual([
      ['Mau01', 'Mau04', 'Mau07'],
      ['Mau02', 'Mau05', 'Mau08'],
      ['Mau03', 'Mau06', 'Mau09']
    ]);

    for (const id of NODE_IDS) {
      const { col, depth } = viewPoseOf(id);
      expect(VIEW_MATRIX_FRONT_TO_BACK[depth][col]).toBe(id);
    }

    expect(viewPoseOf('Mau01')).toMatchObject({ col: 0, depth: 0 });
    expect(viewPoseOf('Mau04')).toMatchObject({ col: 1, depth: 0 });
    expect(viewPoseOf('Mau07')).toMatchObject({ col: 2, depth: 0 });
    expect(viewPoseOf('Mau02')).toMatchObject({ col: 0, depth: 1 });
    expect(viewPoseOf('Mau05')).toMatchObject({ col: 1, depth: 1 });
    expect(viewPoseOf('Mau08')).toMatchObject({ col: 2, depth: 1 });
    expect(viewPoseOf('Mau03')).toMatchObject({ col: 0, depth: 2 });
    expect(viewPoseOf('Mau06')).toMatchObject({ col: 1, depth: 2 });
    expect(viewPoseOf('Mau09')).toMatchObject({ col: 2, depth: 2 });
  });

  it('matches the exact top-view plan (back at top)', () => {
    expect(formatPlanView()).toBe(['03   06   09', '02   05   08', '01   04   07'].join('\n'));
    expect(VIEW_ROWS_PLAN_TOP_TO_BOTTOM.map((r) => r.nodes)).toEqual([
      ['Mau03', 'Mau06', 'Mau09'],
      ['Mau02', 'Mau05', 'Mau08'],
      ['Mau01', 'Mau04', 'Mau07']
    ]);
    expect(VIEW_ROWS_FRONT_TO_BACK.map((r) => r.label)).toEqual(['Front', 'Middle', 'Back']);
  });

  it('keeps left-to-right columns as Mau01–03, Mau04–06, Mau07–09', () => {
    expect(VIEW_COLS_LEFT_TO_RIGHT.map((c) => c.nodes)).toEqual([
      ['Mau01', 'Mau02', 'Mau03'],
      ['Mau04', 'Mau05', 'Mau06'],
      ['Mau07', 'Mau08', 'Mau09']
    ]);
  });

  it('does not alter logical choreography gridOf identities', () => {
    expect(gridOf('Mau01')).toEqual({ index: 0, col: 0, row: 0 });
    expect(gridOf('Mau05')).toEqual({ index: 4, col: 1, row: 1 });
    expect(gridOf('Mau09')).toEqual({ index: 8, col: 2, row: 2 });
    // Visual pose is the transpose of logical (row, col).
    for (const id of NODE_IDS) {
      const g = gridOf(id);
      const v = viewPoseOf(id);
      expect(v.col).toBe(g.row);
      expect(v.depth).toBe(g.col);
      expect(v.index).toBe(g.index);
    }
  });

  it('maps 0–500 mm travel downward in shared world coordinates', () => {
    const a = worldAnchorOf('Mau01');
    expect(a).toEqual({ x: -VIZ_ANCHOR_SPACING_MM, y: 0, z: 0 });
    expect(worldSphereOf('Mau01', 0)).toMatchObject({ x: a.x, y: 0, z: 0, known: true });
    expect(worldSphereOf('Mau01', 500)).toMatchObject({ x: a.x, y: -500, z: 0, known: true });
    expect(worldSphereOf('Mau01', null).known).toBe(false);
    expect(worldAnchorOf('Mau07')).toEqual({ x: VIZ_ANCHOR_SPACING_MM, y: 0, z: 0 });
    expect(worldAnchorOf('Mau03').z).toBe(2 * VIZ_ANCHOR_SPACING_MM);
  });
});
