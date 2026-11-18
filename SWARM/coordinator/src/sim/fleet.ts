import { NODE_IDS, type NodeId, type SimScenario } from '@swarm/shared';
import type { SimControl } from '../coordinator';
import { SimNode, type SimNodeOptions } from './node';

/** Nine simulated nodes that reach the coordinator over a real local WebSocket. */
export class SimFleet implements SimControl {
  readonly nodes = new Map<NodeId, SimNode>();

  constructor(url: string, opts: SimNodeOptions = {}) {
    for (const id of NODE_IDS) this.nodes.set(id, new SimNode(id, url, opts));
  }
  start(): void {
    this.nodes.forEach((n) => n.start());
  }
  stop(): void {
    this.nodes.forEach((n) => n.stop());
  }
  scenario(name: SimScenario, node?: NodeId): void {
    const targets = node ? [this.nodes.get(node)!] : [...this.nodes.values()];
    for (const n of targets) {
      if (name === 'disconnect') n.setOffline(true);
      else if (name === 'reconnect') n.setOffline(false);
      else if (name === 'homingFault') n.injectHomingFault();
      else if (name === 'clockFault') n.setClockMuted(true);
      else if (name === 'holdAutonomous') n.setHoldAutonomous(true);
      else if (name === 'releaseAutonomous') n.setHoldAutonomous(false);
      else {
        n.setClockMuted(false);
        n.setOffline(false);
        n.setHoldAutonomous(false);
      }
    }
  }
}
