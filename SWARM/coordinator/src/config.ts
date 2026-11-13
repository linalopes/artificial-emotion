import type { FleetKind } from '@swarm/shared';

export interface Config {
  env: 'development' | 'production';
  host: string;
  port: number;
  fleet: FleetKind;
  /** WebSocket path the nodes connect to. Firmware uses /swarm. */
  devicePath: string;
  /** WebSocket path the browsers connect to. */
  clientPath: string;
  /**
   * Shared with provisioned ESP32 modules (Serial set_token / NVS).
   * Required and non-empty when fleet is hardware. Never logged.
   */
  authToken: string | null;
  helloTimeoutMs: number;
  ackTimeoutMs: number;
  clockIntervalMs: number;
  /** A node counts as synchronised only below this uncertainty and age. */
  clockMaxUncertaintyMs: number;
  clockMaxAgeMs: number;
  /** Lead time between committing a start and the start itself. */
  startLeadMs: number;
  /** How close a module must be to its start position before Execute is allowed. */
  positionToleranceMm: number;
  snapshotIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const fleet: FleetKind = env.SWARM_FLEET === 'hardware' ? 'hardware' : 'simulator';
  const authRaw = env.SWARM_AUTH_TOKEN;
  const authToken =
    typeof authRaw === 'string' && authRaw.length > 0 ? authRaw : fleet === 'hardware' ? null : null;
  return {
    env: env.SWARM_ENV === 'production' ? 'production' : 'development',
    host: env.SWARM_HOST ?? '0.0.0.0',
    port: Number(env.SWARM_PORT ?? 8787),
    fleet,
    devicePath: env.SWARM_DEVICE_PATH ?? '/swarm',
    clientPath: '/ws',
    authToken,
    helloTimeoutMs: 3000,
    ackTimeoutMs: 1500,
    clockIntervalMs: 2000,
    clockMaxUncertaintyMs: 25,
    clockMaxAgeMs: 7000,
    startLeadMs: 2500,
    positionToleranceMm: 3,
    snapshotIntervalMs: 100
  };
}
