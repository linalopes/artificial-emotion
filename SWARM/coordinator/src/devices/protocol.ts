import type { Keyframe } from '@swarm/shared';

/**
 * The coordinator's INTERNAL view of what it asks a node to do and what a node reports.
 * Nothing in this file is a wire format. A Codec turns these into the bytes a node understands.
 *
 * Two codecs exist:
 * - sim-codec.ts — invented simulator wire (swarm-sim/0)
 * - firmware-codec.ts — SWARM firmware v0.2.0 (PROTOCOL.md)
 */
export type DeviceCommand =
  | { name: 'home' }
  | { name: 'move'; targetMm: number }
  | { name: 'stop' }
  | { name: 'set_params'; rpm?: number; accelMmS2?: number }
  /** Firmware set_config passthrough (homing / travel commissioning). Does not alter UI. */
  | { name: 'set_config'; save?: boolean; fields: Record<string, unknown> }
  | { name: 'clear_fault' }
  | { name: 'get_config' }
  /** Firmware HTTP OTA. url must be http:// on the LAN; auth is applied by the codec. */
  | { name: 'ota_update'; url: string }
  | { name: 'load_trajectory'; runId: string; durationMs: number; keyframes: Keyframe[]; presetId?: string }
  | {
      name: 'prepare';
      runId: string;
      autonomous?: boolean;
      loop?: boolean;
      continuous?: boolean;
      maxLoops?: number;
      maxRuntimeMs?: number;
    }
  /** Sim: startAtNodeMs. Firmware: startAtCoordUs (coordinator monotonic microseconds). */
  | { name: 'commit'; runId: string; startAtNodeMs?: number; startAtCoordUs?: number }
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
  /** From firmware status.clock_synced when present. */
  clockSynced?: boolean;
  /** Firmware status fields used to reconcile after reconnect (optional). */
  runId?: string | null;
  loopIndex?: number | null;
  completedPasses?: number | null;
  positionValid?: boolean | null;
  autonomous?: boolean | null;
}

export type DeviceEvent =
  | { type: 'hello'; nodeId: string; fwVersion: string; simulated: boolean }
  /** Firmware nodes announce identity via status; used for registration and telemetry. */
  | { type: 'status'; nodeId: string; fwVersion: string; simulated: boolean; telemetry: Telemetry }
  | { type: 'ack'; messageId: string; ok: boolean; error?: string }
  | { type: 'telemetry'; telemetry: Telemetry }
  | { type: 'config'; nodeId: string; config: Record<string, unknown> }
  | { type: 'clock_reply'; seq: number; t1: number; t2: number; t3: number; units?: 'ms' | 'us' }
  | { type: 'run_status'; runId: string; state: 'armed' | 'running' | 'finished' | 'aborted'; reason?: string };

export interface Codec {
  readonly name: string;
  /** True only for a codec written against, and tested with, the real firmware protocol. */
  readonly speaksFirmware: boolean;
  decode(text: string): DeviceEvent | null;
  encodeCommand(messageId: string, cmd: DeviceCommand, target?: string): string;
  encodeClockRequest(seq: number, t1: number, target?: string): string;
  /** Firmware four-timestamp close; optional for sim (no-op / unused). */
  encodeClockFin?(seq: number, times: { t1: number; t2: number; t3: number; t4: number }, target: string): string;
  encodeReject(reason: string): string;
}
