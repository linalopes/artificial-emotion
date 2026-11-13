import type { Codec, DeviceCommand, DeviceEvent } from './protocol';

/**
 * Wire format spoken between the coordinator and the SIMULATED nodes only.
 * It is deliberately tagged "swarm-sim/0" and is NOT the SWARM firmware protocol:
 * a real ESP32 node will not understand it, and it must never be used for hardware.
 */
export const SIM_WIRE = 'swarm-sim/0';

export const simCodec: Codec = {
  name: SIM_WIRE,
  speaksFirmware: false,
  decode(text: string): DeviceEvent | null {
    try {
      const m = JSON.parse(text);
      if (!m || m.v !== SIM_WIRE || typeof m.event !== 'object') return null;
      return m.event as DeviceEvent;
    } catch {
      return null;
    }
  },
  encodeCommand(messageId: string, cmd: DeviceCommand): string {
    return JSON.stringify({ v: SIM_WIRE, kind: 'cmd', message_id: messageId, cmd });
  },
  encodeClockRequest(seq: number, t1: number): string {
    return JSON.stringify({ v: SIM_WIRE, kind: 'clock_req', seq, t1 });
  },
  encodeReject(reason: string): string {
    return JSON.stringify({ v: SIM_WIRE, kind: 'reject', reason });
  }
};

/** Node side of the same format, used by the simulator. */
export type SimInbound =
  | { kind: 'cmd'; message_id: string; cmd: DeviceCommand }
  | { kind: 'clock_req'; seq: number; t1: number }
  | { kind: 'reject'; reason: string };

export function simDecodeInbound(text: string): SimInbound | null {
  try {
    const m = JSON.parse(text);
    return m && m.v === SIM_WIRE ? (m as SimInbound) : null;
  } catch {
    return null;
  }
}
export function simEncodeEvent(event: DeviceEvent): string {
  return JSON.stringify({ v: SIM_WIRE, event });
}
