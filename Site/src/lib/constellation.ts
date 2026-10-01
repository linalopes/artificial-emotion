/**
 * Builds the research constellation graph from the content collections.
 * Runs at build time; the result is serialised into the page as JSON.
 *
 * Nodes: root, three research threads, every published study / note /
 * reference / event.
 *
 * Links (nothing is invented beyond the content model):
 *   root-thread     Artificial Emotion → each research thread
 *   content-thread  content → thread, for every id in its `threads`
 *   related         content → content, from `related` (published targets only,
 *                   de-duplicated so A↔B is one link)
 *   root-event      Artificial Emotion → event with no threads
 */
import type { CollectionEntry } from 'astro:content';
import { getPublished } from './content';
import type { NodeType, RelationType } from './constellation.config';
import { entryPath, href, threadPath } from './paths';
import {
  COLLECTIONS,
  THREAD_LIST,
  type CollectionName,
  type ResearchThread,
} from './vocabulary';

export interface ConstellationNode {
  /** Stable id: "root", "thread:<id>" or "<collection>/<id>" (matches `related`). */
  id: string;
  label: string;
  type: NodeType;
  href: string;
  /** Research threads this node belongs to (threads list themselves). */
  threadIds?: ResearchThread[];
}

export interface ConstellationLink {
  source: string;
  target: string;
  relationType: RelationType;
}

export interface ConstellationGraph {
  nodes: ConstellationNode[];
  links: ConstellationLink[];
}

export const ROOT_ID = 'root';
export const threadNodeId = (thread: ResearchThread) => `thread:${thread}`;
export const contentNodeId = (collection: CollectionName, id: string) => `${collection}/${id}`;

const NODE_TYPE_FOR: Record<CollectionName, NodeType> = {
  studies: 'study',
  notes: 'note',
  references: 'reference',
  events: 'event',
};

type AnyEntry = CollectionEntry<CollectionName>;

export async function buildConstellation(): Promise<ConstellationGraph> {
  const nodes: ConstellationNode[] = [];
  const links: ConstellationLink[] = [];
  const seenLinks = new Set<string>();

  const addLink = (source: string, target: string, relationType: RelationType) => {
    if (source === target) return;
    // Undirected de-duplication: A→B and B→A are the same connection.
    const key = [source, target].sort().join('|');
    if (seenLinks.has(key)) return;
    seenLinks.add(key);
    links.push({ source, target, relationType });
  };

  // 1. Root
  nodes.push({ id: ROOT_ID, label: 'Artificial Emotion', type: 'root', href: href('/') });

  // 2. Research threads + root-thread links
  for (const thread of THREAD_LIST) {
    nodes.push({
      id: threadNodeId(thread.id),
      label: thread.label,
      type: 'research-thread',
      href: threadPath(thread.id),
      threadIds: [thread.id],
    });
    addLink(ROOT_ID, threadNodeId(thread.id), 'root-thread');
  }

  // 3. Published content nodes
  const entries: AnyEntry[] = (
    await Promise.all(COLLECTIONS.map((collection) => getPublished(collection)))
  ).flat();

  const nodeIds = new Set<string>(nodes.map((n) => n.id));

  for (const entry of entries) {
    const id = contentNodeId(entry.collection, entry.id);
    const threadIds = 'threads' in entry.data ? entry.data.threads : [];
    nodes.push({
      id,
      label: entry.data.title,
      type: NODE_TYPE_FOR[entry.collection],
      href: entryPath(entry.collection, entry.id),
      ...(threadIds.length > 0 ? { threadIds } : {}),
    });
    nodeIds.add(id);
  }

  // 4. Content links (after all nodes exist, so `related` targets can be checked)
  for (const entry of entries) {
    const id = contentNodeId(entry.collection, entry.id);

    if ('threads' in entry.data) {
      for (const thread of entry.data.threads) {
        addLink(id, threadNodeId(thread), 'content-thread');
      }
    }

    for (const ref of entry.data.related) {
      const target = contentNodeId(ref.collection, ref.id);
      if (nodeIds.has(target)) addLink(id, target, 'related'); // drafts/missing are skipped
    }

    if (entry.collection === 'events' && !('threads' in entry.data && entry.data.threads.length > 0)) {
      addLink(ROOT_ID, id, 'root-event');
    }
  }

  return { nodes, links };
}
