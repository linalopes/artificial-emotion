import type { Keyframe } from '@swarm/shared';

/**
 * The coordinator's INTERNAL view of what it asks a node to do and what a node reports.
 * Nothing in this file is a wire format. A Codec turns these into the bytes a node understands.
 *
 * Only one codec exists so far: the simulator's. The codec for SWARM firmware v0.2.0 must be
 * written from SWARM/firmware/docs/PROTOCOL.md, which was not available when this was built.
 */
export type DeviceCommand =
  | { name: 'home' }
  | { name: 'move'; targetMm: number }
  | { name: 'stop' }
  | { name: 'set_params'; rpm?: number; accelMmS2?: number }
  | { name: 'clear_fault' }
  | { name: 'load_trajectory'; runId: string; durationMs: number; keyframes: Keyframe[] }
  | { name: 'prepare'; runId: string }
  | { name: 'commit'; runId: string; startAtNodeMs: number }
  | { name: 'cancel'; runId: string };

export interface Telemetry {
  positionMm: number | null;
  targetMm: number | null;
  homed: boolean;
  homing: boolean;
  moving: boolean;
  endstop: boolean | null;
  faultCode: string | null;
  rssiDbm: number | null;
  rpm: number | null;
  accelMmS2: number | null;
  limitMinMm: number | null;
  limitMaxMm: number | null;
}

export type DeviceEvent =
  | { type: 'hello'; nodeId: string; fwVersion: string; simulated: boolean }
  | { type: 'ack'; messageId: string; ok: boolean; error?: string }
  | { type: 'telemetry'; telemetry: Telemetry }
  | { type: 'clock_reply'; seq: number; t1: number; t2: number; t3: number }
  | { type: 'run_status'; runId: string; state: 'running' | 'finished' | 'aborted'; reason?: string };

export interface Codec {
  readonly name: string;
  /** True only for a codec written against, and tested with, the real firmware protocol. */
  readonly speaksFirmware: boolean;
  decode(text: string): DeviceEvent | null;
  encodeCommand(messageId: string, cmd: DeviceCommand): string;
  encodeClockRequest(seq: number, t1: number): string;
  encodeReject(reason: string): string;
}
