<script lang="ts">
  import { NODE_IDS, type NodeId } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, positionText, statusOf } from '../lib/status';
  import { viewPoseOf } from '../lib/view-grid';

  let { variant = 'oblique' }: { variant?: 'oblique' | 'front' } = $props();

  // Geometry carried over from the approved wireframe.
  // rad/opacity indexed by visual depth: 0 = front (closest), 2 = back (farthest).
  const cfg = $derived(
    variant === 'oblique'
      ? { w: 850, h: 572, ox: 140, dx: 200, ex: 85, ey: 50, cy: 150, sc: 0.36, rad: [19, 16, 13], off: 0 }
      : { w: 250, h: 286, ox: 65, dx: 60, ex: 0, ey: 0, cy: 56, sc: 0.2, rad: [10, 8, 6], off: 9 }
  );
  const front = $derived(variant === 'front');
  const UNKNOWN_Z = 250;

  const items = $derived(
    NODE_IDS.map((id: NodeId) => {
      const n = app.node(id);
      const s = statusOf(n);
      // Column-based layout: front Mau01/04/07 (depth 0), back Mau03/06/09 (depth 2).
      // Oblique frame: larger Y = front baseline; smaller Y = far/back edge.
      const { col, depth, index } = viewPoseOf(id);
      const x = front ? cfg.ox + col * cfg.dx + (1 - depth) * cfg.off : cfg.ox + col * cfg.dx + depth * cfg.ex;
      const top = front ? cfg.cy : cfg.cy - depth * cfg.ey;
      const r = cfg.rad[depth];
      const z = n.positionMm ?? UNKNOWN_Z;
      const g = app.ghosts[id];
      const showGhost = g !== undefined && (n.positionMm === null || Math.abs(g - n.positionMm) > 4);
      return {
        id, n, s, x, top, r, depth,
        y: top + z * cfg.sc,
        gy: top + Math.max(0, Math.min(1000, g ?? 0)) * cfg.sc,
        showGhost,
        limY: n.limitMaxMm === null ? null : top + n.limitMaxMm * cfg.sc,
        selected: app.sel.includes(id),
        glyph: r < 9 ? '' : s === 'fault' ? '!' : s === 'offline' ? '×' : s === 'unhomed' ? '?' : String(index + 1),
        opacity: (s === 'offline' ? 0.55 : 1) * (front ? [1, 0.8, 0.6][depth] : 1),
        label: `${id}, ${STATUS_LABEL[s]}, ${positionText(n)}`
      };
    })
  );
  const key = (e: KeyboardEvent, id: NodeId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      app.pick(id);
    }
  };
</script>

<svg class="stage" class:live={app.mode === 'live'} viewBox="0 0 {cfg.w} {cfg.h}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="{front ? 'Front' : 'Oblique'} view of the nine modules">
  {#if front}
    <line class="frame" x1="40" y1={cfg.cy} x2="210" y2={cfg.cy} />
  {:else}
    <path class="frame" d="M140 150H540M225 100H625M310 50H710M140 150L310 50M340 150L510 50M540 150L710 50" />
  {/if}
  {#each items as it (it.id)}
    <line class="string" class:dashed={it.s === 'offline'} x1={it.x} y1={it.top} x2={it.x} y2={Math.max(it.top, it.y - it.r)} opacity={front ? it.opacity : 1} />
    {#if !front && it.limY !== null}
      <line class="limit" x1={it.x - 6} y1={it.limY} x2={it.x + 6} y2={it.limY} />
    {/if}
    {#if !front}
      <g class="chip" class:sel={it.selected}>
        <rect x={it.x - 13} y={it.top - 24} width="26" height="17" rx="4" />
        <text x={it.x} y={it.top - 11} text-anchor="middle">{it.id.slice(3)}</text>
      </g>
    {/if}
    {#if it.showGhost}
      <circle class="ghost" cx={it.x} cy={it.gy} r={it.r} />
    {/if}
  {/each}
  {#each items as it (it.id)}
    <g class="sphere {it.s}" class:sel={it.selected} opacity={it.opacity} role="button" tabindex="0" aria-label={it.label} aria-pressed={it.selected} onclick={() => app.pick(it.id)} onkeydown={(e) => key(e, it.id)}>
      <g class="mv" style="transform: translate({it.x}px, {it.y}px)">
        {#if it.selected}<circle class="ring" r={it.r + 5} />{/if}
        <circle class="body" r={it.r} />
        <text y={it.r * 0.32} text-anchor="middle" font-size={Math.round(it.r * 0.9)}>{it.glyph}</text>
      </g>
    </g>
  {/each}
</svg>

<style>
  .stage { display: block; width: 100%; height: 100%; background: var(--gray-green); --ink: var(--purple); --glass: #ffffff; --ring: var(--purple); }
  .stage.live { background: var(--purple); --ink: #ffffff; --glass: rgba(255, 255, 255, 0.25); --ring: var(--pink); }
  .frame { fill: none; stroke: var(--ink); opacity: 0.3; }
  .string { stroke: var(--ink); opacity: 0.45; }
  .string.dashed { stroke-dasharray: 4 4; }
  .limit { stroke: var(--ink); opacity: 0.6; }
  .chip rect { fill: transparent; }
  .chip text { fill: var(--ink); font-family: var(--mono); font-size: 11px; font-weight: 700; }
  .chip.sel rect { fill: var(--pink); }
  .chip.sel text { fill: var(--purple); }
  .ghost { fill: rgba(234, 125, 255, 0.3); stroke: var(--ink); stroke-width: 1.5; stroke-dasharray: 4 3; pointer-events: none; }
  .sphere { cursor: pointer; outline: none; }
  /* Smooths the 5 Hz telemetry steps. It does not predict motion. */
  .mv { transition: transform 0.2s linear; }
  @media (prefers-reduced-motion: reduce) { .mv { transition: none; } }
  .sphere .body { fill: var(--glass); stroke: var(--ink); stroke-width: 1.5; }
  .sphere text { fill: var(--ink); font-family: var(--mono); font-weight: 700; pointer-events: none; }
  .stage:not(.live) .sphere.idle text { fill: var(--purple); }
  .sphere.moving .body { fill: var(--turquoise); }
  .sphere.homing .body { fill: var(--pink); }
  .sphere.moving text, .sphere.homing text { fill: var(--purple); }
  .sphere.fault .body { fill: var(--danger); }
  .sphere.fault text { fill: #ffffff; }
  .sphere.unhomed .body { fill: transparent; stroke-width: 2; stroke-dasharray: 1.5 3; stroke-linecap: round; }
  .sphere.offline .body { fill: transparent; stroke-dasharray: 5 4; }
  .ring { fill: none; stroke: var(--ring); stroke-width: 3; }
  .sphere:focus-visible .body { stroke: #a21caf; stroke-width: 3; }
</style>
