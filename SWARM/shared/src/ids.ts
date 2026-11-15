/** Module identities. Identity is commissioned in firmware; the application never renames a node. */
export const NODE_IDS = ['Mau01', 'Mau02', 'Mau03', 'Mau04', 'Mau05', 'Mau06', 'Mau07', 'Mau08', 'Mau09'] as const;
export type NodeId = (typeof NODE_IDS)[number];

export function isNodeId(v: unknown): v is NodeId {
  return typeof v === 'string' && (NODE_IDS as readonly string[]).includes(v);
}

/**
 * Firmware `SWARM_RUN_ID_MAX` is 32 bytes including the NUL terminator
 * (`strlen(runId) >= 32` → "invalid run_id"). A full UUID (36 chars) is rejected.
 */
export const FW_RUN_ID_MAX_LEN = 31;

/** Same gate as firmware RunController::loadRun / bindLoadedTrack. */
export function isValidFirmwareRunId(runId: string): boolean {
  return runId.length > 0 && runId.length <= FW_RUN_ID_MAX_LEN;
}

/** Compact run id that fits the firmware buffer (not a dashed UUID). */
export function newFirmwareRunId(uuid: string = globalThis.crypto.randomUUID()): string {
  return uuid.replace(/-/g, '').slice(0, FW_RUN_ID_MAX_LEN);
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
