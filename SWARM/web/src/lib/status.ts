import type { NodeState } from '@swarm/shared';

export type Status = 'offline' | 'fault' | 'homing' | 'unhomed' | 'moving' | 'idle';

export function statusOf(n: NodeState): Status {
  if (!n.connected) return 'offline';
  if (n.faultCode) return 'fault';
  if (n.homing) return 'homing';
  if (!n.homed) return 'unhomed';
  if (n.moving) return 'moving';
  return 'idle';
}

export const STATUS_LABEL: Record<Status, string> = { offline: 'Offline', fault: 'Fault', homing: 'Homing', unhomed: 'Not homed', moving: 'Moving', idle: 'Idle' };

export function positionText(n: NodeState): string {
  if (n.positionMm === null) return n.connected ? 'unknown' : 'no telemetry';
  return `${Math.round(n.positionMm)} mm${n.connected ? '' : ' (last known)'}`;
}

export function agoText(atMs: number | null, nowMs: number): string {
  if (atMs === null) return 'never';
  const s = Math.max(0, (nowMs - atMs) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${(s / 3600).toFixed(1)} h ago`;
}

/** Wording only. The thresholds are placeholders until the hardware has been characterised. */
export function confidenceText(n: NodeState): string {
  if (!n.homed) return 'Unknown';
  if (n.travelSinceHomeMm < 2000) return 'High';
  if (n.travelSinceHomeMm < 6000) return 'Medium';
  return 'Low, re-home';
}

export function wifiText(n: NodeState): string {
  if (!n.connected || n.rssiDbm === null) return 'n/a';
  return `${n.rssiDbm} dBm, ${n.rssiDbm > -55 ? 'good' : n.rssiDbm > -67 ? 'fair' : 'weak'}`;
}

export function clockText(n: NodeState): string {
  if (!n.connected) return 'n/a';
  if (!n.clock) return 'no estimate';
  return `${n.clock.synced ? 'synced' : 'NOT synced'}, ±${n.clock.uncertaintyMs.toFixed(1)} ms, ${(n.clock.ageMs / 1000).toFixed(1)} s old`;
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
