import { NODE_IDS, type NodeId, type NodeState } from '@swarm/shared';
import type { Telemetry } from './devices/protocol';

function blank(id: NodeId): NodeState {
  return {
    id, connected: false, simulated: false, fwVersion: null, homed: false, homing: false, moving: false,
    faultCode: null, positionMm: null, targetMm: null, endstop: null, rssiDbm: null, rpm: null, accelMmS2: null,
    limitMinMm: null, limitMaxMm: null, lastHomedAtMs: null, travelSinceHomeMm: 0, clock: null,
    clockSyncedFromNode: null, lastTelemetryAtMs: null,
    reportedRunId: null, loopIndex: null, completedPasses: null, autonomousReported: null,
    positionValid: null, lastLoopBoundaryAction: null, lastProgressAtMs: null
  };
}

/**
 * Last known state of the nine modules. Only node reports change it.
 * After a disconnect the last telemetry is kept but motion flags are cleared, because
 * nothing is known about the module any more.
 */
export class Fleet {
  private states = new Map<NodeId, NodeState>(NODE_IDS.map((id) => [id, blank(id)]));

  get(id: NodeId): NodeState {
    return this.states.get(id)!;
  }
  all(): NodeState[] {
    return NODE_IDS.map((id) => this.get(id));
  }

  connected(id: NodeId, info: { fwVersion: string; simulated: boolean }): void {
    const s = this.get(id);
    s.connected = true;
    s.simulated = info.simulated;
    s.fwVersion = info.fwVersion;
  }

  disconnected(id: NodeId): void {
    const s = this.get(id);
    s.connected = false;
    s.moving = false;
    s.homing = false;
    s.clock = null;
    s.clockSyncedFromNode = null;
  }

  telemetry(id: NodeId, t: Telemetry, wallMs: number): void {
    const s = this.get(id);
    if (t.homed && !s.homed) {
      s.lastHomedAtMs = wallMs;
      s.travelSinceHomeMm = 0;
    } else if (t.homed && s.positionMm !== null && t.positionMm !== null) {
      s.travelSinceHomeMm += Math.abs(t.positionMm - s.positionMm);
    }
    s.homed = t.homed;
    s.homing = t.homing;
    s.moving = t.moving;
    s.faultCode = t.faultCode;
    s.positionMm = t.homed ? t.positionMm : null;
    if (t.targetMm !== null) s.targetMm = t.targetMm;
    s.endstop = t.endstop;
    if (t.rssiDbm !== null) s.rssiDbm = t.rssiDbm;
    // Firmware status may omit acceleration; do not wipe a known value with null.
    if (t.rpm !== null) s.rpm = t.rpm;
    if (t.accelMmS2 !== null) s.accelMmS2 = t.accelMmS2;
    if (t.limitMinMm !== null) s.limitMinMm = t.limitMinMm;
    if (t.limitMaxMm !== null) s.limitMaxMm = t.limitMaxMm;
    if (t.clockSynced !== undefined) s.clockSyncedFromNode = t.clockSynced;
    s.lastTelemetryAtMs = wallMs;
    if (t.runId !== undefined) s.reportedRunId = t.runId ?? null;
    if (t.loopIndex !== undefined && t.loopIndex !== null) s.loopIndex = t.loopIndex;
    if (t.completedPasses !== undefined && t.completedPasses !== null) s.completedPasses = t.completedPasses;
    if (t.autonomous !== undefined) s.autonomousReported = t.autonomous ?? null;
    if (t.positionValid !== undefined) s.positionValid = t.positionValid ?? null;
    if (t.loopBoundary?.action != null) s.lastLoopBoundaryAction = t.loopBoundary.action;
    if (
      (t.completedPasses !== undefined && t.completedPasses !== null) ||
      (t.loopIndex !== undefined && t.loopIndex !== null) ||
      (t.loopBoundary != null)
    ) {
      s.lastProgressAtMs = wallMs;
    }
  }
}
