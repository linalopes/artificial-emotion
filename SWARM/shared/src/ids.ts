/** Module identities. Identity is commissioned in firmware; the application never renames a node. */
export const NODE_IDS = ['Mau01', 'Mau02', 'Mau03', 'Mau04', 'Mau05', 'Mau06', 'Mau07', 'Mau08', 'Mau09'] as const;
export type NodeId = (typeof NODE_IDS)[number];

export function isNodeId(v: unknown): v is NodeId {
  return typeof v === 'string' && (NODE_IDS as readonly string[]).includes(v);
}

/** Grid position. Row 0 is the back row (Mau01..Mau03), column 0 is the left column. */
export function gridOf(id: NodeId): { col: number; row: number; index: number } {
  const index = NODE_IDS.indexOf(id);
  return { index, col: index % 3, row: Math.floor(index / 3) };
}

export const ROWS: NodeId[][] = [0, 1, 2].map((r) => NODE_IDS.slice(r * 3, r * 3 + 3));
export const COLS: NodeId[][] = [0, 1, 2].map((c) => [NODE_IDS[c], NODE_IDS[c + 3], NODE_IDS[c + 6]]);
export const DIAGONALS: NodeId[][] = [
  ['Mau01', 'Mau05', 'Mau09'],
  ['Mau03', 'Mau05', 'Mau07']
];
