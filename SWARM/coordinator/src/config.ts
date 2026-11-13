import type { FleetKind } from '@swarm/shared';

export interface Config {
  env: 'development' | 'production';
  host: string;
  port: number;
  fleet: FleetKind;
  /** WebSocket path the nodes connect to. */
  devicePath: string;
  /** WebSocket path the browsers connect to. */
  clientPath: string;
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
  const fleet = env.SWARM_FLEET === 'hardware' ? 'hardware' : 'simulator';
  return {
    env: env.SWARM_ENV === 'production' ? 'production' : 'development',
    host: env.SWARM_HOST ?? '0.0.0.0',
    port: Number(env.SWARM_PORT ?? 8787),
    fleet,
    devicePath: env.SWARM_DEVICE_PATH ?? '/device',
    clientPath: '/ws',
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
