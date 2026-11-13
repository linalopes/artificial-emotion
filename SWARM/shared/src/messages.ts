import { isNodeId, type NodeId } from './ids';
import type { Snapshot } from './state';
import type { Score } from './score';
import { checkScoreShape } from './validate';

/** Browser to coordinator. An intent states what the operator wants; it is never a motor command. */
export type Intent =
  | { type: 'claimOperator' }
  | { type: 'releaseOperator' }
  | { type: 'home'; nodes: NodeId[] }
  | { type: 'move'; nodes: NodeId[]; targetMm: number }
  | { type: 'stopNodes'; nodes: NodeId[] }
  | { type: 'stopAll' }
  | { type: 'engageStop' }
  | { type: 'releaseStop' }
  | { type: 'setParams'; nodes: NodeId[]; rpm?: number; accelMmS2?: number }
  | { type: 'clearFault'; nodes: NodeId[] }
  | { type: 'goToStart'; score: Score }
  | { type: 'execute'; score: Score; confirmed: true; repeat: boolean }
  | { type: 'cancelRun' }
  | { type: 'simScenario'; scenario: SimScenario; node?: NodeId };

export type SimScenario = 'disconnect' | 'reconnect' | 'homingFault' | 'clockFault' | 'reset';
export type IntentEnvelope = { id: string; intent: Intent };

/** Intents any connected browser may send, operator or not. */
export const OPEN_INTENTS: ReadonlySet<Intent['type']> = new Set(['claimOperator', 'releaseOperator', 'engageStop', 'stopAll']);

export interface NodeOutcome {
  node: NodeId;
  ok: boolean;
  error?: string;
}
export type ServerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'result'; id: string; ok: boolean; error?: string; outcomes?: NodeOutcome[] };

function nodeList(v: unknown): NodeId[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 9) return null;
  const out: NodeId[] = [];
  for (const x of v) {
    if (!isNodeId(x) || out.includes(x)) return null;
    out.push(x);
  }
  return out;
}
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates everything a browser sends. Returns an error string for anything malformed. */
export function parseEnvelope(raw: unknown): IntentEnvelope | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Message is not an object.' };
  const m = raw as { id?: unknown; intent?: unknown };
  if (typeof m.id !== 'string' || m.id.length === 0 || m.id.length > 64) return { error: 'Message id is missing.' };
  if (!m.intent || typeof m.intent !== 'object') return { error: 'Intent is missing.' };
  const i = m.intent as Record<string, unknown>;
  const id = m.id;
  const ok = (intent: Intent): IntentEnvelope => ({ id, intent });
  switch (i.type) {
    case 'claimOperator':
    case 'releaseOperator':
    case 'stopAll':
    case 'engageStop':
    case 'releaseStop':
    case 'cancelRun':
      return ok({ type: i.type });
    case 'home':
    case 'stopNodes':
    case 'clearFault': {
      const nodes = nodeList(i.nodes);
      return nodes ? ok({ type: i.type, nodes }) : { error: 'Node list is invalid.' };
    }
    case 'move': {
      const nodes = nodeList(i.nodes);
      if (!nodes) return { error: 'Node list is invalid.' };
      if (!num(i.targetMm)) return { error: 'Target position is not a number.' };
      return ok({ type: 'move', nodes, targetMm: i.targetMm });
    }
    case 'setParams': {
      const nodes = nodeList(i.nodes);
      if (!nodes) return { error: 'Node list is invalid.' };
      if (i.rpm !== undefined && !num(i.rpm)) return { error: 'Speed is not a number.' };
      if (i.accelMmS2 !== undefined && !num(i.accelMmS2)) return { error: 'Acceleration is not a number.' };
      if (i.rpm === undefined && i.accelMmS2 === undefined) return { error: 'No parameter given.' };
      return ok({ type: 'setParams', nodes, ...(i.rpm === undefined ? {} : { rpm: i.rpm as number }), ...(i.accelMmS2 === undefined ? {} : { accelMmS2: i.accelMmS2 as number }) });
    }
    case 'goToStart': {
      const r = checkScoreShape(i.score);
      return 'error' in r ? r : ok({ type: 'goToStart', score: r.score });
    }
    case 'execute': {
      if (i.confirmed !== true) return { error: 'Execute needs explicit confirmation.' };
      const r = checkScoreShape(i.score);
      return 'error' in r ? r : ok({ type: 'execute', score: r.score, confirmed: true, repeat: i.repeat === true });
    }
    case 'simScenario': {
      const s = i.scenario;
      if (s !== 'disconnect' && s !== 'reconnect' && s !== 'homingFault' && s !== 'clockFault' && s !== 'reset') return { error: 'Unknown scenario.' };
      if (i.node !== undefined && !isNodeId(i.node)) return { error: 'Unknown node.' };
      return ok({ type: 'simScenario', scenario: s, ...(i.node === undefined ? {} : { node: i.node as NodeId }) });
    }
    default:
      return { error: `Unknown intent ${String(i.type)}.` };
  }
}
