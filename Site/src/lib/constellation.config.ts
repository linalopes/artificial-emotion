/**
 * Tuning knobs for the research constellation.
 *
 *  - composition, movement, distances, node sizes, labels → this file
 *  - colours, glow, link stroke, typography              → ResearchConstellation.astro <style>
 *  - which nodes/links exist                             → constellation.ts
 *
 * Shared by the client script and (in dev) the debug panel. No imports, so it
 * can be loaded in the browser as-is. In dev, /lab/constellation/?debug exposes
 * most of these as live sliders.
 */

export type NodeType = 'root' | 'research-thread' | 'study' | 'note' | 'reference' | 'event';

export type RelationType =
  | 'root-thread' // Artificial Emotion → research thread
  | 'content-thread' // content → thread listed in its `threads`
  | 'related' // content → content via `related`
  | 'root-event'; // Artificial Emotion → event (events have no threads yet)

export const CONSTELLATION_CONFIG = {
  /* ------------------------------------------------------------------------
     Composition — the authored part. The simulation adds variation inside it.
     ------------------------------------------------------------------------ */
  composition: {
    /**
     * Thread attractors sit on an ellipse of rx = graphScale × width and
     * ry = graphScale × height. 0.38 puts the active network at roughly
     * 70–80 % of the figure width on desktop.
     */
    graphScale: 0.38,
    graphScaleSmall: 0.34,
    /** Home angle (degrees, 0 = right, clockwise) of each thread — ~120° apart. */
    threadAngles: {
      'soft-mechanisms': -90,
      'kinetic-studies': 30,
      'heartbeat-biosignals': 150,
    } as Record<string, number>,
    /** Pull of a thread node toward its home. Strong: threads are the anchors. */
    threadRegionStrength: 0.35,
    /**
     * Pull of content toward the mean of its threads' homes. Gentle: content
     * should "tend toward" a region, not be pinned. Multi-thread content
     * naturally ends up between its attractors.
     */
    contentRegionStrength: 0.06,
    /** Single-thread content targets this multiple of its thread's home (>1 = outward). */
    contentRegionSpread: 1.2,
    /** How far thread homes sway around their angle, in radians. */
    regionDrift: 0.06,
  },

  /* ------------------------------------------------------------------------
     Forces
     ------------------------------------------------------------------------ */
  forces: {
    /** Rest length of each link type, in px (× linkDistanceScale). */
    linkDistance: {
      'root-thread': 240,
      'content-thread': 90,
      related: 80,
      'root-event': 160,
    } satisfies Record<RelationType, number>,
    linkDistanceScale: 1,
    /** How rigidly a link holds its rest length (0–1). Low for root-thread: regions decide. */
    linkStrength: {
      'root-thread': 0.2,
      'content-thread': 0.5,
      related: 0.35,
      'root-event': 0.3,
    } satisfies Record<RelationType, number>,

    /** Repulsion for a study-sized node; larger nodes repel proportionally more. */
    chargeStrength: -200,
    chargeDistanceMax: 480,

    /** Gentle pull of everything toward the centre. */
    centerStrength: 0.03,
    /** Root node is anchored to the centre with this strength. */
    rootAnchorStrength: 0.6,

    /** Extra empty space kept around every node (added to its radius). */
    collidePadding: 14,
    collideStrength: 0.8,
  },

  /* ------------------------------------------------------------------------
     Motion
     ------------------------------------------------------------------------ */
  motion: {
    /** Keeps the simulation from ever fully cooling. 0 = settle and stop. */
    idleAlphaTarget: 0.012,
    /** How fast the initial layout settles (d3 default 0.0228). */
    alphaDecay: 0.03,
    /** Damping; higher = calmer (d3 default 0.4). */
    velocityDecay: 0.5,
    /** Positional drift nudge applied every tick, in px. */
    amplitude: 0.05,
    /** Drift rate, radians per second (0.35 ≈ one cycle per 18 s). */
    speed: 0.35,

    /** Node breathing: radius varies by ± this fraction (0.03 = ±3 %). */
    breathAmplitude: 0.03,
    /** Breathing rate, radians per second (0.8 ≈ one breath per 8 s). */
    breathSpeed: 0.8,
  },

  /* ------------------------------------------------------------------------
     Links
     ------------------------------------------------------------------------ */
  link: {
    /** Bend of the quadratic curve as a fraction of link length (sign alternates). */
    curvature: 0.28,
    /** Travelling pulse on `related` links: speed in px/s … */
    relatedPulseSpeed: 70,
    /** … and mean seconds between pulses per link (randomised ±50 %). */
    relatedPulseEvery: 9,
  },

  /* ------------------------------------------------------------------------
     Look (values the CSS reads as custom properties)
     ------------------------------------------------------------------------ */
  look: {
    /** 0–1. Scales the root halo opacity and glow blur. */
    rootHaloIntensity: 0.45,
  },

  /* ------------------------------------------------------------------------
     Sizes
     ------------------------------------------------------------------------ */
  size: {
    /** Core radius per node type, px. */
    radius: {
      root: 20,
      'research-thread': 14,
      study: 8.5,
      event: 7,
      note: 5.5,
      reference: 5,
    } satisfies Record<NodeType, number>,
    /** Halo radius as a multiple of the core radius. */
    haloScale: 2.2,
    /** Event outer ring radius as a multiple of the core radius. */
    eventRingScale: 1.7,
    /** Below this container width the graph is treated as "small screen". */
    mobileBreakpoint: 640,
    /** Radii, distances and charges are multiplied by this on small screens. */
    mobileScale: 0.7,
  },

  /* ------------------------------------------------------------------------
     Labels
     ------------------------------------------------------------------------ */
  labels: {
    /** Node types whose label is always visible. */
    alwaysTypes: ['root', 'research-thread'] as NodeType[],
    /** Node ids (e.g. "studies/breathing-textile") with a persistent label. */
    pinnedIds: [] as string[],
  },
};

export type ConstellationConfig = typeof CONSTELLATION_CONFIG;
