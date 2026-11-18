/**
 * Presentational grid mapping for SWARM Control (column-based operator layout).
 *
 * Logical / hardware / choreography (`@swarm/shared` `gridOf`) — UNCHANGED:
 *   logical row 0 = Mau01–Mau03, row 1 = Mau04–Mau06, row 2 = Mau07–Mau09
 *   logical col 0 = Mau01/04/07, col 1 = Mau02/05/08, col 2 = Mau03/06/09
 *
 * Operator-facing visual convention (transpose of the logical axes):
 *   FRONT  (closest):  Mau01 — Mau04 — Mau07
 *   MIDDLE:            Mau02 — Mau05 — Mau08
 *   BACK   (farthest): Mau03 — Mau06 — Mau09
 *
 * Top / plan (back at top of screen):
 *   03  06  09
 *   02  05  08
 *   01  04  07
 */
import { DIAGONALS, NODE_IDS, ROWS, gridOf, type NodeId } from '@swarm/shared';

export { NODE_IDS };

/** Depth 0 = closest (front), 2 = farthest (back). Col 0 = left … 2 = right. */
export function viewPoseOf(id: NodeId): {
  /** Visual column from the operator's left. */
  col: number;
  /** Visual depth: 0 front … 2 back. */
  depth: number;
  logicalRow: number;
  logicalCol: number;
  index: number;
} {
  const { col: logicalCol, row: logicalRow, index } = gridOf(id);
  // Transpose: numbering advances front→back within each visual column.
  return {
    col: logicalRow,
    depth: logicalCol,
    logicalRow,
    logicalCol,
    index
  };
}

/** Exact 3×3 operator layout: [depth][col] → NodeId. depth 0 = front. */
export const VIEW_MATRIX_FRONT_TO_BACK: NodeId[][] = [
  ['Mau01', 'Mau04', 'Mau07'],
  ['Mau02', 'Mau05', 'Mau08'],
  ['Mau03', 'Mau06', 'Mau09']
];

/** Front → middle → back rows (left→right within each). */
export const VIEW_ROWS_FRONT_TO_BACK: { id: string; nodes: NodeId[]; label: string }[] = [
  { id: 'R1', nodes: VIEW_MATRIX_FRONT_TO_BACK[0], label: 'Front' },
  { id: 'R2', nodes: VIEW_MATRIX_FRONT_TO_BACK[1], label: 'Middle' },
  { id: 'R3', nodes: VIEW_MATRIX_FRONT_TO_BACK[2], label: 'Back' }
];

/**
 * Top / plan view rows top→bottom = back→front
 * (03 06 09 / 02 05 08 / 01 04 07).
 */
export const VIEW_ROWS_PLAN_TOP_TO_BOTTOM = [...VIEW_ROWS_FRONT_TO_BACK].reverse();

/** Left → right visual columns (front→back within each = Mau01–03, etc.). */
export const VIEW_COLS_LEFT_TO_RIGHT: { id: string; nodes: NodeId[]; label: string }[] = [
  { id: 'C1', nodes: ROWS[0], label: 'Left' },
  { id: 'C2', nodes: ROWS[1], label: 'Centre' },
  { id: 'C3', nodes: ROWS[2], label: 'Right' }
];

export const VIEW_DIAGONALS = [
  {
    nodes: DIAGONALS[0] as NodeId[],
    label: 'Diag A',
    aria: 'Diagonal from front left (Mau01–Mau05–Mau09)'
  },
  {
    // Same modules as shared DIAGONALS[1]; ordered front-right → back-left for reading.
    nodes: ['Mau07', 'Mau05', 'Mau03'] as NodeId[],
    label: 'Diag B',
    aria: 'Diagonal from front right (Mau07–Mau05–Mau03)'
  }
] as const;

/** Build the plan-view 3×3 string (back at top) for tests / docs. */
export function formatPlanView(): string {
  return VIEW_ROWS_PLAN_TOP_TO_BOTTOM.map((r) =>
    r.nodes.map((id) => id.slice(3)).join('   ')
  ).join('\n');
}
