/**
 * Client-side research constellation (D3 force simulation, SVG).
 *
 * Mounted on any element with [data-constellation] that contains
 *   <script type="application/json"> { nodes, links } </script>
 *   <svg></svg>
 *
 * Tuning: src/lib/constellation.config.ts (composition, movement, sizes, labels)
 * Look:   ResearchConstellation.astro <style> (colours, glow, strokes)
 *
 * Two loops run:
 *   - the d3 simulation tick (positions, link paths)
 *   - an "ambient" requestAnimationFrame loop (node breathing, travelling
 *     pulses on `related` links). Disabled under prefers-reduced-motion.
 */
import { drag as d3Drag, type D3DragEvent } from 'd3-drag';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { select, type Selection } from 'd3-selection';
import type { ConstellationGraph, ConstellationNode } from '../lib/constellation';
import { CONSTELLATION_CONFIG, type RelationType } from '../lib/constellation.config';

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SimNode extends ConstellationNode, SimulationNodeDatum {
  x: number;
  y: number;
  /** Core radius (already scaled for screen size). */
  r: number;
  /** Personal phase so nodes never move or breathe in unison. */
  phase: number;
  /** Pull toward the region target (0 = none). */
  regionStrength: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  relationType: RelationType;
  /** +1 / −1: which side the curve bends to. */
  bend: number;
  /** Set once the DOM exists (for pulses). */
  pathEl?: SVGPathElement;
  groupEl?: SVGGElement;
  /** Seconds (ambient clock) at which the next pulse may start. */
  nextPulseAt?: number;
}

interface Pulse {
  link: SimLink;
  el: SVGCircleElement;
  start: number;
  duration: number;
}

type NodeSel = Selection<SVGAElement, SimNode, SVGGElement, unknown>;
type LinkSel = Selection<SVGGElement, SimLink, SVGGElement, unknown>;
type Config = typeof CONSTELLATION_CONFIG;

const asNode = (v: SimLink['source']) => v as SimNode;
const deg2rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* --------------------------------------------------------------------------
   Mount
   -------------------------------------------------------------------------- */

export function mountConstellation(container: HTMLElement): void {
  const dataEl = container.querySelector<HTMLScriptElement>('script[type="application/json"]');
  const svgEl = container.querySelector<SVGSVGElement>('svg');
  if (!dataEl || !svgEl) return;

  const graph = JSON.parse(dataEl.textContent ?? '{}') as ConstellationGraph;
  const config: Config = structuredClone(CONSTELLATION_CONFIG);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    config.motion.idleAlphaTarget = 0;
    config.motion.amplitude = 0;
    config.motion.breathAmplitude = 0;
    config.composition.regionDrift = 0;
  }

  /* ---- viewport --------------------------------------------------------- */
  let width = container.clientWidth || 800;
  let height = container.clientHeight || 500;
  let small = width < config.size.mobileBreakpoint;
  let scale = small ? config.size.mobileScale : 1;

  const graphScale = () => (small ? config.composition.graphScaleSmall : config.composition.graphScale);
  const ringX = () => width * graphScale();
  const ringY = () => height * graphScale();

  container.classList.toggle('is-small', small);

  const svg = select(svgEl);
  const setViewBox = () => svg.attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);
  setViewBox();

  const applyLook = () => {
    container.style.setProperty('--root-halo', String(config.look.rootHaloIntensity));
  };
  applyLook();

  /* ---- clock ------------------------------------------------------------ */
  const t0 = performance.now();
  const seconds = () => (performance.now() - t0) / 1000;

  /* ---- composition: where things want to be ----------------------------- */
  const threadAngle = (threadId: string) => deg2rad(config.composition.threadAngles[threadId] ?? 0);

  /** Home of a thread on the ellipse, including its slow sway. */
  const homeOf = (threadId: string, t: number) => {
    const sway =
      Math.sin(t * config.motion.speed * 0.5 + threadAngle(threadId) * 3) *
      config.composition.regionDrift;
    const a = threadAngle(threadId) + sway;
    return { x: Math.cos(a) * ringX(), y: Math.sin(a) * ringY() };
  };

  /**
   * Region target for a node: threads → their own home; content → the mean
   * of its threads' homes (pushed slightly outward when it has one thread).
   * Multi-thread content shares a centroid, so it is given a small phase
   * offset — a field around the mean, not a stack on the same point.
   */
  const targetOf = (n: SimNode, t: number) => {
    if (!n.threadIds?.length) return null;
    if (n.type === 'research-thread') return homeOf(n.threadIds[0]!, t);
    let x = 0;
    let y = 0;
    for (const id of n.threadIds) {
      const h = homeOf(id, t);
      x += h.x;
      y += h.y;
    }
    const k = (n.threadIds.length === 1 ? config.composition.contentRegionSpread : 1) / n.threadIds.length;
    x *= k;
    y *= k;
    if (n.threadIds.length > 1) {
      const field = Math.min(ringX(), ringY()) * (n.threadIds.length === 2 ? 0.22 : 0.2);
      x += Math.cos(n.phase) * field;
      y += Math.sin(n.phase) * field;
    }
    return { x, y };
  };

  /** Threads hold the triangle; single-thread content orbits; multi-thread is looser. */
  const regionStrengthOf = (n: ConstellationNode) => {
    if (n.type === 'research-thread') return config.composition.threadRegionStrength;
    if (!n.threadIds?.length) return 0;
    return n.threadIds.length === 1
      ? config.composition.contentRegionStrength
      : config.composition.contentRegionStrength * 0.5;
  };

  /* ---- data ------------------------------------------------------------- */
  const nodes: SimNode[] = graph.nodes.map((n, i) => {
    const node: SimNode = {
      ...n,
      r: config.size.radius[n.type] * scale,
      x: 0,
      y: 0,
      phase: (i * 2.399) % (Math.PI * 2), // golden-angle spread
      regionStrength: regionStrengthOf(n),
    };
    // Seed near the intended composition so the opening is calm, not a burst.
    const target = targetOf(node, 0);
    if (n.type === 'root') {
      node.x = 0;
      node.y = 0;
    } else if (target) {
      node.x = target.x + (Math.random() - 0.5) * 80;
      node.y = target.y + (Math.random() - 0.5) * 80;
    } else {
      const a = Math.random() * Math.PI * 2;
      node.x = Math.cos(a) * ringX() * 0.6;
      node.y = Math.sin(a) * ringY() * 0.6;
    }
    return node;
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const links: SimLink[] = graph.links
    .filter((l) => byId.has(l.source) && byId.has(l.target))
    .map((l, i) => ({
      source: l.source,
      target: l.target,
      relationType: l.relationType,
      bend: i % 2 === 0 ? 1 : -1,
    }));

  const neighbours = new Map<string, Set<string>>();
  for (const l of links) {
    const s = l.source as string;
    const t = l.target as string;
    (neighbours.get(s) ?? neighbours.set(s, new Set()).get(s)!).add(t);
    (neighbours.get(t) ?? neighbours.set(t, new Set()).get(t)!).add(s);
  }

  /* ---- DOM -------------------------------------------------------------- */
  svg.selectAll('*').remove();

  const linkSel: LinkSel = svg
    .append('g')
    .attr('class', 'links')
    .selectAll<SVGGElement, SimLink>('g')
    .data(links)
    .join('g')
    .attr('class', (d) => `link link--${d.relationType}`);

  linkSel.append('path').attr('class', 'link__base');
  linkSel.each(function (d) {
    d.groupEl = this;
    d.pathEl = this.querySelector('path')!;
  });

  // 'svg:a' forces the SVG namespace (and the SVGAElement type); nodes are real links.
  const nodeSel: NodeSel = svg
    .append('g')
    .attr('class', 'nodes')
    .selectAll<SVGAElement, SimNode>('a')
    .data(nodes)
    .join((enter) => enter.append<SVGAElement>('svg:a'))
    .attr('class', (d) => `node node--${d.type}`)
    .attr('href', (d) => d.href)
    .attr('aria-label', (d) => d.label);

  nodeSel.append('circle').attr('class', 'node__halo');
  nodeSel
    .filter((d) => d.type === 'event')
    .append('circle')
    .attr('class', 'node__ring');
  nodeSel.append('circle').attr('class', 'node__core');
  nodeSel.append('text').attr('class', 'node__label').text((d) => d.label);

  /** Set all radii from a breathing factor k (1 = rest). */
  const setRadii = (sel: NodeSel, k: (d: SimNode) => number) => {
    sel.select<SVGCircleElement>('.node__core').attr('r', (d) => d.r * k(d));
    sel.select<SVGCircleElement>('.node__halo').attr('r', (d) => d.r * config.size.haloScale * k(d));
    sel.select<SVGCircleElement>('.node__ring').attr('r', (d) => d.r * config.size.eventRingScale * k(d));
  };
  setRadii(nodeSel, () => 1);

  const applyLabelVisibility = () =>
    nodeSel.classed(
      'is-labelled',
      (d) => config.labels.alwaysTypes.includes(d.type) || config.labels.pinnedIds.includes(d.id),
    );
  applyLabelVisibility();

  /* ---- forces ----------------------------------------------------------- */
  const linkForce = forceLink<SimNode, SimLink>(links).id((d) => d.id);
  const charge = forceManyBody<SimNode>();
  const collide = forceCollide<SimNode>();
  const center = forceCenter<SimNode>(0, 0);
  const anchorX = forceX<SimNode>(0);
  const anchorY = forceY<SimNode>(0);

  /** Threads and content drift toward their (slowly swaying) region targets. */
  const regions = (alpha: number) => {
    const t = seconds();
    for (const n of nodes) {
      if (!n.regionStrength) continue;
      const target = targetOf(n, t);
      if (!target) continue;
      n.vx! += (target.x - n.x) * n.regionStrength * alpha;
      n.vy! += (target.y - n.y) * n.regionStrength * alpha;
    }
  };

  /** Tiny per-node positional oscillation so the composition never freezes. */
  const drift = () => {
    const amp = config.motion.amplitude;
    if (!amp) return;
    const t = seconds() * config.motion.speed;
    for (const n of nodes) {
      const k = n.type === 'root' ? 0.3 : 1;
      n.vx! += Math.sin(t + n.phase) * amp * k;
      n.vy! += Math.cos(t * 0.8 + n.phase * 1.3) * amp * k;
    }
  };

  const applyForces = () => {
    const f = config.forces;
    const studyR = config.size.radius.study * scale;
    for (const n of nodes) n.regionStrength = regionStrengthOf(n);
    const asSim = (v: SimLink['source']) => (typeof v === 'object' ? (v as SimNode) : byId.get(v as string));
    linkForce
      .distance((l) => f.linkDistance[l.relationType] * f.linkDistanceScale * scale)
      .strength((l) => {
        const base = f.linkStrength[l.relationType];
        if (l.relationType !== 'content-thread') return base;
        const s = asSim(l.source);
        const t = asSim(l.target);
        const content = s?.type === 'research-thread' ? t : s;
        const n = content?.threadIds?.length ?? 1;
        return n > 1 ? base / n : base;
      });
    charge
      .strength((d) => f.chargeStrength * scale * clamp(d.r / studyR, 0.6, 3))
      .distanceMax(f.chargeDistanceMax * scale);
    collide
      .radius((d) => {
        const labelClearance = d.type === 'root' ? 34 * scale : d.type === 'research-thread' ? 10 * scale : 0;
        return d.r + f.collidePadding * scale + labelClearance;
      })
      .strength(f.collideStrength);
    center.strength(f.centerStrength);
    anchorX.strength((d) => (d.type === 'root' ? f.rootAnchorStrength : 0));
    anchorY.strength((d) => (d.type === 'root' ? f.rootAnchorStrength : 0));
    simulation
      .alphaDecay(config.motion.alphaDecay)
      .velocityDecay(config.motion.velocityDecay)
      .alphaTarget(config.motion.idleAlphaTarget);
  };

  const simulation: Simulation<SimNode, SimLink> = forceSimulation<SimNode, SimLink>(nodes)
    .force('link', linkForce)
    .force('charge', charge)
    .force('collide', collide)
    .force('center', center)
    .force('anchorX', anchorX)
    .force('anchorY', anchorY)
    .force('regions', regions)
    .force('drift', drift);

  applyForces();

  /* ---- tick: positions and paths ---------------------------------------- */
  const linkPath = (l: SimLink) => {
    const s = asNode(l.source);
    const t = asNode(l.target);
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const k = l.bend * config.link.curvature;
    return `M${s.x},${s.y} Q${mx - dy * k},${my + dx * k} ${t.x},${t.y}`;
  };

  simulation.on('tick', () => {
    const hw = width / 2;
    const hh = height / 2;
    for (const n of nodes) {
      const labelled = n.type === 'root' || n.type === 'research-thread';
      const pad = n.r + (labelled ? (small ? 26 : 18) : 8);
      n.x = clamp(n.x, -hw + pad, hw - pad);
      n.y = clamp(n.y, -hh + pad, hh - pad);
    }

    nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);

    // Labels sit on the side facing away from the centre, unless that would
    // run off the edge — then they flip inward. Width is a rough estimate.
    const fitsOutward = (d: SimNode) => {
      const outward = Math.sign(d.x || 1);
      const needed = d.label.length * (d.type === 'research-thread' ? 8.5 : 7) + d.r + 14;
      const room = outward > 0 ? hw - d.x : hw + d.x;
      return room >= needed;
    };
    const labelSide = (d: SimNode) => {
      const outward = Math.sign(d.x || 1);
      return fitsOutward(d) ? outward : -outward;
    };
    // Root always, and threads on small screens or without room on their
    // outward side, are labelled underneath (an inward thread label would
    // collide with the root's). Nudged sideways if the centred text would
    // run past an edge.
    const below = (d: SimNode) =>
      d.type === 'root' || (d.type === 'research-thread' && (small || !fitsOutward(d)));
    const belowX = (d: SimNode) => {
      const half = (d.label.length * (d.type === 'root' ? 9 : small ? 6.5 : 7.6)) / 2;
      return clamp(0, -hw - d.x + half + 8, hw - d.x - half - 8);
    };

    nodeSel
      .select<SVGTextElement>('text')
      .attr('x', (d) => (below(d) ? belowX(d) : labelSide(d) * (d.r + 8)))
      .attr('y', (d) => (below(d) ? d.r + (d.type === 'root' ? 20 : 14) : 0))
      .attr('text-anchor', (d) => (below(d) ? 'middle' : labelSide(d) > 0 ? 'start' : 'end'));

    linkSel.each(function (l) {
      select(this).select('path').attr('d', linkPath(l));
    });
  });

  /* ---- ambient loop: breathing + travelling pulses ---------------------- */
  const pulses: Pulse[] = [];
  const relatedLinks = links.filter((l) => l.relationType === 'related');

  const scheduleNext = (l: SimLink, now: number) => {
    const every = config.link.relatedPulseEvery;
    l.nextPulseAt = now + every * (0.5 + Math.random());
  };
  for (const l of relatedLinks) scheduleNext(l, Math.random() * 3); // stagger the first ones

  /** Breathing factor for a node at time t. Heartbeat thread is a little less regular. */
  const breath = (n: SimNode, t: number) => {
    const amp = config.motion.breathAmplitude;
    if (!amp) return 1;
    const x = t * config.motion.breathSpeed + n.phase;
    if (n.type === 'research-thread' && n.threadIds?.[0] === 'heartbeat-biosignals') {
      return 1 + amp * (0.7 * Math.sin(x) + 0.35 * Math.sin(x * 2.3 + 1.1));
    }
    return 1 + amp * Math.sin(x);
  };

  const ambient = () => {
    if (document.hidden) {
      requestAnimationFrame(ambient);
      return;
    }
    const now = seconds();

    // Breathing
    setRadii(nodeSel, (d) => breath(d, now));

    // Pulses on `related` links
    for (const l of relatedLinks) {
      if (l.nextPulseAt !== undefined && now >= l.nextPulseAt && l.pathEl && l.groupEl) {
        const len = l.pathEl.getTotalLength();
        if (len > 1) {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          el.setAttribute('class', 'link__pulse');
          el.setAttribute('r', String(1.8 * scale));
          l.groupEl.appendChild(el);
          pulses.push({ link: l, el, start: now, duration: len / config.link.relatedPulseSpeed });
        }
        scheduleNext(l, now);
      }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]!;
      const u = (now - p.start) / p.duration;
      if (u >= 1 || !p.link.pathEl) {
        p.el.remove();
        pulses.splice(i, 1);
        continue;
      }
      const len = p.link.pathEl.getTotalLength();
      const pt = p.link.pathEl.getPointAtLength(u * len);
      p.el.setAttribute('cx', String(pt.x));
      p.el.setAttribute('cy', String(pt.y));
      p.el.style.opacity = String(Math.sin(u * Math.PI) * 0.95);
    }

    requestAnimationFrame(ambient);
  };
  if (!reducedMotion) requestAnimationFrame(ambient);

  /* ---- hover / focus ---------------------------------------------------- */
  const setFocus = (focus: SimNode | null) => {
    svg.classed('is-active', focus !== null);
    const near = focus ? neighbours.get(focus.id) ?? new Set<string>() : new Set<string>();
    nodeSel
      .classed('is-focus', (d) => d === focus)
      .classed('is-neighbour', (d) => near.has(d.id));
    linkSel.classed(
      'is-linked',
      (l) => focus !== null && (asNode(l.source) === focus || asNode(l.target) === focus),
    );
  };

  nodeSel
    .on('pointerenter', (_, d) => setFocus(d))
    .on('pointerleave', () => setFocus(null))
    .on('focus', (_, d) => setFocus(d))
    .on('blur', () => setFocus(null));

  /* ---- drag ------------------------------------------------------------- */
  type DragEvent = D3DragEvent<SVGAElement, SimNode, SimNode>;
  nodeSel.call(
    d3Drag<SVGAElement, SimNode>()
      .clickDistance(6)
      .on('start', (event: DragEvent, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        svg.classed('is-dragging', true);
      })
      .on('drag', (event: DragEvent, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: DragEvent, d) => {
        if (!event.active) simulation.alphaTarget(config.motion.idleAlphaTarget);
        d.fx = null;
        d.fy = null;
        svg.classed('is-dragging', false);
      }),
  );

  /* ---- resize ----------------------------------------------------------- */
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    const wasSmall = small;
    small = width < config.size.mobileBreakpoint;
    scale = small ? config.size.mobileScale : 1;
    container.classList.toggle('is-small', small);
    setViewBox();
    if (wasSmall !== small) {
      for (const n of nodes) n.r = config.size.radius[n.type] * scale;
      setRadii(nodeSel, () => 1);
    }
    applyForces();
    simulation.alpha(0.4).restart();
  };
  new ResizeObserver(resize).observe(container);

  /* ---- debug panel: lab instances only, dev builds only, ?debug only ------ */
  if (
    import.meta.env.DEV &&
    container.dataset.mode === 'lab' &&
    new URLSearchParams(location.search).has('debug')
  ) {
    mountDebugPanel(container, config, () => {
      applyForces();
      applyLabelVisibility();
      applyLook();
      simulation.alpha(0.5).restart();
    });
  }
}

/* --------------------------------------------------------------------------
   Debug panel
   -------------------------------------------------------------------------- */

function mountDebugPanel(container: HTMLElement, config: Config, onChange: () => void) {
  const panel = document.createElement('details');
  panel.className = 'constellation-debug';
  panel.open = true;
  panel.innerHTML = '<summary>constellation · debug</summary>';

  type Control = [label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void];
  const groups: Record<string, Control[]> = {
    composition: [
      ['graph scale', 0.15, 0.5, 0.01, () => config.composition.graphScale, (v) => (config.composition.graphScale = v)],
      ['thread region strength', 0, 0.6, 0.01, () => config.composition.threadRegionStrength, (v) => (config.composition.threadRegionStrength = v)],
      ['content region strength', 0, 0.3, 0.005, () => config.composition.contentRegionStrength, (v) => (config.composition.contentRegionStrength = v)],
      ['content spread', 0.8, 1.8, 0.05, () => config.composition.contentRegionSpread, (v) => (config.composition.contentRegionSpread = v)],
    ],
    forces: [
      ['link distance ×', 0.4, 2.5, 0.05, () => config.forces.linkDistanceScale, (v) => (config.forces.linkDistanceScale = v)],
      ['charge strength', -600, 0, 10, () => config.forces.chargeStrength, (v) => (config.forces.chargeStrength = v)],
      ['collision padding', 0, 60, 1, () => config.forces.collidePadding, (v) => (config.forces.collidePadding = v)],
    ],
    motion: [
      ['drift amplitude', 0, 0.4, 0.005, () => config.motion.amplitude, (v) => (config.motion.amplitude = v)],
      ['drift speed', 0, 2, 0.05, () => config.motion.speed, (v) => (config.motion.speed = v)],
      ['idle alpha target', 0, 0.08, 0.002, () => config.motion.idleAlphaTarget, (v) => (config.motion.idleAlphaTarget = v)],
      ['breath amplitude', 0, 0.12, 0.005, () => config.motion.breathAmplitude, (v) => (config.motion.breathAmplitude = v)],
      ['breath speed', 0, 3, 0.05, () => config.motion.breathSpeed, (v) => (config.motion.breathSpeed = v)],
    ],
    links: [
      ['curvature', 0, 0.6, 0.01, () => config.link.curvature, (v) => (config.link.curvature = v)],
      ['related pulse speed (px/s)', 10, 300, 5, () => config.link.relatedPulseSpeed, (v) => (config.link.relatedPulseSpeed = v)],
      ['related pulse every (s)', 1, 30, 0.5, () => config.link.relatedPulseEvery, (v) => (config.link.relatedPulseEvery = v)],
    ],
    look: [
      ['root halo intensity', 0, 1, 0.05, () => config.look.rootHaloIntensity, (v) => (config.look.rootHaloIntensity = v)],
    ],
  };

  for (const [group, controls] of Object.entries(groups)) {
    const heading = document.createElement('p');
    heading.className = 'constellation-debug__group';
    heading.textContent = group;
    panel.append(heading);
    for (const [label, min, max, step, get, set] of controls) {
      const row = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('output');
      value.textContent = String(get());
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      input.addEventListener('input', () => {
        set(Number(input.value));
        value.textContent = input.value;
        onChange();
      });
      row.append(name, input, value);
      panel.append(row);
    }
  }

  const dump = document.createElement('button');
  dump.type = 'button';
  dump.textContent = 'log config';
  dump.addEventListener('click', () => console.log(JSON.stringify(config, null, 2)));
  panel.append(dump);

  // Below the figure, so it never covers the graph.
  container.insertAdjacentElement('afterend', panel);
}
