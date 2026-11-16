import { isNodeId, type Keyframe } from '@swarm/shared';
import type { Codec, DeviceCommand, DeviceEvent, Telemetry } from './protocol';

/** Wire format spoken by SWARM firmware v0.2.0 (PROTOCOL.md / protocol.cpp). */
export const FW_WIRE = 'swarm-fw/1';
export const FW_PROTOCOL_VERSION = 1;
export const FW_MAX_KEYFRAMES = 32;
export const FW_MAX_MESSAGE_BYTES = 2048;

export interface FirmwareCodecOptions {
  /** Shared with provisioned modules. Never logged. Required for privileged commands. */
  authToken: string;
  /** Source identity in outbound envelopes. */
  source?: string;
}

interface FwEnvelope {
  protocol_version?: number;
  message_id?: string | number;
  source?: string;
  target?: string;
  type?: string;
  timestamp_ms?: number;
  payload?: Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function faultCode(v: unknown): string | null {
  if (v === null || v === undefined || v === 'none' || v === '') return null;
  return typeof v === 'string' ? v : String(v);
}

/** Map firmware status payload fields into coordinator telemetry. */
export function telemetryFromStatus(payload: Record<string, unknown>): Telemetry {
  const state = str(payload.state) ?? '';
  const positionValid = payload.position_valid === true;
  const z = num(payload.z_mm_est);
  // Firmware 0.3.5 could leave fault_ set after stop exited FAULT (UNHOMED/STOPPING).
  // Only surface a fault while state is FAULT — matches canHome() and avoids sticky UI FAULT.
  const rawFault = faultCode(payload.fault);
  const fault = state === 'FAULT' ? rawFault : null;
  return {
    positionMm: positionValid && z !== null ? z : null,
    targetMm: null,
    homed: positionValid && state !== 'UNHOMED' && state !== 'BOOT' && state !== 'CONNECTING',
    homing: state === 'HOMING',
    moving: state === 'MOVING' || state === 'STOPPING',
    endstop: typeof payload.endstop_debounced_closed === 'boolean' ? payload.endstop_debounced_closed : null,
    faultCode: fault,
    rssiDbm: num(payload.rssi),
    rpm: num(payload.speed_rpm),
    accelMmS2: num(payload.acceleration_mm_s2),
    limitMinMm: 0,
    limitMaxMm: num(payload.max_travel_mm),
    clockSynced: payload.clock_synced === true,
    runId: str(payload.run_id),
    loopIndex: num(payload.loop_index),
    completedPasses: num(payload.completed_passes),
    positionValid,
    autonomous: typeof payload.autonomous === 'boolean' ? payload.autonomous : null
  };
}

function envelope(type: string, target: string, messageId: string, payload: Record<string, unknown>, source: string): string {
  return JSON.stringify({
    protocol_version: FW_PROTOCOL_VERSION,
    message_id: messageId,
    source,
    target,
    type,
    timestamp_ms: Date.now(),
    payload
  });
}

function trackPayload(keyframes: Keyframe[]): Array<{ time_ms: number; z_mm: number }> {
  return keyframes.map((k) => ({ time_ms: Math.round(k.tMs), z_mm: k.zMm }));
}

/** Estimate encoded load_trajectory size for one module (must stay ≤ 2048). */
export function estimateLoadTrajectoryBytes(opts: {
  messageId: string;
  target: string;
  runId: string;
  presetId: string;
  keyframes: Keyframe[];
  authToken: string;
  source?: string;
}): number {
  const body = envelope(
    'load_trajectory',
    opts.target,
    opts.messageId,
    {
      auth_token: opts.authToken,
      run_id: opts.runId,
      preset_id: opts.presetId,
      revision: 1,
      track: trackPayload(opts.keyframes)
    },
    opts.source ?? 'swarm-controller'
  );
  return Buffer.byteLength(body, 'utf8');
}

/**
 * Codec for real ESP32-S3 nodes. Tagged speaksFirmware so the coordinator uses
 * absolute coordinator-µs commit timestamps and full clock_sync_fin exchange.
 */
export function createFirmwareCodec(opts: FirmwareCodecOptions): Codec {
  if (!opts.authToken || opts.authToken.length === 0) {
    throw new Error('Firmware codec requires a non-empty auth token.');
  }
  const authToken = opts.authToken;
  const source = opts.source ?? 'swarm-controller';

  const withAuth = (payload: Record<string, unknown>): Record<string, unknown> => ({
    ...payload,
    auth_token: authToken
  });

  return {
    name: FW_WIRE,
    speaksFirmware: true,

    decode(text: string): DeviceEvent | null {
      let m: FwEnvelope;
      try {
        m = JSON.parse(text) as FwEnvelope;
      } catch {
        return null;
      }
      if (!m || typeof m !== 'object') return null;
      if (m.protocol_version !== FW_PROTOCOL_VERSION) return null;
      const type = m.type;
      const payload = m.payload && typeof m.payload === 'object' ? m.payload : {};
      const nodeId = str(m.source) ?? str(payload.module_id);

      if (type === 'ack' || type === 'nack') {
        const messageId = str(payload.ref) ?? (typeof m.message_id === 'string' ? m.message_id : m.message_id != null ? String(m.message_id) : '');
        if (!messageId) return null;
        const ok = type === 'ack' && payload.ok !== false;
        const detail = str(payload.detail) ?? undefined;
        return { type: 'ack', messageId, ok, ...(ok ? {} : { error: detail ?? 'refused by the module' }) };
      }

      if (type === 'status') {
        if (!nodeId) return null;
        const fwVersion = str(payload.firmware_version) ?? 'unknown';
        return {
          type: 'status',
          nodeId,
          fwVersion,
          simulated: false,
          telemetry: telemetryFromStatus(payload)
        };
      }

      if (type === 'clock_sync_resp') {
        const seq = num(payload.sync_seq);
        const t1 = num(payload.t1_us);
        const t2 = num(payload.t2_us);
        const t3 = num(payload.t3_us);
        if (seq === null || t1 === null || t2 === null || t3 === null) return null;
        return { type: 'clock_reply', seq, t1, t2, t3, units: 'us' };
      }

      if (type === 'run_armed' || type === 'run_started' || type === 'run_completed' || type === 'run_failed') {
        const runId = str(payload.run_id) ?? '';
        if (!runId) return null;
        if (type === 'run_armed') return { type: 'run_status', runId, state: 'armed' };
        if (type === 'run_started') return { type: 'run_status', runId, state: 'running' };
        if (type === 'run_completed') return { type: 'run_status', runId, state: 'finished' };
        return { type: 'run_status', runId, state: 'aborted', reason: str(payload.detail) ?? undefined };
      }

      if (type === 'config') {
        if (!nodeId || !isNodeId(nodeId)) return null;
        return { type: 'config', nodeId, config: { ...payload } };
      }

      return null;
    },

    encodeCommand(messageId: string, cmd: DeviceCommand, target = 'broadcast'): string {
      switch (cmd.name) {
        case 'home':
          return envelope('home', target, messageId, withAuth({}), source);
        case 'move':
          return envelope(
            'move_to_mm',
            target,
            messageId,
            withAuth({ position_mm: cmd.targetMm }),
            source
          );
        case 'stop':
          return envelope('stop', target, messageId, {}, source);
        case 'set_params': {
          const payload: Record<string, unknown> = { save: false };
          if (cmd.rpm !== undefined) payload.speed_rpm = cmd.rpm;
          if (cmd.accelMmS2 !== undefined) payload.acceleration_mm_s2 = cmd.accelMmS2;
          return envelope('set_config', target, messageId, withAuth(payload), source);
        }
        case 'set_config': {
          const payload: Record<string, unknown> = {
            ...cmd.fields,
            save: cmd.save === true
          };
          return envelope('set_config', target, messageId, withAuth(payload), source);
        }
        case 'clear_fault':
          return envelope('clear_fault', target, messageId, withAuth({}), source);
        case 'get_config':
          return envelope('get_config', target, messageId, {}, source);
        case 'ota_update':
          return envelope('ota_update', target, messageId, withAuth({ url: cmd.url }), source);
        case 'load_trajectory': {
          if (cmd.keyframes.length > FW_MAX_KEYFRAMES) {
            throw new Error(`Trajectory has ${cmd.keyframes.length} keyframes; firmware allows at most ${FW_MAX_KEYFRAMES}.`);
          }
          const body = envelope(
            'load_trajectory',
            target,
            messageId,
            withAuth({
              run_id: cmd.runId,
              preset_id: cmd.presetId ?? 'score',
              revision: 1,
              track: trackPayload(cmd.keyframes)
            }),
            source
          );
          if (Buffer.byteLength(body, 'utf8') > FW_MAX_MESSAGE_BYTES) {
            throw new Error(`load_trajectory exceeds firmware ${FW_MAX_MESSAGE_BYTES}-byte message limit.`);
          }
          return body;
        }
        case 'prepare': {
          const payload: Record<string, unknown> = { run_id: cmd.runId };
          if (cmd.autonomous) {
            payload.autonomous = true;
            if (cmd.loop) payload.loop = true;
            if (cmd.continuous) payload.continuous = true;
            if (cmd.maxLoops !== undefined) payload.max_loops = cmd.maxLoops;
            if (cmd.maxRuntimeMs !== undefined) payload.max_runtime_ms = cmd.maxRuntimeMs;
          }
          return envelope('prepare_run', target, messageId, withAuth(payload), source);
        }
        case 'commit': {
          if (cmd.startAtCoordUs === undefined) {
            throw new Error('Firmware commit requires startAtCoordUs (coordinator monotonic microseconds).');
          }
          return envelope(
            'commit_run',
            target,
            messageId,
            withAuth({ run_id: cmd.runId, start_at_us: cmd.startAtCoordUs }),
            source
          );
        }
        case 'cancel':
          return envelope('cancel_run', target, messageId, withAuth({ run_id: cmd.runId }), source);
      }
    },

    encodeClockRequest(seq: number, t1Us: number, target = 'broadcast'): string {
      return envelope(
        'clock_sync_req',
        target,
        `sync-req-${seq}`,
        { sync_seq: seq, t1_us: t1Us },
        source
      );
    },

    encodeClockFin(
      seq: number,
      times: { t1: number; t2: number; t3: number; t4: number },
      target: string
    ): string {
      return envelope(
        'clock_sync_fin',
        target,
        `sync-fin-${seq}`,
        {
          sync_seq: seq,
          t1_us: times.t1,
          t2_us: times.t2,
          t3_us: times.t3,
          t4_us: times.t4
        },
        source
      );
    },

    encodeReject(reason: string): string {
      return envelope('nack', 'broadcast', 'reject', { ok: false, detail: reason }, source);
    }
  };
}
